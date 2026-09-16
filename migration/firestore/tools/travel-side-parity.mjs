#!/usr/bin/env node
/**
 * Tourism side-table parity: the writes that are not trip writes (src/data/firestore/tripSideModel.ts) must write what
 * the source writes. For each step the product's own statement runs on the local oracle as the owner — the PostgREST
 * update the bell menu sends, the upsert the settings screen sends, the template insert, the packing-list insert, or
 * the database function the screen calls — and then the model runs on the rows from just before the step. Every stored
 * row of trip_notifications, trip_notification_settings, trip_templates and trip_packing_lists is compared, together
 * with the result or the error code. Negative controls damage a model result and must be caught.
 *
 * Run from an ASCII path (see travel-postgres-oracle.mjs):
 *   cd M:\\ && node scripts/run-typescript-source-test.mjs migration/firestore/tools/travel-side-parity.mjs
 *
 * Writes migration/reports/travel-side-parity.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { startTravelOracle } from '../lib/travel-postgres-oracle.mjs';
import { businessToday, comparable, diffRows } from '../lib/travel-parity-core.mjs';
import {
  clearCompletedTripNotifications, createPackingList, dismissTripNotification, markAllTripNotificationsRead,
  markTripNotificationRead, materializeDueVisaProgressEvents, saveTripNotificationSettings, saveTripTemplate,
  snoozeTripNotification, updateTripTemplate, useTripTemplate, whatsappPayloadRefusal,
} from '../../../src/data/firestore/tripSideModel.ts';

const SIDE_TABLES = [
  ['notifications', 'trip_notifications', 'created_at, id'],
  ['settings', 'trip_notification_settings', 'user_id'],
  ['templates', 'trip_templates', 'created_at, id'],
  ['packingLists', 'trip_packing_lists', 'created_at, id'],
];

const exactRows = (table, order) => `SELECT coalesce(jsonb_agg(converted ORDER BY ${order}), '[]'::jsonb)::text AS rows FROM (
  SELECT (SELECT jsonb_object_agg(e.key, CASE WHEN jsonb_typeof(e.value) = 'number' THEN to_jsonb(e.value #>> '{}') ELSE e.value END)
    FROM jsonb_each(to_jsonb(t)) e) AS converted, t.* FROM public.${table} t WHERE user_id = $1) s`;

async function snapshot(client, uid) {
  const state = {};
  for (const [label, table, order] of SIDE_TABLES) {
    state[label] = JSON.parse((await client.query(exactRows(table, order), [uid])).rows[0].rows);
  }
  return state;
}

/** The oracle's rows in the model's representation: integers stay numbers, everything else is as PostgREST returns it. */
const world = (state) => ({
  notifications: state.notifications.map((row) => ({ ...row })),
  settings: state.settings.map((row) => ({ ...row })),
  templates: state.templates.map((row) => ({ ...row })),
  packingLists: state.packingLists.map((row) => ({ ...row })),
});

/** The ids the database would generate, fixed so the oracle and the model agree on them. */
const templateId = '64000000-0000-4000-8000-000000000001';
const listId = '65000000-0000-4000-8000-000000000001';

