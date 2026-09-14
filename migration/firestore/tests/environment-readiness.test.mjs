import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT, DATABASE, hash, indexReadiness, capabilityBlockers, assertSyntheticPreflight,
  cleanupPlan, iamPlan, assertIamApply, IAM_BINDINGS } from '../lib/environment-readiness.mjs';
import { verifyRulesCapture } from '../lib/environment-go-evidence.mjs';

const required = JSON.parse(readFileSync('migration/firestore/rules/firestore.indexes.json', 'utf8')).indexes;
const live = required.map((s,i) => ({ ...s, name: `${DATABASE}/collectionGroups/${s.collectionGroup}/indexes/proof-${i}`, state: 'READY' }));
const response = indexes => ({ http: 200, data: { indexes } });
const run = 'migration-test--production-readiness-12345678-1234-1234-1234-123456789abc';
const ready = () => ({ project: PROJECT, database: DATABASE, backend: 'supabase', migrationRunId: run,
  billingEnabled: false, sparkPlan: 'PASS', quota: 'PASS', indexes: indexReadiness(required,response(live)).map((i,n)=>({
    ...i, classification: n < 2 ? 'REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE' : 'COST_OPTIMIZATION', hardDryRunGate: n < 2 })),
  iam: 'PASS', rules: 'PASS', secret: 'PASS' });
const entry = () => ({ kind: 'firestore', path: `migration-test/${run}--trip`, migrationRunId: run,
  createdByThisRun: true, creationReceipt: 'create-succeeded-1', version: 'update-time-1' });
const manifest = resource => ({ project: PROJECT, database: DATABASE, migrationRunId: run, resources: [resource] });

