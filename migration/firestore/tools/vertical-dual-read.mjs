#!/usr/bin/env node
/**
 * Vertical dual read: for every tenant of a vertical, the application's Firestore repositories, signed in
 * as the migrated owner and running under the Rules, must return exactly what the source returns.
 *
 *   Source  the production database through one REPEATABLE READ READ ONLY snapshot (a write is proven to
 *           fail with 25006). Each repository method's PostgREST request is reproduced in SQL with json_agg,
 *           which renders rows the way PostgREST does: UTC timestamps, NUMERIC as JSON numbers, embedded
 *           resources as nested JSON.
 *   Target  the Firestore emulator after full-migration-rehearsal.mjs, read through the repository classes
 *           the UI uses. The owner signs in with an emulator custom token for the migrated uid.
 *
 * Beyond the repository methods, every migrated document of the vertical's collections under the tenant is
 * inventoried against the source (missing, unexpected, orphaned tenancy), another tenant must be refused
 * each collection, and corruption controls damage one migrated document at a time over the emulator's
 * owner REST path and require the comparison to report it. Each damaged document is restored exactly, and
 * the final comparison must be clean again.
 *
 * The SQL oracle runs with the snapshot role and so ignores RLS: it states what the query means for the
 * owner. Where a source policy hid rows from their own owner by mistake, the vertical document says so.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/run-typescript-source-test.mjs migration/firestore/tools/vertical-dual-read.mjs --vertical=supermarket
 *
 * Writes migration/reports/vertical-dual-read-<vertical>.json with counts and hashed identifiers only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, getDocs, getFirestore } from 'firebase/firestore';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { RulesClient } from '../lib/rules-client.mjs';
import { FirebaseSession } from '../../../src/data/firestore/FirebaseSession.ts';
import { FirestoreSupermarketRepository } from '../../../src/data/firestore/FirestoreSupermarketRepository.ts';
import { FirestoreAutoRepairRepository } from '../../../src/data/firestore/FirestoreAutoRepairRepository.ts';
import { FirestoreCarPartsRepository } from '../../../src/data/firestore/FirestoreCarPartsRepository.ts';
import { FirestoreRestaurantRepository } from '../../../src/data/firestore/FirestoreRestaurantRepository.ts';
import { SOURCE_SCHEMA } from '../../../src/data/firestore/sourceSchema.generated.ts';
import { encodeInsert } from '../../../src/data/firestore/documentCodec.ts';
import { timestampToMicros } from '../../../src/data/firestore/exactValues.ts';

const PROJECT = 'mydesck-migration-proof';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!FIRESTORE_HOST || !AUTH_HOST) throw new Error('EMULATOR_HOSTS_REQUIRED');
const vertical = process.argv.find((arg) => arg.startsWith('--vertical='))?.slice('--vertical='.length);
const bypass = RulesClient.asAdminBypass({ host: FIRESTORE_HOST, projectId: PROJECT });
const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const sha256hex = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');
const RANGE = ['1970-01-01T00:00:00.000Z', '2999-12-31T23:59:59.999Z'];
const agg = (inner) => `SELECT coalesce(json_agg(t), '[]'::json)::text AS rows FROM (${inner}) t`;
const zero = (scale = 0) => ({ mapValue: { fields: { unitsText: { stringValue: '0' }, units: { integerValue: '0' }, scale: { integerValue: String(scale) }, decimal: { stringValue: '0' } } } });

function decimalValue(unitsText, scale) {
  const digits = unitsText.replace('-', '').padStart(scale + 1, '0');
  const decimal = `${unitsText.startsWith('-') ? '-' : ''}${digits.slice(0, digits.length - scale)}${scale ? `.${digits.slice(-scale)}` : ''}`;
  return { mapValue: { fields: { unitsText: { stringValue: unitsText }, units: { integerValue: unitsText }, scale: { integerValue: String(scale) }, decimal: { stringValue: decimal } } } };
}
const differentDecimal = (value, scale) => decimalValue(value?.mapValue?.fields?.unitsText?.stringValue === '987654' ? '123456' : '987654', scale);

/**
 * Per vertical: how tenants are found, which repository methods the UI calls with the SQL PostgREST runs for
 * them, which source rows belong to the tenant per collection, and the corruption controls.
 *
 * Tenancy of a collection: `legacyBusinessUserId` holds the owner uid where the source business_id references
 * auth.users, `sourceBusinessId` holds the business id where it references business_profiles, and child tables
 * without business_id carry only the path tenancy.
 */
