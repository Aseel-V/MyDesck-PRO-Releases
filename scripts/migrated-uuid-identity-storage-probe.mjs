/**
 * Production probe for a MIGRATED identity: UUID-shaped Firebase uid against Supabase Storage.
 *
 * The production Auth migration preserves each Supabase `auth.users.id` verbatim as the Firebase
 * uid, so a migrated user's uid is a UUID. Firebase `signUp` cannot produce that shape, which is why
 * the identity here is provisioned through the operator tooling with an explicit `localId`, exactly
 * as the import does. Everything after provisioning runs on the normal client path: client-SDK
 * sign-in, Firebase ID token, StorageRepository, Supabase `accessToken` callback, Storage RLS.
 *
 * No RLS change, no service-role key, no bucket setting touched. Tokens and passwords are never
 * printed. Two identities are created: the UUID owner, and a second UUID identity used only to prove
 * the denials.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase/app';
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
const runId = `migrated-uuid-${Date.now().toString(36)}`;
const ownerUuid = randomUUID();
const otherUuid = randomUUID();
const password = `Migrated-${runId}-9!`;
const emailOf = (role) => `migration-test--${runId}-${role}@example.com`;
const options = { projectId: 'mydesckpro', apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN };

// ---- cleanup manifest, written before anything exists -----------------------------------------
const MANIFEST = `${ROOT}/migrated-uuid-manifest.json`;
writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), migrationRunId: runId,
  target: 'PRODUCTION',
  plannedAuthIdentities: [{ role: 'owner', uid: ownerUuid, email: emailOf('owner') },
    { role: 'other', uid: otherUuid, email: emailOf('other') }],
  plannedStorageObject: `${SIGNATURE_BUCKET}/${ownerUuid}/migration-test--${runId}.png`,
  provisioning: 'operator tooling with explicit localId, mirroring the uid-preserving Auth import',
  customerResourcesInScope: 'NONE',
  createdResources: { authUids: [], storageObjects: [] },
  status: 'MANIFEST_WRITTEN_NO_RESOURCES_CREATED_YET' }, null, 2)}\n`);
const record = (kind, value) => {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!m.createdResources[kind].includes(value)) m.createdResources[kind].push(value);
  m.status = 'RESOURCES_CREATED';
  writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
};

const tool = (args) => execFileSync(process.execPath, args, { encoding: 'utf8' });
const provision = (uid, role) => tool(['migration/firestore/tools/provision-synthetic-uuid-identity.mjs',
  '--mode=create', `--uid=${uid}`, `--email=${emailOf(role)}`, `--password=${password}`]);
const deprovision = (uid) => tool(['migration/firestore/tools/provision-synthetic-uuid-identity.mjs',
  '--mode=delete', `--uid=${uid}`]);

const apps = [];
function client(label) {
  const app = initializeApp(options, `muid-${label}-${runId}`);
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
const out = { runId, ownerUidIsUuid: true };
const owner = client('owner');
const other = client('other');

try {
  // ---- provisioning through the trusted operator path ----------------------------------------
  const created = JSON.parse(provision(ownerUuid, 'owner'));
  record('authUids', ownerUuid);
  step('owner provisioned with an explicit UUID uid', created.uidPreserved === true && created.uidIsUuid === true);
  JSON.parse(provision(otherUuid, 'other'));
  record('authUids', otherUuid);

  execFileSync(process.execPath, ['migration/firestore/tools/supabase-role-claim.mjs', '--mode=apply'], { encoding: 'utf8' });

  // ---- normal client-SDK sign-in ---------------------------------------------------------------
  await signInWithEmailAndPassword(owner.auth, emailOf('owner'), password);
  await signInWithEmailAndPassword(other.auth, emailOf('other'), password);
  step('owner signs in through the normal client SDK', owner.auth.currentUser?.uid === ownerUuid,
    owner.auth.currentUser?.uid === ownerUuid ? null : 'client uid did not match the provisioned UUID');

  const token = await owner.auth.currentUser.getIdToken(true); // forced refresh carries the claim
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  await other.auth.currentUser.getIdToken(true);
  out.tokenMetadata = { iss: claims.iss, aud: claims.aud, hasRoleAuthenticated: claims.role === 'authenticated',
    subIsUuid: /^[0-9a-f-]{36}$/i.test(String(claims.sub)),
    subFingerprint: createHash('sha256').update(String(claims.sub)).digest('hex').slice(0, 12) };
  step('token carries role=authenticated and a UUID subject',
    claims.role === 'authenticated' && String(claims.sub) === ownerUuid);

  // ---- storage, entirely through the real production client path -------------------------------
  const objectPath = `${ownerUuid}/migration-test--${runId}.png`;
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const PNG2 = Buffer.concat([PNG, Buffer.from('0a', 'hex')]);
  const as = (handle, uid) => { resetStorageBackendForTests();
    bindStorageIdentity(() => handle.gateway.getAccessToken(), () => uid); return getStorageBackend(); };
  /** Authenticated read with a cache-buster, used only to verify state after a write. */
  const freshRead = async (handle, path) => {
    const t = await handle.gateway.getAccessToken();
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/${SIGNATURE_BUCKET}/${encoded}?cb=${Date.now()}${Math.random()}`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${t}`, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(20000) });
    return { http: r.status, ok: r.ok, bytes: r.ok ? Buffer.from(await r.arrayBuffer()) : null };
  };

  const up = await as(owner, ownerUuid).from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG], { type: 'image/png' }), { upsert: false, contentType: 'image/png', cacheControl: '0' });
  if (!up.error) record('storageObjects', `${SIGNATURE_BUCKET}/${objectPath}`);
  out.upload = { ok: !up.error, error: up.error?.message ?? null };
  step('upload own object', !up.error, up.error?.message);

  const down = await as(owner, ownerUuid).from(SIGNATURE_BUCKET).download(objectPath);
  const bytes = down.data ? Buffer.from(await down.data.arrayBuffer()) : null;
  out.read = { ok: !down.error, error: down.error?.message ?? null };
  step('read own object', !down.error, down.error?.message);
  out.checksumMatch = Boolean(bytes && bytes.equals(PNG));
  step('checksum/content match', out.checksumMatch,
    bytes ? `sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 16)} vs ${createHash('sha256').update(PNG).digest('hex').slice(0, 16)}` : 'no bytes');

  const over = await as(owner, ownerUuid).from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG2], { type: 'image/png' }), { upsert: true, contentType: 'image/png', cacheControl: '0' });
  out.overwrite = { ok: !over.error, error: over.error?.message ?? null };
  step('overwrite own object', !over.error, over.error?.message);
  const reread = await freshRead(owner, objectPath);
  const rebytes = reread.bytes;
  out.overwriteVerified = Boolean(rebytes && rebytes.equals(PNG2));
  out.overwriteCachedRead = { http: reread.http, len: rebytes ? rebytes.length : null };
  step('re-read verifies the new bytes', out.overwriteVerified,
    rebytes ? `len ${rebytes.length} expected ${PNG2.length}` : `http ${reread.http}`);

  // ---- security denials, both identities UUID-shaped -------------------------------------------
  const asOther = as(other, otherUuid);
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

  // ---- owner delete ----------------------------------------------------------------------------
  const del = await as(owner, ownerUuid).from(SIGNATURE_BUCKET).remove([objectPath]);
  out.delete = { ok: !del.error && (del.data ?? []).length > 0, error: del.error?.message ?? null,
    removed: (del.data ?? []).length };
  step('delete own object', out.delete.ok, del.error?.message);

  const gone = await freshRead(owner, objectPath);
  out.verifiedGone = !gone.ok;
  out.goneCheck = { http: gone.http };
  step('object no longer exists', out.verifiedGone,
    gone.ok ? `OBJECT STILL READABLE AFTER DELETE (http ${gone.http})` : null);
  const listed = await as(owner, ownerUuid).from(SIGNATURE_BUCKET).list(ownerUuid, { limit: 100 });
  out.storageResidue = (listed.data ?? []).filter((o) => String(o.name).includes(runId)).length;
  step('owner-scoped list returns zero objects for this run', out.storageResidue === 0);
} catch (error) {
  out.aborted = String(error?.message ?? error).slice(0, 300);
  errors.push(out.aborted);
} finally {
  for (const app of apps) { try { await deleteApp(app); } catch { /* disposed */ } }
  // Deprovision through the same trusted tooling that created the identities.
  out.authCleanup = [];
  for (const uid of [ownerUuid, otherUuid]) {
    try { out.authCleanup.push(JSON.parse(deprovision(uid))); }
    catch (error) { out.authCleanup.push({ uid: 'FAILED', error: String(error?.message).slice(0, 160) }); }
  }
  out.authResidue = out.authCleanup.filter((entry) => entry.deleted !== true && entry.reason !== 'ALREADY_ABSENT').length;
  out.uuidErrorPresent = errors.some((e) => /invalid input syntax for type uuid/i.test(String(e)));
  out.results = results;
  out.passed = results.filter((r) => r.ok).length;
  out.total = results.length;
  out.status = results.every((r) => r.ok) && !out.uuidErrorPresent ? 'PASS' : 'FAIL';
  writeFileSync(`${ROOT}/migrated-uuid-probe.json`, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ status: out.status, passed: out.passed, total: out.total,
    uuidErrorPresent: out.uuidErrorPresent, storageResidue: out.storageResidue ?? 'unknown',
    authResidue: out.authResidue, failed: results.filter((r) => !r.ok) }, null, 2));
}
