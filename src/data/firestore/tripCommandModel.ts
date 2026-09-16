/**
 * The remaining trip writes of the tourism screens, as pure transactions over the same state machine as
 * save_trip_transaction (tripWriteModel.ts): direct row updates PostgREST runs under RLS (user_id = auth.uid()), the trash
 * functions, the payment functions and log_trip_activity. Each reproduces the source statement by statement, so the
 * trip, plan and installment triggers fire where they fire in the source.
 *
 * Proven against the local PostgreSQL oracle by migration/firestore/tools/travel-write-parity.mjs.
 */
import { NOW, TripTransaction, addMonths, type ModelContext, type Row, type TripWorld, type WriteOp } from './tripWriteModel';
import { pgError } from './pgNumeric';

export interface CommandResult<T> { ops: WriteOp[]; world: TripWorld; result: T }

function run<T>(world: TripWorld, ctx: ModelContext, work: (tx: TripTransaction) => T): CommandResult<T> {
  const tx = new TripTransaction(world, ctx);
  const result = work(tx);
  return { ops: tx.ops, world: tx.world, result };
}

/** The columns a trips INSERT may not name (GENERATED ALWAYS ... STORED). */
export const GENERATED_TRIP_COLUMNS = ['profit', 'profit_percentage', 'amount_due', 'search_document'];
/** trim(): spaces only. */
const sqlTrim = (value: string | null | undefined) => (value === null || value === undefined ? null : value.replace(/^ +| +$/g, ''));
const nullIfEmpty = (value: string | null) => (value === '' ? null : value);
const owned = (tx: TripTransaction, id: string) => tx.world.trips.filter((row) => row.id === id && row.user_id === tx.ctx.uid);
const bigintJson = (row: Row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]));

// ---------------------------------------------------------------- direct trip row updates (SupabaseTravelRepository)

/** UPDATE trips SET deleted_at = NULL, deleted_by = NULL, updated_at = :now WHERE id AND user_id AND deleted_at IS NOT NULL */
export function restoreTrip(world: TripWorld, ctx: ModelContext, id: string, clientNow: string): CommandResult<string> {
  return run(world, ctx, (tx) => {
    const rows = owned(tx, id).filter((row) => row.deleted_at !== null);
    if (!rows.length) throw new Error('TRIP_RESTORE_NOT_APPLIED');
    for (const row of rows) tx.writeTrip('update', { id: row.id, deleted_at: null, deleted_by: null, updated_at: clientNow }, new Set(['deleted_at', 'deleted_by', 'updated_at']));
    return id;
  });
}

export function deleteTrip(world: TripWorld, ctx: ModelContext, id: string, clientNow: string): CommandResult<string> {
  return run(world, ctx, (tx) => {
    const rows = owned(tx, id).filter((row) => row.deleted_at === null);
    if (!rows.length) throw new Error('TRIP_DELETE_NOT_APPLIED');
    for (const row of rows) tx.writeTrip('update', { id: row.id, deleted_at: clientNow, deleted_by: ctx.uid, updated_at: clientNow }, new Set(['deleted_at', 'deleted_by', 'updated_at']));
    return id;
  });
}

export function archiveTrip(world: TripWorld, ctx: ModelContext, id: string, archived: boolean, clientNow: string): CommandResult<void> {
  return run(world, ctx, (tx) => {
    for (const row of owned(tx, id).filter((trip) => trip.deleted_at === null)) {
      tx.writeTrip('update', { id: row.id, status: archived ? 'archived' : 'active', updated_at: clientNow }, new Set(['status', 'updated_at']));
    }
  });
}

export function toggleExport(world: TripWorld, ctx: ModelContext, id: string, value: boolean, clientNow: string): CommandResult<void> {
  return run(world, ctx, (tx) => {
    for (const row of owned(tx, id).filter((trip) => trip.deleted_at === null)) {
      tx.writeTrip('update', { id: row.id, export_to_pdf: value, updated_at: clientNow }, new Set(['export_to_pdf', 'updated_at']));
    }
  });
}

/** TripSmartToolsDialog: UPDATE trips SET itinerary, updated_at WHERE id (RLS: the owner's rows, deleted or not). */
export function updateTripItinerary(world: TripWorld, ctx: ModelContext, id: string, itinerary: unknown, clientNow: string): CommandResult<void> {
  return run(world, ctx, (tx) => {
    for (const row of owned(tx, id)) tx.writeTrip('update', { id: row.id, itinerary, updated_at: clientNow }, new Set(['itinerary', 'updated_at']));
  });
}

