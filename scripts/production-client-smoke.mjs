/**
 * Real production Firebase client-SDK security smoke.
 *
 * Every security assertion here runs through the Firebase CLIENT SDK, authenticated with real
 * Firebase Auth, against the real production Firestore, under the deployed Security Rules. No Admin
 * SDK and no privileged token is used for any assertion. The migration service account appears only
 * in the separate finalize step, and only to remove documents the Rules deliberately forbid clients
 * from deleting (identity documents and immutable audit/event records) and to measure residue
 * independently of this script's own accounting.
 *
 * Synthetic identities only. Emails are migration-test--<runId>-<role>@example.com, every created
 * resource is recorded in the cleanup manifest as it is created, and no real customer UID, business
 * ID, document or Storage object is read, written or deleted.
 *
 *   node scripts/run-typescript-source-test.mjs scripts/production-client-smoke.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreTravelRepository } from '../src/data/firestore/FirestoreTravelRepository.ts';
import { FirestoreRestaurantRepository } from '../src/data/firestore/FirestoreRestaurantRepository.ts';
import { FirestoreSupermarketRepository } from '../src/data/firestore/FirestoreSupermarketRepository.ts';
import { FirestoreAutoRepairRepository } from '../src/data/firestore/FirestoreAutoRepairRepository.ts';
import { FirestoreCarPartsRepository } from '../src/data/firestore/FirestoreCarPartsRepository.ts';
import { createFirestoreBackend } from '../src/data/firestore/createFirestoreBackend.ts';
import { registerBackend, resetBackendForTests } from '../src/data/backend.ts';
import { execFileSync } from 'node:child_process';
import { bindStorageIdentity } from '../src/data/storageIdentity.ts';
import { getStorageBackend, resetStorageBackendForTests } from '../src/data/supabaseStorageClient.ts';
import { SIGNATURE_BUCKET } from '../src/data/SupabaseStorageRepository.ts';

const MANIFEST = 'migration/reports/production-client-smoke/cleanup-manifest.json';
const RUN_REPORT = 'migration/reports/production-client-smoke/run.json';
const PROJECT = 'mydesckpro';

// ---- preflight -------------------------------------------------------------------------------
for (const forbidden of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  assert.equal(process.env[forbidden], undefined, `${forbidden} must be unset: this targets PRODUCTION`);
}
const apiKey = process.env.VITE_FIREBASE_API_KEY;
const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN;
assert.ok(apiKey && authDomain, 'production web config required');
const supabaseEnv = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
import.meta.env = { ...(import.meta.env ?? {}), VITE_SUPABASE_URL: supabaseEnv.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: supabaseEnv.VITE_SUPABASE_ANON_KEY };

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const runId = manifest.migrationRunId;
assert.match(runId, /^final-smoke-/, 'manifest runId must be a final-smoke run');

const options = { projectId: PROJECT, apiKey, authDomain };
const password = `Smoke-${runId.slice(-10)}-9!`;
const emailFor = (role) => {
  const planned = manifest.plannedAuthIdentities.find((entry) => entry.role === role);
  assert.ok(planned, `role must be planned in the manifest: ${role}`);
  return planned.email;
};

// ---- manifest recording ----------------------------------------------------------------------
function record(kind, value) {
  const current = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (!current.createdResources[kind].includes(value)) current.createdResources[kind].push(value);
  current.status = 'RESOURCES_CREATED';
  writeFileSync(MANIFEST, `${JSON.stringify(current, null, 2)}\n`);
}
const createdPaths = () => JSON.parse(readFileSync(MANIFEST, 'utf8')).createdResources.firestorePaths;

// ---- clients ---------------------------------------------------------------------------------
const apps = [];
function isolatedIdentity() {
  const app = initializeApp(options, `smoke-iso-${randomUUID()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, 'default');
  apps.push(app);
  return { auth, db, dispose: () => deleteApp(app) };
}
function client(label) {
  const app = initializeApp(options, `smoke-${label}-${runId.slice(-8)}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, 'default');
  apps.push(app);
  const config = { mode: 'firestore', app, auth, db,
    ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity };
  const session = new FirebaseSession(config);
  return { label, app, auth, db, config, session };
}

/** A signed-up synthetic identity with no business of its own. */
async function identity(role) {
  const handle = client(role);
  const email = emailFor(role);
  const user = await new FirestoreAuthGateway(handle.session).signUp(email, password);
  record('authUids', user.id);
  return Object.assign(handle, { uid: user.id, email });
}

