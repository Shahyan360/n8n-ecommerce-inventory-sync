import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {nativeEnv} from './native-env.mjs';
const root=process.cwd(),pidFile=path.resolve('.runtime/native-pids.json');fs.mkdirSync('.runtime',{recursive:true});
const processes=fs.existsSync(pidFile)?JSON.parse(fs.readFileSync(pidFile,'utf8')):{};
if(process.argv[2]==='stop'){
  for(const [name,pid] of Object.entries(processes)){
    try{
      const command=execFileSync('powershell',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`],{windowsHide:true}).toString();
      if(command.toLowerCase().includes(root.toLowerCase())){process.kill(pid);console.log(`Stopped ${name}`);}
    }catch{}
  }
  fs.unlinkSync(pidFile);process.exit(0);
}
async function start(name,args,port,route='/health'){
  try{const r=await fetch(`http://127.0.0.1:${port}${route}`);if(r.ok){console.log(`${name} already healthy`);return;}}catch{}
  const stdout=fs.openSync(path.resolve(`.runtime/${name}.log`),'a');const stderr=fs.openSync(path.resolve(`.runtime/${name}.error.log`),'a');
  const child=spawn(process.execPath,args.map((a,i)=>i===0?path.resolve(a):a),{cwd:root,env:nativeEnv,detached:true,windowsHide:true,stdio:['ignore',stdout,stderr]});child.unref();processes[name]=child.pid;fs.closeSync(stdout);fs.closeSync(stderr);fs.writeFileSync(pidFile,JSON.stringify(processes,null,2));
  for(let i=0;i<300;i++){try{const r=await fetch(`http://127.0.0.1:${port}${route}`);if(r.ok){console.log(`${name} healthy on ${port}`);return;}}catch{}await new Promise(r=>setTimeout(r,1000));}
  throw new Error(`${name} did not become healthy; inspect .runtime/${name}.log`);
}
await start('inventory',['dist/services/inventory-service/server.js'],3001);
await start('mocks',['dist/services/mock-providers/server.js'],3002);
await start('n8n',['.runtime/n8n/node_modules/n8n/bin/n8n','start'],5678,'/healthz/readiness');
await start('gateway',['dist/services/webhook-gateway/server.js'],3100);
