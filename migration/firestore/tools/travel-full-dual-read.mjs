#!/usr/bin/env node
/**
 * Tourism reads dual read: for every owner whose screens show trips (tourism, auto_repair and profiles without a
 * business type), FirestoreTravelRepository, signed in as the migrated owner and running under the Rules, must return
 * exactly what the production functions and PostgREST queries return to that owner.
 *
 * The oracle is the production code itself: inside one REPEATABLE READ READ ONLY snapshot (a write is proven to fail
 * with 25006) the JWT claims are set to the owner, so auth.uid() inside get_trips_page, get_trip_details,
 * get_deleted_trips_page, get_trip_activity_page, get_trip_financial_audit_page, get_travel_analytics_summary,
 * get_travel_payment_analytics and get_travel_reports resolves to that owner. Only read-only functions are called.
 * Table reads (payment plans, installments, installment events, cleanup queue, notifications, templates, client lists,
 * export) are the PostgREST requests reproduced in SQL for the owner.
 *
 * Arrays the source orders completely (every get_trips_page sort ends in id DESC) are compared in order. Arrays whose
 * ORDER BY leaves ties undefined are compared as multisets plus the sequence of their order key. jsonb_agg arrays with
 * no ORDER BY are compared as multisets.
 *
 * Corruption controls change one migrated document over the emulator's owner REST path and require the comparison to
 * report it; each document is restored exactly and the final comparison must be clean.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs migration/firestore/tools/travel-full-dual-read.mjs
 *
 * Writes migration/reports/travel-full-dual-read.json with counts and hashed identifiers only.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { RulesClient } from '../lib/rules-client.mjs';
import { FirebaseSession } from '../../../src/data/firestore/FirebaseSession.ts';
import { FirestoreTravelRepository } from '../../../src/data/firestore/FirestoreTravelRepository.ts';
import { timestampToMicros } from '../../../src/data/firestore/exactValues.ts';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FIRESTORE_HOST || !AUTH_HOST) throw new Error('EMULATOR_HOSTS_REQUIRED');
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(\+00:00|Z)$/;
const CURRENT_YEAR = String(new Date().getFullYear());
const SORTS = ['updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'start_date_asc', 'start_date_desc', 'destination_asc',
  'destination_desc', 'client_name_asc', 'client_name_desc', 'sale_price_desc', 'sale_price_asc', 'profit_desc', 'profit_asc',
  'remaining_desc', 'remaining_asc', 'overdue_first'];
const WIDE = ['1970-01-01', '2999-12-31'];
/** --only=reports,analytics limits the comparison to those check kinds (diagnosis); a PASS still requires the full run. */
const ONLY = new Set((process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? '').split(',').filter(Boolean));
const want = (kind) => !ONLY.size || ONLY.has(kind);

const asListItem = (value) => ({ ...value, travelers: [], itinerary: [], payments: [], attachments: [], notes: '' });
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  if (typeof value === 'string' && TIMESTAMP.test(value)) return `micros:${timestampToMicros(value)}`;
  return value;
};
const text = (value) => JSON.stringify(normalize(value));
const multiset = (values) => JSON.stringify((values ?? []).map(text).sort());

/**
 * Compares two payloads. `ties` names array paths whose source order is defined only by `key`: those are compared as
 * multisets plus the key sequence. `sets` names array paths with no defined order at all.
 */
