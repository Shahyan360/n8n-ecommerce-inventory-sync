import {z} from 'zod';
import {makeServer} from '../shared/server.js';
import {config,stores} from '../shared/config.js';
import {verifySignature} from '../shared/signatures.js';
import {persistEvent} from '../shared/ingest.js';
import {pool,transaction} from '../shared/db.js';
import {requestJson,jsonPost,internalHeaders} from '../shared/http.js';
import {enqueue} from '../inventory-service/notifications.js';
export function gatewayApp(){
  const app=makeServer();
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  app.get('/health',async()=>{await pool.query('SELECT 1');return {ok:true,mode:config.MODE};});
  app.post<{Params:{platform:string;storeId:string}}>('/webhooks/:platform/:storeId',async(req,reply)=>{
    const {platform,storeId}=req.params;
    const store=stores.find(s=>s.id===storeId&&s.platform===platform);
    if(!store)return reply.code(404).send({error:'Unknown store'});
    const shop=platform==='shopify';const raw=req.body as Buffer;
    if(!Buffer.isBuffer(raw))return reply.code(415).send({error:'JSON body required'});
    if(!verifySignature(raw,store.secret,req.headers[shop?'x-shopify-hmac-sha256':'x-wc-webhook-signature']))return reply.code(401).send({error:'Invalid signature'});
    if(shop&&req.headers['x-shopify-shop-domain']!==store.domain)return reply.code(401).send({error:'Store domain mismatch'});
    if(!shop){const source=req.headers['x-wc-webhook-source'];if(typeof source!=='string'||source.replace(/\/$/,'')!==store.domain.replace(/\/$/,''))return reply.code(401).send({error:'Store source mismatch'});}
    const topic=req.headers[shop?'x-shopify-topic':'x-wc-webhook-topic'];
    const allowed=shop?['orders/create','orders/paid','orders/updated','orders/cancelled']:['order.created','order.updated','order.deleted'];
    if(typeof topic!=='string'||!allowed.includes(topic))return reply.code(400).send({error:'Unsupported topic'});
    const externalId=req.headers[shop?'x-shopify-event-id':'x-wc-webhook-delivery-id']||req.headers['x-shopify-webhook-id'];
    if(typeof externalId!=='string'||externalId.length>200)return reply.code(400).send({error:'Event ID required'});
    let payload:unknown;try{payload=JSON.parse(raw.toString('utf8'));}catch{return reply.code(400).send({error:'Invalid JSON'});}
    const result=await persistEvent(storeId,externalId,topic,payload,raw);
    req.log.info({correlationId:result.eventId,storeId,duplicate:result.duplicate},'Webhook durably accepted');
    return reply.code(202).send(result);
  });
  app.post('/internal/retry',async(req,reply)=>{
    const body=Buffer.isBuffer(req.body)?JSON.parse(req.body.toString()):req.body;
    const {eventId}=z.object({eventId:z.string().uuid()}).parse(body);
    const result=await pool.query("UPDATE integration_events SET status='pending',attempts=0,next_attempt_at=now(),leased_until=null WHERE id=$1 AND status='dead' RETURNING id",[eventId]);
    return reply.send({retried:result.rowCount});
  });return app;
}
export async function dispatchOnce(){
  const events=await transaction(async db=>(await db.query("WITH picked AS(SELECT id FROM integration_events WHERE (status='pending' OR (status='processing' AND leased_until<now())) AND next_attempt_at<=now() ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) UPDATE integration_events e SET status='processing',attempts=attempts+1,leased_until=now()+interval '2 minutes',updated_at=now() FROM picked WHERE e.id=picked.id RETURNING e.*")).rows);
  await Promise.all(events.map(async e=>{
    try{
      const store=stores.find(s=>s.id===e.store_id)!;
      // Wait for the workflow result, not merely the n8n webhook acknowledgement.
      const r=await fetch(`${config.N8N_URL}/webhook/commerce-${store.platform}`,{...jsonPost({eventId:e.id},internalHeaders()),signal:AbortSignal.timeout(100000)});
      if(!r.ok)throw new Error(`n8n HTTP ${r.status}`);
      const persisted=(await pool.query('SELECT status FROM integration_events WHERE id=$1',[e.id])).rows[0];
      if(!['done','ignored','quarantined'].includes(persisted.status))throw new Error('Workflow did not reach durable completion');
    }catch(error){
      await transaction(async db=>{
        const terminal=e.attempts>=10;
        await db.query("UPDATE integration_events SET status=$2,next_attempt_at=now()+$3*interval '1 second',leased_until=null,updated_at=now() WHERE id=$1 AND status='processing'",[e.id,terminal?'dead':'pending',Math.min(3600,2**e.attempts+Math.random()*2)]);
        await db.query("INSERT INTO integration_errors(event_id,correlation_id,category,message) VALUES($1,$2,'dispatch','n8n execution or connectivity failed')",[e.id,e.correlation_id]);
        await enqueue(db,`dispatch:${e.id}`,'order-processing-failure',e.correlation_id,{eventId:e.id,attempts:e.attempts,dead:terminal},'critical');
      });
    }
  }));return events.length;
}
if(process.argv[1]?.replaceAll('\\','/').match(/webhook-gateway\/server\.(ts|js)$/)){
  const app=gatewayApp();await app.listen({host:process.env.BIND_HOST||'127.0.0.1',port:3100});let busy=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await dispatchOnce();}catch{app.log.error('Dispatcher unavailable; durable events remain queued');}finally{busy=false;}},1000);
  process.on('SIGTERM',async()=>{clearInterval(timer);await app.close();await pool.end();});
}
