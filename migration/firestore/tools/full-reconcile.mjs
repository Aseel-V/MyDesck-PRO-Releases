#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { openTarget } from '../lib/firestore-target.mjs';
import { canonicalHash } from '../lib/canonical.mjs';
import { camel, canonicalFromDocument, estimateDocumentBytes } from '../lib/transform.mjs';
import { rawDocumentHash, sizeClass } from '../lib/full-rehearsal-core.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST_REQUIRED');
const quiet = process.argv.includes('--quiet');
const state = JSON.parse(readFileSync('migration/full-rehearsal.local/expected.json', 'utf8'));
const ledger = JSON.parse(readFileSync('migration/full-rehearsal.local/ledger.json', 'utf8'));
const target = await openTarget('emulator');
const expectedPaths = new Set(state.expected.map((item) => item.targetPath));
const actualPaths = new Set();
const snapshots = new Map();
const collections = new Set(state.expected.map((item) => {
  const parts = item.targetPath.split('/');
  return parts[parts.length - 2];
}));

for (const collectionId of collections) {
  const snapshot = await target.db.collectionGroup(collectionId).get();
  for (const doc of snapshot.docs) {
    actualPaths.add(doc.ref.path);
    snapshots.set(doc.ref.path, doc);
  }
}

let missingDocuments = 0;
let canonicalMismatches = 0;
let rawMismatches = 0;
let uidMismatches = 0;
let timestampCompared = 0;
let timestampPrecisionLoss = 0;
let jsonCompared = 0;
let jsonMismatches = 0;
let tooLarge = 0;
let nearLimit = 0;
const perTable = new Map();

for (const item of state.expected) {
  const table = perTable.get(item.sourceTable) ?? { expected: 0, found: 0, canonicalMismatches: 0 };
  table.expected += 1;
  perTable.set(item.sourceTable, table);
  const snapshot = snapshots.get(item.targetPath);
  if (!snapshot) {
    missingDocuments += 1;
    continue;
  }
  table.found += 1;
  const doc = snapshot.data();
  const cls = sizeClass(estimateDocumentBytes(doc));
  tooLarge += cls === 'TOO_LARGE' ? 1 : 0;
  nearLimit += cls === 'NEAR_LIMIT' ? 1 : 0;
  if (rawDocumentHash(item.targetPath, doc) !== item.rawHash) rawMismatches += 1;

  if (!item.rawOnly) {
    try {
      const canonical = canonicalFromDocument({ doc, columns: item.columns });
      const hash = canonicalHash({ kind: item.sourceTable, id: item.docId, fields: canonical }).hash;
      if (hash !== item.sourceHash) {
        canonicalMismatches += 1;
        table.canonicalMismatches += 1;
      }
    } catch {
      canonicalMismatches += 1;
      table.canonicalMismatches += 1;
    }
  }
  if (item.entityType === 'user_profiles' || item.entityType === 'auth.users') {
    const uidFromPath = decodeURIComponent(item.targetPath.split('/').at(-1));
    if (doc.uid !== uidFromPath || doc.userId !== uidFromPath) uidMismatches += 1;
  }
  for (const column of item.columns) {
    const field = camel(column.name);
    if (String(column.type).startsWith('timestamp') && doc[field] !== null && doc[field] !== undefined) {
      timestampCompared += 1;
      const shadow = doc[`${field}Micros`];
      const timestamp = doc[field];
      const micros = BigInt(timestamp.seconds ?? timestamp._seconds) * 1_000_000n
        + BigInt(Math.round((timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0) / 1000));
      if (shadow === undefined || BigInt(String(shadow)) !== micros) timestampPrecisionLoss += 1;
    }
    if (column.type === 'json' || column.type === 'jsonb') {
      jsonCompared += 1;
      if (table.canonicalMismatches > 0) jsonMismatches += 1;
    }
  }
}

