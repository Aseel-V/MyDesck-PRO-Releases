#!/usr/bin/env node
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { openTarget } from '../lib/firestore-target.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST_REQUIRED');
const evidence = {};
const source = await withSourceSnapshot(localConfig(), async (select) => {
  const rows = async (sql) => (await select(sql)).rows;
  return {
    businesses: await rows(`SELECT id::text AS id, user_id::text AS user_id
      FROM public.business_profiles ORDER BY id`),
    trips: await rows(`SELECT id::text AS id, user_id::text AS user_id,
      start_date::text AS start_date, status::text AS status,
      (deleted_at IS NOT NULL)::text AS is_deleted, travelers::text AS travelers,
      attachments::text AS attachments FROM public.trips ORDER BY user_id, start_date, id`),
    plans: await rows(`SELECT id::text AS id, trip_id::text AS trip_id
      FROM public.trip_payment_plans ORDER BY trip_id, id`),
    installments: await rows(`SELECT id::text AS id, trip_id::text AS trip_id,
      due_date::text AS due_date FROM public.trip_installments ORDER BY trip_id, due_date, id`),
    paymentEvents: await rows(`SELECT id::text AS id, trip_id::text AS trip_id
      FROM public.trip_payment_events ORDER BY trip_id, id`),
    installmentEvents: await rows(`SELECT id::text AS id, trip_id::text AS trip_id
      FROM public.trip_installment_events ORDER BY trip_id, id`),
    financialAudit: await rows(`SELECT id::text AS id, trip_id::text AS trip_id
      FROM public.trip_financial_audit ORDER BY trip_id, id`),
    activity: await rows(`SELECT id::text AS id, trip_id::text AS trip_id
      FROM public.trip_activity_log ORDER BY trip_id, id`),
  };
}, evidence);

const target = await openTarget('emulator');
let assertions = 0;
let failures = 0;
const categoryResults = new Map();
const assert = (category, condition) => {
  assertions += 1;
  const row = categoryResults.get(category) ?? { assertions: 0, failures: 0 };
  row.assertions += 1;
  if (!condition) { failures += 1; row.failures += 1; }
  categoryResults.set(category, row);
};
const ids = (rows) => rows.map((row) => row.id).sort();
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
let pagesChecked = 0;
let middlePages = 0;
let lastPages = 0;
let travelerRecords = 0;
let attachmentRecords = 0;

for (const business of source.businesses) {
  const businessDoc = await target.db.doc(`businesses/${business.id}`).get();
  assert('business', businessDoc.exists && businessDoc.data().ownerUid === business.user_id);
  for (const deleted of [false, true]) {
    const sourceTrips = source.trips.filter((trip) => trip.user_id === business.user_id
      && (trip.is_deleted === 'true') === deleted)
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id));
    const pageSize = 10;
    let cursor = null;
    const targetIds = [];
    let pageIndex = 0;
    while (true) {
      let query = target.db.collection('trips')
        .where('ownerUid', '==', business.user_id)
        .where('businessId', '==', business.id)
        .where('isDeleted', '==', deleted)
        .orderBy('startDate').orderBy(target.FieldPath.documentId()).limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      pagesChecked += 1;
      if (pageIndex > 0) middlePages += 1;
      pageIndex += 1;
      targetIds.push(...page.docs.map((doc) => doc.id));
      cursor = page.docs.at(-1);
      if (page.size < pageSize) { lastPages += 1; break; }
    }
    assert('pagination_set', same(ids(sourceTrips), targetIds));
    assert('pagination_count', targetIds.length === sourceTrips.length);
  }
}

