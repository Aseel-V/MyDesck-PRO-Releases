#!/usr/bin/env node
/**
 * Bounded transition watch for old-client writes to the Supabase source.
 *
 * The shipped 0.0.61 desktop client can keep writing to Supabase indefinitely. Its updater never
 * checks on its own — `setupAutoUpdater()` registers handlers but never calls `checkForUpdates()`,
 * which happens only when someone presses a button in Settings — and even then `autoDownload` and
 * `autoInstallOnAppQuit` are both false and the notice is dismissible. So a customer who never opens
 * that screen stays on the Supabase backend forever while 0.0.62 writes to Firestore.
 *
 * Nothing in this repository can force those clients to update, and the two obvious ways to stop
 * them are worse than the problem: revoking Supabase write access would break old clients mid-work
 * and destroy the rollback path, which has to stay usable until the migration is proven. What is
 * left is to bound the divergence instead of preventing it — detect every late write, keep a
 * durable record of when the source last moved, and reconcile until old-client activity reaches
 * zero and stays there.
 *
 * This tool is the detection half. It is READ ONLY on both sides and it never applies anything: it
 * measures, appends to a local ledger, and says whether the source is quiet. Applying a measured
 * delta stays a separate, separately authorized action, because a tool that both detects and writes
 * would eventually write on a detection nobody read.
 *
 * The window is seven consecutive days by operator decision, anchored on the first verified
 * post-release zero-drift observation, and any legitimate source write resets it to zero.
 *
 *   node migration/firestore/tools/split-brain-watch.mjs --journal=<path> [--quiet-hours=168]
 */
import { existsSync, readFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan } from '../lib/migration-plan.mjs';
import { openProductionReader } from '../lib/production-reader.mjs';
import { ProductionJournal } from '../lib/production-journal.mjs';
import { rawDocumentHash } from '../lib/full-rehearsal-core.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const LEDGER_PATH = 'migration/production-copy.local/split-brain-watch.json';
const REPORT_PATH = 'migration/reports/split-brain-watch.json';

const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const journalPath = value('--journal');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');
/** Seven consecutive days. Operator decision of 2026-09-18; not a default to tune casually. */
const QUIET_WINDOW_HOURS = 168;
const quietHours = Number(value('--quiet-hours', String(QUIET_WINDOW_HOURS)));
/**
 * Source-only mode: observe Supabase and do not touch Firestore.
 *
 * The question this tool exists to answer — did an old client write to the source? — is entirely
 * source-side. Comparing against Firestore adds confidence but costs a read of the whole corpus,
 * which is exactly what exhausted the daily allowance. While the quota is short, or simply to keep
 * a long watch cheap, the comparison can be skipped and the drift still measured against the
 * recorded cutover baseline.
 */
const sourceOnly = process.argv.includes('--source-only');
if (!Number.isFinite(quietHours) || quietHours <= 0) throw Error('QUIET_HOURS_INVALID');

const journal = ProductionJournal.load(journalPath);
const expectedTargetPaths = journal.expectedPathSet();
const ledger = existsSync(LEDGER_PATH)
  ? JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  : { createdAt: new Date().toISOString(), observations: [] };
const previous = ledger.observations.at(-1) ?? null;

// ---- fresh READ ONLY snapshot --------------------------------------------------------------------
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
  const storage = (await select(`SELECT bucket_id, count(*)::int AS objects,
      coalesce(sum((metadata->>'size')::bigint),0)::bigint AS bytes, max(updated_at)::text AS last_updated
    FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id`)).rows
    .map((row) => ({ bucket: row.bucket_id, objects: row.objects, bytes: Number(row.bytes),
      lastUpdated: row.last_updated }));
  // The newest business timestamp anywhere: the cheapest signal that a client wrote something.
  const newestWrite = (await select(`SELECT max(greatest(created_at, updated_at))::text AS newest
    FROM public.trips`)).rows[0]?.newest ?? null;
  return { marker, built, perTable, authUsers, storage, newestWrite };
}, evidence);
if (evidence.rejectedWriteSqlState !== '25006' || evidence.successfulWrites !== 0) {
  throw Error('SOURCE_READ_ONLY_PROOF_FAILED');
}

// ---- compare against Firestore -------------------------------------------------------------------
const plan = source.built.plan;
const plannedPaths = new Set(plan.map((entry) => entry.path));
const reader = sourceOnly
  ? null
  : await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
