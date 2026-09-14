import { createHash } from 'node:crypto';

export const EXPECTED = Object.freeze({
  firebaseProject: 'mydesckpro',
  firestoreDatabaseId: 'default',
  supabaseProject: 'pubugnfaqqukelvgckdr',
  schemaVersion: 1,
  transformVersion: '1.full.1',
});

export const PRODUCTION_ACK = 'I_ACKNOWLEDGE_MYDESCK_FIRESTORE_PRODUCTION_COPY';
export const WRITING_MODES = new Set(['production-copy', 'final-delta']);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertMode(mode, allowed, acknowledgement) {
  if (!allowed.includes(mode)) throw new Error('UNSUPPORTED_MIGRATION_MODE');
  if (WRITING_MODES.has(mode) && acknowledgement !== PRODUCTION_ACK) {
    throw new Error('PRODUCTION_ACKNOWLEDGEMENT_REQUIRED');
  }
}

export function validateIdentity(actual, approved) {
  const failures = [];
  const check = (name, value, expected) => {
    if (value !== expected) failures.push(`${name}_MISMATCH`);
  };
  check('FIREBASE_PROJECT', actual.firebaseProject, EXPECTED.firebaseProject);
  check('FIRESTORE_DATABASE', actual.firestoreDatabaseId, EXPECTED.firestoreDatabaseId);
  check('SUPABASE_PROJECT', actual.supabaseProject, EXPECTED.supabaseProject);
  check('SCHEMA_VERSION', actual.schemaVersion, EXPECTED.schemaVersion);
  check('TRANSFORM_VERSION', actual.transformVersion, EXPECTED.transformVersion);
  check('RULES_HASH', actual.rulesHash, approved.rulesHash);
  check('EXECUTABLE_COMMIT', actual.commitSha, approved.commitSha);
  return failures;
}

export function validateLedgerResume(entries, { migrationRunId, transformVersion }) {
  const keys = new Set();
  for (const entry of entries) {
    if (keys.has(entry.key)) throw new Error('DUPLICATE_LEDGER_ENTITY');
    keys.add(entry.key);
    if (entry.migrationRunId !== migrationRunId) throw new Error('LEDGER_RUN_ID_MISMATCH');
    if (entry.transformVersion !== transformVersion) throw new Error('LEDGER_TRANSFORM_MISMATCH');
    if (entry.state === 'VERIFIED' && entry.sourceHash !== entry.targetHash) {
      throw new Error('VERIFIED_LEDGER_HASH_MISMATCH');
    }
  }
  return true;
}

export function assertReadOnlySource(source) {
  if (source.readOnly !== true || source.isolationLevel?.toLowerCase() !== 'repeatable read'
      || source.writeAttemptRejected !== true) throw new Error('SOURCE_READ_ONLY_PROOF_REQUIRED');
}

export function assertSafeTriggers(triggers) {
  const allowed = new Set(['SAFE_DURING_BULK_MIGRATION', 'DISABLE_DURING_MIGRATION',
    'IGNORE_MIGRATION_WRITES', 'ENABLE_ONLY_AFTER_CUTOVER']);
  if (!triggers.length || triggers.some((item) => !allowed.has(item.migrationSafety))) {
    throw new Error('UNSAFE_ACTIVE_FIRESTORE_TRIGGER');
  }
}

export function assertNoSilentFallback(result) {
  if (result.primary === 'firestore' && result.fallbackAttempted) throw new Error('SILENT_SUPABASE_FALLBACK');
  return result;
}

export function evaluateGo(evidence) {
  // `activeSupabase` measures the Firebase-mode composition root only. `activeProductParity`
  // measures the root the selector actually ships, so the engine cannot return GO for a
  // cutover that would drop product surfaces still served by Supabase.
  const required = ['environment', 'sparkPlan', 'auth', 'iam', 'rules', 'indexes', 'quota',
    'noFunctions', 'noStorage', 'criticalTransactions', 'ruleAccessBudget', 'maliciousClient',
    'realClientSmoke', 'bulkData', 'delta', 'financial', 'relationships', 'events', 'search',
    'arabic', 'hebrew', 'english', 'electron', 'activeSupabase', 'activeProductParity', 'secret',
    'writeFreeze', 'rollback', 'observability', 'backendSwitch'];
  const gates = required.map((name) => ({ name, status: evidence[name]?.status ?? 'MISSING',
    evidence: evidence[name]?.evidence ?? null }));
  const fail = gates.filter((gate) => gate.status !== 'PASS');
  return { gates, pass: gates.length - fail.length, fail: fail.filter((x) => x.status === 'FAIL').length,
    notRun: fail.filter((x) => x.status === 'NOT_RUN').length,
    missing: fail.filter((x) => x.status === 'MISSING').length,
    decision: fail.length ? 'NO_GO' : 'GO', blockers: fail.map((x) => x.name) };
}

