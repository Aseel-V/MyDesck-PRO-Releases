/**
 * Restaurant on Firebase Auth + Firestore + Rules.
 *
 * Repository behaviour runs through FirestoreRestaurantRepository exactly as the restaurant screens call it: floor, menu,
 * orders and their ledger, kitchen tickets, manager approval (void, discount, cancel), analytics edits and deletes, and
 * staff. Staff identities are synthetic Firebase accounts with restaurantMemberships; no PIN exists anywhere. The
 * malicious-client cases are raw client-SDK writes built from valid documents with one thing changed, so each denial is
 * attributable to the rule under test.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-restaurant.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, runTransaction, serverTimestamp, setDoc,
  updateDoc, writeBatch,
} from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreRestaurantRepository, RestaurantFlowUnavailable } from '../src/data/firestore/FirestoreRestaurantRepository.ts';
import { encodeInsert, encodeUpdate } from '../src/data/firestore/documentCodec.ts';
import { encodeNumeric, storedDecimalToNumber, toStoredDecimal } from '../src/data/firestore/exactValues.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

/** MYDESCK_TEST_PROJECT isolates a run in its own emulator project, so it can run beside other suites. */
const PROJECT = process.env.MYDESCK_TEST_PROJECT ?? 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Diner-${RUN}-9!`;
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const [HOST, PORT] = FIRESTORE_HOST.split(':');
const accounts = new Set();
const handles = [];
const tenants = [];
const memberships = [];
const denied = (error) => error?.code === 'permission-denied';
const SUBCOLLECTIONS = ['tables', 'menuCategories', 'menuItems', 'restaurantStaff', 'orders', 'orderItems', 'orderItemModifiers',
  'kitchenTickets', 'ticketItems', 'voidLogs', 'restaurantAuditLogs', 'restaurantCounters', 'tableSessions', 'reservations', 'waitlist', 'guestProfiles'];

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}:${await response.text()}`);
}

const options = { projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' };
function isolatedIdentity() {
  const app = initializeApp(options, `restaurant-approver-${randomUUID()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT));
  return { auth, db, dispose: () => deleteApp(app) };
}

function client(label) {
  const app = initializeApp(options, `restaurant-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT));
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity });
  const handle = { label, app, auth, db, session, repo: new FirestoreRestaurantRepository(session) };
  handles.push(handle);
  return handle;
}

const emailOf = (label) => `migration-test--restaurant-${label}-${RUN}@example.com`;

async function owner(label) {
  const handle = client(label);
  const user = await new FirestoreAuthGateway(handle.session).signUp(emailOf(label), PASSWORD);
  accounts.add(user.id);
  await new FirestoreProfileRepository(handle.session).createOwnerProfiles(user.id, emailOf(label), { businessName: `Diner ${label}`, logoUrl: null, currency: 'ILS', language: 'en' });
  const business = await handle.session.requireOwnedBusiness();
  await bypass.update(`businesses/${business.businessId}`, { businessType: 'restaurant' });
  tenants.push({ uid: user.id, businessId: business.businessId });
  return Object.assign(handle, { uid: user.id, businessId: business.businessId, email: emailOf(label) });
}

/** A synthetic staff identity: its own Firebase account, a restaurantStaff record and an active membership. */
async function member(tenant, label, role, status = 'active') {
  const handle = client(label);
  const user = await new FirestoreAuthGateway(handle.session).signUp(emailOf(label), PASSWORD);
  accounts.add(user.id);
  const staff = await tenant.repo.createStaff(tenant.uid, { full_name: `Staff ${label}`, role: role === 'kitchen_staff' ? 'Kitchen' : role === 'waiter' ? 'Waiter' : 'Manager' });
  const id = `${tenant.businessId}__${user.id}`;
  assert.ok((await bypass.create('restaurantMemberships', id, { uid: user.id, businessId: tenant.businessId, staffId: staff.id, role, status,
    enabled: status === 'active', schemaVersion: 1, approvedBy: tenant.uid })).ok, `membership ${label}`);
  memberships.push(id);
  return Object.assign(handle, { uid: user.id, staffId: staff.id, email: emailOf(label), tenant });
}

const s = {};
before(async () => {
  await loadRules();
  s.a = await owner('a');
  s.b = await owner('b');
  s.manager = await member(s.a, 'manager', 'branch_manager');
  s.waiter = await member(s.a, 'waiter', 'waiter');
  s.kitchen = await member(s.a, 'kitchen', 'kitchen_staff');
  s.suspended = await member(s.a, 'suspended', 'branch_manager', 'suspended');
  s.anonymous = client('anonymous');
  const category = await s.a.repo.createCategory(s.a.uid, { name: 'Mains', sort_order: 1 });
  s.hummus = await s.a.repo.createMenuItem({ category_id: category.id, name: 'Hummus', name_he: 'חומוס', price: 45.5 });
  s.lemonade = await s.a.repo.createMenuItem({ category_id: category.id, name: 'Lemonade', price: 12 });
  s.table = await s.a.repo.createTable(s.a.uid, { name: 'T1', seats: 4 });
  s.category = category;
});

after(async () => {
  for (const handle of handles) {
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
  for (const id of memberships) await bypass.delete(`restaurantMemberships/${id}`);
  for (const localId of accounts) {
    await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId }),
    }).catch(() => undefined);
  }
});

const path = (tenant, name, id) => `businesses/${tenant.businessId}/${name}/${id}`;
const raw = async (handle, tenant, name, id) => (await getDoc(doc(handle.db, path(tenant, name, id)))).data();
const amount = (value) => storedDecimalToNumber(value);
const cart = (lines) => lines.map(([item, quantity, price, id]) => ({ id, item_id: item.id, quantity, price_at_time: price ?? item.price, notes: null }));

/** OrderModal's save for a new table order: create, save the lines, send what was fired. */
async function openOrder(handle, lines, fire = true) {
  const order = await handle.repo.createOrder(handle.uid ?? handle.tenant.uid, { table_id: s.table.id, currency: 'ILS' });
  await handle.repo.saveOrderCart(order.id, cart(lines), fire, null);
  if (fire) await handle.repo.sendToKitchen(order.id);
  return order;
}

