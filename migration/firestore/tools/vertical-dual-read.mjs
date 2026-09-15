#!/usr/bin/env node
/**
 * Vertical dual read: for every tenant of a vertical, the application's Firestore repositories, signed in
 * as the migrated owner and running under the Rules, must return exactly what the source returns.
 *
 *   Source  the production database through one REPEATABLE READ READ ONLY snapshot (a write is proven to
 *           fail with 25006). Each repository method's PostgREST request is reproduced in SQL with json_agg,
 *           which renders rows the way PostgREST does: UTC timestamps, NUMERIC as JSON numbers, embedded
 *           resources as nested JSON.
 *   Target  the Firestore emulator after full-migration-rehearsal.mjs, read through the repository classes
 *           the UI uses. The owner signs in with an emulator custom token for the migrated uid.
 *
 * Beyond the repository methods, every migrated document of the vertical's collections under the tenant is
 * inventoried against the source (missing, unexpected, orphaned tenancy), another tenant must be refused
 * each collection, and corruption controls damage one migrated document at a time over the emulator's
 * owner REST path and require the comparison to report it. Each damaged document is restored exactly, and
 * the final comparison must be clean again.
 *
 * The SQL oracle runs with the snapshot role and so ignores RLS: it states what the query means for the
 * owner. Where a source policy hid rows from their own owner by mistake, the vertical document says so.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs migration/firestore/tools/vertical-dual-read.mjs --vertical=supermarket
 *
 * Writes migration/reports/vertical-dual-read-<vertical>.json with counts and hashed identifiers only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, getDocs, getFirestore } from 'firebase/firestore';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { RulesClient } from '../lib/rules-client.mjs';
import { FirebaseSession } from '../../../src/data/firestore/FirebaseSession.ts';
import { FirestoreSupermarketRepository } from '../../../src/data/firestore/FirestoreSupermarketRepository.ts';
import { SOURCE_SCHEMA } from '../../../src/data/firestore/sourceSchema.generated.ts';
import { encodeInsert } from '../../../src/data/firestore/documentCodec.ts';
import { timestampToMicros } from '../../../src/data/firestore/exactValues.ts';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FIRESTORE_HOST || !AUTH_HOST) throw new Error('EMULATOR_HOSTS_REQUIRED');
const vertical = process.argv.find((arg) => arg.startsWith('--vertical='))?.slice('--vertical='.length);
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const RANGE = ['1970-01-01T00:00:00.000Z', '2999-12-31T23:59:59.999Z'];
const agg = (inner) => `SELECT coalesce(json_agg(t), '[]'::json)::text AS rows FROM (${inner}) t`;
const zero = (scale = 0) => ({ mapValue: { fields: { unitsText: { stringValue: '0' }, units: { integerValue: '0' }, scale: { integerValue: String(scale) }, decimal: { stringValue: '0' } } } });

function decimalValue(unitsText, scale) {
  const digits = unitsText.replace('-', '').padStart(scale + 1, '0');
  const decimal = `${unitsText.startsWith('-') ? '-' : ''}${digits.slice(0, digits.length - scale)}${scale ? `.${digits.slice(-scale)}` : ''}`;
  return { mapValue: { fields: { unitsText: { stringValue: unitsText }, units: { integerValue: unitsText }, scale: { integerValue: String(scale) }, decimal: { stringValue: decimal } } } };
}
const differentDecimal = (value, scale) => decimalValue(value?.mapValue?.fields?.unitsText?.stringValue === '987654' ? '123456' : '987654', scale);

/**
 * Per vertical: how tenants are found, which repository methods the UI calls with the SQL PostgREST runs for
 * them, which source rows belong to the tenant per collection, and the corruption controls.
 *
 * Tenancy of a collection: `legacyBusinessUserId` holds the owner uid where the source business_id references
 * auth.users, `sourceBusinessId` holds the business id where it references business_profiles, and child tables
 * without business_id carry only the path tenancy.
 */
