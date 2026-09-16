/**
 * Shared comparison for the tourism write parity tools: snapshot the source rows of an owner from the local oracle with
 * exact NUMERIC text, turn them into the write model's representation, and diff source rows against model rows.
 *
 * Comparable values: NUMERIC as `dec:<exact text>` (scale included), BIGINT as text, timestamps equal to the step's now()
 * as NOW, other timestamps as microseconds, everything else as JSON with sorted keys.
 */
import { NOW } from '../../../src/data/firestore/tripWriteModel.ts';
import { decFromText, decText } from '../../../src/data/firestore/pgNumeric.ts';
import { timestampToMicros } from '../../../src/data/firestore/exactValues.ts';

export const TRIP_NUMERIC = new Set(['wholesale_cost', 'sale_price', 'amount_paid', 'profit', 'amount_due', 'profit_percentage', 'exchange_rate',
  'wholesale_original_amount', 'sale_original_amount', 'ticket_cost_ils', 'card_paid_amount', 'cash_paid_amount']);
export const BIGINT = new Set(['card_total_minor', 'cash_total_minor', 'card_paid_minor', 'cash_paid_minor', 'expected_amount_minor', 'paid_amount_minor']);
export const INTEGER = new Set(['travelers_count', 'installment_count', 'installment_number', 'attempts']);
export const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:\d{2}|Z)$/;
const AUDIT_DECIMAL_FIELDS = ['sale_price', 'wholesale_cost', 'amount_paid', 'exchange_rate', 'card_paid_amount', 'cash_paid_amount'];

export const businessToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Rows with top-level jsonb numbers as their exact text (jsonb keeps the numeric's scale). */
const exactRows = (table, where, order) => `SELECT coalesce(jsonb_agg(converted ORDER BY ${order}), '[]'::jsonb)::text AS rows FROM (
  SELECT (SELECT jsonb_object_agg(e.key, CASE WHEN jsonb_typeof(e.value) = 'number' THEN to_jsonb(e.value #>> '{}') ELSE e.value END)
    FROM jsonb_each(to_jsonb(t)) e) AS converted, t.* FROM public.${table} t WHERE ${where}) s`;

export async function snapshot(client, uid) {
  const read = async (table, order) => JSON.parse((await client.query(exactRows(table, 'user_id = $1', order), [uid])).rows[0].rows);
  return {
    trips: await read('trips', 'created_at, id'),
    plans: await read('trip_payment_plans', 'created_at, id'),
    installments: await read('trip_installments', 'payment_plan_id, installment_number'),
    activity: await read('trip_activity_log', 'id'),
    audit: await read('trip_financial_audit', 'id'),
    paymentEvents: await read('trip_payment_events', 'id'),
    installmentEvents: await read('trip_installment_events', 'id'),
    requests: await read('trip_write_requests', 'created_at, client_request_id'),
    cleanupQueue: await read('trip_attachment_cleanup_queue', 'id'),
    packingLists: await read('trip_packing_lists', 'created_at, id'),
  };
}

/** Oracle rows in the model's representation. */
export function modelWorld(state) {
  const typed = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value === null) return [key, null];
    if (TRIP_NUMERIC.has(key)) return [key, decFromText(String(value))];
    if (BIGINT.has(key)) return [key, BigInt(String(value))];
    if (INTEGER.has(key)) return [key, Number(value)];
    return [key, value];
  }));
  return { trips: state.trips.map(typed), plans: state.plans.map(typed), installments: state.installments.map(typed),
    writeRequests: state.requests.map((row) => ({ ...row })), cleanupQueue: state.cleanupQueue.map(typed), packingLists: state.packingLists.map(typed) };
}

/** The ids a step's database generated, in the order the model asks for them: trips, plans, installments by number. */
export function idQueue(before, after) {
  const known = (rows) => new Set(rows.map((row) => row.id));
  const trips = known(before.trips); const plans = known(before.plans); const installments = known(before.installments);
  return [...after.trips.filter((row) => !trips.has(row.id)).map((row) => row.id),
    ...after.plans.filter((row) => !plans.has(row.id)).map((row) => row.id),
    ...after.installments.filter((row) => !installments.has(row.id)).sort((a, b) => Number(a.installment_number) - Number(b.installment_number)).map((row) => row.id)];
}

export function comparable(value, now) {
  if (value === null || value === undefined) return null;
  if (value === NOW) return 'NOW';
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && typeof value.units === 'bigint') return `dec:${decText(value)}`;
  if (value && typeof value === 'object' && typeof value.__numeric === 'string') return `dec:${decText(decFromText(value.__numeric))}`;
  if (typeof value === 'string' && TIMESTAMP.test(value)) return String(timestampToMicros(value)) === now ? 'NOW' : `ts:${timestampToMicros(value)}`;
  if (Array.isArray(value)) return value.map((item) => comparable(item, now));
  if (typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key], now)]));
  return value;
}

