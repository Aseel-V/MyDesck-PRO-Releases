#!/usr/bin/env node
/**
 * Reconcile the migrated slice against the source export.
 *
 * The comparison is deliberately arranged so a bug in the writer cannot hide
 * itself: the SOURCE side is canonicalised from the exported PostgreSQL text
 * and never touches Firestore, the TARGET side is canonicalised from documents
 * read back out of Firestore, and the two are compared. Nothing is compared
 * against the in-memory value the migrator happened to build.
 *
 * Levels:
 *   1 source coverage      every source row has a target document
 *   2 target coverage      every target document traces to a source row
 *   3 entity parity        canonical source == canonical target, field by field
 *   4 relationship parity  every declared reference resolves; zero orphans
 *   5 financial parity     exact totals, and reverse conversion to source text
 *   6 user parity          UID preserved, ownership correct, no cross-tenant leak
 *   7 file parity          storage; reported by the storage manifest tool
 *   8 behavioural parity   application workflows; a later milestone
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node migration/firestore/tools/reconcile.mjs --target emulator
 */

import { readFileSync } from 'node:fs';
import {
  canonicalHash, diffCanonicalFields, encode, cDecimal,
} from '../lib/canonical.mjs';
import {
  canonicalFromSource, canonicalFromDocument, canonicalTypeFor, camel,
} from '../lib/transform.mjs';
import {
  moneyFromDecimalString, moneyFromMinorUnits, sumExactMoney, scaledIntegerToDecimalString,
} from '../lib/exact-decimal.mjs';
import { ENTITIES, ENTITY_ORDER, FINANCIAL_FIELDS, MINOR_UNIT_SCALE } from '../lib/entities.mjs';
import { MigrationLedger, LEDGER_STATES } from '../lib/ledger.mjs';
import { openTarget } from '../lib/firestore-target.mjs';
import { TRANSFORM_VERSION } from '../lib/table-map.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const PAYLOAD_PATH = 'migration/firestore/export.local/synthetic-payloads.json';
const LEDGER_PATH = 'migration/firestore/export.local/migration-ledger.json';
const INVENTORY_PATH = 'migration/reports/firestore-source-domain-inventory.json';

const targetMode = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1] : null;
const quiet = process.argv.includes('--quiet');

const payload = JSON.parse(readFileSync(PAYLOAD_PATH, 'utf8'));
const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
const columnsByTable = new Map(inventory.tables.map((t) => [t.name, t.columns]));
const ledger = new MigrationLedger(LEDGER_PATH, { transformVersion: TRANSFORM_VERSION });
const target = await openTarget(targetMode);

const findings = [];
const finding = (level, code, detail) => findings.push({ level, code, ...detail });

// ---------------------------------------------------------------------------
// Read the target back
// ---------------------------------------------------------------------------

const targetDocs = new Map(); // collection -> Map(docId -> data)
for (const table of ENTITY_ORDER) {
  const entity = ENTITIES[table];
  if (targetDocs.has(entity.collection)) continue;
  const snapshot = await target.collection(entity.collection).get();
  targetDocs.set(entity.collection, new Map(snapshot.docs.map((d) => [d.id, d.data()])));
}

// ---------------------------------------------------------------------------
// Levels 1-3: coverage and entity parity
// ---------------------------------------------------------------------------

const perTable = [];
let sourceRowsChecked = 0;
let hashMismatches = 0;
let missingDocuments = 0;
const seenTargetIds = new Map();

