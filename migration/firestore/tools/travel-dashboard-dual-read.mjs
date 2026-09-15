#!/usr/bin/env node
/**
 * Travel dashboard dual read: for every owner whose home screen is the travel dashboard (tourism, auto_repair
 * and profiles without a business type), FirestoreTravelDashboardRepository must return exactly what the
 * production functions get_trip_years() and get_trip_dashboard_items(year) return to that owner.
 *
 * The oracle is the production function code itself, not a re-implementation: inside one REPEATABLE READ READ
 * ONLY snapshot (a write is proven to fail with 25006) the JWT claims are set to the owner, so auth.uid() inside
 * the SECURITY DEFINER functions resolves to that owner. Every year the functions report is compared, plus the
 * current year, which the dashboard always offers. get_owned_trip_payment_summary, with its plan selection,
 * installment schedule and Asia/Jerusalem business clock, is compared field by field for every trip.
 *
 * Corruption controls change one migrated trip, installment or deletion flag over the emulator's owner REST path
 * and require the comparison to report it; each document is restored exactly and the final comparison is clean.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs migration/firestore/tools/travel-dashboard-dual-read.mjs
 *
 * Writes migration/reports/travel-dashboard-dual-read.json with counts and hashed identifiers only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { RulesClient } from '../lib/rules-client.mjs';
import { FirebaseSession } from '../../../src/data/firestore/FirebaseSession.ts';
import { FirestoreTravelDashboardRepository } from '../../../src/data/firestore/FirestoreTravelDashboardRepository.ts';
import { timestampToMicros } from '../../../src/data/firestore/exactValues.ts';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FIRESTORE_HOST || !AUTH_HOST) throw new Error('EMULATOR_HOSTS_REQUIRED');
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(\+00:00|Z)$/;
const CURRENT_YEAR = String(new Date().getFullYear());

/** The list item the screens receive: fetchTripDashboardItems applies asTripListItem to every row. */
const asListItem = (value) => ({ ...value, travelers: [], itinerary: [], payments: [], attachments: [], notes: '' });
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  if (typeof value === 'string' && TIMESTAMP.test(value)) return `micros:${timestampToMicros(value)}`;
  return value;
};
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

function customToken(uid) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const issuer = 'firebase-auth-emulator@example.com';
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: issuer, sub: issuer, iat: now, exp: now + 3600, uid,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit' })}.`;
}
const authAdmin = (path, body) => fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body),
}).then((response) => response.json());

const createdAccounts = new Set();
const clients = [];
async function signedIn(uid) {
  const existing = await authAdmin('accounts:lookup', { localId: [uid] });
  if (!existing.users?.length) createdAccounts.add(uid);
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `travel-dashboard-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = FIRESTORE_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  await signInWithCustomToken(auth, customToken(uid));
  const client = { app, auth, db, session: new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false }) };
  clients.push(client);
  return client;
}

async function ownedDocuments(collection, uid) {
  const response = await fetch(`http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: uid } } }, limit: 2000 } }),
  });
  return (await response.json()).filter((row) => row.document).map((row) => row.document);
}

/** The first of these trips, read over the operator path, whose fields the predicate accepts. */
async function tripDocument(ids, accept) {
  for (const id of ids.slice(0, 25)) {
    const response = await bypass.get(`trips/${encodeURIComponent(id)}`);
    if (response.ok && accept(response.body?.fields ?? {})) return response.body;
  }
  return null;
}

/** A stored exact decimal moved by `delta` units, with every representation of it kept consistent. */
function shiftedDecimal(value, delta) {
  const fields = value.mapValue.fields;
  const scale = Number(fields.scale.integerValue);
  const unitsText = String(BigInt(fields.unitsText.stringValue) + delta);
  const digits = unitsText.replace('-', '').padStart(scale + 1, '0');
  const decimal = `${unitsText.startsWith('-') ? '-' : ''}${digits.slice(0, digits.length - scale)}${scale ? `.${digits.slice(-scale)}` : ''}`;
  return { mapValue: { fields: { ...fields, unitsText: { stringValue: unitsText }, decimal: { stringValue: decimal },
    ...(fields.units?.integerValue !== undefined ? { units: { integerValue: unitsText } } : {}) } } };
}