/** A synthetic identity that also owns a business, created entirely through the client SDK. */
async function owner(role, businessName) {
  const handle = await identity(role);
  await new FirestoreProfileRepository(handle.session)
    .createOwnerProfiles(handle.uid, handle.email, { businessName, logoUrl: null, currency: 'ILS', language: 'en' });
  const business = await handle.session.requireOwnedBusiness();
  for (const path of [`users/${handle.uid}`, `businesses/${business.businessId}`, `businessOwners/${handle.uid}`]) {
    record('firestorePaths', path);
  }
  return Object.assign(handle, { businessId: business.businessId });
}

// ---- assertion helpers -----------------------------------------------------------------------
const denied = (error) => error?.code === 'permission-denied'
  || /PERMISSION_DENIED|Missing or insufficient permissions/i.test(String(error?.message ?? error));

const checks = [];
function note(category, name, ok, detail) {
  checks.push({ category, name, ok: Boolean(ok), detail: detail ?? null });
  return Boolean(ok);
}
/** An operation that must succeed. */
async function allow(category, name, fn) {
  try { const value = await fn(); note(category, name, true); return value; }
  catch (error) { note(category, name, false, `unexpected denial/error: ${error?.code ?? ''} ${String(error?.message ?? error).slice(0, 200)}`); return undefined; }
}
/** An operation that must be refused by the Rules. A success here is a security failure. */
async function refuse(category, name, fn) {
  try { await fn(); note(category, name, false, 'OPERATION SUCCEEDED BUT MUST BE DENIED'); return false; }
  catch (error) {
    if (denied(error)) return note(category, name, true);
    return note(category, name, false, `denied for the wrong reason: ${error?.code ?? ''} ${String(error?.message ?? error).slice(0, 200)}`);
  }
}

// ---- domain payloads -------------------------------------------------------------------------
const tripForm = (overrides = {}) => ({
  destination: 'Athens', client_name: 'Synthetic Smoke', client_phone: '0521234567',
  travelers: [{ full_name: 'Synthetic Smoke' }], travelers_count: 2, itinerary: [],
  start_date: '2027-05-01', end_date: '2027-05-06',
  currency: 'ILS', exchange_rate: 1, wholesale_cost: 1000, sale_price: 1500,
  payments: [], payment_status: 'unpaid', amount_paid: 0, payment_date: '2027-04-01',
  payment_method: 'cash', card_paid_amount: null, cash_paid_amount: null, payment_plan: null,
  room_type: {}, board_basis: 'BB', hotel_name: 'Hotel Athens', service_type: 'both',
  trip_type: 'round_trip', notes: '', status: 'active', ...overrides,
});
const installmentForm = (overrides = {}) => tripForm({
  payment_method: 'card', sale_price: 1500,
  payment_plan: { card_total: 1500, cash_total: 0, installment_count: 3, first_installment_date: '2030-01-15' },
  ...overrides,
});

const categories = {};
const identities = {};

