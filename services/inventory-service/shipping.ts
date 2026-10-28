import {transaction,audit} from '../shared/db.js';
import {config} from '../shared/config.js';
import {requestJson,jsonPost} from '../shared/http.js';
import {type Context,state,lockedOrder} from './engine.js';
import {enqueue} from './notifications.js';
import {type NormalizedOrder} from '../shared/normalization.js';
export function packParcels(items:any[],policy:'per_unit'|'per_sku_stack'=config.PACKING_POLICY){
  // Deterministic packing: catalog-sized individual parcels or a vertical SKU stack.
  const parcels:any[]=[];
  for(const item of items){
    if(![item.weight_kg,item.length_cm,item.width_cm,item.height_cm].every(n=>Number(n)>0))throw new Error('Missing parcel dimensions or weight');
    const units=policy==='per_sku_stack'?item.quantity:1;
    const height=Number(item.height_cm)*units,weight=Number(item.weight_kg)*units;
    if(weight>config.MAX_PARCEL_WEIGHT_KG||Math.max(Number(item.length_cm),Number(item.width_cm),height)>config.MAX_PARCEL_SIDE_CM)throw new Error('Packed parcel exceeds configured physical limits');
    for(let i=0;i<(policy==='per_sku_stack'?1:item.quantity);i++){
      if(parcels.length>=config.MAX_PARCELS)throw new Error('Parcel count exceeds configured policy limit');
      parcels.push({length:String(item.length_cm),width:String(item.width_cm),height:String(height),weight:String(weight),distance_unit:'cm',mass_unit:'kg'});
    }
  }return parcels;
}
export function eligibleRates(rates:any[],currency:string){
  return rates.filter(r=>r.currency===currency&&/^\d+(\.\d+)?$/.test(String(r.amount))&&Number(r.amount)>=0&&Number.isInteger(r.estimated_days)&&r.estimated_days<=config.MAX_TRANSIT_DAYS&&r.estimated_days>=0&&config.ALLOWED_SERVICES.split(',').includes(r.servicelevel?.token)).sort((a,b)=>Number(a.amount)-Number(b.amount)||String(a.object_id).localeCompare(String(b.object_id)));
}
export async function quoteShipping(ctx:Context):Promise<Context>{
  if(ctx.skip||!ctx.orderId)return ctx;
  try{
    return await transaction(async db=>{
      const o=await lockedOrder(db,ctx);if(!o)return {...ctx,skip:true};
      if(o.state!=='STOCK_RESERVED')return {...ctx,state:o.state};
      const n=o.normalized as NormalizedOrder;
      const groups=(await db.query("SELECT DISTINCT r.warehouse_id,w.address FROM inventory_reservations r JOIN warehouses w ON w.id=r.warehouse_id WHERE r.order_id=$1 AND r.revision=$2 AND r.status IN ('held','confirmed') ORDER BY warehouse_id",[o.id,o.revision])).rows;
      if(groups.length&&!['street1','city','state','zip','country'].every(k=>n.destination[k as keyof typeof n.destination]))throw new Error('Missing destination shipping data');
      for(const g of groups){
        if(g.address.country!==n.destination.country)throw new Error('Cross-border shipment requires customs policy/manual review');
        const items=(await db.query("SELECT r.quantity,p.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id WHERE r.order_id=$1 AND r.revision=$2 AND r.warehouse_id=$3 AND r.status IN ('held','confirmed') ORDER BY p.id",[o.id,o.revision,g.warehouse_id])).rows;
        const result=await requestJson(config.MODE==='MOCK_MODE'?`${config.MOCK_URL}/shippo/shipments/`:'https://api.goshippo.com/shipments/',jsonPost({address_from:g.address,address_to:n.destination,parcels:packParcels(items),async:false},{Authorization:`ShippoToken ${config.MODE==='MOCK_MODE'?'mock-only':config.SHIPPO_TOKEN}`,'SHIPPO-API-VERSION':config.SHIPPO_API_VERSION}));
        const eligible=eligibleRates(result.rates||[],n.currency);
        if(!eligible.length)throw new Error('No eligible rates: check currency, service and transit policy');
        for(const r of eligible){
          await db.query('INSERT INTO shipping_quotes(order_id,revision,warehouse_id,rate_id,currency,amount,carrier,service,estimated_days,address_validation,selected,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING',[o.id,o.revision,g.warehouse_id,r.object_id,r.currency,r.amount,r.provider,r.servicelevel.token,r.estimated_days,'not_requested',r.object_id===eligible[0].object_id,{rate:r,shipment_id:result.object_id}]);
        }
      }
      await state(db,o,'SHIPPING_QUOTED',ctx.eventId,{warehouses:groups.length});
      await audit(db,o.id,ctx.eventId,'shipping-rates-only',{labelsPurchased:0});
      return {...ctx,state:o.state};
    });
  }catch(error){
    await transaction(db=>enqueue(db,`shipping:${ctx.orderId}:${ctx.eventId}`,'shipping-rate-failure',ctx.eventId,{orderId:ctx.orderId,reason:error instanceof Error?error.message:'Shipping error'},'critical'));
    throw error;
  }
}