for (const table of ENTITY_ORDER) {
  const entity = ENTITIES[table];
  const source = payload.tables[table];
  if (!source) continue;
  const columns = columnsByTable.get(table);
  const docs = targetDocs.get(entity.collection);
  seenTargetIds.set(entity.collection, seenTargetIds.get(entity.collection) ?? new Set());
  const seen = seenTargetIds.get(entity.collection);

  let missing = 0;
  let mismatched = 0;

  for (const row of source.rows) {
    sourceRowsChecked += 1;
    const docId = entity.docId(row);
    seen.add(docId);

    const sourcePk = entity.sourcePrimaryKey.map((c) => String(row[c]));
    const doc = docs.get(docId);
    if (!doc) {
      missing += 1;
      missingDocuments += 1;
      finding(1, 'MISSING_TARGET_DOCUMENT',
        { table, collection: entity.collection, docId });
      ledger.record({ sourceTable: table, sourcePk,
        targetPath: `${entity.collection}/${docId}`,
        state: LEDGER_STATES.FAILED, error: 'MISSING_TARGET_DOCUMENT' });
      continue;
    }

    // Level 3. Both sides are built independently from the same field list.
    const canonicalSource = {};
    for (const column of columns) {
      canonicalSource[camel(column.name)] = canonicalFromSource(
        row[column.name], canonicalTypeFor(column.type, column.udt));
    }

    // A document that cannot even be read back into canonical form is a
    // mismatch, not a crash. One corrupt document must not stop the run and
    // leave the remaining rows unchecked.
    let canonicalTarget;
    try {
      canonicalTarget = canonicalFromDocument({ doc, columns });
    } catch (error) {
      mismatched += 1;
      hashMismatches += 1;
      finding(3, 'TARGET_DOCUMENT_UNREADABLE',
        { table, docId, reason: error.code ?? error.message });
      ledger.record({ sourceTable: table, sourcePk,
        targetPath: `${entity.collection}/${docId}`,
        state: LEDGER_STATES.FAILED, error: 'TARGET_DOCUMENT_UNREADABLE' });
      continue;
    }

    const sourceHash = canonicalHash({ kind: entity.collection, id: docId,
      fields: canonicalSource }).hash;
    const targetHash = canonicalHash({ kind: entity.collection, id: docId,
      fields: canonicalTarget }).hash;

    if (sourceHash !== targetHash) {
      mismatched += 1;
      hashMismatches += 1;
      finding(3, 'ENTITY_HASH_MISMATCH', { table, docId,
        fields: diffCanonicalFields(canonicalSource, canonicalTarget)
          .map((d) => d.field) });
      // A row that failed parity must not stay VERIFIED from an earlier run,
      // or a resumed migration would skip the very row that is wrong.
      ledger.record({ sourceTable: table, sourcePk, targetPath: `${entity.collection}/${docId}`,
        sourceHash, targetHash, state: LEDGER_STATES.FAILED, error: 'ENTITY_HASH_MISMATCH' });
    } else {
      // Promotion to VERIFIED is what makes the migration restartable: a rerun
      // reads this and skips the row instead of rewriting it.
      ledger.record({ sourceTable: table, sourcePk, targetPath: `${entity.collection}/${docId}`,
        sourceHash, targetHash, state: LEDGER_STATES.VERIFIED });
    }
  }

  // Level 2: anything in the collection that no source row produced.
  const unexpected = [...docs.keys()].filter((id) => !seen.has(id));
  for (const docId of unexpected) {
    finding(2, 'UNEXPECTED_TARGET_DOCUMENT', { collection: entity.collection, docId });
  }

  perTable.push({ table, collection: entity.collection, sourceRows: source.rows.length,
    targetDocuments: docs.size, missing, mismatched, unexpected: unexpected.length });
}

// ---------------------------------------------------------------------------
// Level 4: relationships and orphans
// ---------------------------------------------------------------------------

let referencesChecked = 0;
let orphans = 0;
const relationshipDetail = [];

