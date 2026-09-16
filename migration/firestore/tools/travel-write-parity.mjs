#!/usr/bin/env node
/**
 * Tourism write parity: the pure trip write model (src/data/firestore/tripWriteModel.ts) must write, row for row, what
 * save_trip_transaction and the trip triggers write in the source.
 *
 * The oracle is a local PostgreSQL built from the platform fixture, every migration and the production catalog overlay
 * (migration/firestore/lib/travel-postgres-oracle.mjs); nothing connects to production. Each scenario step runs the real
 * function as the owner, then runs the model on the same prior rows with the ids the database generated, and compares:
 *   trips, trip_payment_plans, trip_installments   every column, NUMERIC as exact decimal text (scale included)
 *   trip_activity_log, trip_financial_audit, trip_write_requests   the rows the step inserted, in id order
 *   the function's response, or the error code when the function refuses
 * Timestamps equal to the transaction's now() compare as NOW; other timestamps by instant.
 *
 * Run from an ASCII path (see travel-postgres-oracle.mjs):
 *   cd M:\ && node scripts/run-typescript-source-test.mjs migration/firestore/tools/travel-write-parity.mjs
 *
 * Writes migration/reports/travel-write-parity.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { startTravelOracle } from '../lib/travel-postgres-oracle.mjs';
import { saveTripTransaction, NOW } from '../../../src/data/firestore/tripWriteModel.ts';
import { decFromText, decText } from '../../../src/data/firestore/pgNumeric.ts';
import { timestampToMicros } from '../../../src/data/firestore/exactValues.ts';

const TRIP_NUMERIC = new Set(['wholesale_cost', 'sale_price', 'amount_paid', 'profit', 'amount_due', 'profit_percentage', 'exchange_rate',
  'wholesale_original_amount', 'sale_original_amount', 'ticket_cost_ils', 'card_paid_amount', 'cash_paid_amount']);
const BIGINT = new Set(['card_total_minor', 'cash_total_minor', 'card_paid_minor', 'cash_paid_minor', 'expected_amount_minor', 'paid_amount_minor']);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:\d{2}|Z)$/;
const INTEGER = new Set(['travelers_count', 'installment_count', 'installment_number']);
const businessToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Rows with top-level jsonb numbers as their exact text (jsonb keeps the numeric's scale). */
const exactRows = (table, where, order) => `SELECT coalesce(jsonb_agg(converted ORDER BY ${order}), '[]'::jsonb)::text AS rows FROM (
  SELECT (SELECT jsonb_object_agg(e.key, CASE WHEN jsonb_typeof(e.value) = 'number' THEN to_jsonb(e.value #>> '{}') ELSE e.value END)
    FROM jsonb_each(to_jsonb(t)) e) AS converted, t.* FROM public.${table} t WHERE ${where}) s`;

async function snapshot(client, uid) {
  const read = async (table, where, order, params) => JSON.parse((await client.query(exactRows(table, where, order), params)).rows[0].rows);
  return {
    trips: await read('trips', 'user_id = $1', 'created_at, id', [uid]),
    plans: await read('trip_payment_plans', 'user_id = $1', 'created_at, id', [uid]),
    installments: await read('trip_installments', 'user_id = $1', 'payment_plan_id, installment_number', [uid]),
    activity: await read('trip_activity_log', 'user_id = $1', 'id', [uid]),
    audit: await read('trip_financial_audit', 'user_id = $1', 'id', [uid]),
    requests: await read('trip_write_requests', 'user_id = $1', 'created_at, client_request_id', [uid]),
  };
}

/** Oracle rows in the model's representation. */
function modelWorld(state) {
  const typed = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value === null) return [key, null];
    if (TRIP_NUMERIC.has(key)) return [key, decFromText(String(value))];
    if (BIGINT.has(key)) return [key, BigInt(String(value))];
    if (key === 'installment_count' || key === 'installment_number' || key === 'travelers_count') return [key, Number(value)];
    return [key, value];
  }));
  return { trips: state.trips.map(typed), plans: state.plans.map(typed), installments: state.installments.map(typed),
    writeRequests: state.requests.map((row) => ({ ...row })) };
}

