/**
 * Isolates which Storage operations a Firebase identity can and cannot perform.
 *
 * The upload failed with `invalid input syntax for type uuid`, a Postgres type error rather than an
 * RLS refusal. This separates SELECT (policy evaluation only) from INSERT/DELETE (which also write
 * storage.objects.owner). If SELECT succeeds for the owner and is refused for everyone else, the
 * policy accepts the Firebase subject and the remaining fault is the uuid-typed owner column.
 *
 * Read-mostly: the only write attempted is one synthetic object under the synthetic owner's prefix.
 * No RLS policy, bucket setting or customer object is touched.
 */
import assert from 'node:assert/strict';
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

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, undefined, 'must target PRODUCTION');
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
import.meta.env = { ...(import.meta.env ?? {}), VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY };

const ROOT = 'migration/reports/hybrid-storage-identity';
mkdirSync(ROOT, { recursive: true });
const runId = `uuid-iso-${Date.now().toString(36)}`;
const options = { projectId: 'mydesckpro', apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN };
const password = `Hybrid-${runId}-9!`;
const apps = [];
function client(label) {
  const app = initializeApp(options, `iso-${label}-${runId}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, 'default');
  apps.push(app);
  return { auth, gateway: new FirestoreAuthGateway(new FirebaseSession({ mode: 'firestore', app, auth, db,
    ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity: () => ({ auth, db, dispose: () => {} }) })) };
}

const findings = {};
const owner = client('owner');
const other = client('other');
try {
  const o = await owner.gateway.signUp(`migration-test--${runId}-owner@example.com`, password);
  const x = await other.gateway.signUp(`migration-test--${runId}-other@example.com`, password);
  execFileSync(process.execPath, ['migration/firestore/tools/supabase-role-claim.mjs', '--mode=apply'], { encoding: 'utf8' });
  await owner.auth.currentUser.getIdToken(true);
  await other.auth.currentUser.getIdToken(true);

  const as = (handle, uid) => { resetStorageBackendForTests();
    bindStorageIdentity(() => handle.gateway.getAccessToken(), () => uid); return getStorageBackend(); };

  // SELECT: listing a prefix evaluates the policy without writing storage.objects.
  const ownList = await as(owner, o.id).from(SIGNATURE_BUCKET).list(o.id, { limit: 5 });
  findings.ownerListsOwnPrefix = { error: ownList.error?.message ?? null, rows: (ownList.data ?? []).length };
  const otherList = await as(other, x.id).from(SIGNATURE_BUCKET).list(o.id, { limit: 5 });
  findings.otherListsOwnerPrefix = { error: otherList.error?.message ?? null, rows: (otherList.data ?? []).length };
  const anonList = await as({ gateway: { getAccessToken: async () => null } }, null).from(SIGNATURE_BUCKET).list(o.id, { limit: 5 });
  findings.anonymousListsOwnerPrefix = { error: anonList.error?.message ?? null, rows: (anonList.data ?? []).length };

  // INSERT: the same identity that could list now tries to write.
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const up = await as(owner, o.id).from(SIGNATURE_BUCKET)
    .upload(`${o.id}/migration-test--${runId}.png`, new Blob([PNG], { type: 'image/png' }),
      { upsert: false, contentType: 'image/png' });
  findings.ownerUpload = { error: up.error?.message ?? null };
  if (!up.error) await as(owner, o.id).from(SIGNATURE_BUCKET).remove([`${o.id}/migration-test--${runId}.png`]);
} finally {
  for (const h of [owner, other]) { try { if (h.auth?.currentUser) await h.auth.currentUser.delete(); } catch { /* swept */ } }
  for (const app of apps) { try { await deleteApp(app); } catch { /* disposed */ } }
  const selectWorks = findings.ownerListsOwnPrefix?.error === null;
  const insertFailsOnUuid = /invalid input syntax for type uuid/i.test(findings.ownerUpload?.error ?? '');
  const report = { generatedAt: new Date().toISOString(), migrationRunId: runId, findings,
    conclusion: selectWorks && insertFailsOnUuid
      ? 'RLS accepts the Firebase subject for SELECT; INSERT fails on a uuid-typed column, not on policy.'
      : 'inconclusive: see findings',
    selectWorksForFirebaseIdentity: selectWorks, insertFailsOnUuidCast: insertFailsOnUuid };
  writeFileSync(`${ROOT}/uuid-isolation.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