function samePayload(source, target, { ties = [], sets = [] } = {}) {
  const a = JSON.parse(JSON.stringify(source ?? null));
  const b = JSON.parse(JSON.stringify(target ?? null));
  const at = (object, path) => path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), object);
  const clear = (object, path) => {
    const parts = path.split('.');
    const parent = parts.slice(0, -1).reduce((node, part) => (node == null ? undefined : node[part]), object);
    if (parent && typeof parent === 'object') parent[parts[parts.length - 1]] = '<compared>';
  };
  const differing = [];
  for (const { path, key, id } of ties) {
    const x = at(a, path); const y = at(b, path);
    const sequence = (rows) => JSON.stringify((rows ?? []).map((row) => normalize(at(row, key) ?? null)));
    if (multiset(x) !== multiset(y) || sequence(x) !== sequence(y)) {
      if (id && Array.isArray(x) && Array.isArray(y)) {
        // Name what differs: matched rows by identity, then the differing properties, missing rows, length and order.
        const identity = (row) => JSON.stringify(id.map((part) => normalize(at(row, part) ?? null)));
        const byId = new Map(y.map((row) => [identity(row), row]));
        const found = new Set();
        for (const row of x) {
          const other = byId.get(identity(row));
          if (!other) { found.add('<missing>'); continue; }
          for (const field of Object.keys({ ...row, ...other })) if (text(row[field]) !== text(other[field])) found.add(field);
        }
        if (x.length !== y.length) found.add('<length>');
        if (sequence(x) !== sequence(y)) found.add('<order>');
        differing.push(`${path}[${[...found].join(',')}]`);
      } else {
        differing.push(path);
      }
    }
    clear(a, path); clear(b, path);
  }
  for (const path of sets) {
    if (multiset(at(a, path)) !== multiset(at(b, path))) differing.push(path);
    clear(a, path); clear(b, path);
  }
  if (text(a) !== text(b)) {
    const keys = a && typeof a === 'object' && !Array.isArray(a) ? Object.keys({ ...a, ...b }) : ['<value>'];
    differing.push(...keys.filter((key) => (key === '<value>' ? text(a) !== text(b) : text(a[key]) !== text(b?.[key]))));
  }
  return differing;
}

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

async function loadRules() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('migration/firestore/rules/firestore.rules', 'utf8') }] } }),
  });
  if (!response.ok) throw new Error(`RULES_LOAD_FAILED:${response.status}:${await response.text()}`);
}

const createdAccounts = new Set();
const clients = [];
async function signedIn(uid) {
  const existing = await authAdmin('accounts:lookup', { localId: [uid] });
  if (!existing.users?.length) createdAccounts.add(uid);
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `travel-full-${randomUUID()}`);
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
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: uid } } }, limit: 5000 } }),
  });
  return (await response.json()).filter((row) => row.document).map((row) => row.document);
}

function shiftedDecimal(value, delta) {
  const fields = value.mapValue.fields;
  const scale = Number(fields.scale.integerValue);
  const unitsText = String(BigInt(fields.unitsText.stringValue) + delta);
  const digits = unitsText.replace('-', '').padStart(scale + 1, '0');
  const decimal = `${unitsText.startsWith('-') ? '-' : ''}${digits.slice(0, digits.length - scale)}${scale ? `.${digits.slice(-scale)}` : ''}`;
  return { mapValue: { fields: { ...fields, unitsText: { stringValue: unitsText }, decimal: { stringValue: decimal },
    ...(fields.units?.integerValue !== undefined ? { units: { integerValue: unitsText } } : {}) } } };
}

const one = async (select, sql, params) => JSON.parse((await select(sql, params)).rows[0].payload ?? 'null');

/** The analytics argument sets compared per tenant: every year with trips, one month, one custom range and each filter. */
function analyticsArgs(tenant) {
  const base = { p_year: null, p_month: null, p_trip_status: null, p_payment_status: null, p_destination: null, p_start_date: null, p_end_date: null };
  const year = tenant.years[0] ?? CURRENT_YEAR;
  const sets = [base, ...tenant.years.map((y) => ({ ...base, p_year: y }))];
  sets.push({ ...base, p_year: year, p_month: tenant.busiestMonth ?? 1 });
  sets.push({ ...base, p_start_date: `${year}-01-01`, p_end_date: `${year}-06-30` });
  for (const status of ['active', 'archived', 'cancelled', 'completed']) sets.push({ ...base, p_year: year, p_trip_status: status });
  for (const status of ['paid', 'partial', 'unpaid']) sets.push({ ...base, p_year: year, p_payment_status: status });
  if (tenant.destination) sets.push({ ...base, p_year: year, p_destination: tenant.destination });
  return sets;
}