for (const table of ENTITY_ORDER) {
  const entity = ENTITIES[table];
  const source = payload.tables[table];
  if (!source || entity.references.length === 0) continue;

  for (const reference of entity.references) {
    const parents = targetDocs.get(reference.collection)
      ?? new Map((await target.collection(reference.collection).get())
        .docs.map((d) => [d.id, d.data()]));
    targetDocs.set(reference.collection, parents);

    let checked = 0;
    let broken = 0;
    for (const row of source.rows) {
      const value = row[reference.field];
      if (value === null || value === undefined) {
        if (reference.required) {
          broken += 1;
          orphans += 1;
          finding(4, 'REQUIRED_REFERENCE_IS_NULL',
            { table, field: reference.field, docId: entity.docId(row) });
        }
        continue;
      }
      checked += 1;
      referencesChecked += 1;
      if (!parents.has(String(value))) {
        broken += 1;
        orphans += 1;
        finding(4, 'ORPHANED_REFERENCE', { table, field: reference.field,
          docId: entity.docId(row), missingParent: `${reference.collection}/${value}` });
      }
    }
    relationshipDetail.push({ table, field: reference.field,
      parent: reference.collection, checked, broken,
      ...(reference.note ? { note: reference.note } : {}) });
  }
}

// ---------------------------------------------------------------------------
// Level 5: financial parity
// ---------------------------------------------------------------------------

const financial = [];
let financialValuesChecked = 0;
let reverseConversionMismatches = 0;
let unexplainedDelta = 0;

for (const [collection, fields] of Object.entries(FINANCIAL_FIELDS)) {
  const table = ENTITY_ORDER.find((name) => ENTITIES[name].collection === collection);
  const source = payload.tables[table];
  if (!source) continue;
  const docs = targetDocs.get(collection);

  for (const field of fields) {
    const column = camel(field) === field
      ? Object.keys(source.rows[0] ?? {}).find((c) => camel(c) === field) : field;
    if (!column) continue;

    // Minor-unit columns are BIGINT at the application's scale-2 convention;
    // everything else carries the scale the value itself was written with.
    const isMinor = column.endsWith('_minor');
    const byCurrency = new Map();
    let checked = 0;
    let mismatched = 0;

    for (const row of source.rows) {
      const raw = row[column];
      if (raw === null || raw === undefined) continue;
      const docId = ENTITIES[table].docId(row);
      const doc = docs.get(docId);
      if (!doc) continue;

      // The currency for a trip's own amounts is the trip currency; plans and
      // installments carry it, and installments inherit it from their plan.
      const currency = row.currency
        ?? doc.currency
        ?? payload.tables.trip_payment_plans?.rows.find(
          (p) => p.id === row.payment_plan_id)?.currency
        ?? 'ILS';

      const sourceMoney = isMinor
        ? moneyFromMinorUnits(String(raw), { currency, scale: MINOR_UNIT_SCALE })
        : moneyFromDecimalString(String(raw),
          { currency, scale: String(raw).includes('.') ? String(raw).split('.')[1].length : 0 });

      const stored = doc[field];
      checked += 1;
      financialValuesChecked += 1;

      // Reverse conversion: the stored representation must reproduce the exact
      // source text, with no epsilon and no rounding.
      let storedText;
      try {
        storedText = isMinor
          ? String(stored)
          : scaledIntegerToDecimalString(BigInt(stored.unitsText), stored.scale);
      } catch (error) {
        mismatched += 1;
        reverseConversionMismatches += 1;
        finding(5, 'STORED_AMOUNT_UNREADABLE',
          { collection, docId, field, reason: error.code ?? error.message });
        continue;
      }
      const expectedText = isMinor ? String(raw) : String(raw);
      if (storedText !== expectedText) {
        mismatched += 1;
        reverseConversionMismatches += 1;
        finding(5, 'REVERSE_CONVERSION_MISMATCH',
          { collection, docId, field, source: expectedText, target: storedText });
        continue;
      }

      const bucket = byCurrency.get(currency) ?? { source: [], target: [] };
      bucket.source.push(sourceMoney);
      bucket.target.push(isMinor
        ? moneyFromMinorUnits(String(stored), { currency, scale: MINOR_UNIT_SCALE })
        : moneyFromDecimalString(storedText,
          { currency, scale: stored.scale }));
      byCurrency.set(currency, bucket);
    }

    for (const [currency, bucket] of byCurrency) {
      const sourceTotal = sumExactMoney(bucket.source);
      const targetTotal = sumExactMoney(bucket.target);
      const sourceText = sourceTotal?.decimal ?? null;
      const targetText = targetTotal?.decimal ?? null;
      // Exact string equality of the scaled totals. No tolerance.
      const equal = sourceTotal === null
        ? targetTotal === null
        : targetTotal !== null && sourceTotal.unitsText === targetTotal.unitsText
          && sourceTotal.scale === targetTotal.scale;
      if (!equal) {
        unexplainedDelta += 1;
        finding(5, 'FINANCIAL_TOTAL_MISMATCH',
          { collection, field, currency, source: sourceText, target: targetText });
      }
      financial.push({ collection, field, currency, values: bucket.source.length,
        sourceTotal: sourceText, targetTotal: targetText, match: equal });
    }
    if (checked && !byCurrency.size) {
      financial.push({ collection, field, currency: null, values: checked,
        sourceTotal: null, targetTotal: null, match: mismatched === 0 });
    }
  }
}

