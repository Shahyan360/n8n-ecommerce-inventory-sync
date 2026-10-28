import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {nativeEnv} from './native-env.mjs';
fs.mkdirSync('.runtime',{recursive:true});
const credentials=[{id:'commerceInternal',name:'Commerce Internal',type:'httpHeaderAuth',data:{name:'x-internal-token',value:process.env.INTERNAL_TOKEN}}];
const credentialFile=path.resolve('.runtime/internal-credential.json');fs.writeFileSync(credentialFile,JSON.stringify(credentials),{mode:0o600});
const native=process.argv.includes('--native');
const env=nativeEnv;
const cli=path.resolve('.runtime/n8n/node_modules/n8n/bin/n8n');
function run(args){if(native)execFileSync(process.execPath,[cli,...args],{env,stdio:'inherit',windowsHide:true});else execFileSync('docker',['compose','run','--rm','n8n-import',...args],{stdio:'inherit',windowsHide:true});}
try{
  if(native){run(['import:credentials',`--input=${credentialFile}`]);run(['import:workflow','--separate',`--input=${path.resolve('workflows')}`]);for(const file of fs.readdirSync('workflows').filter(f=>f.endsWith('.json'))){const wf=JSON.parse(fs.readFileSync(`workflows/${file}`,'utf8'));run(['publish:workflow',`--id=${wf.id}`]);}}
  else run([]);
}finally{fs.unlinkSync(credentialFile);}