/** The statement the product sends for each step, as the owner. */
const ORACLE = {
  markAllRead: (q) => q('SELECT public.mark_all_trip_notifications_read() AS result').then((r) => Number(r.rows[0].result)),
  snooze: (q, uid, [id, until]) => q('UPDATE public.trip_notifications SET snoozed_until = $3 WHERE id = $1 AND user_id = $2', [id, uid, until]).then((r) => r.rowCount),
  dismiss: (q, uid, [id], now) => q('UPDATE public.trip_notifications SET dismissed_at = $3, read_at = $3 WHERE id = $1 AND user_id = $2', [id, uid, now]).then((r) => r.rowCount),
  clearCompleted: (q, uid, _args, now) => q('UPDATE public.trip_notifications SET dismissed_at = $2 WHERE user_id = $1 AND completed_at IS NOT NULL', [uid, now]).then((r) => r.rowCount),
  markRead: (q, uid, [id], now) => q('UPDATE public.trip_notifications SET read_at = $3 WHERE id = $1 AND user_id = $2', [id, uid, now]).then((r) => r.rowCount),
  saveSettings: async (q, uid, [values], now) => {
    const columns = Object.keys(values);
    const placeholders = columns.map((_, index) => `$${index + 3}`);
    await q(`INSERT INTO public.trip_notification_settings (user_id, updated_at, ${columns.join(', ')})
      VALUES ($1, $2, ${placeholders.join(', ')})
      ON CONFLICT (user_id) DO UPDATE SET updated_at = EXCLUDED.updated_at,
        ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`,
    [uid, now, ...columns.map((column) => values[column])]);
    return null;
  },
  insertTemplate: async (q, uid, [value], now) => {
    await q(`INSERT INTO public.trip_templates (id, user_id, name, description, template_data, template_type, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [templateId, uid, value.name.trim(), value.description?.trim() || null, JSON.stringify(value.data), value.templateType || 'full_trip', now]);
    return null;
  },
  updateTemplate: async (q, uid, [id, set], now) => {
    const columns = Object.keys(set);
    const result = await q(`UPDATE public.trip_templates SET updated_at = $3, ${columns.map((column, index) => `${column} = $${index + 4}`).join(', ')}
      WHERE id = $1 AND user_id = $2`, [id, uid, now, ...columns.map((column) => set[column])]);
    return result.rowCount;
  },
  useTemplate: (q, uid, [id]) => q('SELECT public.use_trip_template($1)::text AS payload', [id]).then((r) => JSON.parse(r.rows[0].payload)),
  createPackingList: async (q, uid, [tripId, name, items]) => {
    await q('INSERT INTO public.trip_packing_lists (id, trip_id, user_id, name, items) VALUES ($1, $2, $3, $4, $5::jsonb)',
      [items.id, tripId, uid, name, JSON.stringify(items.rows)]);
    return null;
  },
  materializeVisa: (q) => q('SELECT public.materialize_due_visa_progress_events() AS inserted').then((r) => Number(r.rows[0].inserted)),
};

/** The model call for each step. */
const MODEL = {
  markAllRead: (state, ctx) => markAllTripNotificationsRead(state.notifications, ctx),
  snooze: (state, ctx, [id, until]) => snoozeTripNotification(state.notifications, ctx, id, until),
  dismiss: (state, ctx, [id], now) => dismissTripNotification(state.notifications, ctx, id, now),
  clearCompleted: (state, ctx, _args, now) => clearCompletedTripNotifications(state.notifications, ctx, now),
  markRead: (state, ctx, [id], now) => markTripNotificationRead(state.notifications, ctx, id, now),
  saveSettings: (state, ctx, [values], now) => saveTripNotificationSettings(state.settings, ctx, values, now),
  insertTemplate: (state, ctx, [value], now) => saveTripTemplate(state.templates, ctx, value, now),
  updateTemplate: (state, ctx, [id, set], now) => updateTripTemplate(state.templates, ctx, id, { ...set, updated_at: now }),
  useTemplate: (state, ctx, [id]) => useTripTemplate(state.templates, ctx, id),
  createPackingList: (state, ctx, [tripId, name, items]) => createPackingList(state.packingLists, state.trips, ctx, tripId, name, items.rows),
  materializeVisa: (state, ctx) => materializeDueVisaProgressEvents(
    { notifications: state.notifications, trips: state.trips, plans: state.plans, installments: state.installments, rollouts: state.rollouts }, ctx),
};

const CONTROLS = [
  ['a notification row left unread', (result) => ({ ...result, rows: result.rows.map((row, index) => (index === 0 ? { ...row, read_at: null } : row)) }), 'notifications'],
  ['a materialized event dropped', (result) => ({ ...result, rows: result.rows.slice(0, -1) }), 'notifications'],
  ['a settings day list shortened', (result) => ({ ...result, rows: result.rows.map((row) => (row.trip_reminder_days
    ? { ...row, trip_reminder_days: row.trip_reminder_days.slice(1) } : row)) }), 'settings'],
  ['a settings flag flipped', (result) => ({ ...result, rows: result.rows.map((row) => ({ ...row, cleanup_enabled: !row.cleanup_enabled })) }), 'settings'],
  ['a template usage count off by one', (result) => ({ ...result, rows: result.rows.map((row) => (row.usage_count === undefined
    ? row : { ...row, usage_count: Number(row.usage_count) + 1 })) }), 'templates'],
  ['a template name untrimmed', (result) => ({ ...result, rows: result.rows.map((row) => ({ ...row, name: `  ${row.name}  ` })) }), 'templates'],
];

const report = { generatedAt: new Date().toISOString(), oracle: 'local PostgreSQL 17 (fixture + migrations + production overlay)', steps: [], controls: [], decision: 'FAIL' };
const oracle = await startTravelOracle({ port: 55447 });
report.migrations = oracle.migrations;
const uid = '63000000-0000-4000-8000-000000000001';
const businessId = '73000000-0000-4000-8000-000000000001';

try {
  await oracle.createOwner(uid, { businessId });
  // A trip with an elapsed card schedule, so the Visa materialization has something to find.
  const trip = { client_name: 'Side Client', destination: 'Nicosia', start_date: '2027-05-01', end_date: '2027-05-06', currency: 'ILS',
    exchange_rate: 1, wholesale_cost: 1000, sale_price: 1500, payment_status: 'unpaid', amount_paid: 0, travelers_count: 1,
    service_type: 'both', payment_method: 'card', travelers: [], itinerary: [], payments: [], notes: '', status: 'active',
    room_type: {}, hotel_name: 'Hotel Nicosia', attachments: [] };
  const plan = { method: 'card', currency: 'ILS', cardTotalMinor: 150000, cashTotalMinor: 0, confirmedCashMinor: 0,
    installmentCount: 2, firstDate: '2021-01-15' };
  let saved = null;
  await oracle.asOwner(uid, async (client) => {
    saved = JSON.parse((await client.query('SELECT public.save_trip_transaction($1::jsonb, $2::jsonb, NULL)::text AS r',
      [JSON.stringify(trip), JSON.stringify(plan)])).rows[0].r);
  });
  // generate_trip_notifications is a service-role statement, so its rows are seeded directly (as the owner the client
  // may only read and update them) to give the bell-menu steps something to act on. `rows` renders a SELECT, so the
  // insert goes through the client itself.
  await oracle.client.query(`INSERT INTO public.trip_notifications
      (user_id, trip_id, notification_type, title_key, body_key, params, dedupe_key, completed_at)
    VALUES ($1, $2, 'upcoming_trip', 'notifications.travel.upcomingTitle', 'notifications.travel.upcomingBody',
        '{"destination":"Nicosia"}'::jsonb, $3, NULL),
      ($1, $2, 'attachment_cleanup_failure', 'notifications.travel.cleanupTitle', 'notifications.travel.cleanupBody',
        '{}'::jsonb, $4, now())`,
  [uid, saved.id, `upcoming:${saved.id}:2027-05-01`, `cleanup:${saved.id}:1`]);

  const STEPS = [
    { name: 'mark every notification read', step: 'markAllRead', args: () => [] },
    { name: 'snooze one notification', step: 'snooze', args: (state) => [state.notifications[0].id, '2027-04-05T00:00:00Z'] },
    { name: 'mark one notification read', step: 'markRead', args: (state) => [state.notifications[0].id] },
    { name: 'dismiss one notification', step: 'dismiss', args: (state) => [state.notifications[0].id] },
    { name: 'clear the completed notifications', step: 'clearCompleted', args: () => [] },
    { name: 'save notification settings', step: 'saveSettings', controls: true,
      args: () => [{ timezone: 'Asia/Jerusalem', upcoming_enabled: true, upcoming_days: 14, trip_reminder_days: [30, 7, 0],
        payment_enabled: true, payment_reminder_days: [7, 0], cleanup_enabled: false, retention_enabled: true }] },
    { name: 'save notification settings again', step: 'saveSettings',
      args: () => [{ timezone: 'Asia/Jerusalem', upcoming_enabled: false, upcoming_days: 3, trip_reminder_days: [1, 0],
        payment_enabled: true, payment_reminder_days: [0], cleanup_enabled: true, retention_enabled: false }] },
    { name: 'create a trip template', step: 'insertTemplate', controls: true,
      args: () => [{ name: '  Athens 5 nights  ', description: '  city break  ', data: { destination: 'Athens', duration_days: 5 }, templateType: 'full_trip' }] },
    { name: 'mark the template a favourite', step: 'updateTemplate', args: () => [templateId, { is_favorite: true }] },
    { name: 'use the template', step: 'useTemplate', args: () => [templateId] },
    { name: 'archive the template', step: 'updateTemplate', args: () => [templateId, { status: 'archived' }] },
    { name: 'create a packing list', step: 'createPackingList',
      args: () => [saved.id, 'Carry on', { id: listId, rows: [{ category: 'bag', label: 'Charger', checked: false }] }] },
    { name: 'materialize the due Visa events', step: 'materializeVisa', controls: true, args: () => [] },
  ];

  for (const [index, entry] of STEPS.entries()) {
    const before = await snapshot(oracle.client, uid);
    const ledger = {
      trips: await oracle.rows(`SELECT * FROM public.trips WHERE user_id = '${uid}'`),
      plans: await oracle.rows(`SELECT * FROM public.trip_payment_plans WHERE user_id = '${uid}'`),
      installments: await oracle.rows(`SELECT * FROM public.trip_installments WHERE user_id = '${uid}'`),
      rollouts: await oracle.rows('SELECT * FROM public.travel_payment_feature_rollouts'),
    };
    const args = entry.args(before);
    const clientNow = new Date().toISOString();
    let now = null; let sourceResult = null; let sourceError = null;
    try {
      await oracle.asOwner(uid, async (client) => {
        now = (await client.query('SELECT (extract(epoch FROM now()) * 1000000)::bigint::text AS micros')).rows[0].micros;
        sourceResult = await ORACLE[entry.step]((sql, params) => client.query(sql, params), uid, args, clientNow);
      });
    } catch (error) {
      sourceError = { code: error.code ?? null, message: error.message };
    }
    const after = await snapshot(oracle.client, uid);
    const state = { ...world(before), ...ledger };
    // The id the database generated for this step, so the model addresses the same row.
    const generated = entry.step === 'createPackingList' ? [listId] : [templateId];
    const ctx = { uid, newId: () => generated.shift() ?? `unexpected-${Math.random()}`, businessToday: businessToday() };
    let modelResult = null; let modelError = null;
    try {
      modelResult = MODEL[entry.step](state, ctx, args, clientNow);
    } catch (error) {
      modelError = { code: error.code ?? null, message: error.message };
    }

    const problems = [];
    if (Boolean(sourceError) !== Boolean(modelError)) {
      problems.push(`outcome: source ${sourceError ? `error ${sourceError.code}` : 'ok'}, model ${modelError ? `error ${modelError.code}` : 'ok'}`);
    } else if (sourceError) {
      if (sourceError.code !== modelError.code) problems.push(`error: source ${sourceError.code}, model ${modelError.code}`);
    } else {
      const table = { markAllRead: 'notifications', snooze: 'notifications', markRead: 'notifications', dismiss: 'notifications',
        clearCompleted: 'notifications', materializeVisa: 'notifications', saveSettings: 'settings', insertTemplate: 'templates',
        updateTemplate: 'templates', useTemplate: 'templates', createPackingList: 'packingLists' }[entry.step];
      const sourceTable = { notifications: 'trip_notifications', settings: 'trip_notification_settings',
        templates: 'trip_templates', packingLists: 'trip_packing_lists' }[table];
      const INTEGERS = ['upcoming_days', 'usage_count'];
      const typed = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row)
        .map(([key, value]) => [key, INTEGERS.includes(key) && value !== null ? Number(value) : value])));
      problems.push(...diffRows(table, typed(after[table]), typed(modelResult.rows), now, sourceTable));
      const result = (value) => JSON.stringify(comparable(value ?? null, now));
      if (result(sourceResult) !== result(modelResult.result ?? null)) {
        problems.push(`result: source ${result(sourceResult).slice(0, 200)} model ${result(modelResult.result ?? null).slice(0, 200)}`);
      }
      if (entry.controls) {
        for (const [name, perturb] of CONTROLS.filter((control) => control[2] === table)) {
          const damaged = perturb(structuredClone(modelResult));
          const detected = diffRows(table, after[table], damaged.rows, now, sourceTable).length > 0;
          report.controls.push({ step: entry.name, name, status: detected ? 'DETECTED' : 'NOT_DETECTED' });
        }
      }
    }
    report.steps.push({ index, name: entry.name, step: entry.step,
      source: sourceError ? `error ${sourceError.code ?? sourceError.message}` : 'ok',
      model: modelError ? `error ${modelError.code ?? modelError.message}` : 'ok', problems });
  }

  // The WhatsApp composer's columns do not exist in production, which the model refuses the way PostgREST does.
  const missing = await oracle.rows(`SELECT column_name FROM information_schema.columns
    WHERE table_name = 'trip_whatsapp_templates' AND column_name IN ('category','is_favorite','is_archived','usage_count','last_used_at')`);
  const refusal = whatsappPayloadRefusal({ name: 'n', body: 'b', language: 'en', category: 'payment' });
  report.steps.push({ index: report.steps.length, name: 'the WhatsApp composer payload', step: 'whatsappRefusal',
    source: `${missing.length} composer columns exist`, model: refusal ? `refused ${refusal.code}` : 'accepted',
    problems: missing.length === 0 && refusal ? [] : ['the composer columns and the refusal disagree'] });
} finally {
  await oracle.stop();
}

report.totals = {
  steps: report.steps.length,
  stepsWithProblems: report.steps.filter((step) => step.problems.length).length,
  problems: report.steps.reduce((sum, step) => sum + step.problems.length, 0),
  controls: report.controls.length,
  controlsDetected: report.controls.filter((control) => control.status === 'DETECTED').length,
};
report.decision = report.totals.problems === 0 && report.totals.controls > 0
  && report.totals.controlsDetected === report.totals.controls ? 'PASS' : 'FAIL';
mkdirSync('migration/reports', { recursive: true });
writeFileSync('migration/reports/travel-side-parity.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ decision: report.decision, totals: report.totals }, null, 2));
for (const step of report.steps) {
  console.log(`-- ${step.name}: ${step.source} / ${step.model}${step.problems.length ? ` !${step.problems.length}` : ''}`);
  for (const problem of step.problems.slice(0, 6)) console.log(`   ${problem}`);
}
const missed = report.controls.filter((control) => control.status !== 'DETECTED');
if (missed.length) console.log('controls not detected', JSON.stringify(missed));
if (report.decision !== 'PASS') process.exitCode = 1;
