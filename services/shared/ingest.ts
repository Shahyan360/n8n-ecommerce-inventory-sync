import {createHash,randomUUID} from 'node:crypto';
import {pool} from './db.js';
export async function persistEvent(storeId:string,externalId:string,topic:string,payload:unknown,raw?:Buffer){
  const hash=createHash('sha256').update(raw||JSON.stringify(payload)).digest('hex');
  const eventId=randomUUID();
  const result=await pool.query('INSERT INTO integration_events(id,store_id,external_event_id,topic,correlation_id,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(store_id,external_event_id) DO NOTHING RETURNING id',[eventId,storeId,externalId,topic,eventId,payload,hash]);
  if(result.rowCount)return {eventId,duplicate:false};
  const old=(await pool.query('SELECT id,payload_hash FROM integration_events WHERE store_id=$1 AND external_event_id=$2',[storeId,externalId])).rows[0];
  if(old.payload_hash!==hash)throw new Error('Event identifier reused with a different payload');
  return {eventId:old.id,duplicate:true};
}
