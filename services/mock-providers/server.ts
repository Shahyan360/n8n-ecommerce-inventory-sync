import {randomUUID} from 'node:crypto';
import {config} from '../shared/config.js';
import {makeServer} from '../shared/server.js';
import {pool} from '../shared/db.js';
import {shopifyFixture,wooFixture} from './fixtures.js';
import {sendSample} from '../../scripts/demo.js';
export interface MockState{shippoFailures:number;slackFailures:number;delayMs:number;currency:string;orders:Record<string,any[]>;slack:any[];shipments:any[];metadata:any[];snapshot:any[]|null}
export const mockState:MockState={shippoFailures:0,slackFailures:0,delayMs:0,currency:'USD',orders:{'shop-us':[shopifyFixture()],'woo-us':[wooFixture()],'shop-eu':[]},slack:[],shipments:[],metadata:[],snapshot:null};
export function resetMocks(){Object.assign(mockState,{shippoFailures:0,slackFailures:0,delayMs:0,currency:'USD',orders:{'shop-us':[shopifyFixture()],'woo-us':[wooFixture()],'shop-eu':[]},slack:[],shipments:[],metadata:[],snapshot:null});}
export function mockApp(){
  if(config.MODE!=='MOCK_MODE')throw new Error('Mock provider refuses LIVE_MODE');
  const app=makeServer();app.get('/health',async()=>({ok:true,mode:'MOCK_MODE'}));
  app.post('/shippo/shipments/',async(req,reply)=>{
    if(req.headers.authorization!=='ShippoToken mock-only')return reply.code(401).send({error:'Unauthorized'});
    if(mockState.delayMs)await new Promise(r=>setTimeout(r,mockState.delayMs));
    if(mockState.shippoFailures>0){mockState.shippoFailures--;return reply.code(503).send({error:'Mock carrier unavailable'});}
    const b=req.body as any;
    if(!b.parcels?.length||!b.address_to?.zip)return reply.code(400).send({error:'Invalid shipment'});
    mockState.shipments.push(b);
    return {object_id:randomUUID(),status:'SUCCESS',rates:[{object_id:randomUUID(),amount:(6.5+b.parcels.length*1.25).toFixed(2),currency:mockState.currency,provider:'Mock USPS',servicelevel:{token:'ground',name:'Ground Advantage'},estimated_days:4},{object_id:randomUUID(),amount:'18.50',currency:mockState.currency,provider:'Mock UPS',servicelevel:{token:'priority',name:'Priority'},estimated_days:2},{object_id:randomUUID(),amount:'1.00',currency:'EUR',provider:'Wrong Currency',servicelevel:{token:'ground'},estimated_days:3}]};
  });
  app.post('/slack/api/chat.postMessage',async(req,reply)=>{
    if(req.headers.authorization!=='Bearer mock-only')return reply.code(401).send({ok:false,error:'invalid_auth'});
    if(mockState.slackFailures>0){mockState.slackFailures--;return reply.code(429).header('Retry-After','1').send({ok:false,error:'ratelimited'});}
    const b=req.body as any;if(!mockState.slack.some(m=>m.client_msg_id===b.client_msg_id))mockState.slack.push(b);
    return {ok:true,channel:b.channel,ts:String(Date.now()/1000)};
  });
  app.get<{Params:{id:string}}>('/stores/:id/orders',async req=>mockState.orders[req.params.id]||[]);
  app.get('/inventory/snapshot',async(req,reply)=>{
    if(req.headers.authorization!==`Bearer ${config.INTERNAL_TOKEN}`)return reply.code(401).send({error:'Unauthorized'});
    return {items:mockState.snapshot||(await pool.query('SELECT p.sku,b.warehouse_id AS "warehouseId",b.on_hand AS "onHand",b.incoming,now() AS "asOf" FROM inventory_balances b JOIN products p ON p.id=b.product_id')).rows};
  });
  app.post('/metadata',async req=>{mockState.metadata.push(req.body);return {ok:true};});
  app.post('/admin/configure',async req=>{
    const b=req.body as any;for(const key of ['shippoFailures','slackFailures','delayMs','currency','orders','snapshot'] as const)if(b[key]!==undefined)(mockState as any)[key]=b[key];return {ok:true};
  });
  app.post('/admin/reset',async()=>{resetMocks();return {ok:true};});
  app.post('/admin/demo',async()=>{const suffix=Date.now().toString();return {accepted:[await sendSample('shopify','shop-us',shopifyFixture(`n8n-shop-${suffix}`)),await sendSample('woocommerce','woo-us',wooFixture(`n8n-woo-${suffix}`))]};});
  app.get('/admin/captures',async()=>mockState);return app;
}
if(process.argv[1]?.replaceAll('\\','/').match(/mock-providers\/server\.(ts|js)$/)){const app=mockApp();await app.listen({host:process.env.BIND_HOST||'127.0.0.1',port:3002});process.on('SIGTERM',async()=>{await app.close();await pool.end();});}
