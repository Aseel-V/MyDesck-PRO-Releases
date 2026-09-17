import { createHash } from 'node:crypto';

export const PROJECT = 'mydesckpro';
export const DATABASE = 'projects/mydesckpro/databases/default';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const REQUIRED_APIS = ['cloudfunctions.googleapis.com', 'run.googleapis.com',
  'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com'];

export function indexShape(index) {
  // Enterprise does not assume an implicit name tie-breaker; deterministic paginated queries declare it.
  // The Firestore Admin API, however, omits the implicit ascending __name__ tie-breaker from its list response,
  // while the configured specs declare it. Comparing the two verbatim made every READY index look MISSING, so the
  // hard-required index gate could never pass no matter what production actually held. Normalise by dropping a
  // TRAILING ascending __name__ from both sides only. A __name__ that is descending, or that is not last, is a
  // genuinely different index shape and is preserved.
  const fields = [...index.fields];
  const last = fields[fields.length - 1];
  if (last && last.fieldPath === '__name__' && (last.order ?? 'ASCENDING') === 'ASCENDING' && !last.arrayConfig) fields.pop();
  return JSON.stringify({ collectionGroup: index.collectionGroup ?? index.name?.split('/collectionGroups/')[1]?.split('/')[0],
    queryScope: index.queryScope, fields: fields.map(({ fieldPath, order, arrayConfig }) => ({ fieldPath, order, arrayConfig })) });
}

/** Classifications a reviewer may assign. REVIEW_REQUIRED is the fail-closed default, not a verdict. */
export const INDEX_CLASSIFICATIONS = Object.freeze(['HARD_REQUIRED_FOR_CORRECTNESS',
  'REQUIRED_FOR_ACCEPTABLE_PERFORMANCE', 'REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE',
  'COST_OPTIMIZATION', 'OPTIONAL', 'NOT_REQUIRED', 'REVIEW_REQUIRED']);

/**
 * Joins every configured index spec to its explicit classification and its live state BY IDENTITY.
 *
 * Classification used to be assigned by array position, so inserting a spec silently re-labelled its
 * neighbours and a spec past the end of the hardcoded list inherited nothing at all. Identity here is the same
 * shape `indexReadiness` matches on, so reordering firestore.indexes.json cannot change what any classification
 * means, and a spec with no reviewed entry is REVIEW_REQUIRED rather than quietly acquiring one.
 *
 * @param {Array} specs         firestore.indexes.json .indexes
 * @param {Array} classified    index-classification.json .classifications
 * @param {Array} readiness     indexReadiness(specs, response) output, in spec order
 */