const SPECS = {
  supermarket: {
    businessType: 'supermarket',
    repository: (session) => new FirestoreSupermarketRepository(session),
    methods: [
      { name: 'listAvailableProducts', table: 'restaurant_menu_items', order: null,
        sql: agg('SELECT * FROM public.restaurant_menu_items WHERE business_id = $1 AND is_available = true LIMIT 1000'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listAvailableProducts(tenant.uid) },
      { name: 'listCategories', table: 'restaurant_menu_categories', order: 'sort_order',
        sql: agg('SELECT * FROM public.restaurant_menu_categories WHERE business_id = $1 ORDER BY sort_order ASC LIMIT 1000'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listCategories(tenant.uid) },
      { name: 'listSales', table: 'market_transactions', order: 'created_at',
        sql: agg('SELECT * FROM public.market_transactions WHERE business_id = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC LIMIT 1000'),
        params: (tenant) => [tenant.uid, ...RANGE], call: (repo, tenant) => repo.listSales(tenant.uid, ...RANGE) },
    ],
    inventory: [
      { collection: 'menuCategories', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: false },
        sql: 'SELECT id::text AS id FROM public.restaurant_menu_categories WHERE business_id = $1', params: (tenant) => [tenant.uid] },
      { collection: 'menuItems', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: true },
        sql: `SELECT id::text AS id FROM public.restaurant_menu_items WHERE business_id = $1
          OR category_id IN (SELECT id FROM public.restaurant_menu_categories WHERE business_id = $1)`, params: (tenant) => [tenant.uid] },
      { collection: 'marketTransactions', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: false },
        sql: 'SELECT id::text AS id FROM public.market_transactions WHERE business_id = $1', params: (tenant) => [tenant.uid] },
    ],
    controls: [
      { name: 'sale amount changed', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, totalAmount: differentDecimal(fields.totalAmount, 2) }) },
      { name: 'sale deleted', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'missing', kind: 'delete' },
      { name: 'sale duplicated under a new id', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'unexpected', kind: 'copy' },
      { name: 'sale moved to another owner', collection: 'marketTransactions', check: { method: 'listSales' }, metric: 'missing', kind: 'patch',
        mutate: (fields) => ({ ...fields, legacyBusinessUserId: { stringValue: 'corruption-control-owner' } }) },
      { name: 'category that the source does not have', collection: 'menuCategories', check: { method: 'listCategories' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'restaurant_menu_categories', row: { business_id: tenant.uid, name: 'Corruption control', sort_order: 99 } }) },
      { name: 'available product that the source does not have', collection: 'menuItems', check: { method: 'listAvailableProducts' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'restaurant_menu_items', row: { business_id: tenant.uid, name: 'Corruption control', price: 1, is_available: true } }) },
    ],
  },
  auto_repair: {
    businessType: 'auto_repair',
    repository: (session) => new FirestoreAutoRepairRepository(session),
    methods: [
      { name: 'listRepairOrders', table: 'repair_orders', order: 'created_at',
        embeds: { vehicle: { table: 'customer_vehicles', many: false }, items: { table: 'repair_order_items', many: true } },
        sql: agg(`SELECT o.*, (SELECT to_json(v) FROM public.customer_vehicles v WHERE v.id = o.vehicle_id) AS vehicle,
          COALESCE((SELECT json_agg(i) FROM public.repair_order_items i WHERE i.order_id = o.id), '[]'::json) AS items
          FROM public.repair_orders o WHERE o.business_id = $1 ORDER BY o.created_at DESC LIMIT 1000`),
        params: (tenant) => [tenant.businessId], call: (repo, tenant) => repo.listRepairOrders(tenant.businessId) },
      { name: 'listPartsInStock', table: 'car_parts', order: 'part_name',
        sql: agg('SELECT * FROM public.car_parts WHERE business_id = $1 AND quantity > 0 ORDER BY part_name LIMIT 1000'),
        params: (tenant) => [tenant.businessId], call: (repo, tenant) => repo.listPartsInStock(tenant.businessId) },
    ],
    inventory: [
      { collection: 'vehicles', tenancy: { field: 'sourceBusinessId', of: 'businessId', nullable: false },
        sql: 'SELECT id::text AS id FROM public.customer_vehicles WHERE business_id = $1', params: (tenant) => [tenant.businessId] },
      { collection: 'vehiclePlates', tenancy: null, derived: true,
        sql: 'SELECT plate_number AS id FROM public.customer_vehicles WHERE business_id = $1', params: (tenant) => [tenant.businessId],
        idOf: (row) => sha256hex(row.id) },
      { collection: 'repairOrders', tenancy: { field: 'sourceBusinessId', of: 'businessId', nullable: false },
        sql: 'SELECT id::text AS id FROM public.repair_orders WHERE business_id = $1', params: (tenant) => [tenant.businessId] },
      { collection: 'repairOrderItems', tenancy: null,
        sql: `SELECT i.id::text AS id FROM public.repair_order_items i JOIN public.repair_orders o ON o.id = i.order_id
          WHERE o.business_id = $1`, params: (tenant) => [tenant.businessId] },
      { collection: 'parts', tenancy: { field: 'sourceBusinessId', of: 'businessId', nullable: false },
        sql: 'SELECT id::text AS id FROM public.car_parts WHERE business_id = $1', params: (tenant) => [tenant.businessId] },
    ],
    controls: [
      { name: 'part moved to another business', collection: 'parts', check: { inventory: 'parts' }, metric: 'orphans', kind: 'patch',
        mutate: (fields) => ({ ...fields, sourceBusinessId: { stringValue: 'corruption-control-business' } }) },
      { name: 'part selling price changed', collection: 'parts', check: { method: 'listPartsInStock' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, quantity: { integerValue: '7' }, sellingPriceUnit: differentDecimal(fields.sellingPriceUnit, 2) }),
        alsoMetrics: ['unexpected'] },
      { name: 'vehicle deleted', collection: 'vehicles', check: { inventory: 'vehicles' }, metric: 'missing', kind: 'delete' },
      { name: 'vehicle plate changed under its index', collection: 'vehicles', check: { inventory: 'vehiclePlates' }, metric: 'orphans', kind: 'patch',
        mutate: (fields) => ({ ...fields, plateNumber: { stringValue: 'CORRUPTION-CONTROL' } }) },
      { name: 'repair order that the source does not have', collection: 'repairOrders', check: { method: 'listRepairOrders' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'repair_orders', row: { business_id: tenant.businessId, vehicle_id: randomUUID(), status: 'working', total_amount: 0 } }) },
    ],
  },
  car_parts: {
    // The inventory screen is reachable for auto_repair owners; car_parts owners get a placeholder home.
    businessTypes: ['car_parts', 'auto_repair'],
    repository: (session) => new FirestoreCarPartsRepository(session),
    methods: [
      { name: 'listParts', table: 'car_parts', order: 'created_at',
        sql: agg('SELECT * FROM public.car_parts WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1000'),
        params: (tenant) => [tenant.businessId], call: (repo, tenant) => repo.listParts(tenant.businessId) },
    ],
    inventory: [
      { collection: 'parts', tenancy: { field: 'sourceBusinessId', of: 'businessId', nullable: false },
        sql: 'SELECT id::text AS id FROM public.car_parts WHERE business_id = $1', params: (tenant) => [tenant.businessId] },
    ],
    controls: [
      { name: 'part purchase price changed', collection: 'parts', check: { method: 'listParts' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, purchasePriceUnit: differentDecimal(fields.purchasePriceUnit, 2) }) },
      { name: 'part deleted', collection: 'parts', check: { method: 'listParts' }, metric: 'missing', kind: 'delete' },
      { name: 'part duplicated under a new id', collection: 'parts', check: { method: 'listParts' }, metric: 'unexpected', kind: 'copy' },
      { name: 'part moved to another business', collection: 'parts', check: { method: 'listParts' }, metric: 'missing', kind: 'patch',
        mutate: (fields) => ({ ...fields, sourceBusinessId: { stringValue: 'corruption-control-business' } }) },
      { name: 'part that the source does not have', collection: 'parts', check: { method: 'listParts' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'car_parts', row: { business_id: tenant.businessId, part_name: 'Corruption control', quantity: 1 } }) },
    ],
  },
  restaurant: {
    businessType: 'restaurant',
    repository: (session) => new FirestoreRestaurantRepository(session),
    methods: [
      { name: 'listTables', table: 'restaurant_tables', order: 'name',
        sql: agg('SELECT * FROM public.restaurant_tables WHERE business_id = $1 ORDER BY name LIMIT 1000'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listTables(tenant.uid) },
      { name: 'listMenu', table: 'restaurant_menu_categories', order: 'sort_order',
        embeds: { items: { table: 'restaurant_menu_items', many: true } },
        sql: agg(`SELECT c.*, COALESCE((SELECT json_agg(i) FROM public.restaurant_menu_items i WHERE i.category_id = c.id), '[]'::json) AS items
          FROM public.restaurant_menu_categories c WHERE c.business_id = $1 ORDER BY c.sort_order LIMIT 1000`),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listMenu(tenant.uid) },
      { name: 'listModifierGroups', table: 'restaurant_modifier_groups', order: 'sort_order',
        embeds: { modifiers: { table: 'restaurant_modifiers', many: true } },
        sql: agg(`SELECT g.*, COALESCE((SELECT json_agg(m) FROM public.restaurant_modifiers m WHERE m.group_id = g.id), '[]'::json) AS modifiers
          FROM public.restaurant_modifier_groups g WHERE g.business_id = $1 ORDER BY g.sort_order LIMIT 1000`),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listModifierGroups(tenant.uid) },
      { name: 'listStaff', table: 'restaurant_staff', order: 'full_name',
        sql: agg('SELECT * FROM public.restaurant_staff WHERE business_id = $1 ORDER BY full_name LIMIT 1000'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listStaff(tenant.uid) },
      { name: 'listActiveOrders', table: 'restaurant_orders', order: 'created_at',
        embeds: { items: { table: 'restaurant_order_items', many: true }, table: { table: 'restaurant_tables', many: false },
          server: { table: 'restaurant_staff', many: false } },
        sql: agg(`SELECT o.*, COALESCE((SELECT json_agg(i) FROM public.restaurant_order_items i WHERE i.order_id = o.id), '[]'::json) AS items,
          (SELECT to_json(t) FROM public.restaurant_tables t WHERE t.id = o.table_id) AS "table",
          (SELECT to_json(st) FROM public.restaurant_staff st WHERE st.id = o.server_id) AS server
          FROM public.restaurant_orders o WHERE o.business_id = $1 AND o.status NOT IN ('closed', 'cancelled') ORDER BY o.created_at DESC LIMIT 1000`),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listActiveOrders(tenant.uid) },
      // Analytics reads closed orders without a business filter and relies on RLS; the oracle states that for the owner.
      { name: 'listClosedOrders', table: 'restaurant_orders', order: 'closed_at',
        embeds: { items: { table: 'restaurant_order_items', many: true }, table: { table: 'restaurant_tables', many: false },
          server: { table: 'restaurant_staff', many: false } },
        sql: agg(`SELECT o.*, COALESCE((SELECT json_agg(i) FROM public.restaurant_order_items i WHERE i.order_id = o.id), '[]'::json) AS items,
          (SELECT to_json(t) FROM public.restaurant_tables t WHERE t.id = o.table_id) AS "table",
          (SELECT to_json(st) FROM public.restaurant_staff st WHERE st.id = o.server_id) AS server
          FROM public.restaurant_orders o WHERE o.business_id = $1 AND o.status = 'closed' AND o.closed_at >= $2 AND o.closed_at <= $3
          ORDER BY o.closed_at DESC LIMIT 1000`),
        params: (tenant) => [tenant.uid, ...RANGE], call: (repo) => repo.listClosedOrders(...RANGE) },
      { name: 'listKitchenTickets', table: 'restaurant_kitchen_tickets', order: 'created_at',
        embeds: { items: { table: 'restaurant_ticket_items', many: true }, order: { table: 'restaurant_orders', many: false } },
        sql: agg(`SELECT k.*, COALESCE((SELECT json_agg(ti) FROM public.restaurant_ticket_items ti WHERE ti.ticket_id = k.id), '[]'::json) AS items,
          (SELECT to_json(o) FROM public.restaurant_orders o WHERE o.id = k.order_id) AS "order"
          FROM public.restaurant_kitchen_tickets k WHERE k.business_id = $1 AND k.status IN ('new', 'in_progress', 'ready')
          ORDER BY k.created_at ASC LIMIT 1000`),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listKitchenTickets(tenant.uid) },
      { name: 'listActiveSessions', table: 'restaurant_table_sessions', order: 'started_at',
        embeds: { table: { table: 'restaurant_tables', many: false }, server: { table: 'restaurant_staff', many: false },
          orders: { table: 'restaurant_orders', many: true } },
        sql: agg(`SELECT s.*, (SELECT to_json(t) FROM public.restaurant_tables t WHERE t.id = s.table_id) AS "table",
          (SELECT to_json(st) FROM public.restaurant_staff st WHERE st.id = s.server_id) AS server,
          COALESCE((SELECT json_agg(o) FROM public.restaurant_orders o WHERE o.session_id = s.id), '[]'::json) AS orders
          FROM public.restaurant_table_sessions s WHERE s.business_id = $1 AND s.status = 'active' ORDER BY s.started_at DESC LIMIT 1000`),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listActiveSessions(tenant.uid) },
      { name: 'listDailyReports', table: 'restaurant_daily_reports', order: 'date',
        sql: agg('SELECT * FROM public.restaurant_daily_reports WHERE business_id = $1 ORDER BY date DESC LIMIT 30'),
        params: (tenant) => [tenant.uid], call: (repo, tenant) => repo.listDailyReports(tenant.uid) },
      { name: 'getOrCreateBusinessSettings', table: 'business_settings', order: null,
        sql: agg('SELECT * FROM public.business_settings WHERE business_id = $1'),
        params: (tenant) => [tenant.uid], call: async (repo, tenant) => [await repo.getOrCreateBusinessSettings(tenant.uid)] },
    ],
    inventory: [
      ...['tables:restaurant_tables', 'menuCategories:restaurant_menu_categories', 'restaurantStaff:restaurant_staff', 'orders:restaurant_orders',
        'kitchenTickets:restaurant_kitchen_tickets', 'restaurantAuditLogs:restaurant_audit_logs', 'voidLogs:restaurant_void_logs',
        'tableSessions:restaurant_table_sessions', 'restaurantPayments:restaurant_payments', 'reservations:restaurant_reservations',
        'waitlist:restaurant_waitlist', 'guestProfiles:restaurant_guest_profiles', 'modifierGroups:restaurant_modifier_groups',
        'dailyReports:restaurant_daily_reports', 'settings:business_settings'].map((pair) => {
        const [name, table] = pair.split(':');
        return { collection: name, tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: false },
          sql: `SELECT id::text AS id FROM public.${table} WHERE business_id = $1`, params: (tenant) => [tenant.uid] };
      }),
      { collection: 'menuItems', tenancy: { field: 'legacyBusinessUserId', of: 'uid', nullable: true },
        sql: `SELECT id::text AS id FROM public.restaurant_menu_items WHERE business_id = $1
          OR category_id IN (SELECT id FROM public.restaurant_menu_categories WHERE business_id = $1)`, params: (tenant) => [tenant.uid] },
      { collection: 'orderItems', tenancy: null,
        sql: `SELECT i.id::text AS id FROM public.restaurant_order_items i JOIN public.restaurant_orders o ON o.id = i.order_id
          WHERE o.business_id = $1`, params: (tenant) => [tenant.uid] },
      { collection: 'ticketItems', tenancy: null,
        sql: `SELECT ti.id::text AS id FROM public.restaurant_ticket_items ti JOIN public.restaurant_kitchen_tickets k ON k.id = ti.ticket_id
          WHERE k.business_id = $1`, params: (tenant) => [tenant.uid] },
      { collection: 'restaurantCounters', tenancy: null, derived: true,
        sql: `SELECT 'orders' AS id FROM public.restaurant_orders WHERE business_id = $1 LIMIT 1`, params: (tenant) => [tenant.uid] },
    ],
    // What the Rules check on every later edit, derived at import from the same snapshot: each order's exact sum of
    // active lines, each line's ticket line, and the next order number.
    derivedSource: async (select, tenant) => ({
      itemsTotal: Object.fromEntries((await select(`SELECT o.id::text AS id,
        coalesce((SELECT sum(i.price_at_time * i.quantity) FROM public.restaurant_order_items i
          WHERE i.order_id = o.id AND i.status IS DISTINCT FROM 'cancelled' AND NOT coalesce(i.voided, false)), 0)::text AS total
        FROM public.restaurant_orders o WHERE o.business_id = $1`, [tenant.uid])).rows.map((row) => [row.id, row.total])),
      ticketItem: Object.fromEntries((await select(`SELECT DISTINCT ON (i.id) i.id::text AS id, t.id::text AS ticket_item
        FROM public.restaurant_order_items i JOIN public.restaurant_orders o ON o.id = i.order_id
        LEFT JOIN public.restaurant_ticket_items t ON t.order_item_id = i.id
        WHERE o.business_id = $1 ORDER BY i.id, t.created_at DESC NULLS LAST, t.id DESC`, [tenant.uid])).rows.map((row) => [row.id, row.ticket_item])),
      counterNext: (await select('SELECT max(order_number)::int + 1 AS next FROM public.restaurant_orders WHERE business_id = $1', [tenant.uid])).rows[0].next,
    }),
    derivedCheck: async (tenant) => {
      const base = `businesses/${encodeURIComponent(tenant.businessId)}`;
      const exact = (text) => {
        const [whole, fraction = ''] = String(text).replace('-', '').split('.');
        return { units: BigInt(`${String(text).startsWith('-') ? '-' : ''}${whole}${fraction}`), scale: fraction.length };
      };
      const same = (fields, text) => {
        if (!fields?.unitsText?.stringValue) return false;
        const target = { units: BigInt(fields.unitsText.stringValue), scale: Number(fields.scale.integerValue) };
        const source = exact(text);
        const scale = Math.max(target.scale, source.scale);
        return target.units * 10n ** BigInt(scale - target.scale) === source.units * 10n ** BigInt(scale - source.scale);
      };
      let checked = 0;
      let mismatches = 0;
      for (const order of await listDocuments(`${base}/orders`)) {
        checked += 1;
        const expected = tenant.derived.itemsTotal[docId(order)];
        if (expected === undefined || !same(order.fields?.itemsTotal?.mapValue?.fields, expected)
          || order.fields?.ledgerRevision?.integerValue !== '0' || !('ledgerItemId' in (order.fields ?? {}))) mismatches += 1;
      }
      for (const line of await listDocuments(`${base}/orderItems`)) {
        checked += 1;
        const expected = tenant.derived.ticketItem[docId(line)];
        if (expected === undefined || !('ticketItemId' in (line.fields ?? {}))
          || (line.fields.ticketItemId.stringValue ?? null) !== (expected ?? null)) mismatches += 1;
      }
      if (tenant.derived.counterNext !== null) {
        checked += 1;
        const counter = (await listDocuments(`${base}/restaurantCounters`)).find((document) => docId(document) === 'orders');
        if (!counter || counter.fields?.next?.integerValue !== String(tenant.derived.counterNext)) mismatches += 1;
      }
      return { checked, mismatches };
    },
    controls: [
      { name: 'closed order total changed', collection: 'orders', check: { method: 'listClosedOrders' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, totalAmount: differentDecimal(fields.totalAmount, 0) }) },
      { name: 'order moved to another owner', collection: 'orders', check: { method: 'listClosedOrders' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, legacyBusinessUserId: { stringValue: 'corruption-control-owner' } }) },
      { name: 'order line deleted', collection: 'orderItems', check: { method: 'listClosedOrders' }, metric: 'fieldMismatches', kind: 'delete' },
      { name: 'order ledger no longer the sum of its lines', collection: 'orders', check: { derived: true }, metric: 'mismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, itemsTotal: differentDecimal(fields.itemsTotal, 0) }) },
      { name: 'sent line lost its ticket link', collection: 'orderItems', check: { derived: true }, metric: 'mismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, ticketItemId: { nullValue: null } }) },
      { name: 'order number counter rewound', collection: 'restaurantCounters', check: { derived: true }, metric: 'mismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, next: { integerValue: '1' } }) },
      { name: 'table renamed', collection: 'tables', check: { method: 'listTables' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, name: { stringValue: 'Corruption control table' } }) },
      { name: 'menu item price changed', collection: 'menuItems', check: { method: 'listMenu' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, price: differentDecimal(fields.price, 0) }) },
      { name: 'staff hourly rate changed', collection: 'restaurantStaff', check: { method: 'listStaff' }, metric: 'fieldMismatches', kind: 'patch',
        mutate: (fields) => ({ ...fields, hourlyRate: differentDecimal(fields.hourlyRate, 0) }) },
      { name: 'audit record deleted', collection: 'restaurantAuditLogs', check: { inventory: 'restaurantAuditLogs' }, metric: 'missing', kind: 'delete' },
      { name: 'open order that the source does not have', collection: 'orders', check: { method: 'listActiveOrders' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'restaurant_orders', row: { business_id: tenant.uid, status: 'open', order_number: 999999, total_amount: 0 } }) },
      { name: 'kitchen ticket that the source does not have', collection: 'kitchenTickets', check: { method: 'listKitchenTickets' }, metric: 'unexpected', kind: 'synthetic',
        build: (tenant) => ({ table: 'restaurant_kitchen_tickets', row: { business_id: tenant.uid, order_id: randomUUID(), status: 'new' } }) },
    ],
  },
};