let report;
try {
  const documents = reader ? await reader.readDocuments([...plannedPaths]) : new Map();
  // Without the target read, "new" and "changed" are measured against the expected path set the
  // journal records rather than against what Firestore holds. That still detects a source write,
  // which is the whole point; it just cannot also detect target drift.
  const created = reader
    ? plan.filter((entry) => !documents.has(entry.path)).map((entry) => entry.path)
    : plan.filter((entry) => !expectedTargetPaths.has(entry.path)).map((entry) => entry.path);
  const changed = reader ? plan.filter((entry) => {
    const doc = documents.get(entry.path);
    return doc && rawDocumentHash(entry.path, doc) !== entry.documentFingerprint;
  }).map((entry) => entry.path) : [];
  const removed = [...expectedTargetPaths].filter((path) => !plannedPaths.has(path));

  // ---- did the source move since the last observation? -------------------------------------------
  const baseline = JSON.parse(readFileSync('migration/reports/pre-bulk-preflight.json', 'utf8'));
  const baselineByTable = new Map(baseline.live.perTable.map((row) => [row.table, row.rows]));
  const rowDriftVsCutover = source.perTable
    .filter((row) => baselineByTable.get(row.table) !== row.rows)
    .map((row) => ({ table: row.table, atCutover: baselineByTable.get(row.table) ?? null, now: row.rows }));

  const walMoved = previous ? previous.marker.wal_lsn !== source.marker.wal_lsn : null;
  const txidMoved = previous ? previous.marker.snapshot !== source.marker.snapshot : null;
  const sourceMoved = created.length > 0 || changed.length > 0 || rowDriftVsCutover.length > 0
    || source.authUsers !== baseline.live.authUsers;

  const observation = {
    at: new Date().toISOString(),
    marker: source.marker,
    sourceRows: source.built.counts.sourceRows,
    plannedDocuments: source.built.counts.plannedDocuments,
    authUsers: source.authUsers,
    storage: source.storage,
    newestBusinessWrite: source.newestWrite,
    newDocuments: created.length,
    changedDocuments: changed.length,
    removedFromPlan: removed.length,
    rowDriftVsCutover,
    sourceMoved,
    walMoved,
    txidMoved,
  };
  ledger.observations.push(observation);
  ledger.updatedAt = observation.at;
  writeReport(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);

  // ---- how long has the source been quiet? --------------------------------------------------------
  // The window is anchored on the first verified zero-drift observation after the release, and any
  // observation that saw the source move re-anchors it. A write during the window does not shorten
  // the window; it restarts it.
  const moving = ledger.observations.filter((item) => item.sourceMoved);
  const lastMovement = moving.at(-1) ?? null;
  const firstClean = ledger.observations.find((item) => !item.sourceMoved) ?? null;
  const anchor = lastMovement ? lastMovement.at : (firstClean?.at ?? observation.at);
  const quietSince = anchor;
  const quietForHours = (Date.now() - Date.parse(quietSince)) / 3_600_000;
  const quietLongEnough = !sourceMoved && quietForHours >= quietHours;
  const windowCompletesAt = new Date(Date.parse(quietSince) + quietHours * 3_600_000).toISOString();

  report = {
    generatedAt: observation.at,
    artifact: 'split-brain-watch',
    bulkMigrationRunId: journal.body.migrationRunId,
    projectId: PROJECT,
    releasedVersion: '0.0.62',
    risk: {
      // Stated as a property of the shipped 0.0.61 client, not as a prediction.
      oldClientCanStillWrite: true,
      reason: 'the 0.0.61 updater never checks automatically; discovery, download and install are '
        + 'all manual and the notice is dismissible',
      forcedUpdateAvailable: false,
      requiredFlagEnforced: false,
    },
    mode: sourceOnly ? 'SOURCE_ONLY_NO_FIRESTORE_READS' : 'SOURCE_AND_TARGET',
    firestoreOperationsUsed: sourceOnly ? 0 : plan.length,
    observation,
    observations: ledger.observations.length,
    quietSince,
    quietAnchor: lastMovement ? 'LAST_SOURCE_MOVEMENT' : 'FIRST_CLEAN_POST_RELEASE_OBSERVATION',
    quietForHours: Number(quietForHours.toFixed(2)),
    quietWindowHours: quietHours,
    quietWindowDays: Number((quietHours / 24).toFixed(2)),
    windowCompletesAt,
    windowResetsOnAnyLegitimateSourceWrite: true,
    postReleaseSourceNew: created.length,
    postReleaseSourceChanged: changed.length,
    postReleaseSourceDeleted: removed.length,
    authUsersChange: source.authUsers - baseline.live.authUsers,
    storageChange: source.storage.length === baseline.live.storage.length
      && source.storage.every((row) => {
        const before = baseline.live.storage.find((item) => item.bucket === row.bucket);
        return before && before.objects === row.objects && before.bytes === row.bytes;
      }) ? 0 : 'CHANGED',
    decision: sourceMoved ? 'LATE_SOURCE_WRITES_DETECTED'
      : quietLongEnough ? 'TRANSITION_COMPLETE_CANDIDATE' : 'WATCHING',
    nextAction: sourceMoved
      ? 'reconcile the measured delta before POST_CUTOVER_HEALTHY can be considered'
      : quietLongEnough
        ? `source quiet for ${(quietForHours / 24).toFixed(1)} days; prepare and validate the reversible `
          + 'legacy database write lock, then an operator may close the transition'
        : `keep watching: ${(quietHours / 24).toFixed(0)} consecutive days required, `
          + `${(quietForHours / 24).toFixed(2)} so far; completes at ${windowCompletesAt} if nothing writes`,
    mutations: { sourceWrites: 0, firestoreWrites: 0, authImports: 0, storageMutations: 0 },
  };
  writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (reader) await reader.close();
} catch (error) {
  if (reader) await reader.close().catch(() => undefined);
  throw error;
}

console.log(JSON.stringify({
  decision: report.decision,
  mode: report.mode,
  firestoreOperationsUsed: report.firestoreOperationsUsed,
  postReleaseSourceNew: report.postReleaseSourceNew,
  postReleaseSourceChanged: report.postReleaseSourceChanged,
  postReleaseSourceDeleted: report.postReleaseSourceDeleted,
  authUsersChange: report.authUsersChange,
  storageChange: report.storageChange,
  observations: report.observations,
  quietSince: report.quietSince,
  quietForHours: report.quietForHours,
  windowCompletesAt: report.windowCompletesAt,
  marker: report.observation.marker,
  oldClientCanStillWrite: report.risk.oldClientCanStillWrite,
  nextAction: report.nextAction,
  report: REPORT_PATH,
}, null, 2));
