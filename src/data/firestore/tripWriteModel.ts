/**
 * save_trip_transaction and the trip, payment-plan and installment triggers as a pure, deterministic state machine.
 *
 * The Firestore trip commands persist what this model decides; the tourism write oracle (a local PostgreSQL built from
 * the migrations plus the production catalog overlay) proves the model writes the rows the source writes. Nothing here
 * talks to a database.
 *
 * Rows are source-shaped: column name -> value. NUMERIC values are exact decimals (Dec), jsonb values plain JSON,
 * dates 'YYYY-MM-DD', timestamps ISO text with microseconds or the NOW marker (the transaction's now()). Event rows
 * (activity, financial audit, payment and installment events) carry `id: null`; the persistence layer assigns ids in
 * the order of `ops`, which is the source's insertion order.
 */
import { normalizeIsraeliPhoneNumber } from '../../lib/phoneNumbers';
import {
  DEC_ZERO, type Dec, decCmp, decDiv, decFromJson, decMul, decNumber, decSub, decText, decTypmod, intDec, jsonbEqual,
  jsonNumeric, minorOf, pgError,
} from './pgNumeric';
import { tripPaymentPlanSummary, type SummaryInstallmentRow, type SummaryPlanRow } from './tripPaymentPlanSummary';
import { toStoredDecimal } from './exactValues';

export type Row = Record<string, unknown>;
export type Table = 'trips' | 'trip_payment_plans' | 'trip_installments' | 'trip_activity_log' | 'trip_financial_audit'
  | 'trip_payment_events' | 'trip_installment_events' | 'trip_write_requests' | 'trip_attachment_cleanup_queue' | 'trip_packing_lists';
export const NOW = '__NOW__';

export interface WriteOp { table: Table; kind: 'insert' | 'update' | 'delete'; key: string; row: Row; before?: Row }
export interface TripWorld {
  /** The caller's trips the transaction can see (all rows of the table for the ids involved). */
  trips: Row[];
  plans: Row[];
  installments: Row[];
  writeRequests: Row[];
  /** Tables only some commands read or cascade into; absent means the command does not need them. */
  cleanupQueue?: Row[];
  packingLists?: Row[];
}
export interface ModelContext {
  uid: string;
  /** current_date of the database session (UTC on the source). */
  dbToday: string;
  /** (now() AT TIME ZONE 'Asia/Jerusalem')::date */
  businessToday: string;
  /** gen_random_uuid() */
  newId: () => string;
}

const TRIP_NUMERIC: Record<string, [number | undefined, number | undefined]> = {
  wholesale_cost: [12, 2], sale_price: [12, 2], amount_paid: [12, 2], profit: [12, 2], amount_due: [12, 2], profit_percentage: [6, 2],
  exchange_rate: [undefined, undefined], wholesale_original_amount: [undefined, undefined], sale_original_amount: [undefined, undefined],
  ticket_cost_ils: [undefined, undefined], card_paid_amount: [undefined, undefined], cash_paid_amount: [undefined, undefined],
};
const AUDITED = ['sale_price', 'wholesale_cost', 'amount_paid', 'payments', 'payment_status', 'currency', 'exchange_rate', 'card_paid_amount', 'cash_paid_amount'];
const ENUMS: Record<string, Record<string, string[]>> = {
  trips: { currency: ['USD', 'EUR', 'ILS'], payment_method: ['card', 'cash', 'mixed'], payment_status: ['paid', 'partial', 'unpaid'],
    service_type: ['ticket', 'hotel', 'both'], status: ['active', 'completed', 'cancelled', 'archived'],
    ticket_class: ['economy', 'premium_economy', 'business', 'first'], trip_type: ['one_way', 'round_trip'] },
  trip_payment_plans: { payment_method: ['card', 'cash', 'mixed'], source: ['native', 'legacy'], status: ['active', 'completed', 'cancelled'] },
  trip_installments: { status: ['scheduled', 'paid', 'partially_paid', 'cancelled'] },
};
const NOT_NULL: Record<string, string[]> = {
  trips: ['id', 'user_id', 'destination', 'client_name', 'travelers_count', 'start_date', 'end_date', 'wholesale_cost', 'sale_price',
    'payment_status', 'amount_paid', 'status', 'service_type'],
  trip_payment_plans: ['id', 'trip_id', 'user_id', 'payment_method', 'currency', 'card_total_minor', 'cash_total_minor', 'card_paid_minor',
    'cash_paid_minor', 'installment_count', 'source', 'status', 'created_at', 'updated_at'],
  trip_installments: ['id', 'payment_plan_id', 'trip_id', 'user_id', 'installment_number', 'due_date', 'expected_amount_minor',
    'paid_amount_minor', 'status', 'created_at', 'updated_at'],
};

const checkViolation = (table: string, constraint: string) =>
  pgError(`new row for relation "${table}" violates check constraint "${constraint}"`, '23514');
const raise = (message: string, code = 'P0001') => pgError(message, code);

// ---------------------------------------------------------------- casts from the JSON payload