function pageInputs(tenant) {
  const inputs = [];
  for (const year of [...new Set([...tenant.years, CURRENT_YEAR])]) inputs.push({ year, page: 1, pageSize: 100, sortKey: 'updated_desc' });
  const year = tenant.years[0] ?? CURRENT_YEAR;
  for (const sortKey of SORTS) inputs.push({ year, page: 1, pageSize: 100, sortKey });
  inputs.push({ year, page: 2, pageSize: 5, sortKey: 'start_date_desc' });
  for (const paymentStatus of ['paid', 'partial', 'unpaid']) inputs.push({ year, page: 1, pageSize: 100, sortKey: 'updated_desc', paymentStatus });
  for (const tripStatus of ['archived', 'active', 'cancelled']) inputs.push({ year, page: 1, pageSize: 100, sortKey: 'updated_desc', tripStatus });
  if (tenant.busiestMonth) inputs.push({ year, page: 1, pageSize: 100, sortKey: 'updated_desc', month: String(tenant.busiestMonth) });
  if (tenant.destination) inputs.push({ year, page: 1, pageSize: 100, sortKey: 'updated_desc', destination: tenant.destination });
  for (const search of tenant.searches) inputs.push({ year, page: 1, pageSize: 100, sortKey: 'updated_desc', search });
  return inputs;
}

const reportInputs = (tenant) => [
  { startDate: WIDE[0], endDate: WIDE[1], includeArchived: false },
  { startDate: WIDE[0], endDate: WIDE[1], includeArchived: true },
  { startDate: `${tenant.years[0] ?? CURRENT_YEAR}-01-01`, endDate: `${tenant.years[0] ?? CURRENT_YEAR}-12-31`, includeArchived: false },
  ...(tenant.currency ? [{ startDate: WIDE[0], endDate: WIDE[1], currency: tenant.currency, includeArchived: true }] : []),
  ...(tenant.destination ? [{ startDate: WIDE[0], endDate: WIDE[1], destination: tenant.destination, includeArchived: true }] : []),
];

const snapshotEvidence = {};
const report = { generatedAt: new Date().toISOString(), surface: 'tourism_reads', target: 'firestore-emulator', readOnlySource: snapshotEvidence,
  tenants: [], corruptionControls: [], decision: 'FAIL' };