/** TripWhatsappDialog: UPDATE trips SET client_phone WHERE id AND user_id; PHONE_UPDATE_FAILED on any error or no row. */
export function updateTripClientPhone(world: TripWorld, ctx: ModelContext, id: string, phone: string): CommandResult<void> {
  try {
    return run(world, ctx, (tx) => {
      const rows = owned(tx, id);
      if (!rows.length) throw new Error('PHONE_UPDATE_FAILED');
      for (const row of rows) tx.writeTrip('update', { id: row.id, client_phone: phone }, new Set(['client_phone']));
    });
  } catch {
    throw new Error('PHONE_UPDATE_FAILED');
  }
}

/**
 * Settings import: INSERT INTO trips (<backup keys>, user_id). A backup made by the export holds every column, including
 * the generated ones, which PostgreSQL refuses (428C9); the source import fails on such a file and so does this one.
 */
export function importTripRefusal(tripData: Row): Error | null {
  const generated = Object.keys(tripData).find((key) => GENERATED_TRIP_COLUMNS.includes(key));
  return generated ? pgError(`cannot insert a non-DEFAULT value into column "${generated}"`, '428C9') : null;
}

// ---------------------------------------------------------------- trash

/** restore_deleted_trips(p_trip_ids) */
export function restoreDeletedTrips(world: TripWorld, ctx: ModelContext, ids: string[]): CommandResult<number> {
  return run(world, ctx, (tx) => {
    const rows = tx.world.trips.filter((row) => ids.includes(String(row.id)) && row.user_id === ctx.uid && row.deleted_at !== null);
    for (const row of rows) tx.writeTrip('update', { id: row.id, deleted_at: null, deleted_by: null, updated_at: NOW }, new Set(['deleted_at', 'deleted_by', 'updated_at']));
    return rows.length;
  });
}

/** permanently_delete_trips(p_trip_ids): activity, cleanup job, then the delete with its cascades. */
export function permanentlyDeleteTrips(world: TripWorld, ctx: ModelContext, ids: string[]): CommandResult<number> {
  return run(world, ctx, (tx) => {
    const rows = tx.world.trips.filter((row) => ids.includes(String(row.id)) && row.user_id === ctx.uid && row.deleted_at !== null);
    for (const row of rows) tx.insertEvent('trip_activity_log', { trip_id: row.id, user_id: row.user_id, actor_user_id: ctx.uid, activity_type: 'trip_permanently_deleted', metadata: {}, created_at: NOW });
    for (const row of rows) {
      tx.insertEvent('trip_attachment_cleanup_queue', { trip_id: row.id, user_id: row.user_id, attachments: row.attachments ?? [], status: 'pending', attempts: 0,
        last_error: null, created_at: NOW, completed_at: null, last_attempted_at: null, next_retry_at: NOW });
    }
    for (const row of rows) tx.deleteTrip(row);
    return rows.length;
  });
}

// ---------------------------------------------------------------- payments

/** create_trip_payment_plan(...) */
export function createTripPaymentPlan(world: TripWorld, ctx: ModelContext, input: {
  tripId: string; method: string; currency: string; cardTotalMinor: bigint; cashTotalMinor: bigint; installmentCount: number; firstDate: string | null; notes?: string | null;
}): CommandResult<string> {
  return run(world, ctx, (tx) => {
    const uid = ctx.uid;
    if (!tx.world.trips.some((row) => row.id === input.tripId && row.user_id === uid && row.deleted_at === null)) throw pgError('Trip not found', 'P0002');
    const { method, cardTotalMinor: card, cashTotalMinor: cash, installmentCount: count } = input;
    if (!['card', 'cash', 'mixed'].includes(method) || card < 0n || cash < 0n) throw pgError('Invalid payment plan', '22023');
    if ((method === 'card' && cash !== 0n) || (method === 'cash' && card !== 0n) || (method === 'mixed' && (card === 0n || cash === 0n))) {
      throw pgError('Payment method totals do not match', '22023');
    }
    if (card > 0n && (count < 1 || count > 120 || input.firstDate === null)) throw pgError('Card installment schedule is incomplete', '22023');
    if (card > 0n && BigInt(count) > card) throw pgError('Installment amount must be at least one minor unit', '22023');
    const current = tx.world.plans.filter((row) => row.trip_id === input.tripId && row.user_id === uid && row.deleted_at === null && row.status !== 'cancelled');
    for (const row of current) tx.writePlan('update', { id: row.id, status: 'cancelled', deleted_at: NOW, updated_at: NOW });
    const planId = ctx.newId();
    tx.writePlan('insert', {
      id: planId, trip_id: input.tripId, user_id: uid, payment_method: method, currency: String(input.currency).toUpperCase(),
      card_total_minor: card, cash_total_minor: cash, card_paid_minor: 0n, cash_paid_minor: 0n,
      installment_count: card > 0n ? count : 0, first_installment_date: card > 0n ? input.firstDate : null,
      source: 'native', status: 'active', notes: nullIfEmpty(sqlTrim(input.notes ?? null)), deleted_at: null, created_at: NOW, updated_at: NOW,
    });
    if (card > 0n) {
      const base = card / BigInt(count);
      const inserted: Row[] = [];
      for (let index = 1; index <= count; index += 1) {
        inserted.push(tx.writeInstallment('insert', {
          id: ctx.newId(), payment_plan_id: planId, trip_id: input.tripId, user_id: uid, installment_number: index,
          due_date: addMonths(input.firstDate as string, index - 1), expected_amount_minor: index === count ? card - base * BigInt(count - 1) : base,
          paid_amount_minor: 0n, paid_at: null, status: 'scheduled', notes: null, created_at: NOW, updated_at: NOW,
        }));
      }
      // Source defect, preserved: the INSERT ... SELECT that logs 'created' events aliases trip_installments as `i`, which
      // collides with the PL/pgSQL loop variable `i`, so every card or mixed plan fails here and the transaction rolls back
      // (42702). Production runs the identical function body. The events below are what the statement intends.
      if (inserted.length) throw pgError('column reference "i" is ambiguous', '42702');
    }
    return planId;
  });
}

