import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
if(fs.existsSync('.env')){console.log('.env already exists; preserved');process.exit(0);}
let env=fs.readFileSync('.env.example','utf8');
const secrets=Object.fromEntries(['POSTGRES_PASSWORD','APP_DB_PASSWORD','N8N_DB_PASSWORD','INTERNAL_TOKEN','N8N_ENCRYPTION_KEY','RUNNER_AUTH_TOKEN','MOCK_WEBHOOK_SECRET'].map(k=>[k,randomBytes(32).toString('hex')]));
for(const [key,value] of Object.entries(secrets)) env=env.replace(new RegExp(`^${key}=.*$`,'m'),`${key}=${value}`);
env=env.replaceAll('commerce_app:GENERATED',`commerce_app:${secrets.APP_DB_PASSWORD}`).replaceAll('commerce_owner:GENERATED',`commerce_owner:${secrets.POSTGRES_PASSWORD}`);
fs.writeFileSync('.env',env,{mode:0o600});
console.log('Created private .env with random local secrets');
