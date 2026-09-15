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
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';
import { FirebaseSession } from '../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../src/data/firestore/FirestoreProfileRepository.ts';
import { FirestoreAdminRepository } from '../src/data/firestore/FirestoreAdminRepository.ts';
import { FirestoreSupermarketRepository } from '../src/data/firestore/FirestoreSupermarketRepository.ts';
import { encodeInsert } from '../src/data/firestore/documentCodec.ts';
import { RulesClient } from '../migration/firestore/lib/rules-client.mjs';
import { EXPRESSION_LIMIT, allowExpression, conjuncts, measureRuleCost, outcome } from '../migration/firestore/lib/rules-budget.mjs';

const PROJECT = 'mydesck-migration-proof';
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
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
  const handle = { app, auth, db, session, gateway: new FirestoreAuthGateway(session), profiles: new FirestoreProfileRepository(session),
    admin: new FirestoreAdminRepository(session), market: new FirestoreSupermarketRepository(session) };
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
      for (const name of ['menuItems', 'menuCategories', 'marketTransactions']) {
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

test('the budget report is written', () => {
  writeFileSync(REPORT, `${JSON.stringify({
    limit: EXPRESSION_LIMIT, productCeiling: PRODUCT_CEILING, method: 'migration/firestore/lib/rules-budget.mjs',
    decision: results.every((entry) => entry.withinLimit && (!entry.product || entry.costAtMost <= PRODUCT_CEILING)) ? 'PASS' : 'FAIL',
    paths: results.map(({ path, rule, product, withinLimit, costAtMost, costAbove, parts }) =>
      ({ path, rule, product, withinLimit, costAtMost, costAbove, ...(parts ? { parts } : {}) })),
  }, null, 2)}\n`);
  assert.equal(results.length, 20, 'every measured path is reported');
});
