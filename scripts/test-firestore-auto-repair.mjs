/**
 * Auto repair on Firebase Auth + Firestore + Rules.
 *
 * Repository behaviour runs through FirestoreAutoRepairRepository exactly as Cars, NewCarForm and
 * AddServiceModal call it. The malicious-client cases are raw client-SDK writes built from valid documents
 * with one thing changed, so each denial is attributable to the rule under test.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-auto-repair.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc,
  updateDoc, writeBatch,
} from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreAutoRepairRepository, vehiclePlateKey } from '../src/data/firestore/FirestoreAutoRepairRepository.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { encodeNumeric } from '../src/data/firestore/exactValues.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

/** MYDESCK_TEST_PROJECT isolates a run in its own emulator project, so it can run beside other suites. */
const PROJECT = process.env.MYDESCK_TEST_PROJECT ?? 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Repair-${RUN}-9!`;
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const accounts = new Set();
const clients = [];
const denied = (error) => error?.code === 'permission-denied';
const SUBCOLLECTIONS = ['repairOrders', 'repairOrderItems', 'repairServices', 'vehicles', 'vehiclePlates', 'parts'];

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}:${await response.text()}`);
}

async function owner(label) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `repair-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
  const handle = { app, auth, db, session, repair: new FirestoreAutoRepairRepository(session) };
  clients.push(handle);
  if (label === 'anonymous') return handle;
  const gateway = new FirestoreAuthGateway(session);
  const email = `migration-test--repair-${label}-${RUN}@example.com`;
  const user = await gateway.signUp(email, PASSWORD);
  accounts.add(user.id);
  await new FirestoreProfileRepository(session).createOwnerProfiles(user.id, email, { businessName: `Garage ${label}`, logoUrl: null, currency: 'ILS', language: 'he' });
  const business = await session.requireOwnedBusiness();
  await bypass.update(`businesses/${business.businessId}`, { businessType: 'auto_repair' });
  return { ...handle, uid: user.id, businessId: business.businessId };
}

const restCodec = {
  timestamp: (seconds, nanoseconds) => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)),
  serverTimestamp: () => new Date(), deleteField: () => { throw new Error('DELETE_FIELD_OVER_REST'); }, newId: () => randomUUID(),
};
async function seedPart(handle, overrides = {}) {
  const part = encodeInsert('car_parts', {
    business_id: handle.businessId, part_name: 'Brake pads', quantity: 5, purchase_price_unit: 12.25, selling_price_unit: 19.99,
    compatible_cars: ['Toyota Corolla'], ...overrides,
  }, restCodec, { ownerUid: handle.uid, businessId: handle.businessId });
  const written = await bypass.set(`businesses/${handle.businessId}/parts/${part.id}`, part.data);
  assert.ok(written.ok, `part fixture: ${JSON.stringify(written.body)}`);
  return part.id;
}

const vehicle = { plate_number: '12-345-67', model: 'Toyota Corolla', owner_name: 'דני כהן', owner_phone: '050-1234567', color: 'White',
  year: 2020, test_expiry: '2027-03-01', trim_level: 'GLI', ownership: 'Private' };
const s = {};
const scoped = (handle, name, id) => doc(handle.db, 'businesses', handle.businessId, name, id);

before(async () => {
  await loadRules();
  s.a = await owner('a');
  s.b = await owner('b');
  s.anon = await owner('anonymous');
});

after(async () => {
  for (const handle of clients) {
    await signOut(handle.auth).catch(() => undefined);
    await deleteApp(handle.app).catch(() => undefined);
  }
  const base = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  for (const handle of [s.a, s.b]) {
    if (!handle?.businessId) continue;
    for (const name of SUBCOLLECTIONS) {
      const listing = await fetch(`${base}/businesses/${handle.businessId}/${name}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
        .then((response) => response.json());
      for (const document of listing.documents ?? []) await bypass.delete(document.name.split('/documents/')[1]);
    }
    await bypass.delete(`businesses/${handle.businessId}`);
    await bypass.delete(`businessOwners/${handle.uid}`);
    await bypass.delete(`users/${handle.uid}`);
  }
  for (const localId of accounts) {
    await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId }),
    }).catch(() => undefined);
  }
});