const snapshotEvidence = {};
const report = { generatedAt: new Date().toISOString(), surface: 'travel_dashboard', target: 'firestore-emulator', readOnlySource: snapshotEvidence,
  tenants: [], corruptionControls: [], decision: 'FAIL' };

try {
  const source = await withSourceSnapshot(localConfig(), async (select) => {
    const businesses = (await select(`SELECT id::text AS id, user_id::text AS user_id FROM public.business_profiles
      WHERE business_type IS NULL OR business_type::text IN ('tourism', 'auto_repair') ORDER BY id`)).rows;
    const tenants = [];
    for (const business of businesses) {
      await select(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: business.user_id, role: 'authenticated' })]);
      const years = (await select('SELECT year FROM public.get_trip_years()')).rows.map((row) => row.year);
      const dashboards = {};
      for (const year of [...new Set([...years, CURRENT_YEAR])]) {
        const { rows: [row] } = await select('SELECT public.get_trip_dashboard_items($1)::text AS items', [year]);
        dashboards[year] = JSON.parse(row.items).map(asListItem);
      }
      tenants.push({ businessId: business.id, uid: business.user_id, years, dashboards });
    }
    await select(`SELECT set_config('request.jwt.claims', '', true)`);
    return tenants;
  }, snapshotEvidence);

  const compareTenant = async (tenant, repo) => {
    const result = { years: { source: tenant.years.length, match: false }, dashboards: {}, tripsCompared: 0, mismatchedTrips: 0, missing: 0, unexpected: 0,
      orderMismatches: 0, tieOrderDifferences: 0 };
    // ORDER BY created_at DESC defines only the created_at order; trips created at the same instant have no defined order.
    const createdSequence = (items) => JSON.stringify(items.map((item) => (item.created_at === null ? 'NULL' : String(timestampToMicros(item.created_at)))));
    const years = await repo.listTripYears();
    result.years.match = JSON.stringify(years) === JSON.stringify(tenant.years);
    for (const [year, expected] of Object.entries(tenant.dashboards)) {
      const actual = await repo.listDashboardTrips(year);
      const byId = new Map(actual.map((item) => [item.id, item]));
      const expectedIds = new Set(expected.map((item) => item.id));
      let mismatched = 0;
      for (const item of expected) {
        const other = byId.get(item.id);
        if (!other) { result.missing += 1; continue; }
        result.tripsCompared += 1;
        if (!same(item, other)) {
          mismatched += 1;
          result.firstMismatch ??= { year, fields: Object.keys({ ...item, ...other }).filter((key) => !same(item[key], other[key])) };
        }
      }
      result.unexpected += actual.filter((item) => !expectedIds.has(item.id)).length;
      if (mismatched === 0 && JSON.stringify(expected.map((item) => item.id)) !== JSON.stringify(actual.map((item) => item.id))) {
        if (createdSequence(expected) !== createdSequence(actual)) result.orderMismatches += 1;
        else result.tieOrderDifferences += 1;
      }
      result.mismatchedTrips += mismatched;
      result.dashboards[year] = { source: expected.length, target: actual.length, mismatched };
    }
    result.clean = result.years.match && result.mismatchedTrips === 0 && result.missing === 0 && result.unexpected === 0 && result.orderMismatches === 0;
    return result;
  };

  for (const tenant of source) {
    const owner = await signedIn(tenant.uid);
    const repo = new FirestoreTravelDashboardRepository(owner.session);
    const entry = { businessHash: hash(tenant.businessId), ownerHash: hash(tenant.uid), ...(await compareTenant(tenant, repo)) };

    // Victims are documents the comparison reads: trips listed on a compared dashboard, and installments of the plans
    // those trips' summaries selected. Each damage is a valid but wrong value, so the comparison, not the decoder, must catch it.
    const comparedItems = Object.values(tenant.dashboards).flat();
    const comparedTrips = [...new Set(comparedItems.map((item) => item.id))];
    const selectedPlans = new Set(comparedItems.map((item) => item.payment_plan_summary?.plan_id).filter(Boolean));
    const installments = await ownedDocuments('tripInstallments', tenant.uid);
    const controls = [
      { name: 'trip sale price changed', victim: await tripDocument(comparedTrips, (fields) => Boolean(fields.salePrice?.mapValue)),
        mutate: (fields) => ({ ...fields, salePrice: shiftedDecimal(fields.salePrice, 100n) }) },
      { name: 'installment expected amount changed',
        victim: installments.find((document) => selectedPlans.has(document.fields?.paymentPlanId?.stringValue)
          && document.fields?.status?.stringValue !== 'cancelled'),
        mutate: (fields) => ({ ...fields, expectedAmountMinor: { integerValue: String(BigInt(fields.expectedAmountMinor.integerValue) + 1n) } }) },
      { name: 'live trip marked deleted', victim: await tripDocument(comparedTrips, () => true),
        mutate: (fields) => ({ ...fields, isDeleted: { booleanValue: true } }) },
    ];
    for (const control of controls) {
      if (!control.victim) {
        report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), status: 'NOT_APPLICABLE_NO_ROWS' });
        continue;
      }
      const path = control.victim.name.split('/documents/')[1];
      await bypass.request('PATCH', path, { fields: control.mutate(control.victim.fields) });
      let observed;
      try {
        observed = !(await compareTenant(tenant, repo)).clean;
      } catch (error) {
        observed = `ERROR:${error?.code ?? error?.message}`;
      } finally {
        await bypass.request('PATCH', path, { fields: control.victim.fields });
      }
      report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), observed,
        status: observed === true ? 'DETECTED' : 'NOT_DETECTED' });
    }
    entry.restoredClean = (await compareTenant(tenant, repo)).clean;
    report.tenants.push(entry);
  }

  const sum = (field) => report.tenants.reduce((total, tenant) => total + tenant[field], 0);
  report.totals = {
    tenants: report.tenants.length,
    yearsMatched: report.tenants.every((tenant) => tenant.years.match),
    tripsCompared: sum('tripsCompared'), mismatchedTrips: sum('mismatchedTrips'), missing: sum('missing'), unexpected: sum('unexpected'),
    orderMismatches: sum('orderMismatches'),
    controlsApplicable: report.corruptionControls.filter((control) => control.status !== 'NOT_APPLICABLE_NO_ROWS').length,
    controlsDetected: report.corruptionControls.filter((control) => control.status === 'DETECTED').length,
    restoredClean: report.tenants.every((tenant) => tenant.restoredClean),
  };
  const t = report.totals;
  report.decision = t.yearsMatched && t.mismatchedTrips === 0 && t.missing === 0 && t.unexpected === 0 && t.orderMismatches === 0
    && t.controlsDetected === t.controlsApplicable && t.restoredClean
    && snapshotEvidence.rejectedWriteSqlState === '25006' && snapshotEvidence.successfulWrites === 0 ? 'PASS' : 'FAIL';
} finally {
  for (const client of clients) {
    await signOut(client.auth).catch(() => undefined);
    await deleteApp(client.app).catch(() => undefined);
  }
  for (const uid of createdAccounts) await authAdmin('accounts:delete', { localId: uid }).catch(() => undefined);
  writeReport('migration/reports/travel-dashboard-dual-read.json', `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ decision: report.decision, totals: report.totals, tenants: report.tenants.map(({ years, dashboards, firstMismatch }) => ({ years, dashboards, firstMismatch })) }, null, 2));
if (report.decision !== 'PASS') process.exitCode = 1;
