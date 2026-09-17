/**
 * Real production client-SDK smoke evidence.
 *
 * The dry-run's realClientSmoke gate used to be a hardcoded NOT_RUN, so a genuine production run could never
 * close it and a passing emulator run could never be mistaken for one either. This module replaces the constant
 * with a validator, and the validator is deliberately strict: an artifact closes the gate only when it proves it
 * ran the Firebase CLIENT SDK against the real project, and anything else -- missing, malformed, stale-shaped,
 * emulator-targeted, wrong project -- is NOT_RUN.
 *
 * The client SDK matters specifically because it is subject to Security Rules. Admin-SDK evidence bypasses Rules
 * and therefore proves nothing about them, so `clientSdk: true` is required rather than assumed.
 */

export const PRODUCTION_PROJECT = 'mydesckpro';

/** Categories a production smoke must report on. A missing or non-PASS category leaves the gate closed. */
export const REQUIRED_CATEGORIES = Object.freeze([
  'auth', 'tourism', 'restaurant', 'supermarket', 'autoRepair', 'carParts',
  'maliciousClient', 'financial', 'hybridStorage', 'cleanup',
]);

const PASSING = new Set(['PASS', 'DENIED']);

/**
 * @param {unknown} artifact parsed migration/reports/firestore-production-client-smoke.json, or null when absent
 * @returns {{status:'PASS'|'NOT_RUN'|'FAIL', reasons:string[], evidence:object}}
 */
export function evaluateProductionClientSmoke(artifact) {
  const reasons = [];
  const evidence = { present: Boolean(artifact), target: null, project: null, generatedAt: null,
    categories: null, cleanup: null, productionCustomerWrites: null };

  if (!artifact || typeof artifact !== 'object') {
    return { status: 'NOT_RUN', reasons: ['ARTIFACT_ABSENT'], evidence };
  }

  evidence.target = artifact.target ?? null;
  evidence.project = artifact.project ?? null;
  evidence.generatedAt = artifact.generatedAt ?? null;
  evidence.cleanup = artifact.cleanup ?? null;
  evidence.productionCustomerWrites = artifact.productionCustomerWrites ?? null;

  // An emulator run is legitimate evidence of its own kind and is never production evidence.
  if (artifact.target !== 'PRODUCTION') reasons.push(`TARGET_NOT_PRODUCTION:${artifact.target ?? 'ABSENT'}`);
  if (artifact.project !== PRODUCTION_PROJECT) reasons.push(`PROJECT_NOT_${PRODUCTION_PROJECT}:${artifact.project ?? 'ABSENT'}`);
  if (artifact.clientSdk !== true) reasons.push('NOT_CLIENT_SDK');
  if (typeof artifact.generatedAt !== 'string' || Number.isNaN(Date.parse(artifact.generatedAt))) reasons.push('TIMESTAMP_INVALID');
  if (typeof artifact.migrationRunId !== 'string' || !artifact.migrationRunId) reasons.push('RUN_ID_ABSENT');

  const categories = artifact.categories;
  if (!categories || typeof categories !== 'object') {
    reasons.push('CATEGORIES_ABSENT');
  } else {
    evidence.categories = Object.fromEntries(REQUIRED_CATEGORIES.map((name) => [name, categories[name] ?? null]));
    for (const name of REQUIRED_CATEGORIES) {
      const value = categories[name];
      if (value === undefined || value === null) reasons.push(`CATEGORY_MISSING:${name}`);
      else if (!PASSING.has(value)) reasons.push(`CATEGORY_NOT_PASSING:${name}:${value}`);
    }
  }

  // Cleanup has to prove zero residue, not merely claim it ran.
  const cleanup = artifact.cleanup;
  if (!cleanup || typeof cleanup !== 'object') reasons.push('CLEANUP_ABSENT');
  else {
    if (cleanup.status !== 'PASS') reasons.push(`CLEANUP_NOT_PASS:${cleanup.status ?? 'ABSENT'}`);
    for (const field of ['authUsersRemaining', 'firestoreDocumentsRemaining', 'storageObjectsRemaining']) {
      if (cleanup[field] !== 0) reasons.push(`CLEANUP_RESIDUE:${field}:${cleanup[field] ?? 'ABSENT'}`);
    }
  }

  if (artifact.productionCustomerWrites !== 0) {
    reasons.push(`CUSTOMER_WRITES:${artifact.productionCustomerWrites ?? 'ABSENT'}`);
  }

  if (artifact.status === 'FAIL') return { status: 'FAIL', reasons: ['REPORTED_FAIL', ...reasons], evidence };
  if (reasons.length) return { status: 'NOT_RUN', reasons, evidence };
  if (artifact.status !== 'PASS') return { status: 'NOT_RUN', reasons: [`STATUS_NOT_PASS:${artifact.status ?? 'ABSENT'}`], evidence };
  return { status: 'PASS', reasons: [], evidence };
}
