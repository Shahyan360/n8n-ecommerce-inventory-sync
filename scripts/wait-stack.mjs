import 'dotenv/config';
const targets=[`${process.env.GATEWAY_URL}/health`,`${process.env.INVENTORY_URL}/health`,`${process.env.MOCK_URL}/health`,`${process.env.N8N_URL}/healthz/readiness`];
for(let i=0;i<180;i++){const results=await Promise.all(targets.map(async url=>{try{return (await fetch(url,{signal:AbortSignal.timeout(3000)})).ok;}catch{return false;}}));if(results.every(Boolean)){console.log('Gateway, inventory, mocks and n8n are healthy');process.exit(0);}await new Promise(r=>setTimeout(r,1000));}
throw new Error('Stack did not become healthy; inspect Docker service logs');
