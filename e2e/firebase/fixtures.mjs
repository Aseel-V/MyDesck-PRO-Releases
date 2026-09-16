/**
 * Synthetic tenants for the Firebase-root browser smoke.
 *
 * Each tenant is registered through the application's own FirestoreAuthGateway and
 * FirestoreProfileRepository, exactly as registration writes production documents; only the business type,
 * which no owner may change under the Rules, is then set over the emulator's operator path. Auto repair
 * tenants also get one part in stock over that path, because the service flow consumes inventory that the
 * car-parts screens own. `--cleanup` removes every document and account the fixture created. Emulator only.
 *
 *   node scripts/run-typescript-source-test.mjs e2e/firebase/fixtures.mjs --create
 *   node scripts/run-typescript-source-test.mjs e2e/firebase/fixtures.mjs --cleanup
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { FirebaseSession } from '../../src/data/firestore/FirebaseSession.ts';
import { FirestoreAuthGateway } from '../../src/data/firestore/FirestoreAuthGateway.ts';
import { FirestoreProfileRepository } from '../../src/data/firestore/FirestoreProfileRepository.ts';
import { encodeInsert } from '../../src/data/firestore/documentCodec.ts';
import { RulesClient } from '../../migration/firestore/lib/rules-client.mjs';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIXTURE = 'migration/full-vertical.local/ui-smoke-fixture.json';
/** Tourism's own collections: top-level, and cleaned up by owner. */
const TOURISM_COLLECTIONS = ['trips', 'tripPaymentPlans', 'tripInstallments', 'tripActivityLog', 'tripFinancialAudit',
  'tripPaymentEvents', 'tripInstallmentEvents', 'tripNotifications', 'tripTemplates', 'tripWhatsappTemplates',
  'storageCleanupQueue', 'tripPlans', 'sparkOperations', 'idempotency'];
const SUBCOLLECTIONS = ['menuItems', 'menuCategories', 'marketTransactions',
  'vehicles', 'vehiclePlates', 'repairOrders', 'repairOrderItems', 'repairServices', 'parts',
  'tables', 'restaurantStaff', 'restaurantCounters', 'orders', 'orderItems', 'kitchenTickets', 'ticketItems', 'voidLogs', 'restaurantAuditLogs'];
/** One tenant per interface language, so right-to-left and left-to-right rendering are both exercised. */
const TENANTS = { supermarket: ['he', 'ar', 'en'], auto_repair: ['en', 'he'], car_parts: ['ar'], restaurant: ['en', 'he', 'ar'],
  tourism: ['en', 'he', 'ar'] };
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const restCodec = {
  timestamp: (seconds, nanoseconds) => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)),
  serverTimestamp: () => new Date(), deleteField: () => { throw new Error('DELETE_FIELD_OVER_REST'); }, newId: () => randomUUID(),
};

