/**
 * Car parts inventory on Firebase Auth + Firestore + Rules.
 *
 * Repository behaviour runs through FirestoreCarPartsRepository exactly as CarPartsInventory calls it. The
 * malicious-client cases are raw client-SDK writes built from valid documents with one thing changed, so each denial
 * is attributable to the rule under test.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-car-parts.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc,
  Timestamp, updateDoc,
} from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreCarPartsRepository } from '../src/data/firestore/FirestoreCarPartsRepository.ts';
import { FirestoreAutoRepairRepository } from '../src/data/firestore/FirestoreAutoRepairRepository.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { timestampToMicros } from '../src/data/firestore/exactValues.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

/** MYDESCK_TEST_PROJECT isolates a run in its own emulator project, so it can run beside other suites. */
const PROJECT = process.env.MYDESCK_TEST_PROJECT ?? 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Parts-${RUN}-9!`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const accounts = new Set();
const clients = [];
const tenants = [];
const denied = (error) => error?.code === 'permission-denied';
const SUBCOLLECTIONS = ['parts', 'repairOrders', 'repairOrderItems', 'repairServices', 'vehicles', 'vehiclePlates'];
const restCodec = {
  timestamp: (seconds, nanoseconds) => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)),
  serverTimestamp: () => new Date(), deleteField: () => { throw new Error('DELETE_FIELD_OVER_REST'); }, newId: () => randomUUID(),
};

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}:${await response.text()}`);
}

async function owner(label) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `parts-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = FIRESTORE_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
  const handle = { app, auth, db, session, parts: new FirestoreCarPartsRepository(session), repair: new FirestoreAutoRepairRepository(session) };
  clients.push(handle);
  if (label === 'anonymous') return handle;
  const email = `migration-test--parts-${label}-${RUN}@example.com`;
  const user = await new FirestoreAuthGateway(session).signUp(email, PASSWORD);
  accounts.add(user.id);
  await new FirestoreProfileRepository(session).createOwnerProfiles(user.id, email, { businessName: `Parts ${label}`, logoUrl: null, currency: 'ILS', language: 'en' });
  const business = await session.requireOwnedBusiness();
  await bypass.update(`businesses/${business.businessId}`, { businessType: 'auto_repair' });
  tenants.push({ uid: user.id, businessId: business.businessId });
  return { ...handle, uid: user.id, businessId: business.businessId };
}

/** PartFormModal's payload: its initial state with the fields the user filled; empty prices stay undefined. */
const formPart = (overrides = {}) => ({ part_name: 'Brake pads', description: '', serial_number: '', compatible_cars: [], quantity: 1,
  purchase_price_unit: undefined, purchase_price_total: undefined, selling_price_unit: undefined, ...overrides });
const partPath = (tenant, id) => `businesses/${tenant.businessId}/parts/${id}`;

const s = {};
before(async () => {
  await loadRules();
  s.a = await owner('a');
  s.b = await owner('b');
  s.c = await owner('c');
  s.anonymous = await owner('anonymous');
});

after(async () => {
  for (const handle of clients) {
    await signOut(handle.auth).catch(() => undefined);
    await deleteApp(handle.app).catch(() => undefined);
  }
  const base = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  for (const tenant of tenants) {
    for (const name of SUBCOLLECTIONS) {
      const listing = await fetch(`${base}/businesses/${tenant.businessId}/${name}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
        .then((response) => response.json());
      for (const document of listing.documents ?? []) await bypass.delete(document.name.split('/documents/')[1]);
    }
    await bypass.delete(`businesses/${tenant.businessId}`);
    await bypass.delete(`businessOwners/${tenant.uid}`);
    await bypass.delete(`users/${tenant.uid}`);
  }
  for (const localId of accounts) {
    await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId }),
    }).catch(() => undefined);
  }
});

