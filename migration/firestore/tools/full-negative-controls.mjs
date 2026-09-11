#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { openTarget } from '../lib/firestore-target.mjs';
import { camel } from '../lib/transform.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST_REQUIRED');
const state = JSON.parse(readFileSync('migration/full-rehearsal.local/expected.json', 'utf8'));
const target = await openTarget('emulator');
const results = [];

const reconcile = () => spawnSync(process.execPath,
  ['migration/firestore/tools/full-reconcile.mjs', '--quiet'],
  { env: process.env, encoding: 'utf8', stdio: 'ignore' }).status;
if (reconcile() !== 0) throw new Error('NEGATIVE_CONTROL_BASELINE_NOT_CLEAN');

const snapshot = async (item) => {
  const snap = await target.db.doc(item.targetPath).get();
  if (!snap.exists) throw new Error('NEGATIVE_CONTROL_FIXTURE_MISSING');
  return snap.data();
};
const control = async (name, mutate, restore) => {
  let caught = false;
  try {
    await mutate();
    caught = reconcile() !== 0;
  } finally {
    await restore();
  }
  results.push({ name, caught });
  if (!caught) throw new Error(`NEGATIVE_CONTROL_NOT_CAUGHT:${name}`);
};

const trip = state.expected.find((item) => item.entityType === 'trips');
const user = state.expected.find((item) => item.entityType === 'user_profiles');
const plan = state.expected.find((item) => item.entityType === 'trip_payment_plans');
const event = state.expected.find((item) => item.entityType === 'trip_financial_audit');
const audit = state.expected.find((item) => item.entityType === 'trip_activity_log');
const otherBusiness = state.expected.find((item) => item.entityType === 'business_profiles'
  && item.businessId !== trip.businessId);
if (![trip, user, plan, event, audit, otherBusiness].every(Boolean)) throw new Error('NEGATIVE_FIXTURES_INCOMPLETE');

const tripOriginal = await snapshot(trip);
await control('missing_document', () => target.db.doc(trip.targetPath).delete(),
  () => target.db.doc(trip.targetPath).set(tripOriginal));

const extraPath = 'trips/negative-full-rehearsal-extra';
await control('unexpected_extra_document', () => target.db.doc(extraPath).set({ negative: true }),
  () => target.db.doc(extraPath).delete());

const userOriginal = await snapshot(user);
await control('wrong_uid', () => target.db.doc(user.targetPath).set({ ...userOriginal, uid: '__wrong_uid__' }),
  () => target.db.doc(user.targetPath).set(userOriginal));

await control('wrong_business_id', () => target.db.doc(trip.targetPath)
  .set({ ...tripOriginal, businessId: '__wrong_business__' }),
() => target.db.doc(trip.targetPath).set(tripOriginal));

const planOriginal = await snapshot(plan);
await control('broken_parent_reference', () => target.db.doc(plan.targetPath)
  .set({ ...planOriginal, tripId: '__missing_trip__' }),
() => target.db.doc(plan.targetPath).set(planOriginal));

await control('cross_tenant_reference', () => target.db.doc(plan.targetPath)
  .set({ ...planOriginal, businessId: otherBusiness.businessId }),
() => target.db.doc(plan.targetPath).set(planOriginal));

// Cache documents only after the core fixtures are restored.
const snapshotsCache = new Map();
for (const item of state.expected) {
  if (!snapshotsCache.has(item.targetPath)) snapshotsCache.set(item.targetPath, await snapshot(item));
}
const exactMoney = state.financialValues.find((item) => {
  const stored = snapshotsCache.get(item.path)?.[camel(item.field)];
  return stored && typeof stored === 'object' && typeof stored.unitsText === 'string';
});
if (!exactMoney) throw new Error('NEGATIVE_MONEY_FIXTURE_MISSING');
const moneyOriginal = snapshotsCache.get(exactMoney.path);
const moneyField = camel(exactMoney.field);
const storedMoney = moneyOriginal[moneyField];
await control('financial_unit_changed_by_one', () => target.db.doc(exactMoney.path).set({ ...moneyOriginal,
  [moneyField]: { ...storedMoney, unitsText: (BigInt(storedMoney.unitsText) + 1n).toString(),
    units: storedMoney.units === null ? null : storedMoney.units + 1 } }),
() => target.db.doc(exactMoney.path).set(moneyOriginal));

await control('wrong_numeric_scale', () => target.db.doc(exactMoney.path).set({ ...moneyOriginal,
  [moneyField]: { ...storedMoney, scale: storedMoney.scale + 1 } }),
() => target.db.doc(exactMoney.path).set(moneyOriginal));

await control('large_numeric_overflow', () => target.db.doc(exactMoney.path).set({ ...moneyOriginal,
  [moneyField]: { ...storedMoney, unitsText: '92233720368547758081234567890', units: null } }),
() => target.db.doc(exactMoney.path).set(moneyOriginal));

const currencyItem = state.expected.find((item) => snapshotsCache.get(item.targetPath)?.currency);
const currencyOriginal = snapshotsCache.get(currencyItem.targetPath);
await control('currency_changed', () => target.db.doc(currencyItem.targetPath)
  .set({ ...currencyOriginal, currency: '__WRONG__' }),
() => target.db.doc(currencyItem.targetPath).set(currencyOriginal));

