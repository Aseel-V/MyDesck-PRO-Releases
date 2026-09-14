#!/usr/bin/env node
/**
 * Real Firebase Auth -> Supabase Storage proof.
 *
 * Proves the hybrid architecture end to end against the real project: a Firebase ID token
 * (RS256, verified by Supabase Third-Party Auth) reaching real Supabase Storage, with no
 * Supabase Auth session anywhere in the flow and no Supabase database call.
 *
 * Synthetic only. Two throwaway identities in the `migration-test--` namespace, a unique
 * migrationRunId, and objects written only under those identities' own folders. Everything
 * created is tracked and deleted at the end; the run fails if anything is left behind.
 *
 * Identities use UUID localIds deliberately: Supabase's `auth.uid()` returns uuid, so a
 * Firebase-style 28-character id would fail the cast that every Storage policy depends on.
 * Production UIDs are preserved Supabase UUIDs, so this matches the real shape.
 *
 * Never prints tokens, passwords, JWT contents, customer paths or the service_role key.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'mydesckpro';
const BUCKET = 'business-signatures';
const PUBLIC_BUCKET = 'logos';
const runId = `migration-test--hybrid-${randomUUID()}`;

const readEnv = (path) => Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const appEnv = readEnv('.env');
const migrationEnv = readEnv('migration/.env.local');
const SUPABASE_URL = appEnv.VITE_SUPABASE_URL;
const ANON = appEnv.VITE_SUPABASE_ANON_KEY;
const WEB_API_KEY = migrationEnv.FIREBASE_WEB_API_KEY;
if (!SUPABASE_URL || !ANON || !WEB_API_KEY) throw Error('PUBLIC_CONFIG_REQUIRED');

const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const operator = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'], { encoding: 'utf8', timeout: 60000 }).trim();
const adminHeaders = { Authorization: `Bearer ${operator}`, 'Content-Type': 'application/json',
  'x-goog-user-project': PROJECT };

const created = { users: [], objects: [] };
const results = {};
const record = (name, pass, detail) => { results[name] = { pass, ...detail }; };

/** Creates a synthetic Firebase identity with the Supabase-compatible role claim. */
async function createIdentity(label) {
  const uid = randomUUID();
  const email = `${runId}-${label}@example.test`;
  const password = `Hybrid-${randomBytes(15).toString('base64url')}!7a`;
  let response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`,
    { method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ localId: uid, email, password, emailVerified: true }) });
  if (!response.ok) throw Error(`IDENTITY_CREATE_FAILED_${response.status}`);
  created.users.push(uid);
  response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    { method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ role: 'authenticated' }) }) });
  if (!response.ok) throw Error(`CLAIM_SET_FAILED_${response.status}`);
  // Sign in through the public endpoint: this is the same path the shipped client uses, and it
  // proves no privileged credential is needed to obtain the token.
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }) });
  if (!signIn.ok) throw Error(`SIGN_IN_FAILED_${signIn.status}`);
  const { idToken } = await signIn.json();
  const header = JSON.parse(Buffer.from(idToken.split('.')[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
  return { uid, idToken, alg: header.alg, sub: payload.sub, iss: payload.iss,
    aud: payload.aud, role: payload.role ?? null };
}

const storage = (token) => ({
  upload: (path, body, contentType) => fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body }),
  read: (path) => fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }),
  overwrite: (path, body, contentType) => fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    { method: 'PUT', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body }),
  remove: (path) => fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${token}` } }),
});

const alice = await createIdentity('a');
const bob = await createIdentity('b');

// 1. Token shape: RS256, issued by the expected Firebase project, carrying the role claim.
record('firebaseTokenShape',
  alice.alg === 'RS256' && alice.iss === `https://securetoken.google.com/${PROJECT}`
    && alice.aud === PROJECT && alice.sub === alice.uid && alice.role === 'authenticated',
  { alg: alice.alg, issuerMatchesProject: alice.iss === `https://securetoken.google.com/${PROJECT}`,
    audience: alice.aud, subEqualsUid: alice.sub === alice.uid, roleClaim: alice.role });

const payload = Buffer.from(`hybrid-storage-proof ${runId}`, 'utf8');
const checksum = createHash('sha256').update(payload).digest('hex');
const alicePath = `${alice.uid}/${runId}-signature.png`;
const bobPath = `${bob.uid}/${runId}-signature.png`;

// 2. Authorised upload and read, using only the Firebase token.
let response = await storage(alice.idToken).upload(alicePath, payload, 'image/png');
if (response.ok) created.objects.push(alicePath);
record('authorizedUpload', response.ok, { http: response.status });

response = await storage(alice.idToken).read(alicePath);
const readBytes = response.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
record('authorizedRead', response.ok && createHash('sha256').update(readBytes).digest('hex') === checksum,
  { http: response.status, checksumMatches: createHash('sha256').update(readBytes).digest('hex') === checksum });