test('floor and menu: tables, categories and category-scoped items as the settings screens create them', async () => {
  const tables = await s.a.repo.listTables(s.a.uid);
  assert.deepEqual(tables.map((table) => table.name), ['T1']);
  assert.equal(tables[0].status, 'free');
  await s.a.repo.updateTable(s.table.id, { position_x: 120.5, rotation: 15 });
  assert.equal((await s.a.repo.listTables(s.a.uid))[0].position_x, 120.5);
  const menu = await s.a.repo.listMenu(s.a.uid);
  assert.deepEqual(menu.map((category) => category.name), ['Mains']);
  assert.deepEqual(menu[0].items.map((item) => [item.name, item.price, item.business_id]), [['Hummus', 45.5, null], ['Lemonade', 12, null]],
    'the screen sends no business_id, so the item belongs to the business through its category');
  await s.a.repo.updateMenuItem(s.lemonade.id, { is_available: false });
  assert.equal((await s.a.repo.listAvailableMenuItems()).some((item) => item.id === s.lemonade.id), false, '86 hides the item');
  await s.a.repo.updateMenuItem(s.lemonade.id, { is_available: true });
  const spare = await s.a.repo.createMenuItem({ category_id: s.category.id, name: 'Spare', price: 1 });
  await s.a.repo.deleteMenuItem(spare.id);
  await s.a.repo.deleteMenuItem(randomUUID());
  assert.equal((await s.a.repo.listMenu(s.a.uid))[0].items.length, 2);
  assert.deepEqual((await s.a.repo.verifyMenuPrices([s.hummus.id])).map((row) => row.price), [45.5]);
});

test('an order is numbered by its business, its lines keep an exact ledger, and the kitchen gets each fired line once', async () => {
  const first = await s.a.repo.createOrder(s.a.uid, { table_id: s.table.id, currency: 'ILS' });
  const second = await s.a.repo.createOrder(s.a.uid, { table_id: s.table.id, currency: 'ILS' });
  assert.equal(second.order_number, first.order_number + 1);
  assert.deepEqual([first.status, first.total_amount, first.payment_status], ['draft', 0, 'pending']);

  await s.a.repo.saveOrderCart(first.id, cart([[s.hummus, 2], [s.lemonade, 1]]), true, null);
  let ledger = await raw(s.a, s.a, 'orders', first.id);
  assert.deepEqual([ledger.itemsTotal.unitsText, ledger.itemsTotal.scale, ledger.ledgerRevision], ['1030', 1, 2]);

  const ticketId = await s.a.repo.sendToKitchen(first.id);
  assert.ok(ticketId);
  assert.equal(await s.a.repo.sendToKitchen(first.id), null, 'no line is sent twice');
  const tickets = (await s.a.repo.listKitchenTickets(s.a.uid)).filter((ticket) => ticket.order_id === first.id);
  assert.equal(tickets.length, 1);
  assert.deepEqual([tickets[0].table_name, tickets[0].status, tickets[0].items.map((item) => [item.item_name, item.quantity]).sort()],
    ['T1', 'new', [['Hummus', 2], ['Lemonade', 1]]]);

  const active = (await s.a.repo.listActiveOrders(s.a.uid)).find((order) => order.id === first.id);
  assert.equal(active.status, 'pending');
  assert.equal(active.table.name, 'T1');
  assert.deepEqual(active.items.map((item) => [item.menu_item.name, item.quantity, item.price_at_time, item.modifiers.length]).sort(),
    [['Hummus', 2, 45.5, 0], ['Lemonade', 1, 12, 0]]);

  // Existing order: one more lemonade and the total from the ledger, whatever the screen sent.
  const lines = active.items.map((item) => ({ id: item.id, item_id: item.item_id, quantity: item.item_id === s.lemonade.id ? 2 : item.quantity, price_at_time: item.price_at_time }));
  await s.a.repo.saveOrderCart(first.id, lines, true, { total_amount: 1, tax_amount: 1 });
  ledger = await raw(s.a, s.a, 'orders', first.id);
  assert.equal(amount(ledger.itemsTotal), 115);
  assert.equal(amount(ledger.totalAmount), 115);
  assert.ok(Math.abs(amount(ledger.taxAmount) - 115 * 0.17 / 1.17) < 1e-9);
  assert.equal(await s.a.repo.sendToKitchen(first.id), null, 'a changed quantity on a sent line is not re-sent, as in the source');

  await assert.rejects(() => s.a.repo.closeOrderPaid(first.id, { method: 'cash', total_amount: 100, tax_amount: 0 }), /ORDER_TOTAL_CHANGED/);
  await assert.rejects(() => s.a.repo.closeOrderPaid(first.id, { method: 'bit', total_amount: 115, tax_amount: 0 }), (error) => error.code === 'CHECK_VIOLATION');
  await s.a.repo.closeOrderPaid(first.id, { method: 'cash', total_amount: 115.000000001, tax_amount: 0 });
  const closed = await raw(s.a, s.a, 'orders', first.id);
  assert.deepEqual([closed.status, closed.paymentMethod, amount(closed.totalAmount)], ['closed', 'cash', 115]);
  assert.ok(Math.abs(closed.closedAt.toMillis() - Date.now()) < 60_000);
  assert.equal((await s.a.repo.listActiveOrders(s.a.uid)).some((order) => order.id === first.id), false);
  await s.a.repo.deleteOrder(second.id);
});

