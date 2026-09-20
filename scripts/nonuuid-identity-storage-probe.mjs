/**
 * Production probe for a NON-UUID identity: Firebase-generated uid against Supabase Storage.
 *
 * This is the shape the reachable post-cutover admin path produces. FirestoreAdminRepository.createUser
 * calls createUserWithEmailAndPassword on a secondary app and takes `created.user.uid`, so the
 * identifier comes from Firebase and is a 28-character string, never a UUID. This probe creates its
 * identities the same way — normal client signup — and then exercises the full Storage lifecycle
 * through the real production path: Firebase ID token, StorageRepository, Supabase accessToken
 * callback, business-signatures RLS.
 *
 * Verification reads are cache-busted, because the storage download path serves cached bytes and
 * previously made a successful overwrite and a successful delete look like failures.
 *
 * No RLS change, no service-role key, no bucket setting touched. Tokens and passwords never printed.
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
const runId = `nonuuid-${Date.now().toString(36)}`;
const password = `NonUuid-${runId}-9!`;
const emailOf = (role) => `migration-test--${runId}-${role}@example.com`;
const options = { projectId: 'mydesckpro', apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN };
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- cleanup manifest, before anything exists --------------------------------------------------
const MANIFEST = `${ROOT}/nonuuid-manifest.json`;
writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), migrationRunId: runId,
  target: 'PRODUCTION', identityCreation: 'normal Firebase client signUp (Firebase-generated uid)',
  plannedAuthIdentities: [{ role: 'owner', email: emailOf('owner') }, { role: 'other', email: emailOf('other') }],
  plannedStorageObject: `${SIGNATURE_BUCKET}/{ownerUid}/migration-test--${runId}.png`,
  customerResourcesInScope: 'NONE',
  createdResources: { authUids: [], storageObjects: [] },
  status: 'MANIFEST_WRITTEN_NO_RESOURCES_CREATED_YET' }, null, 2)}\n`);
const record = (kind, value) => {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!m.createdResources[kind].includes(value)) m.createdResources[kind].push(value);
  m.status = 'RESOURCES_CREATED';
  writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
};

const apps = [];
function client(label) {
  const app = initializeApp(options, `nonuuid-${label}-${runId}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, 'default');
  apps.push(app);
  return { auth, db, gateway: new FirestoreAuthGateway(new FirebaseSession({ mode: 'firestore', app, auth, db,
    ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity: () => ({ auth, db, dispose: () => {} }) })) };
}

const results = [];
const errors = [];
const step = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null });
  if (detail) errors.push(String(detail));
  return Boolean(ok);
};
const out = { runId };
const owner = client('owner');
const other = client('other');

try {
  // ---- normal client signup, the shape the admin path produces --------------------------------
  const ownerUser = await owner.gateway.signUp(emailOf('owner'), password);
  record('authUids', ownerUser.id);
  const otherUser = await other.gateway.signUp(emailOf('other'), password);
  record('authUids', otherUser.id);
  out.uidShape = { length: ownerUser.id.length, isUuid: UUID_SHAPE.test(ownerUser.id),
    uidFingerprint: createHash('sha256').update(ownerUser.id).digest('hex').slice(0, 12) };
  step('uid is Firebase-generated and NOT UUID-shaped',
    !UUID_SHAPE.test(ownerUser.id) && ownerUser.id.length === 28, JSON.stringify(out.uidShape));

  execFileSync(process.execPath, ['migration/firestore/tools/supabase-role-claim.mjs', '--mode=apply'], { encoding: 'utf8' });
  const token = await owner.auth.currentUser.getIdToken(true); // forced refresh carries the claim
  await other.auth.currentUser.getIdToken(true);
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  out.tokenMetadata = { iss: claims.iss, aud: claims.aud, hasRoleAuthenticated: claims.role === 'authenticated',
    subIsUuid: UUID_SHAPE.test(String(claims.sub)) };
  step('token carries role=authenticated with a non-UUID subject',
    claims.role === 'authenticated' && !UUID_SHAPE.test(String(claims.sub)));

  // ---- storage through the real production path ------------------------------------------------
  const objectPath = `${ownerUser.id}/migration-test--${runId}.png`;
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const PNG2 = Buffer.concat([PNG, Buffer.from('0a', 'hex')]);
  const as = (handle, uid) => { resetStorageBackendForTests();
    bindStorageIdentity(() => handle.gateway.getAccessToken(), () => uid); return getStorageBackend(); };
  /** Authenticated read with a cache-buster; used only to verify state after a write. */
  const freshRead = async (handle, path) => {
    const t = await handle.gateway.getAccessToken();
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/${SIGNATURE_BUCKET}/${encoded}?cb=${Date.now()}${Math.random()}`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${t}`, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(20000) });
    return { http: r.status, ok: r.ok, bytes: r.ok ? Buffer.from(await r.arrayBuffer()) : null };
  };

  const up = await as(owner, ownerUser.id).from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG], { type: 'image/png' }), { upsert: false, contentType: 'image/png', cacheControl: '0' });
  if (!up.error) record('storageObjects', `${SIGNATURE_BUCKET}/${objectPath}`);
  out.upload = { ok: !up.error, error: up.error?.message ?? null };
  step('upload own object', !up.error, up.error?.message);

  const down = await as(owner, ownerUser.id).from(SIGNATURE_BUCKET).download(objectPath);
  const bytes = down.data ? Buffer.from(await down.data.arrayBuffer()) : null;
  out.read = { ok: !down.error, error: down.error?.message ?? null };
  step('read own object', !down.error, down.error?.message);
  out.checksumMatch = Boolean(bytes && bytes.equals(PNG));
  step('checksum/content match', out.checksumMatch,
    bytes ? `sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 16)} vs ${createHash('sha256').update(PNG).digest('hex').slice(0, 16)}` : 'no bytes');

  const over = await as(owner, ownerUser.id).from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG2], { type: 'image/png' }), { upsert: true, contentType: 'image/png', cacheControl: '0' });
  out.overwrite = { ok: !over.error, error: over.error?.message ?? null };
  step('overwrite own object', !over.error, over.error?.message);
  const reread = await freshRead(owner, objectPath);
  out.overwriteVerified = Boolean(reread.bytes && reread.bytes.equals(PNG2));
  step('cache-busted re-read confirms the new bytes', out.overwriteVerified,
    reread.bytes ? `len ${reread.bytes.length} expected ${PNG2.length}` : `http ${reread.http}`);

  // ---- security denials --------------------------------------------------------------------------
  const asOther = as(other, otherUser.id);
  const oRead = await asOther.from(SIGNATURE_BUCKET).download(objectPath);
  step('wrong user read denied', Boolean(oRead.error), oRead.error ? oRead.error.message : 'WRONG USER COULD READ');
  const oWrite = await asOther.from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG2], { type: 'image/png' }), { upsert: true, contentType: 'image/png' });
  step('wrong user overwrite denied', Boolean(oWrite.error), oWrite.error ? oWrite.error.message : 'WRONG USER COULD OVERWRITE');
  const oDel = await asOther.from(SIGNATURE_BUCKET).remove([objectPath]);
  const oDeleted = !oDel.error && (oDel.data ?? []).length > 0;
  step('wrong user delete denied', !oDeleted, oDeleted ? 'WRONG USER COULD DELETE' : (oDel.error?.message ?? 'no object removed'));

  resetStorageBackendForTests();
  bindStorageIdentity(async () => null, () => null);
  const anonRead = await getStorageBackend().from(SIGNATURE_BUCKET).download(objectPath);
  step('anonymous API access denied', Boolean(anonRead.error), anonRead.error ? anonRead.error.message : 'ANONYMOUS COULD READ');
  const cdn = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/${SIGNATURE_BUCKET}/${objectPath}`,
    { signal: AbortSignal.timeout(20000) });
  step('anonymous CDN access denied', !cdn.ok, `http ${cdn.status}`);

  // ---- owner delete -------------------------------------------------------------------------------
  const del = await as(owner, ownerUser.id).from(SIGNATURE_BUCKET).remove([objectPath]);
  out.delete = { ok: !del.error && (del.data ?? []).length > 0, error: del.error?.message ?? null,
    removed: (del.data ?? []).length };
  step('delete own object', out.delete.ok, del.error?.message);

  const gone = await freshRead(owner, objectPath);
  out.verifiedGone = !gone.ok;
  step('cache-busted read after delete confirms the object is gone', out.verifiedGone,
    gone.ok ? `OBJECT STILL READABLE (http ${gone.http})` : null);
  const listed = await as(owner, ownerUser.id).from(SIGNATURE_BUCKET).list(ownerUser.id, { limit: 100 });
  out.storageResidue = (listed.data ?? []).filter((o) => String(o.name).includes(runId)).length;
  step('owner-scoped list returns zero objects for this run', out.storageResidue === 0);
} catch (error) {
  out.aborted = String(error?.message ?? error).slice(0, 300);
  errors.push(out.aborted);
} finally {
  // Each synthetic identity deletes its own Auth account through the client SDK.
  out.authCleanup = [];
  for (const handle of [owner, other]) {
    try { if (handle.auth.currentUser) { await handle.auth.currentUser.delete(); out.authCleanup.push('deleted'); } }
    catch (error) { out.authCleanup.push(`failed: ${error?.code ?? error?.message}`); }
  }
  out.authResidue = out.authCleanup.filter((entry) => entry !== 'deleted').length;
  for (const app of apps) { try { await deleteApp(app); } catch { /* disposed */ } }
  out.uuidErrorPresent = errors.some((e) => /invalid input syntax for type uuid/i.test(String(e)));
  out.results = results;
  out.passed = results.filter((r) => r.ok).length;
  out.total = results.length;
  out.status = results.every((r) => r.ok) && !out.uuidErrorPresent ? 'PASS' : 'FAIL';
  writeFileSync(`${ROOT}/nonuuid-probe.json`, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ status: out.status, passed: out.passed, total: out.total,
    uidShape: out.uidShape, uuidErrorPresent: out.uuidErrorPresent,
    storageResidue: out.storageResidue ?? 'unknown', authResidue: out.authResidue,
    failed: results.filter((r) => !r.ok) }, null, 2));
}
