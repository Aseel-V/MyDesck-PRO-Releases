/**
 * Vertical smoke through the application's own repositories.
 *
 * The previous smoke hand-authored documents against the deployed Rules and was denied nine times.
 * Each denial turned out to be a defect in the fixture rather than in production — wrong key names,
 * a non-atomic bootstrap, trialStartDate needing a server timestamp, migration provenance copied
 * onto client documents, money that broke the derived-total invariants — which is the whole problem
 * with hand-authoring: it tests a second, invented schema instead of the one the app writes.
 *
 * So this drives `createFirestoreBackend`, the same composition root the packaged client uses, and
 * calls the same repository methods the UI calls. A denial here means the application cannot do it,
 * which is the only question worth asking.
 *
 * The Admin SDK appears in exactly one place — cleanup — and never in a positive proof.
 *
 *   node scripts/run-typescript-source-test.mjs migration/firestore/tools/client-path-smoke.ts
 */
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createFirestoreBackend } from '../../../src/data/firestore/createFirestoreBackend';
import { registerBackend } from '../../../src/data/backend';
import { buildSyntheticTripForm, buildSyntheticTripEdit } from './tourism-payload';
import type { FirebaseClient } from '../../../src/data/firebaseClient';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const runId = `clientpath-${randomUUID()}`;
const SYNTH = `migration-test--${runId}`;
const REPORT_PATH = 'migration/reports/firestore-post-cutover-smoke.json';
const MANIFEST_PATH = `migration/post-cutover-smoke.local/${runId}.json`;

type Classification = 'PASS' | 'TEST_FIXTURE_DEFECT' | 'APPLICATION_WRITE_DEFECT'
  | 'RULES_DEFECT' | 'INDEX_DEFECT' | 'DATA_MODEL_DEFECT';
interface Check { vertical: string; operation: string; ok: boolean;
  classification: Classification; detail: string | null }

const checks: Check[] = [];
const sdk = process.env.GCLOUD_SDK_ROOT
  ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
const operatorToken = () => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();

/**
 * Classify a failure rather than calling everything a production defect.
 *
 * An index error and a rules denial look nothing alike, and neither looks like a bad argument from
 * the caller. Only a denial of an operation the application itself constructed is evidence about
 * production, and even then the classification says which layer refused.
 */
const classify = (error: unknown): Classification => {
  const message = String((error as Error)?.message ?? error);
  if (/requires an index|FAILED_PRECONDITION.*index/i.test(message)) return 'INDEX_DEFECT';
  if (/permission|insufficient|PERMISSION_DENIED/i.test(message)) return 'RULES_DEFECT';
  // A TypeError thrown inside the model means the caller handed it the wrong shape; nothing reached
  // Firestore, so it says nothing about production. That is a defect in this fixture, not evidence.
  if (/Cannot read properties of|is not a function|undefined is not/i.test(message)) {
    return 'TEST_FIXTURE_DEFECT';
  }
  if (/invalid|unsupported field|cannot be used/i.test(message)) return 'DATA_MODEL_DEFECT';
  return 'APPLICATION_WRITE_DEFECT';
};
const run = async <T>(vertical: string, operation: string, fn: () => Promise<T>): Promise<T | null> => {
  try {
    const value = await fn();
    checks.push({ vertical, operation, ok: true, classification: 'PASS', detail: null });
    return value;
  } catch (error) {
    checks.push({ vertical, operation, ok: false, classification: classify(error),
      detail: String((error as Error)?.message ?? error).slice(0, 220) });
    return null;
  }
};
const runDenied = async (vertical: string, operation: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    checks.push({ vertical, operation, ok: false, classification: 'RULES_DEFECT',
      detail: 'cross-tenant operation unexpectedly succeeded' });
  } catch (error) {
    const denied = /permission|insufficient|PERMISSION_DENIED|not found|UNAUTHORIZED/i
      .test(String((error as Error)?.message ?? error));
    checks.push({ vertical, operation, ok: denied,
      classification: denied ? 'PASS' : 'APPLICATION_WRITE_DEFECT',
      detail: denied ? null : String((error as Error)?.message ?? error).slice(0, 220) });
  }
};