async function create() {
  const run = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
  const password = `UiSmoke-${run}-9!`;
  const fixture = { run, password, tenants: {} };
  for (const [vertical, languages] of Object.entries(TENANTS)) {
    fixture.tenants[vertical] = {};
    for (const language of languages) {
      const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `ui-smoke-${vertical}-${language}-${run}`);
      const auth = getAuth(app);
      connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
      const db = getFirestore(app);
      const [host, port] = FIRESTORE_HOST.split(':');
      connectFirestoreEmulator(db, host, Number(port));
      const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
      const email = `migration-test--ui-smoke-${vertical.replace('_', '-')}-${language}-${run}@example.com`;
      try {
        const user = await new FirestoreAuthGateway(session).signUp(email, password);
        await new FirestoreProfileRepository(session).createOwnerProfiles(user.id, email,
          { businessName: `UI smoke ${vertical} ${language}`, logoUrl: null, currency: 'ILS', language });
        const business = await session.requireOwnedBusiness();
        const typed = await bypass.update(`businesses/${business.businessId}`, { businessType: vertical });
        if (!typed.ok) throw new Error(`BUSINESS_TYPE_NOT_SET:${typed.status}`);
        const tenant = { email, uid: user.id, businessId: business.businessId };
        if (vertical === 'auto_repair') {
          // Unique per tenant: an isolation check that looks for another tenant's part by name must not match its own.
          tenant.partName = `Smoke brake pads ${language} ${run}`;
          const part = encodeInsert('car_parts', { business_id: business.businessId, part_name: tenant.partName, quantity: 5,
            purchase_price_unit: 12.25, selling_price_unit: 59.99, compatible_cars: ['Toyota Corolla'] },
          restCodec, { ownerUid: user.id, businessId: business.businessId });
          const seeded = await bypass.set(`businesses/${business.businessId}/parts/${part.id}`, part.data);
          if (!seeded.ok) throw new Error(`PART_NOT_SEEDED:${seeded.status}`);
        }
        if (vertical === 'restaurant') {
          // A menu and a table in the migrated shape; names are unique per tenant so isolation checks cannot match their own.
          const tenancy = { ownerUid: user.id, businessId: business.businessId };
          const put = async (name, table, row) => {
            const encoded = encodeInsert(table, row, restCodec, tenancy);
            const saved = await bypass.set(`businesses/${business.businessId}/${name}/${encoded.id}`, encoded.data);
            if (!saved.ok) throw new Error(`RESTAURANT_SEED_FAILED:${name}:${saved.status}`);
            return encoded.id;
          };
          Object.assign(tenant, { tableName: `Smoke table ${language} ${run}`, dishName: `Smoke hummus ${language} ${run}`,
            drinkName: `Smoke lemonade ${language} ${run}` });
          const categoryId = await put('menuCategories', 'restaurant_menu_categories', { business_id: user.id, name: `Smoke mains ${language}`, sort_order: 1 });
          for (const [name, price] of [[tenant.dishName, 45.5], [tenant.drinkName, 12]]) {
            await put('menuItems', 'restaurant_menu_items', { category_id: categoryId, name, name_he: name, name_ar: name, price });
          }
          await put('tables', 'restaurant_tables', { business_id: user.id, name: tenant.tableName, seats: 4 });
        }
        fixture.tenants[vertical][language] = tenant;
      } finally {
        await signOut(auth).catch(() => undefined);
        await deleteApp(app).catch(() => undefined);
      }
    }
  }
  mkdirSync('migration/full-vertical.local', { recursive: true });
  writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(JSON.stringify({ created: Object.values(fixture.tenants).reduce((sum, byLanguage) => sum + Object.keys(byLanguage).length, 0) }));
}

async function cleanup() {
  if (!existsSync(FIXTURE)) return;
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const base = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  for (const byLanguage of Object.values(fixture.tenants)) {
    for (const tenant of Object.values(byLanguage)) {
      for (const name of SUBCOLLECTIONS) {
        let pageToken = '';
        do {
          const listing = await fetch(`${base}/businesses/${tenant.businessId}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
            { headers: { Authorization: 'Bearer owner' } }).then((response) => response.json());
          for (const document of listing.documents ?? []) await bypass.delete(document.name.split('/documents/')[1]);
          pageToken = listing.nextPageToken ?? '';
        } while (pageToken);
      }
      // Tourism keeps its rows in top-level collections, so they are removed by owner rather than by path.
      for (const name of TOURISM_COLLECTIONS) {
        let pageToken = '';
        do {
          const listing = await fetch(`${base}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
            { headers: { Authorization: 'Bearer owner' } }).then((response) => response.json());
          for (const document of listing.documents ?? []) {
            const fields = document.fields ?? {};
            const owner = fields.ownerUid?.stringValue ?? fields.actorUid?.stringValue ?? null;
            if (owner !== tenant.uid) continue;
            const path = document.name.split('/documents/')[1];
            if (name === 'trips') {
              const lists = await fetch(`${base}/${path}/packingLists?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
                .then((response) => response.json()).catch(() => ({}));
              for (const list of lists.documents ?? []) await bypass.delete(list.name.split('/documents/')[1]);
            }
            await bypass.delete(path);
          }
          pageToken = listing.nextPageToken ?? '';
        } while (pageToken);
      }
      await bypass.delete(`users/${tenant.uid}/settings/${tenant.uid}`);
      await bypass.delete(`businesses/${tenant.businessId}`);
      await bypass.delete(`businessOwners/${tenant.uid}`);
      await bypass.delete(`users/${tenant.uid}`);
      await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: tenant.uid }),
      });
    }
  }
  rmSync(FIXTURE, { force: true });
  console.log(JSON.stringify({ cleaned: true }));
}

if (process.argv.includes('--cleanup')) await cleanup();
else if (process.argv.includes('--create')) await create();
else throw new Error('USAGE: --create | --cleanup');