test('the kitchen display moves tickets and lines with server time', async () => {
  const order = await openOrder(s.a, [[s.hummus, 1]]);
  const ticket = (await s.a.repo.listKitchenTickets(s.a.uid)).find((row) => row.order_id === order.id);
  await s.a.repo.updateTicketStatus(ticket.id, 'in_progress');
  await s.a.repo.updateTicketItemStatus(ticket.items[0].id, 'cooking');
  await s.a.repo.bumpTicket(ticket.id);
  const bumped = (await s.a.repo.listKitchenTickets(s.a.uid)).find((row) => row.id === ticket.id);
  assert.equal(bumped.status, 'ready');
  assert.ok(bumped.started_at && bumped.completed_at);
  assert.equal(bumped.items[0].status, 'cooking');
  await s.a.repo.updateTicketStatus(ticket.id, 'served');
  assert.equal((await s.a.repo.listKitchenTickets(s.a.uid)).some((row) => row.id === ticket.id), false, 'served tickets leave the display');
  await s.a.repo.updateTicketStatus(randomUUID(), 'served');
});

test('one kitchen ticket carries ten fired lines within the Rules document-access limits', async () => {
  const items = [];
  for (let index = 0; index < 10; index += 1) items.push(await s.a.repo.createMenuItem({ category_id: s.category.id, name: `Dish ${index}`, price: 10 + index }));
  const order = await openOrder(s.a, items.map((item) => [item, 1]));
  const ticket = (await s.a.repo.listKitchenTickets(s.a.uid)).find((row) => row.order_id === order.id);
  assert.equal(ticket.items.length, 10);
  assert.equal(amount((await raw(s.a, s.a, 'orders', order.id)).itemsTotal), 145);
});

test('manager approval needs a Firebase account of the owner or an active manager, and serves exactly one action', async () => {
  assert.deepEqual(await s.a.repo.authorizeStaffAction(s.a.uid, { pin: '1234' }, 'manager'),
    { authorized: false, error: 'Manager approval requires a manager account' });
  assert.equal((await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.manager.email, password: 'wrong-password' }, 'manager')).authorized, false);
  assert.deepEqual(await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.waiter.email, password: PASSWORD }, 'manager'),
    { authorized: false, error: 'Insufficient permissions' });
  assert.deepEqual(await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.suspended.email, password: PASSWORD }, 'manager'),
    { authorized: false, error: 'Insufficient permissions' });
  assert.deepEqual(await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.b.email, password: PASSWORD }, 'manager'),
    { authorized: false, error: 'Insufficient permissions' }, 'the owner of another restaurant approves nothing here');

  const order = await openOrder(s.a, [[s.hummus, 2], [s.lemonade, 1]]);
  const hummusLine = (await s.a.repo.listActiveOrders(s.a.uid)).find((row) => row.id === order.id).items.find((item) => item.item_id === s.hummus.id);
  await assert.rejects(() => s.a.repo.voidOrderItem({ itemId: hummusLine.id, reason: 'Spilled', authStaffId: s.manager.staffId }), /Authorization Required/);

  const approval = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.manager.email, password: PASSWORD }, 'manager');
  assert.deepEqual([approval.authorized, approval.staff_id, approval.role, approval.name], [true, s.manager.staffId, 'branch_manager', 'Staff manager']);
  await s.a.repo.voidOrderItem({ itemId: hummusLine.id, reason: 'Spilled', authStaffId: approval.staff_id });
  await assert.rejects(() => s.a.repo.voidOrderItem({ itemId: hummusLine.id, reason: 'Again', authStaffId: approval.staff_id }), /Authorization Required/,
    'an approval is used once');

  const line = await raw(s.a, s.a, 'orderItems', hummusLine.id);
  assert.deepEqual([line.status, line.notes], ['cancelled', ' [VOID: Spilled | Auth: Staff manager]']);
  assert.equal(amount((await raw(s.a, s.a, 'orders', order.id)).itemsTotal), 12, 'the voided line leaves the ledger');
  const voidLogs = await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'voidLogs'));
  const voidLog = voidLogs.docs.map((snapshot) => snapshot.data()).find((row) => row.orderItemId === hummusLine.id);
  assert.deepEqual([voidLog.voidType, amount(voidLog.originalAmount), voidLog.approvedBy, voidLog.reason], ['item', 91, s.manager.staffId, 'Spilled']);
  const audits = (await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'restaurantAuditLogs'))).docs.map((snapshot) => snapshot.data());
  const voidAudit = audits.find((row) => row.actionType === 'VOID_ITEM' && row.entityId === hummusLine.id);
  assert.deepEqual([voidAudit.actorId, voidAudit.staffId, voidAudit.details.item_name], [s.manager.uid, s.manager.staffId, 'חומוס']);

  // apply_discount_secure keeps its formula on subtotal_amount (0 for OrderModal orders); the payment total then nets it.
  const owner = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.a.email, password: PASSWORD }, 'Manager');
  assert.deepEqual([owner.authorized, owner.staff_id, owner.role], [true, s.a.uid, 'owner']);
  await s.a.repo.applyDiscount({ orderId: order.id, discountAmount: 5, reason: 'Regular', authStaffId: owner.staff_id });
  const discounted = await raw(s.a, s.a, 'orders', order.id);
  assert.deepEqual([amount(discounted.discountAmount), amount(discounted.discountPercentage), discounted.discountReason, amount(discounted.totalAmount)],
    [5, 0, 'Regular', 0]);
  const percent = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.manager.email, password: PASSWORD }, 'manager');
  await s.a.repo.applyDiscount({ orderId: order.id, discountPercentage: 10, reason: 'Late', authStaffId: percent.staff_id });
  assert.deepEqual([amount((await raw(s.a, s.a, 'orders', order.id)).discountAmount), amount((await raw(s.a, s.a, 'orders', order.id)).discountPercentage)], [0, 10],
    'ten percent of a zero subtotal_amount, as the source computes it');
  const amountAgain = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.manager.email, password: PASSWORD }, 'manager');
  await s.a.repo.applyDiscount({ orderId: order.id, discountAmount: 2, reason: 'Fix', authStaffId: amountAgain.staff_id });
  await s.a.repo.closeOrderPaid(order.id, { method: 'card', total_amount: 10, tax_amount: 0 });
  assert.equal(amount((await raw(s.a, s.a, 'orders', order.id)).totalAmount), 10, 'line sum 12 less the 2 discount');

  const cancelled = await openOrder(s.a, [[s.lemonade, 3]]);
  const cancel = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.manager.email, password: PASSWORD }, 'manager');
  await s.a.repo.cancelOrderByManager(cancelled.id, cancel.staff_id);
  const cancelledOrder = await raw(s.a, s.a, 'orders', cancelled.id);
  assert.deepEqual([cancelledOrder.status, cancelledOrder.notes], ['cancelled', `Cancelled by Manager (ID: ${s.manager.staffId})`]);
  const cancelledLines = (await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'orderItems'))).docs.map((snapshot) => snapshot.data())
    .filter((row) => row.orderId === cancelled.id);
  assert.deepEqual(cancelledLines.map((row) => [row.status, row.voided, row.voidReason]), [['cancelled', true, 'Full Order Cancelled']]);
  assert.ok((await getDoc(doc(s.a.db, path(s.a, 'restaurantAuditLogs', cancelledOrder.lastAuditId)))).data().actionType === 'ORDER_CANCELLED');
});

