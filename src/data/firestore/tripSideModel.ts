/**
 * The tourism side-table writes, as pure functions reproducing the source statements: trip notifications (PostgREST
 * updates under RLS and mark_all_trip_notifications_read), notification settings (upsert), trip templates (insert, update,
 * use_trip_template), packing lists (insert), WhatsApp templates (production lacks the composer columns) and
 * materialize_due_visa_progress_events.
 *
 * Rows are source-shaped; timestamps are ISO text or NOW (the statement's now()). Proven against the local oracle by
 * migration/firestore/tools/travel-side-parity.mjs.
 */
import { NOW, type Row } from './tripWriteModel';
import { DEC_ZERO, type Dec, minorOf, pgError } from './pgNumeric';

export interface SideOp { table: string; kind: 'insert' | 'update' | 'delete'; key: string; row: Row; before?: Row }
export interface SideResult<T> { ops: SideOp[]; rows: Row[]; result: T }
export interface SideContext { uid: string; newId: () => string; businessToday: string }

const checkViolation = (table: string, constraint: string) => pgError(`new row for relation "${table}" violates check constraint "${constraint}"`, '23514');
const trimSpaces = (value: string) => value.replace(/^ +| +$/g, '');
const charLength = (value: unknown) => [...String(value)].length;
const clone = <T>(value: T): T => structuredClone(value);

function update(rows: Row[], ops: SideOp[], table: string, match: (row: Row) => boolean, set: (row: Row) => Row, check?: (row: Row) => void): number {
  let count = 0;
  rows.forEach((row, index) => {
    if (!match(row)) return;
    const next = { ...row, ...set(row) };
    check?.(next);
    ops.push({ table, kind: 'update', key: String(row.id ?? row.user_id), row: clone(next), before: clone(row) });
    rows[index] = next;
    count += 1;
  });
  return count;
}

// ---------------------------------------------------------------- notifications (RLS: the owner's rows)

export function markAllTripNotificationsRead(notifications: Row[], ctx: SideContext): SideResult<number> {
  const rows = clone(notifications); const ops: SideOp[] = [];
  const result = update(rows, ops, 'trip_notifications', (row) => row.user_id === ctx.uid && row.read_at === null && row.dismissed_at === null,
    (row) => ({ read_at: row.read_at ?? NOW }));
  return { ops, rows, result };
}

function notificationUpdate(notifications: Row[], ctx: SideContext, match: (row: Row) => boolean, set: Row): SideResult<number> {
  const rows = clone(notifications); const ops: SideOp[] = [];
  const result = update(rows, ops, 'trip_notifications', (row) => row.user_id === ctx.uid && match(row), () => set, (row) => {
    if (/passport|https?:\/\/|storage_path/i.test(JSON.stringify(row.params ?? {}))) throw checkViolation('trip_notifications', 'trip_notifications_params_check');
  });
  return { ops, rows, result };
}

export const snoozeTripNotification = (notifications: Row[], ctx: SideContext, id: string, until: string) =>
  notificationUpdate(notifications, ctx, (row) => row.id === id, { snoozed_until: new Date(until).toISOString() });
export const dismissTripNotification = (notifications: Row[], ctx: SideContext, id: string, clientNow: string) =>
  notificationUpdate(notifications, ctx, (row) => row.id === id, { dismissed_at: clientNow, read_at: clientNow });
export const clearCompletedTripNotifications = (notifications: Row[], ctx: SideContext, clientNow: string) =>
  notificationUpdate(notifications, ctx, (row) => row.completed_at !== null, { dismissed_at: clientNow });
export const markTripNotificationRead = (notifications: Row[], ctx: SideContext, id: string, clientNow: string) =>
  notificationUpdate(notifications, ctx, (row) => row.id === id, { read_at: clientNow });

// ---------------------------------------------------------------- notification settings

export const NOTIFICATION_SETTING_COLUMNS = ['timezone', 'upcoming_enabled', 'upcoming_days', 'trip_reminder_days', 'payment_enabled',
  'payment_reminder_days', 'cleanup_enabled', 'retention_enabled'];