// ---- 1. auth ---------------------------------------------------------------------------------
async function runAuth() {
  const c = 'auth';
  identities.a = await owner('tourism-a', `Smoke A ${runId.slice(-6)}`);
  identities.b = await owner('tourism-b', `Smoke B ${runId.slice(-6)}`);
  note(c, 'synthetic user A signUp succeeds', Boolean(identities.a.uid));
  note(c, 'synthetic user B signUp succeeds', Boolean(identities.b.uid));

  await allow(c, 'synthetic user A sign-in succeeds', async () => {
    const fresh = client('signin-a');
    await signInWithEmailAndPassword(fresh.auth, identities.a.email, password);
    assert.equal(fresh.auth.currentUser?.uid, identities.a.uid);
    await signOut(fresh.auth);
  });
  await allow(c, 'synthetic user B sign-in succeeds', async () => {
    const fresh = client('signin-b');
    await signInWithEmailAndPassword(fresh.auth, identities.b.email, password);
    assert.equal(fresh.auth.currentUser?.uid, identities.b.uid);
    await signOut(fresh.auth);
  });

  // Anonymous sign-in is disabled on this project, so the unauthenticated case is tested with no
  // token at all, which is the stronger check: no identity whatsoever reaching a private document.
  const anon = client('unauthenticated');
  await refuse(c, 'unauthenticated read of a private profile denied',
    () => getDoc(doc(anon.db, `users/${identities.a.uid}`)));
  await refuse(c, 'unauthenticated read of a private business denied',
    () => getDoc(doc(anon.db, `businesses/${identities.a.businessId}`)));

  await refuse(c, 'user A cannot read user B tenant',
    () => getDoc(doc(identities.a.db, `businesses/${identities.b.businessId}`)));
  await refuse(c, 'user B cannot read user A tenant',
    () => getDoc(doc(identities.b.db, `businesses/${identities.a.businessId}`)));
  await refuse(c, 'user A cannot read user B profile',
    () => getDoc(doc(identities.a.db, `users/${identities.b.uid}`)));
}

// ---- 2. tourism ------------------------------------------------------------------------------
async function runTourism() {
  const c = 'tourism';
  const a = identities.a;
  // The trip write path asserts the canonical payment contract through the registered backend.
  resetBackendForTests();
  registerBackend(createFirestoreBackend(a.config));
  const repo = new FirestoreTravelRepository(a.session);

  const saved = await allow(c, 'trip create', () => repo.saveTrip(a.uid, tripForm()));
  const tripId = saved?.tripId ?? saved?.id ?? saved?.trip?.id;
  if (tripId) {
    record('firestorePaths', `trips/${tripId}`);
    await allow(c, 'trip read', async () => {
      const details = await repo.getTripDetails(tripId);
      assert.ok(details, 'trip details readable');
    });
    await allow(c, 'trip update', () => repo.saveTrip(a.uid, tripForm({ notes: 'synthetic update' }), tripId));
    await allow(c, 'trip search/query path', () => repo.searchTrips('Synthetic'));
    await allow(c, 'trip page query uses the composite index', () => repo.getTripsPage({ limit: 5 }));
  }

  const planned = await allow(c, 'installment plan create', () => repo.saveTrip(a.uid, installmentForm()));
  const planTripId = planned?.tripId ?? planned?.id ?? planned?.trip?.id;
  if (planTripId) record('firestorePaths', `trips/${planTripId}`);

  // Idempotency: the same clientRequestId replayed must have one effect, not two.
  const requestId = `${runId}-idem`;
  record('operationIds', requestId);
  const first = await allow(c, 'idempotent save accepted', () => repo.saveTrip(a.uid, tripForm({ destination: 'Rome' }), undefined, requestId));
  const firstId = first?.tripId ?? first?.id ?? first?.trip?.id;
  if (firstId) record('firestorePaths', `trips/${firstId}`);
  await allow(c, 'idempotent duplicate replay has one effect', async () => {
    const replay = await repo.saveTrip(a.uid, tripForm({ destination: 'Rome' }), undefined, requestId);
    const replayId = replay?.tripId ?? replay?.id ?? replay?.trip?.id;
    assert.equal(replayId, firstId, 'replay must return the same trip, not create a second');
  });

  if (tripId) {
    await refuse(c, 'tenant isolation: user B cannot read user A trip',
      () => getDoc(doc(identities.b.db, `trips/${tripId}`)));
    await refuse(c, 'tenant isolation: user B cannot write user A trip',
      () => updateDoc(doc(identities.b.db, `trips/${tripId}`), { notes: 'hostile' }));
  }
}

