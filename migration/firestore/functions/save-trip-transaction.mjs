/**
 * save_trip_transaction, rebuilt as a server-authoritative Firestore operation.
 *
 * This is the PostgreSQL RPC's contract, preserved:
 *
 *   1. identity comes from the verified caller, never the payload
 *   2. idempotency on (uid, clientRequestId), returning the original result
 *   3. ownership checked on edit; a trip you do not own does not exist to you
 *   4. the payment split must equal the sale price exactly, in minor units
 *   5. confirmed payment history is immutable; only untouched schedule rows
 *      are replaced
 *   6. installments divide with the remainder on the last row
 *   7. trip aggregates are recomputed from the ledger, never taken from input
 *   8. an activity record is written in the same transaction
 *
 * Firestore transactions RETRY. The body is therefore pure: it reads, computes
 * and stages writes, and performs no external side effect of any kind. Anything
 * with an outside effect — a message, an email, a file deletion — belongs in an
 * outbox document written inside the transaction and drained after it commits.
 *
 * The Admin SDK bypasses Security Rules entirely, so every check here is the
 * real one. Nothing below relies on a rule to stop it.
 */

import { randomUUID, createHash } from 'node:crypto';
import { SaveTripInput, validate } from '../lib/schemas.mjs';
import { splitExactMoney, moneyFromMinorUnits, sumExactMoney } from '../lib/exact-decimal.mjs';
import { SCHEMA_VERSION, TRANSFORM_VERSION, MINOR_UNIT_SCALE } from '../lib/entities.mjs';

export class TransactionError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TransactionError';
    this.code = code;
  }
}

const fail = (code, detail) => { throw new TransactionError(code, detail); };

