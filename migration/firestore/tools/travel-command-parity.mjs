#!/usr/bin/env node
/**
 * Tourism command parity: the trip writes other than save_trip_transaction (src/data/firestore/tripCommandModel.ts)
 * must write what the source writes. Each command step runs the product's statement on the local oracle as the owner
 * (the PostgREST update SupabaseTravelRepository sends, or the database function the screen calls), then runs the model
 * on the oracle's rows from just before the step, and compares every stored trip, plan and installment row, the rows the
 * step inserted into the event, audit, activity and cleanup tables, what a trip delete cascaded, and the result or the
 * error code. Setup steps (trip saves) run on the oracle only. Negative controls damage a model result and must be caught.
 *
 * Run from an ASCII path (see travel-postgres-oracle.mjs):
 *   cd M:\ && node scripts/run-typescript-source-test.mjs migration/firestore/tools/travel-command-parity.mjs
 *
 * Writes migration/reports/travel-command-parity.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { startTravelOracle } from '../lib/travel-postgres-oracle.mjs';
import { businessToday, compareWrites, comparable, idQueue, modelWorld, snapshot } from '../lib/travel-parity-core.mjs';
import {
  archiveTrip, createTripPaymentPlan, deleteTrip, importTripRefusal, logTripActivity, permanentlyDeleteTrips, recalculateFutureInstallments,
  recordCashPayment, recordInstallmentPayment, rescheduleInstallment, restoreDeletedTrips, restoreTrip, toggleExport, updateTripClientPhone,
  updateTripItinerary,
} from '../../../src/data/firestore/tripCommandModel.ts';

const trip = (overrides = {}) => ({
  client_name: 'Command Client', destination: 'Athens', start_date: '2027-05-01', end_date: '2027-05-06', currency: 'ILS', exchange_rate: 1,
  wholesale_cost: 1000, sale_price: 1500, payment_status: 'unpaid', amount_paid: 0, travelers_count: 2, client_phone: '0521234567',
  service_type: 'both', payment_method: 'cash', travelers: [{ full_name: 'Guest One' }], itinerary: [], payments: [], notes: '', status: 'active',
  room_type: {}, hotel_name: 'Hotel Athens', attachments: [], ...overrides,
});
const cash = { method: 'cash', currency: 'ILS', cardTotalMinor: 0, cashTotalMinor: 150000, confirmedCashMinor: 0, installmentCount: 0, firstDate: '2027-04-01' };
const mixed = { method: 'mixed', currency: 'ILS', cardTotalMinor: 90000, cashTotalMinor: 60000, confirmedCashMinor: 0, installmentCount: 3, firstDate: '2020-01-10' };
const future = { method: 'card', currency: 'ILS', cardTotalMinor: 150000, cashTotalMinor: 0, confirmedCashMinor: 0, installmentCount: 4, firstDate: '2030-01-15' };

/**
 * A step: { save: [trip, plan] } (setup, oracle only), or { command, args(ctx) } where args names trips, plans and
 * installments created earlier through `ctx.trip(i)`, `ctx.plan(i)`, `ctx.installment(i)`.
 */