export function validateCounts(actual, expected) {
  if (actual.authUsers !== expected.authUsers) throw new Error('UNEXPECTED_AUTH_COUNT');
  if (actual.sourceRows !== expected.sourceRows) throw new Error('UNEXPECTED_SOURCE_ROW_COUNT');
}

export function validateAuthCollisions(sourceUsers, targetUsers) {
  const targetUids = new Set(targetUsers.map((user) => user.uid));
  const targetEmails = new Map(targetUsers.filter((user) => user.emailNormalized)
    .map((user) => [user.emailNormalized, user.uid]));
  const collisions = [];
  for (const user of sourceUsers) {
    if (targetUids.has(user.uid)) collisions.push({ type: 'DUPLICATE_TARGET_UID', uid: user.uid });
    const owner = user.emailNormalized ? targetEmails.get(user.emailNormalized) : null;
    if (owner && owner !== user.uid) collisions.push({ type: 'DUPLICATE_TARGET_EMAIL', uid: user.uid });
  }
  return collisions;
}

export function assertControlEvidence(evidence) {
  for (const key of ['writeFreeze', 'rollback', 'storageDelta']) {
    if (evidence[key] !== 'READY') throw new Error(`MISSING_${key.toUpperCase()}_EVIDENCE`);
  }
}

export function reserveRunId(runId, existingIds) {
  if (!runId || existingIds.has(runId)) throw new Error('DUPLICATE_MIGRATION_RUN_ID');
  existingIds.add(runId);
  return runId;
}

/**
 * Staged release decisions.
 *
 * A PASS at one stage never implies the next. Each stage evaluates the gates it owns plus
 * every gate its predecessors owned, so a later stage cannot go green over an earlier
 * regression. Missing evidence is MISSING, never an implicit PASS.
 *
 * Supabase Storage is an intentional production dependency and is therefore NOT a parity
 * blocker. Supabase database, RPC, Auth and database realtime remain forbidden at runtime.
 */
export const STAGE_GATES = Object.freeze({
  PRODUCT_PARITY_GO: ['environment', 'sparkPlan', 'auth', 'activeProductParity',
    'supabaseDatabaseRuntimeZero', 'storageIsolation', 'rules', 'ruleAccessBudget',
    'maliciousClient', 'criticalTransactions', 'search', 'analytics', 'arabic', 'hebrew',
    'english', 'electron', 'quota', 'noFunctions', 'noStorage', 'bulkData', 'delta',
    'financial', 'relationships', 'events'],
  HYBRID_STORAGE_GO: ['hybridStorageAuth', 'storageIsolation', 'storageTenantIsolation',
    'storageAnonymousDenied'],
  DRY_RUN_GO: ['iam', 'indexes', 'realClientSmoke', 'secret', 'writeFreeze', 'rollback',
    'observability', 'backendSwitch'],
  BULK_COPY_GO: ['productionSourceSnapshot', 'productionReconciliation'],
  CUTOVER_GO: ['productionAuthImport', 'finalDelta', 'finalReconciliation'],
  POST_CUTOVER_HEALTHY: ['productionSmoke', 'postCutoverFinancialCheck', 'rollbackJournal'],
});

const STAGE_ORDER = ['PRODUCT_PARITY_GO', 'HYBRID_STORAGE_GO', 'DRY_RUN_GO', 'BULK_COPY_GO',
  'CUTOVER_GO', 'POST_CUTOVER_HEALTHY'];

export function evaluateStagedGo(evidence) {
  const stages = {};
  let inherited = [];
  for (const stage of STAGE_ORDER) {
    const owned = STAGE_GATES[stage];
    const names = [...new Set([...inherited, ...owned])];
    const gates = names.map((name) => ({ name, status: evidence[name]?.status ?? 'MISSING' }));
    const unmet = gates.filter((gate) => gate.status !== 'PASS');
    stages[stage] = {
      ownedGates: owned.length,
      evaluatedGates: gates.length,
      pass: gates.length - unmet.length,
      fail: unmet.filter((gate) => gate.status === 'FAIL').length,
      notRun: unmet.filter((gate) => gate.status === 'NOT_RUN').length,
      missing: unmet.filter((gate) => gate.status === 'MISSING').length,
      decision: unmet.length ? 'NO_GO' : 'GO',
      blockers: unmet.map((gate) => gate.name + ':' + gate.status),
    };
    inherited = names;
  }
  return stages;
}
