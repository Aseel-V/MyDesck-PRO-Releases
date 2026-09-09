#!/usr/bin/env node
/**
 * READ-ONLY export of the approved synthetic slice, with row payloads.
 *
 * The existing `export-synthetic-slice.mjs` proves closure and hashes; it does
 * not keep the values, so nothing downstream could actually be migrated. This
 * tool keeps the payloads, under the same read-only guarantees.
 *
 * Every column is cast to `text` in SQL. That is deliberate and load-bearing:
 * the moment a NUMERIC or a large JSON integer is handed to the pg driver as a
 * JavaScript value, precision is already gone and no amount of care downstream
 * gets it back. Text is what PostgreSQL itself considers the value to be.
 *
 * Passwords and token columns are never selected. Encrypted passport ciphertext
 * IS carried through verbatim — it is migrated as ciphertext and never decrypted.
 *
 *   node migration/firestore/tools/export-synthetic-payloads.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot, qi } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const OUT_DIR = 'migration/firestore/export.local';

/**
 * The travel slice belongs to the two `migration-test--travel-` identities in
 * the full-staging manifest, NOT the three identities in the Firebase auth
 * manifest — a distinction worth being strict about, since selecting the wrong
 * manifest here is how a "synthetic" export quietly starts reading real rows.
 * The same shape of assertion as `approvedIdentities()`: refuse anything that
 * is not provably the approved, deletion-unapproved synthetic set.
 */
function approvedTravelIdentities() {
  const manifest = JSON.parse(
    readFileSync('migration/reports/full-staging-cleanup-manifest.json', 'utf8'));
  if (manifest.deletionApproved !== false) throw new Error('CLEANUP_APPROVAL_CHANGED');
  const users = manifest.identities.filter((x) => x.source === 'Supabase');
  const ok = users.length === 2
    && new Set(users.map((x) => x.uid)).size === 2
    && users.every((x) => x.email.startsWith('migration-test--travel-')
      && manifest.identities.some(
        (y) => y.source === 'Firebase' && y.uid === x.uid && y.email === x.email));
  if (!ok) throw new Error('SYNTHETIC_TRAVEL_SLICE_INVALID');
  return users;
}

/**
 * auth.users columns that are safe to read. Anything holding a credential,
 * a token or a one-time secret is excluded by construction rather than by
 * filtering after the fact.
 */
const AUTH_USER_COLUMNS = [
  'id', 'email', 'phone', 'created_at', 'updated_at', 'email_confirmed_at',
  'phone_confirmed_at', 'last_sign_in_at', 'banned_until', 'deleted_at',
  'raw_user_meta_data', 'raw_app_meta_data', 'is_anonymous', 'role', 'aud',
];

const FORBIDDEN_COLUMN = /password|token|secret|otp|nonce|challenge/i;

/** Tables in scope for the first Firestore parity milestone. */
const IN_SCOPE_TABLES = [
  'user_profiles', 'business_profiles', 'business_settings',
  'trips', 'trip_payment_plans', 'trip_installments',
  'trip_payment_events', 'trip_installment_events',
  'trip_financial_audit', 'trip_activity_log', 'trip_write_requests',
  'trip_templates', 'trip_notifications', 'trip_notification_settings',
  'trip_packing_lists', 'trip_pricing_preferences', 'trip_whatsapp_templates',
  'trip_attachment_cleanup_queue', 'trip_pdf_rate_limits', 'audit_logs',
];

const evidence = {};
const config = localConfig();
const identities = approvedTravelIdentities();
const approvedUids = identities.map((x) => x.uid);