// ---- 3. restaurant ---------------------------------------------------------------------------
async function runRestaurant() {
  const c = 'restaurant';
  const r = await owner('restaurant-owner', `Smoke Restaurant ${runId.slice(-6)}`);
  identities.restaurant = r;
  const staff = await identity('restaurant-staff');
  identities.restaurantStaff = staff;
  const repo = new FirestoreRestaurantRepository(r.session);

  // Restaurant and supermarket repositories key the tenant off the OWNER UID, not the business id.
  const table = await allow(c, 'menu/table write as manager',
    () => repo.createTable(r.uid, { name: `T-${runId.slice(-4)}`, seats: 4 }));
  const cat = await allow(c, 'menu category create',
    () => repo.createCategory(r.uid, { name: `Cat-${runId.slice(-4)}` }));
  const item = cat?.id ? await allow(c, 'menu item create', () => repo.createMenuItem({
    category_id: cat.id, name: `Item-${runId.slice(-4)}`, price: 25 })) : undefined;
  await allow(c, 'menu read', () => repo.listMenu(r.uid));

  // Membership: the manager grants a role to the synthetic staff identity.
  const member = await allow(c, 'membership create by manager', () => repo.createStaff(r.uid, {
    full_name: `Staff ${runId.slice(-4)}`, role: 'Waiter', uid: staff.uid, phone: '0521234567' }));
  if (member?.id) record('firestorePaths', `businesses/${r.businessId}/restaurantStaff/${member.id}`);

  // Role enforcement and escalation, exercised by the staff identity itself.
  const staffRepo = new FirestoreRestaurantRepository(staff.session);
  await refuse(c, 'staff cannot forge a membership for itself', () => setDoc(
    doc(staff.db, `businesses/${r.businessId}/restaurantStaff/${randomUUID()}`),
    { uid: staff.uid, role: 'manager', businessId: r.businessId, ownerUid: r.uid, isDeleted: false }));
  await refuse(c, 'staff cannot escalate its own role to manager', () => updateDoc(
    doc(staff.db, `businesses/${r.businessId}/restaurantStaff/${member?.id ?? 'missing'}`), { role: 'manager' }));
  await refuse(c, 'cross-tenant denial: other tenant cannot read restaurant tables',
    () => getDocs(query(collection(identities.b.db, `businesses/${r.businessId}/restaurantStaff`), limit(1))));

  // Order lifecycle.
  const order = await allow(c, 'order lifecycle: create', () => repo.createOrder(r.uid, {
    table_id: table?.id ?? null, order_type: 'dine_in', currency: 'ILS' }));
  if (order?.id) record('firestorePaths', `businesses/${r.businessId}/restaurantOrders/${order.id}`);
  if (order?.id && item?.id) {
    await allow(c, 'order lifecycle: add line at menu price', () => repo.addOrderItem({
      orderId: order.id, itemId: item.id, quantity: 1, priceAtTime: 25 }));
  }
}

// ---- 4. supermarket --------------------------------------------------------------------------
async function runSupermarket() {
  const c = 'supermarket';
  const s = await owner('supermarket', `Smoke Market ${runId.slice(-6)}`);
  identities.supermarket = s;
  const repo = new FirestoreSupermarketRepository(s.session);

  const product = await allow(c, 'product create', () => repo.createProduct(s.uid, {
    name: `P-${runId.slice(-4)}`, description: 'synthetic smoke product', price: 10,
    barcode: `SM${runId.slice(-8)}`, category_id: null, type: 'unit', image_url: null }));
  if (product?.id) record('firestorePaths', `businesses/${s.businessId}/menuItems/${product.id}`);
  await allow(c, 'product listing', () => repo.listAvailableProducts(s.uid));

  const sale = await allow(c, 'POS transaction', () => repo.recordSale(s.uid, {
    receipt_number: `R-${runId.slice(-8)}`,
    items: [{ product_id: product?.id ?? null, name: `P-${runId.slice(-4)}`, quantity: 1, price: 10 }],
    subtotal: 10, vat_amount: 0, total_amount: 10, payment_method: 'cash',
    amount_paid: 10, change_amount: 0, created_at: new Date().toISOString() }));
  if (sale?.id) record('firestorePaths', `businesses/${s.businessId}/marketTransactions/${sale.id}`);
  await allow(c, 'sale read', () => repo.listSales(s.uid, '2020-01-01', '2030-01-01'));
  await allow(c, 'analytics/query path', () => repo.listCategories(s.uid));
  await refuse(c, 'cross-tenant denial: other tenant cannot read products',
    () => getDocs(query(collection(identities.b.db, `businesses/${s.businessId}/menuItems`), limit(1))));
}

