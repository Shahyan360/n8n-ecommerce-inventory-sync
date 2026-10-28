import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
const privateEnv=dotenv.parse(fs.readFileSync('.env','utf8'));
const secrets=Object.entries(privateEnv).filter(([k,v])=>/PASSWORD|TOKEN|ENCRYPTION_KEY|SECRET/.test(k)&&v.length>=16).map(([,v])=>v);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
const leaks=[];for(const file of files){const body=fs.readFileSync(file,'utf8');if(secrets.some(secret=>body.includes(secret)))leaks.push(file);}
if(leaks.length)throw new Error(`Private generated secrets found in repository candidates: ${leaks.join(', ')}`);
console.log(JSON.stringify({scannedFiles:files.length,generatedSecretLeaks:0,envIgnored:true}));
