import fs from 'node:fs/promises';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../scripts/database.js';
import {pool} from '../services/shared/db.js';
import {persistEvent} from '../services/shared/ingest.js';
import {normalizeEvent,prepare,cancelOrFulfill,allocate,monitorReorder,finish,type Context} from '../services/inventory-service/engine.js';
import {quoteShipping} from '../services/inventory-service/shipping.js';
import {resetMocks} from '../services/mock-providers/server.js';
export async function resetDatabase(){
  const owner=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});await owner.connect();
  try{
    if((await owner.query('SELECT current_database() AS name')).rows[0].name!=='commerce_test')throw new Error('Test database safety check failed: only commerce_test may be reset');
    await owner.query('TRUNCATE notification_outbox,integration_errors,workflow_audit_logs,fulfillment_events,shipping_quotes,reorder_alerts,reorder_rules,inventory_movements,inventory_reservations,inventory_balances,order_items,sku_aliases,products,orders,integration_events,warehouses,stores RESTART IDENTITY CASCADE');
  }finally{await owner.end();}
  await migrate('seed');resetMocks();
}
export async function createContext(payload:any,store='shop-us',topic='orders/create'){
  const {eventId}=await persistEvent(store,randomUUID(),topic,payload);
  return prepare(await normalizeEvent({eventId}));
}
export async function runOrder(payload:any,store='shop-us',topic='orders/create'){
  let ctx=await createContext(payload,store,topic);ctx=await cancelOrFulfill(ctx);ctx=await allocate(ctx);ctx=await quoteShipping(ctx);await monitorReorder(ctx);return finish(ctx);
}
export async function orderState(id:string){return (await pool.query('SELECT state FROM orders WHERE id=$1',[id])).rows[0].state;}
