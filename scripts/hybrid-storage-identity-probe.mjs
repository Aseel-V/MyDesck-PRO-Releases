/**
 * Hybrid Storage identity probe: Firebase ID token -> Supabase Third-Party Auth -> Storage RLS.
 *
 * Proves, or disproves, that a Firebase-issued identity satisfies the private signature bucket's
 * RLS policy. No Supabase Auth session is created, no service-role key is used, the bucket is not
 * made public and no RLS policy is touched.
 *
 * The token itself is never printed. Only its metadata is reported: issuer, audience, subject,
 * expiry and whether the role claim Supabase requires is present.
 *
 *   node scripts/run-typescript-source-test.mjs scripts/hybrid-storage-identity-probe.mjs
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
const apiKey = process.env.VITE_FIREBASE_API_KEY;
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN;
assert.ok(apiKey && authDomain, 'production web config required');

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
// supabaseStorageClient reads import.meta.env; mirror the public config onto it for this Node run.
import.meta.env = { ...(import.meta.env ?? {}), VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY };

const ROOT = 'migration/reports/hybrid-storage-identity';
mkdirSync(ROOT, { recursive: true });
const runId = `hybrid-probe-${Date.now().toString(36)}`;
const options = { projectId: 'mydesckpro', apiKey, authDomain };
const password = `Hybrid-${runId}-9!`;
const emailOf = (role) => `migration-test--${runId}-${role}@example.com`;

// ---- manifest BEFORE any resource is created --------------------------------------------------
const manifest = {
  generatedAt: new Date().toISOString(), migrationRunId: runId, target: 'PRODUCTION',
  purpose: 'Hybrid storage identity probe. Written before any synthetic resource is created.',
  plannedAuthIdentities: ['owner', 'other'].map((r) => ({ role: r, email: emailOf(r) })),
  plannedStorageObjects: ['{ownerUid}/migration-test--<runId>-signature.png'],
  customerResourcesInScope: 'NONE',
  createdResources: { authUids: [], storageObjects: [] },
  status: 'MANIFEST_WRITTEN_NO_RESOURCES_CREATED_YET',
};
const MANIFEST = `${ROOT}/cleanup-manifest.json`;
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
const record = (kind, value) => {
  const current = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!current.createdResources[kind].includes(value)) current.createdResources[kind].push(value);
  current.status = 'RESOURCES_CREATED';
  writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`);
};

const apps = [];
function client(label) {
  const app = initializeApp(options, `hybrid-${label}-${runId}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, 'default');
  apps.push(app);
  const config = { mode: 'firestore', app, auth, db, ready: Promise.resolve(),
    maintenanceEnabled: false, isolatedIdentity: () => ({ auth, db, dispose: () => {} }) };
  return { label, app, auth, db, gateway: new FirestoreAuthGateway(new FirebaseSession(config)) };
}

const results = [];
const findingsExtra = {};
const step = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail: detail ?? null }); return Boolean(ok); };

/** Metadata only. The token is never logged, stored or returned. */
function tokenMetadata(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return { iss: payload.iss, aud: payload.aud, subFingerprint: createHash('sha256').update(String(payload.sub)).digest('hex').slice(0, 12),
    expISO: new Date(payload.exp * 1000).toISOString(), hasRoleAuthenticated: payload.role === 'authenticated',
    algHeader: JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).alg };
}

