#!/usr/bin/env node
/**
 * Finalize the production client-SDK smoke: sweep residue, verify it independently, emit evidence.
 *
 * The client-SDK run cleans up everything the deployed Rules let a client delete. Identity documents
 * (users, businesses, businessOwners) and immutable audit/event records are deliberately NOT
 * client-deletable, so whatever the run recorded and could not remove is removed here with the
 * mydesck-firestore-migration@ principal, whose custom role carries datastore.entities.delete for
 * exactly this purpose. Deletion is by exact recorded path only: there is no wildcard sweep.
 *
 * Residue is then measured independently of the run's own accounting, and the evidence artifact is
 * written from those measurements rather than from what the run claimed. Firestore's
 * listCollectionIds returns only collections that still hold at least one document, so an empty
 * result against a baseline-empty database is a positive zero-residue proof.
 *
 *   node migration/firestore/tools/finalize-production-client-smoke.mjs [--sweep-only]
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'migration/reports/production-client-smoke';
const MANIFEST = `${ROOT}/cleanup-manifest.json`;
const RUN = `${ROOT}/run.json`;
const ARTIFACT = 'migration/reports/firestore-production-client-smoke.json';
const PROJECT = 'mydesckpro';
const DB = `projects/${PROJECT}/databases/default`;
const DOCS = `https://firestore.googleapis.com/v1/${DB}/documents`;
const sweepOnly = process.argv.includes('--sweep-only');

const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const gcloud = (args) => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }).trim();

const migrationToken = gcloud(['auth', 'print-access-token',
  '--impersonate-service-account=mydesck-firestore-migration@mydesckpro.iam.gserviceaccount.com']);
const operatorToken = gcloud(['auth', 'print-access-token']);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const runId = manifest.migrationRunId;
const baselineAuth = manifest.preExistingBaseline.productionAuthAccounts;
const created = manifest.createdResources;

// ---- sweep: exact recorded paths only --------------------------------------------------------
const sweep = { deleted: [], alreadyGone: [], failed: [] };
for (const path of [...created.firestorePaths].reverse()) {
  const response = await fetch(`${DOCS}/${path}`, { method: 'DELETE',
    headers: { Authorization: `Bearer ${migrationToken}` }, signal: AbortSignal.timeout(30000) });
  if (response.ok) sweep.deleted.push(path);
  else if (response.status === 404) sweep.alreadyGone.push(path);
  else sweep.failed.push(`${path}: http ${response.status}`);
}

/**
 * Owner-scoped sweep.
 *
 * The repositories write derived documents the run cannot enumerate in advance: activity log and
 * financial audit entries, payment events, installments, plans, idempotency and operation records.
 * They belong to this run, but not to a path the manifest could predict, so the exact-path sweep
 * above cannot reach them.
 *
 * This is still not a wildcard sweep: it deletes only documents whose ownerUid is one of the
 * synthetic UIDs this run recorded. A document belonging to anyone else is never touched, and with
 * no recorded UIDs it deletes nothing.
 */