try {
  await loadRules();
  const source = await withSourceSnapshot(localConfig(), async (select) => {
    const businesses = (await select(`SELECT id::text AS id, user_id::text AS user_id FROM public.business_profiles
      WHERE business_type IS NULL OR business_type::text IN ('tourism', 'auto_repair') ORDER BY id`)).rows;
    const tenants = [];
    for (const business of businesses) {
      const uid = business.user_id;
      await select(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      const tenant = { businessId: business.id, uid, checks: {} };
      tenant.years = (await select('SELECT year FROM public.get_trip_years()')).rows.map((row) => row.year);
      const facts = (await select(`SELECT
          (SELECT extract(month FROM coalesce(payment_date, start_date))::int FROM public.trips WHERE user_id = $1 AND deleted_at IS NULL
            GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1) AS month,
          (SELECT destination FROM public.trips WHERE user_id = $1 AND deleted_at IS NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1) AS destination,
          (SELECT currency FROM public.trips WHERE user_id = $1 AND deleted_at IS NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1) AS currency,
          (SELECT client_name FROM public.trips WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id LIMIT 1) AS client`, [uid])).rows[0];
      tenant.busiestMonth = facts.month; tenant.destination = facts.destination; tenant.currency = facts.currency;
      tenant.searches = facts.client ? [String(facts.client).split(/\s+/)[0], `${String(facts.client).split(/\s+/)[0]} ${facts.destination ?? ''}`.trim(), 'no-such-trip-zz'] : ['no-such-trip-zz'];
      tenant.tripIds = (await select('SELECT id::text AS id FROM public.trips WHERE user_id = $1 ORDER BY id', [uid])).rows.map((row) => row.id);
      tenant.liveTripIds = (await select('SELECT id::text AS id FROM public.trips WHERE user_id = $1 AND deleted_at IS NULL ORDER BY id', [uid])).rows.map((row) => row.id);

      const pages = [];
      if (want('tripsPage')) for (const input of pageInputs(tenant)) {
        const payload = await one(select, `SELECT public.get_trips_page($1::text, $2::int, $3::int, $4::text, $5::text, $6::text, $7::int, $8::text, $9::text)::text AS payload`,
          [input.year, input.page, input.pageSize, input.search?.trim() || null, input.paymentStatus || null, input.tripStatus || null,
            input.month ? Number(input.month) : null, input.destination || null, input.sortKey]);
        pages.push({ input, payload: { ...payload, items: (payload.items ?? []).map(asListItem) } });
      }
      tenant.checks.pages = pages;
      tenant.checks.details = [];
      if (want('tripDetails')) for (const id of tenant.tripIds) tenant.checks.details.push({ id, payload: await one(select, 'SELECT public.get_trip_details($1::uuid)::text AS payload', [id]) });
      tenant.checks.trash = [];
      if (want('trash')) for (const search of ['', ...tenant.searches.slice(0, 1)]) {
        const payload = await one(select, 'SELECT public.get_deleted_trips_page(1, 100, $1::text)::text AS payload', [search.trim() || null]);
        tenant.checks.trash.push({ search, payload: { total_count: payload.total_count, items: (payload.items ?? []).map((item) => ({ ...asListItem(item), ...item })) } });
      }
      tenant.checks.activity = []; tenant.checks.audit = [];
      if (want('activity') || want('financialAudit')) for (const id of tenant.tripIds) {
        const activityCount = Number((await select('SELECT count(*)::int AS n FROM public.trip_activity_log WHERE trip_id = $1 AND user_id = $2', [id, uid])).rows[0].n);
        for (let page = 1; page <= Math.max(1, Math.ceil(activityCount / 20)); page += 1) {
          tenant.checks.activity.push({ id, page, payload: await one(select, 'SELECT public.get_trip_activity_page($1::uuid, $2::int, 20, NULL)::text AS payload', [id, page]) });
        }
        const auditCount = Number((await select('SELECT count(*)::int AS n FROM public.trip_financial_audit WHERE trip_id = $1 AND user_id = $2', [id, uid])).rows[0].n);
        for (let page = 1; page <= Math.max(1, Math.ceil(auditCount / 20)); page += 1) {
          tenant.checks.audit.push({ id, page, payload: await one(select, 'SELECT public.get_trip_financial_audit_page($1::uuid, $2::int, 20)::text AS payload', [id, page]) });
        }
      }
      tenant.checks.plans = [];
      if (want('paymentPlan')) for (const id of tenant.tripIds) {
        const plans = JSON.parse((await select(`SELECT coalesce(json_agg(p), '[]'::json)::text AS payload FROM public.trip_payment_plans p
          WHERE p.trip_id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL AND p.status <> 'cancelled'`, [id, uid])).rows[0].payload);
        const installments = plans.length === 1 ? JSON.parse((await select(`SELECT coalesce(json_agg(i ORDER BY i.installment_number), '[]'::json)::text AS payload
          FROM public.trip_installments i WHERE i.payment_plan_id = $1 AND i.user_id = $2`, [plans[0].id, uid])).rows[0].payload) : [];
        tenant.checks.plans.push({ id, payload: plans.length > 1 ? { error: 'PGRST116' } : { plan: plans[0] ?? null, installments } });
      }
      const installmentIds = (await select('SELECT id::text AS id FROM public.trip_installments WHERE user_id = $1 ORDER BY id', [uid])).rows.map((row) => row.id);
      tenant.checks.installmentEvents = [];
      if (want('installmentEvents')) for (const id of installmentIds) {
        tenant.checks.installmentEvents.push({ id, payload: JSON.parse((await select(`SELECT coalesce(json_agg(e ORDER BY e.created_at DESC, e.id DESC), '[]'::json)::text AS payload
          FROM public.trip_installment_events e WHERE e.installment_id = $1 AND e.user_id = $2`, [id, uid])).rows[0].payload) });
      }
      tenant.checks.failedCleanup = JSON.parse((await select(`SELECT coalesce(json_agg(j ORDER BY j.created_at DESC, j.id DESC), '[]'::json)::text AS payload FROM (
        SELECT id, trip_id, status, attempts, last_error, next_retry_at, created_at FROM public.trip_attachment_cleanup_queue
        WHERE user_id = $1 AND status = 'failed' ORDER BY created_at DESC, id DESC LIMIT 20) j`, [uid])).rows[0].payload);
      tenant.checks.notifications = JSON.parse((await select(`SELECT coalesce(json_agg(n ORDER BY n.created_at DESC, n.id DESC), '[]'::json)::text AS payload FROM (
        SELECT id, trip_id, notification_type, title_key, body_key, params, read_at, snoozed_until, dismissed_at, completed_at, scheduled_for, created_at
        FROM public.trip_notifications WHERE user_id = $1 AND dismissed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 100) n`, [uid])).rows[0].payload);
      tenant.checks.templates = [];
      for (const includeArchived of [false, true]) {
        tenant.checks.templates.push({ includeArchived, payload: JSON.parse((await select(`SELECT coalesce(json_agg(t ORDER BY t.updated_at DESC, t.id DESC), '[]'::json)::text AS payload
          FROM public.trip_templates t WHERE t.user_id = $1 AND t.deleted_at IS NULL AND ($2::boolean OR t.status = 'active')`, [uid, includeArchived])).rows[0].payload) });
      }
      tenant.checks.search = JSON.parse((await select(`SELECT coalesce(json_agg(t ORDER BY t.start_date DESC, t.id DESC), '[]'::json)::text AS payload
        FROM public.trips t WHERE t.user_id = $1`, [uid])).rows[0].payload);
      tenant.checks.clients = JSON.parse((await select(`SELECT coalesce(json_agg(json_build_object('client_name', client_name, 'client_phone', client_phone)
        ORDER BY created_at DESC NULLS FIRST, id DESC), '[]'::json)::text AS payload FROM (SELECT * FROM public.trips WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC NULLS FIRST, id DESC LIMIT 1000) t`, [uid])).rows[0].payload);
      tenant.checks.analytics = [];
      if (want('analytics')) for (const args of analyticsArgs(tenant)) {
        const params = [args.p_year, args.p_month, args.p_trip_status, args.p_payment_status, args.p_destination, args.p_start_date, args.p_end_date];
        tenant.checks.analytics.push({ args,
          summary: await one(select, 'SELECT public.get_travel_analytics_summary($1::text, $2::int, $3::text, $4::text, $5::text, $6::date, $7::date)::text AS payload', params),
          payment: await one(select, 'SELECT public.get_travel_payment_analytics($1::text, $2::int, $3::text, $4::text, $5::text, $6::date, $7::date)::text AS payload', params) });
      }
      tenant.checks.reports = [];
      if (want('reports')) for (const input of reportInputs(tenant)) {
        tenant.checks.reports.push({ input, payload: await one(select, 'SELECT public.get_travel_reports($1::date, $2::date, $3::text, $4::text, $5::boolean)::text AS payload',
          [input.startDate, input.endDate, input.currency || null, input.destination || null, input.includeArchived || false]) });
      }
      tenants.push(tenant);
    }
    await select(`SELECT set_config('request.jwt.claims', '', true)`);
    return tenants;
  }, snapshotEvidence);

  const ANALYTICS_TIES = [
    { path: 'financial.destination_sales', key: 'revenue', id: ['name'] }, { path: 'destination_stats', key: 'revenue', id: ['name'] },
    { path: 'travel.destination_volume', key: 'passengers', id: ['name'] }, { path: 'travel.attention_items', key: 'trip.start_date', id: ['trip.id'] },
    { path: 'attention_items', key: 'trip.start_date', id: ['trip.id'] },
  ];
  const REPORT_TIES = [{ path: 'destinations', key: 'profit', id: ['destination', 'currency'] },
    { path: 'repeat_clients', key: 'trip_count', id: ['client_key', 'currency'] }, { path: 'unpaid', key: 'start_date', id: ['id'] }];

  const compareTenant = async (tenant, repo) => {
    const result = { checks: 0, mismatches: 0, byKind: {}, firstMismatches: [] };
    const record = async (kind, label, run) => {
      if (ONLY.size && !ONLY.has(kind)) return;
      result.checks += 1;
      result.byKind[kind] = result.byKind[kind] ?? { checks: 0, mismatches: 0 };
      result.byKind[kind].checks += 1;
      let differing;
      try { differing = await run(); } catch (error) { differing = [`ERROR:${error?.code ?? ''}:${String(error?.message ?? error).slice(0, 120)}`]; }
      if (differing.length) {
        result.mismatches += 1;
        result.byKind[kind].mismatches += 1;
        if (result.firstMismatches.length < 8) result.firstMismatches.push({ kind, label, differing: differing.slice(0, 8) });
      }
    };
    for (const { input, payload } of tenant.checks.pages) {
      await record('tripsPage', `${input.sortKey}:${input.paymentStatus ?? ''}:${input.tripStatus ?? ''}:${input.month ?? ''}:${input.search ? 'search' : ''}:${input.page}`,
        async () => samePayload(payload, await repo.getTripsPage(input), { sets: ['summary'] }));
    }
    for (const { id, payload } of tenant.checks.details) await record('tripDetails', hash(id), async () => samePayload(payload, await repo.getTripDetails(id)));
    for (const { search, payload } of tenant.checks.trash) await record('trash', search ? 'search' : 'all', async () => samePayload(payload, await repo.getDeletedTripsPage(1, search, 100)));
    for (const { id, page, payload } of tenant.checks.activity) await record('activity', `${hash(id)}:${page}`, async () => samePayload(payload, await repo.getTripActivityPage(id, page)));
    for (const { id, page, payload } of tenant.checks.audit) await record('financialAudit', `${hash(id)}:${page}`, async () => samePayload(payload, await repo.getTripFinancialAuditPage(id, page)));
    for (const { id, payload } of tenant.checks.plans) {
      await record('paymentPlan', hash(id), async () => {
        if (payload.error) { try { await repo.getTripPaymentPlan(id); return ['expected PGRST116']; } catch (error) { return error?.code === 'PGRST116' ? [] : [String(error?.code)]; } }
        return samePayload(payload, await repo.getTripPaymentPlan(id));
      });
    }
    for (const { id, payload } of tenant.checks.installmentEvents) await record('installmentEvents', hash(id), async () => samePayload(payload, await repo.listInstallmentEvents(id)));
    await record('failedCleanupJobs', 'all', async () => samePayload(tenant.checks.failedCleanup, await repo.listFailedCleanupJobs()));
    await record('notifications', 'all', async () => samePayload(tenant.checks.notifications, await repo.listTripNotifications()));
    for (const { includeArchived, payload } of tenant.checks.templates) {
      await record('templates', String(includeArchived), async () => samePayload(payload, await repo.listTripTemplates('', undefined, includeArchived)));
    }
    await record('searchTrips', 'all', async () => samePayload(tenant.checks.search, await repo.searchTrips(tenant.uid)));
    await record('clientRows', 'all', async () => samePayload(tenant.checks.clients, await repo.listClientRows(tenant.uid)));
    await record('exportTrips', 'all', async () => {
      const exported = await repo.exportTrips(tenant.uid);
      return multiset(exported) === multiset(tenant.checks.search) ? [] : ['rows'];
    });
    for (const { args, summary, payment } of tenant.checks.analytics) {
      const label = JSON.stringify(Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null)));
      await record('analytics', label, async () => {
        const actual = await repo.getTravelAnalytics(args);
        return [...samePayload(summary, actual.summary, { ties: ANALYTICS_TIES }).map((key) => `summary.${key}`),
          ...samePayload(payment, actual.payment).map((key) => `payment.${key}`)];
      });
    }
    for (const { input, payload } of tenant.checks.reports) {
      await record('reports', JSON.stringify(input), async () => samePayload(payload, await repo.getTravelReports(input), { ties: REPORT_TIES }));
    }
    result.clean = result.mismatches === 0;
    return result;
  };

  for (const tenant of source) {
    const owner = await signedIn(tenant.uid);
    const repo = new FirestoreTravelRepository(owner.session);
    const entry = { businessHash: hash(tenant.businessId), ownerHash: hash(tenant.uid), trips: tenant.tripIds.length, ...(await compareTenant(tenant, repo)) };

    const trips = await ownedDocuments('trips', tenant.uid);
    const liveTrip = trips.find((document) => document.fields?.isDeleted?.booleanValue === false && document.fields?.salePrice?.mapValue);
    const deletedTrip = trips.find((document) => document.fields?.isDeleted?.booleanValue === true);
    const installments = await ownedDocuments('tripInstallments', tenant.uid);
    const activity = await ownedDocuments('tripActivityLog', tenant.uid);
    const audit = await ownedDocuments('tripFinancialAudit', tenant.uid);
    const controls = [
      { name: 'trip sale price changed', victim: liveTrip, mutate: (fields) => ({ ...fields, salePrice: shiftedDecimal(fields.salePrice, 100n) }) },
      { name: 'trip moved to another owner', victim: liveTrip, mutate: (fields) => ({ ...fields, userId: { stringValue: 'corruption-control-owner' } }) },
      { name: 'installment expected amount changed', victim: installments.find((document) => document.fields?.status?.stringValue !== 'cancelled'),
        mutate: (fields) => ({ ...fields, expectedAmountMinor: { integerValue: String(BigInt(fields.expectedAmountMinor.integerValue) + 1n) } }) },
      { name: 'deleted trip shown as live', victim: deletedTrip, mutate: (fields) => ({ ...fields, isDeleted: { booleanValue: false } }) },
      { name: 'activity entry retyped', victim: activity[0], mutate: (fields) => ({ ...fields, activityType: { stringValue: 'corruption_control' } }) },
      { name: 'financial audit field renamed', victim: audit[0], mutate: (fields) => ({ ...fields, changedField: { stringValue: 'corruption_control' } }) },
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
      report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), observed, status: observed === true ? 'DETECTED' : 'NOT_DETECTED' });
    }
    entry.restoredClean = (await compareTenant(tenant, repo)).clean;
    report.tenants.push(entry);
  }

  const sum = (field) => report.tenants.reduce((total, tenant) => total + tenant[field], 0);
  report.totals = {
    tenants: report.tenants.length, trips: sum('trips'), checks: sum('checks'), mismatches: sum('mismatches'),
    controlsApplicable: report.corruptionControls.filter((control) => control.status !== 'NOT_APPLICABLE_NO_ROWS').length,
    controlsDetected: report.corruptionControls.filter((control) => control.status === 'DETECTED').length,
    restoredClean: report.tenants.every((tenant) => tenant.restoredClean),
  };
  const t = report.totals;
  report.decision = t.mismatches === 0 && t.controlsDetected === t.controlsApplicable && t.restoredClean
    && snapshotEvidence.rejectedWriteSqlState === '25006' && snapshotEvidence.successfulWrites === 0 ? 'PASS' : 'FAIL';
} finally {
  for (const client of clients) {
    await signOut(client.auth).catch(() => undefined);
    await deleteApp(client.app).catch(() => undefined);
  }
  for (const uid of createdAccounts) await authAdmin('accounts:delete', { localId: uid }).catch(() => undefined);
  writeReport('migration/reports/travel-full-dual-read.json', `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ decision: report.decision, totals: report.totals,
  tenants: report.tenants.map(({ checks, mismatches, byKind, firstMismatches }) => ({ checks, mismatches, byKind, firstMismatches })) }, null, 2));
if (report.decision !== 'PASS') process.exitCode = 1;
