/**
 * Supermarket on Firebase Auth + Firestore + Rules.
 *
 * Repository behaviour runs through FirestoreSupermarketRepository exactly as the POS, product
 * modal, sales analytics and transaction editor call it. Every security case is a raw client-SDK
 * write built from a valid document with one field changed, so a denial is attributable to the rule
 * under test rather than to an unrelated malformed field.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-supermarket.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreSupermarketRepository } from '../src/data/firestore/FirestoreSupermarketRepository.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Market-${RUN}-9!`;
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const accounts = new Set();
const clients = [];
const denied = (error) => error?.code === 'permission-denied';

/** The eight defaults AddProductModal seeds into an empty store. */
const DEFAULTS = [
  { name: 'General', name_he: 'כללי', sort_order: 0 }, { name: 'Dairy', name_he: 'מוצרי חלב', sort_order: 1 },
  { name: 'Bakery', name_he: 'מאפים', sort_order: 2 }, { name: 'Produce', name_he: 'ירקות ופירות', sort_order: 3 },
  { name: 'Meat', name_he: 'בשר', sort_order: 4 }, { name: 'Beverages', name_he: 'משקאות', sort_order: 5 },
  { name: 'Pantry', name_he: 'מזון יבש', sort_order: 6 }, { name: 'Cleaning', name_he: 'מוצרי ניקוי', sort_order: 7 },
].map((seed) => ({ ...seed, is_active: true }));

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}`);
}

async function owner(label) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `market-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
  const handle = { app, auth, db, session, market: new FirestoreSupermarketRepository(session) };
  clients.push(handle);
  if (label === 'anonymous') return handle;
  const gateway = new FirestoreAuthGateway(session);
  const user = await gateway.signUp(`migration-test--market-${label}-${RUN}@example.com`, PASSWORD);
  accounts.add(user.id);
  await new FirestoreProfileRepository(session).createOwnerProfiles(user.id, `migration-test--market-${label}-${RUN}@example.com`,
    { businessName: `Market ${label}`, logoUrl: null, currency: 'ILS', language: 'he' });
  const business = await session.requireOwnedBusiness();
  return { ...handle, uid: user.id, businessId: business.businessId };
}

const s = {};
const menuItems = (handle, businessId) => collection(handle.db, 'businesses', businessId, 'menuItems');
const sales = (handle, businessId) => collection(handle.db, 'businesses', businessId, 'marketTransactions');
const validProduct = (handle, ownerUid, businessId, overrides = {}) =>
  encodeInsert('restaurant_menu_items', { business_id: ownerUid, name: 'Probe', price: 1.5, ...overrides },
    handle.session.codec(), { ownerUid, businessId });
