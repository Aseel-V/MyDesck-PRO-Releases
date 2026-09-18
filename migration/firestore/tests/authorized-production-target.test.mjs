/**
 * The authorized production target, exercised without touching production.
 *
 * The commit path runs against an in-memory Firestore double injected through `firestoreFactory`,
 * so batching, idempotency, allowlist enforcement, integrity re-checking, failure-stop, journalling
 * and rollback are all executed for real — just not against the real project. Every refusal is
 * asserted to happen BEFORE any write reaches the double.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openAuthorizedProductionTarget, sealMutationPlan, validatePlannedPath, planHash, isRetryable,
  ProductionTargetError, EXPECTED_PLANNED_DOCUMENTS, FIRESTORE_BATCH_LIMIT,
} from '../lib/authorized-production-target.mjs';
import { authorize, assertCapability, isIssuedCapability, STAGES, manifestIntegrityHash }
  from '../lib/production-execution-authorization.mjs';
import { PRODUCTION_ACK, sha256 } from '../lib/production-guard.mjs';
import { ProductionJournal, JOURNAL_STATUS, bulkCopyGate } from '../lib/production-journal.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';
import { partitionBatches } from '../lib/migration-plan.mjs';

const CONFIG = JSON.parse(readFileSync('migration/firestore/config/production-migration.json', 'utf8'));
const READINESS = JSON.parse(readFileSync('migration/reports/firestore-production-dry-run.json', 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'prodtarget-'));

// ---- a real capability, obtained the only way one can be obtained ------------------------------
function validManifestPath(name, stage = STAGES.firestoreBulkCopy) {
  const body = { stage, decision: 'GO', firebaseProject: 'mydesckpro', firestoreDatabaseId: 'default',
    supabaseProject: 'pubugnfaqqukelvgckdr', approvedPreparationCommit: CONFIG.approvedPreparationCommit,
    issuedBy: 'test', issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify({ ...body, integrityHash: manifestIntegrityHash(body) }, null, 2));
  return path;
}
const realCapability = (stage = STAGES.firestoreBulkCopy) => {
  const result = authorize({ mode: 'production-copy', stage, acknowledgement: PRODUCTION_ACK,
    goManifestPath: validManifestPath(`cap-${stage}`, stage), config: CONFIG, readiness: READINESS });
  assert.equal(result.authorized, true, `capability precondition failed: ${result.reasons.join(',')}`);
  return result.capability;
};

// ---- an in-memory Firestore double -------------------------------------------------------------
function fakeFirestore({ seed = {}, failOnBatch = null } = {}) {
  const store = new Map(Object.entries(seed));
  const state = { commits: 0, writes: 0, deletes: 0 };
  const db = {
    projectId: 'mydesckpro',
    doc: (path) => ({ path, get: async () => ({ exists: store.has(path), data: () => store.get(path) }) }),
    collection: (name) => ({
      limit: () => ({ get: async () => {
        const hit = [...store.keys()].some((key) => key === name || key.startsWith(`${name}/`));
        return { empty: !hit };
      } }),
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data) => ops.push({ kind: 'set', path: ref.path, data }),
        delete: (ref) => ops.push({ kind: 'delete', path: ref.path }),
        commit: async () => {
          state.commits += 1;
          if (failOnBatch !== null && state.commits === failOnBatch) {
            const error = new Error('injected permission failure');
            error.code = 7; // PERMISSION_DENIED — never retryable
            throw error;
          }
          for (const op of ops) {
            if (op.kind === 'set') { store.set(op.path, op.data); state.writes += 1; }
            else { store.delete(op.path); state.deletes += 1; }
          }
        },
      };
    },
  };
  return { factory: async () => ({ db, close: async () => {} }), store, state };
}

// ---- a synthetic plan of the production size ---------------------------------------------------
function syntheticPlan(size = EXPECTED_PLANNED_DOCUMENTS) {
  return Array.from({ length: size }, (_, index) => {
    const path = `trips/synthetic-${index}`;
    const data = { id: `synthetic-${index}`, ownerUid: 'owner', businessId: 'biz', schemaVersion: 1 };
    return { path, collection: 'trips', docId: `synthetic-${index}`, sourceTable: 'trips',
      sourcePk: [`synthetic-${index}`], sourceKey: `trips#synthetic-${index}`,
      sourceFingerprint: 'src', documentFingerprint: rawDocumentHash(path, data),
      ownerUid: 'owner', businessId: 'biz', estimatedBytes: 64, derived: false, data, columns: [] };
  });
}
const open = (overrides = {}) => openAuthorizedProductionTarget({
  capability: realCapability(), mutationPlan: syntheticPlan(), projectId: 'mydesckpro',
  databaseId: 'default', sourceProject: 'pubugnfaqqukelvgckdr', stage: STAGES.firestoreBulkCopy,
  firestoreFactory: fakeFirestore().factory, ...overrides });

// ============================ capability ========================================================

test('1. an opaque capability is required', async () => {
  await assert.rejects(() => open({ capability: undefined }),
    /AUTHORIZATION_CAPABILITY_NOT_ISSUED_BY_AUTHORIZATION_MODULE/);
});

test('2. a hand-built {authorized:true} is rejected', async () => {
  assert.equal(isIssuedCapability({ authorized: true }), false);
  await assert.rejects(() => open({ capability: { authorized: true } }),
    /AUTHORIZATION_CAPABILITY_NOT_ISSUED_BY_AUTHORIZATION_MODULE/);
});

test('2b. a perfectly shaped forgery is still rejected', async () => {
  const forged = { stage: STAGES.firestoreBulkCopy, firebaseProject: 'mydesckpro',
    firestoreDatabaseId: 'default', supabaseProject: 'pubugnfaqqukelvgckdr',
    approvedPreparationCommit: CONFIG.approvedPreparationCommit, goManifestIntegrityHash: 'x',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  await assert.rejects(() => open({ capability: forged }),
    /AUTHORIZATION_CAPABILITY_NOT_ISSUED_BY_AUTHORIZATION_MODULE/);
});

test('3. wrong project is rejected', async () => {
  await assert.rejects(() => open({ projectId: 'someone-else' }), /CAPABILITY_FIREBASE_PROJECT_MISMATCH/);
});

test('4. wrong database is rejected', async () => {
  await assert.rejects(() => open({ databaseId: '(default)' }), /CAPABILITY_FIRESTORE_DATABASE_MISMATCH/);
});

test('5. wrong stage and wrong source are rejected', async () => {
  await assert.rejects(() => open({ stage: STAGES.authImport }), /CAPABILITY_STAGE_MISMATCH/);
  await assert.rejects(() => open({ sourceProject: 'other' }), /CAPABILITY_SOURCE_PROJECT_MISMATCH/);
});

test('5b. a spread copy of a real capability loses the brand and is rejected', () => {
  const capability = realCapability();
  assert.throws(() => assertCapability({ ...capability }, { projectId: 'mydesckpro', databaseId: 'default',
    sourceProject: 'pubugnfaqqukelvgckdr', stage: STAGES.firestoreBulkCopy }),
  /AUTHORIZATION_CAPABILITY_NOT_ISSUED_BY_AUTHORIZATION_MODULE/,
  'a spread copy is a different object and must not inherit the brand');
});

// ============================ plan and allowlist ================================================

test('6. a plan that is not 1,477 documents is rejected', async () => {
  await assert.rejects(() => open({ mutationPlan: syntheticPlan(1476) }), /PLAN_DOCUMENT_COUNT_MISMATCH/);
  await assert.rejects(() => open({ mutationPlan: syntheticPlan(1478) }), /PLAN_DOCUMENT_COUNT_MISMATCH/);
});

test('7. a duplicate planned path is rejected', () => {
  const plan = syntheticPlan();
  plan[5] = { ...plan[4] };
  assert.throws(() => sealMutationPlan(plan), /PLAN_DUPLICATE_PATH/);
});

test('8. malformed paths are rejected', () => {
  for (const bad of ['', '/trips/x', 'trips/x/', 'trips', 'trips/x/extra', 'trips//x', 'trips/../x']) {
    assert.throws(() => validatePlannedPath(bad), ProductionTargetError, `accepted malformed path: ${bad}`);
  }
  assert.deepEqual(validatePlannedPath('businesses/b1/vehiclePlates/p1').length, 4);
});

test('8b. a proof-namespace path is rejected', () => {
  assert.throws(() => validatePlannedPath('migration_test_v1_trips/x'), /PLAN_PATH_IN_PROOF_NAMESPACE/);
});

test('9. a path outside the allowlist is refused, and nothing is written', async () => {
  const fake = fakeFirestore();
  const target = await open({ firestoreFactory: fake.factory });
  const alien = { path: 'trips/not-planned', data: { a: 1 }, documentFingerprint: 'x' };
  await assert.rejects(() => target.commitPlannedBatch([alien]), /PATH_OUTSIDE_AUTHORIZED_PLAN/);
  assert.equal(fake.state.writes, 0, 'refusal must happen before any write');
});

test('10. data mutated after planning is refused by fingerprint re-check', async () => {
  const plan = syntheticPlan();
  const fake = fakeFirestore();
  const target = await openAuthorizedProductionTarget({ capability: realCapability(), mutationPlan: plan,
    projectId: 'mydesckpro', databaseId: 'default', sourceProject: 'pubugnfaqqukelvgckdr',
    stage: STAGES.firestoreBulkCopy, firestoreFactory: fake.factory });
  // The sealed plan is frozen, so tampering is rejected outright; a look-alike entry is too.
  const lookalike = { ...plan[0], data: { ...plan[0].data, ownerUid: 'attacker' } };
  await assert.rejects(() => target.commitPlannedBatch([lookalike]), /ENTRY_NOT_FROM_SEALED_PLAN/);
  assert.equal(fake.state.writes, 0);
});

test('10a. a fingerprint that does not match its data aborts at commit time', async () => {
  // Planning recorded one fingerprint; the data behind it is different by the time of the commit.
  const plan = syntheticPlan();
  const tampered = plan.map((entry, index) => index !== 7 ? entry
    : { ...entry, data: { ...entry.data, ownerUid: 'changed-after-planning' } });
  const fake = fakeFirestore();
  const target = await openAuthorizedProductionTarget({ capability: realCapability(),
    mutationPlan: tampered, projectId: 'mydesckpro', databaseId: 'default',
    sourceProject: 'pubugnfaqqukelvgckdr', stage: STAGES.firestoreBulkCopy,
    firestoreFactory: fake.factory });
  await assert.rejects(() => target.commitPlannedBatch(tampered.slice(0, 10)),
    /DOCUMENT_FINGERPRINT_MISMATCH/);
  assert.equal(fake.state.writes, 0, 'the whole batch aborts before any write');
});

test('10b. the sealed plan is frozen against mutation', () => {
  const plan = syntheticPlan();
  const sealed = sealMutationPlan(plan);
  assert.throws(() => { sealed.plan[0].data.ownerUid = 'attacker'; }, TypeError);
  assert.equal(Object.isFrozen(sealed.plan), true);
  assert.equal(Object.isFrozen(sealed.plan[0]), true);
  assert.equal(Object.isFrozen(sealed.plan[0].data), true);
});

test('11. a non-empty target is refused before first write', async () => {
  const fake = fakeFirestore({ seed: { 'trips/pre-existing': { a: 1 } } });
  const target = await open({ firestoreFactory: fake.factory });
  await assert.rejects(() => target.assertTargetEmpty(), /TARGET_NOT_EMPTY/);
  assert.equal(fake.state.writes, 0);
});

// ============================ batching and commits ==============================================

test('13/14. every planned path is committed exactly once across the correct batch count', async () => {
  const plan = syntheticPlan();
  const fake = fakeFirestore();
  const target = await openAuthorizedProductionTarget({ capability: realCapability(), mutationPlan: plan,
    projectId: 'mydesckpro', databaseId: 'default', sourceProject: 'pubugnfaqqukelvgckdr',
    stage: STAGES.firestoreBulkCopy, firestoreFactory: fake.factory });
  assert.equal(target.plannedDocuments, EXPECTED_PLANNED_DOCUMENTS);
  const batches = partitionBatches(plan, 100);
  assert.equal(batches.length, 15, '1,477 documents at 100 per batch is 15 batches');
  assert.equal(batches.reduce((sum, batch) => sum + batch.length, 0), EXPECTED_PLANNED_DOCUMENTS);
  for (const batch of batches) await target.commitPlannedBatch(batch);
  assert.equal(target.committedCount, EXPECTED_PLANNED_DOCUMENTS);
  assert.equal(fake.state.writes, EXPECTED_PLANNED_DOCUMENTS);
  assert.equal(new Set(target.committedPaths()).size, EXPECTED_PLANNED_DOCUMENTS, 'no path written twice');
});

test('12b. re-committing an already committed path is refused (idempotent semantics)', async () => {
  const plan = syntheticPlan();
  const fake = fakeFirestore();
  const target = await openAuthorizedProductionTarget({ capability: realCapability(), mutationPlan: plan,
    projectId: 'mydesckpro', databaseId: 'default', sourceProject: 'pubugnfaqqukelvgckdr',
    stage: STAGES.firestoreBulkCopy, firestoreFactory: fake.factory });
  const batch = plan.slice(0, 10);
  await target.commitPlannedBatch(batch);
  await assert.rejects(() => target.commitPlannedBatch(batch), /PATH_ALREADY_COMMITTED/);
});

test('a batch over the Firestore limit is refused', async () => {
  const target = await open();
  await assert.rejects(() => target.commitPlannedBatch(syntheticPlan().slice(0, FIRESTORE_BATCH_LIMIT + 1)),
    /BATCH_EXCEEDS_FIRESTORE_LIMIT/);
});

test('permission and validation failures are never retried; transport faults are', () => {
  assert.equal(isRetryable(Object.assign(new Error('denied'), { code: 7 })), false);
  assert.equal(isRetryable(Object.assign(new Error('invalid'), { code: 3 })), false);
  assert.equal(isRetryable(new ProductionTargetError('DOCUMENT_FINGERPRINT_MISMATCH')), false);
  assert.equal(isRetryable(Object.assign(new Error('unavailable'), { code: 14 })), true);
  assert.equal(isRetryable(Object.assign(new Error('deadline'), { code: 'DEADLINE_EXCEEDED' })), true);
});

test('15/16. a failed batch stops later batches and the journal records only committed paths', async () => {
  const plan = syntheticPlan();
  const fake = fakeFirestore({ failOnBatch: 3 });
  const target = await openAuthorizedProductionTarget({ capability: realCapability(), mutationPlan: plan,
    projectId: 'mydesckpro', databaseId: 'default', sourceProject: 'pubugnfaqqukelvgckdr',
    stage: STAGES.firestoreBulkCopy, firestoreFactory: fake.factory });
  const batches = partitionBatches(plan, 100);
  const journalPath = join(dir, `journal-${Date.now()}.json`);
  const journal = ProductionJournal.create(journalPath, { migrationRunId: 'test-run',
    goManifestIntegrityHash: 'hash', approvedPreparationCommit: CONFIG.approvedPreparationCommit,
    sourceSnapshot: { readOnly: 'on' }, firebaseProject: 'mydesckpro', firestoreDatabaseId: 'default',
    plannedDocumentCount: plan.length, planHash: planHash(plan, sha256),
    batchLayout: batches.map((b, i) => ({ index: i, documents: b.length })) });
  journal.beginWriting();

  let stoppedAt = null;
  for (const [index, batch] of batches.entries()) {
    try {
      const result = await target.commitPlannedBatch(batch);
      journal.recordBatch(index, result.paths);
    } catch (error) {
      journal.recordFailure({ batchIndex: index, code: error.code, message: error.message });
      stoppedAt = index;
      break;
    }
  }
  assert.equal(stoppedAt, 2, 'the third commit fails, so batch index 2 stops the run');
  assert.equal(journal.status, JOURNAL_STATUS.PARTIAL_FAILURE);
  assert.equal(journal.writtenPaths.length, 200, 'only the two successful batches are journalled');
  assert.equal(fake.state.writes, 200, 'no batch after the failure was attempted');
  assert.equal(ProductionJournal.load(journalPath).writtenPaths.length, 200, 'journal survives reload');
});

test('a hand-edited journal fails its integrity check', () => {
  const path = join(dir, `tamper-${Date.now()}.json`);
  const journal = ProductionJournal.create(path, { migrationRunId: 'r', goManifestIntegrityHash: 'h',
    approvedPreparationCommit: CONFIG.approvedPreparationCommit, sourceSnapshot: {},
    firebaseProject: 'mydesckpro', firestoreDatabaseId: 'default', plannedDocumentCount: 1,
    planHash: 'p', batchLayout: [] });
  const body = JSON.parse(readFileSync(journal.path, 'utf8'));
  body.writtenPaths.push('trips/never-written');
  writeFileSync(journal.path, JSON.stringify(body, null, 2));
  assert.throws(() => ProductionJournal.load(journal.path), /JOURNAL_INTEGRITY_HASH_MISMATCH/);
});

// ============================ rollback ==========================================================

test('17/18. rollback deletes only journal-confirmed planned paths', async () => {
  const plan = syntheticPlan();
  const fake = fakeFirestore();
  const target = await openAuthorizedProductionTarget({ capability: realCapability(), mutationPlan: plan,
    projectId: 'mydesckpro', databaseId: 'default', sourceProject: 'pubugnfaqqukelvgckdr',
    stage: STAGES.firestoreBulkCopy, firestoreFactory: fake.factory });
  const written = plan.slice(0, 50);
  await target.commitPlannedBatch(written);
  const confirmed = new Set(written.map((entry) => entry.path));

  // In the plan but never written: refused.
  await assert.rejects(() => target.rollbackJournalPaths([plan[900].path], { journalConfirmed: confirmed }),
    /ROLLBACK_PATH_NOT_IN_JOURNAL/);
  // Outside the plan entirely: refused.
  await assert.rejects(() => target.rollbackJournalPaths(['trips/arbitrary'], { journalConfirmed: new Set(['trips/arbitrary']) }),
    /ROLLBACK_PATH_OUTSIDE_PLAN/);
  // A journal set is mandatory.
  await assert.rejects(() => target.rollbackJournalPaths([written[0].path], {}), /ROLLBACK_JOURNAL_SET_REQUIRED/);

  const result = await target.rollbackJournalPaths(written.map((e) => e.path), { journalConfirmed: confirmed });
  assert.equal(result.deleted, 50);
  assert.equal(fake.state.deletes, 50);
});

test('the target exposes no wildcard or query delete', async () => {
  const target = await open();
  for (const forbidden of ['db', 'doc', 'collection', 'batch', 'deleteCollection', 'query', 'listDocuments']) {
    assert.equal(target[forbidden], undefined, `target must not expose ${forbidden}`);
  }
  assert.deepEqual(Object.keys(target).filter((key) => typeof target[key] === 'function').sort(),
    ['assertTargetEmpty', 'close', 'commitPlannedBatch', 'committedPaths', 'rollbackJournalPaths',
      'verifyPlannedDocument']);
});

// ============================ untouched surfaces ================================================

test('19-22. the target cannot touch Auth, Storage, the source or the backend selector', () => {
  const source = readFileSync('migration/firestore/lib/authorized-production-target.mjs', 'utf8');
  for (const forbidden of ['identitytoolkit', 'firebase-admin/auth', 'getAuth', 'createUser',
    'storage/v1', 'SIGNATURE_BUCKET', 'supabase', 'INSERT ', 'UPDATE ', 'DELETE FROM',
    'registerBackend', 'production-main', 'firebase-main']) {
    assert.ok(!source.includes(forbidden), `production target must not reference ${forbidden}`);
  }
});

test('23. no production mutation path bypasses the authorized target', () => {
  // The executor and rollback command must reach Firestore only through the target abstraction.
  for (const file of ['migration/firestore/tools/production-data-migration.mjs',
    'migration/firestore/tools/production-rollback.mjs']) {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const bypass of ['openTarget(', 'getFirestore(', '.doc(', '.collection(', 'db.batch(',
      'firebase-admin/app']) {
      assert.ok(!source.includes(bypass), `${file} must not use ${bypass} directly`);
    }
  }
});

test('COPY_COMPLETE does not imply BULK_COPY_GO; only RECONCILED does', () => {
  assert.equal(bulkCopyGate({ status: JOURNAL_STATUS.COPY_COMPLETE }).bulkCopyGo, 'NO_GO');
  assert.equal(bulkCopyGate({ status: JOURNAL_STATUS.PARTIAL_FAILURE }).bulkCopyGo, 'NO_GO');
  assert.equal(bulkCopyGate({ status: JOURNAL_STATUS.RECONCILIATION_FAILED }).bulkCopyGo, 'NO_GO');
  assert.equal(bulkCopyGate({ status: JOURNAL_STATUS.RECONCILED }).bulkCopyGo, 'GO');
});