test('a part is created with the source defaults and returned as INSERT ... RETURNING returns it', async () => {
  const created = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Oil filter', description: 'OEM', serial_number: 'SKU-1',
    compatible_cars: ['Toyota Corolla', 'Mazda 3'], quantity: 7, purchase_price_unit: 12.5, purchase_price_total: 87.5, selling_price_unit: 19.99 }));
  assert.match(created.id, UUID);
  assert.deepEqual({ business_id: created.business_id, part_name: created.part_name, description: created.description, serial_number: created.serial_number,
    compatible_cars: created.compatible_cars, quantity: created.quantity, purchase_price_unit: created.purchase_price_unit,
    purchase_price_total: created.purchase_price_total, selling_price_unit: created.selling_price_unit },
  { business_id: s.a.businessId, part_name: 'Oil filter', description: 'OEM', serial_number: 'SKU-1', compatible_cars: ['Toyota Corolla', 'Mazda 3'],
    quantity: 7, purchase_price_unit: 12.5, purchase_price_total: 87.5, selling_price_unit: 19.99 });
  assert.ok(Math.abs(Date.parse(created.created_at) - Date.now()) < 60_000, 'created_at defaults to now()');
  assert.equal(created.updated_at, created.created_at, 'both defaults take the same statement time');

  const minimal = await s.a.parts.createPart(s.a.businessId, { part_name: 'Wiper blade' });
  assert.equal(minimal.quantity, 0, 'quantity DEFAULT 0');
  assert.deepEqual([minimal.description, minimal.serial_number, minimal.compatible_cars, minimal.purchase_price_unit, minimal.selling_price_unit],
    [null, null, null, null, null]);
  const listed = await s.a.parts.listParts(s.a.businessId);
  assert.deepEqual(listed.slice(0, 2).map((part) => part.id), [minimal.id, created.id], 'newest first');
});

test('NUMERIC(10,2) rounds half away from zero, and an overflow is refused before anything is written', async () => {
  const rounded = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Rounding', quantity: 3, purchase_price_total: 100,
    purchase_price_unit: 100 / 3, selling_price_unit: 2.005 }));
  assert.equal(rounded.purchase_price_unit, 33.33);
  assert.equal(rounded.selling_price_unit, 2.01);
  const negative = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Credit', selling_price_unit: -1.005 }));
  assert.equal(negative.selling_price_unit, -1.01, 'the source has no CHECK on prices');
  const before = (await s.a.parts.listParts(s.a.businessId)).length;
  // The codec reports the column and wraps the exact-value refusal: INVALID_VALUE (NUMERIC_FIELD_OVERFLOW: ...).
  const overflow = (error) => error.code === 'INVALID_VALUE' && /NUMERIC_FIELD_OVERFLOW/.test(error.message);
  await assert.rejects(() => s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Too dear', purchase_price_unit: 123456789 })), overflow);
  await assert.rejects(() => s.a.parts.updatePart(rounded.id, formPart({ part_name: 'Rounding', selling_price_unit: 100000000 })), overflow);
  assert.equal((await s.a.parts.listParts(s.a.businessId)).length, before);
  assert.equal((await s.a.parts.listParts(s.a.businessId)).find((part) => part.id === rounded.id).selling_price_unit, 2.01);
});

test('the list is newest first with undated parts first, and a document filed under another business never appears', async () => {
  const seed = async (name, createdAt, businessId = s.c.businessId) => {
    const encoded = encodeInsert('car_parts', { business_id: businessId, part_name: name, created_at: createdAt }, restCodec,
      { ownerUid: s.c.uid, businessId: s.c.businessId });
    assert.ok((await bypass.set(partPath(s.c, encoded.id), encoded.data)).ok, name);
    return encoded.id;
  };
  await seed('January', '2026-01-01T00:00:00Z');
  await seed('February', '2026-02-01T00:00:00.123456Z');
  await seed('Undated', null);
  await seed('February, a microsecond later', '2026-02-01T00:00:00.123457Z');
  await seed('Filed under business A', '2026-03-01T00:00:00Z', s.a.businessId);
  const names = (await s.c.parts.listParts(s.c.businessId)).map((part) => part.part_name);
  assert.deepEqual(names, ['Undated', 'February, a microsecond later', 'February', 'January']);
});

