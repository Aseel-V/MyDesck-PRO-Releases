import { existsSync, readFileSync } from 'node:fs';
import { hash, indexReadiness, REQUIRED_APIS } from './environment-readiness.mjs';

export function verifyRulesCapture(e) {
  const matches = capture => capture?.release === 'projects/mydesckpro/releases/cloud.firestore/default' &&
    capture.ruleset?.startsWith('projects/mydesckpro/rulesets/') && capture.files?.length > 0 &&
    capture.files.every(f=>existsSync(f.path) && hash(readFileSync(f.path))===f.sha256);
  return Boolean(e.currentRelease?.http === 200 && e.currentRelease.data.rulesetName === e.currentRules?.ruleset &&
    matches(e.currentRules) && matches(e.rollbackRules));
}

// Fresh inspection augments the existing 22 gates. evaluateGo itself is unchanged.
// Real smoke and rollback are additional readiness prerequisites, not fabricated old gates.
export function environmentGoEvidence() {
  const path = 'migration/reports/firebase-production-environment-inventory.json';
  if (!existsSync(path)) return {};
  const inventory = JSON.parse(readFileSync(path,'utf8'));
  const e = inventory.evidence;
  const age = Date.now() - Date.parse(inventory.generatedAt);
  if (inventory.project !== 'mydesckpro' || inventory.database !== 'projects/mydesckpro/databases/default' ||
      !Number.isFinite(age) || age < -60000 || age > 86400000 || inventory.readOnly !== true) {
    return Object.fromEntries(['iam','rules','indexes','functions','storage'].map(name=>[name,{status:'NOT_RUN',evidence:'fresh target-verified environment inventory required'}]));
  }
  const specs = JSON.parse(readFileSync('migration/firestore/rules/firestore.indexes.json','utf8')).indexes;
  const indexes = indexReadiness(specs,e.indexes);
  const enabled = new Set(e.services.data?.services?.filter(s=>s.state==='ENABLED').map(s=>s.name));
  const disabled = REQUIRED_APIS.filter(api=>!enabled.has(api));
  const harness = existsSync('migration/reports/firestore-full-harness.json') ? JSON.parse(readFileSync('migration/reports/firestore-full-harness.json','utf8')) : null;
  const rulesTest = harness?.suites?.find(s=>s.label==='Firestore Rules');
  const rulesCaptured = verifyRulesCapture(e);
  const bucket = JSON.parse(readFileSync('migration/firestore/config/production-storage-target.json','utf8'));
  const bucketAvailable = Boolean(bucket.bucket) && e.buckets.http === 200 && e.buckets.data.items.some(b=>b.name===bucket.bucket);
  return {
    iam: { status:'FAIL', evidence: { inventory:path, migrationIdentity:inventory.migrationIdentity,
      projectPermissions:e.migrationProjectPermissions, syntheticRead:e.migrationSyntheticRead,
      conditionalGrantProof:'NOT_RUN_NO_OPERATOR_BINDING_APPLIED', effectiveResourceAnalysis:'NOT_RUN_TROUBLESHOOTER_DISABLED',
      note:'Human Owner remains; project-policy absence of prohibited grants is not a complete resource-level analysis.' } },
    rules: { status:rulesCaptured && rulesTest?.outcome==='PASS' ? 'PASS' : 'NOT_RUN', evidence: {
      current:e.currentRules ?? null, candidateSha256:hash(readFileSync('migration/firestore/rules/firestore.rules')),
      rollbackAvailable:rulesCaptured, rollback:e.rollbackRules ?? null, emulator:rulesTest?.outcome ?? 'NOT_RUN', deployed:false,
      note:'READINESS only: captured current release, candidate tested, rollback source verified. Current deny-all Rules require separate approved deployment for client smoke.' } },
    indexes: { status:indexes.length===3 && indexes.every(i=>i.state==='READY') ? 'PASS' : 'FAIL', evidence:indexes },
    functions: { status:'FAIL', evidence:{ billingEnabled:e.billing.data?.billingEnabled === true, disabledRequiredApis:disabled,
      eventarc:enabled.has('eventarc.googleapis.com')?'ENABLED':'DISABLED_NOT_REQUIRED_FOR_CURRENT_CALLABLES',
      deployCapability:'NOT_RUN', realSmoke:'NOT_RUN', reason:!e.billing.data?.billingEnabled?'FUNCTIONS DEPLOYMENT BLOCKED BY BILLING':'reviewed runtime/deployment and real capability proof required' } },
    storage: { status:'FAIL', evidence:{ buckets:e.buckets.data?.items?.map(b=>b.name) ?? [], target:bucket.bucket,
      bucketAvailable, firebaseStorageApi:enabled.has('firebasestorage.googleapis.com')?'ENABLED':'DISABLED',
      billingEnabled:e.billing.data?.billingEnabled === true, privateRulesAndChecksumSmoke:'NOT_RUN' } },
    electron: { status:'NOT_RUN', evidence:{ apiConfigurationRead:e.appCheck.http===200?'PASS':'NOT_RUN',
      packagedTokenProof:'NOT_RUN', reason:'Packaged Electron attestation provider registration/verification and authenticated callable proof pending; no debug-token substitution.' } },
  };
}