/** Add whole months to a YYYY-MM-DD date, clamping to the month's last day. */
export function addMonths(dateText, months) {
  const [y, m, d] = dateText.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0))
    .getUTCDate();
  const day = Math.min(d, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${
    String(day).padStart(2, '0')}`;
}

/**
 * Validate the payment split. These are the source RPC's checks, in the same
 * order, so a payload the database would have rejected is still rejected.
 */
export function validatePaymentPlan(plan, salePriceMinor) {
  const { method, cardTotalMinor, cashTotalMinor, confirmedCashMinor, installmentCount } = plan;
  if (confirmedCashMinor < 0 || confirmedCashMinor > cashTotalMinor) {
    fail('INVALID_CONFIRMED_CASH_AMOUNT');
  }
  if (method === 'card' && cashTotalMinor !== 0) fail('PAYMENT_PLAN_SPLIT_MISMATCH');
  if (method === 'cash' && cardTotalMinor !== 0) fail('PAYMENT_PLAN_SPLIT_MISMATCH');
  if (method === 'mixed' && (cardTotalMinor <= 0 || cashTotalMinor <= 0)) {
    fail('PAYMENT_PLAN_SPLIT_MISMATCH');
  }
  // Exact integer equality. The source compares against round(sale_price * 100);
  // here the caller supplies minor units directly, so no rounding is involved
  // on either side and the comparison is exact by construction.
  if (cardTotalMinor + cashTotalMinor !== salePriceMinor) fail('PAYMENT_PLAN_SPLIT_MISMATCH');

  if (method === 'card' || method === 'mixed') {
    if (cardTotalMinor <= 0 || installmentCount <= 0 || installmentCount > 120
      || installmentCount > cardTotalMinor) {
      fail('INVALID_PAYMENT_PLAN_CARD_PARAMETERS');
    }
  }
}

/**
 * The trip's authoritative payment position, computed from the plan and the
 * installments rather than from anything the caller said.
 */
export function derivePaymentSummary({ plan, installments }) {
  const currency = plan.currency;
  const visaConfirmedMinor = installments
    .filter((i) => i.status !== 'cancelled')
    .reduce((total, i) => total + (i.paidAmountMinor ?? 0), 0);
  const cashConfirmedMinor = Math.min(
    Math.max(plan.cashTotalMinor, 0), Math.max(plan.cashPaidMinor, 0));
  const confirmedTotalMinor = visaConfirmedMinor + cashConfirmedMinor;
  const totalMinor = plan.cardTotalMinor + plan.cashTotalMinor;
  const derivedPaymentStatus = confirmedTotalMinor <= 0 ? 'unpaid'
    : confirmedTotalMinor >= totalMinor ? 'paid' : 'partial';
  return {
    currency,
    visaConfirmedMinor,
    cashConfirmedMinor,
    confirmedTotalMinor,
    totalUnpaidMinor: Math.max(totalMinor - confirmedTotalMinor, 0),
    derivedPaymentStatus,
    paymentSource: 'native',
  };
}

/**
 * @param {object} deps  db, Timestamp, FieldValue, and `now` for determinism
 * @param {object} call  { auth: { uid }, data }
 */
export async function saveTripTransaction(deps, call) {
  const { db, Timestamp } = deps;
  const now = deps.now ?? new Date();
  deps = { ...deps, newId: deps.newId ?? randomUUID };

  // 1. Identity. The uid comes from the verified call context. A `userId` in
  // the payload is not consulted, and the input schema does not even allow one.
  const uid = call?.auth?.uid;
  if (!uid || typeof uid !== 'string') fail('USER_NOT_AUTHENTICATED');

  const input = validate(SaveTripInput, call.data, 'INVALID_INPUT');
  const { clientRequestId, trip, paymentPlan } = input;

  if (trip.endDate < trip.startDate) fail('INVALID_TRIP_DATES');
  if (paymentPlan) { validatePaymentPlan(paymentPlan, trip.salePriceMinor); if (paymentPlan.currency && paymentPlan.currency !== trip.currency) fail('CURRENCY_MISMATCH'); }

  const idempotencyId = `${uid}__${clientRequestId}`;
  const idempotencyRef = db.collection('idempotency').doc(idempotencyId);

  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');

  // Ids are UUIDs, matching the source primary keys and the migrated corpus, so
  // the target does not end up with two id vocabularies. They are generated
  // BEFORE the transaction: a transaction body can be retried, and an id minted
  // inside it would differ between attempts, leaving orphaned documents from
  // the attempts that lost.
  const tripId = trip.id ?? deps.newId();
  const candidatePlanId = deps.newId();
  const candidateInstallmentIds = Array.from(
    { length: paymentPlan?.installmentCount ?? 0 }, () => deps.newId());
  const tripRef = db.collection('trips').doc(tripId);

  const result = await db.runTransaction(async (tx) => {
    // ---- reads (all reads must precede all writes in a transaction) ----
    const idempotencySnap = await tx.get(idempotencyRef);


    const userSnap = await tx.get(db.collection('users').doc(uid));
    if (!userSnap.exists) fail('USER_PROFILE_NOT_FOUND');
    const user = userSnap.data();
    if (user.isSuspended === true) fail('USER_SUSPENDED');
    const businesses = await tx.get(db.collection('businesses').where('ownerUid', '==', uid).limit(2));
    if (businesses.size !== 1) fail('BUSINESS_NOT_UNIQUE');
    const business = businesses.docs[0];
    if (business.data().isSuspended === true) fail('BUSINESS_SUSPENDED');
    const businessId = business.id;
    if (user.businessId && user.businessId !== businessId) fail('BUSINESS_ACCESS_DENIED');

    if (idempotencySnap.exists) {
      if (idempotencySnap.data().fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
      return { replay: idempotencySnap.data().responsePayload };
    }
    const tripSnap = await tx.get(tripRef);
    const isEdit = Boolean(trip.id);
    if (isEdit) {
      // Ownership and liveness, exactly as the source RPC checks them. A trip
      // owned by someone else is reported as not found, so the error cannot be
      // used to probe for the existence of other tenants' trips.
      if (!tripSnap.exists) fail('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      const existing = tripSnap.data();
      if (existing.ownerUid !== uid) fail('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
      if (existing.isDeleted) fail('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
    } else if (tripSnap.exists) {
      fail('TRIP_ALREADY_EXISTS');
    }

    const planQuery = await tx.get(db.collection('tripPaymentPlans')
      .where('tripId', '==', tripId).where('ownerUid', '==', uid).limit(2));
    const planDocs = planQuery.docs.filter((d) => d.data().status !== 'cancelled');
    if (planDocs.length > 1) fail('MULTIPLE_ACTIVE_PAYMENT_PLANS');
    const existingPlanDoc = planDocs[0] ?? null;

    const existingInstallments = existingPlanDoc
      ? (await tx.get(db.collection('tripInstallments')
        .where('paymentPlanId', '==', existingPlanDoc.id)
        .where('ownerUid', '==', uid))).docs
      : [];

    // ---- decisions ----
    const timestamp = Timestamp.fromDate(now);
    const micros = String(BigInt(now.getTime()) * 1000n);
    const money = (minor) => moneyFromMinorUnits(String(minor),
      { currency: trip.currency, scale: MINOR_UNIT_SCALE });

    let planId = existingPlanDoc?.id ?? null;
    let planData = null;
    const installmentWrites = [];
    const installmentDeletes = [];

    if (paymentPlan) {
      const plan = { ...paymentPlan, currency: paymentPlan.currency ?? trip.currency };

      // Confirmed collection is immutable. A structural change to a plan that
      // already has confirmed payments must go through the dedicated
      // future-installment workflow, so an edit cannot silently redistribute
      // or cancel money the customer has already paid.
      const hasConfirmed = existingInstallments.some(
        (d) => d.data().status !== 'cancelled' && (d.data().paidAmountMinor ?? 0) > 0);
      if (hasConfirmed && existingPlanDoc) {
        const before = existingPlanDoc.data();
        const structurallyChanged = plan.method === 'cash'
          || before.paymentMethod !== plan.method
          || before.currency !== plan.currency
          || before.cardTotalMinor !== plan.cardTotalMinor
          || before.installmentCount !== plan.installmentCount
          || (before.firstInstallmentDate ?? null) !== (plan.firstDate ?? null);
        if (structurallyChanged) fail('PAYMENT_PLAN_CONFIRMED_SCHEDULE_CONFLICT');
      }

      planId ??= candidatePlanId;
      const priorCashPaid = existingPlanDoc?.data().cashPaidMinor ?? 0;
      planData = {
        schemaVersion: SCHEMA_VERSION,
        transformVersion: TRANSFORM_VERSION,
        id: planId,
        tripId,
        userId: uid,
        ownerUid: uid,
        businessId,
        paymentMethod: plan.method,
        currency: plan.currency,
        cardTotalMinor: plan.method === 'cash' ? 0 : plan.cardTotalMinor,
        cashTotalMinor: plan.cashTotalMinor,
        cardPaidMinor: existingPlanDoc?.data().cardPaidMinor ?? 0,
        cashPaidMinor: plan.confirmedCashMinor,
        installmentCount: plan.method === 'cash' ? 0 : plan.installmentCount,
        firstInstallmentDate: plan.firstDate ?? null,
        status: 'active',
        source: 'native',
        isDeleted: false,
        updatedAt: timestamp,
        updatedAtMicros: micros,
        ...(existingPlanDoc ? {} : { createdAt: timestamp, createdAtMicros: micros }),
      };
      if (priorCashPaid > plan.confirmedCashMinor) fail('CONFIRMED_CASH_CANNOT_DECREASE');

      if (plan.method === 'card' || plan.method === 'mixed') {
        // Only untouched scheduled rows are replaced; anything with a payment
        // against it survives.
        for (const doc of existingInstallments) {
          const data = doc.data();
          if ((data.paidAmountMinor ?? 0) === 0 && data.status === 'scheduled') {
            installmentDeletes.push(doc.ref);
          }
        }
        const parts = splitExactMoney(
          moneyFromMinorUnits(String(plan.cardTotalMinor),
            { currency: plan.currency, scale: MINOR_UNIT_SCALE }),
          plan.installmentCount);

        const firstDate = plan.firstDate ?? new Date(now).toISOString().slice(0, 10);
        for (let i = 0; i < plan.installmentCount; i += 1) {
          const number = i + 1;
          const existing = existingInstallments.find(
            (d) => d.data().installmentNumber === number);
          // A row that already carries a payment keeps its amount and status.
          if (existing && (existing.data().paidAmountMinor ?? 0) > 0) continue;
          const id = existing?.id ?? candidateInstallmentIds[i];
          installmentWrites.push({
            ref: db.collection('tripInstallments').doc(id),
            data: {
              schemaVersion: SCHEMA_VERSION,
              transformVersion: TRANSFORM_VERSION,
              id,
              paymentPlanId: planId,
              tripId,
              userId: uid,
              ownerUid: uid,
              businessId,
              installmentNumber: number,
              dueDate: addMonths(firstDate, i),
              expectedAmountMinor: Number(parts[i].unitsText),
              paidAmountMinor: 0,
              paidAt: null,
              status: 'scheduled',
              isDeleted: false,
              createdAt: timestamp,
              createdAtMicros: micros,
              updatedAt: timestamp,
              updatedAtMicros: micros,
            },
          });
        }
      } else {
        // A cash plan cancels the visa schedule rather than deleting it, so the
        // history of what was scheduled is not erased.
        for (const doc of existingInstallments) {
          if (doc.data().status !== 'cancelled') {
            installmentWrites.push({ ref: doc.ref, merge: true,
              data: { status: 'cancelled', updatedAt: timestamp, updatedAtMicros: micros } });
          }
        }
      }
    }

    // The authoritative summary, computed from the plan and the installments
    // that will exist after this transaction — never from the caller's numbers.
    if (!paymentPlan && existingPlanDoc) {
      planData = existingPlanDoc.data();
      if (planData.currency !== trip.currency || planData.cardTotalMinor + planData.cashTotalMinor !== trip.salePriceMinor) fail('PAYMENT_PLAN_REQUIRED_FOR_FINANCIAL_EDIT');
    }
    const projectedInstallments = planData
      ? [
        ...existingInstallments
          .filter((d) => !installmentDeletes.some((r) => r.id === d.id))
          .filter((d) => !installmentWrites.some((w) => w.ref.id === d.id))
          .map((d) => d.data()),
        ...installmentWrites.map((w) => (w.merge
          ? { ...existingInstallments.find((d) => d.id === w.ref.id).data(), ...w.data }
          : w.data)),
      ]
      : [];
    const summary = planData
      ? derivePaymentSummary({ plan: planData, installments: projectedInstallments })
      : null;

    const salePrice = money(trip.salePriceMinor);
    const wholesaleCost = money(trip.wholesaleCostMinor);
    const amountPaid = money(summary?.confirmedTotalMinor ?? 0);
    const amountDue = money(Math.max(trip.salePriceMinor - (summary?.confirmedTotalMinor ?? 0), 0));
    const profit = money(trip.salePriceMinor - trip.wholesaleCostMinor);

    const tripData = {
      revision: (tripSnap.data()?.revision ?? 0) + 1,
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      id: tripId,
      userId: uid,
      ownerUid: uid,
      businessId,
      clientName: trip.clientName,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      currency: trip.currency,
      travelersCount: trip.travelersCount,
      travelers: trip.travelers ?? [],
      travelersEncoding: 'native',
      notes: trip.notes ?? null,
      status: trip.status ?? 'active',
      serviceType: trip.serviceType ?? 'both',
      salePrice,
      wholesaleCost,
      amountPaid,
      amountDue,
      profit,
      paymentStatus: summary?.derivedPaymentStatus ?? 'unpaid',
      isDeleted: false,
      deletedAt: null,
      updatedAt: timestamp,
      updatedAtMicros: micros,
      ...(isEdit ? {} : { createdAt: timestamp, createdAtMicros: micros }),
    };

    const response = {
      id: tripId,
      clientName: tripData.clientName,
      destination: tripData.destination,
      currency: tripData.currency,
      salePrice: salePrice.decimal,
      amountPaid: amountPaid.decimal,
      amountDue: amountDue.decimal,
      profit: profit.decimal,
      paymentStatus: tripData.paymentStatus,
      paymentPlanSummary: summary,
      schemaVersion: SCHEMA_VERSION,
    };

    // ---- writes ----
    tx.set(tripRef, tripData, { merge: isEdit });
    if (planData) tx.set(db.collection('tripPaymentPlans').doc(planId), planData, { merge: true });
    for (const ref of installmentDeletes) tx.delete(ref);
    for (const write of installmentWrites) {
      tx.set(write.ref, write.data, write.merge ? { merge: true } : undefined);
    }

    // Activity is written in the same transaction, so a committed trip always
    // has its record and a rolled-back one leaves none.
    const activityRef = db.collection('tripActivityLog').doc(`${uid}__${clientRequestId}`);
    tx.set(activityRef, {
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      tripId,
      userId: uid,
      ownerUid: uid,
      businessId,
      actorUserId: uid,
      activityType: isEdit ? 'trip_updated' : 'trip_created',
      metadata: { clientName: tripData.clientName, destination: tripData.destination },
      sequence: now.getTime(),
      isDeleted: false,
      createdAt: timestamp,
      createdAtMicros: micros,
    });

    // The idempotency record is written INSIDE the transaction. A retry that
    // arrives before this commits will contend on the same document and lose,
    // which is what makes the guarantee hold under concurrency rather than
    // only under sequential replay.
    tx.create(db.collection('tripFinancialAudit').doc(idempotencyId), {
      schemaVersion: SCHEMA_VERSION, transformVersion: TRANSFORM_VERSION,
      userId: uid, ownerUid: uid, businessId, tripId, actorUserId: uid,
      sequence: now.getTime(), changedField: 'trip', operationType: isEdit ? 'UPDATE' : 'INSERT',
      before: tripSnap.exists ? { salePrice: tripSnap.data().salePrice, wholesaleCost: tripSnap.data().wholesaleCost } : null,
      after: { salePrice, wholesaleCost }, isDeleted: false, createdAt: timestamp, createdAtMicros: micros,
    });
    tx.create(idempotencyRef, {
      schemaVersion: SCHEMA_VERSION,
      transformVersion: TRANSFORM_VERSION,
      userId: uid,
      ownerUid: uid,
      clientRequestId,
      tripId,
      fingerprint,
      responsePayload: response,
      isDeleted: false,
      createdAt: timestamp,
      createdAtMicros: micros,
    });

    return { response };
  });

  if (result.replay) return { ...result.replay, idempotentReplay: true };
  return { ...result.response, idempotentReplay: false };
}

/**
 * Cloud Functions entry point.
 *
 * Kept as a thin wrapper so the operation above can be tested against the
 * emulator without deploying, and so the authorization logic is not entangled
 * with the transport.
 */
export function makeCallable(deps) {
  return async (request) => {
    // `request.auth` is populated by the Functions runtime from a VERIFIED
    // Firebase ID token. It is the only accepted source of identity.
    if (!request.auth?.uid) fail('USER_NOT_AUTHENTICATED');
    return saveTripTransaction(deps, { auth: { uid: request.auth.uid }, data: request.data });
  };
}