test('analytics lists closed orders by closing time, edits a closed order from its ledger, and deletes with the source foreign keys', async () => {
  const order = await openOrder(s.a, [[s.hummus, 1], [s.lemonade, 2]]);
  await s.a.repo.closeOrderPaid(order.id, { method: 'cash', total_amount: 69.5, tax_amount: 0 });
  const from = new Date(Date.now() - 3600_000).toISOString();
  const to = new Date(Date.now() + 3600_000).toISOString();
  const listed = (await s.a.repo.listClosedOrders(from, to)).find((row) => row.id === order.id);
  assert.deepEqual([listed.total_amount, listed.table.name, listed.items.map((item) => item.menu_item.name).sort()], [69.5, 'T1', ['Hummus', 'Lemonade']]);
  assert.equal((await s.a.repo.listClosedOrders(to, new Date(Date.now() + 7200_000).toISOString())).some((row) => row.id === order.id), false);

  const hummusLine = listed.items.find((item) => item.item_id === s.hummus.id);
  const lemonadeLine = listed.items.find((item) => item.item_id === s.lemonade.id);
  await s.a.repo.saveOrderEdit(listed, [
    { id: lemonadeLine.id, item_id: s.lemonade.id, quantity: 3, price_at_time: 11.25, notes: null, status: 'pending' },
    { item_id: s.hummus.id, quantity: 1, price_at_time: 40, notes: null, status: 'pending' },
  ], { total_amount: 0, subtotal_amount: 0, tax_amount: 0 });
  const edited = await raw(s.a, s.a, 'orders', order.id);
  assert.equal(amount(edited.itemsTotal), 73.75);
  assert.equal(amount(edited.totalAmount), 73.75);
  assert.ok(Math.abs(amount(edited.subtotalAmount) - 73.75 / 1.17) < 1e-9 && Math.abs(amount(edited.taxAmount) - (73.75 - 73.75 / 1.17)) < 1e-9);
  assert.equal((await getDoc(doc(s.a.db, path(s.a, 'orderItems', hummusLine.id)))).exists(), false, 'the removed line is gone');

  await assert.rejects(() => s.a.repo.deleteTable(s.table.id), (error) => error.code === '23503');
  await s.a.repo.deleteOrder(order.id);
  assert.equal((await getDoc(doc(s.a.db, path(s.a, 'orders', order.id)))).exists(), false);
  const leftovers = (await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'orderItems'))).docs.filter((snapshot) => snapshot.data().orderId === order.id);
  assert.equal(leftovers.length, 0, 'lines go with the order');
  const ticketLines = (await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'kitchenTickets'))).docs.filter((snapshot) => snapshot.data().orderId === order.id);
  assert.equal(ticketLines.length, 0, 'tickets go with the order');
});

test('staff records never hold a credential, and staff deletes follow the source foreign keys', async () => {
  const staff = await s.a.repo.createStaff(s.a.uid, { full_name: 'Dana', role: 'Waiter', hourly_rate: 42.5, pin_code: '0000', email: 'dana@example.com' });
  const stored = await raw(s.a, s.a, 'restaurantStaff', staff.id);
  assert.deepEqual([stored.fullName, amount(stored.hourlyRate), stored.email, 'pinCode' in stored, 'password' in stored], ['Dana', 42.5, 'dana@example.com', false, false]);
  await s.a.repo.updateStaff(staff.id, { full_name: 'Dana K', pin_code: '9999', password: 'plaintext' });
  const updated = await raw(s.a, s.a, 'restaurantStaff', staff.id);
  assert.deepEqual([updated.fullName, 'pinCode' in updated, 'password' in updated], ['Dana K', false, false]);
  await assert.rejects(() => s.a.repo.verifyStaffPin(staff.id, '0000', s.a.uid), (error) => error instanceof RestaurantFlowUnavailable && error.classification === 'AUTH_REPLACED');
  await s.a.repo.deleteStaff(staff.id);
  assert.equal((await s.a.repo.listStaff(s.a.uid)).some((row) => row.id === staff.id), false);
  await assert.rejects(() => s.a.repo.deleteStaff(s.manager.staffId), (error) => error.code === '23503', 'the manager is referenced by audit records');
});

test('writes only unmounted screens reach are refused explicitly', async () => {
  const refused = (error) => error instanceof RestaurantFlowUnavailable && error.classification === 'LEGACY_UNREACHABLE';
  const calls = [
    () => s.a.repo.createModifierGroup(s.a.uid, { name: 'x' }), () => s.a.repo.startSession(s.a.uid, { tableId: s.table.id, guestCount: 2 }),
    () => s.a.repo.processPayment(s.a.uid, { orderId: 'x', amount: 1, method: 'cash', processedBy: 'x' }),
    () => s.a.repo.closeBusinessDay({ staffId: 'x', date: '2026-09-15', shifts: [], expenses: [] }), () => s.a.repo.createDailyReport(s.a.uid, {}, 'ILS'),
    () => s.a.repo.addToWaitlist(s.a.uid, { guest_name: 'x' }), () => s.a.repo.createGuest(s.a.uid, { first_name: 'x' }),
    () => s.a.repo.recordVisit({ guestId: 'x', amountSpent: 1 }), () => s.a.repo.updateBusinessSettings(s.a.uid, { operation_mode: 'market' }),
  ];
  for (const call of calls) await assert.rejects(call, refused);
  assert.deepEqual([await s.a.repo.listWaitlist(s.a.uid), await s.a.repo.listGuests(), await s.a.repo.getServerTimeOffset()], [[], [], 0]);
});