test('an edit saves the form columns, stamps updated_at, and keeps what the form left undefined', async () => {
  const part = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Air filter', quantity: 2, selling_price_unit: 30 }));
  const edited = await s.a.parts.updatePart(part.id, { part_name: 'Air filter XL', description: 'Sport', serial_number: 'AF-2',
    compatible_cars: ['Kia Rio'], quantity: 4, purchase_price_unit: 11, purchase_price_total: 44, selling_price_unit: 21.5 });
  assert.deepEqual([edited.part_name, edited.description, edited.serial_number, edited.compatible_cars, edited.quantity,
    edited.purchase_price_unit, edited.purchase_price_total, edited.selling_price_unit],
  ['Air filter XL', 'Sport', 'AF-2', ['Kia Rio'], 4, 11, 44, 21.5]);
  assert.equal(edited.created_at, part.created_at);
  assert.ok(timestampToMicros(edited.updated_at) > timestampToMicros(part.updated_at), 'update_car_parts_updated_at');
  const kept = await s.a.parts.updatePart(part.id, { part_name: 'Air filter XL', quantity: 5, selling_price_unit: undefined });
  assert.equal(kept.selling_price_unit, 21.5, 'an undefined field is not sent');
  assert.equal(kept.quantity, 5);
});

test('editing a part that does not exist fails as .single() does and writes nothing', async () => {
  const part = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Short-lived' }));
  await s.a.parts.deletePart(part.id);
  await assert.rejects(() => s.a.parts.updatePart(part.id, formPart({ part_name: 'Resurrected' })), (error) => error.code === 'PGRST116');
  assert.equal((await bypass.get(partPath(s.a, part.id))).ok, false, 'the edit did not recreate the part');
  await assert.rejects(() => s.a.parts.updatePart(randomUUID(), formPart()), (error) => error.code === 'PGRST116');
});

test('deleting removes only that part, and deleting a missing part is not an error', async () => {
  const keep = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Keep' }));
  const gone = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Gone' }));
  await s.a.parts.deletePart(gone.id);
  const ids = (await s.a.parts.listParts(s.a.businessId)).map((part) => part.id);
  assert.ok(ids.includes(keep.id) && !ids.includes(gone.id));
  await s.a.parts.deletePart(gone.id);
  await s.a.parts.deletePart(randomUUID());
});

test('a repair service consumes an inventory part, and the inventory edit still works afterwards', async () => {
  const part = await s.b.parts.createPart(s.b.businessId, formPart({ part_name: 'Spark plug', quantity: 6, purchase_price_unit: 3, selling_price_unit: 7.25 }));
  await s.b.repair.registerVehicleAndOpenOrder(s.b.businessId, { plate_number: `PARTS-${RUN}`, model: 'Mazda 3', owner_name: 'Owner',
    owner_phone: '050-0000000', test_expiry: null }, { currency: 'ILS' });
  const [order] = await s.b.repair.listRepairOrders(s.b.businessId);
  await s.b.repair.addServiceToOrder(order.id, [{ type: 'part', inventory_item_id: part.id, name: 'Spark plug', quantity: 4, cost: 12, price: 29 }]);
  assert.equal((await s.b.parts.listParts(s.b.businessId)).find((row) => row.id === part.id).quantity, 2);
  assert.equal((await s.b.repair.listRepairOrders(s.b.businessId))[0].total_amount, 29);
  const edited = await s.b.parts.updatePart(part.id, formPart({ part_name: 'Spark plug', quantity: 10, purchase_price_unit: 3, selling_price_unit: 7.25 }));
  assert.equal(edited.quantity, 10);
});

test('another tenant and anonymous callers are denied every parts read and write', async () => {
  const part = await s.a.parts.createPart(s.a.businessId, formPart({ part_name: 'Protected' }));
  const foreign = (id) => doc(s.b.db, 'businesses', s.a.businessId, 'parts', id);
  await assert.rejects(() => s.b.parts.listParts(s.a.businessId), /TENANT_MISMATCH/);
  await assert.rejects(() => s.b.parts.createPart(s.a.businessId, formPart()), /TENANT_MISMATCH/);
  await assert.rejects(() => getDocs(collection(s.b.db, 'businesses', s.a.businessId, 'parts')), denied);
  await assert.rejects(() => getDoc(foreign(part.id)), denied);
  const intruder = encodeInsert('car_parts', { business_id: s.a.businessId, part_name: 'Intruder' }, s.b.session.codec(),
    { ownerUid: s.b.uid, businessId: s.a.businessId });
  await assert.rejects(() => setDoc(foreign(intruder.id), intruder.data), denied);
  await assert.rejects(() => updateDoc(foreign(part.id), { quantity: 0, updatedAt: serverTimestamp(), updatedAtMicros: deleteField() }), denied);
  await assert.rejects(() => deleteDoc(foreign(part.id)), denied);
  // B's repository works on B's business only: A's part id means nothing there.
  await assert.rejects(() => s.b.parts.updatePart(part.id, formPart()), (error) => error.code === 'PGRST116');
  await s.b.parts.deletePart(part.id);
  assert.ok((await bypass.get(partPath(s.a, part.id))).ok, "A's part survives B's delete");
  await assert.rejects(() => getDocs(collection(s.anonymous.db, 'businesses', s.a.businessId, 'parts')), denied);
  await assert.rejects(() => deleteDoc(doc(s.anonymous.db, 'businesses', s.a.businessId, 'parts', part.id)), denied);
});

