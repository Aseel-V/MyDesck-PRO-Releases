/**
 * Firestore Rules evaluation budget for every migrated application path.
 *
 * Firestore refuses a request whose Rules evaluate more than 1,000 expressions, and for the user that
 * refusal is indistinguishable from a security refusal. Each path is measured against the committed
 * Rules with the documents the production repositories write (method: migration/firestore/lib/rules-budget.mjs).
 * A product path must cost at most PRODUCT_CEILING. Fully populated documents, where every optional
 * column holds a value and therefore gets its type and CHECK evaluated, are measured as well.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs scripts/test-firestore-rules-budget.mjs
 *
 * RULES_BUDGET_DIAGNOSE=1 also attributes the cost of an over-ceiling rule to its top-level conjuncts.
 * Writes migration/reports/firestore-rules-budget.json.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDocs, getFirestore, query, setDoc, where } from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreAdminRepository } from '../src/data/firestore/FirestoreAdminRepository.ts';
import { FirestoreSupermarketRepository } from '../src/data/firestore/FirestoreSupermarketRepository.ts';
import { FirestoreAutoRepairRepository } from '../src/data/firestore/FirestoreAutoRepairRepository.ts';
import { FirestoreCarPartsRepository } from '../src/data/firestore/FirestoreCarPartsRepository.ts';
import { FirestoreRestaurantRepository } from '../src/data/firestore/FirestoreRestaurantRepository.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';
import { EXPRESSION_LIMIT, allowExpression, conjuncts, measureRuleCost, outcome } from '../migration/firestore/lib/rules-budget.mjs';

/** MYDESCK_TEST_PROJECT isolates a run in its own emulator project, so it can run beside other suites. */
const PROJECT = process.env.MYDESCK_TEST_PROJECT ?? 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Budget-${RUN}-9!`;
const RULES = readFileSync('migration/firestore/rules/firestore.rules', 'utf8');
const REPORT = 'migration/reports/firestore-rules-budget.json';
/** Every product path leaves at least 15% of the limit unused. */
const PRODUCT_CEILING = 850;
const DIAGNOSE = process.env.RULES_BUDGET_DIAGNOSE === '1';
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const clients = [];
const accounts = new Set();
const tenants = new Set();
const memberships = [];
const results = [];
let counter = 0;
const next = () => { counter += 1; return counter; };

async function load(content) {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}:${await response.text()}`);
}

