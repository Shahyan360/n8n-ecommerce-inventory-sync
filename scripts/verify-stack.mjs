import 'dotenv/config';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const run=args=>execFileSync(process.execPath,args,{stdio:'inherit',windowsHide:true});
run(['scripts/wait-stack.mjs']);run(['--import','tsx','scripts/verify-runtime.ts']);
let ownerAvailable=false;
try{run(['scripts/native-owner.mjs']);ownerAvailable=true;}catch{if(process.env.CI==='true')throw new Error('CI could not initialize its isolated n8n owner');console.log('Core runtime passed. Additional editor/Code checks require your private local owner credentials.');}
if(ownerAvailable){
  const owner=JSON.parse(fs.readFileSync('.runtime/n8n-owner.json','utf8'));
  const response=await fetch(`${process.env.N8N_URL}/rest/workflows/commerceDemo/run`,{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({triggerToStartFrom:{name:'Run Local Demo'}})});
  if(!response.ok)throw new Error(`n8n manual demo HTTP ${response.status}`);
  const {data}=await response.json();if(!data?.executionId)throw new Error('n8n did not start the demo workflow');
  const url=new URL(process.env.DATABASE_URL);url.pathname='/n8n';url.username='n8n_app';url.password=process.env.N8N_DB_PASSWORD;
  const db=new pg.Client({connectionString:url.toString()});await db.connect();let success=false;
  try{for(let i=0;i<90;i++){const row=(await db.query('SELECT status FROM execution_entity WHERE id=$1',[data.executionId])).rows[0];if(row?.status==='success'){success=true;break;}if(['error','crashed','canceled'].includes(row?.status))throw new Error(`Code workflow ended ${row.status}`);await new Promise(r=>setTimeout(r,1000));}}finally{await db.end();}
  if(!success)throw new Error('Code workflow did not complete');
  fs.writeFileSync('.runtime/stack-code.json',JSON.stringify({executionId:data.executionId,success:true}));
  run(['--import','tsx','scripts/verify-n8n-operations.ts']);console.log('Actual n8n Code node, schedules, error handling and retry checks passed');
}