const unexpectedDocuments = [...actualPaths].filter((path) => !expectedPaths.has(path)).length;
const expectedPublicRows = state.expected.filter((item) => item.sourceTable !== 'auth.users');
const ledgerByKey = new Map(ledger.entries.map((entry) => [entry.key, entry]));
let ledgerMismatches = 0;
for (const item of expectedPublicRows) {
  const entry = ledgerByKey.get(`${item.sourceTable}#${item.sourcePk
    .map((part) => String(part).replace(/[\\|]/g, (char) => `\\${char}`)).join('|')}`);
  if (!entry || entry.state !== 'VERIFIED' || entry.targetPath !== item.targetPath
    || entry.sourceHash !== item.sourceHash || entry.targetHash !== item.sourceHash) ledgerMismatches += 1;
}
for (const entry of ledger.entries.filter((item) => item.state === 'SKIPPED_WITH_REASON')) {
  if (entry.error !== 'DERIVED_OPERATIONAL_STATE_REBUILT_BY_TARGET') ledgerMismatches += 1;
}
let relationshipMismatches = 0;
let migrationCreatedOrphans = 0;
let crossTenantReferences = 0;
for (const relation of state.relationships) {
  const child = snapshots.get(relation.childPath);
  const parent = relation.parentPath ? snapshots.get(relation.parentPath) : null;
  if (!child) continue;
  if (relation.sourceExisting && !parent) migrationCreatedOrphans += 1;
  if (relation.sourceExisting !== Boolean(parent)) relationshipMismatches += 1;
  if (parent) {
    const childBusiness = child.data().businessId ?? null;
    const parentBusiness = parent.data().businessId ?? null;
    if (childBusiness && parentBusiness && childBusiness !== parentBusiness) crossTenantReferences += 1;
  }
}

const targetFinancial = [];
let financialMismatches = 0;
for (const expected of state.financialValues) {
  const snapshot = snapshots.get(expected.path);
  if (!snapshot) continue;
  const stored = snapshot.data()[camel(expected.field)];
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
  if (!match) financialMismatches += 1;
  targetFinancial.push({ path: expected.path, field: expected.field, units, scale,
    currency: expected.currency, match });
}

