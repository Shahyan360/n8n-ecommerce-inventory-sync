// Educational browser model. No operational API calls, credentials or persistence.
export const catalog=[{sku:'TSHIRT-BLUE-M',name:'Essential tee · Blue / M',price:24.99},{sku:'MUG-WHITE',name:'Everyday mug · White',price:14.99},{sku:'LAST-UNIT',name:'Limited edition · Last unit',price:19.00}];
export class Simulation{
  constructor(){this.reset();}
  reset(){
    this.balances=catalog.flatMap(p=>['east','west'].map(warehouse=>({sku:p.sku,warehouse,onHand:p.sku==='LAST-UNIT'?(warehouse==='east'?1:0):p.sku==='MUG-WHITE'?3:warehouse==='east'?8:12,reserved:0,safety:p.sku==='LAST-UNIT'?0:1,incoming:p.sku==='MUG-WHITE'?2:0})));
    this.orders=[];this.deliveries=new Map();this.notifications=[];this.reorderAlerts=new Map();this.journal=[];this.sequence=1000;this.deliverySequence=0;this.queue=Promise.resolve();
  }
  available(b){return Math.max(0,b.onHand-b.reserved-b.safety);}
  nextDelivery(){return `demo-event-${++this.deliverySequence}`;}
  enqueue(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
  process(input){return this.enqueue(()=>this.processAtomic(input));}
  processAtomic(input){
    const {platform='shopify',sku='TSHIRT-BLUE-M',quantity=2,destination='CA',paid=true,shippingFailure=false}=input;
    if(!['shopify','woocommerce'].includes(platform)||!catalog.some(p=>p.sku===sku)||!Number.isInteger(quantity)||quantity<1||quantity>100||!['CA','NY'].includes(destination))throw new Error('Choose a valid platform, item, destination and quantity from 1 to 100.');
    const deliveryId=input.deliveryId||this.nextDelivery();
    const fingerprint=JSON.stringify({platform,sku,quantity,destination,paid,shippingFailure});
    const existing=this.deliveries.get(deliveryId);
    if(existing){if(existing.fingerprint!==fingerprint)throw new Error('A delivery ID cannot be reused with a different order.');this.journal.unshift({type:'duplicate',text:`Duplicate ${deliveryId} ignored`,orderId:existing.order.id});return {...existing.order,duplicate:true};}
    const product=catalog.find(p=>p.sku===sku);
    const order={id:`DEMO-${++this.sequence}`,deliveryId,platform,sku,quantity,destination,paid,total:Math.round(product.price*quantity*100)/100,currency:'USD',state:'VALIDATED',allocations:[],quotes:[],trace:['RECEIVED','VALIDATED'],input:{platform,sku,quantity,destination,paid,shippingFailure,deliveryId}};
    if(!paid){order.state='AWAITING_PAYMENT';order.trace.push(order.state);}
    else{
      const balances=this.balances.filter(b=>b.sku===sku).sort((a,b)=>a.warehouse===(destination==='CA'?'west':'east')?-1:b.warehouse===(destination==='CA'?'west':'east')?1:0);
      let remaining=quantity;
      for(const b of balances){const n=Math.min(remaining,this.available(b));if(n){order.allocations.push({warehouse:b.warehouse,quantity:n});remaining-=n;}if(!remaining)break;}
      if(remaining&&platform==='shopify')order.allocations=[];
      for(const a of order.allocations)this.balances.find(b=>b.sku===sku&&b.warehouse===a.warehouse).reserved+=a.quantity;
      order.state=remaining?(order.allocations.length?'PARTIALLY_ALLOCATED':'BACKORDERED'):'STOCK_RESERVED';order.trace.push(order.state);
      if(remaining)this.notify('warning','Stock shortage',`${order.id} needs ${remaining} more unit${remaining===1?'':'s'}; operations review required.`,deliveryId);
      if(!remaining){
        if(shippingFailure)this.notify('critical','Shipping rate unavailable',`${order.id}: stock stays reserved for a safe retry.`,deliveryId);
        else this.applyQuotes(order);
      }
    }
    this.orders.unshift(order);this.deliveries.set(deliveryId,{fingerprint,order});this.monitor();this.journal.unshift({type:'order',text:`${order.id} · ${order.state.replaceAll('_',' ')}`,orderId:order.id});this.assertBalances();return order;
  }
  applyQuotes(order){order.quotes=order.allocations.map(a=>{const ground=6.5+a.quantity*1.25;return {warehouse:a.warehouse,amount:Math.min(ground,18.5),currency:'USD',service:ground<=18.5?'Mock Ground':'Mock Priority',days:ground<=18.5?4:2};});order.state='READY_FOR_FULFILLMENT';order.trace.push('SHIPPING_QUOTED','READY_FOR_FULFILLMENT');}
  retryShipping(id){return this.enqueue(()=>{const o=this.orders.find(o=>o.id===id);if(!o||o.state!=='STOCK_RESERVED')throw new Error('This order does not need a shipping retry.');this.applyQuotes(o);this.journal.unshift({type:'recovery',text:`${id} · shipping recovered; reservation reused`,orderId:id});return o;});}
  cancel(id){return this.enqueue(()=>{const o=this.orders.find(o=>o.id===id);if(!o)throw new Error('Order not found.');if(o.state==='CANCELLED')return o;for(const a of o.allocations)this.balances.find(b=>b.sku===o.sku&&b.warehouse===a.warehouse).reserved-=a.quantity;o.allocations=[];o.state='CANCELLED';o.trace.push('CANCELLED');this.journal.unshift({type:'cancel',text:`${id} · reservation released`,orderId:id});this.monitor();this.assertBalances();return o;});}
  replay(id){const o=this.orders.find(o=>o.id===id);if(!o)return Promise.reject(new Error('Run an order first.'));return this.process(o.input);}
  race(){return Promise.all(['shopify','woocommerce'].map(platform=>this.process({platform,sku:'LAST-UNIT',quantity:1,destination:'NY'})));}
  notify(severity,title,text,correlation){this.notifications.unshift({severity,title,text,correlation});}
  monitor(){for(const b of this.balances){const key=`${b.sku}:${b.warehouse}`,available=this.available(b),projected=available+b.incoming;if(projected<=5){const recommendation=Math.ceil(Math.max(6,25-projected)/6)*6;if(!this.reorderAlerts.has(key))this.notify('warning','Reorder recommendation',`${b.sku} · ${b.warehouse}: recommend ${recommendation} units.`,key);this.reorderAlerts.set(key,{...b,available,recommendation,threshold:5});}else this.reorderAlerts.delete(key);}}
  assertBalances(){if(this.balances.some(b=>b.reserved<0||b.reserved>b.onHand))throw new Error('Inventory constraint violated.');}
  summary(){return {orders:this.orders.length,ready:this.orders.filter(o=>o.state==='READY_FOR_FULFILLMENT').length,reserved:this.balances.reduce((n,b)=>n+b.reserved,0),alerts:this.reorderAlerts.size,available:this.balances.reduce((n,b)=>n+this.available(b),0)};}
}