/** record_trip_cash_payment(p_payment_plan_id, p_paid_amount_minor, p_paid_at, p_notes) */
export function recordCashPayment(world: TripWorld, ctx: ModelContext, planId: string, paidMinor: bigint, paidAt: string, notes?: string | null): CommandResult<Row> {
  return run(world, ctx, (tx) => {
    const old = tx.world.plans.find((row) => row.id === planId && row.user_id === ctx.uid && row.deleted_at === null && row.status !== 'cancelled');
    if (!old) throw pgError('Payment plan not found', 'P0002');
    const cashTotal = old.cash_total_minor as bigint;
    if (cashTotal === 0n || paidMinor < 0n || paidMinor > cashTotal) throw pgError('Invalid cash payment', '22023');
    const next = tx.writePlan('update', {
      id: planId, cash_paid_minor: paidMinor, notes: nullIfEmpty(sqlTrim(notes ?? null)), updated_at: NOW,
      status: (old.card_paid_minor as bigint) >= (old.card_total_minor as bigint) && paidMinor >= cashTotal ? 'completed' : 'active',
    });
    tx.insertEvent('trip_payment_events', { payment_plan_id: next.id, trip_id: next.trip_id, user_id: next.user_id, actor_user_id: ctx.uid,
      event_type: paidMinor === 0n ? 'cash_undone' : (old.cash_paid_minor as bigint) === 0n ? 'cash_paid' : 'cash_corrected',
      previous_state: bigintJson(old), new_state: { ...bigintJson(next), recorded_at: new Date(paidAt).toISOString() }, created_at: NOW });
    return bigintJson(next);
  });
}

/** record_trip_installment_payment(p_installment_id, p_paid_amount_minor, p_paid_at, p_notes), manual Visa receipt. */
export function recordInstallmentPayment(world: TripWorld, ctx: ModelContext, id: string, paidMinor: bigint, paidAt: string, notes?: string | null): CommandResult<Row> {
  return run(world, ctx, (tx) => {
    const old = tx.world.installments.find((row) => row.id === id && row.user_id === ctx.uid);
    if (!old) throw pgError('Installment not found', 'P0002');
    const expected = old.expected_amount_minor as bigint;
    if (old.status === 'cancelled' || paidMinor < 0n || paidMinor > expected) throw pgError('Invalid installment payment', '22023');
    const next = tx.writeInstallment('update', {
      id, paid_amount_minor: paidMinor, paid_at: paidMinor > 0n ? new Date(paidAt).toISOString() : null,
      status: paidMinor === 0n ? 'scheduled' : paidMinor === expected ? 'paid' : 'partially_paid', notes: nullIfEmpty(sqlTrim(notes ?? null)), updated_at: NOW,
    });
    tx.insertEvent('trip_installment_events', { installment_id: next.id, trip_id: next.trip_id, user_id: next.user_id, actor_user_id: ctx.uid,
      event_type: paidMinor === 0n ? 'payment_undone' : (old.paid_amount_minor as bigint) === 0n ? 'paid' : 'corrected',
      previous_state: bigintJson(old), new_state: bigintJson(next), created_at: NOW });
    const receipted = tx.world.installments.filter((row) => row.payment_plan_id === next.payment_plan_id)
      .reduce((sum, row) => sum + (row.paid_at !== null ? (row.paid_amount_minor as bigint) : 0n), 0n);
    if (tx.world.plans.some((plan) => plan.id === next.payment_plan_id)) {
      tx.writePlan('update', { id: next.payment_plan_id, card_paid_minor: receipted, updated_at: NOW });
    }
    return bigintJson(next);
  });
}