const SPECS = {
  supermarket: {
    businessType: 'supermarket',
    repository: (session) => new FirestoreSupermarketRepository(session),
    methods: [
      { name: 'listAvailableProducts', table: 'restaurant_menu_items', order: null,
        sql: agg('SELECT * FROM public.restaurant_menu_items WHERE business_id = $1 AND is_available = true LIMIT 1000'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listAvailableProducts(tenant.uid) },
      { name: 'listCategories', table: 'restaurant_menu_categories', order: 'sort_order',
        sql: agg('SELECT * FROM public.restaurant_menu_categories WHERE business_id = $1 ORDER BY sort_order ASC LIMIT 1000'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listCategories(tenant.uid) },
      { name: 'listSales', table: 'market_transactions', order: 'created_at',
        sql: agg('SELECT * FROM public.market_transactions WHERE business_id = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC LIMIT 1000'),
        params: (tenant) => [tenant.uid, ...RANGE], call: (repo, tenant) => repo.listSales(tenant.uid, ...RANGE) },
    ],
    inventory: [
      { collection: 'menuCategories', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: false },
        sql: 'SELECT id::text AS id FROM public.restaurant_menu_categories WHERE business_id = $1', params: (tenant) => [tenant.uid] },
      { collection: 'menuItems', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: true },
        sql: `SELECT id::text AS id FROM public.restaurant_menu_items WHERE business_id = $1
          OR category_id IN (SELECT id FROM public.restaurant_menu_categories WHERE business_id = $1)`, params: (tenant) => [tenant.uid] },
      { collection: 'marketTransactions', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: false },
        sql: 'SELECT id::text AS id FROM public.market_transactions WHERE business_id = $1', params: (tenant) => [tenant.uid] },
    ],
    controls: [
      { name: 'sale amount changed', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, totalAmount: differentDecimal(fields.totalAmount, 2) }) },
      { name: 'sale deleted', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'missing', kind: 'delete' },
      { name: 'sale duplicated under a new id', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'unexpected', kind: 'copy' },
      { name: 'sale moved to another owner', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'missing', kind: 'patch',
        mutate: (fields) => ({ ...fields, legacyBusinessUserId: { stringValue: 'corruption-control-owner' } }) },
      { name: 'category that the source does not have', collection: 'menuCategories', check: { method: 'listCategories' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'restaurant_menu_categories', row: { business_id: tenant.uid, name: 'Corruption control', sort_order: 99 } }) },
      { name: 'available product that the source does not have', collection: 'menuItems', check: { method: 'listAvailableProducts' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'restaurant_menu_items', row: { business_id: tenant.uid, name: 'Corruption control', price: 1, is_available: true } }) },
    ],
  },
};

