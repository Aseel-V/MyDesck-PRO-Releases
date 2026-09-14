import { createHash } from 'node:crypto';

export const PROJECT = 'mydesckpro';
export const DATABASE = 'projects/mydesckpro/databases/default';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const REQUIRED_APIS = ['cloudfunctions.googleapis.com', 'run.googleapis.com',
  'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com'];

function indexShape(index) {
  // Enterprise does not assume an implicit name tie-breaker; deterministic paginated queries declare it.
  const fields = [...index.fields];
  return JSON.stringify({ collectionGroup: index.collectionGroup ?? index.name?.split('/collectionGroups/')[1]?.split('/')[0],
    queryScope: index.queryScope, fields: fields.map(({ fieldPath, order, arrayConfig }) => ({ fieldPath, order, arrayConfig })) });
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
  const reviewedIndexes = indexes.length === 3 && indexes.every(i =>
    ['HARD_REQUIRED_FOR_CORRECTNESS', 'REQUIRED_FOR_ACCEPTABLE_PERFORMANCE',
      'REQUIRED_FOR_ACCEPTABLE_FREE_TIER_USAGE', 'OPTIONAL', 'COST_OPTIMIZATION', 'NOT_REQUIRED'].includes(i.classification));
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
  'migration-writer': { member: 'serviceAccount:mydesck-migration@mydesckpro.iam.gserviceaccount.com', role: 'roles/datastore.user', condition: DB_CONDITION },
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