const result = await withSourceSnapshot(config, async (select) => {
  const q = async (sql, values) => (await select(sql, values)).rows;

  const columnsByTable = new Map();
  for (const row of await q(`SELECT table_name, column_name, data_type, ordinal_position
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`)) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, []);
    columnsByTable.get(row.table_name).push(row);
  }

  const primaryKeys = new Map();
  for (const row of await q(`SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position`)) {
    if (!primaryKeys.has(row.table_name)) primaryKeys.set(row.table_name, []);
    primaryKeys.get(row.table_name).push(row.column_name);
  }

  // Businesses are discovered first, because some in-scope tables reach the
  // slice only through a business id. `business_settings.business_id` is a
  // special case worth naming: its foreign key points at auth.users, so the
  // column holds a USER id despite its name, and keying it by business would
  // silently export nothing.
  const businessIds = (await q(
    `SELECT id::text AS id FROM public.business_profiles
     WHERE user_id::text = ANY($1::text[]) ORDER BY id`, [approvedUids])).map((r) => r.id);

  /** How each in-scope table is reached from the approved slice. */
  const reach = new Map();
  for (const table of IN_SCOPE_TABLES) {
    const columns = columnsByTable.get(table) ?? [];
    const has = (name) => columns.some((c) => c.column_name === name);
    const userColumn = ['user_id', 'created_by', 'owner_id'].find(has);
    if (userColumn) {
      reach.set(table, { column: userColumn, keys: approvedUids, via: 'user' });
    } else if (table === 'business_settings' && has('business_id')) {
      reach.set(table, { column: 'business_id', keys: approvedUids, via: 'user (column named business_id)' });
    } else if (has('business_id')) {
      reach.set(table, { column: 'business_id', keys: businessIds, via: 'business' });
    }
  }

  // auth.users, credential columns excluded by construction.
  const authColumnNames = (await q(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' ORDER BY ordinal_position`))
    .map((r) => r.column_name)
    .filter((name) => AUTH_USER_COLUMNS.includes(name) && !FORBIDDEN_COLUMN.test(name));

  const authUsers = await q(
    `SELECT ${authColumnNames.map((n) => `${qi(n)}::text AS ${qi(n)}`).join(', ')}
     FROM auth.users WHERE id = ANY($1::uuid[]) ORDER BY id`, [approvedUids]);

  const tables = {};
  const summary = [];
  let totalRows = 0;

  for (const table of IN_SCOPE_TABLES) {
    const columns = columnsByTable.get(table);
    if (!columns) {
      summary.push({ table, status: 'TABLE_ABSENT_IN_SOURCE', rows: 0 });
      continue;
    }
    const route = reach.get(table);
    if (!route) {
      summary.push({ table, status: 'NOT_REACHABLE_FROM_SLICE', rows: 0 });
      tables[table] = { columns: columns.map((c) => c.column_name), rows: [], reachable: false };
      continue;
    }
    const selectable = columns.filter((c) => !FORBIDDEN_COLUMN.test(c.column_name));
    const excluded = columns.length - selectable.length;
    const pk = primaryKeys.get(table) ?? [];
    const order = (pk.length ? pk : [selectable[0].column_name])
      .map((c) => `${qi(c)}::text`).join(', ');

    const rows = route.keys.length === 0 ? [] : await q(
      `SELECT ${selectable.map((c) => `${qi(c.column_name)}::text AS ${qi(c.column_name)}`).join(', ')}
       FROM public.${qi(table)} WHERE ${qi(route.column)}::text = ANY($1::text[])
       ORDER BY ${order}`, [route.keys]);

    tables[table] = {
      reachable: true,
      ownerColumn: route.column,
      reachedVia: route.via,
      primaryKey: pk,
      excludedColumns: excluded,
      columns: selectable.map((c) => ({ name: c.column_name, type: c.data_type })),
      rows,
    };
    totalRows += rows.length;
    summary.push({ table, status: 'EXPORTED', rows: rows.length,
      ownerColumn: route.column, reachedVia: route.via });
  }

  return { authUsers, tables, summary, totalRows, businessIds };
}, evidence);

// A synthetic slice that has grown real customers is not synthetic any more.
const syntheticEmails = result.authUsers.every((u) => String(u.email).startsWith('migration-test--'));
if (!syntheticEmails) throw new Error('SLICE_CONTAINS_NON_SYNTHETIC_IDENTITY');

mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  sourceProject: 'pubugnfaqqukelvgckdr',
  sourceSafety: evidence,
  sourceWrites: 0,
  realCustomerRowsExported: 0,
  approvedUids,
  businessIds: result.businessIds,
  authUsers: result.authUsers,
  tables: result.tables,
};
writeFileSync(`${OUT_DIR}/synthetic-payloads.json`, JSON.stringify(payload, null, 2) + '\n');

const report = {
  generatedAt: payload.generatedAt,
  status: 'EXPORTED_SYNTHETIC_ONLY',
  sourceSafety: evidence,
  sourceWrites: 0,
  realCustomerRowsExported: 0,
  approvedUidCount: approvedUids.length,
  businessIdCount: result.businessIds.length,
  authUsersExported: result.authUsers.length,
  authColumnsExcluded: 'credential and token columns never selected',
  totalRows: result.totalRows,
  payloadPath: `${OUT_DIR}/synthetic-payloads.json`,
  tables: result.summary,
};
writeReport('migration/reports/firestore-synthetic-payload-export.json',
  JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  status: report.status,
  authUsersExported: report.authUsersExported,
  totalRows: report.totalRows,
  sourceWrites: report.sourceWrites,
  transactionOutcome: evidence.transactionOutcome,
  nonEmpty: result.summary.filter((s) => s.rows > 0),
  empty: result.summary.filter((s) => s.rows === 0).map((s) => `${s.table} (${s.status})`),
}, null, 2));
