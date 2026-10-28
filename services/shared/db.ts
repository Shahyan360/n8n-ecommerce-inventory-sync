import pg from 'pg';
import { config } from './config.js';
export const pool=new pg.Pool({connectionString:config.DATABASE_URL,max:25,connectionTimeoutMillis:5000,statement_timeout:15000});
pool.on('error',()=>process.stderr.write(JSON.stringify({level:'error',category:'database-connection',message:'Idle connection lost; pool will reconnect'})+'\n'));
export type DB=pg.PoolClient;
export async function transaction<T>(fn:(db:DB)=>Promise<T>):Promise<T>{
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
  catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function audit(db:DB,orderId:string|null,eventId:string|null,action:string,details:unknown={}){
  await db.query('INSERT INTO workflow_audit_logs(order_id,event_id,action,details) VALUES($1,$2,$3,$4)',[orderId,eventId,action,JSON.stringify(details)]);
}