const has = (object: Row | null, key: string) => Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
/** p->>'key' */
function textOf(object: Row | null, key: string): string | null {
  if (!object || !has(object, key)) return null;
  const value = object[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return typeof value === 'number' ? decText(decFromJson(value)) : String(value);
  return JSON.stringify(value);
}
/** p->'key' (jsonb), SQL NULL when absent. */
const jsonOf = (object: Row | null, key: string): unknown => (object && has(object, key) ? (object[key] ?? null) : null);
const numericOf = (object: Row | null, key: string): Dec | null => { const text = textOf(object, key); return text === null ? null : decFromJson(text); };
function intOf(object: Row | null, key: string): number | null {
  const text = textOf(object, key);
  if (text === null) return null;
  if (!/^\s*[+-]?\d+\s*$/.test(text)) throw pgError(`invalid input syntax for type integer: "${text}"`, '22P02');
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value > 2147483647 || value < -2147483648) throw pgError(`value "${text}" is out of range for type integer`, '22003');
  return value;
}
function bigintOf(object: Row | null, key: string): bigint | null {
  const text = textOf(object, key);
  if (text === null) return null;
  if (!/^\s*[+-]?\d+\s*$/.test(text)) throw pgError(`invalid input syntax for type bigint: "${text}"`, '22P02');
  return BigInt(text.trim());
}
function dateOf(object: Row | null, key: string): string | null {
  const text = textOf(object, key);
  if (text === null) return null;
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?\s*$/.exec(text);
  if (!match) throw pgError(`invalid input syntax for type date: "${text}"`, '22007');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw pgError(`date/time field value out of range: "${text}"`, '22008');
  return `${match[1]}-${match[2]}-${match[3]}`;
}
function timestamptzOf(object: Row | null, key: string): string | null {
  const text = textOf(object, key);
  if (text === null) return null;
  const millis = Date.parse(text);
  if (Number.isNaN(millis)) throw pgError(`invalid input syntax for type timestamp with time zone: "${text}"`, '22007');
  return new Date(millis).toISOString();
}
const nullif = (value: string | null, empty: string) => (value === empty ? null : value);

/** date + (n || ' month')::interval, cast back to date (month-end clamped as PostgreSQL does). */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${String(target.getUTCFullYear()).padStart(4, '0')}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the transaction

export interface SaveTripInput { tripData: Row; paymentPlan: Row | null; clientRequestId: string | null }
export interface SaveTripResult { ops: WriteOp[]; response: Row; world: TripWorld; replay: boolean }

const clone = <T>(value: T): T => structuredClone(value);
const decOrZero = (value: unknown) => (value === null || value === undefined ? DEC_ZERO : value as Dec);

export class TripTransaction {
  readonly ops: WriteOp[] = [];
  readonly world: TripWorld;

  constructor(world: TripWorld, readonly ctx: ModelContext) {
    this.world = clone(world);
  }

  private trip(id: string) { return this.world.trips.find((row) => row.id === id) ?? null; }

  // ---- trips: BEFORE triggers, generated columns, constraints, AFTER triggers