const SCENARIOS = [
  { name: 'soft delete, restore, restore again', steps: [{ save: [trip(), cash] }, { command: 'deleteTrip', args: (c) => [c.trip(0)] },
    { command: 'restoreTrip', args: (c) => [c.trip(0)] }, { command: 'restoreTrip', args: (c) => [c.trip(0)] }] },
  { name: 'archive, unarchive, export flag, itinerary', steps: [{ save: [trip(), cash] }, { command: 'archiveTrip', args: (c) => [c.trip(0), true] },
    { command: 'archiveTrip', args: (c) => [c.trip(0), false] }, { command: 'toggleExport', args: (c) => [c.trip(0), true] },
    { command: 'updateTripItinerary', args: (c) => [c.trip(0), [{ day: 1, title: 'Arrival', description: 'Check in' }]] }] },
  { name: 'client phone accepted and refused', steps: [{ save: [trip(), cash] }, { command: 'updateTripClientPhone', args: (c) => [c.trip(0), '+972 54 765 4321'] },
    { command: 'updateTripClientPhone', args: (c) => [c.trip(0), 'call me'] }] },
  { name: 'trash restore and permanent delete with a card schedule', steps: [{ save: [trip({ payment_method: 'mixed' }), mixed] },
    { command: 'deleteTrip', args: (c) => [c.trip(0)] }, { command: 'restoreDeletedTrips', args: (c) => [[c.trip(0)]] },
    { command: 'deleteTrip', args: (c) => [c.trip(0)] }, { command: 'permanentlyDeleteTrips', args: (c) => [[c.trip(0)]] }] },
  { name: 'installment receipts: full, partial, undone', controls: true, steps: [{ save: [trip({ payment_method: 'mixed' }), mixed] },
    { command: 'recordInstallmentPayment', args: (c) => [c.installment(0), 30000n, '2020-01-11T09:00:00Z', ' paid '] },
    { command: 'recordInstallmentPayment', args: (c) => [c.installment(1), 10000n, '2020-02-11T09:00:00Z', null] },
    { command: 'recordInstallmentPayment', args: (c) => [c.installment(1), 0n, '2020-02-12T09:00:00Z', ''] },
    { command: 'recordInstallmentPayment', args: (c) => [c.installment(0), 40000n, '2020-01-11T09:00:00Z', null] }] },
  { name: 'cash receipts on a mixed plan', steps: [{ save: [trip({ payment_method: 'mixed' }), mixed] },
    { command: 'recordCashPayment', args: (c) => [c.plan(0), 25000n, '2027-01-01T12:00:00Z', 'first'] },
    { command: 'recordCashPayment', args: (c) => [c.plan(0), 60000n, '2027-01-02T12:00:00Z', null] },
    { command: 'recordCashPayment', args: (c) => [c.plan(0), 70000n, '2027-01-03T12:00:00Z', null] }] },
  { name: 'reschedule a future installment, refuse a past one', steps: [{ save: [trip({ payment_method: 'card' }), future] },
    { command: 'rescheduleInstallment', args: (c) => [c.installment(1), '2030-03-01'] },
    { save: [trip({ payment_method: 'mixed', destination: 'Past' }), mixed] },
    { command: 'rescheduleInstallment', args: (c) => [c.installmentOf(1, 0), '2031-01-01'] }] },
  { name: 'recalculate future installments', steps: [{ save: [trip({ payment_method: 'card' }), future] },
    { command: 'recalculateFutureInstallments', args: (c) => [c.plan(0), 160003n] },
    { command: 'recalculateFutureInstallments', args: (c) => [c.plan(0), 100n] }] },
  { name: 'create a plan on a trip without one, then on a trip with one', steps: [{ save: [trip({ payment_method: null }), null] },
    { command: 'createTripPaymentPlan', args: (c) => [{ tripId: c.trip(0), method: 'card', currency: 'ils', cardTotalMinor: 150000n, cashTotalMinor: 0n, installmentCount: 3, firstDate: '2030-02-28', notes: '  n  ' }] },
    { command: 'createTripPaymentPlan', args: (c) => [{ tripId: c.trip(0), method: 'cash', currency: 'ILS', cardTotalMinor: 0n, cashTotalMinor: 150000n, installmentCount: 0, firstDate: null, notes: null }] }] },
  { name: 'activity logging', steps: [{ save: [trip(), cash] },
    { command: 'logTripActivity', args: (c) => [c.trip(0), 'whatsapp_prepared', { action: 'whatsapp_opened', phone_suffix: '4567' }] },
    { command: 'logTripActivity', args: (c) => [c.trip(0), 'trip_edited', {}] },
    { command: 'logTripActivity', args: (c) => [c.trip(0), 'pdf_generated', { url: 'https://example.invalid/x' }] },
    { command: 'logTripActivity', args: () => ['00000000-0000-4000-8000-00000000abcd', 'trip_duplicated', {}] }] },
  { name: 'settings import of an exported trip', steps: [{ save: [trip(), cash] }, { command: 'importTrip', args: (c) => [c.exported(0)] }] },
];