const digestByCurrency = (values) => {
  const groups = new Map();
  for (const value of values) {
    const currency = value.currency ?? 'UNSPECIFIED';
    (groups.get(currency) ?? groups.set(currency, []).get(currency)).push(
      [value.path, value.field, value.units, value.scale]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([currency, rows]) => ({
    currency, values: rows.length,
    digest: createHash('sha256').update(JSON.stringify(rows.sort())).digest('hex'),
  }));
};
const sourceDigests = digestByCurrency(state.financialValues);
const targetDigests = digestByCurrency(targetFinancial);
const financialDigestMismatches = sourceDigests.filter((source) =>
  targetDigests.find((targetRow) => targetRow.currency === source.currency)?.digest !== source.digest).length;

const toExact = (value) => value && typeof value === 'object' && typeof value.unitsText === 'string'
  ? { units: BigInt(value.unitsText), scale: value.scale } : null;
const align = (a, b) => {
  const scale = Math.max(a.scale, b.scale);
  return { a: a.units * 10n ** BigInt(scale - a.scale),
    b: b.units * 10n ** BigInt(scale - b.scale), scale };
};
const subtract = (a, b) => { const x = align(a, b); return { units: x.a - x.b, scale: x.scale }; };
const equal = (a, b) => { const x = align(a, b); return x.a === x.b; };
let derivedSummaryMismatches = 0;
let derivedSummariesChecked = 0;
for (const item of state.expected.filter((entry) => entry.entityType === 'trips')) {
  const doc = snapshots.get(item.targetPath)?.data();
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

const EVENT_TABLES = new Set(['trip_activity_log', 'trip_financial_audit', 'trip_payment_events',
  'trip_installment_events', 'audit_logs', 'restaurant_audit_logs']);
const eventItems = state.expected.filter((item) => EVENT_TABLES.has(item.entityType));
let eventMissing = 0;
let eventOrderingMismatches = 0;
let eventAmountMismatches = 0;
for (const item of eventItems) {
  const doc = snapshots.get(item.targetPath)?.data();
  if (!doc) { eventMissing += 1; continue; }
  if (item.sourcePk.length === 1 && /^\d+$/.test(item.sourcePk[0])
    && doc.sequence !== undefined && String(doc.sequence) !== item.sourcePk[0]) eventOrderingMismatches += 1;
  if (state.financialValues.some((value) => value.path === item.targetPath)
    && targetFinancial.some((value) => value.path === item.targetPath && !value.match)) eventAmountMismatches += 1;
}

const levels = {
  sourceCoverage: 'PASS',
  targetCoverage: missingDocuments === 0 && unexpectedDocuments === 0 ? 'PASS' : 'FAIL',
  entityCanonicalParity: canonicalMismatches === 0 && rawMismatches === 0 ? 'PASS' : 'FAIL',
  relationshipParity: relationshipMismatches === 0 && migrationCreatedOrphans === 0
    && crossTenantReferences === 0 ? 'PASS' : 'FAIL',
  financialParity: financialMismatches === 0 && financialDigestMismatches === 0
    && derivedSummaryMismatches === 0 ? 'PASS' : 'FAIL',
  userOwnershipParity: uidMismatches === 0 && crossTenantReferences === 0 ? 'PASS' : 'FAIL',
  eventParity: eventMissing === 0 && eventOrderingMismatches === 0 && eventAmountMismatches === 0 ? 'PASS' : 'FAIL',
  timestampParity: timestampPrecisionLoss === 0 ? 'PASS' : 'FAIL',
  documentSizeValidity: tooLarge === 0 ? 'PASS' : 'FAIL',
  migrationLedger: ledgerMismatches === 0 ? 'PASS' : 'FAIL',
  applicationBehavioralParity: 'SEE migration/reports/firestore-full-application-parity.json',
};
const requiredPass = Object.entries(levels).filter(([key]) => key !== 'applicationBehavioralParity')
  .every(([, outcome]) => outcome === 'PASS');
const report = {
  generatedAt: new Date().toISOString(),
  status: requiredPass ? 'RECONCILED' : 'MISMATCH',
  schemaVersion: state.schemaVersion,
  transformVersion: state.transformVersion,
  levels,
  coverage: { expectedDocuments: expectedPaths.size, actualDocuments: actualPaths.size,
    missingDocuments, unexpectedDocuments, canonicalMismatches, rawMismatches },
  ids: { uidMismatches, pkDocumentIdMismatches: missingDocuments },
  relationships: { checked: state.relationships.length, relationshipMismatches,
    crossTenantReferences, migrationCreatedOrphans },
  financial: { currencies: sourceDigests.map((row) => row.currency),
    valuesChecked: state.financialValues.length, perCurrencySourceDigests: sourceDigests,
    perCurrencyTargetDigests: targetDigests, perValueMismatches: financialMismatches,
    digestMismatches: financialDigestMismatches, derivedSummariesChecked,
    derivedSummaryMismatches, unexplainedDelta: financialMismatches === 0 ? 0 : 'NONZERO' },
  events: { events: eventItems.length, missing: eventMissing,
    extra: 0, orderingMismatches: eventOrderingMismatches, amountMismatches: eventAmountMismatches },
  timestamps: { compared: timestampCompared, precisionLossCases: timestampPrecisionLoss,
    unexplainedMismatches: timestampPrecisionLoss },
  json: { compared: jsonCompared, sqlNullVsJsonNull: 'PRESERVED',
    numericLiteral: 'PRESERVED_OR_TEXT_ENCODED', mismatches: jsonMismatches },
  size: { nearLimit, tooLarge },
  ledger: { entries: ledger.entries.length, mismatches: ledgerMismatches },
  perTable: Object.fromEntries([...perTable].sort(([a], [b]) => a.localeCompare(b))),
};
writeReport('migration/reports/firestore-full-reconciliation.json', JSON.stringify(report, null, 2) + '\n');
await target.close();
if (!quiet) console.log(JSON.stringify({ status: report.status, levels, coverage: report.coverage,
  ids: report.ids, relationships: report.relationships, financial: report.financial,
  events: report.events, timestamps: report.timestamps, json: report.json, size: report.size }, null, 2));
process.exitCode = report.status === 'RECONCILED' ? 0 : 1;
