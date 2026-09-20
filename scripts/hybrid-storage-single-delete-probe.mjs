/**
 * Minimal production probe: single-object authenticated DELETE.
 *
 * `.remove()` in storage-js posts to the BATCH route and was the path that hit the uuid cast:
 *   remove(paths) -> DELETE `${url}/object/${bucketId}`  body { prefixes: [...] }   (index.mjs:1018)
 *
 * The single-object route is the one upload and head already use, with the bucket embedded in the
 * path rather than in the body:
 *   _getFinalPath(path) -> `${bucketId}/${path}`                                    (index.mjs:1146)
 *   upload  -> POST/PUT `${url}/object/${finalPath}`                                (index.mjs:348)
 *   head    -> HEAD     `${url}/object/${finalPath}`                                (index.mjs:912)
 *   storageUrl = new URL('storage/v1', supabaseUrl)                    (supabase-js index.mjs:204)
 *
 * so the endpoint derived from the installed implementation, not guessed, is:
 *   DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{uid}/{file}
 *
 * The upload still goes through the real StorageRepository/auth bridge. Only the delete is issued
 * directly, because that is what this probe is testing. No RLS change, no service-role key, no
 * bucket setting touched, and the token is never printed.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase/app';
import { inMemoryPersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { bindStorageIdentity } from '../src/data/storageIdentity.ts';
import { getStorageBackend, resetStorageBackendForTests } from '../src/data/supabaseStorageClient.ts';
import { SIGNATURE_BUCKET } from '../src/data/SupabaseStorageRepository.ts';

for (const forbidden of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  assert.equal(process.env[forbidden], undefined, `${forbidden} must be unset: this targets PRODUCTION`);
}
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
import.meta.env = { ...(import.meta.env ?? {}), VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY };

const ROOT = 'migration/reports/hybrid-storage-identity';
mkdirSync(ROOT, { recursive: true });
const runId = `single-del-${Date.now().toString(36)}`;
const email = `migration-test--${runId}-owner@example.com`;
const password = `Hybrid-${runId}-9!`;
const options = { projectId: 'mydesckpro', apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN };

// Manifest before any resource exists.
const MANIFEST = `${ROOT}/single-delete-manifest.json`;
writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), migrationRunId: runId,
  target: 'PRODUCTION', plannedAuthIdentity: email,
  plannedStorageObject: `${SIGNATURE_BUCKET}/{ownerUid}/migration-test--${runId}.png`,
  createdResources: { authUids: [], storageObjects: [] },
  status: 'MANIFEST_WRITTEN_NO_RESOURCES_CREATED_YET' }, null, 2)}\n`);
const record = (kind, value) => {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  m.createdResources[kind].push(value); m.status = 'RESOURCES_CREATED';
  writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
};

const app = initializeApp(options, `single-del-${runId}`);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
const db = getFirestore(app, 'default');
const gateway = new FirestoreAuthGateway(new FirebaseSession({ mode: 'firestore', app, auth, db,
  ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity: () => ({ auth, db, dispose: () => {} }) }));

const out = { runId, routeType: null, upload: null, delete: null, verifyGone: null, ownerList: null,
  uuidErrorPresent: false, authResidue: null, storageResidue: null };
const errors = [];
try {
  const user = await gateway.signUp(email, password);
  record('authUids', user.id);
  execFileSync(process.execPath, ['migration/firestore/tools/supabase-role-claim.mjs', '--mode=apply'], { encoding: 'utf8' });
  const token = await auth.currentUser.getIdToken(true); // forced refresh so the claim is carried
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  out.tokenMetadata = { iss: claims.iss, aud: claims.aud, hasRoleAuthenticated: claims.role === 'authenticated',
    subFingerprint: createHash('sha256').update(String(claims.sub)).digest('hex').slice(0, 12) };

  const objectPath = `${user.id}/migration-test--${runId}.png`;
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

  // Upload through the real repository/auth bridge.
  resetStorageBackendForTests();
  bindStorageIdentity(() => gateway.getAccessToken(), () => user.id);
  const storage = getStorageBackend();
  const up = await storage.from(SIGNATURE_BUCKET).upload(objectPath, new Blob([PNG], { type: 'image/png' }),
    { upsert: false, contentType: 'image/png', cacheControl: '0' });
  if (!up.error) record('storageObjects', `${SIGNATURE_BUCKET}/${objectPath}`);
  out.upload = { ok: !up.error, error: up.error?.message ?? null };
  if (up.error) errors.push(up.error.message);
  assert.ok(!up.error, `upload must succeed before the delete can be tested: ${up.error?.message}`);

  // Single-object DELETE. Bucket in the path, no body, no prefixes.
  const base = `${env.VITE_SUPABASE_URL}/storage/v1`;
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
  out.routeType = 'single-object: DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{uid}/{file} '
    + '(bucket in path, no request body) — distinct from storage-js .remove(), which is '
    + 'DELETE /object/{bucket} with a {prefixes:[...]} body';
  const fresh = await gateway.getAccessToken();
  const response = await fetch(`${base}/object/${SIGNATURE_BUCKET}/${encoded}`, {
    method: 'DELETE',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${fresh}` },
    signal: AbortSignal.timeout(30000) });
  const bodyText = (await response.text()).slice(0, 300);
  out.delete = { http: response.status, ok: response.ok, body: bodyText };
  if (bodyText) errors.push(bodyText);

  // Independent existence check and owner-scoped listing.
  const after = await storage.from(SIGNATURE_BUCKET).download(objectPath);
  out.verifyGone = { objectStillReadable: !after.error, error: after.error?.message ?? null };
  if (after.error) errors.push(after.error.message);
  const listed = await storage.from(SIGNATURE_BUCKET).list(user.id, { limit: 100 });
  out.ownerList = { error: listed.error?.message ?? null,
    objectsForThisRun: (listed.data ?? []).filter((o) => String(o.name).includes(runId)).length,
    totalUnderOwnerPrefix: (listed.data ?? []).length };
  if (listed.error) errors.push(listed.error.message);
  out.storageResidue = out.ownerList.objectsForThisRun;
} catch (error) {
  out.aborted = String(error?.message ?? error).slice(0, 300);
  errors.push(out.aborted);
} finally {
  try { if (auth.currentUser) { await auth.currentUser.delete(); out.authResidue = 0; } }
  catch (error) { out.authResidue = 1; errors.push(`auth cleanup: ${error?.code ?? error?.message}`); }
  try { await deleteApp(app); } catch { /* disposed */ }
  out.uuidErrorPresent = errors.some((e) => /invalid input syntax for type uuid/i.test(String(e)));
  out.safeReplacementForRemove = Boolean(out.upload?.ok && out.delete?.ok && !out.uuidErrorPresent
    && out.verifyGone && out.verifyGone.objectStillReadable === false && out.storageResidue === 0);
  writeFileSync(`${ROOT}/single-delete-probe.json`, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
}