test('malicious clients cannot move tenancy, forge the update stamp, bypass validation or fake a service', async () => {
  const ref = (id) => doc(s.a.db, 'businesses', s.a.businessId, 'parts', id);
  const valid = () => encodeInsert('car_parts', { business_id: s.a.businessId, part_name: 'Raw part', quantity: 2 }, s.a.session.codec(),
    { ownerUid: s.a.uid, businessId: s.a.businessId });
  const accepted = valid();
  await setDoc(ref(accepted.id), accepted.data);

  const creates = [
    ['a part filed under another business', (data) => ({ ...data, sourceBusinessId: s.b.businessId })],
    ['a part owned by another uid', (data) => ({ ...data, ownerUid: s.b.uid })],
    ['a part already consumed by a service', (data) => ({ ...data, lastRepairServiceId: randomUUID() })],
    ['an unknown field', (data) => ({ ...data, isFeatured: true })],
    ['a quantity that is not an integer', (data) => ({ ...data, quantity: '2' })],
    ['a price with three decimals', (data) => ({ ...data, sellingPriceUnit: { unitsText: '12345', units: 12345, scale: 3, decimal: '12.345' } })],
    ['a deleted flag', (data) => ({ ...data, isDeleted: true })],
  ];
  for (const [name, mutate] of creates) {
    const candidate = valid();
    await assert.rejects(() => setDoc(ref(candidate.id), mutate(candidate.data)), denied, name);
  }
  const misplaced = valid();
  await assert.rejects(() => setDoc(ref(randomUUID()), misplaced.data), denied, 'a document id different from the part id');

  const stamp = { updatedAt: serverTimestamp(), updatedAtMicros: deleteField() };
  const updates = [
    ['move the part to another business', { sourceBusinessId: s.b.businessId, ...stamp }],
    ['change the owner', { ownerUid: s.b.uid, ...stamp }],
    ['change the creation time', { createdAt: Timestamp.fromMillis(0), createdAtMicros: '0', ...stamp }],
    ['an edit without the trigger stamp', { quantity: 99 }],
    ['an edit with a client-chosen stamp', { quantity: 99, updatedAt: Timestamp.fromMillis(Date.now() - 60_000), updatedAtMicros: deleteField() }],
    ['stock taken without a service record', { quantity: 0, lastRepairServiceId: randomUUID(), ...stamp }],
    ['a fractional quantity', { quantity: 1.5, ...stamp }],
    ['a deleted flag', { isDeleted: true, ...stamp }],
  ];
  for (const [name, patch] of updates) await assert.rejects(() => updateDoc(ref(accepted.id), patch), denied, name);
  await updateDoc(ref(accepted.id), { quantity: 3, ...stamp });
  assert.equal((await getDoc(ref(accepted.id))).data().quantity, 3, 'the same edit with the stamp is accepted');
});

test('a suspended owner or business loses access', async () => {
  const part = await s.c.parts.createPart(s.c.businessId, formPart({ part_name: 'Suspended check' }));
  const refused = (error) => denied(error) || /SUSPENDED|NOT_FOUND|PERMISSION/i.test(String(error?.message));
  await bypass.update(`users/${s.c.uid}`, { isSuspended: true });
  await assert.rejects(() => s.c.parts.listParts(s.c.businessId), refused);
  await assert.rejects(() => s.c.parts.updatePart(part.id, formPart({ part_name: 'x' })), refused);
  await bypass.update(`users/${s.c.uid}`, { isSuspended: false });
  await bypass.update(`businesses/${s.c.businessId}`, { isSuspended: true });
  await assert.rejects(() => s.c.parts.deletePart(part.id), refused);
  await bypass.update(`businesses/${s.c.businessId}`, { isSuspended: false });
  assert.ok((await bypass.get(partPath(s.c, part.id))).ok);
});
