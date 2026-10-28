import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {nativeEnv} from './native-env.mjs';
const id=process.argv[2]||'commerceDemo';if(!/^commerce[A-Za-z]+$/.test(id))throw new Error('Expected a project workflow ID');
const log=path.resolve(`.runtime/execute-${id}.log`);const fd=fs.openSync(log,'w');
try{execFileSync(process.execPath,[path.resolve('.runtime/n8n/node_modules/n8n/bin/n8n'),'execute',`--id=${id}`],{env:{...nativeEnv,N8N_PORT:'5688',N8N_RUNNERS_BROKER_PORT:'5689'},windowsHide:true,stdio:['ignore',fd,fd],timeout:240000});}finally{fs.closeSync(fd);}
const output=fs.readFileSync(log,'utf8');if(!output.includes('Execution was successful:'))throw new Error(`Workflow did not report success; inspect ${log}`);
console.log(JSON.stringify({workflow:id,executed:true,log}));
