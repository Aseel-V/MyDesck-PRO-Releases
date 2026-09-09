#!/usr/bin/env node
/**
 * Migrate the synthetic slice into Firestore.
 *
 * Reads the payload export (never the live source), transforms each row, writes
 * it under a deterministic document id, and records the outcome in the ledger.
 *
 * Restartable by construction: a row already VERIFIED in the ledger for this
 * transform version is skipped, and every write is a `set` on a deterministic
 * id, so rerunning converges rather than duplicating.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node migration/firestore/tools/migrate-synthetic.mjs --target emulator
 */

import { readFileSync } from 'node:fs';
import { canonicalHash } from '../lib/canonical.mjs';
import { transformRow, camel } from '../lib/transform.mjs';
import { ENTITIES, ENTITY_ORDER, TRANSFORM_VERSION } from '../lib/entities.mjs';
import { MigrationLedger, LEDGER_STATES } from '../lib/ledger.mjs';
import { openTarget } from '../lib/firestore-target.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const PAYLOAD_PATH = 'migration/firestore/export.local/synthetic-payloads.json';
const LEDGER_PATH = 'migration/firestore/export.local/migration-ledger.json';
const INVENTORY_PATH = 'migration/reports/firestore-source-domain-inventory.json';

const targetMode = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1] : null;
const force = process.argv.includes('--force');

const payload = JSON.parse(readFileSync(PAYLOAD_PATH, 'utf8'));
const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
const columnsByTable = new Map(inventory.tables.map((t) => [t.name, t.columns]));

// Refuse to migrate anything that is not the approved synthetic slice. This
// tool writes; a wrong input here is not a bad report, it is bad data.
if (!payload.authUsers.every((u) => String(u.email).startsWith('migration-test--'))) {
  throw new Error('PAYLOAD_CONTAINS_NON_SYNTHETIC_IDENTITY');
}
if (payload.realCustomerRowsExported !== 0) throw new Error('PAYLOAD_CONTAINS_CUSTOMER_ROWS');

const target = await openTarget(targetMode);
const ledger = new MigrationLedger(LEDGER_PATH, { transformVersion: TRANSFORM_VERSION });

// Denormalisation context: the owner/business correspondence every child
// document needs, built once from the parent tables.
const businessByOwner = new Map();
const ownerByBusiness = new Map();
for (const row of payload.tables.business_profiles?.rows ?? []) {
  businessByOwner.set(row.user_id, row.id);
  ownerByBusiness.set(row.id, row.user_id);
}
const ctx = { businessByOwner, ownerByBusiness, Timestamp: target.Timestamp };

const results = [];
const allWarnings = [];
let written = 0;
let skipped = 0;
let failed = 0;

for (const table of ENTITY_ORDER) {
  const entity = ENTITIES[table];
  const source = payload.tables[table];
  if (!source) {
    results.push({ table, status: 'ABSENT_FROM_EXPORT', rows: 0 });
    continue;
  }
  const columns = columnsByTable.get(table);
  if (!columns) throw new Error(`NO_INVENTORY_COLUMNS: ${table}`);

  // Columns the exporter deliberately excluded must not be silently dropped:
  // migrating a row while unaware that a column existed is exactly the kind of
  // quiet loss this milestone is meant to make impossible.
  const exported = new Set(source.columns.map((c) => c.name));
  const missing = columns.map((c) => c.name).filter((name) => !exported.has(name));
  if (missing.length) {
    results.push({ table, status: 'BLOCKED_MISSING_COLUMNS', rows: 0, missing });
    failed += 1;
    continue;
  }

  const collection = target.collection(entity.collection);
  let tableWritten = 0;
  let tableSkipped = 0;

  for (const row of source.rows) {
    const sourcePk = entity.sourcePrimaryKey.map((c) => String(row[c]));
    const docId = entity.docId(row);
    const targetPath = `${target.collectionName(entity.collection)}/${docId}`;

    if (!force && ledger.isVerified(table, sourcePk)) {
      tableSkipped += 1;
      skipped += 1;
      continue;
    }

    try {
      const extraFields = entity.extra(row, ctx);
      const { data, canonicalSource, warnings } = transformRow({
        row, columns, kind: entity.collection, docId, extraFields, ctx });

      // The invariant behind the denormalised isDeleted flag, asserted rather
      // than assumed: it must agree with the timestamp it summarises.
      const deletedAt = row.deleted_at ?? null;
      if (extraFields.isDeleted !== (deletedAt !== null)) {
        throw new Error('IS_DELETED_DISAGREES_WITH_DELETED_AT');
      }
      // Ownership is the security field. A document whose ownerUid does not
      // come from the source owner column would be a silent tenant change.
      if (entity.ownerField && extraFields.ownerUid !== row[entity.ownerField]) {
        throw new Error('OWNER_UID_DOES_NOT_MATCH_SOURCE');
      }

      const sourceHash = canonicalHash({
        kind: entity.collection, id: docId, fields: canonicalSource }).hash;

      await collection.doc(docId).set(data);

      ledger.record({ sourceTable: table, sourcePk, targetPath, sourceHash,
        state: LEDGER_STATES.COPIED });
      if (warnings.length) allWarnings.push({ table, docId, warnings });
      tableWritten += 1;
      written += 1;
    } catch (error) {
      ledger.record({ sourceTable: table, sourcePk, targetPath,
        state: LEDGER_STATES.FAILED, error: error.code ?? error.message });
      failed += 1;
    }
  }

  results.push({ table, collection: target.collectionName(entity.collection),
    status: 'MIGRATED', sourceRows: source.rows.length,
    written: tableWritten, skippedAlreadyVerified: tableSkipped });
}

ledger.save();
await target.close();

const report = {
  generatedAt: new Date().toISOString(),
  status: failed === 0 ? 'MIGRATED' : 'FAILED',
  targetMode: target.mode,
  targetProject: target.projectId,
  transformVersion: TRANSFORM_VERSION,
  sourceWrites: 0,
  existingProductionCustomerChanges: 0,
  documentsWritten: written,
  skippedAlreadyVerified: skipped,
  failures: failed,
  warnings: allWarnings,
  ledger: ledger.summary(),
  tables: results,
};
writeReport('migration/reports/firestore-synthetic-migration.json',
  JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  status: report.status, targetMode: report.targetMode, targetProject: report.targetProject,
  documentsWritten: written, skipped, failures: failed,
  warnings: allWarnings.length,
  tables: results,
}, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
