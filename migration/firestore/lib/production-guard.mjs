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

/**
 * Source-count drift, measured against a reference.
 *
 * The orchestrator used to call validateCounts with its own constant on both sides, so the comparison was
 * 1444 === 1444 and could not detect drift by construction. This takes the two halves from DIFFERENT origins and
 * refuses to compare them unless both are present and genuinely distinct:
 *
 *   measured  a live read-only source measurement (migration/reports/live-source-inventory.json)
 *   reference the rehearsal the migration is pinned to (firestore-full-import.json .sourceCoverage)
 *
 * An absent measurement is not "no drift", it is no evidence, and fails closed.
 *
 * @returns {{status:'PASS'|'FAIL', reasons:string[], expected:number|null, measured:number|null,
 *            delta:number|null, measuredAt:string|null, referenceOrigin:string|null, measuredOrigin:string|null}}
 */
export function evaluateSourceCountDrift({ measured, reference }) {
  const reasons = [];
  const out = {
    status: 'FAIL', reasons, expected: reference?.rows ?? null, measured: measured?.rows ?? null, delta: null,
    measuredAt: measured?.generatedAt ?? null, referenceOrigin: reference?.origin ?? null,
    measuredOrigin: measured?.origin ?? null, expectedTables: reference?.tables ?? null,
    measuredTables: measured?.tables ?? null,
  };
  if (!measured || typeof measured.rows !== 'number') reasons.push('LIVE_MEASUREMENT_ABSENT');
  if (!reference || typeof reference.rows !== 'number') reasons.push('REFERENCE_ABSENT');
  if (measured && reference && measured.origin && measured.origin === reference.origin) {
    // Both halves coming from one artifact is how the previous check became vacuous.
    reasons.push('MEASUREMENT_AND_REFERENCE_SHARE_ORIGIN');
  }
  if (measured && !measured.readOnlyProven) reasons.push('LIVE_MEASUREMENT_NOT_READ_ONLY_PROVEN');
  if (reasons.length) return out;

  out.delta = measured.rows - reference.rows;
  if (out.delta !== 0) reasons.push(`SOURCE_ROW_DRIFT:expected ${reference.rows}, measured ${measured.rows}, delta ${out.delta}`);
  if (typeof measured.tables === 'number' && typeof reference.tables === 'number' && measured.tables !== reference.tables) {
    reasons.push(`SOURCE_TABLE_DRIFT:expected ${reference.tables}, measured ${measured.tables}`);
  }
  out.status = reasons.length ? 'FAIL' : 'PASS';
  return out;
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
  // Architecture blockers. Nothing downstream is meaningful until these hold.
  HYBRID_STORAGE_AUTH_GO: ['hybridStorageAuth', 'supabaseRoleClaim', 'storageRlsAudit',
    'storageTenantIsolation', 'storageAnonymousDenied'],
  STORAGE_ISOLATION_GO: ['storageIsolation'],
  // Signature privacy is its own gate: the exposure is a live production issue that exists
  // independently of whether the hybrid architecture is ever adopted.
  SIGNATURE_PRIVACY_GO: ['signaturePrivateBucketExists', 'signatureNotPubliclyReadable',
    'signatureRestrictivePolicy', 'signaturesNeverPublicInCode'],
  RESTAURANT_STAFF_AUTH_MODEL_GO: ['restaurantStaffInventory', 'restaurantStaffIdentityModel',
    'restaurantStaffRules', 'authenticateStaffReplaced'],
  // Product work. Only begins once the three blockers above are GO.
  PRODUCT_PARITY_GO: ['environment', 'sparkPlan', 'auth', 'activeProductParity',
    'supabaseDatabaseRuntimeZero', 'rules', 'ruleAccessBudget', 'maliciousClient',
    'criticalTransactions', 'search', 'analytics', 'arabic', 'hebrew', 'english', 'electron',
    'quota', 'noFunctions', 'noStorage', 'bulkData', 'delta', 'financial', 'relationships',
    'events'],
  DRY_RUN_GO: ['iam', 'indexes', 'realClientSmoke', 'secret', 'writeFreeze', 'rollback',
    'observability', 'backendSwitch'],
  BULK_COPY_GO: ['productionSourceSnapshot', 'productionReconciliation'],
  CUTOVER_GO: ['productionAuthImport', 'finalDelta', 'finalReconciliation'],
  POST_CUTOVER_HEALTHY: ['productionSmoke', 'postCutoverFinancialCheck', 'rollbackJournal'],
});

/**
 * Which stages each stage depends on.
 *
 * The three architecture blockers are peers, not a chain: Storage isolation is a property of
 * the code, staff identity is unrelated to Storage, and neither waits on third-party auth.
 * Chaining them would hide a gate that genuinely passes behind an unrelated failure. Everything
 * from PRODUCT_PARITY_GO onward does depend on all three, and on its own predecessors.
 */
const STAGE_DEPENDENCIES = Object.freeze({
  HYBRID_STORAGE_AUTH_GO: [],
  STORAGE_ISOLATION_GO: [],
  SIGNATURE_PRIVACY_GO: [],
  RESTAURANT_STAFF_AUTH_MODEL_GO: [],
  PRODUCT_PARITY_GO: ['HYBRID_STORAGE_AUTH_GO', 'STORAGE_ISOLATION_GO', 'SIGNATURE_PRIVACY_GO',
    'RESTAURANT_STAFF_AUTH_MODEL_GO'],
  DRY_RUN_GO: ['PRODUCT_PARITY_GO'],
  BULK_COPY_GO: ['DRY_RUN_GO'],
  CUTOVER_GO: ['BULK_COPY_GO'],
  POST_CUTOVER_HEALTHY: ['CUTOVER_GO'],
});

const STAGE_ORDER = Object.keys(STAGE_DEPENDENCIES);

export function evaluateStagedGo(evidence) {
  const stages = {};
  const resolved = {};
  const gatesFor = (stage) => {
    if (resolved[stage]) return resolved[stage];
    const inherited = STAGE_DEPENDENCIES[stage].flatMap(gatesFor);
    resolved[stage] = [...new Set([...inherited, ...STAGE_GATES[stage]])];
    return resolved[stage];
  };
  for (const stage of STAGE_ORDER) {
    const owned = STAGE_GATES[stage];
    const names = gatesFor(stage);
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
      dependsOn: STAGE_DEPENDENCIES[stage],
    };
  }
  return stages;
}