/** A document as the migration writes it (plain values), for rows only unmounted screens could create. */
async function seedRow(tenant, name, table, row) {
  const codec = { ...s.a.session.codec(), serverTimestamp: () => new Date(), deleteField: () => undefined, timestamp: (seconds, nanos) => new Date(seconds * 1000 + Math.floor(nanos / 1e6)) };
  const created = encodeInsert(table, { business_id: tenant.uid, ...row }, codec, { ownerUid: tenant.uid, businessId: tenant.businessId });
  const data = { ...created.data, legacyBusinessUserId: tenant.uid };
  assert.ok((await bypass.create(`businesses/${tenant.businessId}/${name}`, created.id, data)).ok, `seed ${table}`);
  return created.id;
}

test('refunds, the allergy override log, reservations, the waitlist and guest profiles run as the reachable screens call them', async () => {
  // RefundModal: a partial refund is logged only; a full refund marks the order refunded, bound to its audit record.
  const order = await openOrder(s.a, [[s.hummus, 2]], false);
  await s.a.repo.closeOrderPaid(order.id, { method: 'cash', total_amount: 91, tax_amount: 13.22 });
  const paidStatus = (await raw(s.a, s.a, 'orders', order.id)).paymentStatus;
  await assert.rejects(() => s.a.repo.refundOrder(s.a.uid, { orderId: order.id, amount: 10, reason: 'x', authStaffId: s.manager.staffId }), /Authorization Required/);
  const partial = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.manager.email, password: PASSWORD }, 'manager');
  await s.a.repo.refundOrder(s.a.uid, { orderId: order.id, itemIds: [], amount: 45.5, reason: 'Cold', authStaffId: partial.staff_id });
  assert.equal((await raw(s.a, s.a, 'orders', order.id)).paymentStatus, paidStatus, 'a partial refund leaves the payment status');
  await assert.rejects(() => updateDoc(doc(s.a.db, path(s.a, 'orders', order.id)), { paymentStatus: 'refunded', closedAt: serverTimestamp() }), denied,
    'a refund without its audit record');
  const full = await s.a.repo.authorizeStaffAction(s.a.uid, { email: s.a.email, password: PASSWORD }, 'manager');
  await s.a.repo.refundOrder(s.a.uid, { orderId: order.id, amount: 91, reason: 'Wrong table', authStaffId: full.staff_id });
  const refunded = await raw(s.a, s.a, 'orders', order.id);
  assert.equal(refunded.paymentStatus, 'refunded');
  const refundAudit = (await getDoc(doc(s.a.db, path(s.a, 'restaurantAuditLogs', refunded.lastAuditId)))).data();
  assert.deepEqual([refundAudit.actionType, refundAudit.entityId, refundAudit.actorId, refundAudit.details.amount, refundAudit.details.reason], ['REFUND', order.id, s.a.uid, 91, 'Wrong table']);
  const audits = (await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'restaurantAuditLogs'))).docs.map((snapshot) => snapshot.data());
  assert.deepEqual(audits.filter((row) => row.actionType === 'REFUND' && row.entityId === order.id).map((row) => [row.staffId, row.details.amount]).sort(),
    [[null, 91], [s.manager.staffId, 45.5]]);

  // log_business_activity_v2: owner only; a staff id must be a restaurant_staff row, so OrderEntry's user id fails as in the source.
  const allergy = { p_business_id: s.a.uid, p_activity_type: 'ALLERGY_OVERRIDE', p_entity_type: 'order_item', p_entity_id: s.hummus.id,
    p_details: { itemName: 'Hummus', allergens: ['sesame'], reason: 'Guest confirmed', method: 'verbal', orderId: 'NEW_ORDER' } };
  await assert.rejects(() => s.a.repo.logActivity({ ...allergy, p_staff_id: s.a.uid }), (error) => error.code === '23503');
  await assert.rejects(() => s.manager.repo.logActivity({ ...allergy, p_business_id: s.manager.uid, p_staff_id: null }), (error) => error.code === 'P0001');
  await s.a.repo.logActivity({ ...allergy, p_staff_id: null });
  const logged = (await getDocs(collection(s.a.db, 'businesses', s.a.businessId, 'restaurantAuditLogs'))).docs.map((snapshot) => snapshot.data())
    .filter((row) => row.actionType === 'ALLERGY_OVERRIDE');
  assert.deepEqual(logged.map((row) => [row.actorId, row.staffId, row.entityId, row.details.allergens]), [[s.a.uid, null, s.hummus.id, ['sesame']]]);

  // ReservationsBoard: create, confirm, seat with server time, cancel; a past slot and a party of 51 are refused.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const reservation = await s.waiter.repo.createReservation(s.a.uid, { guest_name: 'Dana', guest_phone: '0501112222', reservation_date: tomorrow, reservation_time: '20:30', party_size: 4 });
  assert.deepEqual([reservation.status, reservation.reservation_time, reservation.duration_minutes, reservation.source, reservation.table_ids], ['pending', '20:30:00', 90, 'phone', []]);
  await assert.rejects(() => s.a.repo.createReservation(s.a.uid, { guest_name: 'Late', guest_phone: '1', reservation_date: new Date().toISOString().slice(0, 10), reservation_time: '00:00', party_size: 2 }), denied);
  await assert.rejects(() => s.a.repo.createReservation(s.a.uid, { guest_name: 'Crowd', guest_phone: '1', reservation_date: tomorrow, reservation_time: '20:00', party_size: 51 }), denied);
  // ReservationModal sends date, time and tags, which are not columns, and no reservation_date: the insert fails as it does in the source.
  await assert.rejects(() => s.a.repo.createReservation(s.a.uid, { guest_name: 'Modal', guest_phone: '1', party_size: 2, date: tomorrow, time: '19:00', reservation_time: new Date().toISOString() }));
  await s.waiter.repo.updateReservation(reservation.id, { status: 'confirmed' });
  await s.waiter.repo.updateReservation(reservation.id, { status: 'seated', seated_at: '2000-01-01T00:00:00.000Z' });
  const seated = await raw(s.a, s.a, 'reservations', reservation.id);
  assert.equal(seated.status, 'seated');
  assert.ok(Math.abs(seated.seatedAt.toMillis() - Date.now()) < 60_000, 'seated_at is the server time, not the client value');
  await s.a.repo.updateReservation(reservation.id, { status: 'cancelled' });
  assert.deepEqual((await s.a.repo.listReservationsOn(s.a.uid, tomorrow)).map((row) => [row.id, row.status]), [[reservation.id, 'cancelled']]);
  await s.a.repo.updateReservation('00000000-0000-4000-8000-000000000000', { status: 'confirmed' });
  await assert.rejects(() => updateDoc(doc(s.a.db, path(s.a, 'reservations', reservation.id)), { partySize: 2 }), denied, 'only the status moves');
  await assert.rejects(() => s.kitchen.repo.updateReservation(reservation.id, { status: 'confirmed' }), denied, 'kitchen staff do not seat guests');
  const pastId = await seedRow(s.a, 'reservations', 'restaurant_reservations', { guest_name: 'Past', guest_phone: '1', reservation_date: '2020-01-01', reservation_time: '19:00:00', party_size: 2 });
  await assert.rejects(() => s.a.repo.updateReservation(pastId, { status: 'confirmed' }), denied, 'the trigger refuses updates to a past reservation');

  // Waitlist: seat at a table of the business with server time, or mark left.
  const waiting = await seedRow(s.a, 'waitlist', 'restaurant_waitlist', { guest_name: 'Walk-in', guest_phone: '0503334444', party_size: 2 });
  const leaving = await seedRow(s.a, 'waitlist', 'restaurant_waitlist', { guest_name: 'Leaving', guest_phone: '0505556666', party_size: 3 });
  assert.deepEqual((await s.waiter.repo.listWaitlist(s.a.uid)).map((row) => row.id).sort(), [waiting, leaving].sort());
  await assert.rejects(() => s.waiter.repo.updateWaitlist(waiting, { status: 'seated', seated_at: new Date().toISOString(), table_id: 'no-such-table' }), denied);
  await s.waiter.repo.updateWaitlist(waiting, { status: 'seated', seated_at: new Date().toISOString(), table_id: s.table.id });
  await s.waiter.repo.updateWaitlist(leaving, { status: 'left' });
  assert.deepEqual(await s.waiter.repo.listWaitlist(s.a.uid), []);
  await assert.rejects(() => updateDoc(doc(s.waiter.db, path(s.a, 'waitlist', leaving)), { status: 'waiting', partySize: 9 }), denied);

  // GuestProfiles: the panel sends the whole profile back; changed columns are written, visits and spend are refused.
  const guestId = await seedRow(s.a, 'guestProfiles', 'restaurant_guest_profiles', { first_name: 'Noa', full_name: 'Noa Levi', phone: '0507778888', visit_count: 3, total_lifetime_spend: 420.5 });
  const guest = (await s.a.repo.listGuests()).find((row) => row.id === guestId);
  assert.deepEqual((await s.a.repo.searchGuests('levi')).map((row) => row.id), [guestId]);
  await s.a.repo.updateGuest(guestId, { ...guest, tags: ['vip'], allergies: ['nuts'], vip_level: 2, updated_at: '2000-01-01T00:00:00.000Z' });
  const edited = await raw(s.a, s.a, 'guestProfiles', guestId);
  assert.deepEqual([edited.tags, edited.allergies, edited.vipLevel, edited.visitCount, amount(edited.totalLifetimeSpend)], [['vip'], ['nuts'], 2, 3, 420.5]);
  assert.ok(Math.abs(edited.updatedAt.toMillis() - Date.now()) < 60_000);
  await assert.rejects(() => s.a.repo.updateGuest(guestId, { ...guest, total_lifetime_spend: 99999 }), denied, 'lifetime spend is not client-authoritative');
  await assert.rejects(() => s.a.repo.updateGuest(guestId, { ...guest, visit_count: 50 }), denied);
  await assert.rejects(() => s.waiter.repo.updateGuest(guestId, { ...guest, notes: 'waiter' }), denied, 'guest records are edited by managers');
  await s.b.repo.updateGuest(guestId, { notes: 'owner b' });
  assert.notEqual((await raw(s.a, s.a, 'guestProfiles', guestId)).notes, 'owner b', 'another owner resolves its own business, where the guest does not exist');
  await assert.rejects(() => updateDoc(doc(s.b.db, path(s.a, 'guestProfiles', guestId)), { notes: 'owner b', updatedAt: serverTimestamp() }), denied);
});

