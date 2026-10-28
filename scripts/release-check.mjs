import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
const env=fs.existsSync('.env')?dotenv.parse(fs.readFileSync('.env','utf8')):{};
const secrets=Object.entries(env).filter(([k,v])=>/PASSWORD|TOKEN|KEY|SECRET/.test(k)&&v.length>=16).map(([,v])=>v);
if(fs.existsSync('.runtime/n8n-owner.json')){const owner=JSON.parse(fs.readFileSync('.runtime/n8n-owner.json','utf8'));for(const k of ['password','cookie'])if(owner[k]?.length>=16)secrets.push(owner[k]);}
const issues=[];
for(const file of files){
  const normalized=file.replaceAll('\\','/');
  if(/^(\.runtime|\.vercel|reports|backups|node_modules|dist)\//.test(normalized)||/(^|\/)\.env($|\.)/.test(normalized)&&normalized!=='.env.example'||/\.(dump|log|pem|key|p12)$/.test(normalized))issues.push(`${file}: private artifact`);
  const body=fs.readFileSync(file,'utf8');
  if(secrets.some(s=>body.includes(s)))issues.push(`${file}: local credential value`);
  if(/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{25,}|shpat_[A-Fa-f0-9]{20,}|sk_live_[A-Za-z0-9]{20,})/.test(body))issues.push(`${file}: possible provider credential`);
  if(/[A-Z]:[\\/](?:Users|projects|LocalDisk)[\\/]/.test(body))issues.push(`${file}: workstation path`);
}
for(const required of ['LICENSE','NOTICE','SECURITY.md','CONTRIBUTING.md','README.md','vercel.json','.github/workflows/ci.yml'])if(!files.includes(required))issues.push(`${required}: missing release file`);
const output=path.resolve('web/dist');if(fs.existsSync(output)){const allowed=['app.mjs','simulator.mjs','index.html','styles.css','tokens.css','favicon.svg','content.json','robots.txt','workflows'];for(const entry of fs.readdirSync(output))if(!allowed.includes(entry))issues.push(`web/dist/${entry}: unexpected public asset`);const content=fs.readFileSync(path.join(output,'content.json'),'utf8');if(secrets.some(s=>content.includes(s)))issues.push('Public bundle contains a local secret');}
if(issues.length)throw new Error(`Release check failed:\n${issues.join('\n')}`);
console.log(JSON.stringify({repositoryFiles:files.length,credentialLeaks:0,privateArtifacts:0,workstationPaths:0,publicBundleChecked:fs.existsSync(output)}));
