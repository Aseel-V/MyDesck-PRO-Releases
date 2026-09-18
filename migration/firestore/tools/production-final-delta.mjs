#!/usr/bin/env node
/**
 * Final source delta, measured against the copy rather than assumed.
 *
 * Implements steps 2, 3 and 5 of the algorithm in `PRODUCTION_DELTA_MAP.md`: open one PostgreSQL
 * REPEATABLE READ / READ ONLY transaction, record the marker, and reconcile the complete source and
 * target primary-key sets, canonical hashes, money, relationships, events and timestamps.
 *
 * It measures first and only then decides whether anything needs applying. Every difference is
 * classified against what is actually in Firestore right now, not against a recorded expectation,
 * because the target is the only thing that can say what the target contains:
 *
 *   NEW       planned from the current source, absent from Firestore
 *   CHANGED   present in both, and the document hash the source now implies differs
 *   DELETED   present in Firestore, no longer planned from the current source
 *
 * A zero result is a measurement, not a shortcut. The delta plan is emitted either way, so a later
 * apply step has something exact to work from rather than re-deriving it under time pressure.
 *
 * Step 1 of that algorithm — "enable maintenance and prove all source business writes are rejected"
 * — is deliberately NOT performed here. The implemented freeze (`src/data/maintenanceMode.ts`,
 * driven by VITE_MIGRATION_MAINTENANCE) is wired into FirestoreTravelRepository only, so it can
 * freeze the Firebase-mode app and cannot freeze the Supabase-backed build that is live today.
 * Inventing a Supabase-side freeze is out of scope, so this tool reports what the source actually
 * did instead: whether any migratable row changed between the copy and now.
 *
 *   node migration/firestore/tools/production-final-delta.mjs --journal=<path>
 */
import { readFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan, partitionBatches } from '../lib/migration-plan.mjs';
import { planHash, DEFAULT_BATCH_SIZE } from '../lib/authorized-production-target.mjs';
import { openProductionReader } from '../lib/production-reader.mjs';
import { ProductionJournal, JOURNAL_STATUS } from '../lib/production-journal.mjs';
import { sha256 } from '../lib/production-guard.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const REPORT_PATH = 'migration/reports/firestore-production-final-delta.json';
const PLAN_PATH = 'migration/production-copy.local/final-delta-plan.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const journalPath = value('--journal');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');

const journal = ProductionJournal.load(journalPath);
if (journal.body.firebaseProject !== PROJECT) throw Error('JOURNAL_PROJECT_MISMATCH');
if (journal.body.firestoreDatabaseId !== DATABASE) throw Error('JOURNAL_DATABASE_MISMATCH');
if (journal.status !== JOURNAL_STATUS.RECONCILED) {
  throw Error(`FINAL_DELTA_REQUIRES_RECONCILED_COPY:${journal.status}`);
}

// ---- a fresh snapshot, with its marker recorded --------------------------------------------------
const { Timestamp } = await import('firebase-admin/firestore');
const evidence = {};
const source = await withSourceSnapshot(localConfig(), async (select) => {
  const marker = (await select(`SELECT txid_current_snapshot()::text AS snapshot,
    now()::text AS captured_at, pg_current_wal_lsn()::text AS wal_lsn`)).rows[0];
  const built = await buildMigrationPlan({ select, Timestamp });
  const perTable = (await select(`SELECT table_name,
      (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
        false, true, '')))[1]::text::bigint AS rows
    FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name`)).rows.map((row) => ({ table: row.table_name, rows: Number(row.rows) }));
  const authUsers = Number((await select('SELECT count(*)::int AS n FROM auth.users')).rows[0].n);
  return { marker, built, perTable, authUsers };
}, evidence);
if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

const built = source.built;
const plan = built.plan;
const derivedPlanHash = planHash(plan, sha256);