const spec = SPECS[vertical];
if (!spec) throw new Error(`UNKNOWN_VERTICAL:${vertical}`);

function customToken(uid) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const issuer = 'firebase-auth-emulator@example.com';
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: issuer, sub: issuer, iat: now, exp: now + 3600, uid,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit' })}.`;
}

const authAdmin = (path, body) => fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body),
}).then((response) => response.json());

const createdAccounts = new Set();
const clients = [];
async function signedIn(uid, label) {
  const existing = await authAdmin('accounts:lookup', { localId: [uid] });
  if (!existing.users?.length) createdAccounts.add(uid);
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only', authDomain: 'localhost' }, `dual-read-${label}-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = FIRESTORE_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  await signInWithCustomToken(auth, customToken(uid));
  const session = new FirebaseSession({ mode: 'firestore-emulator', app, auth, db, ready: Promise.resolve(), maintenanceEnabled: false });
  const client = { app, auth, db, session };
  clients.push(client);
  return client;
}

/** A value per column in the form both sides agree on: instants as microseconds, NUMERIC as the JS number PostgREST yields. */
const NEVER_MIGRATED = { restaurant_staff: new Set(['pin_code', 'pin_hash', 'password']) };
function comparable(table, row) {
  if (row === null || row === undefined) return null;
  const out = {};
  for (const column of SOURCE_SCHEMA[table].columns) {
    if (NEVER_MIGRATED[table]?.has(column.name)) continue;
    const value = row[column.name];
    if (value === null || value === undefined) out[column.name] = null;
    else if (column.kind === 'timestamp') out[column.name] = String(timestampToMicros(String(value)));
    else if (column.kind === 'decimal') out[column.name] = Number(value);
    else out[column.name] = value;
  }
  return out;
}
const stable = (value) => JSON.stringify(value, (_, node) => (node && typeof node === 'object' && !Array.isArray(node)
  ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, node[key]])) : node));
