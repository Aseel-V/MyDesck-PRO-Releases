#!/usr/bin/env node
/**
 * Live source inventory for the production dry-run.
 *
 * The dry-run's source-row drift check used to pass its own hardcoded constant on both sides of the comparison,
 * so it could not detect drift at all. This tool produces the measured half: the current public table and row
 * counts and the Auth user count, read inside one REPEATABLE READ READ ONLY snapshot whose write rejection is
 * proven server-side (SQLSTATE 25006), with TLS certificate verification enforced by the shared helper.
 *
 * Counts only. No customer values are read, logged or persisted, and no credential is recorded.
 *
 *   node migration/firestore/tools/live-source-inventory.mjs
 *
 * Writes migration/reports/live-source-inventory.json.
 */
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const config = localConfig();
if (!config.SUPABASE_DB_URL && !config.PGURL) throw new Error('SOURCE_CONFIG_REQUIRED');

const evidence = {};
const measured = await withSourceSnapshot(config, async (select) => {
  const tables = await select(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
  const rows = await select(`SELECT coalesce(sum(n),0)::bigint AS total FROM (
      SELECT (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
        false, true, '')))[1]::text::bigint AS n
      FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') t`);
  const users = await select('SELECT count(*)::int AS n FROM auth.users');
  return { tables: tables.rows[0].n, rows: Number(rows.rows[0].total), authUsers: users.rows[0].n };
}, evidence);

const report = {
  generatedAt: new Date().toISOString(),
  source: 'LIVE_PRODUCTION_SOURCE',
  readOnly: true,
  productionMutations: 0,
  measured,
  snapshot: {
    isolationLevel: evidence.start?.isolation ?? null,
    readOnlyStart: evidence.start?.read_only ?? null,
    readOnlyEnd: evidence.end?.read_only ?? null,
    rejectedWriteSqlState: evidence.rejectedWriteSqlState ?? null,
    successfulWrites: evidence.successfulWrites ?? null,
    transactionOutcome: evidence.transactionOutcome ?? null,
    tlsCertificateVerification: 'ENABLED',
  },
};

if (report.snapshot.rejectedWriteSqlState !== '25006' || report.snapshot.successfulWrites !== 0) {
  throw new Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

writeReport('migration/reports/live-source-inventory.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ measured, snapshot: report.snapshot }, null, 2));
