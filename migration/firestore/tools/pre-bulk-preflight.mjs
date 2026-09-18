#!/usr/bin/env node
/**
 * Pre-bulk READ-ONLY preflight.
 *
 * Re-derives the live source inventory at table granularity and diffs it against the rehearsal the
 * migration is pinned to. Aggregates alone are not enough: two tables can drift in opposite
 * directions and leave the total unchanged, so every table is compared individually.
 *
 * Everything here runs inside the same REPEATABLE READ / READ ONLY snapshot the rest of the
 * migration uses, with the write rejection proven server-side (SQLSTATE 25006) and TLS certificate
 * verification enforced. Counts and metadata only: no customer values, no credentials.
 *
 *   node migration/firestore/tools/pre-bulk-preflight.mjs
 */
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { readFileSync } from 'node:fs';

const config = localConfig();
if (!config.SUPABASE_DB_URL && !config.PGURL) throw new Error('SOURCE_CONFIG_REQUIRED');

const evidence = {};
const live = await withSourceSnapshot(config, async (select) => {
  // Exact per-table counts, not reltuples estimates.
  const perTable = await select(`SELECT table_name,
      (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
        false, true, '')))[1]::text::bigint AS rows
    FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name`);
  const users = await select('SELECT count(*)::int AS n FROM auth.users');
  const authBreakdown = await select(`SELECT
      count(*) FILTER (WHERE encrypted_password IS NOT NULL AND encrypted_password <> '')::int AS with_password,
      count(*) FILTER (WHERE email_confirmed_at IS NOT NULL)::int AS email_verified,
      count(*) FILTER (WHERE banned_until IS NOT NULL AND banned_until > now())::int AS banned,
      count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS soft_deleted,
      count(*) FILTER (WHERE id IS NOT NULL)::int AS with_uuid_id
    FROM auth.users`);
  // Every auth.users.id must be uuid-typed for uid preservation to hold.
  const idType = await select(`SELECT data_type FROM information_schema.columns
    WHERE table_schema='auth' AND table_name='users' AND column_name='id'`);
  const storage = await select(`SELECT bucket_id, count(*)::int AS objects,
      coalesce(sum((metadata->>'size')::bigint),0)::bigint AS bytes
    FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id`);
  const relationships = await select(`SELECT count(*)::int AS n FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype='f' AND n.nspname='public'`);
  const currencies = await select(`SELECT DISTINCT currency FROM (
      SELECT currency FROM public.trips WHERE currency IS NOT NULL
      UNION SELECT preferred_currency FROM public.business_profiles WHERE preferred_currency IS NOT NULL) t
    ORDER BY currency`);
  const financial = await select(`SELECT
      (SELECT count(*)::int FROM public.trips) AS trips,
      (SELECT count(*)::int FROM public.trip_payment_events) AS payment_events,
      (SELECT count(*)::int FROM public.trip_installment_events) AS installment_events,
      (SELECT count(*)::int FROM public.trip_financial_audit) AS financial_audit,
      (SELECT count(*)::int FROM public.trip_activity_log) AS activity_log,
      (SELECT count(*)::int FROM public.trip_installments) AS installments,
      (SELECT count(*)::int FROM public.trip_payment_plans) AS payment_plans`);
  return { perTable: perTable.rows.map((r) => ({ table: r.table_name, rows: Number(r.rows) })),
    authUsers: users.rows[0].n, authBreakdown: authBreakdown.rows[0],
    authIdType: idType.rows[0]?.data_type ?? null,
    storage: storage.rows.map((r) => ({ bucket: r.bucket_id, objects: r.objects, bytes: Number(r.bytes) })),
    foreignKeys: relationships.rows[0].n,
    currencies: currencies.rows.map((r) => r.currency),
    financial: financial.rows[0] };
}, evidence);

if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw new Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

// ---- diff against the rehearsal the migration is pinned to --------------------------------------
const rehearsal = JSON.parse(readFileSync('migration/reports/firestore-full-import.json', 'utf8'));
const baselineByTable = new Map((rehearsal.tableCoverage ?? []).map((t) => [t.table, t]));
const liveByTable = new Map(live.perTable.map((t) => [t.table, t.rows]));

const deltas = [];
for (const [table, rows] of liveByTable) {
  const base = baselineByTable.get(table);
  if (!base) { deltas.push({ table, baselineRows: null, liveRows: rows, delta: rows, kind: 'TABLE_NOT_IN_REHEARSAL' }); continue; }
  if (base.sourceRows !== rows) {
    deltas.push({ table, baselineRows: base.sourceRows, liveRows: rows, delta: rows - base.sourceRows, kind: 'ROW_COUNT_DRIFT' });
  }
}
for (const [table, base] of baselineByTable) {
  if (!liveByTable.has(table)) deltas.push({ table, baselineRows: base.sourceRows, liveRows: null, delta: -base.sourceRows, kind: 'TABLE_MISSING_FROM_LIVE' });
}

const liveTotalRows = live.perTable.reduce((sum, t) => sum + t.rows, 0);
const coverage = rehearsal.sourceCoverage ?? {};
const excludedRows = (rehearsal.tableCoverage ?? []).filter((t) => (t.excludedRows ?? 0) > 0)
  .map((t) => ({ table: t.table, excludedRows: t.excludedRows, reason: t.exclusionReason }));

const report = {
  generatedAt: new Date().toISOString(), mode: 'READ_ONLY_PREFLIGHT', productionMutations: 0, sourceWrites: 0,
  snapshot: {
    isolationLevel: evidence.start?.isolation ?? null,
    readOnlyStart: evidence.start?.read_only ?? null, readOnlyEnd: evidence.end?.read_only ?? null,
    rejectedWriteSqlState: evidence.rejectedWriteSqlState, successfulWrites: evidence.successfulWrites,
    transactionOutcome: evidence.transactionOutcome, tlsCertificateVerification: 'ENABLED',
  },
  live: { tables: live.perTable.length, totalRows: liveTotalRows, authUsers: live.authUsers,
    authBreakdown: live.authBreakdown, authIdType: live.authIdType, storage: live.storage,
    foreignKeys: live.foreignKeys, currencies: live.currencies, financial: live.financial,
    perTable: live.perTable },
  rehearsalBaseline: { tables: coverage.tables, rows: coverage.rows, migrated: coverage.migrated,
    excluded: coverage.excluded, unknown: coverage.unknown, conservationMatches: coverage.conservationMatches,
    excludedRowDetail: excludedRows, authUsers: rehearsal.auth?.users ?? null },
  delta: {
    tables: live.perTable.length - (coverage.tables ?? 0),
    totalRows: liveTotalRows - (coverage.rows ?? 0),
    authUsers: live.authUsers - (rehearsal.auth?.users ?? 0),
    perTableDrift: deltas,
    driftDetected: deltas.length > 0,
  },
};
writeReport('migration/reports/pre-bulk-preflight.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  live: { tables: report.live.tables, totalRows: report.live.totalRows, authUsers: report.live.authUsers,
    authIdType: report.live.authIdType, foreignKeys: report.live.foreignKeys, currencies: report.live.currencies,
    financial: report.live.financial, storage: report.live.storage },
  baseline: report.rehearsalBaseline,
  delta: { tables: report.delta.tables, totalRows: report.delta.totalRows, authUsers: report.delta.authUsers,
    driftDetected: report.delta.driftDetected, perTableDrift: report.delta.perTableDrift },
  snapshot: report.snapshot,
}, null, 2));