/** trip_reminder_days_are_safe(value) */
const reminderDaysSafe = (value: unknown) => Array.isArray(value) && value.length >= 1 && value.length <= 20
  && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 365);

/** upsert({ user_id, ...settings, updated_at }) on the user_id primary key. */
export function saveTripNotificationSettings(settings: Row[], ctx: SideContext, values: Row, clientNow: string): SideResult<void> {
  const rows = clone(settings); const ops: SideOp[] = [];
  const index = rows.findIndex((row) => row.user_id === ctx.uid);
  const next: Row = { ...(index >= 0 ? rows[index] : { timezone: 'Asia/Jerusalem', upcoming_enabled: true, upcoming_days: 7, payment_enabled: true,
    cleanup_enabled: true, retention_enabled: true, trip_reminder_days: [30, 14, 7, 1, 0], payment_reminder_days: [7, 3, 1, 0] }), user_id: ctx.uid };
  for (const column of NOTIFICATION_SETTING_COLUMNS) if (Object.prototype.hasOwnProperty.call(values, column)) next[column] = values[column];
  next.updated_at = clientNow;
  for (const column of ['timezone', 'upcoming_enabled', 'upcoming_days', 'payment_enabled', 'cleanup_enabled', 'retention_enabled', 'trip_reminder_days', 'payment_reminder_days']) {
    if (next[column] === null || next[column] === undefined) throw pgError(`null value in column "${column}" of relation "trip_notification_settings" violates not-null constraint`, '23502');
  }
  // PostgreSQL evaluates a table's CHECK constraints in name order, so a row breaking several reports this one first.
  if (!reminderDaysSafe(next.payment_reminder_days)) throw checkViolation('trip_notification_settings', 'trip_notification_settings_payment_days_check');
  if (!reminderDaysSafe(next.trip_reminder_days)) throw checkViolation('trip_notification_settings', 'trip_notification_settings_trip_days_check');
  if (!(Number(next.upcoming_days) >= 1 && Number(next.upcoming_days) <= 90)) throw checkViolation('trip_notification_settings', 'trip_notification_settings_upcoming_days_check');
  if (index >= 0) { ops.push({ table: 'trip_notification_settings', kind: 'update', key: ctx.uid, row: clone(next), before: clone(rows[index]) }); rows[index] = next; }
  else { ops.push({ table: 'trip_notification_settings', kind: 'insert', key: ctx.uid, row: clone(next) }); rows.push(next); }
  return { ops, rows, result: undefined };
}

// ---------------------------------------------------------------- trip templates

const TEMPLATE_TYPES = ['full_trip', 'itinerary', 'hotel', 'transportation', 'pricing', 'checklist', 'message'];

/** trip_template_payload_is_safe(payload): `payload::text !~* '"(...)"\s*:'`, and a SQL NULL payload is safe. */
const templatePayloadSafe = (payload: unknown) => !/"(passport_number|client_phone|payments|attachments|travelers|audit|user_id)"\s*:/i
  .test(JSON.stringify(payload ?? {}));

function checkTemplate(row: Row) {
  if (row.name === null || row.name === undefined) throw pgError('null value in column "name" of relation "trip_templates" violates not-null constraint', '23502');
  // Name order again: ..._name_check, ..._status_check, ..._template_data_check, ..._template_type_check, ..._usage_count_check.
  if (charLength(row.name) < 1 || charLength(row.name) > 120) throw checkViolation('trip_templates', 'trip_templates_name_check');
  if (!['active', 'archived'].includes(String(row.status))) throw checkViolation('trip_templates', 'trip_templates_status_check');
  if (!templatePayloadSafe(row.template_data)) throw checkViolation('trip_templates', 'trip_templates_template_data_check');
  if (!TEMPLATE_TYPES.includes(String(row.template_type))) throw checkViolation('trip_templates', 'trip_templates_template_type_check');
  if (Number(row.usage_count) < 0) throw checkViolation('trip_templates', 'trip_templates_usage_count_check');
}

