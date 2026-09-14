/**
 * Firestore document codec parity.
 *
 * The application writes documents with src/data/firestore/documentCodec.ts; the migration writes
 * them with migration/firestore/lib/transform.mjs. Both must describe the same logical row, or a
 * document the app edits stops reconciling against the model the migration proved.
 *
 * Each case starts from a value as the UI produces it, derives the text PostgreSQL would have
 * stored for it, canonicalises that source text with the migration's own canonicaliser, and
 * requires the app-encoded document to canonicalise identically.
 *
 *   node scripts/run-typescript-source-test.mjs scripts/test-firestore-document-codec.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase/firestore';
import { canonicalFromDocument, canonicalFromSource, canonicalTypeFor, transformRow, camel } from '../migration/firestore/lib/transform.mjs';
import { encode } from '../migration/firestore/lib/canonical.mjs';
import {
  CodecError, decodeRow, encodeInsert, encodeUpdate, tableSpec,
} from '../src/data/firestore/documentCodec.ts';
import {
  decimalTextFromNumber, encodeNumeric, microsToTimestampText, timestampToMicros, normaliseTime,
  addStoredDecimals, compareStoredDecimals,
} from '../src/data/firestore/exactValues.ts';

const snapshot = JSON.parse(readFileSync('migration/firestore/config/source-schema.json', 'utf8'));
const DELETE = Symbol('deleteField');
const SERVER = Symbol('serverTimestamp');
let ids = 0;
const ctx = {
  timestamp: (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds),
  serverTimestamp: () => SERVER,
  deleteField: () => DELETE,
  newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
};
const tenancy = { ownerUid: 'owner-uid-1', businessId: 'business-1' };

/** Source catalog columns in the shape the migration canonicaliser expects, after the business_id rename. */
function migrationColumns(table) {
  const spec = tableSpec(table);
  return snapshot.tables[table].columns.map((column) => ({
    name: column.name === 'business_id' ? spec.businessIdField.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) : column.name,
    type: column.dataType, udt: column.udt,
  }));
}

/** Canonical source view of a row given the text PostgreSQL would store for each column. */
function canonicalSource(table, pgTextRow) {
  const spec = tableSpec(table);
  const out = {};
  for (const column of snapshot.tables[table].columns) {
    const field = column.name === 'business_id' ? spec.businessIdField : camel(column.name);
    const type = canonicalTypeFor(column.dataType, column.udt);
    out[field] = canonicalFromSource(pgTextRow[column.name] ?? null, type);
  }
  return out;
}

function assertCanonicalParity(table, document, pgTextRow) {
  const target = canonicalFromDocument({ doc: document, columns: migrationColumns(table) });
  const source = canonicalSource(table, pgTextRow);
  for (const field of Object.keys(source)) {
    assert.equal(encode(target[field]), encode(source[field]), `${table}.${field} canonical parity`);
  }
}

test('JS numbers become the exact NUMERIC text supabase-js would have sent', () => {
  assert.equal(decimalTextFromNumber(85.47008547008546), '85.47008547008546');
  assert.equal(decimalTextFromNumber(0.1 + 0.2), '0.30000000000000004');
  assert.equal(decimalTextFromNumber(1e-7), '0.0000001');
  assert.equal(decimalTextFromNumber(1.5e-7), '0.00000015');
  assert.equal(decimalTextFromNumber(1e21), '1000000000000000000000');
  assert.equal(decimalTextFromNumber(-2.5e-8), '-0.000000025');
  assert.equal(decimalTextFromNumber(-0), '0');
  assert.throws(() => decimalTextFromNumber(Number.NaN), /NON_FINITE_NUMERIC/);
});

test('NUMERIC(p,s) rounds half away from zero on the decimal text, never on the float', () => {
  // 1.005 is below 1.005 in binary, so toFixed(2) says 1.00; PostgreSQL receives "1.005" and says 1.01.
  assert.equal(encodeNumeric(1.005, 10, 2).decimal, '1.01');
  assert.equal(encodeNumeric(-1.005, 10, 2).decimal, '-1.01');
  assert.equal(encodeNumeric(12.344, 10, 2).decimal, '12.34');
  assert.equal(encodeNumeric(7, 10, 2).decimal, '7.00');
  assert.deepEqual(encodeNumeric(99999999.99, 10, 2), { unitsText: '9999999999', units: 9999999999, scale: 2, decimal: '99999999.99' });
  assert.throws(() => encodeNumeric(99999999.995, 10, 2), /NUMERIC_FIELD_OVERFLOW/);
  assert.throws(() => encodeNumeric(123456789.1, 10, 2), /NUMERIC_FIELD_OVERFLOW/);
  const unconstrained = encodeNumeric('100.50');
  assert.equal(unconstrained.scale, 2, 'unconstrained numeric keeps the value\'s own scale');
});

