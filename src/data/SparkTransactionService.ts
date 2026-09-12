import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { PaymentCommand, SaveTrip } from './contracts';

export const SPARK_MONEY_SCALE = 2 as const;
export const SPARK_MAX_INSTALLMENTS = 8;

type Scope = { uid: string; businessId: string };

const safeInteger = (value: number, code: string) => {
  if (!Number.isSafeInteger(value)) throw Error(code);
  return value;
};

const exactMoney = (units: number, currency: string) => ({
  units,
  unitsText: String(safeInteger(units, 'UNSAFE_MONEY_INTEGER')),
  scale: SPARK_MONEY_SCALE,
  currency,
  decimal: `${units < 0 ? '-' : ''}${String(Math.abs(units)).padStart(3, '0').slice(0, -2)}.${String(Math.abs(units)).padStart(3, '0').slice(-2)}`,
});

const parsePayment = (value: string) => {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) throw Error('INVALID_PAYMENT_AMOUNT');
  const [whole, fraction] = value.split('.');
  const units = BigInt(whole) * 100n + BigInt(fraction);
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('INVALID_PAYMENT_AMOUNT');
  return Number(units);
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
};

async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(stable(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

const operationId = (scope: Scope, clientRequestId: string) => `${scope.uid}__${clientRequestId}`;
const planIdFor = (tripId: string) => `plan__${tripId}`;
const installmentIdFor = (tripId: string, number: number) => `installment__${tripId}__${number}`;
const microsNow = () => String(Date.now() * 1000);

function addMonths(dateText: string, months: number) {
  const [year, month, day] = dateText.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export class SparkTransactionService {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  constructor(private readonly db: Firestore) {}

  async saveTrip(scope: Scope, input: SaveTrip): Promise<{ id: string; idempotentReplay: boolean }> {
    const { trip, paymentPlan } = input;
    if (trip.endDate < trip.startDate) throw Error('INVALID_TRIP_DATES');
    for (const value of [trip.salePriceMinor, trip.wholesaleCostMinor]) safeInteger(value, 'UNSAFE_MONEY_INTEGER');
    if (trip.salePriceMinor < 0 || trip.wholesaleCostMinor < 0) throw Error('NEGATIVE_MONEY');
    if (paymentPlan) {
      for (const value of [paymentPlan.cardTotalMinor, paymentPlan.cashTotalMinor, paymentPlan.confirmedCashMinor, paymentPlan.installmentCount]) safeInteger(value, 'UNSAFE_PLAN_INTEGER');
      if (paymentPlan.cardTotalMinor + paymentPlan.cashTotalMinor !== trip.salePriceMinor) throw Error('PAYMENT_PLAN_SPLIT_MISMATCH');
      if (paymentPlan.confirmedCashMinor < 0 || paymentPlan.confirmedCashMinor > paymentPlan.cashTotalMinor) throw Error('INVALID_CONFIRMED_CASH_AMOUNT');
      if (paymentPlan.method === 'cash' && (paymentPlan.cardTotalMinor !== 0 || paymentPlan.installmentCount !== 0)) throw Error('PAYMENT_PLAN_SPLIT_MISMATCH');
      if (paymentPlan.method === 'card' && paymentPlan.cashTotalMinor !== 0) throw Error('PAYMENT_PLAN_SPLIT_MISMATCH');
      if (paymentPlan.method === 'mixed' && (paymentPlan.cardTotalMinor <= 0 || paymentPlan.cashTotalMinor <= 0)) throw Error('PAYMENT_PLAN_SPLIT_MISMATCH');
      if (paymentPlan.installmentCount < 0 || paymentPlan.installmentCount > SPARK_MAX_INSTALLMENTS ||
          (paymentPlan.cardTotalMinor > 0 && (paymentPlan.installmentCount < 1 || paymentPlan.installmentCount > paymentPlan.cardTotalMinor))) throw Error('SPARK_INSTALLMENT_LIMIT');
    }
    // The request id is already a UUID and is stable across app restarts. Using
    // it for a new trip makes the document identity deterministic before a
    // retried Firestore transaction starts.
    const id = trip.id ?? input.clientRequestId;
    const opId = operationId(scope, input.clientRequestId);
    const hash = await fingerprint({ type: trip.id ? 'trip-edit' : 'trip-create', ...input, id });
    const opRef = doc(this.db, 'sparkOperations', opId);
    const tripRef = doc(this.db, 'trips', id);
    return runTransaction(this.db, async tx => {
      const prior = await tx.get(opRef);
      if (prior.exists()) {
        if (prior.data().fingerprint !== hash) throw Error('IDEMPOTENCY_CONFLICT');
        return { id: String(prior.data().tripId), idempotentReplay: true };
      }
      const old = await tx.get(tripRef);
      if (trip.id && (!old.exists() || old.data().ownerUid !== scope.uid || old.data().businessId !== scope.businessId || old.data().isDeleted)) throw Error('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      if (!trip.id && old.exists()) throw Error('TRIP_ALREADY_EXISTS');
      const revision = (old.data()?.revision ?? 0) + 1;
      const paidMinor = old.data()?.amountPaidMinor ?? paymentPlan?.confirmedCashMinor ?? 0;
      const op = { schemaVersion: 1, operationId: opId, type: trip.id ? 'trip-edit' : 'trip-create', actorUid: scope.uid,
        ownerUid: scope.uid, businessId: scope.businessId, tripId: id, currency: trip.currency,
        beforeRevision: revision - 1, afterRevision: revision, fingerprint: hash, createdAt: serverTimestamp() };
      tx.set(opRef, op);
      tx.set(tripRef, {
        schemaVersion: 1, transformVersion: 'spark-v1', id, userId: scope.uid, ownerUid: scope.uid,
        businessId: scope.businessId, clientName: trip.clientName, destination: trip.destination,
        startDate: trip.startDate, endDate: trip.endDate, currency: trip.currency,
        travelersCount: trip.travelersCount, travelers: trip.travelers ?? [], travelersEncoding: 'native',
        notes: trip.notes ?? null, status: trip.status ?? old.data()?.status ?? 'active', isDeleted: false,
        moneyScale: SPARK_MONEY_SCALE, salePriceMinor: trip.salePriceMinor,
        wholesaleCostMinor: trip.wholesaleCostMinor, amountPaidMinor: paidMinor,
        amountDueMinor: trip.salePriceMinor - paidMinor, profitMinor: trip.salePriceMinor - trip.wholesaleCostMinor,
        salePrice: exactMoney(trip.salePriceMinor, trip.currency), wholesaleCost: exactMoney(trip.wholesaleCostMinor, trip.currency),
        amountPaid: exactMoney(paidMinor, trip.currency), amountDue: exactMoney(trip.salePriceMinor - paidMinor, trip.currency),
        profit: exactMoney(trip.salePriceMinor - trip.wholesaleCostMinor, trip.currency),
        paymentStatus: paidMinor <= 0 ? 'unpaid' : paidMinor >= trip.salePriceMinor ? 'paid' : 'partial',
        revision, lastOperationId: opId, updatedAt: serverTimestamp(), updatedAtMicros: microsNow(),
        ...(old.exists() ? { createdAt: old.data().createdAt ?? serverTimestamp(), createdAtMicros: old.data().createdAtMicros ?? microsNow() }
          : { createdAt: serverTimestamp(), createdAtMicros: microsNow(), deletedAt: null }),
      });
      if (paymentPlan) {
        if (trip.id) throw Error('PAYMENT_PLAN_UPDATE_REQUIRES_DEDICATED_COMMAND');
        const planId = planIdFor(id);
        const count = paymentPlan.installmentCount;
        const base = count ? Math.floor(paymentPlan.cardTotalMinor / count) : 0;
        const remainder = count ? paymentPlan.cardTotalMinor - base * count : 0;
        const scheduleIds = Array.from({ length: count }, (_, index) => installmentIdFor(id, index + 1));
        tx.set(doc(this.db, 'tripPaymentPlans', planId), {
          schemaVersion: 1, transformVersion: 'spark-v1', id: planId, tripId: id, userId: scope.uid,
          ownerUid: scope.uid, businessId: scope.businessId, paymentMethod: paymentPlan.method,
          currency: paymentPlan.currency ?? trip.currency, cardTotalMinor: paymentPlan.cardTotalMinor,
          cashTotalMinor: paymentPlan.cashTotalMinor, cardPaidMinor: 0, cashPaidMinor: paymentPlan.confirmedCashMinor,
          installmentCount: count, installmentBaseMinor: base, installmentRemainderMinor: remainder,
          scheduleIds, firstInstallmentDate: paymentPlan.firstDate ?? trip.startDate, status: 'active', source: 'native',
          isDeleted: false, lastOperationId: opId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        scheduleIds.forEach((installmentId, index) => tx.set(doc(this.db, 'tripInstallments', installmentId), {
          schemaVersion: 1, transformVersion: 'spark-v1', id: installmentId, paymentPlanId: planId, tripId: id,
          userId: scope.uid, ownerUid: scope.uid, businessId: scope.businessId, installmentNumber: index + 1,
          dueDate: addMonths(paymentPlan.firstDate ?? trip.startDate, index),
          expectedAmountMinor: base + (index === count - 1 ? remainder : 0), paidAmountMinor: 0,
          status: 'scheduled', isDeleted: false, lastOperationId: opId,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }));
      }
      tx.set(doc(this.db, 'tripActivityLog', opId), { schemaVersion: 1, ownerUid: scope.uid, userId: scope.uid,
        actorUserId: scope.uid, businessId: scope.businessId, tripId: id, isDeleted: false,
        activityType: trip.id ? 'trip_updated' : 'trip_created', sequence: revision,
        lastOperationId: opId, createdAt: serverTimestamp(), createdAtMicros: microsNow() });
      return { id, idempotentReplay: false };
    });
  }

  private async activePlan(scope: Scope, tripId: string) {
    const rows = await getDocs(query(collection(this.db, 'tripPaymentPlans'), where('ownerUid', '==', scope.uid),
      where('businessId', '==', scope.businessId), where('tripId', '==', tripId), where('status', '==', 'active'), limit(2)));
    if (rows.size !== 1) throw Error('ACTIVE_PLAN_REQUIRED');
    return rows.docs[0].ref;
  }

  async recordPayment(scope: Scope, input: PaymentCommand, installment = false) {
    const key = operationId(scope, input.clientRequestId);
    const running = this.inFlight.get(key);
    if (running) return running;
    const work = this.recordPaymentAtomic(scope, input, installment, key);
    this.inFlight.set(key, work);
    try { return await work; } finally { this.inFlight.delete(key); }
  }

  private async recordPaymentAtomic(scope: Scope, input: PaymentCommand, installment: boolean, opId: string) {
    if (installment !== Boolean(input.installmentId)) throw Error('INSTALLMENT_ID_REQUIRED');
    const amountMinor = parsePayment(input.amount);
    const hash = await fingerprint({ type: installment ? 'installment-payment' : 'payment', ...input });
    const planRef = await this.activePlan(scope, input.tripId);
    const opRef = doc(this.db, 'sparkOperations', opId);
    const tripRef = doc(this.db, 'trips', input.tripId);
    return runTransaction(this.db, async tx => {
      const prior = await tx.get(opRef);
      if (prior.exists()) {
        if (prior.data().fingerprint !== hash) throw Error('IDEMPOTENCY_CONFLICT');
        return { ...prior.data().responsePayload, idempotentReplay: true };
      }
      const tripSnap = await tx.get(tripRef);
      const planSnap = await tx.get(planRef);
      const installmentRef = input.installmentId ? doc(this.db, 'tripInstallments', input.installmentId) : null;
      const installmentSnap = installmentRef ? await tx.get(installmentRef) : null;
      if (!tripSnap.exists() || !planSnap.exists()) throw Error('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      const trip = tripSnap.data(), plan = planSnap.data();
      if (trip.ownerUid !== scope.uid || trip.businessId !== scope.businessId || trip.isDeleted || plan.tripId !== input.tripId) throw Error('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      if (trip.currency !== input.currency || plan.currency !== input.currency) throw Error('CURRENCY_MISMATCH');
      if (input.expectedRevision !== undefined && input.expectedRevision !== trip.revision) throw Error('STALE_REVISION');
      if (installment && (!installmentSnap?.exists() || installmentSnap.data().paymentPlanId !== planRef.id || installmentSnap.data().status === 'cancelled')) throw Error('INSTALLMENT_NOT_FOUND');
      const installmentData = installmentSnap?.data();
      const remaining = installmentData ? installmentData.expectedAmountMinor - installmentData.paidAmountMinor
        : plan.cashTotalMinor - plan.cashPaidMinor;
      if (amountMinor > remaining) throw Error('PAYMENT_EXCEEDS_REMAINING');
      const newCash = plan.cashPaidMinor + (installment ? 0 : amountMinor);
      const newCard = plan.cardPaidMinor + (installment ? amountMinor : 0);
      const newPaid = trip.amountPaidMinor + amountMinor;
      const revision = trip.revision + 1;
      const response = { tripId: input.tripId, eventId: opId, amountPaid: exactMoney(newPaid, input.currency),
        amountDue: exactMoney(trip.salePriceMinor - newPaid, input.currency), revision };
      tx.set(opRef, { schemaVersion: 1, operationId: opId, type: installment ? 'installment-payment' : 'payment',
        actorUid: scope.uid, ownerUid: scope.uid, businessId: scope.businessId, tripId: input.tripId,
        paymentPlanId: planRef.id, installmentId: input.installmentId ?? null, currency: input.currency,
        amountMinor, beforeRevision: trip.revision, afterRevision: revision, fingerprint: hash,
        responsePayload: response, createdAt: serverTimestamp() });
      tx.update(planRef, { cashPaidMinor: newCash, cardPaidMinor: newCard, lastOperationId: opId, updatedAt: serverTimestamp() });
      if (installmentRef && installmentData) {
        const newInstallmentPaid = installmentData.paidAmountMinor + amountMinor;
        tx.update(installmentRef, { paidAmountMinor: newInstallmentPaid,
          status: newInstallmentPaid === installmentData.expectedAmountMinor ? 'paid' : 'partial',
          paidAt: serverTimestamp(), lastOperationId: opId, updatedAt: serverTimestamp() });
      }
      tx.update(tripRef, { amountPaidMinor: newPaid, amountDueMinor: trip.salePriceMinor - newPaid,
        amountPaid: exactMoney(newPaid, input.currency), amountDue: exactMoney(trip.salePriceMinor - newPaid, input.currency),
        paymentStatus: newPaid === trip.salePriceMinor ? 'paid' : 'partial', revision,
        lastOperationId: opId, updatedAt: serverTimestamp(), updatedAtMicros: microsNow() });
      const event = { schemaVersion: 1, ownerUid: scope.uid, userId: scope.uid, actorUserId: scope.uid,
        businessId: scope.businessId, tripId: input.tripId, paymentPlanId: planRef.id,
        installmentId: input.installmentId ?? null, sequence: revision, isDeleted: false,
        amountMinor, amount: exactMoney(amountMinor, input.currency), currency: input.currency,
        eventType: installment ? 'installment' : 'cash', operationId: opId, lastOperationId: opId,
        createdAt: serverTimestamp(), createdAtMicros: microsNow() };
      tx.set(doc(this.db, 'tripPaymentEvents', opId), event);
      if (installment) tx.set(doc(this.db, 'tripInstallmentEvents', opId), { ...event, paymentEventId: opId });
      tx.set(doc(this.db, 'tripFinancialAudit', opId), { ...event, changedField: 'amountPaid', operationType: 'payment',
        beforeMinor: trip.amountPaidMinor, afterMinor: newPaid });
      tx.set(doc(this.db, 'tripActivityLog', opId), { ...event, activityType: 'payment_recorded' });
      return { ...response, idempotentReplay: false };
    });
  }

  async setTripState(scope: Scope, tripId: string, state: 'archive'|'restore'|'delete'|'unarchive', clientRequestId: string) {
    const opId = operationId(scope, clientRequestId), opRef = doc(this.db, 'sparkOperations', opId), tripRef = doc(this.db, 'trips', tripId);
    const hash = await fingerprint({ type: 'trip-state', tripId, state });
    await runTransaction(this.db, async tx => {
      const prior = await tx.get(opRef); if (prior.exists()) { if (prior.data().fingerprint !== hash) throw Error('IDEMPOTENCY_CONFLICT'); return; }
      const snap = await tx.get(tripRef); if (!snap.exists()) throw Error('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      const trip = snap.data(); if (trip.ownerUid !== scope.uid || trip.businessId !== scope.businessId) throw Error('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      if ((state === 'archive' || state === 'unarchive') && trip.isDeleted) throw Error('TRIP_IS_DELETED');
      const revision = trip.revision + 1;
      tx.set(opRef, { schemaVersion: 1, operationId: opId, type: 'trip-state', state, actorUid: scope.uid,
        ownerUid: scope.uid, businessId: scope.businessId, tripId, beforeRevision: trip.revision,
        afterRevision: revision, fingerprint: hash, createdAt: serverTimestamp() });
      tx.update(tripRef, { revision, lastOperationId: opId, updatedAt: serverTimestamp(), updatedAtMicros: microsNow(),
        ...(state === 'delete' || state === 'restore' ? { isDeleted: state === 'delete', deletedAt: state === 'delete' ? serverTimestamp() : null,
          deletedBy: state === 'delete' ? scope.uid : null } : { status: state === 'archive' ? 'archived' : 'active' }) });
      tx.set(doc(this.db, 'tripActivityLog', opId), { schemaVersion: 1, ownerUid: scope.uid, userId: scope.uid,
        actorUserId: scope.uid, businessId: scope.businessId, tripId, isDeleted: false, activityType: state,
        sequence: revision, lastOperationId: opId, createdAt: serverTimestamp(), createdAtMicros: microsNow() });
    });
  }
}
