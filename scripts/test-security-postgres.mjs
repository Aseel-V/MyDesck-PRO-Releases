const { default: EmbeddedPostgres } = await import(process.env.SECURITY_PG_RUNTIME || 'embedded-postgres');
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
if (process.platform === 'win32') process.env.PATH += `;${process.env.SystemRoot}\\System32`;

const directory = mkdtempSync(join(tmpdir(), 'mydesck-security-pg-'));
const pg = new EmbeddedPostgres({ databaseDir: join(directory,'data'), user: 'postgres', password: randomBytes(24).toString('hex'),
  port: 55439, persistent: true, initdbFlags: ['--encoding=UTF8','--locale=C'], postgresFlags: ['-h','127.0.0.1'], onLog: () => {}, onError: () => {} });
const report = { engine: 'PostgreSQL 17 (native)', platform: 'auth/storage SQL contract fixture; HTTP not exercised', migrations: [], tests: [], status: 'NOT RUN' };
let client;
try {
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient();
  await client.connect();
  await client.query(readFileSync('scripts/security/postgres-platform-fixture.sql','utf8'));
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    try { await client.query(readFileSync(`supabase/migrations/${file}`,'utf8')); }
    catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
    report.migrations.push(file);
  }
  console.log(`Empty PostgreSQL rebuild: ${report.migrations.length} migrations applied.`);
  const catalog = {};
  for (const [name, sql] of Object.entries({
    tables: "SELECT schemaname,tablename,rowsecurity FROM pg_tables WHERE schemaname IN ('public','private','private_security','storage') ORDER BY 1,2",
    columns: "SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','private','private_security','storage') ORDER BY 1,2,ordinal_position",
    indexes: "SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','storage') ORDER BY 1,2,3",
    constraints: "SELECT n.nspname AS schema,c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') ORDER BY 1,2,3",
    triggers: "SELECT n.nspname AS schema,c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage') ORDER BY 1,2,3",
    policies: "SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname",
    functions: "SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef AS security_definer,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','private_security') AND p.prokind='f' ORDER BY 1,2,3",
  })) catalog[name]=(await client.query(sql)).rows;
  mkdirSync('results',{recursive:true});
  writeFileSync('results/rebuilt-schema-catalog.json',JSON.stringify(catalog,null,2));
  if (!process.argv.includes('--migrations-only')) {
    for (const file of ['tenant-isolation.sql','restaurant-isolation.sql','storage-isolation.sql','travel-isolation.sql']) {
      await client.query(readFileSync(`scripts/security/${file}`,'utf8'));
      report.tests.push(file);
      console.log(`Database assertions completed: ${file}`);
    }
    await client.query(readFileSync('scripts/verify-canonical-trip-payments.sql','utf8'));
    report.tests.push('verify-canonical-trip-payments.sql');
    console.log('Canonical travel payment database assertions completed.');
    // Negative control: deliberately reopen self-promotion inside a rollback.
    await client.query('BEGIN; ALTER TABLE public.user_profiles DISABLE TRIGGER guard_platform_profile_fields');
    let mutationDetected=false;
    try { await client.query(readFileSync('scripts/security/tenant-isolation.sql','utf8')); }
    catch (error) { mutationDetected=error.message==='Self-promotion succeeded'; }
    await client.query('ROLLBACK');
    if (!mutationDetected) throw new Error('Security suite failed to detect intentionally reopened self-promotion');
    report.tests.push('negative control: disabled role guard detected');
    console.log('Negative control passed: reopened self-promotion makes the security test fail.');
  }
  report.status='PASS';
} catch (error) {
  report.status='FAIL'; report.error=error.message;
  console.error(error.message); process.exitCode=1;
} finally {
  await client?.end();
  await pg.stop();
  mkdirSync('results',{recursive:true});
  writeFileSync('results/security-postgres.json', JSON.stringify(report,null,2));
}
if (report.status !== 'PASS') process.exit(1);
