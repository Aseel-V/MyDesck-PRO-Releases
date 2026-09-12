#!/usr/bin/env node
// Supplementary local PostgreSQL, migration reconciliation, application and security suites.
// Historical phase reports already staged by the user are restored byte-for-byte.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

const output = 'migration/env-blocker-closure.local';
mkdirSync(output,{recursive:true});
const protectedPaths = ['migration/reports/replay.json', 'migration/reports/inventory-reconciliation.json',
  'migration/reports/auth-dry-run.fixture.json', 'migration/reports/portability.json',
  'results/rebuilt-schema-catalog.json', 'results/security-postgres.json'];
const before = new Map(protectedPaths.filter(existsSync).map(p=>[p,readFileSync(p)]));
const results=[];
const env={...process.env};
for(const [key,value] of Object.entries(env)) if(/[^\x00-\x7F]/.test(key+value)) delete env[key];
delete env.PGURL; delete env.DATABASE_URL; delete env.GOOGLE_APPLICATION_CREDENTIALS;
const run=(name,args,extra={})=>{
  const r=spawnSync(process.execPath,args,{env:{...env,...extra},encoding:'utf8',maxBuffer:16e6,timeout:300000});
  writeFileSync(`${output}/${name}.log`,(r.stdout??'')+(r.stderr??''));
  const result={name,status:r.status===0?'PASS':'FAIL',exitCode:r.status,log:`${output}/${name}.log`};
  results.push(result); console.log(JSON.stringify(result));
};
let pg;
try {
  // initdb on Windows inherits environment; remove non-ASCII values only for local pg startup.
  for(const [key,value] of Object.entries(process.env)) if(/[^\x00-\x7F]/.test(key+value)) delete process.env[key];
  if(process.platform==='win32') process.env.PATH = `${process.env.PATH ?? ''};${process.env.SystemRoot}\\System32`;
  const password=randomBytes(24).toString('hex');
  const directory=mkdtempSync(join(tmpdir(),'mydesck-env-oracle-'));
  pg=new EmbeddedPostgres({databaseDir:join(directory,'data'),user:'postgres',password,port:55449,persistent:true,
    initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
  await pg.initialise(); await pg.start(); await pg.createDatabase('migration_env_test');
  const PGURL=`postgresql://postgres:${password}@127.0.0.1:55449/migration_env_test`;
  run('migration-postgres-reconciliation',['migration/tools/run-harness.mjs'],{PGURL,PGCLIENTENCODING:'UTF8'});
  run('security-postgres',['scripts/test-security-postgres.mjs']);
  for(const file of ['test-canonical-trip-payments.ts','test-trip-smoke-suite.mjs','test-currency-regression.mjs',
    'test-validation-ux-gate.mjs','test-analytics-suite.mjs','test-card-processing-disabled.ts','test-whatsapp-disabled.ts','test-business-images.ts']) {
    run(file.replace(/\.(mjs|ts)$/,''),['scripts/run-typescript-source-test.mjs',`scripts/${file}`]);
  }
  for(const file of ['test-database-grant-parser.mjs','test-database-rpc-contracts.mjs','test-migration-policy-idempotency.mjs',
    'test-restaurant-security-reconciliation.mjs','check-database-compatibility.mjs']) run(file.replace('.mjs',''),[`scripts/${file}`]);
} catch { results.push({name:'local-regression-setup',status:'FAIL',reason:'LOCAL_SETUP_FAILED_NO_CREDENTIAL_OUTPUT'}); }
finally {
  for(const [path,bytes] of before) {
    if(existsSync(path)) writeFileSync(`${output}/${path.replaceAll('/','--')}.after.json`,readFileSync(path));
    writeFileSync(path,bytes);
  }
  if(pg) { try {await pg.stop();}catch{} }
}
const report={generatedAt:new Date().toISOString(),environment:'local disposable PostgreSQL and offline application/security',
  cloudSql:'NOT_USED',productionCustomerChanges:0,results,passed:results.filter(r=>r.status==='PASS').length,
  failed:results.filter(r=>r.status==='FAIL').length,stagedReportWorktreesRestored:before.size};
writeFileSync('migration/reports/firebase-environment-regression.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed}));
if(report.failed) process.exitCode=1;
