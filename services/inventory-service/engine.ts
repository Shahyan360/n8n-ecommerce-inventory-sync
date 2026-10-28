import {randomUUID} from 'node:crypto';
import {pool,transaction,audit,type DB} from '../shared/db.js';
import {normalize,reorderQuantity,transitions,type NormalizedOrder} from '../shared/normalization.js';
import {config,stores} from '../shared/config.js';
import {enqueue} from './notifications.js';

export interface Context{eventId:string;orderId?:string;skip?:boolean;state?:string}
async function state(db:DB,o:any,next:string,eventId:string,details:unknown={}){
  if(o.state===next)return;
  if(!transitions[o.state]?.includes(next))throw new Error(`Forbidden lifecycle transition ${o.state} -> ${next}`);
  await db.query('UPDATE orders SET state=$2,updated_at=now() WHERE id=$1',[o.id,next]);
  await db.query('INSERT INTO fulfillment_events(order_id,event_id,state,details) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[o.id,eventId,next,details]);
  await audit(db,o.id,eventId,'state',{from:o.state,to:next,...details as object});o.state=next;
}
export async function normalizeEvent(ctx:Context):Promise<Context>{
  const event=(await pool.query('SELECT e.*,s.platform FROM integration_events e JOIN stores s ON s.id=e.store_id WHERE e.id=$1',[ctx.eventId])).rows[0];
  if(!event)throw new Error('Unknown event');
  if(['done','ignored','dead','quarantined'].includes(event.status))return {...ctx,skip:true};
  try{
    const normalized=normalize(event.platform,event.store_id,event.id,event.topic,event.payload);
    await pool.query('UPDATE integration_events SET normalized=$2,updated_at=now() WHERE id=$1',[event.id,normalized]);
    return ctx;
  }catch(error){
    await transaction(async db=>{
      await db.query("UPDATE integration_events SET status='quarantined',updated_at=now() WHERE id=$1",[event.id]);
      await db.query("INSERT INTO integration_errors(event_id,correlation_id,category,message) VALUES($1,$2,'validation','Order schema validation failed; inspect protected event payload')",[event.id,event.correlation_id]);
      await enqueue(db,`validation:${event.id}`,'order-validation',event.correlation_id,{eventId:event.id},'critical');
    });
    return {...ctx,skip:true};
  }
}
export async function prepare(ctx:Context):Promise<Context>{
  if(ctx.skip)return ctx;
  return transaction(async db=>{
    const event=(await db.query('SELECT * FROM integration_events WHERE id=$1 FOR UPDATE',[ctx.eventId])).rows[0];
    if(['done','ignored','quarantined','dead'].includes(event.status))return {...ctx,skip:true};
    const n=event.normalized as NormalizedOrder;if(!n)throw new Error('Normalize event first');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${n.storeId}:${n.externalId}`]);
    let o=(await db.query('SELECT * FROM orders WHERE store_id=$1 AND external_id=$2 FOR UPDATE',[n.storeId,n.externalId])).rows[0];
    if(o?.current_event_id===ctx.eventId)return {...ctx,orderId:o.id,state:o.state};
    const old=o?.normalized as NormalizedOrder|undefined;
    if(old?.fulfillment==='partial'){
      const quantities=(v:NormalizedOrder)=>JSON.stringify(v.items.map(i=>[i.sku,i.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
      if(n.cancelled||n.fulfillment!=='fulfilled'||quantities(old)!==quantities(n)){
        await db.query("UPDATE integration_events SET status='quarantined' WHERE id=$1",[ctx.eventId]);
        await enqueue(db,`partial-edit:${o.id}`,'partial-fulfillment-inventory-review',ctx.eventId,{orderId:o.id},'critical');
        await audit(db,o.id,ctx.eventId,'partial-fulfillment-edit-quarantined');return {...ctx,orderId:o.id,skip:true};
      }
    }
    const sameTime=o&&new Date(n.updatedAt).getTime()===new Date(o.source_updated_at).getTime();
    const precedence=(v:NormalizedOrder)=>v.cancelled?4:v.fulfillment==='fulfilled'?3:v.payment==='paid'?2:1;
    const sameItems=old&&JSON.stringify(old.items)===JSON.stringify(n.items);
    if(o&&(new Date(n.updatedAt)<new Date(o.source_updated_at)||['CANCELLED','FULFILLED'].includes(o.state)||(sameTime&&precedence(n)<=precedence(old!)))){
      if(sameTime&&!sameItems&&precedence(n)===precedence(old!)){
        await db.query("UPDATE integration_events SET status='quarantined' WHERE id=$1",[ctx.eventId]);
        await enqueue(db,`conflict:${ctx.eventId}`,'ambiguous-order-update',event.correlation_id,{orderId:o.id},'critical');
      }else await db.query("UPDATE integration_events SET status='ignored' WHERE id=$1",[ctx.eventId]);
      await audit(db,o.id,ctx.eventId,'stale-or-terminal-event-ignored');return {...ctx,orderId:o.id,skip:true};
    }
    if(!o){
      o=(await db.query("INSERT INTO orders(id,store_id,external_id,state,currency,total,payment_status,fulfillment_status,source_updated_at,current_event_id,normalized) VALUES($1,$2,$3,'RECEIVED',$4,$5,$6,$7,$8,$9,$10) RETURNING *",[randomUUID(),n.storeId,n.externalId,n.currency,n.total,n.payment,n.fulfillment,n.updatedAt,ctx.eventId,n])).rows[0];
    }else{
      await db.query('UPDATE orders SET normalized=$2,source_updated_at=$3,current_event_id=$4,revision=revision+1,currency=$5,total=$6,payment_status=$7,fulfillment_status=$8,updated_at=now() WHERE id=$1',[o.id,n,n.updatedAt,ctx.eventId,n.currency,n.total,n.payment,n.fulfillment]);o.normalized=n;o.revision++;
      await db.query('DELETE FROM order_items WHERE order_id=$1',[o.id]);
    }
    for(const i of n.items){
      const product=(await db.query('SELECT p.* FROM products p LEFT JOIN sku_aliases a ON a.product_id=p.id AND a.store_id=$2 WHERE p.sku=$1 OR a.alias=$1 ORDER BY (p.sku=$1) DESC LIMIT 1',[i.sku,n.storeId])).rows[0];
      await db.query('INSERT INTO order_items(order_id,line_id,product_id,sku,variant,quantity,price,stocked,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[o.id,i.lineId,product?.id||null,i.sku,i.variant,i.quantity,i.price,product?product.stocked&&i.stocked:i.stocked,i.raw]);
    }
    await state(db,o,'VALIDATED',ctx.eventId);
    return {...ctx,orderId:o.id,state:o.state};
  });
}
async function lockedOrder(db:DB,ctx:Context){
  const o=(await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[ctx.orderId])).rows[0];
  return o?.current_event_id===ctx.eventId?o:null;
}
async function lockBalances(db:DB,orderId:string){
  // Every operation locks product/warehouse pairs in the same global order.
  await db.query(`SELECT b.product_id,b.warehouse_id FROM inventory_balances b WHERE b.product_id IN
    (SELECT product_id FROM order_items WHERE order_id=$1 UNION SELECT product_id FROM inventory_reservations WHERE order_id=$1 AND status IN ('held','confirmed'))
    ORDER BY b.product_id,b.warehouse_id FOR UPDATE`,[orderId]);
}
export async function release(db:DB,o:any,eventId:string,status='released',consume=false){
  await lockBalances(db,o.id);
  const reservations=(await db.query("SELECT * FROM inventory_reservations WHERE order_id=$1 AND status IN ('held','confirmed') ORDER BY product_id,warehouse_id FOR UPDATE",[o.id])).rows;
  for(const r of reservations){
    await db.query('UPDATE inventory_balances SET reserved=reserved-$3,on_hand=on_hand-$4,updated_at=now() WHERE product_id=$1 AND warehouse_id=$2',[r.product_id,r.warehouse_id,r.quantity,consume?r.quantity:0]);
    await db.query('UPDATE inventory_reservations SET status=$2,updated_at=now() WHERE id=$1',[r.id,status]);
    await db.query('INSERT INTO inventory_movements(order_id,reservation_id,product_id,warehouse_id,kind,quantity,event_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[o.id,r.id,r.product_id,r.warehouse_id,consume?'fulfillment':status,-r.quantity,eventId]);
  }
  return reservations.length;
}
export async function cancelOrFulfill(ctx:Context):Promise<Context>{
  if(ctx.skip||!ctx.orderId)return ctx;
  return transaction(async db=>{
    const o=await lockedOrder(db,ctx);if(!o)return {...ctx,skip:true};
    const n=o.normalized as NormalizedOrder;
    if(n.cancelled){await release(db,o,ctx.eventId);await state(db,o,'CANCELLED',ctx.eventId);}
    else if(n.fulfillment==='fulfilled'){
      const consumed=await release(db,o,ctx.eventId,'consumed',true);
      if(!consumed)await enqueue(db,`external-fulfilled:${o.id}`,'external-fulfillment-inventory-review',ctx.eventId,{orderId:o.id},'critical');
      await state(db,o,'FULFILLED',ctx.eventId);
    }else if(n.fulfillment==='partial'){
      await enqueue(db,`partial-fulfillment:${o.id}:${o.revision}`,'partial-fulfillment-manual-review',ctx.eventId,{orderId:o.id},'critical');
      await state(db,o,'FAILED',ctx.eventId);
    }
    return {...ctx,state:o.state};
  });
}
export async function allocate(ctx:Context):Promise<Context>{
  if(ctx.skip||!ctx.orderId)return ctx;
  return transaction(async db=>{
    const o=await lockedOrder(db,ctx);if(!o)return {...ctx,skip:true};
    if(o.state!=='VALIDATED')return {...ctx,state:o.state};
    const n=o.normalized as NormalizedOrder;
    await lockBalances(db,o.id);
    await release(db,o,ctx.eventId);
    if(n.payment!=='paid'){await state(db,o,'AWAITING_PAYMENT',ctx.eventId);return {...ctx,state:o.state};}
    const policy=stores.find(s=>s.id===o.store_id)!;
    const items=(await db.query('SELECT product_id,sum(quantity)::int AS quantity FROM order_items WHERE order_id=$1 AND stocked GROUP BY product_id ORDER BY product_id',[o.id])).rows;
    const plan:{product:string;warehouse:string;quantity:number}[]=[];let shortage=false;
    for(const item of items){
      let remaining=item.quantity;
      if(item.product_id){
        const balances=(await db.query('SELECT b.*,w.priority,w.address,w.source FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=$1 AND $2=ANY(w.countries) ORDER BY CASE WHEN w.address->>\'state\'=$3 THEN 0 ELSE 1 END,w.priority,w.id',[item.product_id,n.destination.country,n.destination.state])).rows;
        if(balances.some(b=>b.source!=='local-postgres'))throw new Error('External inventory authority requires a confirmed reservation adapter');
        for(const b of balances){const qty=Math.min(remaining,Math.max(0,b.on_hand-b.reserved-b.safety_stock));if(qty){plan.push({product:item.product_id,warehouse:b.warehouse_id,quantity:qty});remaining-=qty;}if(!remaining)break;}
      }
      if(remaining)shortage=true;
    }
    if(shortage&&!policy.allowPartial)plan.length=0;
    for(const p of plan){
      await db.query('UPDATE inventory_balances SET reserved=reserved+$3,updated_at=now() WHERE product_id=$1 AND warehouse_id=$2',[p.product,p.warehouse,p.quantity]);
      const reservation=(await db.query("INSERT INTO inventory_reservations(order_id,revision,product_id,warehouse_id,quantity,status,expires_at) VALUES($1,$2,$3,$4,$5,'confirmed',now()+$6*interval '1 minute') RETURNING id",[o.id,o.revision,p.product,p.warehouse,p.quantity,config.RESERVATION_MINUTES])).rows[0];
      await db.query("INSERT INTO inventory_movements(order_id,reservation_id,product_id,warehouse_id,kind,quantity,event_id) VALUES($1,$2,$3,$4,'reserve',$5,$6)",[o.id,reservation.id,p.product,p.warehouse,p.quantity,ctx.eventId]);
    }
    const next=shortage?(plan.length?'PARTIALLY_ALLOCATED':policy.allowBackorder?'BACKORDERED':'FAILED'):'STOCK_RESERVED';
    await state(db,o,next,ctx.eventId,{allocations:plan,shortage});
    if(shortage)await enqueue(db,`shortage:${o.id}:${o.revision}`,'backorder-exception',ctx.eventId,{orderId:o.id,state:next,allocations:plan});
    return {...ctx,state:o.state};
  });
}
export async function monitorReorder(ctx:Context={eventId:randomUUID()}):Promise<Context>{
  await transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(8273182)');
    const rows=(await db.query('SELECT b.*,r.*,p.sku FROM inventory_balances b JOIN reorder_rules r USING(product_id,warehouse_id) JOIN products p ON p.id=b.product_id ORDER BY b.product_id,b.warehouse_id')).rows;
    for(const r of rows){
      const available=r.on_hand-r.reserved-r.safety_stock;
      const qty=reorderQuantity(available,r.incoming,r.outstanding,r.reorder_point,r.target_stock,r.minimum_order,r.pack_multiple);
      if(qty){
        const alert=(await db.query("INSERT INTO reorder_alerts(product_id,warehouse_id,available,threshold,recommended,status) VALUES($1,$2,$3,$4,$5,'open') ON CONFLICT(product_id,warehouse_id) WHERE status IN ('open','ordered') DO UPDATE SET available=EXCLUDED.available,recommended=EXCLUDED.recommended,updated_at=now() RETURNING *",[r.product_id,r.warehouse_id,available,r.reorder_point,qty])).rows[0];
        await enqueue(db,`reorder:${alert.id}`,'low-stock',ctx.eventId,{sku:r.sku,warehouse:r.warehouse_id,available,incoming:r.incoming,outstanding:r.outstanding,threshold:r.reorder_point,recommended:qty,supplier:r.supplier,leadDays:r.lead_days});
      }else await db.query("UPDATE reorder_alerts SET status='resolved',updated_at=now() WHERE product_id=$1 AND warehouse_id=$2 AND status='open'",[r.product_id,r.warehouse_id]);
    }
  });return ctx;
}
export async function finish(ctx:Context):Promise<Context>{
  await transaction(async db=>{
    if(!ctx.skip&&ctx.orderId){const o=await lockedOrder(db,ctx);if(o?.state==='SHIPPING_QUOTED')await state(db,o,'READY_FOR_FULFILLMENT',ctx.eventId);}
    await db.query("UPDATE integration_events SET status='done',leased_until=null,updated_at=now() WHERE id=$1 AND status IN ('pending','processing')",[ctx.eventId]);
  });return ctx;
}
export {state,lockedOrder};