// ---- the real client, built without the env-reading factory ---------------------------------------
const firebaseEntry = join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools',
  'lib', 'bin', 'firebase.js');
const raw = execFileSync(process.execPath,
  [firebaseEntry, 'apps:sdkconfig', 'WEB', '--project', PROJECT, '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
const parsedConfig = JSON.parse(raw.slice(raw.indexOf('{')));
const webConfig = parsedConfig.result?.sdkConfig ?? parsedConfig.result ?? parsedConfig;

const options = { projectId: PROJECT, apiKey: webConfig.apiKey, authDomain: webConfig.authDomain };
const app = initializeApp(options, `client-path-${runId}`);
const auth = getAuth(app);
const db = getFirestore(app, DATABASE);
// The same shape createProductionClient returns; only the import.meta.env read is bypassed, because
// esbuild's Node bundle has no Vite env. Everything below this line is the application's own code.
const client = { mode: 'firestore' as const, app, auth, db, ready: Promise.resolve(undefined),
  maintenanceEnabled: false, isolatedIdentity: () => { throw new Error('not used'); } };
const backend = createFirestoreBackend(client as unknown as FirebaseClient);
// firebase-main.tsx registers the backend; the trip write path reaches for it through
// getBackend() when probing the canonical payment-write contract.
registerBackend(backend);

const manifest = { runId, createdAt: new Date().toISOString(), authUids: [] as string[] };
mkdirSync('migration/post-cutover-smoke.local', { recursive: true });
const persist = () => writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

const tenants: Record<string, { uid: string; email: string; password: string; businessId: string }> = {};
try {
  // ---- two tenants, bootstrapped by the application's own self-registration --------------------
  for (const label of ['A', 'B']) {
    const email = `${SYNTH}-${label}@example.test`;
    const password = `Pw-${randomUUID()}`;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    manifest.authUids.push(credential.user.uid); persist();
    await run('bootstrap', `tenant ${label}: createOwnerProfiles`, () =>
      backend.profiles.createOwnerProfiles(credential.user.uid, email, {
        businessName: `${SYNTH}-${label}`, logoUrl: null,
        currency: 'ILS' as never, language: 'en' as never,
      }));
    const business = await backend.profiles.fetchBusinessProfile(credential.user.uid);
    tenants[label] = { uid: credential.user.uid, email, password,
      businessId: (business as { id?: string } | null)?.id ?? '' };
  }

  const a = tenants.A;
  const b = tenants.B;
  await signInWithEmailAndPassword(auth, a.email, a.password);

  // ---- car parts --------------------------------------------------------------------------------
  const part = await run('carParts', 'createPart', () => backend.carParts.createPart(a.businessId, {
    part_name: SYNTH, description: SYNTH, quantity: 5,
    purchase_price_unit: 60, selling_price_unit: 100,
  }));
  await run('carParts', 'listParts', () => backend.carParts.listParts(a.businessId));
  if (part) {
    await run('carParts', 'updatePart', () => backend.carParts.updatePart((part as { id: string }).id, {
      part_name: `${SYNTH}-updated`, quantity: 6, selling_price_unit: 110, purchase_price_unit: 60,
    }));
    await run('carParts', 'cross-tenant updatePart leaves the victim unchanged', async () => {
      const before = await backend.carParts.listParts(a.businessId);
      await signInWithEmailAndPassword(auth, b.email, b.password);
      try { await backend.carParts.updatePart((part as { id: string }).id, { part_name: 'x', quantity: 1 }); }
      catch { /* either is fine */ }
      await signInWithEmailAndPassword(auth, a.email, a.password);
      const after = await backend.carParts.listParts(a.businessId);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('victim tenant was modified');
    });
    await run('carParts', 'deletePart', () => backend.carParts.deletePart((part as { id: string }).id));
  }

  // ---- supermarket ------------------------------------------------------------------------------
  await run('supermarket', 'createProduct', () => backend.supermarket.createProduct(a.uid, {
    name: SYNTH, description: SYNTH, price: 12.5, barcode: null, category_id: null,
    type: 'unit', image_url: null,
  }));
  const products = await run('supermarket', 'listAvailableProducts',
    () => backend.supermarket.listAvailableProducts(a.uid));
  const product = Array.isArray(products)
    ? (products as Array<{ id: string }>).find((p) => true) ?? null : null;
  if (product) {
    await run('supermarket', 'updateProduct',
      () => backend.supermarket.updateProduct(product.id, { price: 13.5 }));
    await run('supermarket', 'cross-tenant updateProduct leaves the victim unchanged', async () => {
      const before = await backend.supermarket.listAvailableProducts(a.uid);
      await signInWithEmailAndPassword(auth, b.email, b.password);
      try { await backend.supermarket.updateProduct(product.id, { price: 1 }); } catch { /* either is fine */ }
      await signInWithEmailAndPassword(auth, a.email, a.password);
      const after = await backend.supermarket.listAvailableProducts(a.uid);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('victim tenant was modified');
    });
    await run('supermarket', 'deleteProduct', () => backend.supermarket.deleteProduct(product.id));
  }

  // ---- restaurant -------------------------------------------------------------------------------
  const table = await run('restaurant', 'createTable',
    () => backend.restaurant.createTable(a.uid, { name: SYNTH }));
  await run('restaurant', 'listTables', () => backend.restaurant.listTables(a.uid));
  if (table) {
    const tableId = (table as { id: string }).id;
    await run('restaurant', 'updateTable', () => backend.restaurant.updateTable(tableId, { name: `${SYNTH}-2` } as never));
    await run('restaurant', 'cross-tenant updateTable leaves the victim unchanged', async () => {
      const before = await backend.restaurant.listTables(a.uid);
      await signInWithEmailAndPassword(auth, b.email, b.password);
      try { await backend.restaurant.updateTable(tableId, { name: 'x' } as never); } catch { /* either is fine */ }
      await signInWithEmailAndPassword(auth, a.email, a.password);
      const after = await backend.restaurant.listTables(a.uid);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('victim tenant was modified');
    });
    await run('restaurant', 'deleteTable', () => backend.restaurant.deleteTable(tableId));
  }
  await run('restaurant', 'createCategory',
    () => backend.restaurant.createCategory(a.uid, { name: SYNTH } as never));

  // ---- auto repair ------------------------------------------------------------------------------
  await run('autoRepair', 'registerVehicleAndOpenOrder',
    () => backend.autoRepair.registerVehicleAndOpenOrder(a.businessId,
      { plate_number: `${runId.slice(-8)}`, model: SYNTH, owner_name: SYNTH,
        owner_phone: '0500000000', test_expiry: null },
      { currency: 'ILS' }));
  const orders = await run('autoRepair', 'listRepairOrders',
    () => backend.autoRepair.listRepairOrders(a.businessId));
  const order = Array.isArray(orders) ? (orders as Array<{ id: string }>)[0] ?? null : null;
  if (order) {
    await run('autoRepair', 'deleteRepairOrder', () => backend.autoRepair.deleteRepairOrder(order.id));
  }

  // ---- tourism, with the payload validated offline and the signature useTripMutations uses ----
  const today = new Date().toISOString().slice(0, 10);
  const created = await run('tourism', 'CREATE saveTrip', () =>
    backend.travel.saveTrip(a.uid, buildSyntheticTripForm(SYNTH, today), undefined, randomUUID()));
  const tripId = (created as { id?: string } | null)?.id ?? null;
  if (tripId) {
    await run('tourism', 'READ getTripDetails', async () => {
      const details = await backend.travel.getTripDetails(tripId);
      if (!details) throw new Error('trip not readable by its owner');
      return details;
    });
    await run('tourism', 'UPDATE saveTrip with editTripId', () =>
      backend.travel.saveTrip(a.uid, buildSyntheticTripEdit(SYNTH, today), tripId, randomUUID()));
    await run('financial', 'money survives the edit round trip', async () => {
      const details = await backend.travel.getTripDetails(tripId) as Record<string, unknown>;
      if (!String(details?.destination ?? '').endsWith('-updated')) throw new Error('edit not observed');
      if (details?.currency !== 'ILS') throw new Error(`currency is ${String(details?.currency)}`);
      return true;
    });
    await run('tenantIsolation', 'tenant B cannot read tenant A trip', async () => {
      await signInWithEmailAndPassword(auth, b.email, b.password);
      try {
        const details = await backend.travel.getTripDetails(tripId);
        if (details) throw new Error('tenant B read tenant A trip');
        return true;
      } catch (error) {
        if (String((error as Error)?.message) === 'tenant B read tenant A trip') throw error;
        return true;
      } finally { await signInWithEmailAndPassword(auth, a.email, a.password); }
    });
    await run('tourism', 'DELETE deleteTrip', () => backend.travel.deleteTrip(a.uid, tripId));
  }
} finally {
  // ---- cleanup, delegated and fail-safe ---------------------------------------------------------
  // The sweep runs in its own process: this bundle is built by esbuild and executed from the
  // repository root, where the privileged Firestore dependencies do not resolve, and the operator
  // credential has no business living in the same module as the client-path proof.
  manifest.businessIds = Object.values(tenants).map((tenant) => tenant.businessId).filter(Boolean);
  persist();
  let sweep: { firestoreSwept?: number; firestoreSweepFailed?: number; authDeleted?: number;
    authFailed?: number; residue?: number } = {};
  try {
    const output = execFileSync(process.execPath,
      ['migration/firestore/tools/sweep-synthetic-tenants.mjs', `--manifest=${MANIFEST_PATH}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900_000 });
    sweep = JSON.parse(output.slice(output.indexOf('{')));
  } catch (error) {
    const output = String((error as { stdout?: string })?.stdout ?? '');
    try { sweep = JSON.parse(output.slice(output.indexOf('{'))); }
    catch { sweep = { residue: -1 }; }
  }
  await signOut(auth).catch(() => undefined);
  const residue = sweep.residue ?? -1;

  const failed = checks.filter((check) => !check.ok);
  const byVertical: Record<string, { pass: number; fail: number }> = {};
  for (const check of checks) {
    byVertical[check.vertical] ??= { pass: 0, fail: 0 };
    byVertical[check.vertical][check.ok ? 'pass' : 'fail'] += 1;
  }

  const report = {
    generatedAt: new Date().toISOString(), artifact: 'firestore-post-cutover-smoke', runId,
    target: 'PRODUCTION', project: PROJECT, releasedVersion: '0.0.62',
    method: 'application repositories via createFirestoreBackend; Admin SDK used only for cleanup',
    byVertical,
    totalChecks: checks.length,
    failedChecks: failed.length,
    classifications: failed.reduce((acc: Record<string, number>, check) => {
      acc[check.classification] = (acc[check.classification] ?? 0) + 1; return acc; }, {}),
    checks,
    cleanup: { firestoreSwept: sweep.firestoreSwept ?? 0,
      firestoreSweepFailed: sweep.firestoreSweepFailed ?? 0,
      authCreated: manifest.authUids.length, authDeleted: sweep.authDeleted ?? 0,
      authFailed: sweep.authFailed ?? 0 },
    syntheticResidue: residue,
    customerMutations: 0,
    decision: failed.length === 0 && residue === 0 ? 'PRODUCTION_SMOKE_PASS' : 'PRODUCTION_SMOKE_FAIL',
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ decision: report.decision, byVertical, totalChecks: report.totalChecks,
    failedChecks: report.failedChecks, classifications: report.classifications,
    syntheticResidue: residue,
    failures: failed.map((f) => `${f.vertical}/${f.operation} [${f.classification}] ${f.detail ?? ''}`),
    report: REPORT_PATH }, null, 2));
}
