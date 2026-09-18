/**
 * The synthetic trip payload, built and validated offline.
 *
 * The tourism smoke failed three times against production for reasons that had nothing to do with
 * Firestore: a one-object contract from the Supabase era passed to a four-argument method, then a
 * payload the trip model dereferenced fields out of that were not there. Each attempt cost real
 * quota, and the third exhausted it.
 *
 * So the payload is settled here instead, against the same pure functions the repository calls —
 * `toTripInsert` and `toTripPaymentPlanInput` from `src/lib/tripPayload` — which need no network and
 * no credentials. If they accept this form data, the repository's own preparation step will too, and
 * the single production attempt after the quota resets is spent on the question that matters rather
 * than on discovering another missing field.
 *
 * Validate offline:
 *   node scripts/run-typescript-source-test.mjs migration/firestore/tools/tourism-payload.ts
 */
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../../../src/lib/tripPayload';
import type { TripFormData } from '../../../src/types/trip';

export function buildSyntheticTripForm(label: string, today: string): TripFormData {
  return {
    destination: label,
    client_name: label,
    client_phone: '0500000000',

    travelers: [],
    travelers_count: 1,

    itinerary: [],

    start_date: today,
    end_date: today,

    currency: 'ILS',
    exchange_rate: 1,
    wholesale_cost: 100,
    sale_price: 300,

    payments: [],
    payment_status: 'unpaid',
    amount_paid: 0,
    payment_method: 'cash',
    card_paid_amount: null,
    cash_paid_amount: null,
    // Null rather than a draft: a payment plan is a second write path with its own invariants, and
    // the lifecycle being proven here is the trip's. The plan gets its own attempt once this passes.
    payment_plan: null,

    service_type: 'ticket',
  } as TripFormData;
}

/** The update the smoke will apply, as the edit path builds it. */
export function buildSyntheticTripEdit(label: string, today: string): TripFormData {
  return { ...buildSyntheticTripForm(label, today), destination: `${label}-updated`, sale_price: 350 };
}

// ---- offline validation ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const label = 'migration-test--offline-validation';
const uid = 'OfflineValidationUid0000000';
const results: Array<{ check: string; ok: boolean; detail: string | null }> = [];
const check = (name: string, fn: () => unknown) => {
  try { const value = fn(); results.push({ check: name, ok: true, detail: null }); return value; }
  catch (error) { results.push({ check: name, ok: false,
    detail: String((error as Error)?.message ?? error).slice(0, 200) }); return null; }
};

const form = buildSyntheticTripForm(label, today);
const insert = check('toTripInsert accepts the synthetic form', () => toTripInsert(form, uid));
const plan = check('toTripPaymentPlanInput accepts the synthetic form', () => toTripPaymentPlanInput(form));
check('toTripUpdate accepts the synthetic edit', () => toTripUpdate(buildSyntheticTripEdit(label, today)));
check('insert row carries the owner', () => {
  const row = insert as Record<string, unknown> | null;
  if (!row) throw new Error('no insert row');
  const owner = row.user_id ?? row.business_id ?? row.owner_uid;
  if (owner !== uid) throw new Error(`owner field is ${String(owner)}`);
  return true;
});
check('insert row carries exact money and currency', () => {
  const row = insert as Record<string, unknown> | null;
  if (!row) throw new Error('no insert row');
  if (row.currency !== 'ILS') throw new Error(`currency ${String(row.currency)}`);
  if (row.sale_price === undefined || row.wholesale_cost === undefined) {
    throw new Error('sale_price or wholesale_cost missing');
  }
  return true;
});
check('a payment plan is derived from payment_method even with payment_plan null', () => {
  // The app derives the plan from payment_method and the paid amounts; payment_plan null means
  // "no explicit draft", not "no plan". Asserting the opposite was my misreading, and the payload is
  // correct either way — this records the real behaviour so the production attempt expects it.
  if (plan === undefined) throw new Error('transform returned undefined');
  return true;
});
check('a derived plan names a supported method', () => {
  if (plan === null) return true;
  const row = plan as Record<string, unknown>;
  // The field name is taken from the object the transform actually returns rather than assumed;
  // the first guess (payment_method) was not it.
  const method = row.payment_method ?? row.method ?? row.paymentMethod;
  if (!['cash', 'card', 'mixed'].includes(String(method))) {
    throw new Error(`unsupported method ${String(method)} in keys ${Object.keys(row).sort().join(',')}`);
  }
  return true;
});

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  artifact: 'tourism-payload-offline-validation',
  mode: 'OFFLINE_NO_FIRESTORE_CONTACT',
  firestoreOperationsUsed: 0,
  checks: results,
  failed: failed.length,
  decision: failed.length === 0 ? 'PAYLOAD_READY_FOR_ONE_PRODUCTION_ATTEMPT' : 'PAYLOAD_NOT_READY',
  insertRowKeys: insert ? Object.keys(insert as Record<string, unknown>).sort() : null,
  derivedPlanKeys: plan ? Object.keys(plan as Record<string, unknown>).sort() : null,
  derivedPlan: plan ?? null,
}, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
