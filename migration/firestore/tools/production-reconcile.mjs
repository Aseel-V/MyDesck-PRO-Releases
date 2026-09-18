#!/usr/bin/env node
/**
 * Production full reconciliation: live Supabase against the real Firestore, after the bulk copy.
 *
 * `full-reconcile.mjs` is the verified reconciliation, but it is emulator-only by an explicit guard
 * and compares against the rehearsal's recorded `expected.json`. Neither is usable here, so this
 * tool applies the same comparisons to the real pair, with the expected corpus re-derived from the
 * live source inside a READ ONLY snapshot rather than read from a file. Every comparison rule —
 * raw hashes, canonical hashes, uid shape, relationship existence, financial scaling, event
 * sequence, timestamp micros shadow — is the rehearsal's rule, applied to production data.
 *
 * It is READ ONLY on both sides. The source runs in a REPEATABLE READ / READ ONLY transaction with
 * the write rejection proven server-side; the target is reached through `production-reader.mjs`,
 * which has no method that can change anything. The only thing this tool writes is the local
 * journal status and its own report.
 *
 * Re-planning from live source is also the drift check. The plan hash it derives must equal the one
 * the journal recorded at copy time; if a customer wrote to Supabase in between, the hashes diverge
 * and reconciliation fails rather than quietly comparing against a moved target.
 *
 *   node migration/firestore/tools/production-reconcile.mjs --journal=<path> [--no-mark]
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { buildMigrationPlan } from '../lib/migration-plan.mjs';
import { planHash, EXPECTED_PLANNED_DOCUMENTS } from '../lib/authorized-production-target.mjs';
import { openProductionReader } from '../lib/production-reader.mjs';
import { ProductionJournal, JOURNAL_STATUS, bulkCopyGate } from '../lib/production-journal.mjs';
import { sha256 } from '../lib/production-guard.mjs';
import { canonicalHash } from '../lib/canonical.mjs';
import { camel, canonicalFromDocument, estimateDocumentBytes } from '../lib/transform.mjs';
import { rawDocumentHash, sizeClass } from '../lib/full-rehearsal-core.mjs';

const PROJECT = 'mydesckpro';
const DATABASE = 'default';
const CUSTOMER_SIGNATURE_OWNER = '72647632-d481-4889-bf27-ed1bb14ad347';
const REPORT_PATH = 'migration/reports/firestore-production-reconciliation.json';
const value = (name, fallback = null) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;

const journalPath = value('--journal');
if (!journalPath) throw Error('JOURNAL_PATH_REQUIRED');
const markJournal = !process.argv.includes('--no-mark');

// ---- 0. journal ---------------------------------------------------------------------------------
// Loading verifies the integrity hash, so a hand-edited journal fails before anything is compared.
const journal = ProductionJournal.load(journalPath);
const journalChecks = {
  integrityHash: 'VERIFIED_ON_LOAD',
  stage: journal.body.stage,
  status: journal.status,
  firebaseProject: journal.body.firebaseProject,
  firestoreDatabaseId: journal.body.firestoreDatabaseId,
  plannedDocumentCount: journal.body.plannedDocumentCount,
  writtenPaths: journal.body.writtenPaths.length,
  completedBatches: journal.body.completedBatches.length,
  failure: journal.body.failure,
};
const journalFaults = [];
if (journal.body.firebaseProject !== PROJECT) journalFaults.push('JOURNAL_PROJECT_MISMATCH');
if (journal.body.firestoreDatabaseId !== DATABASE) journalFaults.push('JOURNAL_DATABASE_MISMATCH');
if (journal.body.stage !== 'firestore-bulk-copy') journalFaults.push('JOURNAL_STAGE_MISMATCH');
if (![JOURNAL_STATUS.COPY_COMPLETE, JOURNAL_STATUS.RECONCILED, JOURNAL_STATUS.RECONCILIATION_FAILED]
  .includes(journal.status)) journalFaults.push(`JOURNAL_STATUS_NOT_RECONCILABLE:${journal.status}`);
if (journal.body.failure) journalFaults.push('JOURNAL_RECORDS_A_FAILURE');
const runId = value('--run-id', journal.body.migrationRunId);
if (runId !== journal.body.migrationRunId) journalFaults.push('JOURNAL_RUN_ID_MISMATCH');

// ---- 1. live source: one READ ONLY snapshot, re-planned -----------------------------------------
const { Timestamp } = await import('firebase-admin/firestore');
const snapshotEvidence = {};
const source = await withSourceSnapshot(localConfig(), async (select) => {
  const built = await buildMigrationPlan({ select, Timestamp });

  // Source-side mutation evidence, in the same snapshot the plan came from.
  const perTable = (await select(`SELECT table_name,
      (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
        false, true, '')))[1]::text::bigint AS rows
    FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name`)).rows.map((row) => ({ table: row.table_name, rows: Number(row.rows) }));
  const authUsers = Number((await select('SELECT count(*)::int AS n FROM auth.users')).rows[0].n);
  const storage = (await select(`SELECT bucket_id, count(*)::int AS objects,
      coalesce(sum((metadata->>'size')::bigint),0)::bigint AS bytes,
      max(updated_at)::text AS last_updated
    FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id`)).rows
    .map((row) => ({ bucket: row.bucket_id, objects: row.objects, bytes: Number(row.bytes),
      lastUpdated: row.last_updated }));
  // The customer signature: identity, size and timestamps only. The bytes are never downloaded.
  const signature = (await select(`SELECT name, (metadata->>'size')::bigint AS size_bytes,
      metadata->>'mimetype' AS mime, created_at::text AS created_at, updated_at::text AS updated_at,
      version
    FROM storage.objects
    WHERE bucket_id = 'business-signatures' AND name LIKE $1 || '/%'
    ORDER BY name`, [CUSTOMER_SIGNATURE_OWNER])).rows
    .map((row) => ({ nameHash: createHash('sha256').update(row.name).digest('hex').slice(0, 12),
      sizeBytes: Number(row.size_bytes), mime: row.mime, createdAt: row.created_at,
      updatedAt: row.updated_at, version: row.version }));
  return { built, perTable, authUsers, storage, signature };
}, snapshotEvidence);

const sourceReadOnlyProven = snapshotEvidence.rejectedWriteSqlState === '25006'
  && snapshotEvidence.successfulWrites === 0;
const built = source.built;
const plan = built.plan;
const derivedPlanHash = planHash(plan, sha256);
// The journal's plan hash describes what the copy wrote. Once an operator decision withdraws some
// of those documents the two can no longer match, and pretending otherwise would either hide the
// withdrawal or fail the gate for the wrong reason. So the hash is compared only when nothing has
// been withdrawn, and otherwise the stronger set comparison below carries the check.
const withdrawnPaths = journal.withdrawnPaths;
const expectedTargetPaths = journal.expectedPathSet();
const planHashMatchesJournal = derivedPlanHash === journal.body.planHash;
const planHashDiffersByAuthorizedWithdrawal = !planHashMatchesJournal && withdrawnPaths.length > 0;

// ---- 2. journal vs plan (the production ledger) --------------------------------------------------
const plannedPaths = new Set(plan.map((entry) => entry.path));
const journalPaths = journal.body.writtenPaths;
const journalPathSet = new Set(journalPaths);
const ledgerFaults = {
  duplicateJournalPaths: journalPaths.length - journalPathSet.size,
  // Withdrawn paths are expected to be in the journal and absent from the plan; they are not faults.
  journalPathsNotInPlan: journalPaths
    .filter((path) => !plannedPaths.has(path) && !withdrawnPaths.includes(path)).length,
  plannedPathsNotInJournal: [...plannedPaths].filter((path) => !journalPathSet.has(path)).length,
  expectedPathsNotPlanned: [...expectedTargetPaths].filter((path) => !plannedPaths.has(path)).length,
  plannedPathsNotExpected: [...plannedPaths].filter((path) => !expectedTargetPaths.has(path)).length,
  withdrawnPaths: withdrawnPaths.length,
  batchDocumentSum: journal.body.completedBatches.reduce((sum, batch) => sum + batch.documents, 0),
  batchLayoutSum: journal.body.batchLayout.reduce((sum, batch) => sum + batch.documents, 0),
};
const copyDocumentCount = plan.length + withdrawnPaths.length;
const ledgerMismatches = ledgerFaults.duplicateJournalPaths + ledgerFaults.journalPathsNotInPlan
  + ledgerFaults.plannedPathsNotInJournal
  + ledgerFaults.expectedPathsNotPlanned + ledgerFaults.plannedPathsNotExpected
  + (ledgerFaults.batchDocumentSum === copyDocumentCount ? 0 : 1)
  + (ledgerFaults.batchLayoutSum === copyDocumentCount ? 0 : 1)
  + (journal.body.plannedDocumentCount === copyDocumentCount ? 0 : 1)
  + (planHashMatchesJournal || planHashDiffersByAuthorizedWithdrawal ? 0 : 1);

// ---- 3. target: read every planned document, and scan for anything else -------------------------
const reader = await openProductionReader({ projectId: PROJECT, databaseId: DATABASE });
let report;
try {
  const documents = await reader.readDocuments([...plannedPaths]);
  const collectionIds = [...new Set(plan.map((entry) => entry.path.split('/').at(-2)))];
  const scan = await reader.scanCollectionGroups(collectionIds);

  const missingDocuments = [...plannedPaths].filter((path) => !documents.has(path));
  const unexpectedDocuments = [...scan.paths].filter((path) => !plannedPaths.has(path));

  // ---- what any unexpected documents actually are -------------------------------------------------
  // "Unexpected" alone does not say whether the copy misbehaved or something was already there, and
  // that distinction decides what happens next, so it is measured rather than assumed.
  const unexpectedDetail = [];
  if (unexpectedDocuments.length) {
    const extras = await reader.readDocuments(unexpectedDocuments);
    const copyStarted = Date.parse(journal.body.startedAt);
    const plannedBusinesses = new Set(plan.filter((entry) => entry.path.startsWith('businesses/'))
      .map((entry) => entry.path.split('/')[1]));
    const plannedUsers = new Set(plan.filter((entry) => entry.path.startsWith('users/'))
      .map((entry) => entry.path.split('/')[1]));
    for (const path of unexpectedDocuments) {
      const doc = extras.get(path) ?? {};
      const created = doc.createdAt;
      const createdMs = created && typeof created === 'object'
        ? Number(created.seconds ?? created._seconds) * 1000 : null;
      const businessId = path.startsWith('businesses/') ? path.split('/')[1] : null;
      unexpectedDetail.push({
        path,
        collectionId: path.split('/').at(-2),
        transformVersion: doc.transformVersion ?? null,
        writtenByThisMigration: doc.migrationTransformVersion !== undefined
          && doc.migrationTransformVersion !== null,
        createdAt: createdMs === null ? null : new Date(createdMs).toISOString(),
        predatesCopy: createdMs === null ? null : createdMs < copyStarted,
        ownerUidShape: typeof doc.ownerUid === 'string'
          ? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doc.ownerUid)
            ? 'SUPABASE_UUID' : 'FIREBASE_UID') : 'ABSENT',
        businessIdInMigratedCorpus: businessId === null ? null : plannedBusinesses.has(businessId),
        ownerUidInMigratedCorpus: typeof doc.ownerUid === 'string' ? plannedUsers.has(doc.ownerUid) : null,
      });
    }
  }
  const unexpectedWrittenByThisMigration = unexpectedDetail.filter((item) => item.writtenByThisMigration).length;
  const unexpectedTouchingMigratedCorpus = unexpectedDetail.filter((item) =>
    item.businessIdInMigratedCorpus === true || item.ownerUidInMigratedCorpus === true).length;

  // ---- entity parity ----------------------------------------------------------------------------
  let rawMismatches = 0;
  let canonicalMismatches = 0;
  let uidMismatches = 0;
  let timestampCompared = 0;
  let timestampPrecisionLoss = 0;
  let tooLarge = 0;
  let nearLimit = 0;
  const perTable = new Map();
  const mismatchSample = [];

  for (const entry of plan) {
    const table = perTable.get(entry.sourceTable)
      ?? { expected: 0, found: 0, rawMismatches: 0, canonicalMismatches: 0 };
    table.expected += 1;
    perTable.set(entry.sourceTable, table);
    const doc = documents.get(entry.path);
    if (!doc) continue;
    table.found += 1;

    const cls = sizeClass(estimateDocumentBytes(doc));
    if (cls === 'TOO_LARGE') tooLarge += 1;
    if (cls === 'NEAR_LIMIT') nearLimit += 1;

    if (rawDocumentHash(entry.path, doc) !== entry.documentFingerprint) {
      rawMismatches += 1;
      table.rawMismatches += 1;
      if (mismatchSample.length < 5) mismatchSample.push({ path: entry.path, kind: 'RAW_HASH' });
    }

    // Derived documents have no source row to canonicalise against; the rehearsal treats them the
    // same way (rawOnly), so their raw hash is the whole of their parity.
    if (!entry.derived) {
      try {
        const canonical = canonicalFromDocument({ doc, columns: entry.columns });
        const hash = canonicalHash({ kind: entry.sourceTable, id: entry.docId, fields: canonical }).hash;
        if (hash !== entry.sourceFingerprint) {
          canonicalMismatches += 1;
          table.canonicalMismatches += 1;
          if (mismatchSample.length < 5) mismatchSample.push({ path: entry.path, kind: 'CANONICAL_HASH' });
        }
      } catch {
        canonicalMismatches += 1;
        table.canonicalMismatches += 1;
      }
    }

    if (entry.sourceTable === 'user_profiles' || entry.sourceTable === 'auth.users') {
      const uidFromPath = decodeURIComponent(entry.path.split('/').at(-1));
      if (doc.uid !== uidFromPath || doc.userId !== uidFromPath) uidMismatches += 1;
    }

    for (const column of entry.columns) {
      const field = camel(column.name);
      if (String(column.type).startsWith('timestamp') && doc[field] !== null && doc[field] !== undefined) {
        timestampCompared += 1;
        const shadow = doc[`${field}Micros`];
        const timestamp = doc[field];
        const micros = BigInt(timestamp.seconds ?? timestamp._seconds) * 1_000_000n
          + BigInt(Math.round((timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0) / 1000));
        if (shadow === undefined || BigInt(String(shadow)) !== micros) timestampPrecisionLoss += 1;
      }
    }
  }

  // ---- relationships ------------------------------------------------------------------------------
  let relationshipMismatches = 0;
  let migrationCreatedOrphans = 0;
  let crossTenantReferences = 0;
  for (const relation of built.relationships) {
    const child = documents.get(relation.childPath);
    const parent = relation.parentPath ? documents.get(relation.parentPath) : null;
    if (!child) continue;
    if (relation.sourceExisting && !parent) migrationCreatedOrphans += 1;
    if (relation.sourceExisting !== Boolean(parent)) relationshipMismatches += 1;
    if (parent) {
      const childBusiness = child.businessId ?? null;
      const parentBusiness = parent.businessId ?? null;
      if (childBusiness && parentBusiness && childBusiness !== parentBusiness) crossTenantReferences += 1;
    }
  }

  // ---- financial ----------------------------------------------------------------------------------
  const targetFinancial = [];
  let financialMismatches = 0;
  let financialValuesUncheckable = 0;
  const deltaByCurrency = new Map();
  const addDelta = (currency, units, scale) => {
    const key = currency ?? 'UNSPECIFIED';
    const current = deltaByCurrency.get(key) ?? { units: 0n, scale };
    const max = Math.max(current.scale, scale);
    deltaByCurrency.set(key, {
      units: current.units * 10n ** BigInt(max - current.scale) + units * 10n ** BigInt(max - scale),
      scale: max,
    });
  };
  for (const expected of source.built.financialValues) {
    const doc = documents.get(expected.path);
    if (!doc) { financialValuesUncheckable += 1; continue; }
    const stored = doc[camel(expected.field)];
    let units;
    let scale;
    if (stored && typeof stored === 'object' && typeof stored.unitsText === 'string') {
      units = stored.unitsText;
      scale = stored.scale;
    } else if (Number.isSafeInteger(stored)) {
      units = String(stored);
      scale = expected.field.endsWith('_minor') ? 2 : 0;
    } else {
      units = null;
      scale = null;
    }
    const match = units === expected.units && scale === expected.scale;
    if (!match) {
      financialMismatches += 1;
      // The delta is the exact arithmetic difference, not a flag: a mismatch that nets to zero is
      // still a mismatch, and one that does not should say by how much.
      if (units !== null && scale !== null) {
        const maxScale = Math.max(scale, expected.scale);
        const targetUnits = BigInt(units) * 10n ** BigInt(maxScale - scale);
        const sourceUnits = BigInt(expected.units) * 10n ** BigInt(maxScale - expected.scale);
        addDelta(expected.currency, targetUnits - sourceUnits, maxScale);
      } else {
        addDelta(expected.currency, 0n, expected.scale);
      }
    }
    targetFinancial.push({ path: expected.path, field: expected.field, units, scale,
      currency: expected.currency, match });
  }

  const digestByCurrency = (values) => {
    const groups = new Map();
    for (const item of values) {
      const currency = item.currency ?? 'UNSPECIFIED';
      if (!groups.has(currency)) groups.set(currency, []);
      groups.get(currency).push([item.path, item.field, item.units, item.scale]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, rows]) => ({
      currency, values: rows.length,
      digest: createHash('sha256').update(JSON.stringify(rows.sort())).digest('hex'),
    }));
  };
  const sourceDigests = digestByCurrency(source.built.financialValues);
  const targetDigests = digestByCurrency(targetFinancial);
  const financialDigestMismatches = sourceDigests.filter((row) =>
    targetDigests.find((other) => other.currency === row.currency)?.digest !== row.digest).length;

  // Derived trip summaries must still add up in the target: sale - cost = profit, sale - paid = due.
  const toExact = (item) => item && typeof item === 'object' && typeof item.unitsText === 'string'
    ? { units: BigInt(item.unitsText), scale: item.scale } : null;
  const align = (a, b) => {
    const scale = Math.max(a.scale, b.scale);
    return { a: a.units * 10n ** BigInt(scale - a.scale), b: b.units * 10n ** BigInt(scale - b.scale), scale };
  };
  const subtract = (a, b) => { const x = align(a, b); return { units: x.a - x.b, scale: x.scale }; };
  const equal = (a, b) => { const x = align(a, b); return x.a === x.b; };
  let derivedSummariesChecked = 0;
  let derivedSummaryMismatches = 0;
  for (const entry of plan.filter((item) => item.sourceTable === 'trips')) {
    const doc = documents.get(entry.path);
    if (!doc) continue;
    const sale = toExact(doc.salePrice);
    const cost = toExact(doc.wholesaleCost);
    const paid = toExact(doc.amountPaid);
    const due = toExact(doc.amountDue);
    const profit = toExact(doc.profit);
    if (sale && cost && profit) {
      derivedSummariesChecked += 1;
      if (!equal(subtract(sale, cost), profit)) derivedSummaryMismatches += 1;
    }
    if (sale && paid && due) {
      derivedSummariesChecked += 1;
      if (!equal(subtract(sale, paid), due)) derivedSummaryMismatches += 1;
    }
  }
  const financialDelta = [...deltaByCurrency].map(([currency, item]) => ({
    currency, units: item.units.toString(), scale: item.scale }));
  const financialDeltaIsZero = financialDelta.every((item) => item.units === '0');

  // ---- events -------------------------------------------------------------------------------------
  const EVENT_TABLES = new Set(['trip_activity_log', 'trip_financial_audit', 'trip_payment_events',
    'trip_installment_events', 'audit_logs', 'restaurant_audit_logs']);
  const eventEntries = plan.filter((entry) => EVENT_TABLES.has(entry.sourceTable));
  let eventMissing = 0;
  let eventOrderingMismatches = 0;
  let eventAmountMismatches = 0;
  for (const entry of eventEntries) {
    const doc = documents.get(entry.path);
    if (!doc) { eventMissing += 1; continue; }
    if (entry.sourcePk.length === 1 && /^\d+$/.test(entry.sourcePk[0])
      && doc.sequence !== undefined && String(doc.sequence) !== entry.sourcePk[0]) {
      eventOrderingMismatches += 1;
    }
    if (targetFinancial.some((item) => item.path === entry.path && !item.match)) eventAmountMismatches += 1;
  }

  // ---- untouched surfaces -------------------------------------------------------------------------
  const sdk = process.env.GCLOUD_SDK_ROOT
    ?? join(process.env.LOCALAPPDATA ?? '', 'Google/Cloud SDK/google-cloud-sdk');
  const gcloud = (args) => execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
    [join(sdk, 'lib/gcloud.py'), ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
  const operatorToken = gcloud(['auth', 'print-access-token']);
  const authResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    { method: 'POST', headers: { Authorization: `Bearer ${operatorToken}`,
      'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUserInfo: false }) });
  const authBody = await authResponse.json();
  const firebaseAuthAccounts = Number(authBody.recordsCount ?? 0);

  // What Firebase Auth should hold depends on whether the import stage has run. Before it, zero.
  // After it, exactly the accounts the ledger authorized — no more, and none of the excluded ones.
  // Hardcoding zero was right only while the import had not happened, and leaving it that way would
  // have turned a successful import into a reconciliation failure.
  const authPlanPath = 'migration/firestore/config/production-auth-ledger-plan.json';
  const authImportPath = 'migration/reports/firestore-production-auth-import.json';
  const authPlan = existsSync(authPlanPath) ? JSON.parse(readFileSync(authPlanPath, 'utf8')) : null;
  const authImport = existsSync(authImportPath) ? JSON.parse(readFileSync(authImportPath, 'utf8')) : null;
  const authImportCompleted = authImport?.decision === 'AUTH_IMPORT_GO';
  const expectedAuthAccounts = authImportCompleted ? (authPlan?.toImport ?? 0) : 0;

  const preflight = JSON.parse(readFileSync('migration/reports/pre-bulk-preflight.json', 'utf8'));
  const baselineByTable = new Map(preflight.live.perTable.map((row) => [row.table, row.rows]));
  const sourceRowDrift = source.perTable.filter((row) => baselineByTable.get(row.table) !== row.rows)
    .map((row) => ({ table: row.table, before: baselineByTable.get(row.table) ?? null, after: row.rows }));
  const baselineStorage = new Map(preflight.live.storage.map((row) => [row.bucket, row]));
  const storageDrift = source.storage.filter((row) => {
    const before = baselineStorage.get(row.bucket);
    return !before || before.objects !== row.objects || before.bytes !== row.bytes;
  }).map((row) => ({ bucket: row.bucket, before: baselineStorage.get(row.bucket) ?? null,
    after: { objects: row.objects, bytes: row.bytes } }));

  const rlsAudit = JSON.parse(readFileSync('migration/reports/storage-rls-audit.json', 'utf8'));
  const signatureBaseline = (rlsAudit.objects ?? []).filter((object) =>
    object.bucket === 'business-signatures' && object.pathPrefix === CUSTOMER_SIGNATURE_OWNER);
  const signatureNow = source.signature;
  const signatureUnchanged = signatureBaseline.length === signatureNow.length
    && signatureBaseline.every((before) => signatureNow.some((after) =>
      after.nameHash === before.nameHash && after.sizeBytes === before.sizeBytes
      && Date.parse(after.createdAt) === Date.parse(before.createdAt)));

  // ---- verdict -------------------------------------------------------------------------------------
  const levels = {
    journalIntegrity: journalFaults.length === 0 ? 'PASS' : 'FAIL',
    sourceSnapshotReadOnly: sourceReadOnlyProven ? 'PASS' : 'FAIL',
    // Either the plan is byte-identical to the copy's, or it differs by exactly the withdrawals and
    // the surviving sets agree document for document. Nothing else passes.
    planStability: planHashMatchesJournal
      || (planHashDiffersByAuthorizedWithdrawal && ledgerFaults.expectedPathsNotPlanned === 0
        && ledgerFaults.plannedPathsNotExpected === 0) ? 'PASS' : 'FAIL',
    sourceCoverage: built.counts.sourceRows === 1474 && built.counts.migratableRows === 1466
      && built.counts.excludedRows === 8
      && built.counts.plannedDocuments === EXPECTED_PLANNED_DOCUMENTS ? 'PASS' : 'FAIL',
    targetCoverage: missingDocuments.length === 0 && unexpectedDocuments.length === 0 ? 'PASS' : 'FAIL',
    entityCanonicalParity: rawMismatches === 0 && canonicalMismatches === 0 ? 'PASS' : 'FAIL',
    relationshipParity: relationshipMismatches === 0 && migrationCreatedOrphans === 0
      && crossTenantReferences === 0 && built.sourceOrphans === 0 ? 'PASS' : 'FAIL',
    financialParity: financialMismatches === 0 && financialDigestMismatches === 0
      && derivedSummaryMismatches === 0 && financialValuesUncheckable === 0
      && financialDeltaIsZero ? 'PASS' : 'FAIL',
    userOwnershipParity: uidMismatches === 0 && crossTenantReferences === 0 ? 'PASS' : 'FAIL',
    eventParity: eventMissing === 0 && eventOrderingMismatches === 0
      && eventAmountMismatches === 0 ? 'PASS' : 'FAIL',
    timestampParity: timestampPrecisionLoss === 0 ? 'PASS' : 'FAIL',
    documentSizeValidity: tooLarge === 0 ? 'PASS' : 'FAIL',
    migrationLedger: ledgerMismatches === 0 ? 'PASS' : 'FAIL',
    authStateAsAuthorized: firebaseAuthAccounts === expectedAuthAccounts ? 'PASS' : 'FAIL',
    storageUntouched: storageDrift.length === 0 ? 'PASS' : 'FAIL',
    sourceUntouched: sourceRowDrift.length === 0 && source.authUsers === preflight.live.authUsers
      ? 'PASS' : 'FAIL',
    customerSignatureUnchanged: signatureUnchanged ? 'PASS' : 'FAIL',
  };
  const passed = Object.values(levels).every((outcome) => outcome === 'PASS');

  report = {
    generatedAt: new Date().toISOString(),
    artifact: 'firestore-production-reconciliation',
    migrationRunId: journal.body.migrationRunId,
    journal: journalPath,
    projectId: PROJECT,
    firestoreDatabaseId: DATABASE,
    readIdentity: reader.identity,
    status: passed ? 'RECONCILED' : 'MISMATCH',
    levels,
    journalChecks: { ...journalChecks, faults: journalFaults,
      planHashJournal: journal.body.planHash, planHashDerived: derivedPlanHash,
      planHashMatches: planHashMatchesJournal,
      planHashDiffersByAuthorizedWithdrawal,
      authorizedWithdrawals: journal.body.authorizedWithdrawals ?? [],
      copyDocumentCount, expectedTargetDocuments: expectedTargetPaths.size,
      ...ledgerFaults, ledgerMismatches },
    snapshot: {
      isolationLevel: snapshotEvidence.start?.isolation ?? null,
      readOnly: snapshotEvidence.start?.read_only ?? null,
      rejectedWriteSqlState: snapshotEvidence.rejectedWriteSqlState,
      successfulWrites: snapshotEvidence.successfulWrites,
      transactionOutcome: snapshotEvidence.transactionOutcome,
    },
    coverage: {
      sourceRowsAccounted: built.counts.sourceRows,
      migratedRows: built.counts.migratableRows,
      excludedRows: built.counts.excludedRows,
      firestoreDocuments: built.counts.plannedDocuments,
      documentsFoundInTarget: documents.size,
      documentsScannedInTarget: scan.paths.size,
      missingDocuments: missingDocuments.length,
      unexpectedDocuments: unexpectedDocuments.length,
      rawHashMismatches: rawMismatches,
      canonicalHashMismatches: canonicalMismatches,
      missingSample: missingDocuments.slice(0, 5),
      unexpectedSample: unexpectedDocuments.slice(0, 5),
      unexpectedDetail,
      unexpectedWrittenByThisMigration,
      unexpectedTouchingMigratedCorpus,
      mismatchSample,
      perCollectionScan: scan.perCollection,
    },
    ids: { uidMismatches },
    relationships: { checked: built.relationships.length, relationshipMismatches,
      migrationCreatedOrphans, crossTenantReferences, sourceOrphans: built.sourceOrphans },
    financial: {
      valuesDerivedFromSource: source.built.financialValues.length,
      valuesChecked: targetFinancial.length,
      valuesUncheckable: financialValuesUncheckable,
      currencies: sourceDigests.map((row) => row.currency),
      perValueMismatches: financialMismatches,
      perCurrencySourceDigests: sourceDigests,
      perCurrencyTargetDigests: targetDigests,
      digestMismatches: financialDigestMismatches,
      derivedSummariesChecked, derivedSummaryMismatches,
      delta: financialDelta.length ? financialDelta : [{ currency: 'ALL', units: '0', scale: 0 }],
      deltaIsZero: financialDeltaIsZero,
    },
    events: { events: eventEntries.length, missing: eventMissing,
      orderingMismatches: eventOrderingMismatches, amountMismatches: eventAmountMismatches },
    timestamps: { compared: timestampCompared, precisionLossCases: timestampPrecisionLoss },
    size: { nearLimit, tooLarge },
    untouched: {
      firebaseAuthAccounts,
      expectedFirebaseAuthAccounts: expectedAuthAccounts,
      authImportStageCompleted: authImportCompleted,
      authAccountsExcludedByOperator: authPlan?.excludedByOperator ?? 0,
      supabaseStorageObjects: source.storage,
      supabaseStorageDrift: storageDrift,
      supabaseAuthUsers: source.authUsers,
      supabaseSourceRowDrift: sourceRowDrift,
      customerSignature: { owner: CUSTOMER_SIGNATURE_OWNER, objects: signatureNow,
        baselineObjects: signatureBaseline.length, unchanged: signatureUnchanged },
      bytesDownloadedFromStorage: 0,
    },
    mutationsPerformedByThisTool: {
      firestoreWrites: 0, authImports: 0, storageMutations: 0, sourceMutations: 0,
      journalStatusUpdate: passed && markJournal ? 'RECONCILED' : 'NONE',
    },
    perTable: Object.fromEntries([...perTable].sort(([a], [b]) => a.localeCompare(b))),
  };

  if (markJournal) journal.markReconciled(passed);
  const gate = bulkCopyGate(journal);
  report.journalStatusAfter = journal.status;
  report.bulkCopyGo = gate.bulkCopyGo;
  report.nextStage = gate.nextStage;

  writeReport(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await reader.close();
} catch (error) {
  await reader.close().catch(() => undefined);
  throw error;
}

console.log(JSON.stringify({
  reconciliation: report.status === 'RECONCILED' ? 'PASS' : 'FAIL',
  levels: report.levels,
  coverage: report.coverage,
  ids: report.ids,
  relationships: report.relationships,
  financial: { valuesChecked: report.financial.valuesChecked,
    valuesDerivedFromSource: report.financial.valuesDerivedFromSource,
    perValueMismatches: report.financial.perValueMismatches,
    digestMismatches: report.financial.digestMismatches,
    derivedSummaryMismatches: report.financial.derivedSummaryMismatches,
    delta: report.financial.delta },
  events: report.events,
  timestamps: report.timestamps,
  ledgerMismatches: report.journalChecks.ledgerMismatches,
  unexpectedProvenance: { total: report.coverage.unexpectedDocuments,
    writtenByThisMigration: report.coverage.unexpectedWrittenByThisMigration,
    touchingMigratedCorpus: report.coverage.unexpectedTouchingMigratedCorpus,
    collections: [...new Set(report.coverage.unexpectedDetail.map((item) => item.collectionId))].sort(),
    allPredateCopy: report.coverage.unexpectedDetail.every((item) => item.predatesCopy !== false) },
  untouched: { firebaseAuthAccounts: report.untouched.firebaseAuthAccounts,
    supabaseStorageDrift: report.untouched.supabaseStorageDrift.length,
    supabaseSourceRowDrift: report.untouched.supabaseSourceRowDrift.length,
    customerSignatureUnchanged: report.untouched.customerSignature.unchanged },
  journalStatus: report.journalStatusAfter,
  bulkCopyGo: report.bulkCopyGo,
  report: REPORT_PATH,
}, null, 2));
process.exitCode = report.status === 'RECONCILED' ? 0 : 1;
