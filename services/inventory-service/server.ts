import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {makeServer} from '../shared/server.js';
import {pool,transaction} from '../shared/db.js';
import {normalizeEvent,prepare,cancelOrFulfill,allocate,monitorReorder,finish} from './engine.js';
import {quoteShipping} from './shipping.js';
import {flushNotifications,enqueue} from './notifications.js';
import {reconcile} from './reconciliation.js';
import {stores} from '../shared/config.js';
import {writeMetadata} from './providers.js';
const context=z.object({eventId:z.string().uuid(),orderId:z.string().uuid().optional(),skip:z.boolean().optional(),state:z.string().optional()});
export function inventoryApp(){
  const app=makeServer();
  app.get('/health',async()=>{await pool.query('SELECT 1');return {ok:true};});
  const steps={normalize:normalizeEvent,prepare,cancel:cancelOrFulfill,allocate,shipping:quoteShipping,reorder:monitorReorder,finish};
  for(const [name,fn] of Object.entries(steps))app.post(`/internal/${name}`,async req=>{
    const result=await fn(context.parse(req.body));
    if(name==='finish'&&result.orderId&&!result.skip){const o=(await pool.query('SELECT store_id,external_id,state FROM orders WHERE id=$1',[result.orderId])).rows[0];if(o)try{await writeMetadata(stores.find(s=>s.id===o.store_id)!,o.external_id,o.state);}catch{await transaction(async db=>{await db.query("INSERT INTO integration_errors(event_id,category,message) VALUES($1,'metadata','Provider metadata update failed; manual retry required')",[result.eventId]);await enqueue(db,`metadata:${result.eventId}`,'metadata-update-failure',result.eventId,{orderId:result.orderId},'critical');});}}
    return result;
  });
  app.post('/internal/notifications',async req=>{await flushNotifications();return req.body||{};});
  app.post('/internal/reorder-monitor',async()=>monitorReorder({eventId:randomUUID()}));
  app.post('/internal/reconcile',async()=>reconcile());
  app.post('/internal/summary',async()=>{
    const counts=(await pool.query('SELECT state,count(*)::int AS count FROM orders GROUP BY state ORDER BY state')).rows;
    await transaction(db=>enqueue(db,`daily:${new Date().toISOString().slice(0,10)}`,'daily-summary',randomUUID(),counts,'info'));return {counts};
  });
  app.post('/internal/errors',async req=>{
    const b=req.body as any;const eventId=z.string().uuid().safeParse(b.eventId);
    await transaction(async db=>{await db.query("INSERT INTO integration_errors(event_id,correlation_id,category,message,details) VALUES($1,$2,'n8n','Workflow execution failed',$3)",[eventId.success?eventId.data:null,b.execution?.id||null,{workflowId:b.workflow?.id,executionId:b.execution?.id}]);await enqueue(db,`n8n:${b.execution?.id||randomUUID()}`,'workflow-failure',b.execution?.id||'unknown',{workflowId:b.workflow?.id},'critical');});return {recorded:true};
  });
  app.get('/internal/report',async()=>{
    const result:Record<string,unknown>={};
    for(const [key,query] of Object.entries({orders:'SELECT id,store_id,external_id,state,currency,revision FROM orders ORDER BY created_at',inventory:'SELECT p.sku,b.* FROM inventory_balances b JOIN products p ON p.id=b.product_id ORDER BY p.sku,b.warehouse_id',reservations:'SELECT * FROM inventory_reservations ORDER BY id',quotes:'SELECT order_id,warehouse_id,currency,amount,selected FROM shipping_quotes ORDER BY id',alerts:'SELECT * FROM reorder_alerts ORDER BY id',events:'SELECT id,status,attempts FROM integration_events ORDER BY created_at',notifications:'SELECT id,category,status,attempts FROM notification_outbox ORDER BY id'}))result[key]=(await pool.query(query)).rows;
    return result;
  });return app;
}
if(process.argv[1]?.replaceAll('\\','/').match(/inventory-service\/server\.(ts|js)$/)){
  const app=inventoryApp();await app.listen({host:process.env.BIND_HOST||'127.0.0.1',port:3001});
  for(const s of stores)await pool.query('INSERT INTO stores(id,platform,domain,allow_partial,allow_backorder) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET domain=EXCLUDED.domain,allow_partial=EXCLUDED.allow_partial,allow_backorder=EXCLUDED.allow_backorder',[s.id,s.platform,s.domain,s.allowPartial,s.allowBackorder]);
  process.on('SIGTERM',async()=>{await app.close();await pool.end();});
}
