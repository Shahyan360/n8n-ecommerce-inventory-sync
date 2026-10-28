import {z} from 'zod';
import {type Platform} from './config.js';
const money=z.coerce.string().regex(/^\d+(\.\d{1,6})?$/);
const id=z.union([z.string().min(1),z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const date=z.string().datetime({offset:true});
export const orderSchema=z.object({
  platform:z.enum(['shopify','woocommerce']),storeId:z.string().min(1),externalId:id,eventId:z.string().uuid(),eventTimestamp:date,
  currency:z.string().regex(/^[A-Z]{3}$/),total:money,discount:money,tax:money,shipping:money,
  payment:z.enum(['paid','pending','refunded','failed']),fulfillment:z.enum(['unfulfilled','partial','fulfilled']),cancelled:z.boolean(),
  createdAt:date,updatedAt:date,customer:z.object({id:z.string().optional(),email:z.string().optional(),name:z.string().optional()}),
  destination:z.object({name:z.string(),street1:z.string(),street2:z.string().optional(),city:z.string(),state:z.string(),zip:z.string(),country:z.string()}),
  items:z.array(z.object({lineId:id,sku:z.string().nullable(),productId:z.string().nullable(),variant:z.string().nullable(),quantity:z.coerce.number().int().positive().max(100000),price:money,weightKg:z.number().positive().nullable(),stocked:z.boolean(),raw:z.unknown()})).min(1).max(500)
}).superRefine((o,ctx)=>{for(const i of o.items)if(i.stocked&&!i.sku)ctx.addIssue({code:'custom',message:'Stock product missing SKU',path:['items',i.lineId]});if(new Set(o.items.map(i=>i.lineId)).size!==o.items.length)ctx.addIssue({code:'custom',message:'Duplicate line identifiers'});});
export type NormalizedOrder=z.infer<typeof orderSchema>;
const text=(v:any)=>v===undefined||v===null?'':String(v);
const utc=(v:any)=>typeof v==='string'&&v&&!/[zZ]|[+-]\d\d:\d\d$/.test(v)?`${v}Z`:v;
export function normalize(platform:Platform,storeId:string,eventId:string,topic:string,p:any):NormalizedOrder{
  const shop=platform==='shopify';
  const address=shop?p.shipping_address||{}:p.shipping||{};
  const status=text(p.status);
  const terminalCancellation=!!p.cancelled_at||status==='cancelled';
  return orderSchema.parse({platform,storeId,externalId:p.id,eventId,eventTimestamp:shop?p.updated_at:utc(p.date_modified_gmt),
    currency:p.currency,total:shop?p.total_price:p.total,discount:(shop?p.total_discounts:p.discount_total)||'0',tax:(shop?p.total_tax:p.total_tax)||'0',shipping:shop?(p.total_shipping_price_set?.shop_money?.amount??(p.shipping_lines||[]).reduce((n:number,l:any)=>n+Number(l.price||0),0).toFixed(6)):p.shipping_total||'0',
    payment:shop?(['paid','partially_refunded'].includes(p.financial_status)?'paid':p.financial_status==='refunded'?'refunded':'pending'):['processing','completed'].includes(status)?'paid':status==='refunded'?'refunded':status==='failed'?'failed':'pending',
    fulfillment:shop?(p.fulfillment_status==='fulfilled'?'fulfilled':p.fulfillment_status==='partial'?'partial':'unfulfilled'):status==='completed'?'fulfilled':'unfulfilled',
    // Provider HMAC covers the body, not topic headers. A replay with a forged
    // cancellation topic must never release an otherwise valid order's stock.
    cancelled:terminalCancellation,
    createdAt:shop?p.created_at:utc(p.date_created_gmt),updatedAt:shop?p.updated_at:utc(p.date_modified_gmt),
    customer:{id:p.customer?.id?text(p.customer.id):p.customer_id?text(p.customer_id):undefined,email:p.email||p.billing?.email||undefined,name:shop?text(p.customer?.first_name):text(p.billing?.first_name)},
    destination:{name:address.name||`${text(address.first_name)} ${text(address.last_name)}`.trim(),street1:text(shop?address.address1:address.address_1),street2:text(shop?address.address2:address.address_2),city:text(address.city),state:text(shop?address.province_code:address.state),zip:text(shop?address.zip:address.postcode),country:text(shop?address.country_code:address.country)},
    items:(p.line_items||[]).filter((l:any)=>!shop||terminalCancellation||p.financial_status==='refunded'||l.current_quantity!==0).map((l:any)=>({lineId:l.id,sku:l.sku?.trim()||null,productId:l.product_id?text(l.product_id):null,variant:l.variant_id||l.variation_id?text(l.variant_id||l.variation_id):null,quantity:shop?(terminalCancellation||p.financial_status==='refunded'?l.quantity:(l.current_quantity??l.quantity)):l.quantity,price:shop?l.price:l.price??(Number(l.total)/Number(l.quantity)).toFixed(6),weightKg:shop&&Number(l.grams)>0?Number(l.grams)/1000:null,stocked:shop?l.requires_shipping!==false:!l.meta_data?.some((m:any)=>m.key==='_virtual'&&m.value===true),raw:l}))
  });
}
export function reorderQuantity(available:number,incoming:number,outstanding:number,point:number,target:number,minimum:number,pack:number){
  const projected=available+incoming+outstanding;
  return projected<=point?Math.ceil(Math.max(minimum,target-projected)/pack)*pack:0;
}
export const transitions:Record<string,string[]>={
  RECEIVED:['VALIDATED','FAILED'],VALIDATED:['AWAITING_PAYMENT','STOCK_RESERVED','PARTIALLY_ALLOCATED','BACKORDERED','CANCELLED','FULFILLED','FAILED'],
  AWAITING_PAYMENT:['VALIDATED','CANCELLED','FAILED'],STOCK_RESERVED:['VALIDATED','SHIPPING_QUOTED','CANCELLED','FULFILLED','BACKORDERED','FAILED'],
  PARTIALLY_ALLOCATED:['VALIDATED','CANCELLED','FULFILLED','BACKORDERED','FAILED'],BACKORDERED:['VALIDATED','CANCELLED','FAILED'],
  SHIPPING_QUOTED:['READY_FOR_FULFILLMENT','VALIDATED','CANCELLED','FULFILLED','BACKORDERED','FAILED'],READY_FOR_FULFILLMENT:['VALIDATED','CANCELLED','FULFILLED','BACKORDERED','FAILED'],
  FAILED:['VALIDATED','BACKORDERED','CANCELLED','FULFILLED'],CANCELLED:[],FULFILLED:[]
};