// ---------------------------------------------------------------------------
// Level 6: user and ownership parity
// ---------------------------------------------------------------------------

let uidMismatches = 0;
let ownershipMismatches = 0;
let crossTenantDocuments = 0;
const approvedUids = new Set(payload.approvedUids);

for (const authUser of payload.authUsers) {
  const doc = targetDocs.get('users')?.get(authUser.id);
  if (!doc) {
    uidMismatches += 1;
    finding(6, 'MIGRATED_USER_DOCUMENT_MISSING', { uid: authUser.id });
    continue;
  }
  // The document id, the uid field and the source auth id must all be the
  // same value. Two of three agreeing is not identity preservation.
  if (doc.uid !== authUser.id || doc.userId !== authUser.id) {
    uidMismatches += 1;
    finding(6, 'UID_NOT_PRESERVED',
      { uid: authUser.id, docUid: doc.uid ?? null, docUserId: doc.userId ?? null });
  }
}

for (const table of ENTITY_ORDER) {
  const entity = ENTITIES[table];
  const source = payload.tables[table];
  if (!source || !entity.ownerField) continue;
  const docs = targetDocs.get(entity.collection);
  for (const row of source.rows) {
    const doc = docs.get(entity.docId(row));
    if (!doc) continue;
    if (doc.ownerUid !== row[entity.ownerField]) {
      ownershipMismatches += 1;
      finding(6, 'OWNERSHIP_MISMATCH', { table, docId: entity.docId(row),
        expected: row[entity.ownerField], actual: doc.ownerUid ?? null });
    }
    if (doc.ownerUid !== null && doc.ownerUid !== undefined && !approvedUids.has(doc.ownerUid)) {
      crossTenantDocuments += 1;
      finding(6, 'DOCUMENT_OUTSIDE_APPROVED_SLICE',
        { table, docId: entity.docId(row), ownerUid: doc.ownerUid });
    }
  }
}

// ---------------------------------------------------------------------------
// Event ordering
// ---------------------------------------------------------------------------

let eventsChecked = 0;
let orderingMismatches = 0;
const eventDetail = [];

