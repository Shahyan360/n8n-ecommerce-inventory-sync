import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pgTool} from './postgres-tools.mjs';
const owner=new URL(process.env.MIGRATION_DATABASE_URL);
if(owner.hostname!=='localhost'&&owner.hostname!=='127.0.0.1')throw new Error('Native backup verification is loopback-only');
const file=path.resolve('.runtime/commerce-verification.dump'),restoreName=`commerce_restore_${Date.now()}`;
assert(/^commerce_restore_\d+$/.test(restoreName));
const connection={host:owner.hostname,port:Number(owner.port),user:decodeURIComponent(owner.username),password:decodeURIComponent(owner.password)};
const source=new pg.Client({...connection,database:'commerce'});await source.connect();
const sql='SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM inventory_reservations) AS reservations,(SELECT count(*)::int FROM shipping_quotes) AS quotes,(SELECT COALESCE(sum(reserved),0)::int FROM inventory_balances) AS reserved';
const before=(await source.query(sql)).rows[0];
const args=['--host',connection.host,'--port',String(connection.port),'--username',connection.user];
const exec=(name,args)=>execFileSync(pgTool(name),args,{windowsHide:true,env:{...process.env,PGPASSWORD:connection.password},stdio:'pipe',timeout:60000});
exec('pg_dump',[...args,'--format=custom','--file',file,'--dbname','commerce']);
await source.query(`CREATE DATABASE ${restoreName} OWNER commerce_owner`);
try{
  exec('pg_restore',[...args,'--exit-on-error','--clean','--if-exists','--dbname',restoreName,file]);
  const restored=new pg.Client({...connection,database:restoreName});await restored.connect();let after;
  try{after=(await restored.query(sql)).rows[0];}finally{await restored.end();}
  assert.deepEqual(after,before);
  const result={verifiedAt:new Date().toISOString(),backupCreated:true,restoreVerified:true,source:'commerce',restoredTo:restoreName,before,after,backupBytes:fs.statSync(file).size};
  fs.writeFileSync('reports/backup-restore.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await source.query(`DROP DATABASE ${restoreName}`);await source.end();}
