#!/usr/bin/env node
/**
 * Live vertical inventory (Phase 1 evidence).
 *
 * Classifies every business_type the shipped dashboard can dispatch to, using the real production source rather
 * than old report counts. STRICTLY READ-ONLY, through `withSourceSnapshot` (migration/tools/lib/staging-source.mjs):
 * a verified TLS connection pinned to the source project, one REPEATABLE READ READ ONLY transaction whose isolation
 * and read-only state are read back from the server, a write control PostgreSQL must reject with 25006, SELECT-only
 * statements, and a rollback. The report's `source` block records what the server reported, not a declared value.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { localConfig, qi, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';

// business_type -> tables that carry that vertical's rows.
const VERTICAL_TABLES = {
  tourism: ['trips', 'trip_', 'travel_'],
  restaurant: ['restaurant_'],
  supermarket: ['market_'],
  auto_repair: ['customer_vehicles', 'repair_', 'car_parts'],
  car_parts: ['car_parts'],
  phone_shop: [],
  clothes_shop: [],
  furniture_store: [],
};

const evidence = {};
const body = await withSourceSnapshot(localConfig(), async (select) => {
  const dashboard = readFileSync('src/components/Dashboard.tsx', 'utf8');
  const dispatched = [...new Set([...dashboard.matchAll(/business_type === '([a-z_]+)'/g)].map((m) => m[1]))].sort();

  const businesses = await select('SELECT business_type, count(*)::int AS businesses FROM public.business_profiles GROUP BY 1');
  const byType = Object.fromEntries(businesses.rows.map((r) => [r.business_type, r.businesses]));

  const tableRows = await select(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`);
  const allTables = tableRows.rows.map((r) => r.name);

  const rowsFor = async (prefixes) => {
    if (!prefixes.length) return { rows: 0, tables: [] };
    const matched = allTables.filter((t) => prefixes.some((p) => t === p || t.startsWith(p)));
    let total = 0; const detail = [];
    for (const table of matched) {
      const { rows } = await select(`SELECT count(*)::int AS n FROM public.${qi(table)}`);
      if (rows[0].n > 0) detail.push({ table, rows: rows[0].n });
      total += rows[0].n;
    }
    return { rows: total, tables: detail };
  };

  const verticals = [];
  for (const vertical of dispatched) {
    const tenants = byType[vertical] ?? 0;
    const data = await rowsFor(VERTICAL_TABLES[vertical] ?? []);
    verticals.push({
      vertical,
      reachableFromDashboard: true,
      tenants,
      rows: data.rows,
      tables: data.tables,
      classification: tenants > 0 ? 'ACTIVE_WITH_DATA' : 'ACTIVE_EMPTY',
      retirementRequiresOwnerApproval: true,
    });
  }

  const unexpected = Object.keys(byType).filter((t) => !dispatched.includes(t));
  const authUsers = (await select('SELECT count(*)::int AS n FROM auth.users')).rows[0].n;
  return { authUsers, publicTables: allTables.length, dispatched, unexpected, verticals };
}, evidence);

const { authUsers, publicTables, dispatched, unexpected, verticals } = body;
const report = {
  generatedAt: new Date().toISOString(),
  source: {
    readOnly: evidence.start?.read_only === 'on' && evidence.end?.read_only === 'on',
    isolationLevel: evidence.start?.isolation ?? null,
    isolationLevelAtEnd: evidence.end?.isolation ?? null,
    writeAttemptRejected: evidence.rejectedWriteSqlState === '25006',
    rejectedWriteSqlState: evidence.rejectedWriteSqlState ?? null,
    writesCaused: evidence.successfulWrites ?? null,
    transactionOutcome: evidence.transactionOutcome ?? null,
  },
  authUsers,
  publicTables,
  dispatchedVerticals: dispatched,
  businessTypesWithTenantsNotDispatched: unexpected,
  verticals,
  counts: {
    ACTIVE_WITH_DATA: verticals.filter((v) => v.classification === 'ACTIVE_WITH_DATA').length,
    ACTIVE_EMPTY: verticals.filter((v) => v.classification === 'ACTIVE_EMPTY').length,
    LEGACY_REACHABLE: 0, LEGACY_UNREACHABLE: 0, DEAD: 0, MIGRATION_ONLY: 0,
    unknown: unexpected.length,
  },
};
writeFileSync('migration/reports/live-vertical-inventory.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ authUsers, dispatched: dispatched.length,
  ACTIVE_WITH_DATA: report.counts.ACTIVE_WITH_DATA, ACTIVE_EMPTY: report.counts.ACTIVE_EMPTY,
  unknown: report.counts.unknown, source: report.source,
  tenants: Object.fromEntries(verticals.map((v) => [v.vertical, v.tenants])) }, null, 2));
if (report.counts.unknown !== 0) process.exitCode = 2;