test('staff act by membership role: waiters take orders at menu prices, kitchen staff run tickets, neither approves', async () => {
  const order = await s.waiter.repo.createOrder(s.a.uid, { table_id: s.table.id, currency: 'ILS' });
  await s.waiter.repo.saveOrderCart(order.id, cart([[s.hummus, 1]]), true, null);
  await s.waiter.repo.sendToKitchen(order.id);
  assert.equal((await s.waiter.repo.listActiveOrders(s.a.uid)).find((row) => row.id === order.id).items.length, 1);
  await assert.rejects(() => s.waiter.repo.saveOrderCart(order.id, cart([[s.lemonade, 1, 1]]), false, null), denied, 'a waiter cannot sell below the menu price');
  await assert.rejects(() => s.waiter.repo.createTable(s.a.uid, { name: 'Waiter table' }), denied);
  await assert.rejects(() => s.waiter.repo.deleteOrder(order.id), denied);
  await assert.rejects(() => getDocs(collection(s.waiter.db, 'businesses', s.a.businessId, 'voidLogs')), denied);
  const line = (await s.waiter.repo.listActiveOrders(s.a.uid)).find((row) => row.id === order.id).items[0];
  await assert.rejects(() => updateDoc(doc(s.waiter.db, path(s.a, 'orderItems', line.id)), { status: 'cancelled' }), denied, 'a waiter cannot void');

  const dishes = [];
  for (let index = 0; index < 6; index += 1) dishes.push(await s.a.repo.createMenuItem({ category_id: s.category.id, name: `Waiter dish ${index}`, price: 20 + index }));
  const large = await openOrder(s.waiter, dishes.map((dish) => [dish, 1]));
  const largeTickets = (await s.waiter.repo.listKitchenTickets(s.a.uid)).filter((row) => row.order_id === large.id);
  assert.deepEqual(largeTickets.map((row) => row.items.length), [6], 'a waiter sends six different dishes as one ticket');

  const ticket = (await s.kitchen.repo.listKitchenTickets(s.a.uid)).find((row) => row.order_id === order.id);
  await s.kitchen.repo.updateTicketStatus(ticket.id, 'in_progress');
  await s.kitchen.repo.updateMenuItem(s.lemonade.id, { is_available: false });
  await s.kitchen.repo.updateMenuItem(s.lemonade.id, { is_available: true });
  await assert.rejects(() => s.kitchen.repo.updateMenuItem(s.lemonade.id, { price: 1 }), denied);
  await assert.rejects(() => s.kitchen.repo.createOrder(s.a.uid, { table_id: s.table.id, currency: 'ILS' }), denied);

  await assert.rejects(() => s.suspended.repo.listTables(s.a.uid), (error) => denied(error) || /BUSINESS_NOT_FOUND/.test(error.message));
  await assert.rejects(() => getDocs(collection(s.waiter.db, 'businesses', s.b.businessId, 'orders')), denied, 'another restaurant is invisible');
  await assert.rejects(() => getDocs(collection(s.anonymous.db, 'businesses', s.a.businessId, 'tables')), denied);
  await assert.rejects(() => getDocs(collection(s.b.db, 'businesses', s.a.businessId, 'orders')), denied, 'another owner is refused');
});

