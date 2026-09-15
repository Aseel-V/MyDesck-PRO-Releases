import { readStoredDecimal, timestampToMicros } from './exactValues';

/**
 * get_owned_trip_payment_summary(p_trip_id), reproduced exactly for one trip the caller owns.
 *
 * Money columns are NUMERIC in the source and `round(x * 100)::bigint` rounds half away from zero, so every
 * conversion to minor units works on the stored decimal (unitsText and scale) with integer arithmetic; no
 * binary floating point touches an amount. "Today" is the business clock, the calendar date in Asia/Jerusalem.
 */

type Row = Record<string, unknown>;

export interface SummaryTripInput {
  /** Stored decimals (the migrated document fields), not decoded numbers. */
  salePrice: unknown;
  amountPaid: unknown;
  cardPaidAmount: unknown;
  cashPaidAmount: unknown;
  paymentMethod: string | null;
  currency: string | null;
}

export interface SummaryPlanRow {
  id: string;
  user_id: string;
  source: string;
  status: string;
  deleted_at: string | null;
  updated_at: string;
  payment_method: string;
  currency: string;
  installment_count: number;
  card_total_minor: number;
  cash_total_minor: number;
  card_paid_minor: number;
  cash_paid_minor: number;
}

export interface SummaryInstallmentRow {
  id: string;
  payment_plan_id: string;
  installment_number: number;
  due_date: string;
  expected_amount_minor: number;
  paid_amount_minor: number;
  paid_at: string | null;
  status: string;
  updated_at: string;
}

const decimal = (stored: unknown) => (stored === null || stored === undefined ? { units: 0n, scale: 0 } : readStoredDecimal(stored));
const align = (value: { units: bigint; scale: number }, scale: number) => value.units * 10n ** BigInt(scale - value.scale);

/** round((a - b) * 100) with PostgreSQL NUMERIC semantics: exact difference, then half away from zero. */
function roundedMinor(a: { units: bigint; scale: number }, b: { units: bigint; scale: number } = { units: 0n, scale: 0 }): bigint {
  const scale = Math.max(a.scale, b.scale);
  const units = align(a, scale) - align(b, scale);
  if (scale <= 2) return units * 10n ** BigInt(2 - scale);
  const divisor = 10n ** BigInt(scale - 2);
  const quotient = units / divisor;
  const remainder = units % divisor;
  const magnitude = remainder < 0n ? -remainder : remainder;
  return magnitude * 2n >= divisor ? quotient + (units < 0n ? -1n : 1n) : quotient;
}

