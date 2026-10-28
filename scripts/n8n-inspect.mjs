import 'dotenv/config';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:55432,database:'n8n',user:'n8n_app',password:process.env.N8N_DB_PASSWORD});await db.connect();
try{
  const rows=(await db.query('SELECT id,name,active,"activeVersionId",nodes FROM workflow_entity ORDER BY id')).rows;
  const expected=fs.readdirSync('workflows').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(`workflows/${f}`,'utf8')));
  for(const w of expected){const r=rows.find(r=>r.id===w.id);assert(r,`Missing ${w.id}`);assert(r.activeVersionId,`Unpublished ${w.id}`);assert.equal(r.nodes.length,w.nodes.length);}
  const creds=(await db.query("SELECT data FROM credentials_entity WHERE id='commerceInternal'")).rows;
  assert.equal(creds.length,1);assert(!creds[0].data.includes(process.env.INTERNAL_TOKEN),'Credential must be encrypted');
  let recognized=false;
  try{
    const account=fs.existsSync('.runtime/n8n-owner.json')?JSON.parse(fs.readFileSync('.runtime/n8n-owner.json','utf8')):null;
    const response=await fetch('http://127.0.0.1:5678/types/nodes.json',{headers:account?{cookie:account.cookie}:{}});
    if(response.ok){const data=await response.json();const types=Array.isArray(data)?data:Object.values(data);const names=new Set(types.map(t=>t.name));for(const w of expected)for(const n of w.nodes)assert(names.has(n.type),`Unknown node ${n.type}`);recognized=true;}
  }catch(e){if(e instanceof assert.AssertionError)throw e;}
  const evidence={imported:expected.length,published:rows.filter(r=>r.activeVersionId).length,encryptedInternalCredential:true,nodeTypesRecognized:recognized,workflows:rows.map(({nodes,...r})=>r)};
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/n8n-import.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await db.end();}
