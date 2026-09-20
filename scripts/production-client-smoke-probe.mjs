/**
 * Minimal feasibility probe for the real production client-SDK smoke.
 *
 * Creates ONE synthetic identity from the cleanup manifest, creates its owner profiles through the
 * app's own repositories against production Firestore under the deployed Rules, reads them back, and
 * then removes everything it created. Nothing else is touched.
 *
 * This exists so the full 10-category harness is not written against an unverified mechanism. It is
 * not security evidence and writes no evidence artifact.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase/app';
import { inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore } from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';

const MANIFEST = 'migration/reports/production-client-smoke/cleanup-manifest.json';
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const runId = manifest.migrationRunId;

const apiKey = process.env.VITE_FIREBASE_API_KEY;
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN;
assert.ok(apiKey, 'VITE_FIREBASE_API_KEY required');
assert.ok(authDomain, 'VITE_FIREBASE_AUTH_DOMAIN required');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, undefined, 'probe must target PRODUCTION, not an emulator');

const options = { projectId: 'mydesckpro', apiKey, authDomain };
const password = `Smoke-${runId.slice(-8)}-9!`;
const planned = manifest.plannedAuthIdentities.find((entry) => entry.role === 'tourism-a');
assert.ok(planned, 'tourism-a must be a planned identity');

function record(kind, value) {
  const current = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!current.createdResources[kind].includes(value)) current.createdResources[kind].push(value);
  current.status = 'RESOURCES_CREATED';
  writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`);
}

function isolatedIdentity() {
  const app = initializeApp(options, `probe-isolated-${runId}-${Math.random().toString(36).slice(2)}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, 'default');
  return { auth, db, dispose: () => deleteApp(app) };
}

const app = initializeApp(options, `probe-${runId}`);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
const db = getFirestore(app, 'default');
const session = new FirebaseSession({ mode: 'firestore', app, auth, db,
  ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity });

let uid = null;
let businessId = null;
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error?.code ?? ''} ${error?.message ?? error}`); throw error; }
};

try {
  await step('signUp synthetic identity in production Auth', async () => {
    const user = await new FirestoreAuthGateway(session).signUp(planned.email, password);
    uid = user.id;
    record('authUids', uid);
  });

  await step('createOwnerProfiles under deployed Rules', async () => {
    await new FirestoreProfileRepository(session).createOwnerProfiles(uid, planned.email,
      { businessName: `Smoke ${runId.slice(-6)}`, logoUrl: null, currency: 'ILS', language: 'en' });
    const business = await session.requireOwnedBusiness();
    businessId = business.businessId;
    for (const path of [`users/${uid}`, `businesses/${businessId}`, `businessOwners/${uid}`]) record('firestorePaths', path);
  });

  await step('read back own profile and business', async () => {
    assert.equal((await getDoc(doc(db, `users/${uid}`))).exists(), true, 'user profile readable');
    assert.equal((await getDoc(doc(db, `businesses/${businessId}`))).exists(), true, 'business readable');
  });
} finally {
  // Cleanup runs whether or not the probe succeeded, and only on what this run recorded.
  const created = JSON.parse(readFileSync(MANIFEST, 'utf8')).createdResources;
  for (const path of [...created.firestorePaths].reverse()) {
    try { await deleteDoc(doc(db, path)); results.push(`CLEANUP deleted ${path}`); }
    catch (error) { results.push(`CLEANUP FAILED ${path}: ${error?.code ?? error?.message}`); }
  }
  try {
    if (auth.currentUser) { await auth.currentUser.delete(); results.push('CLEANUP deleted synthetic Auth user'); }
  } catch (error) { results.push(`CLEANUP auth delete failed: ${error?.code ?? error?.message}`); }
  try { await signOut(auth); } catch { /* already gone */ }
  await deleteApp(app);
  console.log(results.join('\n'));
  console.log(JSON.stringify({ runId, uid, businessId }));
}
