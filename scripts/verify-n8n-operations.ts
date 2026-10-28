import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool} from '../services/shared/db.js';
import {config} from '../services/shared/config.js';
import {requestJson,jsonPost,internalHeaders} from '../services/shared/http.js';
import {sendSample} from './demo.js';
import {shopifyFixture} from '../services/mock-providers/fixtures.js';
if(config.MODE!=='MOCK_MODE')throw new Error('Recovery drill requires mock mode');
const owner=JSON.parse(await fs.readFile('.runtime/n8n-owner.json','utf8'));
async function until(test:()=>Promise<boolean>,label:string){for(let i=0;i<90;i++){if(await test())return;await new Promise(r=>setTimeout(r,1000));}throw new Error(`Timeout: ${label}`);}
async function manual(id:string,name:string){
  const r=await requestJson(`${config.N8N_URL}/rest/workflows/${id}/run`,jsonPost({triggerToStartFrom:{name}},{cookie:owner.cookie}));
  assert(r.data?.executionId,JSON.stringify(r));return r.data.executionId;
}
try{
  const beforeReconcile=(await pool.query("SELECT count(*)::int AS n FROM workflow_audit_logs WHERE action='reconciliation'")).rows[0].n;
  const reconciliationExecution=await manual('commerceReconcile','Schedule');
  await until(async()=>(await pool.query("SELECT count(*)::int AS n FROM workflow_audit_logs WHERE action='reconciliation'")).rows[0].n>beforeReconcile,'reconciliation workflow');
  const summaryExecution=await manual('commerceSummary','Daily Schedule');
  await until(async()=>(await pool.query("SELECT 1 FROM notification_outbox WHERE category='daily-summary' AND status='sent'")).rowCount!>0,'daily summary workflow');
  const beforeErrors=(await pool.query("SELECT count(*)::int AS n FROM integration_errors WHERE category='n8n'")).rows[0].n;
  await requestJson(`${config.MOCK_URL}/admin/configure`,jsonPost({shippoFailures:3},internalHeaders()));
  const payload=shopifyFixture(`recovery-${Date.now()}`,'LAST-UNIT',1);
  const event=await sendSample('shopify','shop-us',payload);
  await until(async()=>{
    const e=(await pool.query('SELECT status FROM integration_events WHERE id=$1',[event.eventId])).rows[0];
    assert(!['dead','quarantined'].includes(e.status),`Recovery event ended ${e.status}`);return e.status==='done';
  },'transient shipping failure recovery');
  const errorRows=(await pool.query("SELECT count(*)::int AS n FROM integration_errors WHERE category='n8n'")).rows[0].n;
  assert(errorRows>beforeErrors,'Global n8n Error Trigger must record the injected failure');
  const attempts=(await pool.query('SELECT attempts FROM integration_events WHERE id=$1',[event.eventId])).rows[0].attempts;
  assert(attempts>=2,'Dispatcher must retry the failed workflow');
  const cancellation=await sendSample('shopify','shop-us',{...payload,cancelled_at:'2026-10-28T11:00:00Z',updated_at:'2026-10-28T11:00:00Z'},randomUUID(),'orders/cancelled');
  await until(async()=>(await pool.query('SELECT status FROM integration_events WHERE id=$1',[cancellation.eventId])).rows[0].status==='done','recovery cancellation');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM inventory_balances WHERE reserved<0 OR reserved>on_hand')).rows[0].n,0);
  const codeRecord=await fs.readFile('.runtime/stack-code.json','utf8').then(JSON.parse).catch(()=>null);
  const cliCode=await fs.readFile('.runtime/execute-commerceDemo.log','utf8').catch(()=>'');
  const result={verifiedAt:new Date().toISOString(),manualReconciliation:{executionId:reconciliationExecution,passed:true},dailySummary:{executionId:summaryExecution,passed:true},globalErrorTrigger:{recordedFailures:errorRows-beforeErrors,passed:true},durableWorkflowRetry:{eventId:event.eventId,attempts,passed:true},recoveryOrderCancelled:true,inventoryConstraintsPreserved:true,localDemoCodeNode:codeRecord?.success===true||cliCode.includes('Execution was successful:'),liveOperations:0};
  await fs.writeFile('reports/n8n-operations.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await pool.end();}