// ---- 5. autoRepair ---------------------------------------------------------------------------
async function runAutoRepair() {
  const c = 'autoRepair';
  const v = await owner('autorepair', `Smoke Garage ${runId.slice(-6)}`);
  identities.autorepair = v;
  const repo = new FirestoreAutoRepairRepository(v.session);

  const opened = await allow(c, 'customer + vehicle + working order',
    () => repo.registerVehicleAndOpenOrder(v.businessId,
      { plate_number: `SM-${runId.slice(-5)}`, model: 'Corolla', owner_name: 'Synthetic Owner',
        owner_phone: '0521234567', year: 2020, test_expiry: null },
      { odometer_reading: 1000, notes: 'synthetic smoke order', currency: 'ILS' }));
  const orderId = opened?.id ?? opened?.orderId ?? opened?.order?.id;
  if (orderId) record('firestorePaths', `businesses/${v.businessId}/repairOrders/${orderId}`);
  await allow(c, 'repair order listing', () => repo.listRepairOrders(v.businessId));
  await allow(c, 'parts in stock listing', () => repo.listPartsInStock(v.businessId));
  if (orderId) {
    await allow(c, 'repair/service relationship', () => repo.addServiceToOrder(orderId, [
      { type: 'labor', inventory_item_id: null, name: 'Synthetic labour', quantity: 1, cost: 0, price: 100 }]));
  }
  await refuse(c, 'cross-tenant denial: other tenant cannot read repair orders',
    () => getDocs(query(collection(identities.b.db, `businesses/${v.businessId}/repairOrders`), limit(1))));
}

// ---- 6. carParts -----------------------------------------------------------------------------
async function runCarParts() {
  const c = 'carParts';
  const p = await owner('carparts', `Smoke Parts ${runId.slice(-6)}`);
  identities.carparts = p;
  const repo = new FirestoreCarPartsRepository(p.session);

  const partInput = { part_name: `Part-${runId.slice(-4)}`, quantity: 10,
    purchase_price_unit: 30, selling_price_unit: 50 };
  const part = await allow(c, 'part create', () => repo.createPart(p.businessId, partInput));
  if (part?.id) record('firestorePaths', `businesses/${p.businessId}/parts/${part.id}`);
  await allow(c, 'part read', () => repo.listParts(p.businessId));
  if (part?.id) {
    await allow(c, 'part update / inventory flow',
      () => repo.updatePart(part.id, { ...partInput, quantity: 12 }));
  }
  await refuse(c, 'cross-tenant denial: other tenant cannot read parts',
    () => getDocs(query(collection(identities.b.db, `businesses/${p.businessId}/parts`), limit(1))));
}

// ---- 7. maliciousClient ----------------------------------------------------------------------
async function runMalicious() {
  const c = 'maliciousClient';
  const m = await identity('malicious');
  identities.malicious = m;
  const a = identities.a;

  await refuse(c, 'businessId mutation', () => updateDoc(doc(a.db, `businesses/${a.businessId}`), { businessId: randomUUID() }));
  await refuse(c, 'ownerUid mutation', () => updateDoc(doc(a.db, `businesses/${a.businessId}`), { ownerUid: m.uid }));
  await refuse(c, 'membership forgery by outsider', () => setDoc(
    doc(m.db, `businesses/${a.businessId}/restaurantStaff/${randomUUID()}`),
    { uid: m.uid, role: 'manager', businessId: a.businessId, ownerUid: a.uid, isDeleted: false }));
  await refuse(c, 'role escalation on own profile', () => updateDoc(doc(m.db, `users/${m.uid}`), { role: 'admin' }));
  await refuse(c, 'self-admin claim', () => updateDoc(doc(m.db, `users/${m.uid}`), { isPlatformAdmin: true }));
  await refuse(c, 'cross-tenant relation write', () => setDoc(
    doc(m.db, `trips/${randomUUID()}`), { ownerUid: a.uid, businessId: a.businessId, id: randomUUID() }));
  await refuse(c, 'audit tampering', () => setDoc(
    doc(m.db, `tripFinancialAudit/${randomUUID()}`), { ownerUid: a.uid, businessId: a.businessId }));
  await refuse(c, 'subscription/suspension tampering',
    () => updateDoc(doc(a.db, `businesses/${a.businessId}`), { subscriptionStatus: 'active', isSuspended: false }));
  await refuse(c, 'outsider cannot read another tenant business',
    () => getDoc(doc(m.db, `businesses/${a.businessId}`)));
}

