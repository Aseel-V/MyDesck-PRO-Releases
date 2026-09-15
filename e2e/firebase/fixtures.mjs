/**
 * Synthetic tenants for the Firebase-root browser smoke.
 *
 * Each tenant is registered through the application's own FirestoreAuthGateway and
 * FirestoreProfileRepository, exactly as registration writes production documents; only the business type,
 * which no owner may change under the Rules, is then set over the emulator's operator path. `--cleanup`
 * removes every document and account the fixture created. Emulator only.
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
import { RulesClient } from '../../migration/firestore/lib/rules-client.mjs';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FIXTURE = 'migration/full-vertical.local/ui-smoke-fixture.json';
const SUBCOLLECTIONS = ['menuItems', 'menuCategories', 'marketTransactions'];
/** One tenant per interface language, so right-to-left and left-to-right rendering are both exercised. */
const TENANTS = { supermarket: ['he', 'ar', 'en'] };
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });

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
        fixture.tenants[vertical][language] = { email, uid: user.id, businessId: business.businessId };
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
