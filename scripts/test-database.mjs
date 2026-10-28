import 'dotenv/config';
import pg from 'pg';
const url=new URL(process.env.TEST_MIGRATION_DATABASE_URL||'');
if(url.pathname!=='/commerce_test')throw new Error('TEST_MIGRATION_DATABASE_URL must target commerce_test');
const adminUrl=new URL(url);adminUrl.pathname='/postgres';
const db=new pg.Client({connectionString:adminUrl.toString()});await db.connect();
try{
  const password=process.env.APP_DB_PASSWORD;
  if(!/^[a-f0-9]{64}$/.test(password||''))throw new Error('Run npm run setup to generate an application password');
  if(!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='commerce_app'")).rowCount)await db.query(`CREATE ROLE commerce_app LOGIN PASSWORD '${password}'`);
  if(!(await db.query("SELECT 1 FROM pg_database WHERE datname='commerce_test'")).rowCount)await db.query('CREATE DATABASE commerce_test OWNER commerce_owner');
  console.log('Isolated commerce_test database is ready');
}finally{await db.end();}
