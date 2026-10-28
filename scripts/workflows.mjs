import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
fs.mkdirSync('workflows',{recursive:true});
const credential={httpHeaderAuth:{id:'commerceInternal',name:'Commerce Internal'}};
const http=(name,path)=>({id:randomUUID(),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[300,0],parameters:{method:'POST',url:`={{ $env.INVENTORY_URL + '/internal/${path}' }}`,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}',options:{timeout:90000}},credentials:credential,retryOnFail:false});
const trigger=()=>({id:randomUUID(),name:'Sub-workflow Input',type:'n8n-nodes-base.executeWorkflowTrigger',typeVersion:1.1,position:[0,0],parameters:{inputSource:'passthrough'}});
const execute=(name,id)=>({id:randomUUID(),name,type:'n8n-nodes-base.executeWorkflow',typeVersion:1.3,position:[0,0],parameters:{source:'database',workflowId:{__rl:true,value:id,mode:'id'},mode:'once',options:{waitForSubWorkflow:true}}});
const schedule=(minutes)=>({id:randomUUID(),name:'Schedule',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,160],parameters:{rule:{interval:[{field:'minutes',minutesInterval:minutes}]}}});
const workflows=[];
function save(file,id,name,nodes){
  const connections={};nodes.forEach((n,i)=>{n.position=[i*260,0];if(i+1<nodes.length)connections[n.name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};});
  const wf={id,name,active:false,nodes,connections,settings:{executionOrder:'v1',executionTimeout:90,errorWorkflow:id==='commerceErrors'?undefined:'commerceErrors',saveDataErrorExecution:'all',saveDataSuccessExecution:'none',saveManualExecutions:false,callerPolicy:'workflowsFromSameOwner'},pinData:{},versionId:randomUUID(),tags:[]};
  if(id==='commerceDemo'){wf.settings.saveManualExecutions=true;wf.settings.saveDataSuccessExecution='all';}
  fs.writeFileSync(`workflows/${file}.json`,JSON.stringify(wf,null,2)+'\n');workflows.push(wf);return wf;
}
save('normalization-validation','commerceNormalize','Shared Order Normalization and Validation',[trigger(),http('Validate Durable Event','normalize')]);
save('inventory-allocation','commerceAllocate','Multi-Warehouse Stock Allocation',[trigger(),http('Atomic Allocation','allocate')]);
save('shipping-rates','commerceShipping','Shipping Rate Calculation',[trigger(),http('Retrieve Rates Only','shipping')]);
save('cancellation-release','commerceCancel','Order Cancellation and Reservation Release',[trigger(),http('Apply Cancellation or Fulfillment','cancel')]);
save('slack-notifications','commerceSlack','Slack Operational Notifications',[trigger(),http('Flush Durable Notifications','notifications')]);
const reorder=save('reorder-monitoring','commerceReorder','Low-Stock and Reorder Monitoring',[trigger(),http('Calculate Recommendations','reorder'),execute('Send Operations Alerts','commerceSlack')]);
// A separate scheduled branch supplies a fresh correlation ID in the service.
const tick=schedule(5),monitor=http('Scheduled Stock Monitor','reorder-monitor'),send=execute('Scheduled Alerts','commerceSlack');tick.position=[0,220];monitor.position=[260,220];send.position=[520,220];
reorder.nodes.push(tick,monitor,send);reorder.connections[tick.name]={main:[[{node:monitor.name,type:'main',index:0}]]};reorder.connections[monitor.name]={main:[[{node:send.name,type:'main',index:0}]]};fs.writeFileSync('workflows/reorder-monitoring.json',JSON.stringify(reorder,null,2)+'\n');
save('order-processing','commerceProcess','Deduplication and Order Processing',[
  trigger(),execute('Normalize and Validate','commerceNormalize'),http('Deduplicate and Persist Order','prepare'),execute('Cancellation and Fulfillment','commerceCancel'),execute('Allocate Inventory','commerceAllocate'),execute('Calculate Shipping','commerceShipping'),execute('Reorder Recommendations','commerceReorder'),http('Complete Durable Event','finish')
]);
for(const [platform,id,name] of [['shopify','commerceShopify','Shopify Order Webhook Ingestion'],['woocommerce','commerceWoo','WooCommerce Order Webhook Ingestion']]){
  const webhook={id:randomUUID(),name:'Authenticated Gateway Delivery',type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],webhookId:`commerce-${platform}`,parameters:{httpMethod:'POST',path:`commerce-${platform}`,authentication:'headerAuth',responseMode:'lastNode',options:{}},credentials:credential};
  const envelope={id:randomUUID(),name:'Read Durable Event Reference',type:'n8n-nodes-base.set',typeVersion:3.4,position:[260,0],parameters:{assignments:{assignments:[{id:randomUUID(),name:'eventId',value:'={{ $json.body.eventId }}',type:'string'}]},options:{}}};
  save(`${platform}-ingestion`,id,name,[webhook,envelope,execute('Shared Order Processing','commerceProcess')]);
}
save('reconciliation','commerceReconcile','Order and Stock Reconciliation',[schedule(5),http('Recover Orders and Check Stock','reconcile'),execute('Notify Discrepancies','commerceSlack')]);
save('daily-summary','commerceSummary','Daily Operational Summary',[{id:randomUUID(),name:'Daily Schedule',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'cronExpression',expression:'0 8 * * *'}]}}},http('Build Summary','summary'),execute('Send Daily Summary','commerceSlack')]);
save('error-handler','commerceErrors','Global Error Handling and Recovery',[{id:randomUUID(),name:'Workflow Error',type:'n8n-nodes-base.errorTrigger',typeVersion:1,position:[0,0],parameters:{}},http('Record Failure and Enqueue Alert','errors'),execute('Notify Operations','commerceSlack')]);
const demoCall={...http('Send Signed Demo Orders','demo'),parameters:{method:'POST',url:'={{ $env.MOCK_URL + "/admin/demo" }}',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'{}',options:{timeout:90000}}};
save('local-demo','commerceDemo','Local End-to-End Demo Trigger',[{id:randomUUID(),name:'Run Local Demo',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},demoCall,{id:randomUUID(),name:'Demo Acceptance Summary',type:'n8n-nodes-base.code',typeVersion:2,position:[520,0],parameters:{jsCode:'return [{json: {accepted: $json.accepted, note: "Signed webhooks accepted; durable dispatch processes them through provider ingestion workflows."}}];'}}]);
console.log(`Generated ${workflows.length} connected workflows`);