  /** INSERT or UPDATE of one trips row; `columns` are the columns the statement names (UPDATE OF triggers). */
  writeTrip(kind: 'insert' | 'update', proposed: Row, columns: Set<string> | null): Row {
    const before = kind === 'update' ? this.trip(String(proposed.id)) : null;
    const row: Row = { ...(before ?? {}), ...proposed };
    const fires = (column: string) => kind === 'insert' || (columns?.has(column) ?? false);
    // encrypt_trip_travelers_trigger: coalesce to [] and carry an old passport_number forward by position (no key → no encryption).
    if (fires('travelers')) {
      const next = Array.isArray(row.travelers) ? row.travelers : (row.travelers ?? []);
      let merged = next;
      if (kind === 'update' && Array.isArray(before?.travelers) && Array.isArray(next)) {
        const old = before.travelers as unknown[];
        const length = Math.max(next.length, old.length);
        merged = Array.from({ length }, (_, index) => {
          const item = next[index]; const prior = old[index];
          if (item === undefined) return prior;
          if (item && prior && typeof item === 'object' && typeof prior === 'object' && !Array.isArray(item) && !Array.isArray(prior)
            && !has(item as Row, 'passport_number') && has(prior as Row, 'passport_number')) {
            return { ...(item as Row), passport_number: (prior as Row).passport_number };
          }
          return item;
        });
      }
      row.travelers = merged;
    }
    // normalize_trip_client_phone_trigger
    if (fires('client_phone')) {
      const phone = row.client_phone as string | null;
      if (phone === null || phone === undefined || phone.replace(/^\s+|\s+$/g, '') === '') row.client_phone = null;
      else {
        const normalized = normalizeIsraeliPhoneNumber(phone);
        if (!normalized) throw pgError('INVALID_CLIENT_PHONE', '22023');
        row.client_phone = normalized;
      }
    }
    // Generated columns.
    const sale = row.sale_price as Dec | null; const cost = row.wholesale_cost as Dec | null; const paid = row.amount_paid as Dec | null;
    row.profit = sale && cost ? decTypmod(decSub(sale, cost), 12, 2) : null;
    row.amount_due = sale && paid ? decTypmod(decSub(sale, paid), 12, 2) : null;
    row.profit_percentage = sale && cost
      ? decTypmod(decCmp(cost, DEC_ZERO) > 0 ? decMul(decDiv(decSub(sale, cost), cost), intDec(100)) : DEC_ZERO, 6, 2) : null;
    const piece = (value: unknown) => (value === null || value === undefined ? '' : String(value));
    row.search_document = `${piece(row.destination)} ${piece(row.client_name)} ${piece(row.hotel_name)} ${piece(row.status)} ${piece(row.payment_status)}`.toLowerCase();
    this.constraints('trips', row);
    for (const column of ['card_paid_amount', 'cash_paid_amount']) {
      if (row[column] !== null && row[column] !== undefined && decCmp(row[column] as Dec, DEC_ZERO) < 0) throw checkViolation('trips', `trips_${column}_check`);
    }
    this.apply('trips', kind, row, before);
    // AFTER: trip_activity_trigger, then trip_financial_audit_trigger (trigger name order).
    let activity = 'trip_edited'; let metadata: Row = {};
    if (kind === 'insert') activity = 'trip_created';
    else if (before && before.deleted_at === null && row.deleted_at !== null) activity = 'trip_soft_deleted';
    else if (before && before.deleted_at !== null && row.deleted_at === null) activity = 'trip_restored';
    else if (before && before.status !== row.status) {
      activity = row.status === 'archived' ? 'trip_archived' : 'trip_status_changed';
      metadata = { previous_status: before.status, new_status: row.status };
    } else if (before && (!jsonbEqual(this.jsonValue('payments', before.payments), this.jsonValue('payments', row.payments))
      || !jsonbEqual(this.jsonValue('amount_paid', before.amount_paid), this.jsonValue('amount_paid', row.amount_paid)))) activity = 'payment_changed';
    this.insertEvent('trip_activity_log', { trip_id: row.id, user_id: row.user_id, actor_user_id: this.ctx.uid, activity_type: activity, metadata, created_at: NOW });
    for (const field of AUDITED) {
      const previous = before ? this.jsonValue(field, before[field]) : null;
      const next = this.jsonValue(field, row[field]);
      if (kind === 'insert' || !jsonbEqual(previous, next)) {
        this.insertEvent('trip_financial_audit', { trip_id: row.id, user_id: row.user_id, actor_user_id: this.ctx.uid, changed_field: field,
          previous_value: kind === 'update' ? previous : null, new_value: next, operation_type: kind, changed_at: NOW });
      }
    }
    return row;
  }

  /** to_jsonb(row)->field */
  private jsonValue(field: string, value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (field in TRIP_NUMERIC) return jsonNumeric(value as Dec);
    return value;
  }

  private constraints(table: keyof typeof NOT_NULL, row: Row) {
    for (const column of NOT_NULL[table]) {
      if (row[column] === null || row[column] === undefined) {
        throw pgError(`null value in column "${column}" of relation "${table}" violates not-null constraint`, '23502');
      }
    }
    for (const [column, values] of Object.entries(ENUMS[table] ?? {})) {
      if (row[column] !== null && row[column] !== undefined && !values.includes(String(row[column]))) throw checkViolation(table, `${table}_${column}_check`);
    }
  }

  private apply(table: Table, kind: 'insert' | 'update' | 'delete', row: Row, before: Row | null) {
    const collection = table === 'trips' ? this.world.trips : table === 'trip_payment_plans' ? this.world.plans
      : table === 'trip_installments' ? this.world.installments : table === 'trip_write_requests' ? this.world.writeRequests : null;
    const key = table === 'trip_write_requests' ? `${row.user_id}__${row.client_request_id}` : String(row.id);
    if (collection) {
      const index = collection.findIndex((item) => (table === 'trip_write_requests' ? `${item.user_id}__${item.client_request_id}` : String(item.id)) === key);
      if (kind === 'insert') { if (index >= 0) throw pgError(`duplicate key value violates unique constraint "${table}_pkey"`, '23505'); collection.push(row); }
      else if (kind === 'update') collection[index] = row;
      else collection.splice(index, 1);
    }
    this.ops.push({ table, kind, key, row: clone(row), ...(before ? { before: clone(before) } : {}) });
  }

  insertEvent(table: 'trip_activity_log' | 'trip_financial_audit' | 'trip_payment_events' | 'trip_installment_events' | 'trip_attachment_cleanup_queue', row: Row) {
    this.ops.push({ table, kind: 'insert', key: `${table}#${this.ops.length}`, row: { id: null, ...row } });
  }

  /** DELETE FROM trips and the rows its foreign keys cascade to (activity rows have no foreign key and stay). */
  deleteTrip(row: Row) {
    this.apply('trips', 'delete', row, row);
    for (const table of ['trip_payment_plans', 'trip_installments', 'trip_payment_events', 'trip_installment_events', 'trip_financial_audit',
      'trip_write_requests', 'trip_packing_lists'] as const) {
      this.ops.push({ table: table as Table, kind: 'delete', key: `cascade:${table}:trip_id=${row.id}`, row: { trip_id: row.id } });
    }
    this.world.plans = this.world.plans.filter((plan) => plan.trip_id !== row.id);
    this.world.installments = this.world.installments.filter((installment) => installment.trip_id !== row.id);
    this.world.writeRequests = this.world.writeRequests.filter((request) => request.trip_id !== row.id);
    if (this.world.packingLists) this.world.packingLists = this.world.packingLists.filter((list) => list.trip_id !== row.id);
  }