/** A comparable value: exact decimal text, bigint text, NOW, instants as microseconds. */
function comparable(value, now) {
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
/** Oracle values: numbers that were exact text stay decimals where the column is numeric. */
function oracleComparable(table, row, now) {
  return Object.fromEntries(Object.keys(row).sort().map((key) => {
    const value = row[key];
    if (value !== null && (TRIP_NUMERIC.has(key) && table === 'trips')) return [key, `dec:${decText(decFromText(String(value)))}`];
    if (value !== null && BIGINT.has(key)) return [key, String(value)];
    if (value !== null && INTEGER.has(key)) return [key, Number(value)];
    if (value !== null && ['previous_value', 'new_value'].includes(key) && typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)
      && ['sale_price', 'wholesale_cost', 'amount_paid', 'exchange_rate', 'card_paid_amount', 'cash_paid_amount'].includes(row.changed_field)) {
      return [key, `dec:${decText(decFromText(value))}`];
    }
    return [key, comparable(value, now)];
  }));
}

function diffRows(label, oracleRows, modelRows, now, table) {
  const problems = [];
  if (oracleRows.length !== modelRows.length) problems.push(`${label}: ${oracleRows.length} source rows, ${modelRows.length} model rows`);
  for (let index = 0; index < Math.min(oracleRows.length, modelRows.length); index += 1) {
    const a = oracleComparable(table, oracleRows[index], now);
    const b = comparable(modelRows[index], now);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => key !== 'id' || !['trip_activity_log', 'trip_financial_audit'].includes(table));
    const differing = keys.filter((key) => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null));
    if (differing.length) problems.push(`${label}[${index}]: ${differing.map((key) => `${key} source=${JSON.stringify(a[key] ?? null).slice(0, 80)} model=${JSON.stringify(b[key] ?? null).slice(0, 80)}`).join('; ')}`);
  }
  return problems;
}

const uid = '60000000-0000-4000-8000-000000000001';
const other = '60000000-0000-4000-8000-000000000002';
const base = {
  client_name: 'Parity Client', destination: 'Rome', start_date: '2027-03-01', end_date: '2027-03-08', currency: 'ILS', exchange_rate: 1,
  wholesale_cost: 900, sale_price: 1200.5, payment_status: 'unpaid', amount_paid: 0, travelers_count: 2, client_phone: '050-123-4567',
  service_type: 'both', payment_method: 'cash', travelers: [{ full_name: 'Dana Levi', nationality: 'IL' }], itinerary: [], payments: [],
  notes: '', status: 'active', room_type: {}, board_basis: null, hotel_name: 'Hotel Roma', trip_type: 'round_trip', ticket_class: 'economy',
  departure_datetime: '2027-03-01T08:00:00.000Z', arrival_datetime: null, wholesale_original_amount: 900, wholesale_currency: 'ILS',
  sale_original_amount: 1200.5, sale_currency: 'ILS', attachments: [], cash_paid_amount: null, card_paid_amount: null,
};
const cashPlan = (confirmed) => ({ method: 'cash', currency: 'ILS', cardTotalMinor: 0, cashTotalMinor: 120050, confirmedCashMinor: confirmed, installmentCount: 0, firstDate: '2027-02-01' });

