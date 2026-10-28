import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';
import {stores} from '../services/shared/config.js';
export async function migrate(direction='up'){
  const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL});await db.connect();
  try{
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(8273181)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    if(direction==='seed'){
      for(const s of stores)await db.query('INSERT INTO stores(id,platform,domain,allow_partial,allow_backorder) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET domain=EXCLUDED.domain,allow_partial=EXCLUDED.allow_partial,allow_backorder=EXCLUDED.allow_backorder',[s.id,s.platform,s.domain,s.allowPartial,s.allowBackorder]);
      if(process.env.MODE!=='LIVE_MODE')await db.query(await fs.readFile('database/seed/001_demo.sql','utf8'));
    }else{
      const applied=(await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>r.version);
      const files=(await fs.readdir('database/migrations')).filter(f=>f.endsWith('.up.sql')).sort();
      if(direction==='down'){
        const v=applied.at(-1);if(v){await db.query(await fs.readFile(`database/migrations/${v}.down.sql`,'utf8'));await db.query('DELETE FROM schema_migrations WHERE version=$1',[v]);}
      }else for(const f of files){const v=f.replace('.up.sql','');if(!applied.includes(v)){await db.query(await fs.readFile(`database/migrations/${f}`,'utf8'));await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[v]);}}
    }
    // Only the migration owner can change schema; runtime has DML privileges.
    await db.query("DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='commerce_app') THEN GRANT USAGE ON SCHEMA public TO commerce_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO commerce_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO commerce_app; REVOKE ALL ON schema_migrations FROM commerce_app; END IF; END $$");
    await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
}
if(process.argv[1]?.replaceAll('\\','/').match(/\/database\.(ts|js)$/)){await migrate(process.argv[2]);console.log('Database command complete');}