  // ---- payment plans and installments

  writePlan(kind: 'insert' | 'update', proposed: Row): Row {
    const before = kind === 'update' ? this.world.plans.find((row) => row.id === proposed.id) ?? null : null;
    const row: Row = { ...(before ?? {}), ...proposed };
    // enforce_cash_payment_plan_row_trigger
    if (row.payment_method === 'cash') {
      if (row.card_total_minor !== 0n || row.installment_count !== 0) throw pgError('INVALID_CASH_PAYMENT_PLAN', '22023');
      if (kind === 'update' && before && ['card', 'mixed'].includes(String(before.payment_method))
        && this.world.installments.some((receipt) => receipt.payment_plan_id === before.id && (receipt.paid_amount_minor as bigint) > 0n)) {
        throw pgError('PAYMENT_PLAN_CONFIRMED_SCHEDULE_CONFLICT', '22023');
      }
      row.card_paid_minor = 0n;
      row.first_installment_date = null;
    }
    this.constraints('trip_payment_plans', row);
    const n = (column: string) => row[column] as bigint;
    const currencyLength = [...String(row.currency)].length;
    if (currencyLength < 3 || currencyLength > 8) throw checkViolation('trip_payment_plans', 'trip_payment_plans_currency_check');
    if ((row.installment_count as number) < 0 || (row.installment_count as number) > 120) throw checkViolation('trip_payment_plans', 'trip_payment_plans_installment_count_check');
    if (row.source !== 'legacy' && n('card_total_minor') + n('cash_total_minor') <= 0n) throw checkViolation('trip_payment_plans', 'trip_payment_plans_source_totals_check');
    if (!(row.source === 'legacy' || (n('card_total_minor') === 0n && row.installment_count === 0) || (n('card_total_minor') > 0n && (row.installment_count as number) >= 1))) {
      throw checkViolation('trip_payment_plans', 'trip_payment_plans_card_schedule_check');
    }
    if (n('card_paid_minor') > n('card_total_minor') || n('card_paid_minor') < 0n || n('card_total_minor') < 0n
      || n('cash_paid_minor') > n('cash_total_minor') || n('cash_paid_minor') < 0n || n('cash_total_minor') < 0n) {
      throw checkViolation('trip_payment_plans', 'trip_payment_plans_amounts_check');
    }
    if (kind === 'insert' && this.world.plans.some((plan) => plan.trip_id === row.trip_id)) {
      throw pgError('duplicate key value violates unique constraint "trip_payment_plans_trip_id_key"', '23505');
    }
    this.apply('trip_payment_plans', kind, row, before);
    this.syncFromNative(String(row.trip_id), String(row.user_id));
    return row;
  }

  writeInstallment(kind: 'insert' | 'update', proposed: Row, syncNow = true): Row {
    const before = kind === 'update' ? this.world.installments.find((row) => row.id === proposed.id) ?? null : null;
    const row: Row = { ...(before ?? {}), ...proposed };
    this.constraints('trip_installments', row);
    const paid = row.paid_amount_minor as bigint; const expected = row.expected_amount_minor as bigint;
    if (!((paid === 0n && row.paid_at === null) || paid > 0n)) throw checkViolation('trip_installments', 'trip_installments_paid_at_check');
    if ((row.installment_number as number) < 1 || (row.installment_number as number) > 120) throw checkViolation('trip_installments', 'trip_installments_installment_number_check');
    if (expected <= 0n) throw checkViolation('trip_installments', 'trip_installments_expected_amount_minor_check');
    if (paid > expected || paid < 0n) throw checkViolation('trip_installments', 'trip_installments_paid_amount_check');
    this.apply('trip_installments', kind, row, before);
    if (syncNow) this.syncFromNative(String(row.trip_id), String(row.user_id));
    return row;
  }

  deleteInstallments(predicate: (row: Row) => boolean) {
    const victims = this.world.installments.filter(predicate);
    for (const row of victims) this.apply('trip_installments', 'delete', row, row);
    for (const row of victims) this.syncFromNative(String(row.trip_id), String(row.user_id));
  }

