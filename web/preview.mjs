import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./dist/',import.meta.url)),root=path.resolve(directory),config=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  for(const h of config.headers[0].headers)res.setHeader(h.key,h.value);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}const data=await fs.readFile(target);res.setHeader('content-type',mime[path.extname(target)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.DEMO_PORT||4178),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM',()=>server.close());