test('exact decimal arithmetic aligns scales like PostgreSQL NUMERIC', () => {
  const sum = addStoredDecimals(encodeNumeric(0.1), encodeNumeric(0.2), encodeNumeric('1.005'));
  assert.equal(sum.decimal, '1.305');
  assert.equal(compareStoredDecimals(encodeNumeric('2.50'), encodeNumeric(2.5)), 0);
  assert.equal(compareStoredDecimals(encodeNumeric(2.49), encodeNumeric(2.5)), -1);
});

test('timestamps reach microseconds exactly and render as PostgREST does', () => {
  assert.equal(timestampToMicros('2026-09-14T10:11:12.345Z'), 1789380672345000n);
  assert.equal(timestampToMicros('2026-09-14 10:11:12.345678+00'), 1789380672345678n);
  assert.equal(timestampToMicros('2026-09-14T13:11:12.345+03:00'), 1789380672345000n);
  assert.equal(timestampToMicros('2026-09-14'), 1789344000000000n, 'a bare date is midnight UTC');
  assert.equal(microsToTimestampText(1789380672345000n), '2026-09-14T10:11:12.345+00:00');
  assert.equal(microsToTimestampText(1789380672000000n), '2026-09-14T10:11:12+00:00');
  assert.equal(normaliseTime('9:05'), '09:05:00');
});

test('a supermarket sale written by the app reconciles with the source text of the same sale', () => {
  const subtotal = 100 / 1.17;
  const vat = 100 - subtotal;
  const items = [{ id: 'p-1', product: { id: 'p', name: 'Milk', nameHe: 'חלב', price: 5.9, type: 'unit' }, quantity: 2 }];
  const row = {
    id: '11111111-1111-4111-8111-111111111111', business_id: 'owner-uid-1', receipt_number: 'INV-20260914-0042',
    items, subtotal, vat_amount: vat, total_amount: 100, payment_method: 'cash', amount_paid: 200,
    change_amount: 100, created_at: '2026-09-14T10:11:12.345Z',
  };
  const { id, data } = encodeInsert('market_transactions', row, ctx, tenancy);
  assert.equal(id, row.id);
  assert.equal(data.legacyBusinessUserId, 'owner-uid-1', 'business_id lands where the rehearsal puts it');
  assert.equal(data.ownerUid, 'owner-uid-1');
  assert.equal(data.businessId, 'business-1');
  assert.equal(data.orderId, null, 'an omitted nullable column is NULL');
  assertCanonicalParity('market_transactions', data, {
    ...row, items: JSON.stringify(items), subtotal: decimalTextFromNumber(subtotal),
    vat_amount: decimalTextFromNumber(vat), total_amount: '100', amount_paid: '200', change_amount: '100',
    created_at: '2026-09-14 10:11:12.345+00', order_id: null,
  });
  const decoded = decodeRow('market_transactions', data);
  assert.equal(decoded.subtotal, subtotal, 'reads return the number PostgREST would return');
  assert.equal(decoded.business_id, 'owner-uid-1');
  assert.equal(decoded.created_at, '2026-09-14T10:11:12.345+00:00');
  assert.deepEqual(decoded.items, items);
});

test('car parts apply the NUMERIC(10,2) typmod and reconcile with the rounded source', () => {
  const row = { id: '22222222-2222-4222-8222-222222222222', business_id: 'business-1', part_name: 'בלמים / فرامل',
    compatible_cars: ['Corolla', 'Civic'], quantity: 4, purchase_price_unit: 12.345, purchase_price_total: 49.38,
    selling_price_unit: 1.005, created_at: '2026-01-02T03:04:05Z', updated_at: '2026-01-02T03:04:05Z' };
  const { data } = encodeInsert('car_parts', row, ctx, tenancy);
  assert.equal(data.sourceBusinessId, 'business-1');
  assert.equal(data.purchasePriceUnit.decimal, '12.35');
  assert.equal(data.sellingPriceUnit.decimal, '1.01');
  assertCanonicalParity('car_parts', data, { ...row, compatible_cars: '{Corolla,Civic}', quantity: '4',
    purchase_price_unit: '12.35', purchase_price_total: '49.38', selling_price_unit: '1.01',
    description: null, serial_number: null, created_at: '2026-01-02 03:04:05+00', updated_at: '2026-01-02 03:04:05+00' });
});

test('omitted columns take PostgreSQL defaults, including array and numeric literals', () => {
  const { data, row } = encodeInsert('restaurant_menu_items', { name: 'Hummus', price: 18.5, business_id: 'owner-uid-1' }, ctx, tenancy);
  assert.match(row.id, /^00000000-0000-4000-8000-/, 'uuid default');
  assert.equal(data.isAvailable, true);
  assert.equal(data.taxRate.decimal, '17');
  assert.equal(data.station, 'general');
  assert.deepEqual(data.allergens, []);
  assert.deepEqual(data.availableDays, ['0', '1', '2', '3', '4', '5', '6'], 'int[] elements are stored as the migration stores them');
  assert.equal(data.createdAt, SERVER, 'now() becomes server time');
  assert.equal(data.stockQuantity.decimal, '0');
  assert.deepEqual(decodeRow('restaurant_menu_items', { ...data, createdAt: new Timestamp(1, 0) }).available_days, [0, 1, 2, 3, 4, 5, 6]);
});

