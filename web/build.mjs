import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const webRoot=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(webRoot,'..'),out=path.resolve(webRoot,'dist');
if(path.dirname(out)!==path.resolve(webRoot)||path.basename(out)!=='dist')throw new Error('Unsafe build output path');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const asset of ['index.html','app.mjs','simulator.mjs','styles.css','tokens.css','favicon.svg'])await fs.copyFile(path.join(webRoot,'public',asset),path.join(out,asset));
await fs.mkdir(path.join(out,'workflows'));
const descriptions={
  'shopify-ingestion.json':'Authenticated Shopify delivery references enter the reusable processing pipeline.',
  'woocommerce-ingestion.json':'WooCommerce orders share the same validation and inventory authority.',
  'normalization-validation.json':'Provider payloads become a validated, consistent order structure.',
  'order-processing.json':'Deduplication, lifecycle updates and connected orchestration stages.',
  'inventory-allocation.json':'Calls transactional PostgreSQL allocation across eligible warehouses.',
  'shipping-rates.json':'Retrieves eligible shipping rates without purchasing labels.',
  'reorder-monitoring.json':'Deterministic stock recommendations and deduplicated operations alerts.',
  'cancellation-release.json':'Releases eligible reservations and accounts for provider fulfillment.',
  'reconciliation.json':'Scheduled recovery of missing orders, leases and stock discrepancies.',
  'slack-notifications.json':'Flushes a durable notification outbox with retries and severity.',
  'error-handler.json':'Records workflow failures and routes actionable operational notifications.',
  'local-demo.json':'Sends signed local sample webhooks through the real n8n pipeline.',
  'daily-summary.json':'Builds and sends the daily operational summary.'
};
const workflows=[];
for(const [file,description] of Object.entries(descriptions)){const source=path.join(root,'workflows',file),wf=JSON.parse(await fs.readFile(source,'utf8'));if(!wf.nodes?.length||!wf.connections)throw new Error(`Invalid workflow ${file}`);await fs.copyFile(source,path.join(out,'workflows',file));workflows.push({file,name:wf.name,description});}
const docs=[];for(const [id,title,file] of [['start','Getting started','README.md'],['architecture','Architecture','docs/ARCHITECTURE.md'],['configuration','API configuration','docs/API_CONFIGURATION.md'],['deployment','Deployment','docs/DEPLOYMENT.md'],['production','Production checklist','docs/PRODUCTION_CHECKLIST.md'],['security','Security','SECURITY.md']])docs.push({id,title,file,content:await fs.readFile(path.join(root,file),'utf8')});
const content={mode:'browser-only-simulation',repository:'https://github.com/Shahyan360/n8n-ecommerce-inventory-sync',workflows,docs};
const serialized=JSON.stringify(content);if(/[A-Z]:[\\/](?:Users|projects|LocalDisk)/.test(serialized))throw new Error('Personal workstation path in public documentation');
await fs.writeFile(path.join(out,'content.json'),serialized);
await fs.writeFile(path.join(out,'robots.txt'),'User-agent: *\nAllow: /\n');
console.log(`Built public demo: ${workflows.length} workflows, ${docs.length} documents, no server or credentials`);