  /** sync_trip_payment_compatibility_from_native(p_trip_id, p_user_id) */
  syncFromNative(tripId: string, userId: string) {
    const trip = this.world.trips.find((row) => row.id === tripId && row.user_id === userId && row.deleted_at === null);
    if (!trip) return;
    const plan = this.world.plans
      .filter((row) => row.trip_id === tripId && row.user_id === userId && row.source === 'native' && row.deleted_at === null && row.status !== 'cancelled')
      .sort((a, b) => (a.updated_at === b.updated_at ? (String(a.id) < String(b.id) ? 1 : -1) : String(a.updated_at) < String(b.updated_at) ? 1 : -1))[0];
    if (!plan) return;
    const greatest0 = (value: bigint) => (value > 0n ? value : 0n);
    const least = (a: bigint, b: bigint) => (a < b ? a : b);
    const sale = greatest0(minorOf(decOrZero(trip.sale_price)));
    const cash = least(greatest0(plan.cash_total_minor as bigint), greatest0(plan.cash_paid_minor as bigint));
    const receipted = this.world.installments.filter((row) => row.payment_plan_id === plan.id && row.status !== 'cancelled')
      .reduce((sum, row) => sum + (row.paid_amount_minor as bigint), 0n);
    const visa = least(greatest0(plan.card_total_minor as bigint), greatest0(receipted));
    const confirmed = least(sale, cash + visa);
    const hundred = intDec(100);
    this.writeTrip('update', {
      id: trip.id,
      amount_paid: decTypmod(decDiv(intDec(confirmed), hundred), 12, 2),
      payment_status: confirmed <= 0n ? 'unpaid' : confirmed >= sale ? 'paid' : 'partial',
      cash_paid_amount: decDiv(intDec(cash), hundred),
      card_paid_amount: decDiv(intDec(visa), hundred),
      updated_at: NOW,
    }, new Set(['amount_paid', 'payment_status', 'cash_paid_amount', 'card_paid_amount', 'updated_at']));
  }

  /** get_owned_trip_payment_summary(trip) over the transaction's current rows. */
  summary(tripId: string): Row {
    const trip = this.trip(tripId) as Row;
    const stored = (value: unknown) => (value === null || value === undefined ? null : toStoredDecimal((value as Dec).units, (value as Dec).scale));
    const plans = this.world.plans.filter((row) => row.trip_id === tripId).map((row) => ({
      ...row, installment_count: row.installment_count, card_total_minor: Number(row.card_total_minor), cash_total_minor: Number(row.cash_total_minor),
      card_paid_minor: Number(row.card_paid_minor), cash_paid_minor: Number(row.cash_paid_minor), updated_at: row.updated_at === NOW ? this.nowText : row.updated_at,
    })) as unknown as SummaryPlanRow[];
    const installments = this.world.installments.filter((row) => plans.some((plan) => plan.id === row.payment_plan_id)).map((row) => ({
      ...row, expected_amount_minor: Number(row.expected_amount_minor), paid_amount_minor: Number(row.paid_amount_minor),
      updated_at: row.updated_at === NOW ? this.nowText : row.updated_at,
    })) as unknown as SummaryInstallmentRow[];
    return tripPaymentPlanSummary(this.ctx.uid, {
      salePrice: stored(trip.sale_price), amountPaid: stored(trip.amount_paid), cardPaidAmount: stored(trip.card_paid_amount),
      cashPaidAmount: stored(trip.cash_paid_amount), paymentMethod: (trip.payment_method as string | null) ?? null, currency: (trip.currency as string | null) ?? null,
    }, plans, installments, this.ctx.businessToday);
  }

  /** now() for ordering ties inside the transaction: every NOW is the same instant. */
  private readonly nowText = '9999-12-31T23:59:59.999999Z';
}

