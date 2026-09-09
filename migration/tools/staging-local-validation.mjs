import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { localConfig, qi } from './lib/staging-source.mjs';
import { writeReport } from './lib/write-report.mjs';
import { verifyLocalProofTarget } from '../tests/real-token-postgres.mjs';

const config=localConfig();
const evidence={generatedAt:new Date().toISOString(),scope:'disposable local baseline only; no Cloud SQL import',status:'BLOCKED'};
const paths=['auth-dry-run.fixture.json','inventory-reconciliation.json','portability.json','replay.json'];
const backups=paths.map(name=>({path:'migration/reports/'+name,bytes:readFileSync('migration/reports/'+name)}));
try {
  await verifyLocalProofTarget(config.PGURL);
  const c=new pg.Client({connectionString:config.PGURL}); await c.connect();
  try {
    evidence.database='mydesck_migration_staging_local_'+randomUUID().replaceAll('-','').slice(0,12);
    await c.query('CREATE DATABASE '+qi(evidence.database)+" ENCODING 'UTF8' TEMPLATE template0");
    const target=new URL(config.PGURL); target.pathname='/'+evidence.database;
    config.PGURL=target.toString();
  } finally {await c.end();}
  const result=spawnSync(process.execPath,['migration/tools/run-harness.mjs'],{
    env:{...process.env,PGURL:config.PGURL},encoding:'utf8',timeout:240000,maxBuffer:10_000_000});
  // Existing runner output is retained only in ignored local evidence.
  writeFileSync('migration/staging.local/harness-output.txt',(result.stdout??'')+(result.stderr??''));
  evidence.exitCode=result.status;
  evidence.suites=[...(result.stdout??'').matchAll(/\[([\w-]+)\] (\d+) passed, (\d+) failed/g)]
    .map(m=>({suite:m[1],passed:Number(m[2]),failed:Number(m[3])}));
  evidence.assertions=evidence.suites.reduce((n,x)=>n+x.passed+x.failed,0);
  evidence.failures=evidence.suites.reduce((n,x)=>n+x.failed,0);
  evidence.replay=JSON.parse(readFileSync('migration/reports/replay.json','utf8'));
  assert.equal(result.status,0); assert.equal(evidence.assertions,120); assert.equal(evidence.failures,0);
  const catalog=new pg.Client({connectionString:config.PGURL}); await catalog.connect();
  try {
    evidence.targetTables=(await catalog.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
    const source=JSON.parse(readFileSync('migration/reports/staging-source-inventory.json','utf8'));
    evidence.schemaDifference={sourcePublicTables:source.tables.length,targetPublicTables:evidence.targetTables.length,
      sourceOnly:source.tables.map(x=>x.name).filter(x=>!evidence.targetTables.includes(x)),
      targetOnly:evidence.targetTables.filter(x=>!source.tables.some(y=>y.name===x))};
    evidence.runtime=(await catalog.query(`SELECT rolname,rolsuper,rolbypassrls,
      (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND tableowner=r.rolname) AS owned_public_tables
      FROM pg_roles r WHERE rolname='mydesck_runtime'`)).rows[0];
  } finally { await catalog.end(); }
  const tests=spawnSync(process.execPath,['--test','--test-reporter=tap','migration/tests/staging-reconcile.test.mjs'],{
    env:process.env,encoding:'utf8',timeout:30000});
  evidence.newOfflineAssertions=Number(/# tests (\d+)/.exec(tests.stdout)?.[1]);
  evidence.newOfflineFailures=Number(/# fail (\d+)/.exec(tests.stdout)?.[1]);
  assert.equal(tests.status,0); assert.equal(evidence.newOfflineAssertions,19);
  evidence.totalAssertions=evidence.assertions+evidence.newOfflineAssertions;
  evidence.status='PASS';
} catch(error){evidence.blocker=/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_VALIDATION_FAILED';}
finally {
  for(const item of backups)writeReport(item.path,item.bytes);
  evidence.preexistingReportBytesRestored=backups.every(x=>readFileSync(x.path).equals(x.bytes));
  evidence.preservedReports=backups.map(x=>({path:x.path,sha256:createHash('sha256').update(x.bytes).digest('hex')}));
  writeReport('migration/reports/staging-local-validation.json',JSON.stringify(evidence,null,2)+'\n');
}
console.log(JSON.stringify({status:evidence.status,database:evidence.database,assertions:evidence.totalAssertions,
  failures:evidence.failures,migrations:evidence.replay?.totalMigrations,restored:evidence.preexistingReportBytesRestored,blocker:evidence.blocker}));
process.exitCode=evidence.status==='PASS'?0:2;