// ---- 8. financial ----------------------------------------------------------------------------
async function runFinancial() {
  const c = 'financial';
  const a = identities.a;
  const repo = new FirestoreTravelRepository(a.session);

  const paidId = `${runId}-fin`;
  record('operationIds', paidId);
  const paid = await allow(c, 'valid financial transaction succeeds',
    () => repo.saveTrip(a.uid, tripForm({ destination: 'Paris', payment_status: 'paid', amount_paid: 1500, payments: [] }), undefined, paidId));
  const tripId = paid?.tripId ?? paid?.id ?? paid?.trip?.id;
  if (tripId) record('firestorePaths', `trips/${tripId}`);

  await allow(c, 'duplicate financial write is idempotent', async () => {
    const replay = await repo.saveTrip(a.uid, tripForm({ destination: 'Paris', payment_status: 'paid', amount_paid: 1500, payments: [] }), undefined, paidId);
    const replayId = replay?.tripId ?? replay?.id ?? replay?.trip?.id;
    assert.equal(replayId, tripId, 'replay must not create a second financial record');
  });

  if (tripId) {
    await refuse(c, 'manual authoritative total mutation denied',
      () => updateDoc(doc(a.db, `trips/${tripId}`), { amountPaidMinor: 1, salePriceMinor: 1 }));
    await refuse(c, 'invalid amount/scale rejected',
      () => updateDoc(doc(a.db, `trips/${tripId}`), { moneyScale: 99 }));
    await refuse(c, 'wrong currency rejected',
      () => updateDoc(doc(a.db, `trips/${tripId}`), { currency: 'XXX' }));
    await refuse(c, 'immutable financial event cannot be modified by a client', async () => {
      const events = await getDocs(query(collection(a.db, 'tripFinancialAudit'),
        where('ownerUid', '==', a.uid), limit(1)));
      const first = events.docs[0];
      if (!first) throw Object.assign(new Error('no financial event produced'), { code: 'no-event' });
      record('firestorePaths', `tripFinancialAudit/${first.id}`);
      await updateDoc(first.ref, { newValue: 'tampered' });
    });
  }
}

