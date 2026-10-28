// Creates only this project's isolated local n8n owner; never overwrites an owner.
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
const file='.runtime/n8n-owner.json',url='http://127.0.0.1:5678';
let account=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{email:'local.operator@example.test',firstName:'Local',lastName:'Operator',password:`Aa1!${randomBytes(32).toString('base64url')}`};
const existing=fs.existsSync(file);
const r=await fetch(`${url}/rest/${existing?'login':'owner/setup'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(existing?{emailOrLdapLoginId:account.email,password:account.password}:account)});
if(!r.ok)throw new Error(`Local n8n owner ${existing?'login':'setup'} returned ${r.status}; existing owner is never overwritten`);
account.cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');if(!account.cookie)throw new Error('Expected local authentication cookie');
fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync(file,JSON.stringify(account,null,2),{mode:0o600});console.log('Local n8n owner ready; private login details stored in .runtime/n8n-owner.json');