test('constraint violations fail with stable codes instead of writing a bad row', () => {
  assert.throws(() => encodeInsert('market_transactions', { business_id: 'u', items: [] }, ctx, tenancy),
    (error) => error instanceof CodecError && error.code === 'NOT_NULL_VIOLATION');
  assert.throws(() => encodeInsert('restaurant_menu_items', { name: 'x', business_id: 'u', station: 'moon' }, ctx, tenancy),
    (error) => error.code === 'CHECK_VIOLATION' && error.column === 'station');
  assert.throws(() => encodeInsert('restaurant_menu_items', { name: 'x', business_id: 'u', spicy_level: 4 }, ctx, tenancy),
    (error) => error.code === 'CHECK_VIOLATION' && error.column === 'spicy_level');
  // Settings sends `address`, a column business_profiles does not have. PostgREST rejects it; so do we.
  assert.throws(() => encodeUpdate('business_profiles', { business_name: 'A', address: 'Street' }, ctx),
    (error) => error.code === 'COLUMN_NOT_FOUND' && error.column === 'address');
  assert.throws(() => encodeInsert('customer_vehicles', { business_id: 'b', plate_number: 'x', owner_name: 'y', owner_phone: 'z', year: 2020.5 }, ctx, tenancy),
    (error) => error.code === 'INVALID_INTEGER');
  assert.throws(() => encodeUpdate('car_parts', { id: 'other' }, ctx), (error) => error.code === 'PRIMARY_KEY_IMMUTABLE');
  assert.throws(() => encodeInsert('restaurant_orders', { business_id: 'u' }, ctx, tenancy),
    (error) => error.code === 'SEQUENCE_DEFAULT_REQUIRES_COUNTER' || error.code === 'NOT_NULL_VIOLATION');
});

test('updates clear stale shadows and reproduce the touch-updated_at trigger', () => {
  const partUpdate = encodeUpdate('car_parts', { quantity: 3, purchase_price_unit: 10 }, ctx);
  assert.equal(partUpdate.quantity, 3);
  assert.equal(partUpdate.purchasePriceUnit.decimal, '10.00');
  assert.equal(partUpdate.updatedAt, SERVER, 'the BEFORE UPDATE trigger sets updated_at itself');
  assert.equal(partUpdate.updatedAtMicros, DELETE);
  const jsonUpdate = encodeUpdate('market_transactions', { items: [{ quantity: 1 }] }, ctx);
  assert.equal(jsonUpdate.itemsEncoding, 'native');
  assert.equal(jsonUpdate.itemsJson, DELETE, 'a previous text encoding cannot linger beside the native value');
  const nested = encodeUpdate('market_transactions', { items: [[1, 2]] }, ctx);
  assert.equal(nested.itemsEncoding, 'text');
  assert.equal(nested.itemsJson, '[[1,2]]');
  const cleared = encodeUpdate('repair_orders', { completed_at: null }, ctx);
  assert.equal(cleared.completedAt, null);
  assert.equal(cleared.completedAtMicros, DELETE);
});

test('documents produced by the migration transform decode to PostgREST rows', () => {
  const columns = migrationColumns('restaurant_menu_items').map((column) => ({ ...column }));
  const pgRow = Object.fromEntries(columns.map((column) => [column.name, null]));
  Object.assign(pgRow, { id: '33333333-3333-4333-8333-333333333333', legacy_business_user_id: 'owner-uid-1',
    name: 'Shawarma', price: '42.50', is_available: 't', tax_rate: '17', created_at: '2026-03-04 05:06:07.123456+00',
    allergens: '{nuts,"sesame seeds"}', available_days: '{1,2,3}', cost_price: '0', station: 'grill', type: 'unit' });
  const migrated = transformRow({ row: pgRow, columns, kind: 'restaurant_menu_items', docId: pgRow.id,
    extraFields: { businessId: 'business-1', ownerUid: 'owner-uid-1' }, ctx: { Timestamp } });
  const decoded = decodeRow('restaurant_menu_items', migrated.data);
  assert.equal(decoded.price, 42.5);
  assert.equal(decoded.is_available, true);
  assert.equal(decoded.business_id, 'owner-uid-1');
  assert.equal(decoded.created_at, '2026-03-04T05:06:07.123456+00:00');
  assert.deepEqual(decoded.allergens, ['nuts', 'sesame seeds']);
  assert.deepEqual(decoded.available_days, [1, 2, 3]);
  assert.equal(decoded.description, null);
});
