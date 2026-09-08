import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const connectionString = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('NOT RUN: set PRODUCTION_DATABASE_URL to a read-only production PostgreSQL connection.');
  process.exit(2);
}
const expected = JSON.parse(readFileSync('results/rebuilt-schema-catalog.json','utf8'));
const client = new pg.Client({ connectionString, application_name: 'mydesck_phase1_readonly_parity', ssl: { rejectUnauthorized: false } });
const queries = {
  tables: "SELECT n.nspname AS schemaname,c.relname AS tablename,c.relrowsecurity AS rowsecurity,c.relforcerowsecurity AS force_row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','private','private_security','storage') ORDER BY 1,2",
  columns: "SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','private','private_security','storage') ORDER BY 1,2,ordinal_position",
  indexes: "SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','storage') ORDER BY 1,2,3",
  constraints: "SELECT n.nspname AS schema,c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') ORDER BY 1,2,3",
  triggers: "SELECT n.nspname AS schema,c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage') ORDER BY 1,2,3",
  policies: "SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname",
  functions: "SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS return_type,p.prosecdef AS security_definer,p.proconfig AS configuration,p.proacl AS grants,md5(regexp_replace(pg_get_functiondef(p.oid),'[[:space:]]+',' ','g')) AS definition_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','private_security') AND p.prokind='f' ORDER BY 1,2,3",
  views: "SELECT schemaname,viewname,md5(regexp_replace(definition,'[[:space:]]+',' ','g')) AS definition_hash FROM pg_views WHERE schemaname IN ('public','private','private_security') ORDER BY 1,2",
  storage_buckets: "SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id IN ('logos','business-logos','business-signatures','trip-attachments','restaurant-assets') ORDER BY id",
};
const keys = {
  tables: r=>`${r.schemaname}.${r.tablename}`, columns:r=>`${r.table_schema}.${r.table_name}.${r.column_name}`,
  indexes:r=>`${r.schemaname}.${r.tablename}.${r.indexname}`, constraints:r=>`${r.schema}.${r.table_name}.${r.conname}`,
  triggers:r=>`${r.schema}.${r.table_name}.${r.tgname}`, policies:r=>`${r.schemaname}.${r.tablename}.${r.policyname}`,
  functions:r=>`${r.schema}.${r.name}(${r.arguments})`, views:r=>`${r.schemaname}.${r.viewname}`, storage_buckets:r=>r.id,
};
const normalize = value => JSON.stringify(value, Object.keys(value).sort());
const safeDigest = value => createHash('sha256').update(normalize(value)).digest('hex');
const report = { status:'NOT RUN', timestamp:new Date().toISOString(), production_fingerprint:null, categories:{}, differences:[] };
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='30s'");
  assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on','Production session is not read-only');
  const actual = {};
  for (const [category,sql] of Object.entries(queries)) actual[category]=(await client.query(sql)).rows;
  await client.query('ROLLBACK');
  for (const category of Object.keys(queries)) {
    const expectedMap=new Map((expected[category]||[]).map(row=>[keys[category](row),row]));
    const actualMap=new Map((actual[category]||[]).map(row=>[keys[category](row),row]));
    const summary={expected:expectedMap.size,production:actualMap.size,matching:0,differences:0};
    for (const key of new Set([...expectedMap.keys(),...actualMap.keys()])) {
      const left=expectedMap.get(key), right=actualMap.get(key);
      if (left && right && normalize(left)===normalize(right)) { summary.matching++; continue; }
      let classification;
      if (!right) classification='DANGEROUS DRIFT';
      else if (!left) classification='MISSING FROM MIGRATIONS';
      else classification=['policies','functions','triggers','tables','storage_buckets'].includes(category)?'DANGEROUS DRIFT':'UNKNOWN';
      report.differences.push({category,key,classification,rebuilt:left?safeDigest(left):null,production:right?safeDigest(right):null});
      summary.differences++;
    }
    report.categories[category]=summary;
  }
  report.production_fingerprint=safeDigest(actual);
  report.status=report.differences.length?'FAIL':'PASS';
  console.log(`Production parity ${report.status}: ${report.differences.length} application-owned differences.`);
  if(report.status==='FAIL') process.exitCode=1;
} catch(error) {
  try { await client.query('ROLLBACK'); } catch {}
  report.status='FAIL'; report.error=error.message; console.error(`Production parity failed: ${error.message}`); process.exitCode=1;
} finally {
  await client.end().catch(()=>{});
  mkdirSync('results',{recursive:true});
  writeFileSync('results/production-schema-parity.json',JSON.stringify(report,null,2));
}
