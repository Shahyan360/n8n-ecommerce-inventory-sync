import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction,audit} from '../shared/db.js';
import {config,stores} from '../shared/config.js';
import {persistEvent} from '../shared/ingest.js';
import {requestJson} from '../shared/http.js';
import {fetchOrders} from './providers.js';
import {enqueue} from './notifications.js';
import {release,state} from './engine.js';
export const snapshotSchema=z.object({items:z.array(z.object({sku:z.string(),warehouseId:z.string(),onHand:z.number().int().nonnegative(),incoming:z.number().int().nonnegative(),asOf:z.string().datetime()}))});
export async function reconcile(){
  const correlation=randomUUID();let recovered=0,expired=0,mismatches=0;
  for(const store of stores){
    try{
      const row=(await pool.query('SELECT reconciled_at FROM stores WHERE id=$1',[store.id])).rows[0];
      const start=new Date();const since=new Date((row?.reconciled_at?new Date(row.reconciled_at).getTime():Date.now()-60*86400000)-300000).toISOString();
      const orders=await fetchOrders(store,since);
      for(const payload of orders){
        const version=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const result=await persistEvent(store.id,`reconcile:${payload.id}:${version}`,store.platform==='shopify'?'orders/updated':'order.updated',payload);
        if(!result.duplicate)recovered++;
      }
      await pool.query('UPDATE stores SET reconciled_at=$2 WHERE id=$1',[store.id,start]);
    }catch(error){await transaction(db=>enqueue(db,`reconcile-fetch:${store.id}:${new Date().toISOString().slice(0,13)}`,'reconciliation-provider-failure',correlation,{storeId:store.id},'critical'));}
  }
  // Lock orders before balances to match cancellation/allocation lock order.
  const expiring=(await pool.query("SELECT DISTINCT order_id FROM inventory_reservations WHERE status IN ('held','confirmed') AND expires_at<=now() ORDER BY order_id")).rows;
  for(const r of expiring)await transaction(async db=>{
    const o=(await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[r.order_id])).rows[0];
    const still=(await db.query("SELECT 1 FROM inventory_reservations WHERE order_id=$1 AND status IN ('held','confirmed') AND expires_at<=now()",[o.id])).rowCount;
    if(!still)return;
    // Unknown already-shipped units must never return to available stock.
    if(o.normalized.fulfillment==='partial'){
      await enqueue(db,`partial-expiry:${o.id}`,'partial-fulfillment-reservation-review',correlation,{orderId:o.id},'critical');return;
    }
    expired+=await release(db,o,o.current_event_id,'expired');
    if(!['CANCELLED','FULFILLED'].includes(o.state))await state(db,o,'BACKORDERED',o.current_event_id,{reason:'reservation-expired'});
    await enqueue(db,`expiry:${o.id}:${o.revision}`,'reservation-expired',correlation,{orderId:o.id});
  });
  try{
    const source=config.MODE==='MOCK_MODE'?`${config.MOCK_URL}/inventory/snapshot`:config.INVENTORY_SNAPSHOT_URL;
    const snapshot=snapshotSchema.parse(await requestJson(source,{headers:{Authorization:`Bearer ${config.MODE==='MOCK_MODE'?config.INTERNAL_TOKEN:config.INVENTORY_SNAPSHOT_TOKEN}`}}));
    for(const item of snapshot.items)await transaction(async db=>{
      const b=(await db.query('SELECT b.* FROM inventory_balances b JOIN products p ON p.id=b.product_id WHERE p.sku=$1 AND b.warehouse_id=$2 FOR UPDATE OF b',[item.sku,item.warehouseId])).rows[0];
      if(!b){mismatches++;await enqueue(db,`missing-snapshot:${item.sku}:${item.warehouseId}`,'inventory-snapshot-missing-mapping',correlation,{sku:item.sku,warehouseId:item.warehouseId});return;}
      if(new Date(item.asOf)<=new Date(b.snapshot_at))return;
      if(item.onHand!==b.on_hand||item.incoming!==b.incoming){
        mismatches++;
        // Local PostgreSQL owns mock inventory. A stale external count must never undo fulfillment.
        if(config.MODE==='MOCK_MODE'||item.onHand<b.reserved+b.safety_stock){await enqueue(db,`mismatch:${b.product_id}:${b.warehouse_id}`,'inventory-mismatch-manual-review',correlation,{sku:item.sku,warehouse:item.warehouseId,local:b.on_hand,source:item.onHand,reserved:b.reserved},'critical');}
        else{
          await db.query('UPDATE inventory_balances SET on_hand=$3,incoming=$4,snapshot_at=$5,updated_at=now() WHERE product_id=$1 AND warehouse_id=$2',[b.product_id,b.warehouse_id,item.onHand,item.incoming,item.asOf]);
          await db.query("INSERT INTO inventory_movements(product_id,warehouse_id,kind,quantity) VALUES($1,$2,'snapshot',$3)",[b.product_id,b.warehouse_id,item.onHand-b.on_hand]);
        }
      }
      // Record every accepted source observation, including unchanged counts.
      // Otherwise an older, delayed snapshot could overwrite a newer observation.
      await db.query('UPDATE inventory_balances SET snapshot_at=$3 WHERE product_id=$1 AND warehouse_id=$2',[b.product_id,b.warehouse_id,item.asOf]);
    });
  }catch(error){await transaction(db=>enqueue(db,`snapshot:${new Date().toISOString().slice(0,13)}`,'snapshot-connector-failure',correlation,{},'critical'));}
  const reset=await pool.query("UPDATE integration_events SET status='pending',leased_until=null,next_attempt_at=now() WHERE status='processing' AND leased_until<now()");
  const stuck=(await pool.query("SELECT id FROM orders WHERE state IN ('VALIDATED','STOCK_RESERVED','SHIPPING_QUOTED') AND updated_at<now()-interval '15 minutes'")).rows;
  await transaction(async db=>{
    for(const o of stuck)await enqueue(db,`stuck:${o.id}`,'stuck-order',correlation,{orderId:o.id},'critical');
    await audit(db,null,null,'reconciliation',{correlation,recovered,expired,mismatches,reset:reset.rowCount,stuck:stuck.length});
  });
  return {recovered,expired,mismatches,reset:reset.rowCount,stuck:stuck.length};
}