const keyOf = (table, row) => SOURCE_SCHEMA[table].primaryKey.map((key) => String(row[key])).join('|');
const embeddedSet = (table, rows) => stable((rows ?? []).map((row) => comparable(table, row)).sort((a, b) => keyOf(table, a).localeCompare(keyOf(table, b))));

function compare(method, sourceRows, targetRows) {
  const table = method.table;
  const known = new Set([...SOURCE_SCHEMA[table].columns.map((column) => column.name), ...Object.keys(method.embeds ?? {})]);
  const unknownColumns = new Set(sourceRows.flatMap((row) => Object.keys(row).filter((key) => !known.has(key))));
  const source = new Map(sourceRows.map((row) => [keyOf(table, row), row]));
  const target = new Map(targetRows.map((row) => [keyOf(table, row), row]));
  const result = { sourceRows: source.size, targetRows: target.size, matched: 0, missing: 0, unexpected: 0, fieldMismatches: 0,
    orderMismatches: 0, mismatchedColumns: {}, unknownColumns: [...unknownColumns].sort() };
  for (const [key, row] of source) {
    const other = target.get(key);
    if (!other) { result.missing += 1; continue; }
    const a = comparable(table, row);
    const b = comparable(table, other);
    const differing = Object.keys(a).filter((column) => stable(a[column]) !== stable(b[column]));
    for (const [name, embed] of Object.entries(method.embeds ?? {})) {
      const same = embed.many ? embeddedSet(embed.table, row[name]) === embeddedSet(embed.table, other[name])
        : stable(comparable(embed.table, row[name])) === stable(comparable(embed.table, other[name]));
      if (!same) differing.push(name);
    }
    if (differing.length) {
      result.fieldMismatches += 1;
      for (const column of differing) result.mismatchedColumns[column] = (result.mismatchedColumns[column] ?? 0) + 1;
    } else {
      result.matched += 1;
    }
  }
  for (const key of target.keys()) if (!source.has(key)) result.unexpected += 1;
  if (method.order && result.missing === 0 && result.unexpected === 0) {
    const instant = SOURCE_SCHEMA[table].columns.find((column) => column.name === method.order)?.kind === 'timestamp';
    const sequence = (rows) => rows.map((row) => (instant
      ? (row[method.order] === null || row[method.order] === undefined ? 'NULL' : String(timestampToMicros(String(row[method.order]))))
      : String(row[method.order] ?? 'NULL')));
    if (stable(sequence(sourceRows)) !== stable(sequence(targetRows))) result.orderMismatches += 1;
  }
  return result;
}