/** The statement the product sends for each command, as the owner. */
const ORACLE = {
  async restoreTrip(q, uid, [id], clientNow) {
    const { rows } = await q('UPDATE public.trips SET deleted_at = NULL, deleted_by = NULL, updated_at = $3 WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id', [id, uid, clientNow]);
    if (!rows.length) throw new Error('TRIP_RESTORE_NOT_APPLIED');
    return rows[0].id;
  },
  async deleteTrip(q, uid, [id], clientNow) {
    const { rows } = await q('UPDATE public.trips SET deleted_at = $3, deleted_by = $2, updated_at = $3 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id', [id, uid, clientNow]);
    if (!rows.length) throw new Error('TRIP_DELETE_NOT_APPLIED');
    return rows[0].id;
  },
  async archiveTrip(q, uid, [id, archived], clientNow) {
    await q('UPDATE public.trips SET status = $3, updated_at = $4 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, uid, archived ? 'archived' : 'active', clientNow]);
  },
  async toggleExport(q, uid, [id, value], clientNow) {
    await q('UPDATE public.trips SET export_to_pdf = $3, updated_at = $4 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, uid, value, clientNow]);
  },
  async updateTripItinerary(q, uid, [id, itinerary], clientNow) {
    await q('UPDATE public.trips SET itinerary = $2::jsonb, updated_at = $3 WHERE id = $1', [id, JSON.stringify(itinerary), clientNow]);
  },
  async updateTripClientPhone(q, uid, [id, phone]) {
    try {
      const { rows } = await q('UPDATE public.trips SET client_phone = $3 WHERE id = $1 AND user_id = $2 RETURNING id', [id, uid, phone]);
      if (!rows.length) throw new Error('none');
    } catch {
      throw new Error('PHONE_UPDATE_FAILED');
    }
  },
  async restoreDeletedTrips(q, uid, [ids]) { return Number((await q('SELECT public.restore_deleted_trips($1::uuid[]) AS n', [ids])).rows[0].n); },
  async permanentlyDeleteTrips(q, uid, [ids]) { return Number((await q('SELECT public.permanently_delete_trips($1::uuid[]) AS n', [ids])).rows[0].n); },
  async createTripPaymentPlan(q, uid, [input]) {
    return (await q('SELECT public.create_trip_payment_plan($1::uuid, $2, $3, $4::bigint, $5::bigint, $6::int, $7::date, $8) AS id',
      [input.tripId, input.method, input.currency, String(input.cardTotalMinor), String(input.cashTotalMinor), input.installmentCount, input.firstDate, input.notes])).rows[0].id;
  },
  async recordCashPayment(q, uid, [id, paid, at, notes]) {
    return JSON.parse((await q('SELECT public.record_trip_cash_payment($1::uuid, $2::bigint, $3::timestamptz, $4)::text AS r', [id, String(paid), at, notes])).rows[0].r);
  },
  async recordInstallmentPayment(q, uid, [id, paid, at, notes]) {
    return JSON.parse((await q('SELECT public.record_trip_installment_payment($1::uuid, $2::bigint, $3::timestamptz, $4)::text AS r', [id, String(paid), at, notes])).rows[0].r);
  },
  async rescheduleInstallment(q, uid, [id, due]) {
    return JSON.parse((await q('SELECT public.reschedule_trip_installment($1::uuid, $2::date)::text AS r', [id, due])).rows[0].r);
  },
  async recalculateFutureInstallments(q, uid, [id, total]) {
    return Number((await q('SELECT public.recalculate_future_trip_installments($1::uuid, $2::bigint) AS n', [id, String(total)])).rows[0].n);
  },
  async logTripActivity(q, uid, [tripId, type, metadata]) {
    const { rows } = await q('SELECT public.log_trip_activity($1::uuid, $2, $3::jsonb) AS id', [tripId, type, JSON.stringify(metadata)]);
    return rows[0].id !== null;
  },
  async importTrip(q, uid, [tripData]) {
    const keys = Object.keys(tripData);
    const record = { ...tripData, user_id: uid };
    await q(`INSERT INTO public.trips (${[...keys, 'user_id'].map((key) => `"${key}"`).join(', ')})
      SELECT ${[...keys, 'user_id'].map((key) => `r."${key}"`).join(', ')} FROM jsonb_populate_record(NULL::public.trips, $1::jsonb) r`, [JSON.stringify(record)]);
  },
};

const MODEL = {
  restoreTrip: (world, ctx, [id], clientNow) => restoreTrip(world, ctx, id, clientNow),
  deleteTrip: (world, ctx, [id], clientNow) => deleteTrip(world, ctx, id, clientNow),
  archiveTrip: (world, ctx, [id, archived], clientNow) => archiveTrip(world, ctx, id, archived, clientNow),
  toggleExport: (world, ctx, [id, value], clientNow) => toggleExport(world, ctx, id, value, clientNow),
  updateTripItinerary: (world, ctx, [id, itinerary], clientNow) => updateTripItinerary(world, ctx, id, itinerary, clientNow),
  updateTripClientPhone: (world, ctx, [id, phone]) => updateTripClientPhone(world, ctx, id, phone),
  restoreDeletedTrips: (world, ctx, [ids]) => restoreDeletedTrips(world, ctx, ids),
  permanentlyDeleteTrips: (world, ctx, [ids]) => permanentlyDeleteTrips(world, ctx, ids),
  createTripPaymentPlan: (world, ctx, [input]) => createTripPaymentPlan(world, ctx, input),
  recordCashPayment: (world, ctx, [id, paid, at, notes]) => recordCashPayment(world, ctx, id, paid, at, notes),
  recordInstallmentPayment: (world, ctx, [id, paid, at, notes]) => recordInstallmentPayment(world, ctx, id, paid, at, notes),
  rescheduleInstallment: (world, ctx, [id, due]) => rescheduleInstallment(world, ctx, id, due),
  recalculateFutureInstallments: (world, ctx, [id, total]) => recalculateFutureInstallments(world, ctx, id, total),
  logTripActivity: (world, ctx, [tripId, type, metadata]) => logTripActivity(world, ctx, tripId, type, metadata),
  importTrip: (world, ctx, [tripData]) => {
    const refusal = importTripRefusal(tripData);
    if (refusal) throw refusal;
    throw new Error('IMPORT_WITHOUT_GENERATED_COLUMNS_NOT_MODELLED');
  },
};

const CONTROLS = [
  ['an installment event missing', (result) => {
    const index = result.ops.findIndex((op) => op.table === 'trip_installment_events');
    return { ...result, ops: result.ops.filter((_, position) => position !== index) };
  }],
  ['the plan card paid total off by one', (result) => ({ ...result, world: { ...result.world,
    plans: result.world.plans.map((plan) => ({ ...plan, card_paid_minor: plan.card_paid_minor + 1n })) } })],
  ['the trip amount paid at another scale', (result) => ({ ...result, world: { ...result.world,
    trips: result.world.trips.map((row) => ({ ...row, amount_paid: row.amount_paid && { units: row.amount_paid.units * 10n, scale: row.amount_paid.scale + 1 } })) } })],
];

const report = { generatedAt: new Date().toISOString(), oracle: 'local PostgreSQL 17 (fixture + migrations + production overlay)', scenarios: [], controls: [], decision: 'FAIL' };
const oracle = await startTravelOracle({ port: 55445 });
report.migrations = oracle.migrations;
try {
  for (const [scenarioIndex, scenario] of SCENARIOS.entries()) {
    const uid = `62000000-0000-4000-8000-${String(scenarioIndex + 1).padStart(12, '0')}`;
    await oracle.createOwner(uid, { businessId: `72000000-0000-4000-8000-${String(scenarioIndex + 1).padStart(12, '0')}` });
    const saves = [];
    const outcome = { name: scenario.name, steps: [], problems: [] };
    const context = (state) => ({
      trip: (i) => saves[i].id,
      plan: (i) => state.plans.find((row) => row.trip_id === saves[i].id && row.deleted_at === null)?.id,
      installment: (n) => state.installments.filter((row) => row.trip_id === saves[0].id).sort((a, b) => Number(a.installment_number) - Number(b.installment_number))[n]?.id,
      installmentOf: (i, n) => state.installments.filter((row) => row.trip_id === saves[i].id).sort((a, b) => Number(a.installment_number) - Number(b.installment_number))[n]?.id,
      exported: (i) => { const row = { ...state.trips.find((t) => t.id === saves[i].id) }; for (const key of ['id', 'user_id', 'created_at', 'updated_at']) delete row[key]; return row; },
    });
    for (const [stepIndex, step] of scenario.steps.entries()) {
      if (step.save) {
        await oracle.asOwner(uid, async (c) => {
          const [tripData, plan] = step.save;
          saves.push(JSON.parse((await c.query('SELECT public.save_trip_transaction($1::jsonb, $2::jsonb, NULL)::text AS r',
            [JSON.stringify(tripData), plan === null ? null : JSON.stringify(plan)])).rows[0].r));
        });
        continue;
      }
      const before = await snapshot(oracle.client, uid);
      const args = step.args(context(before));
      const clientNow = new Date().toISOString();
      let now = null; let sourceResult; let sourceError = null;
      try {
        await oracle.asOwner(uid, async (c) => {
          now = (await c.query("SELECT (extract(epoch FROM now()) * 1000000)::bigint::text AS micros")).rows[0].micros;
          sourceResult = await ORACLE[step.command]((sql, params) => c.query(sql, params), uid, args, clientNow);
        });
      } catch (error) {
        sourceError = { code: error.code ?? null, message: error.message };
      }
      const after = await snapshot(oracle.client, uid);
      const queue = idQueue(before, after);
      let modelResult = null; let modelError = null;
      try {
        modelResult = MODEL[step.command](modelWorld(before), { uid, dbToday: new Date().toISOString().slice(0, 10), businessToday: businessToday(),
          newId: () => queue.shift() ?? `unexpected-id-${Math.random()}` }, args, clientNow);
      } catch (error) {
        modelError = { code: error.code ?? null, message: error.message };
      }
      const problems = [];
      if (Boolean(sourceError) !== Boolean(modelError)) {
        problems.push(`outcome: source ${sourceError ? `error ${sourceError.code} ${sourceError.message}` : 'ok'}, model ${modelError ? `error ${modelError.code} ${modelError.message}` : 'ok'}`);
      } else if (sourceError) {
        const sameCode = sourceError.code === modelError.code && (sourceError.code !== null || sourceError.message === modelError.message);
        if (!sameCode) problems.push(`error: source ${sourceError.code} ${sourceError.message}, model ${modelError.code} ${modelError.message}`);
      } else {
        problems.push(...compareWrites(before, after, modelResult, now));
        const result = (value) => JSON.stringify(comparable(typeof value === 'bigint' ? value.toString() : value ?? null, now));
        if (result(sourceResult) !== result(modelResult.result)) problems.push(`result: source ${result(sourceResult).slice(0, 240)} model ${result(modelResult.result).slice(0, 240)}`);
        if (scenario.controls) {
          for (const [name, perturb] of CONTROLS) {
            const damaged = perturb(structuredClone(modelResult));
            const detected = compareWrites(before, after, damaged, now).length > 0;
            report.controls.push({ scenario: scenario.name, step: stepIndex, name, status: detected ? 'DETECTED' : 'NOT_DETECTED' });
          }
        }
      }
      outcome.steps.push({ step: stepIndex, command: step.command, source: sourceError ? `error ${sourceError.code ?? sourceError.message}` : 'ok',
        model: modelError ? `error ${modelError.code ?? modelError.message}` : 'ok', problems: problems.length });
      outcome.problems.push(...problems.map((problem) => `step ${stepIndex} ${step.command}: ${problem}`));
    }
    report.scenarios.push(outcome);
  }
} finally {
  await oracle.stop();
}
report.totals = {
  scenarios: report.scenarios.length, commandSteps: report.scenarios.reduce((sum, s) => sum + s.steps.length, 0),
  scenariosWithProblems: report.scenarios.filter((s) => s.problems.length).length, problems: report.scenarios.reduce((sum, s) => sum + s.problems.length, 0),
  controls: report.controls.length, controlsDetected: report.controls.filter((control) => control.status === 'DETECTED').length,
};
report.decision = report.totals.problems === 0 && report.totals.controls > 0 && report.totals.controlsDetected === report.totals.controls ? 'PASS' : 'FAIL';
mkdirSync('migration/reports', { recursive: true });
writeFileSync('migration/reports/travel-command-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ decision: report.decision, totals: report.totals }, null, 2));
for (const scenario of report.scenarios) {
  console.log(`-- ${scenario.name}: ${scenario.steps.map((s) => `${s.command}=${s.source}/${s.model}${s.problems ? `!${s.problems}` : ''}`).join(' ')}`);
  for (const problem of scenario.problems.slice(0, 10)) console.log(`   ${problem}`);
}
const missed = report.controls.filter((control) => control.status !== 'DETECTED');
if (missed.length) console.log('controls not detected', JSON.stringify(missed));
if (report.decision !== 'PASS') process.exitCode = 1;