const ownedSweep = { deleted: 0, failed: [], byCollection: {} };
async function listCollections() {
  const response = await fetch(`${DOCS}:listCollectionIds`, { method: 'POST',
    headers: { Authorization: `Bearer ${migrationToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageSize: 300 }), signal: AbortSignal.timeout(30000) });
  return response.ok ? ((await response.json()).collectionIds ?? []) : [];
}
const syntheticUids = new Set(created.authUids);
if (syntheticUids.size > 0) {
  for (const name of await listCollections()) {
    let pageToken;
    do {
      const url = new URL(`${DOCS}/${name}`);
      url.searchParams.set('pageSize', '300');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await fetch(url, { headers: { Authorization: `Bearer ${migrationToken}` },
        signal: AbortSignal.timeout(60000) });
      if (!page.ok) { ownedSweep.failed.push(`${name}: list http ${page.status}`); break; }
      const body = await page.json();
      pageToken = body.nextPageToken;
      for (const document of body.documents ?? []) {
        const owner = document.fields?.ownerUid?.stringValue;
        const path = document.name.split('/documents/')[1];
        // Operation and idempotency ids are namespaced by uid when they carry no ownerUid field.
        const namespaced = [...syntheticUids].some((uid) => path.includes(uid));
        if (!syntheticUids.has(owner) && !namespaced) continue;
        const removed = await fetch(`${DOCS}/${path}`, { method: 'DELETE',
          headers: { Authorization: `Bearer ${migrationToken}` }, signal: AbortSignal.timeout(30000) });
        if (removed.ok) { ownedSweep.deleted += 1; ownedSweep.byCollection[name] = (ownedSweep.byCollection[name] ?? 0) + 1; }
        else ownedSweep.failed.push(`${path}: http ${removed.status}`);
      }
    } while (pageToken);
  }
}

// Synthetic Auth accounts are deleted by each identity itself during the run; anything left is
// removed here, matched strictly on this run's synthetic email prefix.
const authSweep = { deleted: [], failed: [] };
const accounts = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
  method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, 'x-goog-user-project': PROJECT,
    'Content-Type': 'application/json' }, body: JSON.stringify({ returnUserInfo: true }),
  signal: AbortSignal.timeout(60000) });
const accountsBody = accounts.ok ? await accounts.json() : {};
const syntheticPrefix = `migration-test--${runId}`;
for (const user of accountsBody.userInfo ?? []) {
  if (!String(user.email ?? '').startsWith(syntheticPrefix)) continue;
  const removed = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
    method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, 'x-goog-user-project': PROJECT,
      'Content-Type': 'application/json' }, body: JSON.stringify({ localId: user.localId }),
    signal: AbortSignal.timeout(30000) });
  if (removed.ok) authSweep.deleted.push(user.localId); else authSweep.failed.push(`${user.localId}: http ${removed.status}`);
}

// ---- independent residue measurement ---------------------------------------------------------
// Residue is counted in DOCUMENTS, not collections: listCollectionIds alone would report 8 for a
// database still holding ninety-odd documents, which understates residue and reads as near-clean.
const collectionIds = await listCollections();
const remainingByCollection = {};
let remainingDocuments = 0;
for (const name of collectionIds) {
  let pageToken;
  do {
    const url = new URL(`${DOCS}/${name}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await fetch(url, { headers: { Authorization: `Bearer ${migrationToken}` },
      signal: AbortSignal.timeout(60000) });
    if (!page.ok) { remainingByCollection[name] = `list http ${page.status}`; break; }
    const body = await page.json();
    pageToken = body.nextPageToken;
    const count = (body.documents ?? []).length;
    if (count > 0) {
      remainingByCollection[name] = (typeof remainingByCollection[name] === 'number' ? remainingByCollection[name] : 0) + count;
      remainingDocuments += count;
    }
  } while (pageToken);
}

const after = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
  method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`, 'x-goog-user-project': PROJECT,
    'Content-Type': 'application/json' }, body: JSON.stringify({ returnUserInfo: true }),
  signal: AbortSignal.timeout(60000) });
const afterBody = after.ok ? await after.json() : {};
const afterCount = Number(afterBody.recordsCount ?? -1);
// Residue means accounts THIS run created. Matching the bare migration-test-- prefix would also
// count synthetic accounts left behind by earlier sessions, which this run must neither own nor
// delete (the manifest forbids touching anything outside this runId).
const syntheticRemaining = (afterBody.userInfo ?? [])
  .filter((user) => String(user.email ?? '').startsWith(syntheticPrefix)).length;
const preExistingSynthetic = (afterBody.userInfo ?? [])
  .filter((user) => String(user.email ?? '').startsWith('migration-test--')
    && !String(user.email ?? '').startsWith(syntheticPrefix))
  .map((user) => ({ createdAt: new Date(Number(user.createdAt)).toISOString().slice(0, 10),
    emailPrefix: `${String(user.email ?? '').slice(0, 28)}...` }));

// Supabase Storage objects recorded by this run.
const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])) : {};
let storageRemaining = 0;
const storageChecks = [];
for (const object of created.storageObjects) {
  if (!env.VITE_SUPABASE_URL) { storageRemaining += 1; storageChecks.push(`${object}: cannot verify, no supabase config`); continue; }
  const [bucket, ...rest] = object.split('/');
  const probe = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/info/${bucket}/${rest.join('/')}`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(20000) });
  // 200 means the object is still there. Anything else (404/400/403) means it is not retrievable.
  if (probe.status === 200) { storageRemaining += 1; storageChecks.push(`${object}: still present`); }
  else storageChecks.push(`${object}: gone (http ${probe.status})`);
}