/** save_trip_transaction(p_trip_data, p_payment_plan, p_client_request_id) as the signed-in owner. */
export function saveTripTransaction(world: TripWorld, input: SaveTripInput, ctx: ModelContext): SaveTripResult {
  const uid = ctx.uid;
  if (!uid) throw raise('USER_NOT_AUTHENTICATED');
  const tx = new TripTransaction(world, ctx);
  const p = input.tripData;

  // 1. Idempotency.
  if (input.clientRequestId !== null) {
    const prior = tx.world.writeRequests.find((row) => row.user_id === uid && row.client_request_id === input.clientRequestId);
    if (prior) return { ops: [], response: prior.response_payload as Row, world: tx.world, replay: true };
  }

  // 2. Edit or create.
  let tripId = nullif(textOf(p, 'id'), '');
  let isEdit = false;
  if (tripId !== null) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) throw pgError(`invalid input syntax for type uuid: "${tripId}"`, '22P02');
    const owned = tx.world.trips.find((row) => row.id === tripId && row.user_id === uid && row.deleted_at === null);
    if (!owned) throw raise('TRIP_NOT_FOUND_OR_ACCESS_DENIED');
    isEdit = true;
  }

  // 3. Upsert.
  const typed = (column: string, value: Dec | null) => {
    const [precision, scale] = TRIP_NUMERIC[column];
    return value === null ? null : decTypmod(value, precision, scale);
  };
  const coalesce = <T>(...values: Array<T | null | undefined>) => values.find((value) => value !== null && value !== undefined) ?? null;
  let saved: Row;
  if (isEdit) {
    const old = tx.world.trips.find((row) => row.id === tripId) as Row;
    const set: Row = {
      id: tripId,
      client_name: coalesce(textOf(p, 'client_name'), old.client_name),
      destination: coalesce(textOf(p, 'destination'), old.destination),
      start_date: coalesce(dateOf(p, 'start_date'), old.start_date),
      end_date: coalesce(dateOf(p, 'end_date'), old.end_date),
      currency: coalesce(textOf(p, 'currency'), old.currency, 'ILS'),
      exchange_rate: coalesce(typed('exchange_rate', numericOf(p, 'exchange_rate')), old.exchange_rate, intDec(1)),
      sale_price: coalesce(typed('sale_price', numericOf(p, 'sale_price')), old.sale_price),
      wholesale_cost: coalesce(typed('wholesale_cost', numericOf(p, 'wholesale_cost')), old.wholesale_cost),
      status: coalesce(textOf(p, 'status'), old.status),
      payment_status: coalesce(textOf(p, 'payment_status'), old.payment_status),
      amount_paid: coalesce(typed('amount_paid', numericOf(p, 'amount_paid')), old.amount_paid),
      payment_date: has(p, 'payment_date') ? dateOf({ v: nullif(textOf(p, 'payment_date'), '') }, 'v') : old.payment_date,
      travelers_count: coalesce(intOf(p, 'travelers_count'), old.travelers_count),
      client_phone: textOf(p, 'client_phone'),
      booking_reference: textOf(p, 'booking_reference'),
      notes: textOf(p, 'notes'),
      service_type: coalesce(textOf(p, 'service_type'), old.service_type),
      hotel_name: textOf(p, 'hotel_name'),
      payment_method: textOf(p, 'payment_method'),
      cash_paid_amount: typed('cash_paid_amount', numericOf(p, 'cash_paid_amount')),
      card_paid_amount: typed('card_paid_amount', numericOf(p, 'card_paid_amount')),
      trip_type: textOf(p, 'trip_type'),
      airline_name: textOf(p, 'airline_name'),
      flight_number: textOf(p, 'flight_number'),
      ticket_class: textOf(p, 'ticket_class'),
      departure_airport: textOf(p, 'departure_airport'),
      arrival_airport: textOf(p, 'arrival_airport'),
      departure_datetime: timestamptzOf(p, 'departure_datetime'),
      arrival_datetime: timestamptzOf(p, 'arrival_datetime'),
      return_flight_number: textOf(p, 'return_flight_number'),
      return_departure_airport: textOf(p, 'return_departure_airport'),
      return_arrival_airport: textOf(p, 'return_arrival_airport'),
      return_departure_datetime: timestamptzOf(p, 'return_departure_datetime'),
      return_arrival_datetime: timestamptzOf(p, 'return_arrival_datetime'),
      ticket_cost_ils: typed('ticket_cost_ils', numericOf(p, 'ticket_cost_ils')),
      ticket_notes: textOf(p, 'ticket_notes'),
      wholesale_original_amount: typed('wholesale_original_amount', numericOf(p, 'wholesale_original_amount')),
      wholesale_currency: coalesce(textOf(p, 'wholesale_currency'), textOf(p, 'currency'), 'ILS'),
      sale_original_amount: typed('sale_original_amount', numericOf(p, 'sale_original_amount')),
      sale_currency: coalesce(textOf(p, 'sale_currency'), textOf(p, 'currency'), 'ILS'),
      room_type: coalesce(jsonOf(p, 'room_type'), old.room_type),
      board_basis: textOf(p, 'board_basis'),
      travelers: coalesce(jsonOf(p, 'travelers'), old.travelers),
      itinerary: coalesce(jsonOf(p, 'itinerary'), old.itinerary),
      payments: coalesce(jsonOf(p, 'payments'), old.payments),
      updated_at: NOW,
    };
    saved = tx.writeTrip('update', set, new Set(Object.keys(set)));
  } else {
    const sale = coalesce(typed('sale_price', numericOf(p, 'sale_price')), decTypmod(DEC_ZERO, 12, 2));
    const cost = coalesce(typed('wholesale_cost', numericOf(p, 'wholesale_cost')), decTypmod(DEC_ZERO, 12, 2));
    const row: Row = {
      id: ctx.newId(), user_id: uid,
      client_name: textOf(p, 'client_name'), destination: textOf(p, 'destination'),
      start_date: dateOf(p, 'start_date'), end_date: dateOf(p, 'end_date'),
      currency: coalesce(textOf(p, 'currency'), 'ILS'),
      exchange_rate: coalesce(typed('exchange_rate', numericOf(p, 'exchange_rate')), intDec(1)),
      sale_price: sale, wholesale_cost: cost,
      status: coalesce(textOf(p, 'status'), 'active'),
      payment_status: coalesce(textOf(p, 'payment_status'), 'unpaid'),
      amount_paid: coalesce(typed('amount_paid', numericOf(p, 'amount_paid')), decTypmod(DEC_ZERO, 12, 2)),
      payment_date: dateOf({ v: nullif(textOf(p, 'payment_date'), '') }, 'v'),
      travelers_count: coalesce(intOf(p, 'travelers_count'), 1),
      client_phone: textOf(p, 'client_phone'), booking_reference: textOf(p, 'booking_reference'), notes: textOf(p, 'notes'),
      service_type: coalesce(textOf(p, 'service_type'), 'both'), hotel_name: textOf(p, 'hotel_name'),
      payment_method: textOf(p, 'payment_method'),
      cash_paid_amount: typed('cash_paid_amount', numericOf(p, 'cash_paid_amount')),
      card_paid_amount: typed('card_paid_amount', numericOf(p, 'card_paid_amount')),
      trip_type: textOf(p, 'trip_type'), airline_name: textOf(p, 'airline_name'), flight_number: textOf(p, 'flight_number'),
      ticket_class: textOf(p, 'ticket_class'), departure_airport: textOf(p, 'departure_airport'), arrival_airport: textOf(p, 'arrival_airport'),
      departure_datetime: timestamptzOf(p, 'departure_datetime'), arrival_datetime: timestamptzOf(p, 'arrival_datetime'),
      return_flight_number: textOf(p, 'return_flight_number'), return_departure_airport: textOf(p, 'return_departure_airport'),
      return_arrival_airport: textOf(p, 'return_arrival_airport'),
      return_departure_datetime: timestamptzOf(p, 'return_departure_datetime'), return_arrival_datetime: timestamptzOf(p, 'return_arrival_datetime'),
      ticket_cost_ils: typed('ticket_cost_ils', numericOf(p, 'ticket_cost_ils')), ticket_notes: textOf(p, 'ticket_notes'),
      wholesale_original_amount: coalesce(typed('wholesale_original_amount', numericOf(p, 'wholesale_original_amount')), numericOf(p, 'wholesale_cost'), DEC_ZERO),
      wholesale_currency: coalesce(textOf(p, 'wholesale_currency'), textOf(p, 'currency'), 'ILS'),
      sale_original_amount: coalesce(typed('sale_original_amount', numericOf(p, 'sale_original_amount')), numericOf(p, 'sale_price'), DEC_ZERO),
      sale_currency: coalesce(textOf(p, 'sale_currency'), textOf(p, 'currency'), 'ILS'),
      room_type: coalesce(jsonOf(p, 'room_type'), {}), board_basis: textOf(p, 'board_basis'),
      travelers: coalesce(jsonOf(p, 'travelers'), []), itinerary: coalesce(jsonOf(p, 'itinerary'), []), payments: coalesce(jsonOf(p, 'payments'), []),
      // Column defaults the INSERT does not name.
      notes_default: undefined, export_to_pdf: false, attachments: [], checklist_flight: false, checklist_hotel: false, checklist_payment: false,
      deleted_at: null, deleted_by: null, created_at: NOW, updated_at: NOW,
    };
    delete row.notes_default;
    saved = tx.writeTrip('insert', row, null);
    tripId = String(saved.id);
  }

  // 4. Payment plan.
  const plan = input.paymentPlan;
  if (plan !== null && textOf(plan, 'method') !== null) {
    const method = textOf(plan, 'method') as string;
    const currency = coalesce(textOf(plan, 'currency'), saved.currency as string | null, 'ILS') as string;
    const cardTotal = coalesce(bigintOf(plan, 'cardTotalMinor'), 0n) as bigint;
    const cashTotal = coalesce(bigintOf(plan, 'cashTotalMinor'), 0n) as bigint;
    const confirmedCash = coalesce(bigintOf(plan, 'confirmedCashMinor'), 0n) as bigint;
    const count = coalesce(intOf(plan, 'installmentCount'), 1) as number;
    const firstDate = coalesce(dateOf(plan, 'firstDate'), ctx.dbToday) as string;
    const current = tx.world.trips.find((row) => row.id === tripId) as Row;
    if (confirmedCash < 0n || confirmedCash > cashTotal) throw pgError('INVALID_CONFIRMED_CASH_AMOUNT', '22023');
    if (!['card', 'cash', 'mixed'].includes(method) || (method === 'card' && cashTotal !== 0n) || (method === 'cash' && cardTotal !== 0n)
      || (method === 'mixed' && (cardTotal <= 0n || cashTotal <= 0n)) || cardTotal + cashTotal !== minorOf(current.sale_price as Dec)) {
      throw pgError('PAYMENT_PLAN_SPLIT_MISMATCH', '22023');
    }
    const existing = tx.world.plans
      .filter((row) => row.trip_id === tripId && row.user_id === uid && row.deleted_at === null && row.status !== 'cancelled')
      .sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? 1 : -1))[0] ?? null;
    let planId = existing ? String(existing.id) : null;
    if (existing && tx.world.installments.some((row) => row.payment_plan_id === existing.id && row.status !== 'cancelled' && (row.paid_amount_minor as bigint) > 0n)
      && (method === 'cash' || existing.payment_method !== method || existing.currency !== currency || existing.card_total_minor !== cardTotal
        || existing.installment_count !== count || existing.first_installment_date !== firstDate)) {
      throw pgError('PAYMENT_PLAN_CONFIRMED_SCHEDULE_CONFLICT', '22023');
    }
    if (method === 'card' || method === 'mixed') {
      if (cardTotal <= 0n || count <= 0 || count > 120 || BigInt(count) > cardTotal) throw pgError('INVALID_PAYMENT_PLAN_CARD_PARAMETERS', '22023');
      const fields = { payment_method: method, currency, card_total_minor: cardTotal, cash_total_minor: cashTotal, cash_paid_minor: confirmedCash,
        installment_count: count, first_installment_date: firstDate, status: 'active', source: 'native' };
      if (planId) tx.writePlan('update', { id: planId, ...fields, updated_at: NOW });
      else {
        planId = ctx.newId();
        tx.writePlan('insert', { id: planId, trip_id: tripId, user_id: uid, card_paid_minor: 0n, notes: null, deleted_at: null, created_at: NOW, updated_at: NOW, ...fields });
      }
      const idForPlan = planId;
      tx.deleteInstallments((row) => row.payment_plan_id === idForPlan && row.paid_amount_minor === 0n && row.status === 'scheduled');
      const base = cardTotal / BigInt(count);
      const last = cardTotal - base * BigInt(count - 1);
      for (let index = 1; index <= count; index += 1) {
        const due = addMonths(firstDate, index - 1);
        const expected = index === count ? last : base;
        const conflict = tx.world.installments.find((row) => row.payment_plan_id === idForPlan && row.installment_number === index);
        if (conflict) {
          if (conflict.paid_amount_minor === 0n) tx.writeInstallment('update', { id: conflict.id, due_date: due, expected_amount_minor: expected, status: 'scheduled', updated_at: NOW });
        } else {
          tx.writeInstallment('insert', { id: ctx.newId(), payment_plan_id: idForPlan, trip_id: tripId, user_id: uid, installment_number: index, due_date: due,
            expected_amount_minor: expected, paid_amount_minor: 0n, paid_at: null, status: 'scheduled', notes: null, created_at: NOW, updated_at: NOW });
        }
      }
    } else if (method === 'cash') {
      const idForPlan = planId;
      const cancelled = tx.world.installments.filter((row) => idForPlan !== null && row.payment_plan_id === idForPlan && row.status !== 'cancelled');
      for (const row of cancelled) tx.writeInstallment('update', { id: row.id, status: 'cancelled', updated_at: NOW }, false);
      for (const row of cancelled) tx.syncFromNative(String(row.trip_id), String(row.user_id));
      const fields = { payment_method: 'cash', currency, cash_total_minor: cashTotal, cash_paid_minor: confirmedCash, card_total_minor: 0n, installment_count: 0,
        status: 'active', source: 'native' };
      if (planId) tx.writePlan('update', { id: planId, ...fields, updated_at: NOW });
      else tx.writePlan('insert', { id: ctx.newId(), trip_id: tripId, user_id: uid, card_paid_minor: 0n, first_installment_date: null, notes: null, deleted_at: null,
        created_at: NOW, updated_at: NOW, ...fields });
    }
  }

  // 5. Legacy aggregates from the native ledger.
  let summary = tx.summary(tripId as string);
  if (summary.payment_source === 'native') {
    const hundred = intDec(100);
    tx.writeTrip('update', {
      id: tripId,
      amount_paid: decTypmod(decDiv(intDec(BigInt(summary.confirmed_total_minor as number)), hundred), 12, 2),
      payment_status: summary.derived_payment_status,
      cash_paid_amount: decDiv(intDec(BigInt(summary.cash_confirmed_minor as number)), hundred),
      card_paid_amount: decDiv(intDec(BigInt(summary.visa_confirmed_minor as number)), hundred),
      updated_at: NOW,
    }, new Set(['amount_paid', 'payment_status', 'cash_paid_amount', 'card_paid_amount', 'updated_at']));
    summary = tx.summary(tripId as string);
  }
  const final = tx.world.trips.find((row) => row.id === tripId) as Row;

  // 6. Activity.
  tx.ops.push({ table: 'trip_activity_log', kind: 'insert', key: `trip_activity_log#${tx.ops.length}`, row: {
    id: null, trip_id: tripId, user_id: uid, actor_user_id: null, activity_type: isEdit ? 'trip_updated' : 'trip_created',
    metadata: { client_name: final.client_name, destination: final.destination }, created_at: NOW,
  } });

  // 7. Response.
  const number = (value: unknown) => (value === null || value === undefined ? null : decNumber(value as Dec));
  const response: Row = {
    id: final.id, client_name: final.client_name, destination: final.destination, currency: final.currency,
    exchange_rate: number(final.exchange_rate), sale_price: number(final.sale_price), amount_paid: number(final.amount_paid),
    amount_due: number(final.amount_due), payment_date: final.payment_date, payment_status: final.payment_status,
    payment_plan_summary: summary, profit: number(final.profit), profit_percentage: number(final.profit_percentage), updated_at: NOW,
  };

  // 8. Idempotency record.
  if (input.clientRequestId !== null) {
    tx.ops.push({ table: 'trip_write_requests', kind: 'insert', key: `${uid}__${input.clientRequestId}`, row: {
      user_id: uid, client_request_id: input.clientRequestId, trip_id: final.id, response_payload: response, created_at: NOW,
    } });
    tx.world.writeRequests.push({ user_id: uid, client_request_id: input.clientRequestId, trip_id: final.id, response_payload: response, created_at: NOW });
  }
  return { ops: tx.ops, response, world: tx.world, replay: false };
}

export const tripDecimalText = (value: Dec) => decText(value);