/** Each scenario: a list of steps; a step names the payload (with an optional edit of a trip created earlier). */
const SCENARIOS = [
  { name: 'create, cash, nothing confirmed', steps: [{ trip: base, plan: cashPlan(0), request: 'r1' }] },
  { name: 'create, cash, partly confirmed', steps: [{ trip: base, plan: cashPlan(50000), request: 'r1' }] },
  { name: 'create, cash, fully confirmed', steps: [{ trip: { ...base, amount_paid: 1200.5 }, plan: cashPlan(120050), request: 'r1' }] },
  { name: 'create, card, three installments from a month end', controls: true, steps: [{ trip: { ...base, payment_method: 'card' },
    plan: { method: 'card', currency: 'ILS', cardTotalMinor: 120050, cashTotalMinor: 0, confirmedCashMinor: 0, installmentCount: 3, firstDate: '2027-01-31' }, request: 'r1' }] },
  { name: 'create, mixed', steps: [{ trip: { ...base, payment_method: 'mixed' },
    plan: { method: 'mixed', currency: 'ILS', cardTotalMinor: 80050, cashTotalMinor: 40000, confirmedCashMinor: 10000, installmentCount: 2, firstDate: '2027-02-15' }, request: 'r1' }] },
  { name: 'create without a payment plan', steps: [{ trip: { ...base, payment_method: null }, plan: null, request: 'r1' }] },
  { name: 'create, no request id', steps: [{ trip: base, plan: cashPlan(0), request: null }] },
  { name: 'idempotent replay', steps: [{ trip: base, plan: cashPlan(0), request: 'r1' }, { trip: { ...base, destination: 'Changed' }, plan: cashPlan(0), request: 'r1' }] },
  { name: 'edit with no change', steps: [{ trip: base, plan: cashPlan(0), request: 'r1' }, { edit: 0, trip: base, plan: cashPlan(0), request: 'r2' }] },
  { name: 'edit the sale price with the cash plan', steps: [{ trip: base, plan: cashPlan(0), request: 'r1' },
    { edit: 0, trip: { ...base, sale_price: 1500 }, plan: { ...cashPlan(20000), cashTotalMinor: 150000 }, request: 'r2' }] },
  { name: 'edit from cash to card', steps: [{ trip: base, plan: cashPlan(0), request: 'r1' },
    { edit: 0, trip: { ...base, payment_method: 'card' }, plan: { method: 'card', currency: 'ILS', cardTotalMinor: 120050, cashTotalMinor: 0, confirmedCashMinor: 0, installmentCount: 4, firstDate: '2027-02-10' }, request: 'r2' }] },
  { name: 'edit the status and travelers', steps: [{ trip: base, plan: cashPlan(0), request: 'r1' },
    { edit: 0, trip: { ...base, status: 'completed', travelers: [{ full_name: 'Dana Levi' }, { full_name: 'Noa Levi' }], travelers_count: 2 }, plan: cashPlan(0), request: 'r2' }] },
  { name: 'phone in international form', steps: [{ trip: { ...base, client_phone: '00972 50 123 4567' }, plan: cashPlan(0), request: 'r1' }] },
  { name: 'invalid phone refused', steps: [{ trip: { ...base, client_phone: '12' }, plan: cashPlan(0), request: 'r1' }] },
  { name: 'split mismatch refused', steps: [{ trip: base, plan: { ...cashPlan(0), cashTotalMinor: 100000 }, request: 'r1' }] },
  { name: 'confirmed cash above total refused', steps: [{ trip: base, plan: cashPlan(130000), request: 'r1' }] },
  { name: 'unknown currency refused', steps: [{ trip: { ...base, currency: 'GBP' }, plan: null, request: 'r1' }] },
  { name: 'fractional travelers count refused', steps: [{ trip: { ...base, travelers_count: '2.5' }, plan: null, request: 'r1' }] },
  { name: 'editing another owner trip refused', steps: [{ owner: other, trip: base, plan: cashPlan(0), request: 'r1' }, { edit: 0, trip: base, plan: cashPlan(0), request: 'r2' }] },
];