for (const trip of source.trips) {
  const doc = await target.db.doc(`trips/${trip.id}`).get();
  assert('trip_details', doc.exists);
  const data = doc.data();
  assert('trip_ownership', data.ownerUid === trip.user_id);
  const travelers = trip.travelers ? JSON.parse(trip.travelers) : [];
  const targetTravelers = data.travelersEncoding === 'text'
    ? JSON.parse(data.travelersJson) : (data.travelers ?? []);
  travelerRecords += Array.isArray(travelers) ? travelers.length : 0;
  assert('travelers', JSON.stringify(travelers) === JSON.stringify(targetTravelers));
  const attachments = trip.attachments ? JSON.parse(trip.attachments) : [];
  const targetAttachments = data.attachmentsEncoding === 'text'
    ? JSON.parse(data.attachmentsJson) : (data.attachments ?? []);
  attachmentRecords += Array.isArray(attachments) ? attachments.length : 0;
  assert('attachments', JSON.stringify(attachments) === JSON.stringify(targetAttachments));

  const compareCollection = async (collection, expectedRows) => {
    const snapshot = await target.db.collection(collection).where('tripId', '==', trip.id).get();
    const numericIdentityCollection = new Set(['tripPaymentEvents', 'tripInstallmentEvents',
      'tripFinancialAudit', 'tripActivityLog']).has(collection);
    assert(collection, same(ids(expectedRows), snapshot.docs.map((item) =>
      numericIdentityCollection ? item.id.replace(/^0+(?=\d)/, '') : item.id)));
  };
  await compareCollection('tripPaymentPlans', source.plans.filter((row) => row.trip_id === trip.id));
  await compareCollection('tripInstallments', source.installments.filter((row) => row.trip_id === trip.id));
  await compareCollection('tripPaymentEvents', source.paymentEvents.filter((row) => row.trip_id === trip.id));
  await compareCollection('tripInstallmentEvents', source.installmentEvents.filter((row) => row.trip_id === trip.id));
  await compareCollection('tripFinancialAudit', source.financialAudit.filter((row) => row.trip_id === trip.id));
  await compareCollection('tripActivityLog', source.activity.filter((row) => row.trip_id === trip.id));
}

const reconciliation = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(
  'migration/reports/firestore-full-reconciliation.json', 'utf8')));
assert('analytics_financial', reconciliation.financial.unexplainedDelta === 0);
assert('analytics_derived', reconciliation.financial.derivedSummaryMismatches === 0);
assert('events_ordering', reconciliation.events.orderingMismatches === 0);

await target.close();
const search = {
  tripArbitraryText: 'EXTERNAL_SEARCH_REQUIRED',
  currentEmulatorWorkspace: 'CLIENT_FILTER_ON_BOUNDED_SET',
  exactStatusDateCurrencyFilters: 'SUPPORTED_DIRECTLY',
  prefixFields: 'PREFIX_MODEL_POSSIBLE_NOT_IMPLEMENTED',
  criticalParity: 'BLOCKED',
  reason: 'Current Firestore UI filters only the loaded page; it cannot reproduce source-wide SQL/tsvector search.',
};
const report = {
  generatedAt: new Date().toISOString(),
  status: failures === 0 ? 'PASS_WITH_SEARCH_BLOCKER' : 'FAIL',
  sourceSnapshot: { readOnly: evidence.start?.read_only === 'on',
    isolation: evidence.start?.isolation, writes: evidence.successfulWrites },
  corpus: { businesses: source.businesses.length, trips: source.trips.length,
    travelers: travelerRecords, attachments: attachmentRecords },
  parity: { business: (categoryResults.get('business')?.failures ?? 0) === 0 ? 'PASS' : 'FAIL',
    trips: ['trip_details', 'trip_ownership'].every((name) => (categoryResults.get(name)?.failures ?? 0) === 0) ? 'PASS' : 'FAIL',
    travelers: (categoryResults.get('travelers')?.failures ?? 0) === 0 ? 'PASS' : 'FAIL',
    payments: (categoryResults.get('tripPaymentPlans')?.failures ?? 0) === 0 ? 'PASS' : 'FAIL',
    installments: (categoryResults.get('tripInstallments')?.failures ?? 0) === 0 ? 'PASS' : 'FAIL',
    events: ['tripPaymentEvents', 'tripInstallmentEvents', 'tripFinancialAudit', 'tripActivityLog',
      'events_ordering'].every((name) => (categoryResults.get(name)?.failures ?? 0) === 0) ? 'PASS' : 'FAIL',
    documents: (categoryResults.get('attachments')?.failures ?? 0) === 0 ? 'PASS' : 'FAIL',
    analytics: ['analytics_financial', 'analytics_derived'].every((name) =>
      (categoryResults.get(name)?.failures ?? 0) === 0) ? 'PASS' : 'FAIL',
    pagination: ['pagination_set', 'pagination_count'].every((name) =>
      (categoryResults.get(name)?.failures ?? 0) === 0) ? 'PASS' : 'FAIL', search: 'BLOCKED' },
  pagination: { pagesChecked, middlePages, lastPages,
    stableOrdering: failures === 0, tieBreaker: '__name__' },
  search,
  assertions,
  failures,
  categories: Object.fromEntries(categoryResults),
};
writeReport('migration/reports/firestore-full-application-parity.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = failures === 0 ? 0 : 1;