function clientFor(label) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `budget-${label}-${RUN}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // The manager-approval sign-in: a second, in-memory identity in its own app, as src/data/firebaseClient.ts builds it.
  const isolatedIdentity = () => {
    const approverApp = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `budget-approver-${randomUUID()}`);
    const approverAuth = initializeAuth(approverApp, { persistence: inMemoryPersistence });
    connectAuthEmulator(approverAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
    const approverDb = getFirestore(approverApp);
    connectFirestoreEmulator(approverDb, '127.0.0.1', 8080);
    return { auth: approverAuth, db: approverDb, dispose: () => deleteApp(approverApp) };
  };
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false, isolatedIdentity });
  const handle = { app, auth, db, session, gateway: new FirestoreAuthGateway(session), profiles: new FirestoreProfileRepository(session),
    admin: new FirestoreAdminRepository(session), market: new FirestoreSupermarketRepository(session),
    repair: new FirestoreAutoRepairRepository(session), parts: new FirestoreCarPartsRepository(session),
    restaurant: new FirestoreRestaurantRepository(session) };
  clients.push(handle);
  return handle;
}

const email = (label) => `migration-test--budget-${label}-${RUN}@example.com`;
const TARGET = {
  usersCreate: { match: 'match /users/{uid} {', allow: 'allow create: if ' },
  usersUpdate: { match: 'match /users/{uid} {', allow: 'allow update: if ' },
  ownersCreate: { match: 'match /businessOwners/{ownerUid} {', allow: 'allow create: if ' },
  businessesCreate: { match: 'match /businesses/{businessId} {', allow: 'allow create: if ' },
  businessesUpdate: { match: 'match /businesses/{businessId} {', allow: 'allow update: if ' },
  itemsRead: { match: 'match /menuItems/{itemId} {', allow: 'allow get, list: if ' },
  itemsCreate: { match: 'match /menuItems/{itemId} {', allow: 'allow create: if ' },
  itemsUpdate: { match: 'match /menuItems/{itemId} {', allow: 'allow update: if ' },
  itemsDelete: { match: 'match /menuItems/{itemId} {', allow: 'allow delete: if ' },
  categoriesRead: { match: 'match /menuCategories/{categoryId} {', allow: 'allow get, list: if ' },
  categoriesCreate: { match: 'match /menuCategories/{categoryId} {', allow: 'allow create: if ' },
  salesRead: { match: 'match /marketTransactions/{transactionId} {', allow: 'allow get, list: if ' },
  salesCreate: { match: 'match /marketTransactions/{transactionId} {', allow: 'allow create: if ' },
  salesUpdate: { match: 'match /marketTransactions/{transactionId} {', allow: 'allow update: if ' },
  salesDelete: { match: 'match /marketTransactions/{transactionId} {', allow: 'allow delete: if ' },
  vehiclesCreate: { match: 'match /vehicles/{vehicleId} {', allow: 'allow create: if ' },
  vehiclesUpdate: { match: 'match /vehicles/{vehicleId} {', allow: 'allow update: if ' },
  platesCreate: { match: 'match /vehiclePlates/{plateKey} {', allow: 'allow create: if ' },
  repairOrdersRead: { match: 'match /repairOrders/{orderId} {', allow: 'allow get, list: if ' },
  repairOrdersCreate: { match: 'match /repairOrders/{orderId} {', allow: 'allow create: if ' },
  repairOrdersUpdate: { match: 'match /repairOrders/{orderId} {', allow: 'allow update: if ' },
  repairOrdersDelete: { match: 'match /repairOrders/{orderId} {', allow: 'allow delete: if ' },
  repairItemsCreate: { match: 'match /repairOrderItems/{itemId} {', allow: 'allow create: if ' },
  repairItemsDelete: { match: 'match /repairOrderItems/{itemId} {', allow: 'allow delete: if ' },
  repairServicesCreate: { match: 'match /repairServices/{serviceId} {', allow: 'allow create: if ' },
  repairServicesDelete: { match: 'match /repairServices/{serviceId} {', allow: 'allow delete: if ' },
  partsRead: { match: 'match /parts/{partId} {', allow: 'allow get, list: if ' },
  partsUpdate: { match: 'match /parts/{partId} {', allow: 'allow update: if ' },
  partsCreate: { match: 'match /parts/{partId} {', allow: 'allow create: if ' },
  partsDelete: { match: 'match /parts/{partId} {', allow: 'allow delete: if ' },
  tablesCreate: { match: 'match /tables/{tableId} {', allow: 'allow create: if ' },
  staffCreate: { match: 'match /restaurantStaff/{staffId} {', allow: 'allow create: if ' },
  countersWrite: { match: 'match /restaurantCounters/{counterId} {', allow: 'allow create, update: if ' },
  ordersRead: { match: 'match /orders/{orderId} {', allow: 'allow get, list: if ' },
  ordersCreate: { match: 'match /orders/{orderId} {', allow: 'allow create: if ' },
  ordersUpdate: { match: 'match /orders/{orderId} {', allow: 'allow update: if ' },
  orderItemsCreate: { match: 'match /orderItems/{itemId} {', allow: 'allow create: if ' },
  orderItemsUpdate: { match: 'match /orderItems/{itemId} {', allow: 'allow update: if ' },
  orderItemsDelete: { match: 'match /orderItems/{itemId} {', allow: 'allow delete: if ' },
  ticketsCreate: { match: 'match /kitchenTickets/{ticketId} {', allow: 'allow create: if ' },
  ticketsUpdate: { match: 'match /kitchenTickets/{ticketId} {', allow: 'allow update: if ' },
  ticketItemsCreate: { match: 'match /ticketItems/{ticketItemId} {', allow: 'allow create: if ' },
  voidLogsCreate: { match: 'match /voidLogs/{logId} {', allow: 'allow create: if ' },
  auditCreate: { match: 'match /restaurantAuditLogs/{logId} {', allow: 'allow create: if ' },
  reservationsCreate: { match: 'match /reservations/{reservationId} {', allow: 'allow create: if ' },
  reservationsUpdate: { match: 'match /reservations/{reservationId} {', allow: 'allow update: if ' },
  waitlistUpdate: { match: 'match /waitlist/{entryId} {', allow: 'allow update: if ' },
  guestsUpdate: { match: 'match /guestProfiles/{guestId} {', allow: 'allow update: if ' },
};

async function measure(path, target, attempt, { product = true } = {}) {
  const result = await measureRuleCost({ rules: RULES, target, load, attempt });
  const entry = { path, rule: `${target.match.slice(6, -2)} ${target.allow.trim().replace(/: if$/, '')}`, product, ...result };
  if (DIAGNOSE && (!result.withinLimit || result.costAtMost > PRODUCT_CEILING)) {
    entry.parts = [];
    for (const part of conjuncts(allowExpression(RULES, target))) {
      const partial = await measureRuleCost({ rules: RULES, target, load, attempt, expression: part });
      entry.parts.push({ expression: part.replace(/\s+/g, ' ').slice(0, 140), costAtMost: partial.costAtMost });
    }
  }
  results.push(entry);
  return entry;
}

function assertWithin(entries) {
  for (const entry of entries) {
    assert.ok(entry.withinLimit, `${entry.path}: over the ${EXPRESSION_LIMIT}-expression limit ${JSON.stringify(entry.parts ?? [])}`);
    if (entry.product) assert.ok(entry.costAtMost <= PRODUCT_CEILING, `${entry.path}: ${entry.costAtMost} > ${PRODUCT_CEILING} ${JSON.stringify(entry.parts ?? [])}`);
  }
}

const DEFAULTS = [
  ['General', 'כללי'], ['Dairy', 'מוצרי חלב'], ['Bakery', 'מאפים'], ['Produce', 'ירקות ופירות'],
  ['Meat', 'בשר'], ['Beverages', 'משקאות'], ['Pantry', 'מזון יבש'], ['Cleaning', 'מוצרי ניקוי'],
].map(([name, nameHe], index) => ({ name, name_he: nameHe, sort_order: index, is_active: true }));

const s = {};
const image = (name) => `https://example.supabase.co/storage/v1/object/public/restaurant-assets/market-items/${s.owner.uid}/${name}.png`;
const tenancy = () => ({ ownerUid: s.owner.uid, businessId: s.owner.businessId });
const cart = (n) => Array.from({ length: 40 }, (_, i) => ({
  product: { id: `p${i}`, name: `Product ${i}`, nameHe: `מוצר ${i}`, price: 4.9 + i, type: i % 3 ? 'unit' : 'weight', barcode: `729000${i}` },
  quantity: 1 + ((i + n) % 4), ...(i % 3 ? {} : { weight: 0.75 }),
}));
const sale = (n) => ({
  receipt_number: `INV-B${n}`, items: cart(n), subtotal: 100, vat_amount: 17, total_amount: 117, payment_method: n % 2 ? 'cash' : 'card',
  amount_paid: 120, change_amount: 3, created_at: new Date().toISOString(),
});
/** A menu item with every optional column populated; `n` changes every mutable value. */
const fullItem = (n, id) => ({
  ...(id ? { id } : {}), business_id: s.owner.uid, category_id: s.categoryIds[n % 2], name: `Full ${n}`, description: `desc ${n}`,
  price: 12.5 + n, is_available: n % 2 === 0, tax_rate: n % 2 ? 17 : 18, name_he: `מלא ${n}`, name_ar: `كامل ${n}`, cost_price: 8.25 + n,
  prep_time_minutes: 5 + n, station: n % 2 ? 'general' : 'bar', allergens: [`milk${n}`], calories: 120 + n, image_url: image(`full${n}`),
  sort_order: n, is_popular: n % 2 === 0, is_new: n % 2 === 1, available_from: `0${n % 9}:00:00`, available_until: `2${n % 3}:00:00`,
  available_days: n % 2 ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2], spicy_level: n % 4, dietary_tags: [`vegan${n}`], track_expiry: n % 2 === 0,
  default_shelf_life_days: 7 + n, is_perishable: n % 2 === 1, requires_weighing: n % 2 === 0, sold_by_weight: n % 2 === 1,
  weight_unit: n % 2 ? 'kg' : 'g', min_stock_alert: 3 + n, supplier_sku: `SKU-${n}`, country_of_origin: n % 2 ? 'IL' : 'JO',
  type: n % 2 ? 'unit' : 'weight', barcode: `729${n}`, stock_quantity: 10.5 + n, part_number: `PN-${n}`,
  created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString(),
});

