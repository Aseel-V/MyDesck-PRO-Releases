import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPECTED, PRODUCTION_ACK, assertControlEvidence, assertMode, assertNoSilentFallback,
  assertReadOnlySource, assertSafeTriggers, evaluateGo, reserveRunId, validateCounts,
  validateIdentity, validateLedgerResume,
  validateAuthCollisions,
} from '../lib/production-guard.mjs';
import { ProductionWriter } from '../lib/production-writer.mjs';

const approved = { rulesHash: 'rules', commitSha: 'commit' };
const identity = { ...EXPECTED, rulesHash: 'rules', commitSha: 'commit' };
const mismatch = (field, value) => validateIdentity({ ...identity, [field]: value }, approved);

test('production identity guards fail closed', () => {
  assert.match(mismatch('firebaseProject', 'wrong')[0], /FIREBASE_PROJECT/);
  assert.match(mismatch('supabaseProject', 'wrong')[0], /SUPABASE_PROJECT/);
  assert.match(mismatch('firestoreDatabaseId', '(default)')[0], /FIRESTORE_DATABASE/);
  assert.match(mismatch('transformVersion', 'old')[0], /TRANSFORM_VERSION/);
  assert.match(mismatch('schemaVersion', 2)[0], /SCHEMA_VERSION/);
  assert.match(mismatch('rulesHash', 'wrong')[0], /RULES_HASH/);
  assert.match(mismatch('commitSha', 'wrong')[0], /EXECUTABLE_COMMIT/);
  assert.deepEqual(validateIdentity(identity, approved), []);
});

test('production acknowledgement and modes are explicit', () => {
  assert.doesNotThrow(() => assertMode('dry-run', ['dry-run', 'production-copy']));
  assert.throws(() => assertMode('production-copy', ['dry-run', 'production-copy']), /ACKNOWLEDGEMENT/);
  assert.doesNotThrow(() => assertMode('production-copy', ['dry-run', 'production-copy'], PRODUCTION_ACK));
});

test('source snapshot, counts, run id and ledger resume reject drift', () => {
  assert.throws(() => assertReadOnlySource({ readOnly: true, isolationLevel: 'repeatable read', writeAttemptRejected: false }), /READ_ONLY/);
  assert.throws(() => validateCounts({ authUsers: 11, sourceRows: 1444 }, { authUsers: 10, sourceRows: 1444 }), /AUTH_COUNT/);
  assert.throws(() => validateCounts({ authUsers: 10, sourceRows: 1445 }, { authUsers: 10, sourceRows: 1444 }), /SOURCE_ROW/);
  const ids = new Set(['run-1']);
  assert.throws(() => reserveRunId('run-1', ids), /DUPLICATE_MIGRATION_RUN_ID/);
  assert.throws(() => validateLedgerResume([{ key: 'a', migrationRunId: 'r', transformVersion: 'v', state: 'VERIFIED', sourceHash: '1', targetHash: '2' }], { migrationRunId: 'r', transformVersion: 'v' }), /HASH_MISMATCH/);
});

test('target Auth UID and normalized email collisions are explicit', () => {
  const target = [{ uid: 'existing', emailNormalized: 'used@example.test' }];
  assert.deepEqual(validateAuthCollisions([{ uid: 'existing', emailNormalized: 'same@example.test' }], target).map((x) => x.type), ['DUPLICATE_TARGET_UID']);
  assert.deepEqual(validateAuthCollisions([{ uid: 'new', emailNormalized: 'used@example.test' }], target).map((x) => x.type), ['DUPLICATE_TARGET_EMAIL']);
  assert.deepEqual(validateAuthCollisions([{ uid: 'new', emailNormalized: 'new@example.test' }], target), []);
});

test('fallback, triggers and operational evidence fail closed', () => {
  assert.throws(() => assertNoSilentFallback({ primary: 'firestore', fallbackAttempted: true }), /SILENT_SUPABASE_FALLBACK/);
  assert.throws(() => assertSafeTriggers([{ migrationSafety: 'UNKNOWN' }]), /UNSAFE_ACTIVE/);
  assert.doesNotThrow(() => assertSafeTriggers([{ migrationSafety: 'IGNORE_MIGRATION_WRITES' }]));
  assert.throws(() => assertControlEvidence({ writeFreeze: 'READY', rollback: 'READY' }), /STORAGEDELTA/);
});

test('missing evidence and unresolved secret always produce NO_GO', () => {
  assert.equal(evaluateGo({}).decision, 'NO_GO');
  const all = Object.fromEntries(['environment','sparkPlan','auth','iam','rules','indexes','quota','noFunctions','noStorage','criticalTransactions','ruleAccessBudget','maliciousClient','realClientSmoke','bulkData','delta','financial','relationships','events','search','arabic','hebrew','english','electron','activeSupabase','secret','writeFreeze','rollback','observability','backendSwitch'].map((x) => [x,{status:'PASS'}]));
  assert.equal(evaluateGo(all).decision, 'GO');
  all.secret = { status: 'FAIL' };
  assert.equal(evaluateGo(all).decision, 'NO_GO');
  assert.ok(evaluateGo(all).blockers.includes('secret'));
});

test('production Functions package cannot use the emulator entrypoint', () => {
  const config = JSON.parse(readFileSync('migration/firestore/firebase.production.json', 'utf8'));
  const release = JSON.parse(readFileSync('migration/firestore/release/production-release-manifest.json', 'utf8'));
  assert.equal(config.functions.source, '../production-prep.local/functions-package');
  assert.match(release.deployment.command, /firebase\.production\.json/);
  assert.match(release.deployment.packageCommand, /build-production-functions-package/);
});

test('production writer is bounded, restartable and retries transient failures', async () => {
  let active = 0; let maximum = 0; let first = true;
  const batches = [];
  const records = [];
  const ledger = {
    isVerified: (key) => key === 'already-verified',
    record: (record) => records.push(record),
  };
  const writer = new ProductionWriter({
    batchSize: 2,
    concurrency: 2,
    retryBudget: 2,
    sleep: async () => {},
    ledger,
    writeBatch: async (items) => {
      active += 1; maximum = Math.max(maximum, active);
      try {
        if (first) { first = false; throw Object.assign(Error('retry'), { code: 'UNAVAILABLE' }); }
        await Promise.resolve();
        batches.push(items.map((x) => x.ledger.key));
      } finally { active -= 1; }
    },
  });
  async function* input() {
    for (const key of ['a', 'already-verified', 'b', 'c', 'd']) yield { ledger: { key, sourceHash: key } };
  }
  const metrics = await writer.write(input(), { migrationRunId: 'run', transformVersion: 'v' });
  assert.deepEqual(metrics, { sourceRowsRead: 5, firestoreWrites: 4, verifiedDocuments: 1, failedDocuments: 0, retryCount: 1 });
  assert.ok(maximum <= 2);
  assert.equal(batches.flat().length, 4);
  assert.equal(records.filter((x) => x.state === 'COPIED').length, 4);
});
