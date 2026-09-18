#!/usr/bin/env node
/**
 * How a v0.0.62 session actually receives the `role: authenticated` claim.
 *
 * Setting a custom claim does not change tokens that have already been issued. The Storage bridge
 * asks for a token per request — supabase-js calls `accessToken: () => provider()` on every call,
 * and the provider ends at `user.getIdToken()` with no forceRefresh — so a session holds whatever
 * token Firebase has cached until it is close to expiring. That is the question this answers, with
 * decoded tokens rather than reasoning:
 *
 *   A  fresh sign-in after the claim was written
 *   B  a session signed in BEFORE the claim was written, which is the case that can be stale
 *
 * Both paths end in a real Supabase Storage call, because a decoded claim is only interesting if
 * Storage actually accepts it.
 *
 * Synthetic identities only, manifest-backed, cleaned up in a finally.
 *
 *   node migration/firestore/tools/verify-role-claim-propagation.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const PROJECT = 'mydesckpro';
const BUCKET = 'business-signatures';
const REPORT_PATH = 'migration/reports/role-claim-propagation.json';
const runId = `claimprop-${randomUUID()}`;
const SYNTH = `migration-test--${runId}`;

const sdk = process.env.GCLOUD_SDK_ROOT
  ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
const operatorToken = () => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();

const firebaseEntry = join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools',
  'lib', 'bin', 'firebase.js');
const raw = execFileSync(process.execPath,
  [firebaseEntry, 'apps:sdkconfig', 'WEB', '--project', PROJECT, '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
const webConfig = parsed.result?.sdkConfig ?? parsed.result ?? parsed;

const dotenv = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const { initializeApp } = await import('firebase/app');
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut }
  = await import('firebase/auth');
const { createClient } = await import('@supabase/supabase-js');

const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const setClaim = async (uid, claims) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    { method: 'POST', headers: { Authorization: `Bearer ${operatorToken()}`,
      'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }) });
  if (!response.ok) throw Error(`claim write http ${response.status}`);
};

const created = [];
const findings = {};
try {
  // ---- B first: sign in BEFORE the claim exists, so the session starts stale ------------------
  const appB = initializeApp({ projectId: PROJECT, apiKey: webConfig.apiKey,
    authDomain: webConfig.authDomain }, `stale-${runId}`);
  const authB = getAuth(appB);
  const emailB = `${SYNTH}-stale@example.test`;
  const passwordB = `Pw-${randomUUID()}`;
  const credB = await createUserWithEmailAndPassword(authB, emailB, passwordB);
  created.push(credB.user.uid);
  const tokenBeforeClaim = await credB.user.getIdToken();
  findings.staleSession = { roleBeforeClaim: decode(tokenBeforeClaim).role ?? null };

  await setClaim(credB.user.uid, { role: 'authenticated' });

  // The bridge's own call shape: getIdToken() with no forceRefresh.
  const cachedToken = await credB.user.getIdToken();
  findings.staleSession.roleFromCachedToken = decode(cachedToken).role ?? null;
  findings.staleSession.cachedTokenUnchanged = cachedToken === tokenBeforeClaim;
  const exp = decode(cachedToken).exp * 1000;
  findings.staleSession.cachedTokenExpiresInMinutes = Math.round((exp - Date.now()) / 60_000);

  // Storage with the stale token, which is what a running session would send.
  const staleClient = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
    { accessToken: async () => credB.user.getIdToken(), auth: { persistSession: false } });
  const stalePath = `${credB.user.uid}/${SYNTH}-stale.png`;
  const { error: staleError } = await staleClient.storage.from(BUCKET)
    .upload(stalePath, Buffer.from('89504e470d0a1a0a', 'hex'), { contentType: 'image/png' });
  findings.staleSession.storageWithStaleToken = staleError ? 'DENIED' : 'ALLOWED';

  // The proposed remedy: one forced refresh, then normal behaviour.
  const refreshed = await credB.user.getIdToken(true);
  findings.staleSession.roleAfterForcedRefresh = decode(refreshed).role ?? null;
  const healedClient = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
    { accessToken: async () => credB.user.getIdToken(), auth: { persistSession: false } });
  const { error: healedError } = await healedClient.storage.from(BUCKET)
    .upload(stalePath, Buffer.from('89504e470d0a1a0a', 'hex'), { contentType: 'image/png', upsert: true });
  findings.staleSession.storageAfterForcedRefresh = healedError ? 'DENIED' : 'ALLOWED';
  if (!healedError) findings.staleSession.objectPath = `${BUCKET}/${stalePath}`;

  // ---- A: a fresh sign-in, after the claim already exists ---------------------------------------
  const appA = initializeApp({ projectId: PROJECT, apiKey: webConfig.apiKey,
    authDomain: webConfig.authDomain }, `fresh-${runId}`);
  const authA = getAuth(appA);
  const emailA = `${SYNTH}-fresh@example.test`;
  const passwordA = `Pw-${randomUUID()}`;
  const credA = await createUserWithEmailAndPassword(authA, emailA, passwordA);
  created.push(credA.user.uid);
  await setClaim(credA.user.uid, { role: 'authenticated' });
  await signOut(authA);
  const freshSignIn = await signInWithEmailAndPassword(authA, emailA, passwordA);
  const freshToken = await freshSignIn.user.getIdToken();
  findings.freshSignIn = { role: decode(freshToken).role ?? null };
  const freshClient = createClient(dotenv.VITE_SUPABASE_URL, dotenv.VITE_SUPABASE_ANON_KEY,
    { accessToken: async () => freshSignIn.user.getIdToken(), auth: { persistSession: false } });
  const freshPath = `${freshSignIn.user.uid}/${SYNTH}-fresh.png`;
  const { error: freshError } = await freshClient.storage.from(BUCKET)
    .upload(freshPath, Buffer.from('89504e470d0a1a0a', 'hex'), { contentType: 'image/png' });
  findings.freshSignIn.storage = freshError ? 'DENIED' : 'ALLOWED';
  if (!freshError) findings.freshSignIn.objectPath = `${BUCKET}/${freshPath}`;

  // ---- cleanup of the synthetic storage objects, by their owners --------------------------------
  for (const [client, path] of [[staleClient, stalePath], [freshClient, freshPath]]) {
    try { await client.storage.from(BUCKET).remove([path]); } catch { /* reported below */ }
  }
} finally {
  const token = operatorToken();
  const deleted = [];
  for (const uid of created) {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT,
        'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
    if (response.ok) deleted.push(uid);
  }

  const staleIsStale = findings.staleSession?.roleFromCachedToken === null;
  const forcedRefreshFixes = findings.staleSession?.roleAfterForcedRefresh === 'authenticated'
    && findings.staleSession?.storageAfterForcedRefresh === 'ALLOWED';
  const freshWorks = findings.freshSignIn?.role === 'authenticated'
    && findings.freshSignIn?.storage === 'ALLOWED';

  const report = {
    generatedAt: new Date().toISOString(),
    artifact: 'role-claim-propagation',
    runId,
    bridge: {
      provider: 'supabase-js accessToken -> registerStorageIdentity -> AuthGateway.getAccessToken',
      call: 'user.getIdToken() with no forceRefresh',
      consequence: 'a session presents its cached token until Firebase refreshes it near expiry',
    },
    findings,
    freshSignInReceivesClaim: freshWorks,
    staleSessionKeepsOldToken: staleIsStale,
    forcedRefreshRestoresStorage: forcedRefreshFixes,
    cleanup: { syntheticAuthCreated: created.length, syntheticAuthDeleted: deleted.length,
      syntheticAuthRemaining: created.length - deleted.length },
    decision: freshWorks && forcedRefreshFixes ? 'PROPAGATION_UNDERSTOOD' : 'PROPAGATION_UNCLEAR',
  };
  writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.decision === 'PROPAGATION_UNDERSTOOD' ? 0 : 1;
}