const owner = client('owner');
const other = client('other');
let report;
try {
  const ownerUser = await owner.gateway.signUp(emailOf('owner'), password);
  record('authUids', ownerUser.id);
  const otherUser = await other.gateway.signUp(emailOf('other'), password);
  record('authUids', otherUser.id);
  step('two synthetic Firebase identities created', true);

  // Before the claim: this is the state the previous smoke ran in.
  const before = tokenMetadata(await owner.auth.currentUser.getIdToken(true));
  step('token before claim lacks role=authenticated', before.hasRoleAuthenticated === false,
    `hasRoleAuthenticated=${before.hasRoleAuthenticated}`);

  // Apply the claim with the existing operator tool. It refuses anything outside migration-test--.
  const applied = execFileSync(process.execPath,
    ['migration/firestore/tools/supabase-role-claim.mjs', '--mode=apply'], { encoding: 'utf8' });
  step('role claim applied by operator tooling', /"decision":\s*"ROLE_CLAIM_READY"/.test(applied),
    applied.replace(/\s+/g, ' ').slice(0, 200));

  // Firebase rotates the token; force a refresh so the new claim is actually carried.
  const ownerMeta = tokenMetadata(await owner.auth.currentUser.getIdToken(true));
  const otherMeta = tokenMetadata(await other.auth.currentUser.getIdToken(true));
  step('token after claim carries role=authenticated', ownerMeta.hasRoleAuthenticated, JSON.stringify(ownerMeta));
  step('issuer is the Firebase project', ownerMeta.iss === 'https://securetoken.google.com/mydesckpro', ownerMeta.iss);
  step('audience is the Firebase project', ownerMeta.aud === 'mydesckpro', ownerMeta.aud);
  step('token is RS256', ownerMeta.algHeader === 'RS256', ownerMeta.algHeader);

  // ---- Storage through the app's own client, with the Firebase identity bound ----------------
  const objectPath = `${ownerUser.id}/migration-test--${runId}-signature.png`;
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const blob = new Blob([PNG], { type: 'image/png' });

  resetStorageBackendForTests();
  bindStorageIdentity(() => owner.gateway.getAccessToken(), () => ownerUser.id);
  const storage = getStorageBackend();

  const up = await storage.from(SIGNATURE_BUCKET).upload(objectPath, blob, { upsert: false, contentType: 'image/png', cacheControl: '0' });
  if (!up.error) record('storageObjects', `${SIGNATURE_BUCKET}/${objectPath}`);
  step('authorized owner upload succeeds', !up.error, up.error ? `${up.error.message}` : null);

  const down = await storage.from(SIGNATURE_BUCKET).download(objectPath);
  const downloaded = down.data ? Buffer.from(await down.data.arrayBuffer()) : null;
  const sameBytes = downloaded ? downloaded.equals(PNG) : false;
  step('authorized owner read succeeds', !down.error, down.error ? down.error.message : null);
  step('checksum/content matches what was written', sameBytes,
    downloaded ? `sha256 ${createHash('sha256').update(downloaded).digest('hex').slice(0, 16)} vs ${createHash('sha256').update(PNG).digest('hex').slice(0, 16)}` : 'no bytes returned');

  // Overwrite by the owner: a second, distinguishable PNG written over the same path.
  const PNG2 = Buffer.concat([PNG, Buffer.from('0a', 'hex')]);
  const over = await storage.from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG2], { type: 'image/png' }), { upsert: true, contentType: 'image/png', cacheControl: '0' });
  step('authorized owner overwrite succeeds', !over.error, over.error ? over.error.message : null);
  const reread = await storage.from(SIGNATURE_BUCKET).download(objectPath);
  const rereadBytes = reread.data ? Buffer.from(await reread.data.arrayBuffer()) : null;
  step('overwritten content reads back as the new bytes',
    Boolean(rereadBytes && rereadBytes.equals(PNG2)),
    rereadBytes ? `len ${rereadBytes.length} expected ${PNG2.length}` : 'no bytes returned');

  // Wrong user: same object, the other synthetic Firebase identity.
  resetStorageBackendForTests();
  bindStorageIdentity(() => other.gateway.getAccessToken(), () => otherUser.id);
  const asOther = getStorageBackend();
  const otherRead = await asOther.from(SIGNATURE_BUCKET).download(objectPath);
  step('wrong user read denied', Boolean(otherRead.error), otherRead.error ? otherRead.error.message : 'WRONG USER COULD READ');
  const otherWrite = await asOther.from(SIGNATURE_BUCKET).upload(objectPath, blob, { upsert: true, contentType: 'image/png' });
  step('wrong user overwrite denied', Boolean(otherWrite.error), otherWrite.error ? otherWrite.error.message : 'WRONG USER COULD OVERWRITE');
  const otherDelete = await asOther.from(SIGNATURE_BUCKET).remove([objectPath]);
  const otherDeleted = !otherDelete.error && (otherDelete.data ?? []).length > 0;
  step('wrong user delete denied', !otherDeleted, otherDeleted ? 'WRONG USER COULD DELETE' : 'no object removed');
  const crossTenant = await asOther.from(SIGNATURE_BUCKET).list(ownerUser.id, { limit: 5 });
  const crossListed = !crossTenant.error && (crossTenant.data ?? []).length > 0;
  step('cross-tenant listing denied', !crossListed, crossListed ? 'CROSS-TENANT LISTING SUCCEEDED' : 'empty or refused');

  // Anonymous: no token at all.
  resetStorageBackendForTests();
  bindStorageIdentity(async () => null, () => null);
  const anon = getStorageBackend();
  const anonRead = await anon.from(SIGNATURE_BUCKET).download(objectPath);
  step('anonymous API access denied', Boolean(anonRead.error), anonRead.error ? anonRead.error.message : 'ANONYMOUS COULD READ');
  const cdn = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/${SIGNATURE_BUCKET}/${objectPath}`,
    { signal: AbortSignal.timeout(20000) });
  step('anonymous public/CDN access denied', !cdn.ok, `http ${cdn.status}`);

  // Owner deletes its own object: the delete restriction must permit the owner and nobody else.
  resetStorageBackendForTests();
  bindStorageIdentity(() => owner.gateway.getAccessToken(), () => ownerUser.id);
  const ownerDelete = await getStorageBackend().from(SIGNATURE_BUCKET).remove([objectPath]);
  findingsExtra.objectPath = objectPath;
  findingsExtra.deleteError = ownerDelete.error?.message ?? null;
  findingsExtra.deletedCount = (ownerDelete.data ?? []).length;
  // Second attempt: confirms the delete refusal is deterministic rather than a transient.
  const retry = await getStorageBackend().from(SIGNATURE_BUCKET).remove([objectPath]);
  findingsExtra.deleteRetryError = retry.error?.message ?? null;
  findingsExtra.deleteRetryCount = (retry.data ?? []).length;
  step('authorized owner delete succeeds', !ownerDelete.error && (ownerDelete.data ?? []).length > 0,
    ownerDelete.error ? ownerDelete.error.message : `removed ${(ownerDelete.data ?? []).length}`);
} finally {
  // Cleanup: synthetic accounts delete themselves; the object is removed above or swept here.
  for (const handle of [owner, other]) {
    try { if (handle.auth.currentUser) await handle.auth.currentUser.delete(); } catch { /* reported below */ }
  }
  for (const app of apps) { try { await deleteApp(app); } catch { /* disposed */ } }
  // The uuid cast was the previous root cause. Scan every recorded detail, not just failures:
  // a success that still mentions it would mean the policy is only incidentally passing.
  const uuidHits = results.filter((r) => /invalid input syntax for type uuid/i.test(r.detail ?? ''));
  step('no "invalid input syntax for type uuid" anywhere in this run', uuidHits.length === 0,
    uuidHits.length ? uuidHits.map((r) => r.name).join('; ') : null);

  report = { generatedAt: new Date().toISOString(), migrationRunId: runId, target: 'PRODUCTION',
    supabaseAuthSessionUsed: false, serviceRoleKeyUsed: false, rlsPolicyModified: false, bucketMadePublic: false,
    uuidErrorPresent: uuidHits.length > 0, findingsExtra,
    results, passed: results.filter((r) => r.ok).length, total: results.length,
    status: results.every((r) => r.ok) ? 'PASS' : 'FAIL' };
  writeFileSync(`${ROOT}/probe.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, passed: report.passed, total: report.total,
    failed: results.filter((r) => !r.ok) }, null, 2));
}