before(async () => {
  await load(RULES);
  s.owner = clientFor('owner');
  const owner = await s.owner.gateway.signUp(email('owner'), PASSWORD);
  accounts.add(owner.id);
  tenants.add(owner.id);
  await s.owner.profiles.createOwnerProfiles(owner.id, email('owner'), { businessName: 'Budget Market', logoUrl: null, currency: 'ILS', language: 'he' });
  const business = await s.owner.session.requireOwnedBusiness();
  s.owner.uid = owner.id;
  s.owner.businessId = business.businessId;
  const categories = await s.owner.market.seedDefaultCategories(owner.id, DEFAULTS);
  s.categoryIds = [categories[0].id, categories[1].id];
  await s.owner.market.createProduct(owner.id, { name: 'Milk', description: 'חלב', price: 5.9, barcode: '7290000000001',
    category_id: s.categoryIds[0], type: 'unit', image_url: null });
  s.productId = (await s.owner.market.listAvailableProducts(owner.id))[0].id;
  s.fullId = encodeInsert('restaurant_menu_items', fullItem(0), s.owner.session.codec(), tenancy()).id;
  const full = encodeInsert('restaurant_menu_items', fullItem(0, s.fullId), s.owner.session.codec(), tenancy());
  await setDoc(doc(s.owner.db, 'businesses', s.owner.businessId, 'menuItems', full.id), full.data);
  await s.owner.market.recordSale(owner.id, sale(0));
  s.window = [new Date(Date.now() - 3_600_000).toISOString(), new Date(Date.now() + 3_600_000).toISOString()];
  s.saleId = (await s.owner.market.listSales(owner.id, ...s.window))[0].id;

  const adminResponse = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email('admin'), password: PASSWORD, returnSecureToken: true }),
  });
  const adminAccount = await adminResponse.json();
  accounts.add(adminAccount.localId);
  tenants.add(adminAccount.localId);
  await bypass.set(`users/${adminAccount.localId}`, {
    id: `profile-${adminAccount.localId}`, userId: adminAccount.localId, fullName: 'Platform Admin', phoneNumber: '', role: 'admin',
    createdAt: new Date(), updatedAt: new Date(), isSuspended: false, sourceBusinessId: null, canViewFinancials: false,
    uid: adminAccount.localId, legacyProfileId: `profile-${adminAccount.localId}`, ownerUid: adminAccount.localId, businessId: null,
    schemaVersion: 1, transformVersion: 1, isDeleted: false,
  });
  s.admin = clientFor('admin');
  await s.admin.gateway.signIn(email('admin'), PASSWORD);
  s.registrant = clientFor('registrant');
});