const spec = SPECS[vertical];
if (!spec) throw new Error(`UNKNOWN_VERTICAL:${vertical}`);

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
async function signedIn(uid, label) {
  const existing = await authAdmin('accounts:lookup', { localId: [uid] });
  if (!existing.users?.length) createdAccounts.add(uid);
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `dual-read-${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = FIRESTORE_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  await signInWithCustomToken(auth, customToken(uid));
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
  const client = { app, auth, db, session };
  clients.push(client);
  return client;
}

/** A value per column in the form both sides agree on: instants as microseconds, NUMERIC as the JS number PostgREST yields. */
function comparable(table, row) {
  if (row === null || row === undefined) return null;
  const out = {};
  for (const column of SOURCE_SCHEMA[table].columns) {
    const value = row[column.name];
    if (value === null || value === undefined) out[column.name] = null;
    else if (column.kind === 'timestamp') out[column.name] = String(timestampToMicros(String(value)));
    else if (column.kind === 'decimal') out[column.name] = Number(value);
    else out[column.name] = value;
  }
  return out;
}
const stable = (value) => JSON.stringify(value, (_, node) => (node && typeof node === 'object' && !Array.isArray(node)
  ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, node[key]])) : node));
const keyOf = (table, row) => SOURCE_SCHEMA[table].primaryKey.map((key) => String(row[key])).join('|');
const embeddedSet = (table, rows) => stable((rows ?? []).map((row) => comparable(table, row)).sort((a, b) => keyOf(table, a).localeCompare(keyOf(table, b))));

function compare(method, sourceRows, targetRows) {
  const table = method.table;
  const known = new Set([...SOURCE_SCHEMA[table].columns.map((column) => column.name), ...Object.keys(method.embeds ?? {})]);
  const unknownColumns = new Set(sourceRows.flatMap((row) => Object.keys(row).filter((key) => !known.has(key))));
  const source = new Map(sourceRows.map((row) => [keyOf(table, row), row]));
  const target = new Map(targetRows.map((row) => [keyOf(table, row), row]));
  const result = { sourceRows: source.size, targetRows: target.size, matched: 0, missing: 0, unexpected: 0, fieldMismatches: 0,
    orderMismatches: 0, mismatchedColumns: {}, unknownColumns: [...unknownColumns].sort() };
  for (const [key, row] of source) {
    const other = target.get(key);
    if (!other) { result.missing += 1; continue; }
    const a = comparable(table, row);
    const b = comparable(table, other);
    const differing = Object.keys(a).filter((column) => stable(a[column]) !== stable(b[column]));
    for (const [name, embed] of Object.entries(method.embeds ?? {})) {
      const same = embed.many ? embeddedSet(embed.table, row[name]) === embeddedSet(embed.table, other[name])
        : stable(comparable(embed.table, row[name])) === stable(comparable(embed.table, other[name]));
      if (!same) differing.push(name);
    }
    if (differing.length) {
      result.fieldMismatches += 1;
      for (const column of differing) result.mismatchedColumns[column] = (result.mismatchedColumns[column] ?? 0) + 1;
    } else {
      result.matched += 1;
    }
  }
  for (const key of target.keys()) if (!source.has(key)) result.unexpected += 1;
  if (method.order && result.missing === 0 && result.unexpected === 0) {
    const sequence = (rows) => rows.map((row) => (method.order === 'created_at'
      ? String(timestampToMicros(String(row.created_at))) : String(row[method.order] ?? 'NULL')));
    if (stable(sequence(sourceRows)) !== stable(sequence(targetRows))) result.orderMismatches += 1;
  }
  return result;
}

async function listDocuments(path) {
  const documents = [];
  let pageToken = '';
  do {
    const response = await fetch(`http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { headers: { Authorization: 'Bearer owner' } });
    const body = await response.json();
    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return documents;
}

const restCodec = {
  timestamp: (seconds, nanoseconds) => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)),
  serverTimestamp: () => new Date(),
  deleteField: () => { throw new Error('DELETE_FIELD_NOT_SUPPORTED_OVER_REST'); },
  newId: () => randomUUID(),
};

const snapshotEvidence = {};
const report = { generatedAt: new Date().toISOString(), vertical, target: 'firestore-emulator', readOnlySource: snapshotEvidence,
  tenants: [], corruptionControls: [], decision: 'FAIL' };

const docId = (document) => decodeURIComponent(document.name.split('/').pop());

async function inventoryOf(tenant, item) {
  const documents = await listDocuments(`businesses/${encodeURIComponent(tenant.businessId)}/${item.collection}`);
  const ids = documents.map(docId);
  const expected = new Set(tenant.inventory[item.collection]);
  const orphans = documents.filter((document) => {
    const fields = document.fields ?? {};
    if (fields.businessId?.stringValue !== tenant.businessId) return true;
    if (fields.ownerUid?.stringValue !== tenant.uid) return true;
    if (!item.tenancy) return false;
    const value = fields[item.tenancy.field]?.stringValue ?? null;
    return value === null ? !item.tenancy.nullable : value !== tenant[item.tenancy.of];
  }).length;
  return { sourceRows: expected.size, targetDocuments: ids.length, missing: [...expected].filter((id) => !ids.includes(id)).length,
    unexpected: ids.filter((id) => !expected.has(id)).length, orphans };
}

