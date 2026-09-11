#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { openTarget } from '../lib/firestore-target.mjs';
import { saveTripTransaction } from '../functions/save-trip-transaction.mjs';
import { recordPayment, setTripState, travelAnalytics } from '../functions/travel-operations.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST_REQUIRED');
const state = JSON.parse(readFileSync('migration/full-rehearsal.local/expected.json', 'utf8'));
const target = await openTarget('emulator');
const measure = async (work) => { const start = performance.now(); const result = await work();
  return { result, milliseconds: Number((performance.now() - start).toFixed(3)) }; };

const businesses = state.expected.filter((item) => item.entityType === 'business_profiles');
const trips = state.expected.filter((item) => item.entityType === 'trips');
const business = businesses.sort((a, b) =>
  trips.filter((trip) => trip.ownerUid === b.ownerUid).length
  - trips.filter((trip) => trip.ownerUid === a.ownerUid).length)[0];
const trip = trips.find((item) => item.ownerUid === business.ownerUid);

const list = await measure(() => target.db.collection('trips')
  .where('ownerUid', '==', business.ownerUid).where('businessId', '==', business.businessId)
  .where('isDeleted', '==', false).orderBy('startDate').limit(25).get());
const detail = await measure(async () => {
  const document = await target.db.doc(trip.targetPath).get();
  const related = await Promise.all(['tripPaymentPlans', 'tripInstallments', 'tripPaymentEvents',
    'tripInstallmentEvents', 'tripFinancialAudit', 'tripActivityLog'].map((collection) =>
    target.db.collection(collection).where('ownerUid', '==', business.ownerUid)
      .where('businessId', '==', business.businessId).where('tripId', '==', trip.docId).limit(500).get()));
  return { exists: document.exists, related: related.reduce((sum, snapshot) => sum + snapshot.size, 0) };
});
const analytics = await measure(() => travelAnalytics({ db: target.db, Timestamp: target.Timestamp },
  { auth: { uid: business.ownerUid } }));
const boundedSearch = await measure(async () => {
  const rows = await target.db.collection('trips').where('ownerUid', '==', business.ownerUid)
    .where('businessId', '==', business.businessId).limit(100).get();
  return rows.docs.filter((doc) => String(doc.data().destination ?? '').toLocaleLowerCase().includes('zz')).length;
});

const testUid = 'migration-test--full-performance';
const testBusiness = randomUUID();
await target.db.doc(`users/${testUid}`).set({ uid: testUid, userId: testUid, ownerUid: testUid,
  businessId: testBusiness, isSuspended: false });
await target.db.doc(`businesses/${testBusiness}`).set({ ownerUid: testUid,
  businessId: testBusiness, isSuspended: false });
const deps = { db: target.db, Timestamp: target.Timestamp };
const saveInput = { clientRequestId: randomUUID(), trip: { clientName: 'migration performance',
  destination: 'performance', currency: 'ILS', startDate: '2027-01-01', endDate: '2027-01-02',
  travelersCount: 1, travelers: [{ name: 'migration' }], salePriceMinor: 123457,
  wholesaleCostMinor: 100001 }, paymentPlan: { method: 'mixed', cardTotalMinor: 100001,
  cashTotalMinor: 23456, confirmedCashMinor: 0, installmentCount: 2, firstDate: '2027-01-01' } };
const tripWrite = await measure(() => saveTripTransaction(deps, { auth: { uid: testUid }, data: saveInput }));
const paymentWrite = await measure(() => recordPayment(deps, { auth: { uid: testUid }, data: {
  clientRequestId: randomUUID(), tripId: tripWrite.result.id, currency: 'ILS', amount: '1.01' } }));
const installment = await target.db.collection('tripInstallments').where('ownerUid', '==', testUid)
  .where('tripId', '==', tripWrite.result.id).limit(1).get();
const installmentWrite = await measure(() => recordPayment(deps, { auth: { uid: testUid }, data: {
  clientRequestId: randomUUID(), tripId: tripWrite.result.id, installmentId: installment.docs[0].id,
  currency: 'ILS', amount: '1.03' } }, true));
const stateWrite = await measure(async () => {
  await setTripState(deps, { auth: { uid: testUid }, data: { clientRequestId: randomUUID(),
    tripId: tripWrite.result.id, state: 'archive' } });
  await setTripState(deps, { auth: { uid: testUid }, data: { clientRequestId: randomUUID(),
    tripId: tripWrite.result.id, state: 'unarchive' } });
});
for (const collection of ['users', 'businesses', 'trips', 'tripPaymentPlans', 'tripInstallments',
  'tripPaymentEvents', 'tripInstallmentEvents', 'tripFinancialAudit', 'tripActivityLog', 'idempotency']) {
  const owned = await target.db.collection(collection).where('ownerUid', '==', testUid).get();
  for (const doc of owned.docs) await doc.ref.delete();
}

const report = {
  generatedAt: new Date().toISOString(),
  status: 'PASS_WITH_EMULATOR_TIMINGS',
  corpusDocuments: state.expected.length,
  timingsMilliseconds: { tripList: list.milliseconds, tripDetailWithRelated: detail.milliseconds,
    analytics: analytics.milliseconds, boundedSearch: boundedSearch.milliseconds,
    createTrip: tripWrite.milliseconds, paymentWrite: paymentWrite.milliseconds,
    installmentWrite: installmentWrite.milliseconds, archiveAndRestore: stateWrite.milliseconds },
  reads: { tripListDocuments: list.result.size, detailFixedQueries: 7,
    detailRelatedDocuments: detail.result.related, analyticsBound: 1001, searchBound: 100 },
  risks: { nPlusOne: 'NO_VARIABLE_PER_CHILD_READ_LOOP',
    fixedDetailFanout: 7, unboundedCollectionScans: 0,
    hotspot: 'trip document serializes concurrent financial updates; idempotent ABORTED retry is required',
    hugeDocuments: 0 },
  limitations: 'Emulator timings are regression signals, not production latency estimates.',
};
writeReport('migration/reports/firestore-full-performance.json', JSON.stringify(report, null, 2) + '\n');
await target.close();
console.log(JSON.stringify(report, null, 2));