test('a car is registered with its plate index and a working order; the same plate updates the vehicle and opens another order', async () => {
  await s.a.repair.registerVehicleAndOpenOrder(s.a.businessId, vehicle, { odometer_reading: 120000, notes: 'Brakes squeak', currency: 'ILS' });
  let orders = await s.a.repair.listRepairOrders(s.a.businessId);
  assert.equal(orders.length, 1);
  const [first] = orders;
  assert.equal(first.status, 'working');
  assert.equal(first.total_amount, 0);
  assert.equal(first.currency, 'ILS');
  assert.equal(first.odometer_reading, 120000);
  assert.equal(first.payment_status, 'unpaid');
  assert.equal(first.vehicle.plate_number, vehicle.plate_number);
  assert.equal(first.vehicle.owner_name, 'דני כהן');
  assert.equal(first.vehicle.test_expiry, '2027-03-01');
  assert.deepEqual(first.items, []);
  const index = await getDoc(scoped(s.a, 'vehiclePlates', await vehiclePlateKey(vehicle.plate_number)));
  assert.equal(index.data().vehicleId, first.vehicle_id);

  await s.a.repair.registerVehicleAndOpenOrder(s.a.businessId, { ...vehicle, model: 'Toyota Corolla Hybrid', owner_phone: undefined },
    { odometer_reading: 125000, currency: 'ILS' });
  orders = await s.a.repair.listRepairOrders(s.a.businessId);
  assert.equal(orders.length, 2);
  assert.equal(new Set(orders.map((order) => order.vehicle_id)).size, 1, 'the plate identifies one vehicle');
  assert.ok(orders.every((order) => order.vehicle.model === 'Toyota Corolla Hybrid'), 'the existing vehicle was updated');
  assert.equal(orders[0].vehicle.owner_phone, '050-1234567', 'a field the form left empty is not sent, so it is kept');
  assert.equal(Date.parse(orders[0].created_at) >= Date.parse(orders[1].created_at), true, 'newest first');
  s.orderId = orders[1].id;
  s.vehicleId = first.vehicle_id;
});

test('parts in stock are listed by part name in the source collation, without empty stock', async () => {
  s.partId = await seedPart(s.a, { part_name: 'Brake pads', quantity: 5 });
  await seedPart(s.a, { part_name: 'air filter', quantity: 2 });
  await seedPart(s.a, { part_name: 'Alternator', quantity: 0 });
  await seedPart(s.a, { part_name: 'אטם', quantity: 1 });
  const parts = await s.a.repair.listPartsInStock(s.a.businessId);
  assert.deepEqual(parts.map((part) => part.part_name), ['air filter', 'Brake pads', 'אטם']);
  assert.equal(parts[1].selling_price_unit, 19.99);
});

test('a part and labor consume stock and raise the order totals with exact NUMERIC arithmetic', async () => {
  await s.a.repair.addServiceToOrder(s.orderId, [
    { type: 'part', inventory_item_id: s.partId, name: 'Brake pads', quantity: 3, cost: 12.25 * 3, price: 19.99 * 3 },
    { type: 'labor', inventory_item_id: null, name: 'Service Labor (Hand Cost)', quantity: 1, cost: 0, price: 150.5 },
  ]);
  const order = (await s.a.repair.listRepairOrders(s.a.businessId)).find((row) => row.id === s.orderId);
  assert.equal(order.parts_total, 59.97);
  assert.equal(order.labor_total, 150.5);
  assert.equal(order.total_amount, 210.47);
  assert.equal(order.items.length, 2);
  const part = order.items.find((item) => item.type === 'part');
  assert.deepEqual([part.name, part.quantity, part.price, part.cost, part.inventory_item_id], ['Brake pads', 3, 59.97, 36.75, s.partId]);
  const labor = order.items.find((item) => item.type === 'labor');
  assert.deepEqual([labor.name, labor.quantity, labor.price, labor.cost, labor.inventory_item_id], ['Service Labor (Hand Cost)', 1, 150.5, 0, null]);
  const stored = (await getDoc(scoped(s.a, 'repairOrders', s.orderId))).data();
  assert.deepEqual([stored.totalAmount.unitsText, stored.totalAmount.scale], ['21047', 2]);
  assert.equal((await getDoc(scoped(s.a, 'parts', s.partId))).data().quantity, 2);
  const services = await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'repairServices'));
  assert.equal(services.size, 1);
  s.serviceId = services.docs[0].id;
});