export function saveTripTemplate(templates: Row[], ctx: SideContext, value: { id?: string; name: string; description?: string; data: unknown; templateType?: string },
  clientNow: string): SideResult<void> {
  const rows = clone(templates); const ops: SideOp[] = [];
  const payload: Row = { name: value.name.trim(), description: value.description?.trim() || null, template_data: value.data,
    template_type: value.templateType || 'full_trip', updated_at: clientNow };
  if (value.id) {
    update(rows, ops, 'trip_templates', (row) => row.id === value.id && row.user_id === ctx.uid, () => payload, checkTemplate);
  } else {
    const row: Row = { id: ctx.newId(), user_id: ctx.uid, ...payload, status: 'active', deleted_at: null, created_at: NOW, is_favorite: false, usage_count: 0, last_used_at: null };
    checkTemplate(row);
    ops.push({ table: 'trip_templates', kind: 'insert', key: String(row.id), row: clone(row) });
    rows.push(row);
  }
  return { ops, rows, result: undefined };
}

export function updateTripTemplate(templates: Row[], ctx: SideContext, id: string, set: Row): SideResult<number> {
  const rows = clone(templates); const ops: SideOp[] = [];
  const result = update(rows, ops, 'trip_templates', (row) => row.id === id && row.user_id === ctx.uid, () => set, checkTemplate);
  return { ops, rows, result };
}

/** use_trip_template(p_template_id) */
export function useTripTemplate(templates: Row[], ctx: SideContext, id: string): SideResult<unknown> {
  const rows = clone(templates); const ops: SideOp[] = [];
  let payload: unknown = null;
  update(rows, ops, 'trip_templates', (row) => row.id === id && row.user_id === ctx.uid && row.status === 'active' && row.deleted_at === null,
    (row) => { payload = row.template_data; return { usage_count: Number(row.usage_count) + 1, last_used_at: NOW, updated_at: NOW }; });
  if (payload === null) throw pgError('Template not found', 'P0002');
  return { ops, rows, result: payload };
}

// ---------------------------------------------------------------- packing lists

export function createPackingList(lists: Row[], trips: Row[], ctx: SideContext, tripId: string, name: string, items: unknown): SideResult<void> {
  const rows = clone(lists); const ops: SideOp[] = [];
  const row: Row = { id: ctx.newId(), trip_id: tripId, user_id: ctx.uid, name, is_template: false, items, deleted_at: null, created_at: NOW, updated_at: NOW };
  if (charLength(name) < 1 || charLength(name) > 120) throw checkViolation('trip_packing_lists', 'trip_packing_lists_name_check');
  if (!Array.isArray(items) || /passport/i.test(JSON.stringify(items))) throw checkViolation('trip_packing_lists', 'trip_packing_lists_items_check');
  // The foreign key sees every trip, not only the caller's.
  if (!trips.some((trip) => trip.id === tripId)) {
    throw pgError('insert or update on table "trip_packing_lists" violates foreign key constraint "trip_packing_lists_trip_id_fkey"', '23503');
  }
  ops.push({ table: 'trip_packing_lists', kind: 'insert', key: String(row.id), row: clone(row) });
  rows.push(row);
  return { ops, rows, result: undefined };
}

// ---------------------------------------------------------------- WhatsApp templates (production schema)

/** PostgREST refuses a payload naming a column the table does not have; production lacks the composer columns. */
export const WHATSAPP_MISSING_COLUMNS = ['category', 'is_favorite', 'is_archived', 'usage_count', 'last_used_at'];
export function whatsappPayloadRefusal(payload: Row): Error | null {
  const missing = Object.keys(payload).find((key) => WHATSAPP_MISSING_COLUMNS.includes(key));
  return missing ? pgError(`Could not find the '${missing}' column of 'trip_whatsapp_templates' in the schema cache`, 'PGRST204') : null;
}

// ---------------------------------------------------------------- visa progress notifications

/** (date::timestamp AT TIME ZONE 'Asia/Jerusalem'): local midnight in Jerusalem as a UTC instant. */
export function jerusalemMidnight(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instant;
  };
  let instant = guess - offsetAt(guess);
  instant = guess - offsetAt(instant);
  return new Date(instant).toISOString();
}