for (const table of ENTITY_ORDER) {
  const entity = ENTITIES[table];
  if (!entity.ordering) continue;
  const source = payload.tables[table];
  if (!source) continue;
  const docs = targetDocs.get(entity.collection);

  const byParent = new Map();
  for (const row of source.rows) {
    const parent = String(row[entity.ordering.parentField]);
    (byParent.get(parent) ?? byParent.set(parent, []).get(parent)).push(row);
  }

  let parents = 0;
  for (const [parent, rows] of byParent) {
    parents += 1;
    // Source order is the identity key, which is the order events happened.
    const sourceOrder = [...rows]
      .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
      .map((r) => String(r.id));
    // Target order comes from the ordering FIELD, not document-id order, since
    // Firestore orders ids lexically and "10" would sort before "9".
    const targetOrder = sourceOrder
      .map((id) => ({ id, doc: docs.get(entity.docId({ id })) }))
      .filter((x) => x.doc)
      .sort((a, b) => a.doc[entity.ordering.sequenceField] - b.doc[entity.ordering.sequenceField])
      .map((x) => x.id);

    eventsChecked += rows.length;
    if (sourceOrder.join(',') !== targetOrder.join(',')) {
      orderingMismatches += 1;
      finding(0, 'EVENT_ORDER_MISMATCH', { table, parent });
    }
    for (const row of rows) {
      const doc = docs.get(entity.docId(row));
      if (doc && String(doc[entity.ordering.sequenceField]) !== String(row.id)) {
        orderingMismatches += 1;
        finding(0, 'EVENT_SEQUENCE_MISMATCH', { table, id: String(row.id) });
      }
    }
  }
  eventDetail.push({ table, parents, events: source.rows.length });
}

await target.close();
ledger.save();

// ---------------------------------------------------------------------------

const totals = {
  sourceRowsChecked,
  targetDocuments: [...targetDocs.values()].reduce((n, m) => n + m.size, 0),
  missingDocuments,
  unexpectedDocuments: findings.filter((f) => f.code === 'UNEXPECTED_TARGET_DOCUMENT').length,
  hashMismatches,
  referencesChecked,
  orphans,
  financialValuesChecked,
  reverseConversionMismatches,
  unexplainedFinancialDelta: unexplainedDelta,
  eventsChecked,
  eventOrderingMismatches: orderingMismatches,
  uidMismatches,
  ownershipMismatches,
  crossTenantDocuments,
};

const pass = missingDocuments === 0 && totals.unexpectedDocuments === 0
  && hashMismatches === 0 && orphans === 0 && reverseConversionMismatches === 0
  && unexplainedDelta === 0 && orderingMismatches === 0 && uidMismatches === 0
  && ownershipMismatches === 0 && crossTenantDocuments === 0;

const report = {
  generatedAt: new Date().toISOString(),
  status: pass ? 'RECONCILED' : 'MISMATCH',
  targetMode: target.mode,
  targetProject: target.projectId,
  transformVersion: TRANSFORM_VERSION,
  levels: {
    '1_source_coverage': missingDocuments === 0 ? 'PASS' : 'FAIL',
    '2_target_coverage': totals.unexpectedDocuments === 0 ? 'PASS' : 'FAIL',
    '3_entity_parity': hashMismatches === 0 ? 'PASS' : 'FAIL',
    '4_relationship_parity': orphans === 0 ? 'PASS' : 'FAIL',
    '5_financial_parity':
      reverseConversionMismatches === 0 && unexplainedDelta === 0 ? 'PASS' : 'FAIL',
    '6_user_parity':
      uidMismatches === 0 && ownershipMismatches === 0 && crossTenantDocuments === 0
        ? 'PASS' : 'FAIL',
    '7_file_parity': 'SEE migration/reports/firestore-storage-manifest.json',
    '8_behavioural_parity': 'NOT RUN — application layer, later milestone',
  },
  totals,
  perTable,
  relationships: relationshipDetail,
  financial,
  events: eventDetail,
  ledger: ledger.summary(),
  findings,
};
writeReport('migration/reports/firestore-reconciliation.json',
  JSON.stringify(report, null, 2) + '\n');

if (!quiet) {
  console.log(JSON.stringify({
    status: report.status, levels: report.levels, totals,
    findings: findings.slice(0, 20),
  }, null, 2));
}
process.exitCode = pass ? 0 : 1;