test('insufficient stock, a changed price and a missing order are refused and change nothing', async () => {
  const before = (await getDoc(scoped(s.a, 'repairOrders', s.orderId))).data();
  await assert.rejects(() => s.a.repair.addServiceToOrder(s.orderId, [
    { type: 'part', inventory_item_id: s.partId, name: 'Brake pads', quantity: 9, cost: 0, price: 19.99 * 9 },
  ]), /Insufficient stock for part\. Available: 2, Requested: 9/);
  await assert.rejects(() => s.a.repair.addServiceToOrder(s.orderId, [
    { type: 'part', inventory_item_id: s.partId, name: 'Brake pads', quantity: 1, cost: 0, price: 18 },
  ]), /REPAIR_SERVICE_PART_PRICE_CHANGED/);
  await assert.rejects(() => s.a.repair.addServiceToOrder('00000000-0000-4000-8000-00000000dead', [
    { type: 'labor', inventory_item_id: null, name: 'Labor', quantity: 1, cost: 0, price: 10 },
  ]), /Order not found/);
  await assert.rejects(() => s.a.repair.addServiceToOrder(s.orderId, [
    { type: 'part', inventory_item_id: '00000000-0000-4000-8000-00000000beef', name: 'Ghost', quantity: 1, cost: 0, price: 1 },
  ]), /Part not found/);
  const afterRefusals = (await getDoc(scoped(s.a, 'repairOrders', s.orderId))).data();
  assert.deepEqual(afterRefusals.totalAmount, before.totalAmount);
  assert.equal((await getDoc(scoped(s.a, 'parts', s.partId))).data().quantity, 2);
});

test('another tenant and anonymous callers are denied every auto repair read and write', async () => {
  for (const name of SUBCOLLECTIONS.filter((item) => item !== 'vehiclePlates')) {
    await assert.rejects(() => getDocs(collection(s.b.db, 'businesses', s.a.businessId, name)), denied, `other tenant lists ${name}`);
    await assert.rejects(() => getDocs(collection(s.anon.db, 'businesses', s.a.businessId, name)), denied, `anonymous lists ${name}`);
  }
  await assert.rejects(() => s.b.repair.listRepairOrders(s.a.businessId), /TENANT_MISMATCH/);
  await assert.rejects(() => getDoc(doc(s.b.db, 'businesses', s.a.businessId, 'repairOrders', s.orderId)), denied);
  const intruderOrder = encodeInsert('repair_orders', { business_id: s.a.businessId, vehicle_id: s.vehicleId, status: 'working', total_amount: 0, currency: 'ILS' },
    s.b.session.codec(), { ownerUid: s.b.uid, businessId: s.a.businessId });
  await assert.rejects(() => setDoc(doc(s.b.db, 'businesses', s.a.businessId, 'repairOrders', intruderOrder.id), intruderOrder.data), denied);
  await assert.rejects(() => s.b.repair.addServiceToOrder(s.orderId, [{ type: 'labor', inventory_item_id: null, name: 'x', quantity: 1, cost: 0, price: 1 }]),
    /Order not found|permission|PERMISSION/);
});

