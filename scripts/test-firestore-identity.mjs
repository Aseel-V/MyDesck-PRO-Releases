/**
 * Identity, profiles and platform administration on Firebase Auth + Firestore + Rules.
 *
 * Runs the real application repositories (src/data/firestore) through the Firebase client SDK
 * against the Auth and Firestore emulators with the candidate Rules loaded. Positive paths go through
 * the repositories exactly as the UI calls them; every negative path is a raw client-SDK write that
 * bypasses the repositories, because an Electron renderer can issue any write it likes.
 *
 * Synthetic identities only (migration-test--identity-*); every document and account the suite
 * creates is removed afterwards so the shared emulator stays reconcilable.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-identity.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, updateDoc, writeBatch } from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreAdminRepository } from '../src/data/firestore/FirestoreAdminRepository.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { OPERATOR_ONLY_SECURITY_MUTATION } from '../src/data/domain/admin.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Identity-${RUN}-9!`;
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const createdPaths = new Set();
const createdAccounts = new Set();
const clients = [];

const email = (label) => `migration-test--identity-${label}-${RUN}@example.com`;
const denied = (error) => error?.code === 'permission-denied';

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}`);
}

async function emulatorAccount(label) {
  const response = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email(label), password: PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`EMULATOR_SIGNUP_FAILED:${JSON.stringify(body)}`);
  createdAccounts.add(body.localId);
  return { uid: body.localId, email: email(label) };
}

function clientFor(label) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `identity-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const client = { mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false };
  const session = new FirebaseSession(client);
  const handle = { app, auth, db, session, gateway: new FirestoreAuthGateway(session),
    profiles: new FirestoreProfileRepository(session), admin: new FirestoreAdminRepository(session) };
  clients.push(handle);
  return handle;
}

function seedUser(uid, overrides = {}) {
  return {
    id: `profile-${uid}`, userId: uid, fullName: 'Seeded', phoneNumber: '', role: 'user', createdAt: new Date(),
    updatedAt: new Date(), isSuspended: false, sourceBusinessId: null, canViewFinancials: false, uid,
    legacyProfileId: `profile-${uid}`, ownerUid: uid, businessId: null, schemaVersion: 1, transformVersion: 1,
    isDeleted: false, ...overrides,
  };
}

const state = {};

before(async () => {
  await loadRules();
  state.owner = clientFor('owner');
  state.ownerAccount = await state.owner.gateway.signUp(email('owner'), PASSWORD);
  createdAccounts.add(state.ownerAccount.id);
  state.attacker = clientFor('attacker');
  state.attackerAccount = await state.attacker.gateway.signUp(email('attacker'), PASSWORD);
  createdAccounts.add(state.attackerAccount.id);
  const adminAccount = await emulatorAccount('admin');
  state.adminUid = adminAccount.uid;
  await bypass.set(`users/${adminAccount.uid}`, seedUser(adminAccount.uid, { role: 'admin', fullName: 'Platform Admin' }));
  createdPaths.add(`users/${adminAccount.uid}`);
  state.admin = clientFor('admin');
  await state.admin.gateway.signIn(adminAccount.email, PASSWORD);
});

after(async () => {
  for (const handle of clients) {
    await signOut(handle.auth).catch(() => undefined);
    await deleteApp(handle.app).catch(() => undefined);
  }
  for (const path of createdPaths) await bypass.delete(path);
  for (const localId of createdAccounts) {
    await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId }),
    }).catch(() => undefined);
  }
});

test('self-registration creates the business, the owner index and the profile in one batch', async () => {
  const uid = state.ownerAccount.id;
  await state.owner.profiles.createOwnerProfiles(uid, email('owner'), {
    businessName: 'סוכנות / وكالة / Agency', logoUrl: null, currency: 'ILS', language: 'he',
  });
  const business = await state.owner.profiles.fetchBusinessProfile(uid);
  assert.ok(business, 'the owner reads its business');
  createdPaths.add(`businesses/${business.id}`).add(`businessOwners/${uid}`).add(`users/${uid}`);
  state.businessId = business.id;
  assert.equal(business.user_id, uid);
  assert.equal(business.business_name, 'סוכנות / وكالة / Agency');
  assert.equal(business.business_type, 'tourism', 'the column default applies');
  assert.equal(business.subscription_status, 'trial');
  assert.equal(business.is_suspended, false);
  assert.equal(business.preferred_currency, 'ILS');
  assert.match(business.trial_start_date, /^\d{4}-\d{2}-\d{2}T/, 'trial starts at server time');
  const profile = await state.owner.profiles.fetchUserProfile(uid);
  assert.equal(profile.role, 'user');
  assert.equal(profile.full_name, 'סוכנות / وكالة / Agency');
  assert.equal(profile.is_suspended, false);
  const index = await getDoc(doc(state.owner.db, 'businessOwners', uid));
  assert.equal(index.data().businessId, business.id);
});

test('a second business for the same owner is refused', async () => {
  const uid = state.ownerAccount.id;
  const second = encodeInsert('business_profiles', { user_id: uid, business_name: 'Second' }, state.owner.session.codec(),
    { ownerUid: uid, businessId: null });
  const batch = writeBatch(state.owner.db);
  batch.set(doc(state.owner.db, 'businesses', second.id), { ...second.data, businessId: second.id });
  batch.set(doc(state.owner.db, 'businessOwners', uid), { uid, businessId: second.id, schemaVersion: 1 });
  await assert.rejects(() => batch.commit(), denied, 'the index already exists');
  const alone = writeBatch(state.owner.db);
  alone.set(doc(state.owner.db, 'businesses', second.id), { ...second.data, businessId: second.id });
  await assert.rejects(() => alone.commit(), denied, 'a business without its index is refused');
});

test('a business cannot be created for, or indexed against, someone else', async () => {
  const victim = state.ownerAccount.id;
  const attacker = state.attackerAccount.id;
  const forged = encodeInsert('business_profiles', { user_id: victim, business_name: 'Forged' }, state.attacker.session.codec(),
    { ownerUid: victim, businessId: null });
  const forBatch = writeBatch(state.attacker.db);
  forBatch.set(doc(state.attacker.db, 'businesses', forged.id), { ...forged.data, businessId: forged.id });
  forBatch.set(doc(state.attacker.db, 'businessOwners', victim), { uid: victim, businessId: forged.id, schemaVersion: 1 });
  await assert.rejects(() => forBatch.commit(), denied, 'creating a business owned by another uid');
  const hijack = writeBatch(state.attacker.db);
  hijack.set(doc(state.attacker.db, 'businessOwners', attacker), { uid: attacker, businessId: state.businessId, schemaVersion: 1 });
  await assert.rejects(() => hijack.commit(), denied, 'pointing an index at an existing business');
});

test('the owner edits exactly what Settings edits, and nothing that grants power', async () => {
  const uid = state.ownerAccount.id;
  const logo = 'https://example.supabase.co/storage/v1/object/authenticated/logos/owner/logo.png';
  await state.owner.profiles.updateBusinessProfile(uid, { business_name: 'Renamed', preferred_currency: 'USD', logo_url: logo });
  const business = await state.owner.profiles.fetchBusinessProfile(uid);
  assert.equal(business.business_name, 'Renamed');
  assert.equal(business.preferred_currency, 'USD');
  assert.equal(business.logo_url, logo);
  const reference = doc(state.owner.db, 'businesses', state.businessId);
  for (const [field, value] of [['isSuspended', true], ['subscriptionStatus', 'active'], ['businessType', 'restaurant'],
    ['ownerUid', state.attackerAccount.id], ['userId', state.attackerAccount.id], ['businessId', 'other'], ['trialStartDate', new Date('2030-01-01')]]) {
    await assert.rejects(() => updateDoc(reference, { [field]: value }), denied, `${field} is not owner-writable`);
  }
});

test('a resolved display image can never replace a Storage reference', async () => {
  const reference = doc(state.owner.db, 'businesses', state.businessId);
  await assert.rejects(() => updateDoc(reference, { logoUrl: 'data:image/png;base64,iVBORw0KGgo=' }), denied);
  await assert.rejects(() => updateDoc(reference, { signatureUrl: '  BLOB:https://app.local/uuid' }), denied);
  await assert.rejects(() => updateDoc(reference, { signatureUrl: 'Data:image/jpeg;base64,\n/9j/4AAQ' }), denied,
    'case and embedded newlines do not get past the check');
});

test('another tenant and anonymous callers cannot read or change the business or profile', async () => {
  await assert.rejects(() => getDoc(doc(state.attacker.db, 'businesses', state.businessId)), denied);
  await assert.rejects(() => updateDoc(doc(state.attacker.db, 'businesses', state.businessId), { businessName: 'Stolen' }), denied);
  await assert.rejects(() => getDoc(doc(state.attacker.db, 'users', state.ownerAccount.id)), denied);
  await assert.rejects(() => updateDoc(doc(state.attacker.db, 'users', state.ownerAccount.id), { fullName: 'Stolen' }), denied);
  const anonymous = clientFor('anonymous');
  await assert.rejects(() => getDoc(doc(anonymous.db, 'businesses', state.businessId)), denied);
  await assert.rejects(() => getDoc(doc(anonymous.db, 'businessOwners', state.ownerAccount.id)), denied);
});

test('profile self-service is limited to name and phone', async () => {
  const uid = state.ownerAccount.id;
  await state.owner.profiles.saveUserProfile(uid, { full_name: 'אסיל / أسيل', phone_number: '+972500000000' });
  const profile = await state.owner.profiles.fetchUserProfile(uid);
  assert.equal(profile.full_name, 'אסיל / أسيل');
  assert.equal(profile.phone_number, '+972500000000');
  const reference = doc(state.owner.db, 'users', uid);
  for (const [field, value] of [['role', 'admin'], ['canViewFinancials', true], ['isSuspended', true],
    ['businessId', 'someone-else'], ['sourceBusinessId', 'someone-else'], ['ownerUid', state.attackerAccount.id]]) {
    await assert.rejects(() => updateDoc(reference, { [field]: value }), denied, `${field} is protected`);
  }
});

test('platform administrators list accounts; owners cannot', async () => {
  const users = await state.admin.admin.listUserProfiles();
  assert.ok(users.some((row) => row.user_id === state.ownerAccount.id), 'the admin sees the registered owner');
  const businesses = await state.admin.admin.listBusinessProfiles();
  assert.ok(businesses.some((row) => row.id === state.businessId));
  await assert.rejects(() => state.owner.admin.listUserProfiles(), denied);
  await assert.rejects(() => state.owner.admin.listBusinessProfiles(), denied);
});

test('an administrator creates an account and its business without a server', async () => {
  const created = await state.admin.admin.createUser({
    email: email('created'), password: PASSWORD, fullName: 'Created Owner', phoneNumber: '050-1', role: 'user',
    businessName: 'Created Market', currency: 'ILS', language: 'ar', businessType: 'supermarket',
  });
  createdAccounts.add(created.userId);
  createdPaths.add(`users/${created.userId}`).add(`businesses/${created.businessId}`).add(`businessOwners/${created.userId}`);
  const user = (await getDoc(doc(state.admin.db, 'users', created.userId))).data();
  assert.equal(user.role, 'user');
  assert.equal(user.businessId, created.businessId);
  assert.equal(user.sourceBusinessId, created.businessId, 'the Edge Function stored business_id for owners too');
  assert.equal(user.createdBy, state.adminUid);
  const business = (await getDoc(doc(state.admin.db, 'businesses', created.businessId))).data();
  assert.equal(business.businessType, 'supermarket');
  assert.equal(business.ownerUid, created.userId);
  const newcomer = clientFor('created');
  await newcomer.gateway.signIn(email('created'), PASSWORD);
  const own = await newcomer.profiles.fetchBusinessProfile(created.userId);
  assert.equal(own.business_name, 'Created Market');
});

test('a non-administrator cannot create accounts for others, and no orphan account survives', async () => {
  await assert.rejects(() => state.owner.admin.createUser({
    email: email('orphan'), password: PASSWORD, fullName: 'Nope', phoneNumber: '', role: 'admin', businessName: 'Nope',
  }), denied);
  const probe = clientFor('orphan-probe');
  await assert.rejects(() => probe.gateway.signIn(email('orphan'), PASSWORD), (error) => /Invalid login credentials/.test(error.message),
    'the account created on the secondary app was deleted when the profile write was refused');
});

test('administrative edits are refused explicitly instead of silently doing nothing', async () => {
  await assert.rejects(() => state.admin.admin.updateUserAdminFields(state.ownerAccount.id, {
    businessType: 'restaurant', trialStartDate: null, subscriptionStatus: 'active', isSuspended: true,
  }), (error) => error.message === OPERATOR_ONLY_SECURITY_MUTATION);
  await assert.rejects(() => updateDoc(doc(state.admin.db, 'businesses', state.businessId), { isSuspended: true }), denied);
  await assert.rejects(() => updateDoc(doc(state.admin.db, 'users', state.ownerAccount.id), { role: 'admin' }), denied);
});

test('a suspended administrator loses the list authority', async () => {
  await bypass.update(`users/${state.adminUid}`, { isSuspended: true });
  try {
    await assert.rejects(() => state.admin.admin.listUserProfiles(), denied);
  } finally {
    await bypass.update(`users/${state.adminUid}`, { isSuspended: false });
  }
});

test('sign-in failures map to the messages the Login screen understands', async () => {
  const probe = clientFor('login-probe');
  await assert.rejects(() => probe.gateway.signIn(email('owner'), 'wrong-password'), (error) => {
    assert.equal(error.message, 'Invalid login credentials');
    assert.equal(error.status, 400);
    return true;
  });
  await assert.rejects(() => probe.gateway.signInStaff(email('owner'), PASSWORD), /Invalid login credentials/,
    'an identity with no active membership is not staff');
  assert.equal(probe.gateway.currentUid(), null, 'a refused staff sign-in leaves no session behind');
});
