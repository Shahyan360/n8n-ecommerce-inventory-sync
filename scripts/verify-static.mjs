import fs from 'node:fs';
import assert from 'node:assert/strict';
import YAML from 'yaml';
const files=fs.readdirSync('workflows').filter(f=>f.endsWith('.json'));
const workflows=files.map(f=>JSON.parse(fs.readFileSync(`workflows/${f}`,'utf8')));
const ids=new Set(workflows.map(w=>w.id));
for(const wf of workflows){
  assert(wf.nodes.length>=2);const names=new Set(wf.nodes.map(n=>n.name));
  for(const [source,ports] of Object.entries(wf.connections)){assert(names.has(source));for(const output of ports.main)for(const conn of output)assert(names.has(conn.node));}
  const connected=new Set(Object.entries(wf.connections).flatMap(([src,ports])=>[src,...ports.main.flat().map(x=>x.node)]));
  for(const node of wf.nodes){assert(connected.has(node.name),`Disconnected ${wf.name}: ${node.name}`);assert(node.type.startsWith('n8n-nodes-base.'));if(node.type.endsWith('.executeWorkflow'))assert(ids.has(node.parameters.workflowId.value));}
  assert(!JSON.stringify(wf).includes(process.env.INTERNAL_TOKEN||'no-secret-sentinel'));
}
const compose=YAML.parse(fs.readFileSync('docker-compose.yml','utf8'),{maxAliasCount:100});
for(const service of ['postgres','redis','inventory','gateway','mocks','n8n','n8n-worker','migrate','seed','n8n-import'])assert(compose.services[service]);
for(const s of Object.values(compose.services))for(const port of s.ports||[])assert(port.startsWith('127.0.0.1:'));
console.log(JSON.stringify({workflows:files.length,connections:'valid',compose:'YAML and topology valid; Docker engine validation still required'}));
