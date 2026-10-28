// Isolated native verification fallback. Never touches installed PostgreSQL services.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {pgTool} from './postgres-tools.mjs';
const root=path.resolve('.runtime');fs.mkdirSync(root,{recursive:true});
const data=path.join(root,'pgdata');
const command=(name,args)=>execFileSync(pgTool(name),args,{windowsHide:true,stdio:'pipe'}).toString();
if(process.argv[2]==='stop'){console.log(command('pg_ctl',['-D',data,'-m','fast','stop']));process.exit(0);}
if(!fs.existsSync(path.join(data,'PG_VERSION'))){
  const pass=path.join(root,'init-password');fs.writeFileSync(pass,process.env.POSTGRES_PASSWORD,{mode:0o600});
  try{console.log(command('initdb',['-D',data,'-U','commerce_owner','--pwfile',pass,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--encoding=UTF8','--locale=C']));}finally{fs.unlinkSync(pass);}
  fs.appendFileSync(path.join(data,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport=55432\n");
}
try{command('pg_ctl',['-D',data,'status']);}catch{execFileSync(pgTool('pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'start','-w'],{windowsHide:true,stdio:'ignore',timeout:30000});}
const adminUrl=new URL(process.env.MIGRATION_DATABASE_URL);adminUrl.pathname='/postgres';
const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();
try{
  for(const [role,password] of [['commerce_app',process.env.APP_DB_PASSWORD],['n8n_app',process.env.N8N_DB_PASSWORD]]){
    if(!/^[a-f0-9]{64}$/.test(password))throw new Error('Expected generated hex password');
    if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  }
  if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='commerce'")).rowCount)await admin.query('CREATE DATABASE commerce OWNER commerce_owner');
  if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='commerce_test'")).rowCount)await admin.query('CREATE DATABASE commerce_test OWNER commerce_owner');
  if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='n8n'")).rowCount)await admin.query('CREATE DATABASE n8n OWNER n8n_app');
}finally{await admin.end();}
console.log('Isolated PostgreSQL ready on 127.0.0.1:55432');