/** Every difference between the source's rows after a step and the model's. */
function compareStep(before, after, modelResult, sourceResponse, now) {
  const problems = [];
  const final = modelResult.world;
  problems.push(...diffRows('trips', after.trips, final.trips, now, 'trips'));
  problems.push(...diffRows('plans', after.plans, final.plans, now, 'trip_payment_plans'));
  problems.push(...diffRows('installments', after.installments, [...final.installments].sort((a, b) => (String(a.payment_plan_id) < String(b.payment_plan_id) ? -1
    : String(a.payment_plan_id) > String(b.payment_plan_id) ? 1 : a.installment_number - b.installment_number)), now, 'trip_installments'));
  const inserted = (rows, beforeRows) => rows.slice(beforeRows.length);
  const modelEvents = (table) => modelResult.ops.filter((op) => op.table === table && op.kind === 'insert').map((op) => op.row);
  problems.push(...diffRows('activity', inserted(after.activity, before.activity), modelEvents('trip_activity_log'), now, 'trip_activity_log'));
  problems.push(...diffRows('audit', inserted(after.audit, before.audit), modelEvents('trip_financial_audit'), now, 'trip_financial_audit'));
  problems.push(...diffRows('requests', after.requests, final.writeRequests, now, 'trip_write_requests'));
  if (JSON.stringify(comparable(sourceResponse, now)) !== JSON.stringify(comparable(modelResult.response, now))) {
    problems.push(`response: source ${JSON.stringify(comparable(sourceResponse, now)).slice(0, 300)} model ${JSON.stringify(comparable(modelResult.response, now)).slice(0, 300)}`);
  }
  return problems;
}

/** Negative controls: each damages the model's result one way, and the comparison must report it. */
const CONTROLS = [
  ['an activity row missing', (result) => {
    const index = result.ops.findIndex((op) => op.table === 'trip_activity_log');
    return { ...result, ops: result.ops.filter((_, position) => position !== index) };
  }],
  ['the sale price at another scale', (result) => ({ ...result, world: { ...result.world,
    trips: result.world.trips.map((trip) => ({ ...trip, sale_price: { units: trip.sale_price.units / 10n, scale: trip.sale_price.scale - 1 } })) } })],
  ['an installment amount moved by one minor unit', (result) => ({ ...result, world: { ...result.world,
    installments: result.world.installments.map((row, index) => (index === 0 ? { ...row, expected_amount_minor: row.expected_amount_minor + 1n } : row)) } })],
];