test('malicious clients cannot move money, numbers, tickets or audit records outside the ledger', async () => {
  const db = s.a.db;
  const codec = s.a.session.codec();
  const tenancy = { ownerUid: s.a.uid, businessId: s.a.businessId };
  const ref = (name, id) => doc(db, path(s.a, name, id));
  const order = await openOrder(s.a, [[s.hummus, 1]], false);
  const orderDoc = await raw(s.a, s.a, 'orders', order.id);
  const line = (await getDocs(collection(db, 'businesses', s.a.businessId, 'orderItems'))).docs.find((snapshot) => snapshot.data().orderId === order.id);

  // Order creation: zero amounts, a draft, the next number from the counter.
  const counter = await raw(s.a, s.a, 'restaurantCounters', 'orders');
  const newOrder = (overrides = {}) => {
    const created = encodeInsert('restaurant_orders', { business_id: s.a.uid, status: 'draft', order_number: counter.next, currency: 'ILS', ...overrides }, codec, tenancy);
    return { id: created.id, data: { ...created.data, itemsTotal: toStoredDecimal(0n, 0), ledgerRevision: 0, ledgerItemId: null } };
  };
  const createOrder = async (candidate, next = counter.next + 1) => {
    const batch = writeBatch(db);
    batch.set(ref('orders', candidate.id), candidate.data);
    batch.set(ref('restaurantCounters', 'orders'), { next, lastOrderId: candidate.id, businessId: s.a.businessId, schemaVersion: 1 });
    await batch.commit();
  };
  for (const [name, candidate, next] of [
    ['a non-zero total', newOrder({ total_amount: 50 })],
    ['a closed order', newOrder({ status: 'closed' })],
    ['a reused number', newOrder({ order_number: counter.next - 1 }), counter.next],
    ['a skipped number', newOrder({ order_number: counter.next + 5 }), counter.next + 6],
    ['a pre-filled ledger', (() => { const candidate = newOrder(); candidate.data.itemsTotal = toStoredDecimal(100n, 0); return candidate; })()],
    ['another owner', (() => { const candidate = newOrder(); candidate.data.ownerUid = s.b.uid; return candidate; })()],
  ]) await assert.rejects(() => createOrder(candidate, next), denied, name);

  // Lines: never without the ledger, never with a different amount.
  const newLine = (overrides = {}) => encodeInsert('restaurant_order_items', { order_id: order.id, item_id: s.hummus.id, quantity: 1, price_at_time: 45.5, ...overrides }, codec, tenancy);
  const lineWithLedger = async (created, itemsTotal) => {
    const batch = writeBatch(db);
    batch.set(ref('orderItems', created.id), { ...created.data, ticketItemId: null });
    batch.update(ref('orders', order.id), { itemsTotal, ledgerRevision: orderDoc.ledgerRevision + 1, ledgerItemId: created.id });
    await batch.commit();
  };
  const alone = newLine();
  await assert.rejects(() => setDoc(ref('orderItems', alone.id), { ...alone.data, ticketItemId: null }), denied, 'a line without its ledger');
  await assert.rejects(() => lineWithLedger(newLine(), toStoredDecimal(500n, 1)), denied, 'a ledger that under-counts the line');
  await assert.rejects(() => lineWithLedger(newLine({ price_at_time: 45.5, quantity: 2 }), toStoredDecimal(910n, 1)), denied, 'a ledger that counts the wrong quantity');
  await assert.rejects(() => updateDoc(ref('orders', order.id), { itemsTotal: toStoredDecimal(0n, 0) }), denied, 'itemsTotal edited alone');
  await assert.rejects(() => updateDoc(ref('orderItems', line.id), { quantity: 5 }), denied, 'a quantity change outside the ledger');
  await assert.rejects(() => updateDoc(ref('orderItems', line.id), encodeUpdate('restaurant_order_items', { price_at_time: 1 }, codec)), denied, 'a price change outside the ledger');

  // Totals: only from the ledger.
  await assert.rejects(() => updateDoc(ref('orders', order.id), encodeUpdate('restaurant_orders', { total_amount: 1, tax_amount: 1 * 0.17 / 1.17 }, codec)), denied, 'a total below the ledger');
  await assert.rejects(() => updateDoc(ref('orders', order.id), encodeUpdate('restaurant_orders', { total_amount: 45.5, tax_amount: 40 }, codec)), denied, 'a tax that does not match the total');
  await assert.rejects(() => updateDoc(ref('orders', order.id), { ...encodeUpdate('restaurant_orders', { status: 'closed', payment_method: 'cash', total_amount: 10, tax_amount: 10 * 0.17 / 1.17 }, codec), closedAt: serverTimestamp() }), denied, 'paid at less than the ledger');
  await assert.rejects(() => updateDoc(ref('orders', order.id), { ...encodeUpdate('restaurant_orders', { status: 'closed', total_amount: 45.5, tax_amount: 45.5 * 0.17 / 1.17 }, codec), paymentMethod: 'bit', closedAt: serverTimestamp() }), denied, 'an unknown payment method');
  await assert.rejects(() => updateDoc(ref('orders', order.id), encodeUpdate('restaurant_orders', { discount_amount: 45.5, total_amount: 0 }, codec)), denied, 'a discount without its audit record');
  const fakeAudit = encodeInsert('restaurant_audit_logs', { business_id: s.a.uid, actor_id: s.a.uid, action_type: 'APPLY_DISCOUNT', entity_id: order.id, details: {} }, codec, tenancy);
  await assert.rejects(async () => {
    const batch = writeBatch(db);
    batch.update(ref('orders', order.id), { ...encodeUpdate('restaurant_orders', { discount_amount: 45.5, discount_reason: 'x', total_amount: 45 }, codec), lastAuditId: fakeAudit.id });
    batch.set(ref('restaurantAuditLogs', fakeAudit.id), fakeAudit.data);
    await batch.commit();
  }, denied, 'a discount whose total is not the formula');
  await assert.rejects(() => setDoc(ref('restaurantAuditLogs', fakeAudit.id), fakeAudit.data), denied, 'an audit record for a change that did not happen');

  // Kitchen: an unfired line is not sent, and a sent line is not sent twice.
  const sendRaw = async (target) => {
    const ticket = encodeInsert('restaurant_kitchen_tickets', { business_id: s.a.uid, order_id: order.id, table_name: 'T1', status: 'new' }, codec, tenancy);
    const item = encodeInsert('restaurant_ticket_items', { ticket_id: ticket.id, order_item_id: target.id, item_name: 'Hummus', quantity: 1 }, codec, tenancy);
    const batch = writeBatch(db);
    batch.set(ref('kitchenTickets', ticket.id), ticket.data);
    batch.set(ref('ticketItems', item.id), item.data);
    batch.update(ref('orderItems', target.id), { ticketItemId: item.id });
    await batch.commit();
  };
  await assert.rejects(() => sendRaw(line), denied, 'an unfired line');
  await s.a.repo.saveOrderCart(order.id, [{ id: line.id, item_id: s.hummus.id, quantity: 1, price_at_time: 45.5 }], true, null);
  await s.a.repo.sendToKitchen(order.id);
  await assert.rejects(() => sendRaw(line), denied, 'a line already sent');

  // Numbers, void logs and credentials.
  await assert.rejects(() => setDoc(ref('restaurantCounters', 'orders'), { next: 1, lastOrderId: order.id, businessId: s.a.businessId, schemaVersion: 1 }), denied, 'rewinding the counter');
  const voidLog = encodeInsert('restaurant_void_logs', { business_id: s.a.uid, order_id: order.id, order_item_id: line.id, void_type: 'item', original_amount: 45.5, reason: 'x' }, codec, tenancy);
  await assert.rejects(() => setDoc(ref('voidLogs', voidLog.id), voidLog.data), denied, 'a void log for a line that was not voided');
  const staff = encodeInsert('restaurant_staff', { business_id: s.a.uid, full_name: 'Pin holder' }, codec, tenancy);
  await assert.rejects(() => setDoc(ref('restaurantStaff', staff.id), { ...staff.data, pinCode: '0000' }), denied, 'a staff record with a PIN');
  await assert.rejects(() => setDoc(ref('restaurantStaff', staff.id), { ...staff.data, password: 'secret' }), denied, 'a staff record with a password');

  // Another tenant's paths.
  const foreign = encodeInsert('restaurant_tables', { business_id: s.a.uid, name: 'Foreign' }, s.b.session.codec(), tenancy);
  await assert.rejects(() => setDoc(doc(s.b.db, path(s.a, 'tables', foreign.id)), foreign.data), denied, 'owner B writing into restaurant A');
  await assert.rejects(() => deleteDoc(doc(s.b.db, path(s.a, 'orders', order.id))), denied);
  await assert.rejects(() => runTransaction(s.waiter.db, async (transaction) => { transaction.delete(doc(s.waiter.db, path(s.a, 'orders', order.id))); }), denied);
});

test('live updates follow changes, not the rows already there', async () => {
  let changes = 0;
  const stop = s.a.repo.subscribe('restaurant_orders', s.a.uid, () => { changes += 1; });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(changes, 0, 'the first snapshot is not a change');
  await s.a.repo.createOrder(s.a.uid, { table_id: s.table.id, currency: 'ILS' });
  for (let attempt = 0; attempt < 50 && changes === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  stop();
  assert.ok(changes >= 1);
  assert.equal(encodeNumeric(1).scale, 0);
});