// 3. Cross-user: B may not read, overwrite or delete A's object, nor write into A's folder.
response = await storage(bob.idToken).read(alicePath);
record('crossUserReadDenied', !response.ok, { http: response.status });
response = await storage(bob.idToken).overwrite(alicePath, Buffer.from('tampered'), 'image/png');
record('crossUserOverwriteDenied', !response.ok, { http: response.status });
response = await storage(bob.idToken).remove(alicePath);
record('crossUserDeleteDenied', !response.ok, { http: response.status });
response = await storage(bob.idToken).upload(`${alice.uid}/${runId}-injected.png`, payload, 'image/png');
if (response.ok) created.objects.push(`${alice.uid}/${runId}-injected.png`);
record('crossTenantWriteDenied', !response.ok, { http: response.status });

// 4. Anonymous: neither the API path nor the public CDN path may serve a private object.
response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${alicePath}`, { headers: { apikey: ANON } });
const anonApi = response.status;
response = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${alicePath}`);
record('anonymousDenied', anonApi >= 400 && response.status >= 400,
  { apiHttp: anonApi, publicCdnHttp: response.status });

// 5. An untrusted issuer must not be accepted just because RS256 now is.
const foreign = [
  Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'probe' })).toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'https://securetoken.google.com/some-other-project',
    aud: 'some-other-project', sub: randomUUID(), role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url'),
  'invalid-signature-probe'].join('.');
response = await storage(foreign).read(alicePath);
record('untrustedIssuerDenied', !response.ok, { http: response.status });

// 6. B writes in its own folder: the policy grants, rather than blanket-denying.
response = await storage(bob.idToken).upload(bobPath, payload, 'image/png');
if (response.ok) created.objects.push(bobPath);
record('ownFolderWriteAllowed', response.ok, { http: response.status });

// 7. The intentionally public logo bucket is still public, and the private one is not.
//
// Compared by behaviour rather than by reading bucket metadata, which the anon key cannot do.
// A public bucket resolves the CDN path and reports the object missing; a private bucket
// refuses before it ever looks. Probing a nonexistent key keeps customer objects untouched.
const probeKey = `${runId}-does-not-exist.png`;
const publicProbe = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${probeKey}`);
const privateProbe = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${probeKey}`);
const publicCode = JSON.parse((await publicProbe.text()) || '{}').code ?? null;
const privateCode = JSON.parse((await privateProbe.text()) || '{}').code ?? null;
// A public bucket resolves the CDN path and reports only the key missing (NoSuchKey). A private
// bucket is not exposed on that path at all and reports NoSuchBucket - indistinguishable from a
// bucket that does not exist, which is the posture we want for signatures.
record('publicBucketUnchanged', publicCode === 'NoSuchKey' && privateCode === 'NoSuchBucket',
  { publicBucketStillResolvesCdnPath: publicCode === 'NoSuchKey',
    privateBucketInvisibleOnCdnPath: privateCode === 'NoSuchBucket',
    publicCode, privateCode });

// 8. Owner delete works, which is also the first half of cleanup.
response = await storage(alice.idToken).remove(alicePath);
if (response.ok) created.objects = created.objects.filter((p) => p !== alicePath);
record('authorizedDelete', response.ok, { http: response.status });

// Cleanup: every remaining object, then both identities. Only this run's ids are touched.
for (const path of [...created.objects]) {
  const owner = path.startsWith(`${alice.uid}/`) ? alice : bob;
  const removed = await storage(owner.idToken).remove(path);
  if (removed.ok) created.objects = created.objects.filter((p) => p !== path);
}
for (const uid of [...created.users]) {
  const deleted = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
    { method: 'POST', headers: adminHeaders, body: JSON.stringify({ localId: uid }) });
  if (deleted.ok) created.users = created.users.filter((u) => u !== uid);
}
record('cleanup', created.objects.length === 0 && created.users.length === 0,
  { objectsRemaining: created.objects.length, identitiesRemaining: created.users.length });

const allPass = Object.values(results).every((r) => r.pass);
const report = {
  generatedAt: new Date().toISOString(),
  migrationRunId: runId,
  project: PROJECT,
  bucket: BUCKET,
  target: 'REAL_SUPABASE_STORAGE_AND_REAL_FIREBASE_AUTH',
  supabaseAuthSessionCreated: false,
  supabaseDatabaseCallsMade: 0,
  supabaseRpcCallsMade: 0,
  customerObjectsTouched: 0,
  syntheticIdentitiesCreated: 2,
  syntheticIdentitiesRemaining: created.users.length,
  syntheticObjectsRemaining: created.objects.length,
  results,
  decision: allPass ? 'HYBRID_STORAGE_SMOKE_PASS' : 'HYBRID_STORAGE_SMOKE_FAIL',
};
writeFileSync('migration/reports/hybrid-storage-smoke.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ decision: report.decision,
  results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.pass ? 'PASS' : 'FAIL'])),
  syntheticObjectsRemaining: report.syntheticObjectsRemaining,
  syntheticIdentitiesRemaining: report.syntheticIdentitiesRemaining }, null, 2));
if (!allPass) process.exitCode = 2;