async function listDocuments(path) {
  const documents = [];
  let pageToken = '';
  do {
    const response = await fetch(`http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { headers: { Authorization: 'Bearer owner' } });
    const body = await response.json();
    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return documents;
}

const restCodec = {
  timestamp: (seconds, nanoseconds) => new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6)),
  serverTimestamp: () => new Date(),
  deleteField: () => { throw new Error('DELETE_FIELD_NOT_SUPPORTED_OVER_REST'); },
  newId: () => randomUUID(),
};

const snapshotEvidence = {};
const report = { generatedAt: new Date().toISOString(), vertical, target: 'firestore-emulator', readOnlySource: snapshotEvidence,
  tenants: [], corruptionControls: [], decision: 'FAIL' };

const docId = (document) => decodeURIComponent(document.name.split('/').pop());

async function inventoryOf(tenant, item) {
  const base = `businesses/${encodeURIComponent(tenant.businessId)}`;
  const documents = await listDocuments(`${base}/${item.collection}`);
  const ids = documents.map(docId);
  const expected = new Set(tenant.inventory[item.collection]);
  // A plate index document must agree with the source and with the migrated vehicle it names, and every migrated
  // vehicle must be indexed under its own plate: the plate uniqueness the Rules enforce depends on both.
  const vehicles = item.collection === 'vehiclePlates'
    ? new Map((await listDocuments(`${base}/vehicles`)).map((document) => [docId(document), document.fields?.plateNumber?.stringValue]))
    : null;
  let orphans = documents.filter((document) => {
    const fields = document.fields ?? {};
    if (fields.businessId?.stringValue !== tenant.businessId) return true;
    if (item.derived) {
      if (item.collection === 'vehiclePlates') {
        const vehicleId = fields.vehicleId?.stringValue;
        const plate = fields.plateNumber?.stringValue;
        return !tenant.vehiclePlates?.has(`${vehicleId}|${plate}`) || sha256hex(plate) !== docId(document) || vehicles.get(vehicleId) !== plate;
      }
      return false;
    }
    if (fields.ownerUid?.stringValue !== tenant.uid) return true;
    if (!item.tenancy) return false;
    const value = fields[item.tenancy.field]?.stringValue ?? null;
    return value === null ? !item.tenancy.nullable : value !== tenant[item.tenancy.of];
  }).length;
  if (vehicles) {
    const indexed = new Set(documents.map((document) => `${document.fields?.vehicleId?.stringValue}|${docId(document)}`));
    orphans += [...vehicles].filter(([vehicleId, plate]) => !indexed.has(`${vehicleId}|${sha256hex(plate)}`)).length;
  }
  return { sourceRows: expected.size, targetDocuments: ids.length, missing: [...expected].filter((id) => !ids.includes(id)).length,
    unexpected: ids.filter((id) => !expected.has(id)).length, orphans };
}

try {
  const source = await withSourceSnapshot(localConfig(), async (select) => {
    // A screen can serve several business types (the parts inventory belongs to auto_repair owners).
    const types = spec.businessTypes ?? [spec.businessType];
    const businesses = (await select(`SELECT id::text AS id, user_id::text AS user_id FROM public.business_profiles
      WHERE business_type::text = ANY($1::text[]) ORDER BY id`, [types])).rows;
    const other = (await select(`SELECT id::text AS id, user_id::text AS user_id FROM public.business_profiles
      WHERE NOT (coalesce(business_type::text, '') = ANY($1::text[])) ORDER BY id LIMIT 1`, [types])).rows[0] ?? null;
    const tenants = [];
    for (const business of businesses) {
      const tenant = { businessId: business.id, uid: business.user_id, methods: {}, inventory: {} };
      for (const method of spec.methods) {
        tenant.methods[method.name] = JSON.parse((await select(method.sql, method.params(tenant))).rows[0].rows);
      }
      for (const item of spec.inventory) {
        tenant.inventory[item.collection] = (await select(item.sql, item.params(tenant))).rows.map((row) => (item.idOf ? item.idOf(row) : row.id)).sort();
      }
      if (spec.derivedSource) tenant.derived = await spec.derivedSource(select, tenant);
      if (spec.inventory.some((item) => item.collection === 'vehiclePlates')) {
        tenant.vehiclePlates = new Set((await select(`SELECT id::text AS id, plate_number FROM public.customer_vehicles WHERE business_id = $1`,
          [tenant.businessId])).rows.map((row) => `${row.id}|${row.plate_number}`));
      }
      tenants.push(tenant);
    }
    return { tenants, other };
  }, snapshotEvidence);

  const compareTenant = async (tenant, repo, only) => {
    const results = {};
    for (const method of spec.methods) {
      if (only && method.name !== only) continue;
      results[method.name] = compare(method, tenant.methods[method.name], await method.call(repo, tenant));
    }
    return results;
  };
  const clean = (results) => Object.values(results).every((r) => r.missing === 0 && r.unexpected === 0
    && r.fieldMismatches === 0 && r.orderMismatches === 0 && r.unknownColumns.length === 0);
  const inventoryClean = (results) => Object.values(results).every((r) => r.missing === 0 && r.unexpected === 0 && r.orphans === 0);

  const intruder = source.other ? await signedIn(source.other.user_id, 'other-tenant') : null;
  for (const tenant of source.tenants) {
    const owner = await signedIn(tenant.uid, 'owner');
    const repo = spec.repository(owner.session);
    const entry = { businessHash: hash(tenant.businessId), ownerHash: hash(tenant.uid), methods: await compareTenant(tenant, repo), inventory: {},
      crossTenant: { attempts: 0, denied: 0 } };
    for (const item of spec.inventory) entry.inventory[item.collection] = await inventoryOf(tenant, item);
    entry.derived = spec.derivedCheck ? await spec.derivedCheck(tenant) : { checked: 0, mismatches: 0 };

    if (intruder) {
      for (const item of spec.inventory.filter((candidate) => !candidate.derived)) {
        entry.crossTenant.attempts += 1;
        try {
          await getDocs(collection(intruder.db, 'businesses', tenant.businessId, item.collection));
        } catch (error) {
          if (error?.code === 'permission-denied') entry.crossTenant.denied += 1; else throw error;
        }
      }
    }

    for (const control of spec.controls) {
      const base = `businesses/${encodeURIComponent(tenant.businessId)}/${control.collection}`;
      const existing = (await listDocuments(base)).filter((document) => tenant.inventory[control.collection].includes(docId(document)));
      if (control.kind !== 'synthetic' && existing.length === 0) {
        report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), status: 'NOT_APPLICABLE_NO_ROWS' });
        continue;
      }
      const victim = existing[0];
      const victimPath = victim ? victim.name.split('/documents/')[1] : null;
      let cleanup;
      if (control.kind === 'patch') {
        await bypass.request('PATCH', victimPath, { fields: control.mutate(victim.fields) });
        cleanup = () => bypass.request('PATCH', victimPath, { fields: victim.fields });
      } else if (control.kind === 'delete') {
        await bypass.delete(victimPath);
        cleanup = () => bypass.request('PATCH', victimPath, { fields: victim.fields });
      } else if (control.kind === 'copy') {
        const id = randomUUID();
        await bypass.request('PATCH', `${base}/${id}`, { fields: { ...victim.fields, id: { stringValue: id } } });
        cleanup = () => bypass.delete(`${base}/${id}`);
      } else {
        const { table, row } = control.build(tenant);
        const encoded = encodeInsert(table, row, restCodec, { ownerUid: tenant.uid, businessId: tenant.businessId });
        await bypass.set(`${base}/${encoded.id}`, encoded.data);
        cleanup = () => bypass.delete(`${base}/${encoded.id}`);
      }
      let observed;
      try {
        if (control.check.derived) {
          observed = (await spec.derivedCheck(tenant))[control.metric];
        } else if (control.check.method) {
          const result = (await compareTenant(tenant, repo, control.check.method))[control.check.method];
          observed = [control.metric, ...(control.alsoMetrics ?? [])].reduce((sum, metric) => sum + result[metric], 0);
        } else {
          const item = spec.inventory.find((candidate) => candidate.collection === control.check.inventory);
          const result = await inventoryOf(tenant, item);
          observed = result[control.metric];
        }
      } catch (error) {
        observed = `ERROR:${error?.code ?? error?.message}`;
      } finally {
        await cleanup();
      }
      report.corruptionControls.push({ name: control.name, tenant: hash(tenant.businessId), metric: control.metric,
        observed, status: typeof observed === 'number' && observed > 0 ? 'DETECTED' : 'NOT_DETECTED' });
    }

    const finalInventory = {};
    for (const item of spec.inventory) finalInventory[item.collection] = await inventoryOf(tenant, item);
    entry.restoredClean = clean(await compareTenant(tenant, repo)) && inventoryClean(finalInventory)
      && (!spec.derivedCheck || (await spec.derivedCheck(tenant)).mismatches === 0);
    entry.clean = clean(entry.methods);
    report.tenants.push(entry);
  }

  const sum = (pick) => report.tenants.reduce((total, tenant) => total + pick(tenant), 0);
  const methodSum = (field) => sum((tenant) => Object.values(tenant.methods).reduce((total, r) => total + r[field], 0));
  const inventorySum = (field) => sum((tenant) => Object.values(tenant.inventory).reduce((total, r) => total + r[field], 0));
  report.totals = {
    tenants: report.tenants.length,
    sourceRowsCompared: methodSum('sourceRows'),
    matched: methodSum('matched'),
    missing: methodSum('missing') + inventorySum('missing'),
    unexpected: methodSum('unexpected') + inventorySum('unexpected'),
    fieldMismatches: methodSum('fieldMismatches'),
    orderMismatches: methodSum('orderMismatches'),
    unknownColumns: sum((tenant) => Object.values(tenant.methods).reduce((total, r) => total + r.unknownColumns.length, 0)),
    orphans: inventorySum('orphans'),
    sourceRowsInventoried: inventorySum('sourceRows'),
    migratedDocuments: inventorySum('targetDocuments'),
    crossTenantAttempts: sum((tenant) => tenant.crossTenant.attempts),
    crossTenantAllowed: sum((tenant) => tenant.crossTenant.attempts - tenant.crossTenant.denied),
    controlsApplicable: report.corruptionControls.filter((control) => control.status !== 'NOT_APPLICABLE_NO_ROWS').length,
    controlsDetected: report.corruptionControls.filter((control) => control.status === 'DETECTED').length,
    restoredClean: report.tenants.every((tenant) => tenant.restoredClean),
    derivedChecked: sum((tenant) => tenant.derived.checked),
    derivedMismatches: sum((tenant) => tenant.derived.mismatches),
  };
  const t = report.totals;
  report.decision = t.missing === 0 && t.unexpected === 0 && t.fieldMismatches === 0 && t.orderMismatches === 0
    && t.unknownColumns === 0 && t.orphans === 0 && t.derivedMismatches === 0 && t.crossTenantAllowed === 0 && t.controlsDetected === t.controlsApplicable
    && t.restoredClean && snapshotEvidence.rejectedWriteSqlState === '25006' && snapshotEvidence.successfulWrites === 0
    && (t.tenants === 0 || t.crossTenantAttempts > 0) ? 'PASS' : 'FAIL';
} finally {
  for (const client of clients) {
    await signOut(client.auth).catch(() => undefined);
    await deleteApp(client.app).catch(() => undefined);
  }
  for (const uid of createdAccounts) await authAdmin('accounts:delete', { localId: uid }).catch(() => undefined);
  writeReport(`migration/reports/vertical-dual-read-${vertical}.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ vertical, decision: report.decision, totals: report.totals }, null, 2));
if (report.decision !== 'PASS') process.exitCode = 1;
void zero;