const greatest0 = (value: bigint) => (value > 0n ? value : 0n);
const least = (a: bigint, b: bigint) => (a < b ? a : b);
const num = (value: bigint | null) => (value === null ? null : Number(value));
const micros = (text: string | null) => (text === null ? null : timestampToMicros(text));
const compareDesc = (a: bigint | null, b: bigint | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a > b ? -1 : 1);
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The calendar date in Asia/Jerusalem, as (now() AT TIME ZONE 'Asia/Jerusalem')::date. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function tripPaymentPlanSummary(ownerUid: string, trip: SummaryTripInput, planRows: SummaryPlanRow[],
  installmentRows: SummaryInstallmentRow[], today: string): Row {
  // selected_plan: ORDER BY (source = 'native') DESC, updated_at DESC, id DESC LIMIT 1
  const plan = planRows
    .filter((row) => row.user_id === ownerUid && row.deleted_at === null && row.status !== 'cancelled')
    .sort((a, b) => Number(b.source === 'native') - Number(a.source === 'native')
      || compareDesc(micros(a.updated_at), micros(b.updated_at)) || compareText(b.id, a.id))[0] ?? null;

  const live = plan ? installmentRows.filter((row) => row.payment_plan_id === plan.id && row.status !== 'cancelled') : [];
  const sum = (rows: SummaryInstallmentRow[], pick: (row: SummaryInstallmentRow) => bigint) => rows.reduce((total, row) => total + pick(row), 0n);
  const due = live.filter((row) => row.due_date <= today);
  const future = live.filter((row) => row.due_date > today);
  const receipts = live.filter((row) => row.paid_at !== null);
  const schedule = {
    actualScheduleTotal: sum(live, (row) => BigInt(row.expected_amount_minor)),
    manualVisaReceived: sum(receipts, (row) => BigInt(row.paid_amount_minor)),
    manualConfirmed: receipts.filter((row) => row.paid_amount_minor === row.expected_amount_minor).length,
    manualPartial: receipts.filter((row) => row.paid_amount_minor > 0 && row.paid_amount_minor < row.expected_amount_minor).length,
    effectiveVisaPaid: sum(due, (row) => BigInt(row.expected_amount_minor)),
    effectivePaidInstallments: due.length,
    futureScheduled: sum(future, (row) => BigInt(row.expected_amount_minor)),
    finalInstallmentDate: live.length ? live.map((row) => row.due_date).sort()[live.length - 1] : null,
  };
  const next = [...future].sort((a, b) => compareText(a.due_date, b.due_date) || a.installment_number - b.installment_number)[0] ?? null;
  const lastScheduled = [...due].sort((a, b) => compareText(b.due_date, a.due_date) || b.installment_number - a.installment_number)[0] ?? null;
  const lastReceipt = receipts.filter((row) => row.paid_amount_minor > 0)
    .sort((a, b) => compareDesc(micros(a.paid_at), micros(b.paid_at)) || compareDesc(micros(a.updated_at), micros(b.updated_at))
      || compareText(b.id, a.id))[0] ?? null;

  const salePrice = decimal(trip.salePrice);
  const amountPaid = decimal(trip.amountPaid);
  const cardPaid = decimal(trip.cardPaidAmount);
  const cashPaid = decimal(trip.cashPaidAmount);
  const native = plan?.source === 'native';

  const visaScheduleTotal = plan ? BigInt(plan.card_total_minor)
    : trip.paymentMethod === 'card' ? roundedMinor(salePrice)
      : trip.paymentMethod === 'mixed' ? greatest0(roundedMinor(cardPaid)) : 0n;
  const cashTotal = plan ? BigInt(plan.cash_total_minor)
    : trip.paymentMethod === 'card' ? 0n
      : trip.paymentMethod === 'mixed' ? greatest0(roundedMinor(salePrice, cardPaid)) : roundedMinor(salePrice);
  const rawCashConfirmed = native ? greatest0(BigInt(plan.cash_paid_minor))
    : ['cash', 'mixed'].includes(trip.paymentMethod ?? 'cash')
      ? greatest0(roundedMinor(trip.paymentMethod === 'mixed' ? cashPaid : amountPaid)) : 0n;
  const rawEffectiveVisaPaid = native ? greatest0(schedule.effectiveVisaPaid)
    : trip.paymentMethod === 'card' ? greatest0(roundedMinor(amountPaid))
      : trip.paymentMethod === 'mixed' ? greatest0(roundedMinor(amountPaid, cashPaid)) : 0n;
  const effectivePaidInstallments = native ? schedule.effectivePaidInstallments : schedule.manualConfirmed;

  const saleTotal = greatest0(roundedMinor(salePrice));
  const cashConfirmed = least(greatest0(cashTotal), greatest0(rawCashConfirmed));
  const effectiveVisa = least(greatest0(visaScheduleTotal), greatest0(rawEffectiveVisaPaid));
  const effectiveConfirmedTotal = least(saleTotal, cashConfirmed + effectiveVisa);
  const totalUnpaid = greatest0(saleTotal - cashConfirmed - effectiveVisa);
  const cashRemaining = greatest0(cashTotal - cashConfirmed);
  const status = effectiveConfirmedTotal <= 0n ? 'unpaid' : totalUnpaid <= 0n ? 'paid' : 'partial';
  const reconciliation = !native ? 'legacy_fallback'
    : cashTotal + visaScheduleTotal !== saleTotal ? 'allocation_mismatch'
      : schedule.actualScheduleTotal !== visaScheduleTotal ? 'schedule_mismatch' : 'aligned';

  return {
    plan_id: plan?.id ?? null,
    source: native ? 'native' : 'legacy',
    payment_source: native ? 'native' : 'legacy_fallback',
    visa_collection_basis: native ? 'schedule_date' : 'legacy_receipts',
    business_timezone: 'Asia/Jerusalem',
    reconciliation_state: reconciliation,
    payment_method: plan?.payment_method ?? trip.paymentMethod ?? 'cash',
    currency: plan?.currency ?? trip.currency ?? 'ILS',
    sale_total_minor: num(saleTotal),
    cash_total_minor: num(cashTotal),
    cash_confirmed_minor: num(cashConfirmed),
    cash_remaining_minor: num(cashRemaining),
    visa_schedule_total_minor: num(visaScheduleTotal),
    effective_visa_paid_minor: num(effectiveVisa),
    visa_confirmed_minor: num(effectiveVisa),
    visa_scheduled_through_today_minor: num(schedule.effectiveVisaPaid),
    visa_overdue_unconfirmed_minor: 0,
    visa_future_scheduled_minor: num(schedule.futureScheduled),
    effective_confirmed_total_minor: num(effectiveConfirmedTotal),
    confirmed_total_minor: num(effectiveConfirmedTotal),
    total_unpaid_minor: num(totalUnpaid),
    currently_due_unconfirmed_minor: 0,
    installment_count: plan ? plan.installment_count : 0,
    effective_paid_installment_count: effectivePaidInstallments,
    confirmed_installments: effectivePaidInstallments,
    partial_installments: 0,
    next_installment_due_date: next?.due_date ?? null,
    next_installment_expected_minor: next?.expected_amount_minor ?? null,
    next_installment_confirmed_minor: 0,
    last_scheduled_visa_date: lastScheduled?.due_date ?? null,
    last_scheduled_visa_minor: lastScheduled?.expected_amount_minor ?? null,
    manual_visa_received_minor: num(schedule.manualVisaReceived),
    manual_confirmed_installments: schedule.manualConfirmed,
    manual_partial_installments: schedule.manualPartial,
    last_manual_visa_received_at: lastReceipt?.paid_at ?? null,
    last_manual_visa_received_minor: lastReceipt?.paid_amount_minor ?? null,
    last_confirmed_visa_at: lastReceipt?.paid_at ?? null,
    last_confirmed_visa_minor: lastReceipt?.paid_amount_minor ?? null,
    final_installment_date: schedule.finalInstallmentDate,
    derived_payment_status: status,
    card_total_minor: num(visaScheduleTotal),
    cash_paid_minor: num(cashConfirmed),
    stored_card_paid_minor: plan ? plan.card_paid_minor : 0,
    stored_cash_paid_minor: plan ? plan.cash_paid_minor : 0,
    processed_installments: effectivePaidInstallments,
    scheduled_minor_to_date: num(schedule.effectiveVisaPaid),
    remaining_scheduled_minor: num(schedule.futureScheduled),
    next_installment_minor: next?.expected_amount_minor ?? null,
    next_installment_date: next?.due_date ?? null,
    authoritative_paid_minor: num(effectiveConfirmedTotal),
    authoritative_remaining_minor: num(totalUnpaid),
    authoritative_payment_status: status,
    combined_remaining_minor: num(totalUnpaid),
  };
}