test('malicious clients cannot forge totals, cross-link vehicles, duplicate plates, or tamper payments, status and audit records', async () => {
  const ctx = s.a.session.codec();
  const orderRef = scoped(s.a, 'repairOrders', s.orderId);
  const itemDocs = await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'repairOrderItems'));
  const itemRef = itemDocs.docs[0].ref;
  const serviceRef = scoped(s.a, 'repairServices', s.serviceId);

  await assert.rejects(() => updateDoc(orderRef, { totalAmount: encodeNumeric(9999), updatedAt: serverTimestamp(), updatedAtMicros: deleteField(),
    lastRepairServiceId: randomUUID() }), denied, 'totals raised without a service record');
  await assert.rejects(() => updateDoc(orderRef, { paidAmount: encodeNumeric(210.47), paymentStatus: 'paid' }), denied, 'payment tampering');
  await assert.rejects(() => updateDoc(orderRef, { status: 'completed' }), denied, 'status transition with no reachable flow');
  await assert.rejects(() => updateDoc(orderRef, { businessId: s.b.businessId }), denied, 'tenancy moved');
  await assert.rejects(() => updateDoc(serviceRef, { laborPrice: encodeNumeric(1) }), denied, 'service record edited');
  await assert.rejects(() => deleteDoc(serviceRef), denied, 'service record deleted while its order exists');
  await assert.rejects(() => updateDoc(itemRef, { price: encodeNumeric(1) }), denied, 'item edited');
  await assert.rejects(() => deleteDoc(itemRef), denied, 'item deleted while its order exists');
  await assert.rejects(() => updateDoc(scoped(s.a, 'parts', s.partId), { quantity: 100, lastRepairServiceId: randomUUID(), updatedAt: serverTimestamp() }),
    denied, 'stock raised under a service id that does not exist');

  // A forged service: the part billed at 1.00 for three units instead of selling_price_unit x 3.
  const forged = writeBatch(s.a.db);
  const serviceId = randomUUID();
  const partItemId = randomUUID();
  const cheap = encodeNumeric(1);
  const partItem = encodeInsert('repair_order_items', { id: partItemId, order_id: s.orderId, type: 'part', inventory_item_id: s.partId, name: 'Brake pads',
    quantity: 1, cost: 0, price: 1, warranty_days: 0 }, ctx, { ownerUid: s.a.uid, businessId: s.a.businessId });
  const current = (await getDoc(orderRef)).data();
  forged.set(scoped(s.a, 'repairOrderItems', partItemId), { ...partItem.data, repairServiceId: serviceId });
  forged.update(scoped(s.a, 'parts', s.partId), { quantity: 1, updatedAt: serverTimestamp(), updatedAtMicros: deleteField(), lastRepairServiceId: serviceId });
  forged.update(orderRef, { partsTotal: encodeNumeric(60.97), totalAmount: encodeNumeric(211.47), updatedAt: serverTimestamp(), updatedAtMicros: deleteField(),
    lastRepairServiceId: serviceId, laborTotal: current.laborTotal });
  forged.set(scoped(s.a, 'repairServices', serviceId), { id: serviceId, orderId: s.orderId, actorUid: s.a.uid, businessId: s.a.businessId, ownerUid: s.a.uid,
    partId: s.partId, partQuantity: 1, partPrice: cheap, partCost: encodeNumeric(0), laborPrice: encodeNumeric(0), partItemId, laborItemId: null,
    createdAt: serverTimestamp(), schemaVersion: 1 });
  await assert.rejects(() => forged.commit(), denied, 'a part billed below its selling price');

  // Cross-linking: an order on a vehicle id that is not this business's vehicle.
  const foreignVehicle = randomUUID();
  const linked = encodeInsert('repair_orders', { business_id: s.a.businessId, vehicle_id: foreignVehicle, status: 'working', total_amount: 0, currency: 'ILS' },
    ctx, { ownerUid: s.a.uid, businessId: s.a.businessId });
  await assert.rejects(() => setDoc(scoped(s.a, 'repairOrders', linked.id), linked.data), denied, 'order on a vehicle outside the business');
  const settled = encodeInsert('repair_orders', { business_id: s.a.businessId, vehicle_id: s.vehicleId, status: 'completed', total_amount: 0, currency: 'ILS' },
    ctx, { ownerUid: s.a.uid, businessId: s.a.businessId });
  await assert.rejects(() => setDoc(scoped(s.a, 'repairOrders', settled.id), settled.data), denied, 'an order created already completed');

  // Plates: a second vehicle with an existing plate, a vehicle without its index, an index under the wrong key.
  const duplicate = encodeInsert('customer_vehicles', { business_id: s.a.businessId, plate_number: vehicle.plate_number, owner_name: 'x', owner_phone: '0' },
    ctx, { ownerUid: s.a.uid, businessId: s.a.businessId });
  const plateKey = await vehiclePlateKey(vehicle.plate_number);
  const duplicateBatch = writeBatch(s.a.db);
  duplicateBatch.set(scoped(s.a, 'vehicles', duplicate.id), duplicate.data);
  duplicateBatch.set(scoped(s.a, 'vehiclePlates', plateKey), { plateNumber: vehicle.plate_number, vehicleId: duplicate.id, businessId: s.a.businessId, schemaVersion: 1 });
  await assert.rejects(() => duplicateBatch.commit(), denied, 'duplicate plate');
  const unindexed = encodeInsert('customer_vehicles', { business_id: s.a.businessId, plate_number: '99-999-99', owner_name: 'x', owner_phone: '0' },
    ctx, { ownerUid: s.a.uid, businessId: s.a.businessId });
  await assert.rejects(() => setDoc(scoped(s.a, 'vehicles', unindexed.id), unindexed.data), denied, 'vehicle without its plate index');
  const wrongKey = writeBatch(s.a.db);
  wrongKey.set(scoped(s.a, 'vehicles', unindexed.id), unindexed.data);
  wrongKey.set(scoped(s.a, 'vehiclePlates', 'not-the-plate-hash'), { plateNumber: '99-999-99', vehicleId: unindexed.id, businessId: s.a.businessId, schemaVersion: 1 });
  await assert.rejects(() => wrongKey.commit(), denied, 'plate index under a key that is not the plate hash');
  await assert.rejects(() => updateDoc(scoped(s.a, 'vehicles', s.vehicleId), { plateNumber: '00-000-00' }), denied, 'plate changed under its index');
  await assert.rejects(() => deleteDoc(scoped(s.a, 'vehicles', s.vehicleId)), denied, 'vehicles have no delete in the source');
});

