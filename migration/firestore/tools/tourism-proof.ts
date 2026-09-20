/**
 * The tourism vertical through the application's own repository. One attempt.
 *
 * The other four verticals are already proven; this is the last one, and the payload was settled
 * offline against the same pure transforms the repository calls, so this run is spent on the
 * question rather than on discovering another missing field.
 *
 * Every call is the one the UI makes, with the signature `useTripMutations` uses:
 * saveTrip(userId, formData, editTripId, clientRequestId). The Admin SDK appears only in cleanup.
 *
 *   node scripts/run-typescript-source-test.mjs migration/firestore/tools/tourism-proof.ts
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
import type { FirebaseClient } from '../../../src/data/firebaseClient';
import { buildSyntheticTripForm, buildSyntheticTripEdit } from './tourism-payload';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const runId = `tourism-${randomUUID()}`;
const SYNTH = `migration-test--${runId}`;
const REPORT = 'migration/reports/firestore-tourism-proof.json';
const MANIFEST = `migration/post-cutover-smoke.local/${runId}.json`;

type Result = { operation: string; ok: boolean; classification: string; detail: string | null };
const checks: Result[] = [];
const classify = (error: unknown): string => {
  const message = String((error as Error)?.message ?? error);
  if (/requires an index|FAILED_PRECONDITION.*index/i.test(message)) return 'INDEX_DEFECT';
  if (/permission|insufficient|PERMISSION_DENIED/i.test(message)) return 'RULES_DEFECT';
  if (/Cannot read properties of|is not a function/i.test(message)) return 'TEST_FIXTURE_DEFECT';
  if (/invalid|unsupported field|cannot be used/i.test(message)) return 'DATA_MODEL_DEFECT';
  return 'APPLICATION_WRITE_DEFECT';
};
const run = async <T>(operation: string, fn: () => Promise<T>): Promise<T | null> => {
  try { const value = await fn(); checks.push({ operation, ok: true, classification: 'PASS', detail: null }); return value; }
  catch (error) {
    checks.push({ operation, ok: false, classification: classify(error),
      detail: String((error as Error)?.message ?? error).slice(0, 220) });
    return null;
  }
};

const firebaseEntry = join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'firebase-tools',
  'lib', 'bin', 'firebase.js');
const raw = execFileSync(process.execPath,
  [firebaseEntry, 'apps:sdkconfig', 'WEB', '--project', PROJECT, '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
const parsedConfig = JSON.parse(raw.slice(raw.indexOf('{')));
const webConfig = parsedConfig.result?.sdkConfig ?? parsedConfig.result ?? parsedConfig;

const app = initializeApp({ projectId: PROJECT, apiKey: webConfig.apiKey,
  authDomain: webConfig.authDomain }, runId);
const auth = getAuth(app);
const db = getFirestore(app, DATABASE);
const client = { mode: 'firestore' as const, app, auth, db, ready: Promise.resolve(undefined),
  maintenanceEnabled: false, isolatedIdentity: () => { throw new Error('not used'); } };
const backend = createFirestoreBackend(client as unknown as FirebaseClient);
// firebase-main.tsx registers the backend in the module registry, and the trip write path reaches
// for it through getBackend() when it probes the canonical payment-write contract. Building the
// backend without registering it is the whole of BACKEND_NOT_REGISTERED.
registerBackend(backend);

const manifest = { runId, createdAt: new Date().toISOString(), authUids: [] as string[],
  businessIds: [] as string[] };
mkdirSync('migration/post-cutover-smoke.local', { recursive: true });
const persist = () => writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

const today = new Date().toISOString().slice(0, 10);
const tenants: Record<string, { uid: string; email: string; password: string }> = {};
let tripId: string | null = null;
try {
  for (const label of ['A', 'B']) {
    const email = `${SYNTH}-${label}@example.test`;
    const password = `Pw-${randomUUID()}`;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    manifest.authUids.push(credential.user.uid); persist();
    tenants[label] = { uid: credential.user.uid, email, password };
    await run(`bootstrap tenant ${label}`, () =>
      backend.profiles.createOwnerProfiles(credential.user.uid, email, {
        businessName: `${SYNTH}-${label}`, logoUrl: null,
        currency: 'ILS' as never, language: 'en' as never }));
    const business = await backend.profiles.fetchBusinessProfile(credential.user.uid);
    const id = (business as { id?: string } | null)?.id;
    if (id) { manifest.businessIds.push(id); persist(); }
  }

  const a = tenants.A;
  const b = tenants.B;
  await signInWithEmailAndPassword(auth, a.email, a.password);

  // CREATE
  const created = await run('CREATE saveTrip', () =>
    backend.travel.saveTrip(a.uid, buildSyntheticTripForm(SYNTH, today), undefined, randomUUID()));
  tripId = (created as { id?: string } | null)?.id ?? null;

  if (tripId) {
    // READ
    await run('READ getTripDetails', async () => {
      const details = await backend.travel.getTripDetails(tripId as string);
      if (!details) throw new Error('trip not readable by its owner');
      return details;
    });

    // UPDATE — the same method with editTripId, which is how the edit screen saves.
    await run('UPDATE saveTrip with editTripId', () =>
      backend.travel.saveTrip(a.uid, buildSyntheticTripEdit(SYNTH, today), tripId as string, randomUUID()));
    await run('UPDATE is observable on read', async () => {
      const details = await backend.travel.getTripDetails(tripId as string) as Record<string, unknown>;
      const destination = String(details?.destination ?? '');
      if (!destination.endsWith('-updated')) throw new Error(`destination is ${destination}`);
      return true;
    });

    // TENANT ISOLATION — B must not see A's trip.
    await run('tenant isolation: B cannot read A trip', async () => {
      await signInWithEmailAndPassword(auth, b.email, b.password);
      try {
        const details = await backend.travel.getTripDetails(tripId as string);
        if (details) throw new Error('tenant B read tenant A trip');
        return true;
      } catch (error) {
        const denied = /permission|insufficient|PERMISSION_DENIED/i
          .test(String((error as Error)?.message ?? error));
        if (!denied && String((error as Error)?.message) === 'tenant B read tenant A trip') throw error;
        return true;
      } finally { await signInWithEmailAndPassword(auth, a.email, a.password); }
    });

    // CROSS-TENANT VICTIM UNCHANGED — B attempts the delete, A's trip must survive.
    await run('cross-tenant delete leaves the victim unchanged', async () => {
      const before = await backend.travel.getTripDetails(tripId as string);
      await signInWithEmailAndPassword(auth, b.email, b.password);
      try { await backend.travel.deleteTrip(b.uid, tripId as string); } catch { /* either is fine */ }
      await signInWithEmailAndPassword(auth, a.email, a.password);
      const after = await backend.travel.getTripDetails(tripId as string);
      if (!after) throw new Error('victim trip disappeared after a cross-tenant delete');
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('victim trip was modified');
      return true;
    });

    // DELETE — the application's intended lifecycle.
    await run('DELETE deleteTrip', () => backend.travel.deleteTrip(a.uid, tripId as string));
  }
} finally {
  persist();
  let sweep: Record<string, unknown> = {};
  try {
    const output = execFileSync(process.execPath,
      ['migration/firestore/tools/sweep-synthetic-tenants.mjs', `--manifest=${MANIFEST}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900_000 });
    sweep = JSON.parse(output.slice(output.indexOf('{')));
  } catch (error) {
    const output = String((error as { stdout?: string })?.stdout ?? '');
    try { sweep = JSON.parse(output.slice(output.indexOf('{'))); } catch { sweep = { residue: -1 }; }
  }
  await signOut(auth).catch(() => undefined);

  const failed = checks.filter((check) => !check.ok);
  const residue = Number(sweep.residue ?? -1);
  const report = {
    generatedAt: new Date().toISOString(), artifact: 'firestore-tourism-proof', runId,
    target: 'PRODUCTION', project: PROJECT, releasedVersion: '0.0.62',
    method: 'FirestoreTravelRepository via createFirestoreBackend, the same call useTripMutations makes',
    tripId,
    checks,
    totalChecks: checks.length,
    failedChecks: failed.length,
    classifications: failed.reduce((acc: Record<string, number>, check) => {
      acc[check.classification] = (acc[check.classification] ?? 0) + 1; return acc; }, {}),
    cleanup: sweep,
    syntheticResidue: residue,
    customerMutations: 0,
    decision: failed.length === 0 && residue === 0 ? 'TOURISM_PROOF_PASS' : 'TOURISM_PROOF_FAIL',
  };
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ decision: report.decision, totalChecks: report.totalChecks,
    failedChecks: report.failedChecks, classifications: report.classifications,
    syntheticResidue: residue, cleanup: sweep,
    failures: failed.map((f) => `${f.operation} [${f.classification}] ${f.detail ?? ''}`),
    report: REPORT }, null, 2));
}