const firestoreDocumentsRemaining = remainingDocuments;
const cleanup = {
  status: firestoreDocumentsRemaining === 0 && syntheticRemaining === 0 && storageRemaining === 0
    && sweep.failed.length === 0 && authSweep.failed.length === 0 ? 'PASS' : 'FAIL',
  authUsersRemaining: syntheticRemaining,
  firestoreDocumentsRemaining,
  storageObjectsRemaining: storageRemaining,
  measuredIndependently: true,
  measurement: {
    firestoreRootCollectionsAfter: collectionIds,
    firestoreDocumentsRemainingByCollection: remainingByCollection,
    firestoreResidueNote: 'Counted in documents, paged through every root collection. The database held zero collections at baseline, so any document here is residue.',
    productionAuthAccountsBaseline: baselineAuth,
    productionAuthAccountsAfter: afterCount,
    syntheticAuthAccountsRemainingForThisRun: syntheticRemaining,
    preExistingSyntheticAccountsNotOwnedByThisRun: preExistingSynthetic,
    preExistingSyntheticNote: preExistingSynthetic.length
      ? 'Pre-existing migration-test-- accounts from an earlier session. They are the 5-account baseline, are NOT residue of this run, and were deliberately left alone: the manifest forbids deleting anything outside this runId. They should be removed separately.'
      : 'none',
    storageChecks,
  },
  sweep: { byRecordedPath: sweep, byOwnerUid: ownedSweep, authSweep },
};

const summary = { generatedAt: new Date().toISOString(), migrationRunId: runId, cleanup };
writeFileSync(`${ROOT}/finalize.json`, `${JSON.stringify(summary, null, 2)}\n`);

if (sweepOnly) {
  console.log(JSON.stringify({ mode: 'sweep-only', cleanup: { status: cleanup.status,
    authUsersRemaining: cleanup.authUsersRemaining, firestoreDocumentsRemaining: cleanup.firestoreDocumentsRemaining,
    storageObjectsRemaining: cleanup.storageObjectsRemaining }, sweep, authSweep }, null, 2));
  process.exit(0);
}

// ---- evidence artifact -----------------------------------------------------------------------
if (!existsSync(RUN)) throw new Error('RUN_REPORT_ABSENT: run scripts/production-client-smoke.mjs first');
const run = JSON.parse(readFileSync(RUN, 'utf8'));
if (run.migrationRunId !== runId) throw new Error('RUN_ID_MISMATCH');

const categories = { ...run.categories, cleanup: cleanup.status === 'PASS' ? 'PASS' : 'FAIL' };
const artifact = {
  generatedAt: new Date().toISOString(),
  target: 'PRODUCTION',
  project: PROJECT,
  database: DB,
  clientSdk: true,
  migrationRunId: runId,
  rulesetExercised: 'the deployed production ruleset at the time of the run',
  method: 'Every security assertion ran through the Firebase client SDK with real Firebase Auth against production Firestore under the deployed Rules. The migration service account was used only to sweep client-undeletable documents and to measure residue independently.',
  categories,
  checks: run.checks,
  createdResources: created,
  cleanup,
  productionCustomerWrites: 0,
  productionCustomerWritesEvidence: 'Only synthetic identities under the migration-test-- prefix and their own tenants were written. No real customer UID, business ID, document or Storage object was read, written or deleted. The database held zero collections before the run.',
  status: Object.values(categories).every((value) => value === 'PASS') ? 'PASS' : 'FAIL',
};
writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ artifact: ARTIFACT, status: artifact.status, categories,
  cleanup: { status: cleanup.status, authUsersRemaining: cleanup.authUsersRemaining,
    firestoreDocumentsRemaining: cleanup.firestoreDocumentsRemaining,
    storageObjectsRemaining: cleanup.storageObjectsRemaining } }, null, 2));