/** materialize_due_visa_progress_events() */
export function materializeDueVisaProgressEvents(world: { notifications: Row[]; trips: Row[]; plans: Row[]; installments: Row[]; rollouts: Row[] },
  ctx: SideContext): SideResult<number> {
  const rows = clone(world.notifications); const ops: SideOp[] = [];
  const rollout = world.rollouts.find((row) => row.feature_key === 'visa-date-collection-v1');
  if (!rollout || rollout.installed_at === null) return { ops, rows, result: 0 };
  const rolloutAt = Date.parse(String(rollout.installed_at));
  let inserted = 0;
  const greatest0 = (value: bigint) => (value > 0n ? value : 0n);
  const least = (a: bigint, b: bigint) => (a < b ? a : b);
  for (const installment of world.installments) {
    if (installment.user_id !== ctx.uid || installment.status === 'cancelled' || String(installment.due_date) > ctx.businessToday) continue;
    const plan = world.plans.find((row) => row.id === installment.payment_plan_id && row.user_id === ctx.uid && row.source === 'native'
      && row.deleted_at === null && row.status !== 'cancelled');
    const trip = world.trips.find((row) => row.id === installment.trip_id && row.user_id === ctx.uid && row.deleted_at === null
      && !['cancelled', 'archived'].includes(String(row.status)));
    if (!plan || !trip) continue;
    const scheduledFor = jerusalemMidnight(String(installment.due_date));
    if (!(Date.parse(scheduledFor) > rolloutAt)) continue;
    const prior = world.installments.filter((row) => row.payment_plan_id === installment.payment_plan_id && row.status !== 'cancelled'
      && (String(row.due_date) < String(installment.due_date) || (row.due_date === installment.due_date && Number(row.installment_number) <= Number(installment.installment_number))));
    const visaPaid = prior.reduce((sum, row) => sum + (row.expected_amount_minor as bigint), 0n);
    const paidInstallments = prior.length;
    const sale = greatest0(minorOf((trip.sale_price as Dec | null) ?? DEC_ZERO));
    const cash = least(greatest0((plan.cash_total_minor as bigint | null) ?? 0n), greatest0((plan.cash_paid_minor as bigint | null) ?? 0n));
    const expected = installment.expected_amount_minor as bigint;
    const key = `visa-schedule:${installment.trip_id}:${installment.id}:${installment.due_date}`;
    if (rows.some((row) => row.user_id === ctx.uid && row.dedupe_key === key)) continue;
    const params = {
      destination: trip.destination, currency: plan.currency, amountMinor: Number(expected),
      previousVisaConfirmedMinor: Number(visaPaid - expected), visaConfirmedMinor: Number(visaPaid),
      previousConfirmedTotalMinor: Number(least(sale, cash + visaPaid - expected)), confirmedTotalMinor: Number(least(sale, cash + visaPaid)),
      previousUnpaidMinor: Number(greatest0(sale - cash - visaPaid + expected)), totalUnpaidMinor: Number(greatest0(sale - cash - visaPaid)),
      previousConfirmedInstallments: paidInstallments - 1, confirmedInstallments: paidInstallments, partialInstallments: 0,
      installmentCount: plan.installment_count, installmentId: installment.id, dueDate: installment.due_date, eventKey: key,
    };
    if (/passport|https?:\/\/|storage_path/i.test(JSON.stringify(params))) throw checkViolation('trip_notifications', 'trip_notifications_params_check');
    const row: Row = { id: ctx.newId(), user_id: ctx.uid, trip_id: installment.trip_id, notification_type: 'visa_schedule_collected',
      title_key: 'notifications.travel.visaScheduleProgressTitle', body_key: 'notifications.travel.visaScheduleProgressBody', params, dedupe_key: key,
      read_at: null, scheduled_for: scheduledFor, created_at: NOW, snoozed_until: null, dismissed_at: null, completed_at: null };
    ops.push({ table: 'trip_notifications', kind: 'insert', key: String(row.id), row: clone(row) });
    rows.push(row);
    inserted += 1;
  }
  return { ops, rows, result: inserted };
}

export const trimForTemplateNotes = trimSpaces;