/** reschedule_trip_installment(p_installment_id, p_due_date) */
export function rescheduleInstallment(world: TripWorld, ctx: ModelContext, id: string, dueDate: string): CommandResult<Row> {
  return run(world, ctx, (tx) => {
    const old = tx.world.installments.find((row) => row.id === id && row.user_id === ctx.uid);
    if (!old) throw pgError('Installment not found', 'P0002');
    if (old.status === 'cancelled' || (old.paid_amount_minor as bigint) > 0n || String(old.due_date) <= ctx.businessToday) {
      throw pgError('Collected or cancelled installments cannot be rescheduled', '22023');
    }
    const next = tx.writeInstallment('update', { id, due_date: dueDate, updated_at: NOW });
    tx.insertEvent('trip_installment_events', { installment_id: next.id, trip_id: next.trip_id, user_id: next.user_id, actor_user_id: ctx.uid,
      event_type: 'rescheduled', previous_state: bigintJson(old), new_state: bigintJson(next), created_at: NOW });
    return bigintJson(next);
  });
}

/** recalculate_future_trip_installments(p_payment_plan_id, p_new_card_total_minor) */
export function recalculateFutureInstallments(world: TripWorld, ctx: ModelContext, planId: string, newCardTotal: bigint): CommandResult<number> {
  return run(world, ctx, (tx) => {
    const plan = tx.world.plans.find((row) => row.id === planId && row.user_id === ctx.uid && row.source === 'native' && row.deleted_at === null && row.status !== 'cancelled');
    if (!plan) throw pgError('Payment plan not found', 'P0002');
    const today = ctx.businessToday;
    const live = tx.world.installments.filter((row) => row.payment_plan_id === plan.id && row.status !== 'cancelled');
    const future = (row: Row) => String(row.due_date) > today && row.paid_amount_minor === 0n && row.status === 'scheduled';
    const fixedTotal = live.filter((row) => !future(row)).reduce((sum, row) => sum + (row.expected_amount_minor as bigint), 0n);
    const futureCount = live.filter(future).length;
    if (newCardTotal < fixedTotal || futureCount === 0) throw pgError('New total cannot alter collected installments', '22023');
    const remaining = newCardTotal - fixedTotal;
    const base = remaining / BigInt(futureCount);
    if (base <= 0n) throw pgError('Future installments must be positive', '22023');
    const targets = tx.world.installments.filter((row) => row.payment_plan_id === plan.id && future(row))
      .sort((a, b) => (a.installment_number as number) - (b.installment_number as number));
    targets.forEach((row, index) => {
      tx.writeInstallment('update', { id: row.id, expected_amount_minor: index + 1 === futureCount ? remaining - base * BigInt(futureCount - 1) : base, updated_at: NOW }, false);
    });
    for (const row of targets) tx.syncFromNative(String(row.trip_id), String(row.user_id));
    tx.writePlan('update', { id: plan.id, card_total_minor: newCardTotal, updated_at: NOW });
    tx.insertEvent('trip_payment_events', { payment_plan_id: plan.id, trip_id: plan.trip_id, user_id: plan.user_id, actor_user_id: ctx.uid,
      event_type: 'plan_recalculated', previous_state: bigintJson(plan), new_state: { card_total_minor: Number(newCardTotal) }, created_at: NOW });
    return targets.length;
  });
}

// ---------------------------------------------------------------- activity

export const LOGGED_ACTIVITY_TYPES = ['pdf_generated', 'export_created', 'trip_duplicated', 'created_from_template', 'notification_sent',
  'whatsapp_prepared', 'attachment_uploaded', 'cleanup_retried'];

/** log_trip_activity(p_trip_id, p_activity_type, p_metadata): nothing is written for a trip the caller does not own. */
export function logTripActivity(world: TripWorld, ctx: ModelContext, tripId: string, activityType: string, metadata: unknown): CommandResult<boolean> {
  return run(world, ctx, (tx) => {
    if (!LOGGED_ACTIVITY_TYPES.includes(activityType)) throw pgError('Unsupported activity type', 'P0001');
    if (/passport|encryption|storage_path|https?:\/\/|attachment_url/i.test(JSON.stringify(metadata ?? {}))) throw pgError('Unsafe activity metadata', 'P0001');
    const trip = tx.world.trips.find((row) => row.id === tripId && row.user_id === ctx.uid);
    if (!trip) return false;
    tx.insertEvent('trip_activity_log', { trip_id: trip.id, user_id: trip.user_id, actor_user_id: ctx.uid, activity_type: activityType,
      metadata: metadata ?? {}, created_at: NOW });
    return true;
  });
}