after(async () => {
  await load(RULES);
  for (const handle of clients) {
    await signOut(handle.auth).catch(() => undefined);
    await deleteApp(handle.app).catch(() => undefined);
  }
  const base = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  for (const uid of tenants) {
    const index = await bypass.get(`businessOwners/${uid}`);
    const businessId = index.ok ? index.body?.fields?.businessId?.stringValue : null;
    if (businessId) {
      for (const name of ['menuItems', 'menuCategories', 'marketTransactions', 'vehicles', 'vehiclePlates', 'repairOrders',
        'repairOrderItems', 'repairServices', 'parts', 'tables', 'restaurantStaff', 'restaurantCounters', 'orders', 'orderItems',
        'kitchenTickets', 'ticketItems', 'voidLogs', 'restaurantAuditLogs', 'reservations', 'waitlist', 'guestProfiles']) {
        let pageToken = '';
        do {
          const listing = await fetch(`${base}/businesses/${businessId}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
            { headers: { Authorization: 'Bearer owner' } }).then((response) => response.json());
          for (const document of listing.documents ?? []) await bypass.delete(document.name.split('/documents/')[1]);
          pageToken = listing.nextPageToken ?? '';
        } while (pageToken);
      }
      await bypass.delete(`businesses/${businessId}`);
    }
    await bypass.delete(`businessOwners/${uid}`);
    await bypass.delete(`users/${uid}`);
  }
  for (const id of memberships) await bypass.delete(`restaurantMemberships/${id}`);
  for (const localId of accounts) {
    await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId }),
    }).catch(() => undefined);
  }
});

test('self-registration: business, owner index and user profile', async () => {
  const register = async () => {
    const n = next();
    const user = await s.registrant.gateway.signUp(email(`registrant${n}`), PASSWORD);
    accounts.add(user.id);
    tenants.add(user.id);
    return outcome(() => s.registrant.profiles.createOwnerProfiles(user.id, email(`registrant${n}`),
      { businessName: `סופרמרקט ${n}`, logoUrl: null, currency: 'ILS', language: 'he' }));
  };
  assertWithin([
    await measure('registration: user profile', TARGET.usersCreate, register),
    await measure('registration: business', TARGET.businessesCreate, register),
    await measure('registration: owner index', TARGET.ownersCreate, register),
  ]);
});

test('platform administration: account creation with its business', async () => {
  const create = () => outcome(async () => {
    const n = next();
    const created = await s.admin.admin.createUser({ email: email(`created${n}`), password: PASSWORD, fullName: `Created ${n}`,
      phoneNumber: '050-1', role: 'user', businessName: `Created ${n}`, currency: 'ILS', language: 'ar', businessType: 'supermarket' });
    accounts.add(created.userId);
    tenants.add(created.userId);
  });
  assertWithin([
    await measure('admin create user: user profile', TARGET.usersCreate, create),
    await measure('admin create user: business', TARGET.businessesCreate, create),
    await measure('admin create user: owner index', TARGET.ownersCreate, create),
  ]);
});

test('settings: profile and business edits', async () => {
  assertWithin([
    await measure('settings: save user profile', TARGET.usersUpdate, () => {
      const n = next();
      return outcome(() => s.owner.profiles.saveUserProfile(s.owner.uid, { full_name: `Owner ${n}`, phone_number: `050-${n}` }));
    }),
    await measure('settings: save business profile', TARGET.businessesUpdate, () => {
      const n = next();
      return outcome(() => s.owner.profiles.updateBusinessProfile(s.owner.uid, {
        business_name: `Budget Market ${n}`, business_registration_number: `51${n}`, preferred_currency: n % 2 ? 'ILS' : 'USD',
        preferred_language: n % 2 ? 'he' : 'ar', logo_url: `business-logos/${s.owner.uid}/logo-${n}.png`,
        signature_url: `business-signatures/${s.owner.uid}/signature-${n}.png`,
      }));
    }),
  ]);
});

test('supermarket catalogue', async () => {
  const raw = (n, id) => encodeInsert('restaurant_menu_items', fullItem(n, id), s.owner.session.codec(), tenancy());
  assertWithin([
    await measure('supermarket: seed default categories (batch of 8)', TARGET.categoriesCreate,
      () => outcome(() => s.owner.market.seedDefaultCategories(s.owner.uid, DEFAULTS))),
    await measure('supermarket: list categories', TARGET.categoriesRead, () => outcome(() => s.owner.market.listCategories(s.owner.uid))),
    await measure('supermarket: list available products', TARGET.itemsRead,
      () => outcome(() => s.owner.market.listAvailableProducts(s.owner.uid))),
    await measure('supermarket: create product (product modal)', TARGET.itemsCreate, () => {
      const n = next();
      return outcome(() => s.owner.market.createProduct(s.owner.uid, { name: `Bread ${n}`, description: `לחם ${n}`, price: 7.9 + n,
        barcode: `72911${n}`, category_id: s.categoryIds[n % 2], type: n % 2 ? 'unit' : 'weight', image_url: image(`bread${n}`) }));
    }),
    await measure('supermarket: update product (product modal)', TARGET.itemsUpdate, () => {
      const n = next();
      return outcome(() => s.owner.market.updateProduct(s.productId, { name: `Milk ${n}`, description: `חלב ${n}`, price: 5 + n / 100,
        barcode: `72900${n}`, category_id: s.categoryIds[n % 2], type: n % 2 ? 'unit' : 'weight', image_url: image(`milk${n}`) }));
    }),
    await measure('supermarket: delete product (foreign-key checks and cascade)', TARGET.itemsDelete, async () => {
      const item = raw(next());
      await setDoc(doc(s.owner.db, 'businesses', s.owner.businessId, 'menuItems', item.id), item.data);
      return outcome(() => s.owner.market.deleteProduct(item.id));
    }),
    await measure('menu item create, every optional column populated', TARGET.itemsCreate, () => {
      const item = raw(next());
      return outcome(() => setDoc(doc(s.owner.db, 'businesses', s.owner.businessId, 'menuItems', item.id), item.data));
    }, { product: false }),
    await measure('menu item update, every mutable column changed', TARGET.itemsUpdate, () => {
      const item = raw(next(), s.fullId);
      return outcome(() => setDoc(doc(s.owner.db, 'businesses', s.owner.businessId, 'menuItems', s.fullId), item.data));
    }, { product: false }),
  ]);
});

test('supermarket sales', async () => {
  assertWithin([
    await measure('supermarket: checkout (40-line cart)', TARGET.salesCreate,
      () => outcome(() => s.owner.market.recordSale(s.owner.uid, sale(next())))),
    await measure('supermarket: sales analytics range', TARGET.salesRead,
      () => outcome(() => s.owner.market.listSales(s.owner.uid, ...s.window))),
    await measure('supermarket: edit sale', TARGET.salesUpdate, () => {
      const n = next();
      return outcome(() => s.owner.market.updateSale(s.saleId, { items: cart(n).slice(0, 39), total_amount: 100 + n,
        subtotal: (100 + n) / 1.17, vat_amount: (100 + n) - (100 + n) / 1.17 }));
    }),
    await measure('supermarket: delete sale', TARGET.salesDelete, async () => {
      const row = encodeInsert('market_transactions', { business_id: s.owner.uid, ...sale(next()) }, s.owner.session.codec(), tenancy());
      await setDoc(doc(s.owner.db, 'businesses', s.owner.businessId, 'marketTransactions', row.id), row.data);
      return outcome(() => s.owner.market.deleteSale(row.id));
    }),
  ]);
});

test('auto repair: registration, services and deletion', async () => {
  const restCodec = {
    timestamp: (seconds, nanoseconds) => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)),
    serverTimestamp: () => new Date(), deleteField: () => { throw new Error('DELETE_FIELD_OVER_REST'); }, newId: () => randomUUID(),
  };
  const part = encodeInsert('car_parts', { business_id: s.owner.businessId, part_name: 'Budget part', quantity: 100000,
    purchase_price_unit: 12.25, selling_price_unit: 19.99 }, restCodec, tenancy());
  assert.ok((await bypass.set(`businesses/${s.owner.businessId}/parts/${part.id}`, part.data)).ok, 'part fixture');
  const repair = s.owner.repair;
  const car = (n) => ({ plate_number: `BUDGET-${RUN}-${n}`, model: 'Toyota Corolla', owner_name: 'Budget owner', owner_phone: '050-0000000',
    color: 'White', year: 2020, test_expiry: '2027-01-01', trim_level: 'GLI', ownership: 'Private' });
  const newestOrder = async () => (await repair.listRepairOrders(s.owner.businessId))[0].id;
  await repair.registerVehicleAndOpenOrder(s.owner.businessId, car('known'), { currency: 'ILS' });
  const register = () => outcome(() => repair.registerVehicleAndOpenOrder(s.owner.businessId, car(next()),
    { odometer_reading: 1000, notes: 'Budget', currency: 'ILS' }));
  const service = () => outcome(async () => repair.addServiceToOrder(await newestOrder(), [
    { type: 'part', inventory_item_id: part.id, name: 'Budget part', quantity: 1, cost: 12.25, price: 19.99 },
    { type: 'labor', inventory_item_id: null, name: 'Service Labor (Hand Cost)', quantity: 1, cost: 0, price: 150.5 },
  ]));
  const deletion = async () => {
    await repair.registerVehicleAndOpenOrder(s.owner.businessId, car(`delete-${next()}`), { currency: 'ILS' });
    const orderId = await newestOrder();
    await repair.addServiceToOrder(orderId, [{ type: 'part', inventory_item_id: part.id, name: 'Budget part', quantity: 1, cost: 12.25, price: 19.99 },
      { type: 'labor', inventory_item_id: null, name: 'Service Labor (Hand Cost)', quantity: 1, cost: 0, price: 10 }]);
    return outcome(() => repair.deleteRepairOrder(orderId));
  };
  assertWithin([
    await measure('auto repair: register a car (vehicle)', TARGET.vehiclesCreate, register),
    await measure('auto repair: register a car (plate index)', TARGET.platesCreate, register),
    await measure('auto repair: register a car (working order)', TARGET.repairOrdersCreate, register),
    await measure('auto repair: register a known plate (vehicle update)', TARGET.vehiclesUpdate,
      () => outcome(() => repair.registerVehicleAndOpenOrder(s.owner.businessId, { ...car('known'), model: `Model ${next()}` }, { currency: 'ILS' }))),
    await measure('auto repair: add a part and labor (service record)', TARGET.repairServicesCreate, service),
    await measure('auto repair: add a part and labor (items)', TARGET.repairItemsCreate, service),
    await measure('auto repair: add a part and labor (order totals)', TARGET.repairOrdersUpdate, service),
    await measure('auto repair: add a part and labor (part stock)', TARGET.partsUpdate, service),
    await measure('auto repair: list repair orders', TARGET.repairOrdersRead, () => outcome(() => repair.listRepairOrders(s.owner.businessId))),
    await measure('auto repair: list parts in stock', TARGET.partsRead, () => outcome(() => repair.listPartsInStock(s.owner.businessId))),
    await measure('auto repair: delete an order (order)', TARGET.repairOrdersDelete, deletion),
    await measure('auto repair: delete an order (items)', TARGET.repairItemsDelete, deletion),
    await measure('auto repair: delete an order (service records)', TARGET.repairServicesDelete, deletion),
  ]);
});

test('car parts: inventory create, edit, delete and list', async () => {
  const form = (n) => ({ part_name: `Budget part ${n}`, description: `Part ${n} description`, serial_number: `SKU-${n}`,
    compatible_cars: ['Toyota Corolla', `Model ${n}`], quantity: 3 + n, purchase_price_unit: 12.25 + n, purchase_price_total: 49 + n,
    selling_price_unit: 19.99 + n });
  const parts = s.owner.parts;
  const editable = await parts.createPart(s.owner.businessId, form(0));
  assertWithin([
    await measure('car parts: add a part (every form column)', TARGET.partsCreate, () => outcome(() => parts.createPart(s.owner.businessId, form(next())))),
    await measure('car parts: edit a part (every form column)', TARGET.partsUpdate, () => outcome(() => parts.updatePart(editable.id, form(next())))),
    await measure('car parts: list parts', TARGET.partsRead, () => outcome(() => parts.listParts(s.owner.businessId))),
    await measure('car parts: delete a part', TARGET.partsDelete, async () => {
      const part = await parts.createPart(s.owner.businessId, form(next()));
      return outcome(() => parts.deletePart(part.id));
    }),
  ]);
});

test('restaurant: floor, orders and their ledger, kitchen, manager approval, analytics and staff', async () => {
  const restaurant = s.owner.restaurant;
  const uid = s.owner.uid;
  const category = await restaurant.createCategory(uid, { name: 'Budget mains' });
  const dishes = [];
  for (let n = 0; n < 3; n += 1) dishes.push(await restaurant.createMenuItem({ category_id: category.id, name: `Budget dish ${n}`, name_he: `מנה ${n}`, price: 40.5 + n }));
  const table = await restaurant.createTable(uid, { name: 'Budget table' });
  const line = (dish, quantity = 1) => ({ item_id: dish.id, quantity, price_at_time: dish.price, notes: `note ${next()}` });
  const openOrder = async (fire) => {
    const order = await restaurant.createOrder(uid, { table_id: table.id, currency: 'ILS' });
    await restaurant.saveOrderCart(order.id, [line(dishes[0], 2)], fire, null);
    return order;
  };
  // A measurement repeats its request about ten times; prepared orders keep every attempt a fresh, allowed request
  // whose setup never passes through the rule being measured.
  const pool = async (count, fire) => { const orders = []; for (let i = 0; i < count; i += 1) orders.push(await openOrder(fire)); return orders; };
  const take = (orders) => { const order = orders.shift(); if (!order) throw new Error('BUDGET_POOL_EXHAUSTED'); return order; };
  const toSend = await pool(36, true);
  const toPay = await pool(12, false);
  const toVoid = await pool(36, false);
  const toCancel = await pool(12, false);
  const toDelete = await pool(12, false);
  const growing = await openOrder(false);
  const discounted = await openOrder(false);
  const ticketOrder = await openOrder(true);
  const ticketId = await restaurant.sendToKitchen(ticketOrder.id);
  const closed = await openOrder(true);
  await restaurant.closeOrderPaid(closed.id, { method: 'cash', total_amount: 81, tax_amount: 0 });
  const window = [new Date(Date.now() - 3_600_000).toISOString(), new Date(Date.now() + 3_600_000).toISOString()];
  const editable = (await restaurant.listClosedOrders(...window)).find((order) => order.id === closed.id);
  const firstLine = async (order) => (await getDocs(query(collection(s.owner.db, 'businesses', s.owner.businessId, 'orderItems'),
    where('orderId', '==', order.id)))).docs[0].id;
  const approve = () => restaurant.authorizeStaffAction(uid, { email: email('owner'), password: PASSWORD }, 'manager');
  const voidNext = async () => {
    const itemId = await firstLine(take(toVoid));
    const approval = await approve();
    return outcome(() => restaurant.voidOrderItem({ itemId, reason: 'Budget', authStaffId: approval.staff_id }));
  };

  // A waiter is a synthetic staff identity: its own account and an active membership, so its requests pay for the
  // membership checks an owner does not.
  const waiter = clientFor('waiter');
  const waiterUser = await waiter.gateway.signUp(email('waiter'), PASSWORD);
  accounts.add(waiterUser.id);
  const waiterStaff = await restaurant.createStaff(uid, { full_name: 'Budget waiter' });
  const membershipId = `${s.owner.businessId}__${waiterUser.id}`;
  await bypass.create('restaurantMemberships', membershipId, { uid: waiterUser.id, businessId: s.owner.businessId, staffId: waiterStaff.id,
    role: 'waiter', status: 'active', enabled: true, schemaVersion: 1, approvedBy: uid });
  memberships.push(membershipId);
  const waiterOrder = await waiter.restaurant.createOrder(uid, { table_id: table.id, currency: 'ILS' });

  // Reservations board, waitlist, guest profiles and refunds. Waitlist and guest rows have no mounted create flow, so
  // they are seeded as the migration writes them.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const booked = await restaurant.createReservation(uid, { guest_name: 'Budget guest', guest_phone: '0501234567', reservation_date: tomorrow, reservation_time: '21:00', party_size: 4 });
  const seedCodec = { ...s.owner.session.codec(), serverTimestamp: () => new Date(), timestamp: (seconds, nanos) => new Date(seconds * 1000 + Math.floor(nanos / 1e6)) };
  const seedRow = async (name, tableName, row) => {
    const created = encodeInsert(tableName, { business_id: uid, ...row }, seedCodec, tenancy());
    await bypass.create(`businesses/${s.owner.businessId}/${name}`, created.id, { ...created.data, legacyBusinessUserId: uid });
    return created.id;
  };
  const waiting = await seedRow('waitlist', 'restaurant_waitlist', { guest_name: 'Budget walk-in', guest_phone: '0507654321', party_size: 2 });
  const guestId = await seedRow('guestProfiles', 'restaurant_guest_profiles', { first_name: 'Budget', full_name: 'Budget Guest', phone: '0501234567' });
  const refundable = await restaurant.createOrder(uid, { table_id: table.id, currency: 'ILS' });
  await restaurant.saveOrderCart(refundable.id, [line(dishes[0], 2)], false, null);
  await restaurant.closeOrderPaid(refundable.id, { method: 'cash', total_amount: 81, tax_amount: 0 });
  const refundNext = async () => {
    const approval = await approve();
    return outcome(() => restaurant.refundOrder(uid, { orderId: refundable.id, itemIds: [], amount: 81, reason: `Budget ${next()}`, authStaffId: approval.staff_id }));
  };
  const guestRow = () => restaurant.listGuests().then((rows) => rows.find((row) => row.id === guestId));

  let flip = false;
  let discount = 0;
  assertWithin([
    await measure('restaurant: create a table (settings)', TARGET.tablesCreate,
      () => outcome(() => restaurant.createTable(uid, { name: `Budget table ${next()}`, seats: 6, shape: 'square', zone: 'patio', rotation: 45 }))),
    await measure('restaurant: add a category-scoped menu item (settings)', TARGET.itemsCreate,
      () => outcome(() => restaurant.createMenuItem({ category_id: category.id, name: `Budget item ${next()}`, price: 12.5, cost_price: 4, description: 'desc', allergens: ['nuts'] }))),
    await measure('restaurant: open an order (order)', TARGET.ordersCreate,
      () => outcome(() => restaurant.createOrder(uid, { table_id: table.id, currency: 'ILS', is_rush: true }))),
    await measure('restaurant: open an order (number counter)', TARGET.countersWrite,
      () => outcome(() => restaurant.createOrder(uid, { table_id: table.id, currency: 'ILS' }))),
    await measure('restaurant: add an order line (line)', TARGET.orderItemsCreate,
      () => outcome(() => restaurant.saveOrderCart(growing.id, [line(dishes[1])], false, null))),
    await measure('restaurant: add an order line (order ledger)', TARGET.ordersUpdate,
      () => outcome(() => restaurant.saveOrderCart(growing.id, [line(dishes[2])], false, null))),
    await measure('restaurant (waiter member): add an order line at the menu price', TARGET.orderItemsCreate,
      () => outcome(() => waiter.restaurant.saveOrderCart(waiterOrder.id, [line(dishes[0])], false, null))),
    await measure('restaurant: send to the kitchen (ticket)', TARGET.ticketsCreate, () => outcome(() => restaurant.sendToKitchen(take(toSend).id))),
    await measure('restaurant: send to the kitchen (ticket line)', TARGET.ticketItemsCreate, () => outcome(() => restaurant.sendToKitchen(take(toSend).id))),
    await measure('restaurant: send to the kitchen (line marked sent)', TARGET.orderItemsUpdate, () => outcome(() => restaurant.sendToKitchen(take(toSend).id))),
    await measure('restaurant: kitchen display moves a ticket', TARGET.ticketsUpdate, () => {
      flip = !flip;
      return outcome(() => restaurant.updateTicketStatus(ticketId, flip ? 'in_progress' : 'ready'));
    }),
    await measure('restaurant: save an open order total (order modal)', TARGET.ordersUpdate,
      () => outcome(() => restaurant.saveOrderCart(growing.id, [], false, { total_amount: 0, tax_amount: 0 }))),
    await measure('restaurant: pay and close', TARGET.ordersUpdate,
      () => outcome(() => restaurant.closeOrderPaid(take(toPay).id, { method: 'card', total_amount: 81, tax_amount: 0 }))),
    await measure('restaurant: manager void (line)', TARGET.orderItemsUpdate, voidNext),
    await measure('restaurant: manager void (void log)', TARGET.voidLogsCreate, voidNext),
    await measure('restaurant: manager void (audit record)', TARGET.auditCreate, voidNext),
    await measure('restaurant: manager discount (order)', TARGET.ordersUpdate, async () => {
      discount += 1;
      const approval = await approve();
      return outcome(() => restaurant.applyDiscount({ orderId: discounted.id, discountAmount: 1 + (discount % 5), reason: `Budget ${discount}`, authStaffId: approval.staff_id }));
    }),
    await measure('restaurant: manager cancel (lines)', TARGET.orderItemsUpdate, async () => {
      const order = take(toCancel);
      const approval = await approve();
      return outcome(() => restaurant.cancelOrderByManager(order.id, approval.staff_id));
    }),
    await measure('restaurant: analytics edit of a closed order (totals)', TARGET.ordersUpdate,
      () => outcome(() => restaurant.saveOrderEdit(editable, editable.items.map((item) => ({ id: item.id, item_id: item.item_id, quantity: item.quantity,
        price_at_time: item.price_at_time, notes: item.notes, status: item.status })), { total_amount: 0, subtotal_amount: 0, tax_amount: 0 }))),
    await measure('restaurant: analytics delete an order (lines)', TARGET.orderItemsDelete, () => outcome(() => restaurant.deleteOrder(take(toDelete).id))),
    await measure('restaurant: full refund (order marked refunded)', TARGET.ordersUpdate, refundNext),
    await measure('restaurant: full refund (audit record)', TARGET.auditCreate, refundNext),
    await measure('restaurant: allergy override log naming a staff member (audit record)', TARGET.auditCreate,
      () => outcome(() => restaurant.logActivity({ p_business_id: uid, p_activity_type: 'ALLERGY_OVERRIDE', p_entity_type: 'order_item', p_entity_id: dishes[0].id,
        p_details: { itemName: 'Budget dish', allergens: ['nuts'], reason: `Budget ${next()}`, method: 'verbal', orderId: 'NEW_ORDER' }, p_staff_id: waiterStaff.id }))),
    await measure('restaurant: create a reservation (reservations board)', TARGET.reservationsCreate,
      () => outcome(() => restaurant.createReservation(uid, { guest_name: `Budget guest ${next()}`, guest_phone: '0501234567', reservation_date: tomorrow, reservation_time: '20:00', party_size: 2 }))),
    await measure('restaurant: seat a reservation (reservations board)', TARGET.reservationsUpdate,
      () => outcome(() => restaurant.updateReservation(booked.id, { status: 'seated', seated_at: new Date().toISOString() }))),
    await measure('restaurant: seat a waiting party at a table (waitlist)', TARGET.waitlistUpdate,
      () => outcome(() => restaurant.updateWaitlist(waiting, { status: 'seated', seated_at: new Date().toISOString(), table_id: table.id }))),
    await measure('restaurant: edit a guest profile (guest profiles)', TARGET.guestsUpdate,
      async () => { const guest = await guestRow(); return outcome(() => restaurant.updateGuest(guestId, { ...guest, notes: `Budget ${next()}`, tags: ['vip'] })); }),
    await measure('restaurant: add a staff member (settings)', TARGET.staffCreate,
      () => outcome(() => restaurant.createStaff(uid, { full_name: `Budget staff ${next()}`, role: 'Waiter', hourly_rate: 38.5, email: `staff${next()}@example.com`, phone: '0501234567' }))),
    await measure('restaurant: list active orders with lines, dishes, table and server', TARGET.ordersRead, () => outcome(() => restaurant.listActiveOrders(uid))),
  ]);
});

test('the budget report is written', () => {
  writeFileSync(REPORT, `${JSON.stringify({
    limit: EXPRESSION_LIMIT, productCeiling: PRODUCT_CEILING, method: 'migration/firestore/lib/rules-budget.mjs',
    decision: results.every((entry) => entry.withinLimit && (!entry.product || entry.costAtMost <= PRODUCT_CEILING)) ? 'PASS' : 'FAIL',
    paths: results.map(({ path, rule, product, withinLimit, costAtMost, costAbove, parts }) =>
      ({ path, rule, product, withinLimit, costAtMost, costAbove, ...(parts ? { parts } : {}) })),
  }, null, 2)}\n`);
  assert.equal(results.length, 66, 'every measured path is reported');
});