const eventOriginal = await snapshot(event);
await control('event_removed', () => target.db.doc(event.targetPath).delete(),
  () => target.db.doc(event.targetPath).set(eventOriginal));
await control('event_reordered', () => target.db.doc(event.targetPath)
  .set({ ...eventOriginal, sequence: Number(eventOriginal.sequence ?? 0) + 1000 }),
() => target.db.doc(event.targetPath).set(eventOriginal));

const timestampItem = state.expected.find((item) => item.columns.some((column) =>
  String(column.type).startsWith('timestamp') && snapshotsCache.get(item.targetPath)?.[camel(column.name)]));
const timestampOriginal = snapshotsCache.get(timestampItem.targetPath);
const timestampColumn = timestampItem.columns.find((column) =>
  String(column.type).startsWith('timestamp') && timestampOriginal[camel(column.name)]);
const timestampField = camel(timestampColumn.name);
const oldTimestamp = timestampOriginal[timestampField];
const oldSeconds = oldTimestamp.seconds ?? oldTimestamp._seconds;
const oldNanos = oldTimestamp.nanoseconds ?? oldTimestamp._nanoseconds ?? 0;
await control('timestamp_changed', () => target.db.doc(timestampItem.targetPath).set({ ...timestampOriginal,
  [timestampField]: new target.Timestamp(oldSeconds + 1, oldNanos),
  [`${timestampField}Micros`]: (BigInt(timestampOriginal[`${timestampField}Micros`]) + 1_000_000n).toString() }),
() => target.db.doc(timestampItem.targetPath).set(timestampOriginal));

const sqlNullJsonItem = state.expected.find((item) => item.columns.some((column) => {
  if (!['json', 'jsonb'].includes(column.type)) return false;
  const field = camel(column.name);
  const doc = snapshotsCache.get(item.targetPath);
  return doc[field] === null && doc[`${field}Encoding`] === undefined;
}));
if (!sqlNullJsonItem) throw new Error('NEGATIVE_SQL_NULL_FIXTURE_MISSING');
const sqlNullOriginal = snapshotsCache.get(sqlNullJsonItem.targetPath);
const sqlNullColumn = sqlNullJsonItem.columns.find((column) => {
  const field = camel(column.name); return ['json', 'jsonb'].includes(column.type)
    && sqlNullOriginal[field] === null && sqlNullOriginal[`${field}Encoding`] === undefined;
});
const sqlNullField = camel(sqlNullColumn.name);
await control('sql_null_to_json_null', () => target.db.doc(sqlNullJsonItem.targetPath)
  .set({ ...sqlNullOriginal, [`${sqlNullField}Encoding`]: 'native' }),
() => target.db.doc(sqlNullJsonItem.targetPath).set(sqlNullOriginal));

const jsonItem = state.expected.find((item) => item.columns.some((column) => {
  if (!['json', 'jsonb'].includes(column.type)) return false;
  const field = camel(column.name); const doc = snapshotsCache.get(item.targetPath);
  return doc[`${field}Encoding`] === 'text';
}));
if (!jsonItem) throw new Error('NEGATIVE_JSON_LITERAL_FIXTURE_MISSING');
const jsonOriginal = snapshotsCache.get(jsonItem.targetPath);
const jsonColumn = jsonItem.columns.find((column) => jsonOriginal[`${camel(column.name)}Encoding`] === 'text');
const jsonField = camel(jsonColumn.name);
await control('json_numeric_literal_changed', () => target.db.doc(jsonItem.targetPath)
  .set({ ...jsonOriginal, [`${jsonField}Json`]: `${jsonOriginal[`${jsonField}Json`]} ` }),
() => target.db.doc(jsonItem.targetPath).set(jsonOriginal));

await control('derived_financial_summary_changed', () => target.db.doc(trip.targetPath).set({ ...tripOriginal,
  profit: { ...tripOriginal.profit, unitsText: (BigInt(tripOriginal.profit.unitsText) + 1n).toString(),
    units: tripOriginal.profit.units === null ? null : tripOriginal.profit.units + 1 } }),
() => target.db.doc(trip.targetPath).set(tripOriginal));

const auditOriginal = await snapshot(audit);
await control('audit_event_modified', () => target.db.doc(audit.targetPath)
  .set({ ...auditOriginal, activityType: '__modified__' }),
() => target.db.doc(audit.targetPath).set(auditOriginal));

const ledgerPath = 'migration/full-rehearsal.local/ledger.json';
const ledgerText = readFileSync(ledgerPath, 'utf8');
await control('migration_ledger_state_corrupted', async () => {
  const ledger = JSON.parse(ledgerText);
  const entry = ledger.entries.find((item) => item.state === 'VERIFIED');
  entry.state = 'FAILED';
  entry.error = 'INJECTED_LEDGER_CORRUPTION';
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
}, async () => writeFileSync(ledgerPath, ledgerText, { mode: 0o600 }));

if (reconcile() !== 0) throw new Error('NEGATIVE_CONTROL_RESTORE_FAILED');
await target.close();
const report = { generatedAt: new Date().toISOString(),
  status: results.every((result) => result.caught) ? 'ALL_CORRUPTIONS_DETECTED' : 'FAIL',
  controls: results.length, detected: results.filter((result) => result.caught).length,
  failures: results.filter((result) => !result.caught).length, results };
writeReport('migration/reports/firestore-full-negative-controls.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failures === 0 ? 0 : 1;