const validSale = (handle, ownerUid, businessId, overrides = {}) =>
  encodeInsert('market_transactions', {
    business_id: ownerUid, receipt_number: `INV-${RUN}`, items: [{ quantity: 1 }], subtotal: 1, vat_amount: 0.17,
    total_amount: 1.17, payment_method: 'cash', amount_paid: 2, change_amount: 0.83, created_at: '2026-09-14T08:00:00.000Z',
    ...overrides,
  }, handle.session.codec(), { ownerUid, businessId });

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
  for (const handle of [s.a, s.b]) {
    if (!handle?.businessId) continue;
    for (const name of ['menuItems', 'menuCategories', 'marketTransactions', 'orderItems', 'recipes']) {
      const listing = await fetch(`http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/businesses/${handle.businessId}/${name}?pageSize=300`,
        { headers: { Authorization: 'Bearer owner' } }).then((response) => response.json());
      for (const document of listing.documents ?? []) {
        await bypass.delete(document.name.split('/documents/')[1]);
      }
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

test('an empty store seeds the eight defaults in insertion order and lists them NULLs last', async () => {
  assert.deepEqual(await s.a.market.listCategories(s.a.uid), []);
  const created = await s.a.market.seedDefaultCategories(s.a.uid, DEFAULTS);
  assert.deepEqual(created.map((row) => row.name), DEFAULTS.map((seed) => seed.name));
  assert.ok(created.every((row) => row.business_id === s.a.uid && row.is_active === true));
  s.categoryId = created[1].id;
  const nullSorted = encodeInsert('restaurant_menu_categories', { business_id: s.a.uid, name: 'Unsorted', sort_order: null },
    s.a.session.codec(), { ownerUid: s.a.uid, businessId: s.a.businessId });
  await setDoc(doc(s.a.db, 'businesses', s.a.businessId, 'menuCategories', nullSorted.id), nullSorted.data);
  const listed = await s.a.market.listCategories(s.a.uid);
  assert.equal(listed.length, 9);
  assert.equal(listed.at(-1).name, 'Unsorted', 'ORDER BY sort_order ASC places NULL last');
  assert.deepEqual(listed.slice(0, 8).map((row) => row.sort_order), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('products are created, listed when available, and updated; a vanished product update is a no-op', async () => {
  await s.a.market.createProduct(s.a.uid, { name: 'Milk', description: 'חלב 3%', price: 5.9, barcode: '7290000000001',
    category_id: s.categoryId, type: 'unit', image_url: null });
  let products = await s.a.market.listAvailableProducts(s.a.uid);
  assert.equal(products.length, 1);
  const [milk] = products;
  s.productId = milk.id;
  assert.equal(milk.price, 5.9);
  assert.equal(milk.tax_rate, 17, 'column default');
  assert.equal(milk.station, 'general');
  assert.deepEqual(milk.available_days, [0, 1, 2, 3, 4, 5, 6]);
  const image = `https://example.supabase.co/storage/v1/object/public/restaurant-assets/market-items/${s.a.uid}/milk.png`;
  await s.a.market.updateProduct(milk.id, { name: 'Milk 1L', price: 6.5, image_url: image });
  products = await s.a.market.listAvailableProducts(s.a.uid);
  assert.equal(products[0].name, 'Milk 1L');
  assert.equal(products[0].price, 6.5);
  assert.equal(products[0].image_url, image);
  await s.a.market.updateProduct('00000000-0000-4000-8000-00000000dead', { price: 1 });
  const hidden = validProduct(s.a, s.a.uid, s.a.businessId, { name: 'Out of stock', is_available: false });
  await setDoc(doc(menuItems(s.a, s.a.businessId), hidden.id), hidden.data);
  // A row whose business_id is NULL reaches its owner through the category. The source RLS WITH CHECK admits it
  // (business_id = auth.uid() OR the category is the owner's), and the restaurant settings screen creates such
  // items; no supermarket flow does. Without a category of this business it is refused.
  const tenancyByCategory = validProduct(s.a, s.a.uid, s.a.businessId, { name: 'Category-owned', business_id: null, category_id: s.categoryId });
  for (const [name, overrides] of [
    ['no category', { business_id: null, category_id: null }],
    ['a category that does not exist', { business_id: null, category_id: '00000000-0000-4000-8000-00000000cafe' }],
    ["another business's owner uid", { business_id: s.b.uid, category_id: s.categoryId }],
  ]) {
    const orphan = validProduct(s.a, s.a.uid, s.a.businessId, { name: `Detached: ${name}`, ...overrides });
    await assert.rejects(() => setDoc(doc(menuItems(s.a, s.a.businessId), orphan.id), orphan.data), denied,
      `a client cannot create an item outside its business: ${name}`);
  }
  await setDoc(doc(menuItems(s.a, s.a.businessId), tenancyByCategory.id), tenancyByCategory.data);
  const visible = (await s.a.market.listAvailableProducts(s.a.uid)).map((row) => row.name);
  assert.deepEqual(visible, ['Milk 1L'], 'unavailable and NULL-business_id items are excluded, as the source query excludes them');
});

test('a product cannot reference a missing category or another tenant\'s category', async () => {
  await assert.rejects(() => s.a.market.createProduct(s.a.uid, { name: 'Orphan', description: '', price: 1, barcode: null,
    category_id: '00000000-0000-4000-8000-00000000beef', type: 'unit', image_url: null }), denied);
  const [foreign] = await s.b.market.seedDefaultCategories(s.b.uid, DEFAULTS.slice(0, 1));
  await assert.rejects(() => s.a.market.createProduct(s.a.uid, { name: 'Cross', description: '', price: 1, barcode: null,
    category_id: foreign.id, type: 'unit', image_url: null }), denied);
});

test('deleting a product refuses a referenced item and cascades its dependents', async () => {
  const orderItemPath = `businesses/${s.a.businessId}/orderItems/oi-${RUN}`;
  await bypass.set(orderItemPath, { itemId: s.productId, businessId: s.a.businessId });
  await assert.rejects(() => s.a.market.deleteProduct(s.productId), (error) => error.code === '23503');
  assert.equal((await getDoc(doc(menuItems(s.a, s.a.businessId), s.productId))).exists(), true, 'the product survives');
  await bypass.delete(orderItemPath);
  const recipePath = `businesses/${s.a.businessId}/recipes/rc-${RUN}`;
  await bypass.set(recipePath, { menuItemId: s.productId, businessId: s.a.businessId });
  await s.a.market.deleteProduct(s.productId);
  assert.equal((await getDoc(doc(menuItems(s.a, s.a.businessId), s.productId))).exists(), false);
  assert.equal((await bypass.get(recipePath)).status, 404, 'the recipe cascaded with the product');
});

test('sales are recorded, listed by range newest first, edited and deleted with exact amounts', async () => {
  const subtotal = 100 / 1.17;
  const items = [{ id: 'cart-1', product: { id: 'p', name: 'Bread', nameHe: 'לחם', price: 12.9, type: 'unit' }, quantity: 2 }];
  for (const [receipt, at] of [['INV-1', '2026-09-14T09:00:00.000Z'], ['INV-2', '2026-09-14T12:30:15.123Z'], ['INV-3', '2026-09-15T01:00:00.000Z']]) {
    await s.a.market.recordSale(s.a.uid, { receipt_number: receipt, items, subtotal, vat_amount: 100 - subtotal, total_amount: 100,
      payment_method: 'cash', amount_paid: 200, change_amount: 100, created_at: at });
  }
  const day = await s.a.market.listSales(s.a.uid, '2026-09-14T00:00:00.000Z', '2026-09-14T23:59:59.999Z');
  assert.deepEqual(day.map((row) => row.receipt_number), ['INV-2', 'INV-1']);
  assert.equal(day[0].created_at, '2026-09-14T12:30:15.123+00:00');
  assert.equal(day[0].subtotal, subtotal, 'the float the POS computed is stored and returned exactly');
  assert.equal(day[0].vat_amount, 100 - subtotal);
  assert.deepEqual(day[0].items, items);
  assert.deepEqual(await s.a.market.getSaleOwner(day[0].id), { id: day[0].id, business_id: s.a.uid });
  assert.equal(await s.a.market.getSaleOwner('00000000-0000-4000-8000-00000000cafe'), null);
  await s.a.market.updateSale(day[0].id, { items: [], total_amount: 50, subtotal: 50 / 1.17, vat_amount: 50 - 50 / 1.17 });
  const edited = await s.a.market.listSales(s.a.uid, '2026-09-14T00:00:00.000Z', '2026-09-14T23:59:59.999Z');
  assert.equal(edited[0].total_amount, 50);
  assert.deepEqual(edited[0].items, []);
  await s.a.market.deleteSale(day[1].id);
  const remaining = await s.a.market.listSales(s.a.uid, '2026-09-14T00:00:00.000Z', '2026-09-16T00:00:00.000Z');
  assert.deepEqual(remaining.map((row) => row.receipt_number), ['INV-3', 'INV-2']);
  s.saleId = remaining[1].id;
});

test('sales analytics totals computed from Firestore rows match the same reducer over the recorded values', async () => {
  const rows = await s.a.market.listSales(s.a.uid, '2026-09-14T00:00:00.000Z', '2026-09-16T00:00:00.000Z');
  const sum = (list, method) => list.filter((t) => !method || t.payment_method === method).reduce((total, t) => total + (t.total_amount || 0), 0);
  assert.equal(sum(rows), 150);
  assert.equal(sum(rows, 'cash'), 150);
  assert.equal(sum(rows, 'card'), 0);
});

test('another tenant and anonymous callers are denied every supermarket read and write', async () => {
  await assert.rejects(() => getDoc(doc(sales(s.b, s.a.businessId), s.saleId)), denied);
  await assert.rejects(() => getDocs(menuItems(s.b, s.a.businessId)), denied);
  const injected = validProduct(s.b, s.b.uid, s.a.businessId);
  await assert.rejects(() => setDoc(doc(menuItems(s.b, s.a.businessId), injected.id), injected.data), denied, 'cross-tenant injection');
  await assert.rejects(() => updateDoc(doc(sales(s.b, s.a.businessId), s.saleId), { totalAmount: validSale(s.b, s.b.uid, s.a.businessId).data.totalAmount }), denied);
  await assert.rejects(() => deleteDoc(doc(sales(s.b, s.a.businessId), s.saleId)), denied);
  await assert.rejects(() => getDocs(sales(s.anon, s.a.businessId)), denied);
  assert.equal(await s.b.market.getSaleOwner(s.saleId), null, 'another tenant cannot even see that the sale exists');
});

test('tenancy fields are immutable and a sale keeps its receipt, time and payment method', async () => {
  const [product] = await s.a.market.listAvailableProducts(s.a.uid).then(async (rows) => rows.length ? rows : (
    await s.a.market.createProduct(s.a.uid, { name: 'Tea', description: '', price: 2, barcode: null, category_id: null, type: 'unit', image_url: null }),
    s.a.market.listAvailableProducts(s.a.uid)));
  const productRef = doc(menuItems(s.a, s.a.businessId), product.id);
  for (const [field, value] of [['legacyBusinessUserId', s.b.uid], ['businessId', s.b.businessId], ['ownerUid', s.b.uid], ['id', 'renamed']]) {
    await assert.rejects(() => updateDoc(productRef, { [field]: value }), denied, `product ${field}`);
  }
  const saleRef = doc(sales(s.a, s.a.businessId), s.saleId);
  for (const [field, value] of [['receiptNumber', 'FORGED'], ['createdAt', Timestamp.fromDate(new Date('2020-01-01'))],
    ['paymentMethod', 'card'], ['legacyBusinessUserId', s.b.uid], ['amountPaid', validSale(s.a, s.a.uid, s.a.businessId, { amount_paid: 999 }).data.amountPaid]]) {
    await assert.rejects(() => updateDoc(saleRef, { [field]: value }), denied, `sale ${field}`);
  }
  for (const overrides of [{ business_id: s.b.uid }]) {
    const forged = validSale(s.a, s.a.uid, s.a.businessId, overrides);
    await assert.rejects(() => setDoc(doc(sales(s.a, s.a.businessId), forged.id), forged.data), denied, 'sale for another owner uid');
  }
  const wrongOwner = validSale(s.a, s.a.uid, s.a.businessId);
  await assert.rejects(() => setDoc(doc(sales(s.a, s.a.businessId), wrongOwner.id), { ...wrongOwner.data, ownerUid: s.b.uid }), denied);
  const wrongId = validSale(s.a, s.a.uid, s.a.businessId);
  await assert.rejects(() => setDoc(doc(sales(s.a, s.a.businessId), 'not-the-id'), wrongId.data), denied, 'document id must equal id');
});

test('schema validation refuses malformed documents and inline images', async () => {
  const base = validProduct(s.a, s.a.uid, s.a.businessId);
  const reference = (id) => doc(menuItems(s.a, s.a.businessId), id);
  const { price: _price, ...missingPrice } = base.data;
  void _price;
  const cases = [
    ['missing column', missingPrice],
    ['float instead of exact decimal', { ...base.data, price: 1.5 }],
    ['CHECK station enumeration', { ...base.data, station: 'moon' }],
    ['CHECK spicy_level range', { ...base.data, spicyLevel: 9 }],
    ['inline data: image', { ...base.data, imageUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
    ['unknown key', { ...base.data, isFree: true }],
    ['forged decimal units', { ...base.data, price: { unitsText: '150', units: 'x', scale: 2, decimal: '1.50' } }],
  ];
  for (const [label, data] of cases) {
    await assert.rejects(() => setDoc(reference(base.id), data), denied, label);
  }
  const sale = validSale(s.a, s.a.uid, s.a.businessId);
  const { itemsEncoding: _encoding, ...noEncoding } = sale.data;
  void _encoding;
  await assert.rejects(() => setDoc(doc(sales(s.a, s.a.businessId), sale.id), noEncoding), denied, 'NOT NULL jsonb without an encoding marker');
});

test('a suspended owner or suspended business loses access', async () => {
  await bypass.update(`users/${s.a.uid}`, { isSuspended: true });
  try {
    await assert.rejects(() => getDocs(menuItems(s.a, s.a.businessId)), denied);
  } finally {
    await bypass.update(`users/${s.a.uid}`, { isSuspended: false });
  }
  await bypass.update(`businesses/${s.a.businessId}`, { isSuspended: true });
  try {
    await assert.rejects(() => getDocs(sales(s.a, s.a.businessId)), denied);
    await assert.rejects(() => s.a.market.listSales(s.a.uid, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'), /BUSINESS_SUSPENDED/);
  } finally {
    await bypass.update(`businesses/${s.a.businessId}`, { isSuspended: false });
  }
});
