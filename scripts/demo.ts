import {randomUUID} from 'node:crypto';
import {config} from '../services/shared/config.js';
import {sign} from '../services/shared/signatures.js';
import {shopifyFixture,wooFixture} from '../services/mock-providers/fixtures.js';
export async function sendSample(platform:'shopify'|'woocommerce',store:string,payload:any,eventId=randomUUID(),topic?:string){
  if(config.MODE!=='MOCK_MODE')throw new Error('Demo disabled in LIVE_MODE');
  const raw=Buffer.from(JSON.stringify(payload));const shop=platform==='shopify';
  const headers:Record<string,string>={'content-type':'application/json'};
  if(shop)Object.assign(headers,{'x-shopify-hmac-sha256':sign(raw,config.MOCK_WEBHOOK_SECRET),'x-shopify-shop-domain':store==='shop-eu'?'eu.myshopify.com':'demo.myshopify.com','x-shopify-topic':topic||'orders/create','x-shopify-event-id':eventId});
  else Object.assign(headers,{'x-wc-webhook-signature':sign(raw,config.MOCK_WEBHOOK_SECRET),'x-wc-webhook-source':'https://woo.example.test/','x-wc-webhook-topic':topic||'order.created','x-wc-webhook-delivery-id':eventId});
  const r=await fetch(`${config.GATEWAY_URL}/webhooks/${platform}/${store}`,{method:'POST',headers,body:raw});
  if(!r.ok)throw new Error(`Gateway ${r.status}`);return r.json() as Promise<{eventId:string;duplicate:boolean}>;
}
if(process.argv[1]?.replaceAll('\\','/').match(/scripts\/demo\.(ts|js)$/)){
  const suffix=Date.now().toString();
  const results=[await sendSample('shopify','shop-us',shopifyFixture(`demo-shop-${suffix}`)),await sendSample('woocommerce','woo-us',wooFixture(`demo-woo-${suffix}`))];
  console.log(JSON.stringify({accepted:results,report:`${config.INVENTORY_URL}/internal/report`},null,2));
}