export function classifyIndexes(specs, classified, readiness = []) {
  const byIdentity = new Map((classified ?? []).map((entry) => [indexShape(entry), entry]));
  const stateByIdentity = new Map((readiness ?? []).map((entry) => [indexShape(entry), entry]));
  const used = new Set();
  const indexes = specs.map((spec) => {
    const identity = indexShape(spec);
    const review = byIdentity.get(identity);
    if (review) used.add(identity);
    const live = stateByIdentity.get(identity);
    const classification = INDEX_CLASSIFICATIONS.includes(review?.classification) ? review.classification : 'REVIEW_REQUIRED';
    const unreviewed = classification === 'REVIEW_REQUIRED';
    return {
      collectionGroup: spec.collectionGroup, queryScope: spec.queryScope, fields: spec.fields,
      query: spec['//'] ?? review?.query ?? null, identity,
      classification,
      // An unreviewed spec never gates: it blocks through `reviewComplete` instead, so a missing review can
      // never be mistaken for a reviewed "not required".
      hardDryRunGate: unreviewed ? false : review.hardDryRunGate === true,
      evidenceState: unreviewed ? 'UNVERIFIED' : (review.evidenceState ?? 'UNVERIFIED'),
      rationale: review?.rationale ?? null,
      operatorAction: review?.operatorAction ?? (unreviewed ? 'Classify this index explicitly in index-classification.json.' : null),
      state: live?.state ?? 'ERROR',
      resource: live?.resource ?? null,
      productionState: live?.productionState ?? null,
    };
  });
  const orphanedReviews = (classified ?? []).filter((entry) => !used.has(indexShape(entry)))
    .map((entry) => ({ collectionGroup: entry.collectionGroup, query: entry.query ?? null }));
  return {
    indexes,
    unreviewed: indexes.filter((item) => item.classification === 'REVIEW_REQUIRED')
      .map((item) => ({ collectionGroup: item.collectionGroup, query: item.query })),
    orphanedReviews,
    reviewComplete: indexes.every((item) => item.classification !== 'REVIEW_REQUIRED'),
    hardRequired: indexes.filter((item) => item.hardDryRunGate).length,
    hardRequiredReady: indexes.filter((item) => item.hardDryRunGate && item.state === 'READY').length,
  };
}
export function indexReadiness(required, response) {
  return required.map(spec => {
    const existing = response.http === 200 ? response.data.indexes.find(i => indexShape(i) === indexShape(spec)) : null;
    const state = response.http !== 200 ? 'ERROR' : !existing ? 'MISSING'
      : existing.state === 'READY' ? 'READY' : existing.state === 'CREATING' ? 'CREATING' : 'ERROR';
    return { collectionGroup: spec.collectionGroup, queryScope: spec.queryScope, fields: spec.fields,
      query: spec['//'], state, resource: existing?.name ?? null, productionState: existing?.state ?? null };
  });
}
export function capabilityBlockers({ billingEnabled, indexes, iam, rules, secret, sparkPlan, quota }) {
  // Review completeness is a property of the specs, not of how many there happen to be. The old check required
  // exactly three, so a fourth spec could never satisfy it and a spec dropped from the list would satisfy it by
  // accident. Every configured spec must carry a reviewed classification; REVIEW_REQUIRED fails closed.
  const reviewedIndexes = indexes.length > 0 && indexes.every(i =>
    INDEX_CLASSIFICATIONS.includes(i.classification) && i.classification !== 'REVIEW_REQUIRED');
  const requiredIndexesReady = reviewedIndexes && indexes.filter(i => i.hardDryRunGate).every(i => i.state === 'READY');
  return [billingEnabled !== false && 'BILLING_MUST_REMAIN_DISABLED', sparkPlan !== 'PASS' && 'SPARK_PLAN',
    !requiredIndexesReady && 'INDEXES', iam !== 'PASS' && 'IAM',
    rules !== 'PASS' && 'RULES', quota !== 'PASS' && 'QUOTA', secret !== 'PASS' && 'SECRET'].filter(Boolean);
}
export function assertSyntheticPreflight(input) {
  if (input.project !== PROJECT || input.database !== DATABASE) throw Error('SYNTHETIC_TARGET_MISMATCH');
  if (input.backend !== 'supabase') throw Error('BACKEND_MUST_REMAIN_SUPABASE');
  if (!/^migration-test--production-readiness-[a-f0-9-]{36}$/.test(input.migrationRunId)) throw Error('SYNTHETIC_RUN_ID_REQUIRED');
  const blockers = capabilityBlockers(input);
  if (blockers.length) throw Error(`SYNTHETIC_CAPABILITY_BLOCKED:${blockers.join(',')}`);
  return true;
}
// Returns an explicit list only. No network/delete implementation is exposed in this phase.
export function cleanupPlan(manifest, actualResources) {
  if (manifest.project !== PROJECT || manifest.database !== DATABASE ||
      !/^migration-test--production-readiness-[a-f0-9-]{36}$/.test(manifest.migrationRunId)) throw Error('CLEANUP_SCOPE_REFUSED');
  if (!Array.isArray(manifest.resources) || !Array.isArray(actualResources)) throw Error('CLEANUP_MANIFEST_REQUIRED');
  const seen = new Set();
  return manifest.resources.map(resource => {
    const actual = actualResources.find(a => a.kind === resource.kind && a.path === resource.path);
    if (!['firestore', 'auth', 'storage'].includes(resource.kind) || seen.has(`${resource.kind}:${resource.path}`)) throw Error('CLEANUP_ENTRY_REFUSED');
    seen.add(`${resource.kind}:${resource.path}`);
    if (!resource.createdByThisRun || resource.migrationRunId !== manifest.migrationRunId ||
      !actual || actual.migrationRunId !== manifest.migrationRunId || actual.creationReceipt !== resource.creationReceipt ||
      !resource.creationReceipt || !resource.path.split('/').some(p => p.startsWith(manifest.migrationRunId + '--')) ||
      /[*?\\]|(^|\/)\.\.?($|\/)|%/i.test(resource.path)) throw Error('CLEANUP_OWNERSHIP_REFUSED');
    if (!resource.version || resource.version !== actual.version) throw Error('CLEANUP_VERSION_CHANGED');
    return { kind: resource.kind, path: resource.path, versionPrecondition: resource.version, migrationRunId: manifest.migrationRunId };
  });
}

export const DB_CONDITION = 'expression=resource.name=="projects/mydesckpro/databases/default" || resource.name.startsWith("projects/mydesckpro/databases/default/documents/"),title=mydesck-default-only';
export const IAM_BINDINGS = Object.freeze({
  // Superseded: mydesck-migration@ holds roles/firebaseauth.admin; combining Auth administration with Firestore
  // data authority is refused. Retained only so the removal command for any legacy grant stays derivable.
  'migration-writer': { member: 'serviceAccount:mydesck-migration@mydesckpro.iam.gserviceaccount.com', role: 'roles/datastore.user', condition: DB_CONDITION },
  'firestore-migration-writer': { member: 'serviceAccount:mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com', role: 'projects/mydesckpro/roles/mydesckFirestoreMigrator', condition: DB_CONDITION },
  'rules-reader': { member: 'serviceAccount:mydesck-rules-reader@mydesckpro.iam.gserviceaccount.com', role: 'roles/firebaserules.viewer', condition: 'None' },
  'index-deployer': { member: 'serviceAccount:mydesck-deployer@mydesckpro.iam.gserviceaccount.com', role: 'roles/datastore.indexAdmin', condition: 'None' },
});
export function iamPlan(id) {
  const binding = IAM_BINDINGS[id];
  if (!binding) throw Error('UNREVIEWED_BINDING_REFUSED');
  const args = ['projects', 'add-iam-policy-binding', PROJECT, `--member=${binding.member}`, `--role=${binding.role}`, `--condition=${binding.condition}`];
  const remove = args.map(a => a === 'add-iam-policy-binding' ? 'remove-iam-policy-binding' : a);
  return { id, binding, args, remove, approvalSha256: hash(JSON.stringify(args)) };
}
export function assertIamApply({ mode = 'plan', approval }, plan) {
  if (!['plan', 'apply'].includes(mode)) throw Error('IAM_MODE_REFUSED');
  if (mode === 'apply' && approval !== plan.approvalSha256) throw Error('EXACT_BINDING_APPROVAL_REQUIRED');
  return mode === 'apply';
}
