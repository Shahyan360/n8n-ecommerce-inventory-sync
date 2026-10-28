import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config} from '../services/shared/config.js';
import {requestJson,jsonPost,internalHeaders} from '../services/shared/http.js';
import {sendSample} from './demo.js';
import {shopifyFixture,wooFixture} from '../services/mock-providers/fixtures.js';
if(config.MODE!=='MOCK_MODE')throw new Error('Runtime demo requires MOCK_MODE');
const report=async()=>requestJson(`${config.INVENTORY_URL}/internal/report`,{headers:internalHeaders()});
async function waitEvent(eventId:string){
  for(let i=0;i<90;i++){
    const r=await report();const e=r.events.find((e:any)=>e.id===eventId);
    if(['done','ignored','quarantined','dead'].includes(e?.status)){assert(['done','ignored'].includes(e.status),`Event ended ${e.status}`);return r;}
    await new Promise(r=>setTimeout(r,1000));
  }throw new Error(`Timed out waiting for n8n event ${eventId}`);
}
const suffix=Date.now().toString();const shop=shopifyFixture(`runtime-shop-${suffix}`),woo=wooFixture(`runtime-woo-${suffix}`,'TSHIRT-BLUE-L',1);
const externalEvent=randomUUID();const a=await sendSample('shopify','shop-us',shop,externalEvent);const b=await sendSample('woocommerce','woo-us',woo);
let r=await waitEvent(a.eventId);r=await waitEvent(b.eventId);
const orders=r.orders.filter((o:any)=>[shop.id,woo.id].includes(o.external_id));
assert.equal(orders.length,2);for(const o of orders)assert.equal(o.state,'READY_FOR_FULFILLMENT');
const orderIds=orders.map((o:any)=>o.id);assert(r.quotes.filter((q:any)=>orderIds.includes(q.order_id)&&q.selected).length>=2);
assert(r.reservations.some((q:any)=>orderIds.includes(q.order_id)&&q.status==='confirmed'));assert(r.alerts.length>0);
const duplicate=await sendSample('shopify','shop-us',shop,externalEvent);assert(duplicate.duplicate);assert.equal(duplicate.eventId,a.eventId);
const cancelled={...shop,updated_at:'2026-10-28T10:00:00Z',cancelled_at:'2026-10-28T10:00:00Z'};
const c=await sendSample('shopify','shop-us',cancelled,randomUUID(),'orders/cancelled');r=await waitEvent(c.eventId);
const cancelledOrder=r.orders.find((o:any)=>o.external_id===shop.id);assert.equal(cancelledOrder.state,'CANCELLED');
assert(!r.reservations.some((q:any)=>q.order_id===cancelledOrder.id&&['held','confirmed'].includes(q.status)));
await requestJson(`${config.INVENTORY_URL}/internal/notifications`,jsonPost({},internalHeaders()));
const captures=await requestJson(`${config.MOCK_URL}/admin/captures`,{headers:internalHeaders()});assert(captures.slack.length>0);
const evidence={verifiedAt:new Date().toISOString(),path:'Signed HTTP → gateway inbox → n8n provider ingestion → shared sub-workflows → PostgreSQL / mock Shippo / mock Slack',orders:r.orders.filter((o:any)=>orderIds.includes(o.id)),selectedQuotes:r.quotes.filter((q:any)=>orderIds.includes(q.order_id)&&q.selected),reservations:r.reservations.filter((q:any)=>orderIds.includes(q.order_id)),reorderAlerts:r.alerts.length,slackMessages:captures.slack.length,duplicateSuppressed:true,cancellationReleased:true,liveOperations:0};
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/runtime.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