const report = { generatedAt: new Date().toISOString(), oracle: 'local PostgreSQL 17 (fixture + migrations + production overlay)', scenarios: [], controls: [], decision: 'FAIL' };
const oracle = await startTravelOracle({ port: 55444 });
report.migrations = oracle.migrations;
let counter = 0;
try {
  for (const scenario of SCENARIOS) {
    // Each scenario runs on its own owners so earlier scenarios do not change its rows.
    counter += 1;
    const owner = `${uid.slice(0, 24)}${String(counter).padStart(12, '0')}`;
    const second = `${other.slice(0, 1)}1${other.slice(2, 24)}${String(counter).padStart(12, '0')}`;
    for (const id of [owner, second]) await oracle.createOwner(id, { businessId: id.replace(/^6/, '7') });
    const created = [];
    const outcome = { name: scenario.name, steps: [], problems: [] };
    for (const [index, step] of scenario.steps.entries()) {
      const actor = step.owner === other ? second : owner;
      const tripData = { ...step.trip, ...(step.edit !== undefined ? { id: created[step.edit] } : {}) };
      const requestId = step.request === null ? null : `00000000-0000-4000-8000-${String(counter * 100 + (step.request === 'r1' ? 1 : 2)).padStart(12, '0')}`;
      const before = await snapshot(oracle.client, actor);
      let sourceResponse = null; let sourceError = null; let now = null;
      try {
        await oracle.asOwner(actor, async (c) => {
          now = (await c.query("SELECT (extract(epoch FROM now()) * 1000000)::bigint::text AS micros")).rows[0].micros;
          sourceResponse = JSON.parse((await c.query('SELECT public.save_trip_transaction($1::jsonb, $2::jsonb, $3::uuid)::text AS r',
            [JSON.stringify(tripData), step.plan === null ? null : JSON.stringify(step.plan), requestId])).rows[0].r);
        });
      } catch (error) {
        sourceError = { code: error.code, message: error.message };
      }
      const after = await snapshot(oracle.client, actor);
      if (sourceResponse && !created[index] && !tripData.id) created[index] = sourceResponse.id;
      if (step.owner === other && sourceResponse) created[index] = sourceResponse.id;

      // The ids the database generated, in the order the model asks for them.
      const knownTrips = new Set(before.trips.map((row) => row.id)); const knownPlans = new Set(before.plans.map((row) => row.id));
      const knownInstallments = new Set(before.installments.map((row) => row.id));
      const queue = [...after.trips.filter((row) => !knownTrips.has(row.id)).map((row) => row.id),
        ...after.plans.filter((row) => !knownPlans.has(row.id)).map((row) => row.id),
        ...after.installments.filter((row) => !knownInstallments.has(row.id)).sort((a, b) => a.installment_number - b.installment_number).map((row) => row.id)];
      let modelResult = null; let modelError = null;
      // The model runs as the scenario's first owner, so the refusal of editing another owner's trip is exercised.
      const modelActor = step.edit !== undefined ? owner : actor;
      const modelBefore = modelActor === actor ? before : await snapshot(oracle.client, modelActor);
      const modelOtherWorld = modelActor !== actor ? { trips: [...modelWorld(modelBefore).trips, ...modelWorld(before).trips] } : null;
      try {
        const world = modelWorld(modelBefore);
        if (modelOtherWorld) world.trips = modelOtherWorld.trips;
        modelResult = saveTripTransaction(world, { tripData, paymentPlan: step.plan, clientRequestId: requestId },
          { uid: modelActor, dbToday: new Date().toISOString().slice(0, 10), businessToday: businessToday(), newId: () => queue.shift() ?? `unexpected-id-${Math.random()}` });
      } catch (error) {
        modelError = { code: error.code, message: error.message };
      }
      const problems = [];
      if (Boolean(sourceError) !== Boolean(modelError)) {
        problems.push(`outcome: source ${sourceError ? `error ${sourceError.code} ${sourceError.message}` : 'ok'}, model ${modelError ? `error ${modelError.code} ${modelError.message}` : 'ok'}`);
      } else if (sourceError) {
        if (sourceError.code !== modelError.code) problems.push(`error code: source ${sourceError.code} (${sourceError.message}), model ${modelError.code} (${modelError.message})`);
      } else if (modelActor === actor) {
        problems.push(...compareStep(before, after, modelResult, sourceResponse, now));
        if (scenario.controls) {
          for (const [name, perturb] of CONTROLS) {
            const detected = compareStep(before, after, perturb(structuredClone(modelResult)), sourceResponse, now).length > 0;
            report.controls.push({ scenario: scenario.name, name, status: detected ? 'DETECTED' : 'NOT_DETECTED' });
          }
        }
      }
      outcome.steps.push({ step: index, source: sourceError ? `error ${sourceError.code}` : 'ok', model: modelError ? `error ${modelError.code}` : 'ok', problems: problems.length });
      outcome.problems.push(...problems.map((problem) => `step ${index}: ${problem}`));
    }
    report.scenarios.push(outcome);
  }
} finally {
  await oracle.stop();
}
report.totals = { scenarios: report.scenarios.length, steps: report.scenarios.reduce((sum, s) => sum + s.steps.length, 0),
  scenariosWithProblems: report.scenarios.filter((s) => s.problems.length).length, problems: report.scenarios.reduce((sum, s) => sum + s.problems.length, 0) };
report.totals.controls = report.controls.length;
report.totals.controlsDetected = report.controls.filter((control) => control.status === 'DETECTED').length;
report.decision = report.totals.problems === 0 && report.totals.controls > 0 && report.totals.controlsDetected === report.totals.controls ? 'PASS' : 'FAIL';
mkdirSync('migration/reports', { recursive: true });
writeFileSync('migration/reports/travel-write-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ decision: report.decision, totals: report.totals }, null, 2));
for (const scenario of report.scenarios.filter((s) => s.problems.length)) {
  console.log(`-- ${scenario.name}`);
  for (const problem of scenario.problems.slice(0, 12)) console.log(`   ${problem}`);
}
if (report.decision !== 'PASS') process.exitCode = 1;