test('deleting an order removes its items and service records and nothing else', async () => {
  const [kept] = (await s.a.repair.listRepairOrders(s.a.businessId)).filter((order) => order.id !== s.orderId);
  await s.a.repair.deleteRepairOrder(s.orderId);
  const orders = await s.a.repair.listRepairOrders(s.a.businessId);
  assert.deepEqual(orders.map((order) => order.id), [kept.id]);
  assert.equal((await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'repairOrderItems'))).size, 0);
  assert.equal((await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'repairServices'))).size, 0);
  assert.equal((await getDoc(scoped(s.a, 'vehicles', s.vehicleId))).exists(), true, 'the vehicle stays');
  assert.equal((await getDoc(scoped(s.a, 'parts', s.partId))).data().quantity, 2, 'consumed stock is not returned, as in the source');
});

test('a suspended owner or business loses access', async () => {
  await bypass.update(`users/${s.a.uid}`, { isSuspended: true });
  try {
    await assert.rejects(() => getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'repairOrders')), denied);
  } finally {
    await bypass.update(`users/${s.a.uid}`, { isSuspended: false });
  }
  await bypass.update(`businesses/${s.a.businessId}`, { isSuspended: true });
  try {
    await assert.rejects(() => getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'vehicles')), denied);
  } finally {
    await bypass.update(`businesses/${s.a.businessId}`, { isSuspended: false });
  }
});

test('a labor-only service remains valid without looking up a null part reference', async () => {
  const [order] = await s.a.repair.listRepairOrders(s.a.businessId);
  await s.a.repair.addServiceToOrder(order.id, [
    { type: 'labor', inventory_item_id: null, name: 'Labor', quantity: 1, cost: 0, price: 25 },
  ]);
  const updated = (await s.a.repair.listRepairOrders(s.a.businessId)).find(entry => entry.id === order.id);
  assert.equal(updated.total_amount, 25);
  assert.equal(updated.items.length, 1);
  assert.equal(updated.items[0].type, 'labor');
});