test('index readiness matches exact fields and scope, not the number of indexes', () => {
  assert.equal(required.length,3);
  assert.deepEqual(indexReadiness(required,response([])).map(i=>i.state), ['MISSING','MISSING','MISSING']);
  assert.equal(indexReadiness(required,response(live.map(i=>({...i,collectionGroup:'unrelated'})))).filter(i=>i.state==='READY').length,0);
  assert.equal(indexReadiness(required,response(live.map(i=>({...i,queryScope:'COLLECTION_GROUP'})))).filter(i=>i.state==='READY').length,0);
});
test('creating and failed indexes never satisfy readiness', () => {
  assert.deepEqual(indexReadiness(required,response(live.map(i=>({...i,state:'CREATING'})))).map(i=>i.state), ['CREATING','CREATING','CREATING']);
  assert.ok(indexReadiness(required,response(live.map(i=>({...i,state:'NEEDS_REPAIR'})))).every(i=>i.state==='ERROR'));
  assert.ok(indexReadiness(required,{http:403}).every(i=>i.state==='ERROR'));
  assert.ok(indexReadiness(required,response(live)).every(i=>i.state==='READY'));
});
test('Enterprise document-name ordering must match the explicit cursor index', () => {
  const indexes = structuredClone(live);
  assert.ok(indexReadiness(required,response(indexes)).every(i=>i.state==='READY'));
  indexes[0].fields.at(-1).order='DESCENDING';
  assert.equal(indexReadiness(required,response(indexes))[0].state,'MISSING');
});
test('every Spark capability and secret is required before synthetic network writes', () => {
  assert.doesNotThrow(()=>assertSyntheticPreflight(ready()));
  for (const key of ['iam','rules','secret','sparkPlan','quota']) {
    assert.throws(()=>assertSyntheticPreflight({...ready(),[key]:'NOT_RUN'}),/CAPABILITY_BLOCKED/);
    assert.throws(()=>assertSyntheticPreflight({...ready(),[key]:undefined}),/CAPABILITY_BLOCKED/);
  }
  assert.throws(()=>assertSyntheticPreflight({...ready(),billingEnabled:true}),/BILLING/);
  assert.throws(()=>assertSyntheticPreflight({...ready(),indexes:[]}),/INDEXES/);
  assert.doesNotThrow(()=>assertSyntheticPreflight({...ready(),indexes:ready().indexes.map((i,n)=>n===2?{...i,state:'MISSING'}:i)}));
  assert.throws(()=>assertSyntheticPreflight({...ready(),indexes:ready().indexes.map((i,n)=>n===0?{...i,state:'MISSING'}:i)}),/INDEXES/);
  assert.throws(()=>assertSyntheticPreflight({...ready(),indexes:ready().indexes.map(i=>({...i,classification:'UNKNOWN'}))}),/INDEXES/);
});
test('production identity and backend are fixed for the smoke', () => {
  assert.throws(()=>assertSyntheticPreflight({...ready(),project:'other'}),/TARGET_MISMATCH/);
  assert.throws(()=>assertSyntheticPreflight({...ready(),database:DATABASE.replace('/default','/(default)')}),/TARGET_MISMATCH/);
  assert.throws(()=>assertSyntheticPreflight({...ready(),backend:'firestore'}),/BACKEND/);
  assert.throws(()=>assertSyntheticPreflight({...ready(),migrationRunId:'customer-id'}),/RUN_ID/);
  assert.deepEqual(capabilityBlockers(ready()),[]);
});
test('cleanup requires matching creation receipt and live run ownership', () => {
  const r=entry();
  assert.deepEqual(cleanupPlan(manifest(r),[r]),[{kind:r.kind,path:r.path,versionPrecondition:r.version,migrationRunId:run}]);
  assert.throws(()=>cleanupPlan(manifest(r),[]),/OWNERSHIP/);
  assert.throws(()=>cleanupPlan(manifest(r),[{...r,migrationRunId:'different-run'}]),/OWNERSHIP/);
  assert.throws(()=>cleanupPlan(manifest(r),[{...r,creationReceipt:'different'}]),/OWNERSHIP/);
  assert.throws(()=>cleanupPlan(manifest({...r,createdByThisRun:false}),[r]),/OWNERSHIP/);
});
test('cleanup refuses customer IDs, wildcard paths and traversal', () => {
  for(const path of ['businesses/customer-id',`migration-test/${run}--*`,`migration-test/${run}--x/../customer`, `migration-test/${run}--x%2Fcustomer`]) {
    const r={...entry(),path};
    assert.throws(()=>cleanupPlan(manifest(r),[r]),/OWNERSHIP/);
  }
  assert.throws(()=>cleanupPlan({...manifest(entry()),project:'other'},[entry()]),/SCOPE/);
});
test('cleanup detects concurrent replacement and duplicate entries', () => {
  const r=entry();
  assert.throws(()=>cleanupPlan(manifest(r),[{...r,version:'replacement'}]),/VERSION/);
  assert.throws(()=>cleanupPlan({...manifest(r),resources:[r,r]},[r]),/ENTRY/);
  assert.throws(()=>cleanupPlan(manifest({...r,kind:'bucket'}),[r]),/ENTRY/);
});
test('synthetic financial rollback detects Firestore-only state and creates exact cleanup plan', () => {
  const r={...entry(),path:`migration-test/${run}--payment`};
  const source = new Map(); const target = new Map([[r.path,{amount:'17.25',currency:'ILS',migrationRunId:run}]]);
  const journal = { migrationRunId: run, path: r.path, beforeHash: null, afterHash: hash(JSON.stringify(target.get(r.path))) };
  assert.equal(source.has(journal.path),false);
  assert.equal(hash(JSON.stringify(target.get(journal.path))),journal.afterHash);
  const cleanup=cleanupPlan(manifest(r),[r]);
  assert.equal(cleanup.length,1);
  target.delete(cleanup[0].path);
  assert.equal(target.size,0);
  assert.equal(source.size,0);
  // In-memory guard proof only; never recorded as real-project rollback PASS.
});
test('IAM defaults to plan and exact binding approval is mandatory', () => {
  const p=iamPlan('migration-writer');
  assert.equal(assertIamApply({},p),false);
  assert.throws(()=>assertIamApply({mode:'apply'},p),/APPROVAL/);
  assert.throws(()=>assertIamApply({mode:'apply',approval:iamPlan('index-deployer').approvalSha256},p),/APPROVAL/);
  assert.equal(assertIamApply({mode:'apply',approval:p.approvalSha256},p),true);
  assert.throws(()=>assertIamApply({mode:'force'},p),/MODE/);
  assert.throws(()=>iamPlan('owner'),/UNREVIEWED/);
});
test('IAM writer and deployment identities remain separate', () => {
  const writer=iamPlan('migration-writer'), deployer=iamPlan('index-deployer');
  assert.notEqual(writer.binding.member,deployer.binding.member);
  assert.equal(writer.binding.role,'roles/datastore.user');
  assert.ok(writer.binding.condition.includes(`resource.name=="${DATABASE}"`));
  assert.ok(writer.binding.condition.includes(`resource.name.startsWith("${DATABASE}/documents/")`));
  assert.equal(deployer.binding.role,'roles/datastore.indexAdmin');
  assert.ok(writer.remove.includes('remove-iam-policy-binding'));
  assert.ok(!writer.remove.includes('--all'));
});
test('IAM candidates exclude broad project, billing, secret and impersonation roles', () => {
  const forbidden=['roles/owner','roles/editor','roles/firebase.admin','roles/secretmanager.secretAccessor','roles/iam.serviceAccountUser'];
  assert.ok(Object.values(IAM_BINDINGS).every(b=>!forbidden.includes(b.role)));
  assert.equal(iamPlan('index-deployer').binding.role,'roles/datastore.indexAdmin');
  assert.equal(iamPlan('rules-reader').binding.role,'roles/firebaserules.viewer');
  assert.notEqual(iamPlan('index-deployer').binding.member,iamPlan('migration-writer').binding.member);
});
test('production release pins default and unprovisioned Storage has no guessed target', () => {
  const config=JSON.parse(readFileSync('migration/firestore/firebase.production.json','utf8'));
  const storage=JSON.parse(readFileSync('migration/firestore/config/production-storage-target.json','utf8'));
  assert.equal(config.firestore.database,'default');
  assert.equal(config.functions,undefined);
  assert.equal(config.storage,undefined);
  assert.equal(storage.bucket,null);
  assert.equal(storage.state,'UNPROVISIONED');
  assert.equal(storage.publicAccess,false);
});
test('Rules readiness requires both captured current and immutable rollback bytes',()=>{
  const path='migration/firestore/rules/firestore.rules';
  const capture={release:'projects/mydesckpro/releases/cloud.firestore/default',ruleset:'projects/mydesckpro/rulesets/test-version',
    files:[{path,sha256:hash(readFileSync(path))}]};
  const e={currentRules:capture,rollbackRules:capture,currentRelease:{http:200,data:{rulesetName:capture.ruleset}}};
  assert.equal(verifyRulesCapture(e),true);
  assert.equal(verifyRulesCapture({...e,rollbackRules:null}),false);
  assert.equal(verifyRulesCapture({...e,rollbackRules:{...capture,files:[{path,sha256:'wrong'}]}}),false);
  assert.equal(verifyRulesCapture({...e,currentRelease:{http:200,data:{rulesetName:'different'}}}),false);
  assert.equal(verifyRulesCapture({...e,currentRules:{...capture,release:'projects/mydesckpro/releases/cloud.firestore'}}),false);
});