try {
  const source = await withSourceSnapshot(localConfig(), async (select) => {
    const businesses = (await select(`SELECT id::text AS id, user_id::text AS user_id FROM public.business_profiles
      WHERE business_type = $1 ORDER BY id`, [spec.businessType])).rows;
    const other = (await select(`SELECT id::text AS id, user_id::text AS user_id FROM public.business_profiles
      WHERE business_type IS DISTINCT FROM $1 ORDER BY id LIMIT 1`, [spec.businessType])).rows[0] ?? null;
    const tenants = [];
    for (const business of businesses) {
      const tenant = { businessId: business.id, uid: business.user_id, methods: {}, inventory: {} };
      for (const method of spec.methods) {
        tenant.methods[method.name] = JSON.parse((await select(method.sql, method.params(tenant))).rows[0].rows);
      }
      for (const item of spec.inventory) {
        tenant.inventory[item.collection] = (await select(item.sql, item.params(tenant))).rows.map((row) => (item.idOf ? item.idOf(row) : row.id)).sort();
      }
      tenants.push(tenant);
    }
    return { tenants, other };
  }, snapshotEvidence);

  const compareTenant = async (tenant, repo, only) => {
    const results = {};
    for (const method of spec.methods) {
      if (only && method.name !== only) continue;
      results[method.name] = compare(method, tenant.methods[method.name], await method.call(repo, tenant));
    }
    return results;
  };
  const clean = (results) => Object.values(results).every((r) => r.missing === 0 && r.unexpected === 0
    && r.fieldMismatches === 0 && r.orderMismatches === 0 && r.unknownColumns.length === 0);
  const inventoryClean = (results) => Object.values(results).every((r) => r.missing === 0 && r.unexpected === 0 && r.orphans === 0);

  const intruder = source.other ? await signedIn(source.other.user_id, 'other-tenant') : null;
  for (const tenant of source.tenants) {
    const owner = await signedIn(tenant.uid, 'owner');
    const repo = spec.repository(owner.session);
    const entry = { businessHash: hash(tenant.businessId), ownerHash: hash(tenant.uid), methods: await compareTenant(tenant, repo), inventory: {},
      crossTenant: { attempts: 0, denied: 0 } };
    for (const item of spec.inventory) entry.inventory[item.collection] = await inventoryOf(tenant, item);

    if (intruder) {
      for (const item of spec.inventory.filter((candidate) => !candidate.derived)) {
        entry.crossTenant.attempts += 1;
        try {
          await getDocs(collection(intruder.db, 'businesses', tenant.businessId, item.collection));
        } catch (error) {
          if (error?.code === 'permission-denied') entry.crossTenant.denied += 1; else throw error;
        }
      }
    }

    for (const control of spec.controls) {
      const base = `businesses/${encodeURIComponent(tenant.businessId)}/${control.collection}`;
      const existing = (await listDocuments(base)).filter((document) => tenant.inventory[control.collection].includes(docId(document)));
      if (control.kind !== 'synthetic' && existing.length === 0) {
        report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), status: 'NOT_APPLICABLE_NO_ROWS' });
        continue;
      }
      const victim = existing[0];
      const victimPath = victim ? victim.name.split('/documents/')[1] : null;
      let cleanup;
      if (control.kind === 'patch') {
        await bypass.request('PATCH', victimPath, { fields: control.mutate(victim.fields) });
        cleanup = () => bypass.request('PATCH', victimPath, { fields: victim.fields });
      } else if (control.kind === 'delete') {
        await bypass.delete(victimPath);
        cleanup = () => bypass.request('PATCH', victimPath, { fields: victim.fields });
      } else if (control.kind === 'copy') {
        const id = randomUUID();
        await bypass.request('PATCH', `${base}/${id}`, { fields: { ...victim.fields, id: { stringValue: id } } });
        cleanup = () => bypass.delete(`${base}/${id}`);
      } else {
        const { table, row } = control.build(tenant);
        const encoded = encodeInsert(table, row, restCodec, { ownerUid: tenant.uid, businessId: tenant.businessId });
        await bypass.set(`${base}/${encoded.id}`, encoded.data);
        cleanup = () => bypass.delete(`${base}/${encoded.id}`);
      }
      let observed;
      try {
        if (control.check.method) {
          const result = (await compareTenant(tenant, repo, control.check.method))[control.check.method];
          observed = [control.metric, ...(control.alsoMetrics ?? [])].reduce((sum, metric) => sum + result[metric], 0);
        } else {
          const item = spec.inventory.find((candidate) => candidate.collection === control.check.inventory);
          const result = await inventoryOf(tenant, item);
          observed = result[control.metric];
        }
      } catch (error) {
        observed = `ERROR:${error?.code ?? error?.message}`;
      } finally {
        await cleanup();
      }
      report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), metric: control.metric,
        observed, status: typeof observed === 'number' && observed > 0 ? 'DETECTED' : 'NOT_DETECTED' });
    }

    const finalInventory = {};
    for (const item of spec.inventory) finalInventory[item.collection] = await inventoryOf(tenant, item);
    entry.restoredClean = clean(await compareTenant(tenant, repo)) && inventoryClean(finalInventory);
    entry.clean = clean(entry.methods);
    report.tenants.push(entry);
  }

  const sum = (pick) => report.tenants.reduce((total, tenant) => total + pick(tenant), 0);
  const methodSum = (field) => sum((tenant) => Object.values(tenant.methods).reduce((total, r) => total + r[field], 0));
  const inventorySum = (field) => sum((tenant) => Object.values(tenant.inventory).reduce((total, r) => total + r[field], 0));
  report.totals = {
    tenants: report.tenants.length,
    sourceRowsCompared: methodSum('sourceRows'),
    matched: methodSum('matched'),
    missing: methodSum('missing') + inventorySum('missing'),
    unexpected: methodSum('unexpected') + inventorySum('unexpected'),
    fieldMismatches: methodSum('fieldMismatches'),
    orderMismatches: methodSum('orderMismatches'),
    unknownColumns: sum((tenant) => Object.values(tenant.methods).reduce((total, r) => total + r.unknownColumns.length, 0)),
    orphans: inventorySum('orphans'),
    sourceRowsInventoried: inventorySum('sourceRows'),
    migratedDocuments: inventorySum('targetDocuments'),
    crossTenantAttempts: sum((tenant) => tenant.crossTenant.attempts),
    crossTenantAllowed: sum((tenant) => tenant.crossTenant.attempts - tenant.crossTenant.denied),
    controlsApplicable: report.corruptionControls.filter((control) => control.status !== 'NOT_APPLICABLE_NO_ROWS').length,
    controlsDetected: report.corruptionControls.filter((control) => control.status === 'DETECTED').length,
    restoredClean: report.tenants.every((tenant) => tenant.restoredClean),
  };
  const t = report.totals;
  report.decision = t.missing === 0 && t.unexpected === 0 && t.fieldMismatches === 0 && t.orderMismatches === 0
    && t.unknownColumns === 0 && t.orphans === 0 && t.crossTenantAllowed === 0 && t.controlsDetected === t.controlsApplicable
    && t.restoredClean && snapshotEvidence.rejectedWriteSqlState === '25006' && snapshotEvidence.successfulWrites === 0
    && (t.tenants === 0 || t.crossTenantAttempts > 0) ? 'PASS' : 'FAIL';
} finally {
  for (const client of clients) {
    await signOut(client.auth).catch(() => undefined);
    await deleteApp(client.app).catch(() => undefined);
  }
  for (const uid of createdAccounts) await authAdmin('accounts:delete', { localId: uid }).catch(() => undefined);
  writeReport(`migration/reports/vertical-dual-read-${vertical}.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ vertical, decision: report.decision, totals: report.totals }, null, 2));
if (report.decision !== 'PASS') process.exitCode = 1;
void zero;