export function oracleComparable(table, row, now) {
  return Object.fromEntries(Object.keys(row).sort().map((key) => {
    const value = row[key];
    if (value !== null && TRIP_NUMERIC.has(key) && table === 'trips') return [key, `dec:${decText(decFromText(String(value)))}`];
    if (value !== null && BIGINT.has(key)) return [key, String(value)];
    if (value !== null && INTEGER.has(key)) return [key, Number(value)];
    if (value !== null && ['previous_value', 'new_value'].includes(key) && typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)
      && AUDIT_DECIMAL_FIELDS.includes(row.changed_field)) {
      return [key, `dec:${decText(decFromText(value))}`];
    }
    return [key, comparable(value, now)];
  }));
}

const GENERATED_ID_TABLES = new Set(['trip_activity_log', 'trip_financial_audit', 'trip_payment_events', 'trip_installment_events', 'trip_attachment_cleanup_queue']);

export function diffRows(label, oracleRows, modelRows, now, table) {
  const problems = [];
  if (oracleRows.length !== modelRows.length) problems.push(`${label}: ${oracleRows.length} source rows, ${modelRows.length} model rows`);
  for (let index = 0; index < Math.min(oracleRows.length, modelRows.length); index += 1) {
    const a = oracleComparable(table, oracleRows[index], now);
    const b = comparable(modelRows[index], now);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => key !== 'id' || !GENERATED_ID_TABLES.has(table));
    const differing = keys.filter((key) => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null));
    if (differing.length) {
      problems.push(`${label}[${index}]: ${differing.map((key) => `${key} source=${JSON.stringify(a[key] ?? null).slice(0, 80)} model=${JSON.stringify(b[key] ?? null).slice(0, 80)}`).join('; ')}`);
    }
  }
  return problems;
}

export const sortInstallments = (rows) => [...rows].sort((a, b) => (String(a.payment_plan_id) < String(b.payment_plan_id) ? -1
  : String(a.payment_plan_id) > String(b.payment_plan_id) ? 1 : Number(a.installment_number) - Number(b.installment_number)));

/** Source rows after a step against the model's: stored tables in full, event tables by the rows the step inserted. */
export function compareWrites(before, after, modelResult, now) {
  const problems = [];
  const world = modelResult.world;
  problems.push(...diffRows('trips', after.trips, world.trips, now, 'trips'));
  problems.push(...diffRows('plans', after.plans, world.plans, now, 'trip_payment_plans'));
  problems.push(...diffRows('installments', after.installments, sortInstallments(world.installments), now, 'trip_installments'));
  problems.push(...diffRows('requests', after.requests, world.writeRequests, now, 'trip_write_requests'));
  const inserted = (table) => modelResult.ops.filter((op) => op.table === table && op.kind === 'insert').map((op) => op.row);
  const added = (rows, beforeRows) => { const ids = new Set(beforeRows.map((row) => String(row.id))); return rows.filter((row) => !ids.has(String(row.id))); };
  problems.push(...diffRows('activity', added(after.activity, before.activity), inserted('trip_activity_log'), now, 'trip_activity_log'));
  problems.push(...diffRows('audit', added(after.audit, before.audit), inserted('trip_financial_audit'), now, 'trip_financial_audit'));
  problems.push(...diffRows('paymentEvents', added(after.paymentEvents, before.paymentEvents), inserted('trip_payment_events'), now, 'trip_payment_events'));
  problems.push(...diffRows('installmentEvents', added(after.installmentEvents, before.installmentEvents), inserted('trip_installment_events'), now, 'trip_installment_events'));
  problems.push(...diffRows('cleanupQueue', added(after.cleanupQueue, before.cleanupQueue), inserted('trip_attachment_cleanup_queue'), now, 'trip_attachment_cleanup_queue'));
  // Cascades: every row the source removed with a trip must be named by a model cascade, and nothing else removed.
  const deletedTrips = new Set(modelResult.ops.filter((op) => op.table === 'trips' && op.kind === 'delete').map((op) => String(op.row.id)));
  for (const [label, table] of [['audit', 'trip_financial_audit'], ['paymentEvents', 'trip_payment_events'], ['installmentEvents', 'trip_installment_events']]) {
    const removed = before[label].filter((row) => !after[label].some((other) => String(other.id) === String(row.id)));
    const cascaded = removed.filter((row) => deletedTrips.has(String(row.trip_id)) && modelResult.ops.some((op) => op.table === table && op.kind === 'delete'
      && op.key === `cascade:${table}:trip_id=${row.trip_id}`));
    if (removed.length !== cascaded.length) problems.push(`${label}: source removed ${removed.length} rows, model cascades cover ${cascaded.length}`);
    const kept = after[label].filter((row) => deletedTrips.has(String(row.trip_id)));
    if (kept.length) problems.push(`${label}: ${kept.length} source rows survived a deleted trip`);
  }
  return problems;
}
