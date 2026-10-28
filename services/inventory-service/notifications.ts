import {pool,transaction,type DB} from '../shared/db.js';
import {config} from '../shared/config.js';
import {requestJson,jsonPost,ApiError} from '../shared/http.js';
export async function enqueue(db:DB,key:string,category:string,correlation:string,body:unknown,severity='warning'){
  // Persist only operational identifiers, never the source customer/order payload.
  const payload={channel:config.SLACK_CHANNEL,text:`${severity.toUpperCase()}: ${category}`,blocks:[{type:'header',text:{type:'plain_text',text:`${severity.toUpperCase()}: ${category}`}},{type:'section',text:{type:'plain_text',text:JSON.stringify(body).slice(0,2500)}},{type:'context',elements:[{type:'plain_text',text:`Correlation: ${correlation}`}]}]};
  await db.query('INSERT INTO notification_outbox(dedupe_key,severity,correlation_id,category,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING',[key,severity,correlation,category,payload]);
}
export async function flushNotifications(){
  const rows=await transaction(async db=>(await db.query("WITH picked AS (SELECT id FROM notification_outbox WHERE (status='pending' OR (status='sending' AND leased_until<now())) AND next_attempt_at<=now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED) UPDATE notification_outbox o SET status='sending',leased_until=now()+interval '2 minutes',attempts=attempts+1 FROM picked WHERE o.id=picked.id RETURNING o.*")).rows);
  for(const n of rows){
    try{
      await requestJson(config.MODE==='MOCK_MODE'?`${config.MOCK_URL}/slack/api/chat.postMessage`:'https://slack.com/api/chat.postMessage',jsonPost({...n.payload,client_msg_id:`00000000-0000-4000-8000-${String(n.id).padStart(12,'0')}`},{Authorization:`Bearer ${config.MODE==='MOCK_MODE'?'mock-only':config.SLACK_TOKEN}`}),1);
      await pool.query("UPDATE notification_outbox SET status='sent',sent_at=now(),leased_until=null WHERE id=$1",[n.id]);
    }catch(error){
      const delay=Math.max(error instanceof ApiError?error.retryAfter:0,Math.max(1,Math.ceil(config.RETRY_BASE_MS/1000))*2**Math.min(n.attempts,10)+Math.random());
      await pool.query("UPDATE notification_outbox SET status=$2,next_attempt_at=now()+$3*interval '1 second',leased_until=null WHERE id=$1",[n.id,n.attempts>=10?'dead':'pending',delay]);
    }
  }
  return {sent:rows.length};
}