// ---- the target is the authority on what the target contains --------------------------------------
const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
let report;
try {
  const collectionIds = [...new Set(plan.flatMap((entry) =>
    entry.path.split('/').filter((_, index) => index % 2 === 0)))];
  const scan = await reader.scanCollectionGroups(collectionIds);
  const plannedPaths = new Set(plan.map((entry) => entry.path));
  const present = await reader.readDocuments([...new Set([...plannedPaths, ...scan.paths])]);

  const created = [];
  const changed = [];
  const deleted = [];
  for (const entry of plan) {
    const doc = present.get(entry.path);
    if (!doc) { created.push({ path: entry.path, sourceTable: entry.sourceTable }); continue; }
    if (rawDocumentHash(entry.path, doc) !== entry.documentFingerprint) {
      changed.push({ path: entry.path, sourceTable: entry.sourceTable });
    }
  }
  for (const path of scan.paths) {
    if (!plannedPaths.has(path)) deleted.push({ path, collectionGroup: path.split('/').at(-2) });
  }

  // ---- source-row level movement, table by table ---------------------------------------------------
  const preflight = JSON.parse(readFileSync('migration/reports/pre-bulk-preflight.json', 'utf8'));
  const copyTimeByTable = new Map(preflight.live.perTable.map((row) => [row.table, row.rows]));
  const rowDrift = source.perTable
    .filter((row) => copyTimeByTable.get(row.table) !== row.rows)
    .map((row) => ({ table: row.table, atCopy: copyTimeByTable.get(row.table) ?? null, now: row.rows }));

  const deltaDocuments = [...created, ...changed];
  const deltaPlan = plan.filter((entry) => deltaDocuments.some((item) => item.path === entry.path));
  const zeroDelta = created.length === 0 && changed.length === 0 && deleted.length === 0
    && rowDrift.length === 0 && derivedPlanHash === journal.body.planHash;

  // ---- properties the delta plan must hold, asserted rather than assumed ---------------------------
  // These come from the planner itself; restating them here is what makes "the delta is safe to
  // apply" checkable instead of inherited.
  const credentialFieldPattern = /password|secret|token|encrypted|salt|hash_key|private_key/i;
  const planProperties = {
    noCredentialFields: deltaPlan.every((entry) =>
      Object.keys(entry.data).every((field) => !credentialFieldPattern.test(field))),
    noExcludedOperationalRows: built.excluded.every((row) =>
      row.reason === 'DERIVED_OPERATIONAL_STATE_REBUILT_BY_TARGET')
      && deltaPlan.every((entry) => !built.excluded
        .some((row) => row.sourceTable === entry.sourceTable && row.sourcePk.join('|') === entry.sourcePk.join('|'))),
    deterministicPaths: deltaPlan.every((entry) => entry.path === entry.path.normalize('NFC'))
      && new Set(deltaPlan.map((entry) => entry.path)).size === deltaPlan.length,
    ownershipPreserved: deltaPlan.every((entry) => entry.ownerUid === null || typeof entry.ownerUid === 'string'),
    storageWrites: 0,
  };

  const deltaBatches = deltaPlan.length ? partitionBatches(deltaPlan, DEFAULT_BATCH_SIZE) : [];

  report = {
    generatedAt: new Date().toISOString(),
    artifact: 'firestore-production-final-delta',
    bulkMigrationRunId: journal.body.migrationRunId,
    projectId: PROJECT,
    firestoreDatabaseId: DATABASE,
    readIdentity: reader.identity,
    writeFreeze: {
      applied: false,
      mechanism: 'src/data/maintenanceMode.ts via VITE_MIGRATION_MAINTENANCE',
      coverage: 'FirestoreTravelRepository only',
      appliesToLiveSupabaseBackend: false,
      note: 'The implemented freeze guards the Firebase-mode client. The build that is live today '
        + 'runs the Supabase path, which has no freeze wired into it, so source quiescence is '
        + 'measured here rather than enforced.',
    },
    snapshot: {
      isolationLevel: evidence.start?.isolation ?? null,
      readOnly: evidence.start?.read_only ?? null,
      rejectedWriteSqlState: evidence.rejectedWriteSqlState,
      successfulWrites: evidence.successfulWrites,
      transactionOutcome: evidence.transactionOutcome,
      marker: source.marker,
    },
    copyTime: {
      startedAt: journal.body.startedAt,
      planHash: journal.body.planHash,
      plannedDocuments: journal.body.plannedDocumentCount,
    },
    now: {
      planHash: derivedPlanHash,
      plannedDocuments: plan.length,
      sourceRows: built.counts.sourceRows,
      migratableRows: built.counts.migratableRows,
      excludedRows: built.counts.excludedRows,
      authUsers: source.authUsers,
    },
    planHashUnchanged: derivedPlanHash === journal.body.planHash,
    delta: {
      newDocuments: created.length,
      changedDocuments: changed.length,
      deletedDocuments: deleted.length,
      sourceTableRowDrift: rowDrift,
      newSample: created.slice(0, 10),
      changedSample: changed.slice(0, 10),
      deletedSample: deleted.slice(0, 10),
      documentsRequiringApplication: deltaPlan.length,
      batches: deltaBatches.length,
    },
    planProperties,
    decision: zeroDelta ? 'NO_DELTA_REQUIRED' : 'DELTA_MEASURED_REQUIRES_APPLICATION',
    mutations: { firestoreWrites: 0, firestoreDeletes: 0, authImports: 0,
      storageMutations: 0, sourceMutations: 0 },
  };

  // The exact delta plan is written even when empty, so an apply step never has to re-derive it.
  writeReport(PLAN_PATH, `${JSON.stringify({
    bulkMigrationRunId: journal.body.migrationRunId,
    generatedAt: report.generatedAt,
    planHash: derivedPlanHash,
    documents: deltaPlan.map((entry) => ({ path: entry.path, sourceTable: entry.sourceTable,
      documentFingerprint: entry.documentFingerprint })),
    deletedDocuments: deleted,
  }, null, 2)}\n`);
  writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await reader.close();
} catch (error) {
  await reader.close().catch(() => undefined);
  throw error;
}

console.log(JSON.stringify({
  decision: report.decision,
  writeFreezeApplied: report.writeFreeze.applied,
  planHashUnchanged: report.planHashUnchanged,
  snapshotMarker: report.snapshot.marker,
  sourceRows: report.now.sourceRows,
  migratableRows: report.now.migratableRows,
  excludedRows: report.now.excludedRows,
  delta: report.delta,
  planProperties: report.planProperties,
  mutations: report.mutations,
  report: REPORT_PATH,
}, null, 2));
process.exitCode = 0;