// ---- 9. hybridStorage -----------------------------------------------------------------------
async function runHybridStorage() {
  const c = 'hybridStorage';
  const url = supabaseEnv.VITE_SUPABASE_URL;
  const anon = supabaseEnv.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) { note(c, 'supabase public config present', false, 'missing supabase public config'); return; }
  const a = identities.a;
  const b = identities.b;

  // Supabase Third-Party Auth requires role: authenticated on the presented JWT. Firebase does not
  // add it, so the existing operator tool applies it; it refuses anything outside migration-test--.
  // Every identity of this run exists by now, so a single pass covers them all.
  const applied = execFileSync(process.execPath,
    ['migration/firestore/tools/supabase-role-claim.mjs', '--mode=apply'], { encoding: 'utf8' });
  note(c, 'role claim provisioned by operator tooling', applied.includes('ROLE_CLAIM_READY'));

  // Firebase rotates the token; force a refresh so the new claim is actually carried.
  const token = await a.auth.currentUser.getIdToken(true);
  await b.auth.currentUser.getIdToken(true);
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  note(c, 'Firebase identity carries role=authenticated, no Supabase Auth session',
    claims.role === 'authenticated' && claims.iss === 'https://securetoken.google.com/mydesckpro');

  const objectPath = `${a.uid}/migration-test--${runId}-signature.png`;
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const PNG2 = Buffer.concat([PNG, Buffer.from('0a', 'hex')]);
  const as = (handle, uid) => { resetStorageBackendForTests();
    bindStorageIdentity(() => new FirestoreAuthGateway(handle.session).getAccessToken(), () => uid);
    return getStorageBackend(); };
  /** Authenticated read with a cache-buster; the download path serves cached bytes otherwise. */
  const freshRead = async (handle, path) => {
    const t = await new FirestoreAuthGateway(handle.session).getAccessToken();
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`${url}/storage/v1/object/${SIGNATURE_BUCKET}/${encoded}?cb=${Date.now()}${Math.random()}`,
      { headers: { apikey: anon, Authorization: `Bearer ${t}`, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(20000) });
    return { http: r.status, ok: r.ok, bytes: r.ok ? Buffer.from(await r.arrayBuffer()) : null };
  };

  const up = await as(a, a.uid).from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG], { type: 'image/png' }), { upsert: false, contentType: 'image/png', cacheControl: '0' });
  if (!up.error) record('storageObjects', `${SIGNATURE_BUCKET}/${objectPath}`);
  note(c, 'authorized owner upload succeeds', !up.error, up.error?.message);

  const down = await as(a, a.uid).from(SIGNATURE_BUCKET).download(objectPath);
  const bytes = down.data ? Buffer.from(await down.data.arrayBuffer()) : null;
  note(c, 'authorized owner read succeeds', !down.error, down.error?.message);
  note(c, 'checksum/content matches what was written', Boolean(bytes && bytes.equals(PNG)));

  const over = await as(a, a.uid).from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG2], { type: 'image/png' }), { upsert: true, contentType: 'image/png', cacheControl: '0' });
  note(c, 'authorized owner overwrite succeeds', !over.error, over.error?.message);
  const reread = await freshRead(a, objectPath);
  note(c, 'cache-busted re-read confirms the new bytes', Boolean(reread.bytes && reread.bytes.equals(PNG2)),
    reread.bytes ? `len ${reread.bytes.length}` : `http ${reread.http}`);

  const asOther = as(b, b.uid);
  const oRead = await asOther.from(SIGNATURE_BUCKET).download(objectPath);
  note(c, 'wrong user read denied', Boolean(oRead.error), oRead.error ? null : 'WRONG USER COULD READ');
  const oWrite = await asOther.from(SIGNATURE_BUCKET)
    .upload(objectPath, new Blob([PNG2], { type: 'image/png' }), { upsert: true, contentType: 'image/png' });
  note(c, 'wrong user overwrite denied', Boolean(oWrite.error), oWrite.error ? null : 'WRONG USER COULD OVERWRITE');
  const oDel = await asOther.from(SIGNATURE_BUCKET).remove([objectPath]);
  const otherDeleted = !oDel.error && (oDel.data ?? []).length > 0;
  note(c, 'wrong user delete denied', !otherDeleted, otherDeleted ? 'WRONG USER COULD DELETE' : null);
  const crossTenant = await asOther.from(SIGNATURE_BUCKET).list(a.uid, { limit: 5 });
  const crossListed = !crossTenant.error && (crossTenant.data ?? []).length > 0;
  note(c, 'cross-tenant listing denied', !crossListed, crossListed ? 'CROSS-TENANT LISTING SUCCEEDED' : null);

  resetStorageBackendForTests();
  bindStorageIdentity(async () => null, () => null);
  const anonRead = await getStorageBackend().from(SIGNATURE_BUCKET).download(objectPath);
  note(c, 'anonymous API access denied', Boolean(anonRead.error), anonRead.error ? null : 'ANONYMOUS COULD READ');
  const cdn = await fetch(`${url}/storage/v1/object/public/${SIGNATURE_BUCKET}/${objectPath}`,
    { signal: AbortSignal.timeout(20000) });
  note(c, 'anonymous CDN access denied', !cdn.ok, `http ${cdn.status}`);

  const del = await as(a, a.uid).from(SIGNATURE_BUCKET).remove([objectPath]);
  note(c, 'authorized owner delete succeeds', !del.error && (del.data ?? []).length > 0, del.error?.message);
  const gone = await freshRead(a, objectPath);
  note(c, 'cache-busted read after delete confirms removal', !gone.ok,
    gone.ok ? `still readable http ${gone.http}` : null);
}
// ---- 10. cleanup ----------------------------------------------------------------------------
const cleanup = { clientDeletedPaths: [], clientRefusedPaths: [], storageDeleted: [], storageFailed: [], authDeleted: [], authFailed: [] };
async function runCleanup() {
  const c = 'cleanup';
  const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

  // Storage objects, using the identity that created them.
  const current = JSON.parse(readFileSync(MANIFEST, 'utf8')).createdResources;
  for (const object of current.storageObjects) {
    try {
      const token = await identities.a.auth.currentUser.getIdToken();
      const response = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/${object}`,
        { method: 'DELETE', headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
      if (response.ok) cleanup.storageDeleted.push(object); else cleanup.storageFailed.push(`${object}: http ${response.status}`);
    } catch (error) { cleanup.storageFailed.push(`${object}: ${error?.message}`); }
  }

  // Firestore documents this run recorded, newest first, by their owning identity where possible.
  const byUid = Object.fromEntries(Object.values(identities).filter((h) => h?.uid).map((h) => [h.uid, h]));
  for (const path of [...current.firestorePaths].reverse()) {
    const holder = Object.values(byUid).find((h) => (h.businessId ? path.includes(h.businessId) : false) || path.includes(h.uid)) ?? identities.a;
    try { await deleteDoc(doc(holder.db, path)); cleanup.clientDeletedPaths.push(path); }
    catch (error) { cleanup.clientRefusedPaths.push(`${path}: ${error?.code ?? error?.message}`); }
  }

  // Each synthetic identity deletes its own Auth account.
  for (const handle of Object.values(identities)) {
    if (!handle?.auth?.currentUser) continue;
    const uid = handle.uid;
    try { await handle.auth.currentUser.delete(); cleanup.authDeleted.push(uid); }
    catch (error) { cleanup.authFailed.push(`${uid}: ${error?.code ?? error?.message}`); }
  }
  note(c, 'cleanup executed for every recorded resource', true,
    `firestore deleted ${cleanup.clientDeletedPaths.length}, refused ${cleanup.clientRefusedPaths.length}; auth deleted ${cleanup.authDeleted.length}`);
}

// ---- run -------------------------------------------------------------------------------------
const order = [['auth', runAuth], ['tourism', runTourism], ['restaurant', runRestaurant],
  ['supermarket', runSupermarket], ['autoRepair', runAutoRepair], ['carParts', runCarParts],
  ['maliciousClient', runMalicious], ['financial', runFinancial], ['hybridStorage', runHybridStorage]];

for (const [name, fn] of order) {
  try { await fn(); } catch (error) { note(name, 'category aborted', false, `${error?.code ?? ''} ${String(error?.message ?? error).slice(0, 300)}`); }
}
try { await runCleanup(); } catch (error) { note('cleanup', 'category aborted', false, String(error?.message ?? error).slice(0, 300)); }

for (const [name] of [...order, ['cleanup']]) {
  const own = checks.filter((check) => check.category === name);
  categories[name] = own.length === 0 ? 'NOT_RUN' : own.every((check) => check.ok) ? 'PASS' : 'FAIL';
}

for (const app of apps) { try { await deleteApp(app); } catch { /* already disposed */ } }

const report = {
  generatedAt: new Date().toISOString(), target: 'PRODUCTION', project: PROJECT, clientSdk: true,
  migrationRunId: runId, categories,
  checks, cleanup,
  createdResources: JSON.parse(readFileSync(MANIFEST, 'utf8')).createdResources,
  status: Object.values(categories).every((value) => value === 'PASS') ? 'PASS' : 'FAIL',
  note: 'Self-reported. Residue is verified independently by finalize-production-client-smoke.mjs.',
};
writeFileSync(RUN_REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ categories, status: report.status,
  failed: checks.filter((check) => !check.ok).map((check) => `${check.category}/${check.name}: ${check.detail}`) }, null, 2));
