#!/usr/bin/env node
/**
 * Transform controls.
 *
 * The property that matters is round-trip identity: for every supported type,
 * canonicalising the SOURCE text and canonicalising the FIRESTORE document
 * built from it must produce the same node. Anything that breaks that property
 * is a value the migration would change without saying so.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../lib/canonical.mjs';
import {
  camel, canonicalTypeFor, parsePgArray, inspectJsonForFirestore,
  canonicalFromSource, firestoreFieldsFromSource, canonicalFromTarget,
  estimateDocumentBytes, transformRow, DOCUMENT_SIZE_BUDGET_BYTES, jsonNumberLiteralsPreserved,
} from '../lib/transform.mjs';

/** Minimal stand-in for the Admin SDK Timestamp, with the same shape. */
class Timestamp {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
}
const ctx = { Timestamp };

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, `expected ${code}`);

/** Source text -> document -> canonical, versus source text -> canonical. */
const roundTrip = (value, type) => {
  const fields = firestoreFieldsFromSource('f', value, type, ctx);
  const source = canonicalFromSource(value, type);
  const target = canonicalFromTarget(fields, 'f', type);
  assert.equal(encode(target), encode(source),
    `round trip failed for ${type} ${JSON.stringify(value)}`);
  return fields;
};

test('column names become camelCase', () => {
  assert.equal(camel('user_id'), 'userId');
  assert.equal(camel('card_total_minor'), 'cardTotalMinor');
  assert.equal(camel('id'), 'id');
  assert.equal(camel('return_departure_datetime'), 'returnDepartureDatetime');
});

test('every PostgreSQL type in the live schema maps, and nothing else does', () => {
  const expected = {
    uuid: 'string', text: 'string', 'character varying': 'string',
    smallint: 'int', integer: 'int', bigint: 'int',
    numeric: 'decimal', 'double precision': 'decimal', real: 'decimal', boolean: 'bool',
    'timestamp with time zone': 'timestamp', 'timestamp without time zone': 'timestamp',
    date: 'date', json: 'json', jsonb: 'json', bytea: 'bytes', ARRAY: 'array',
    'USER-DEFINED': 'string',
  };
  for (const [pg, canonical] of Object.entries(expected)) {
    assert.equal(canonicalTypeFor(pg), canonical, pg);
  }
  throwsCode(() => canonicalTypeFor('geometry'), 'UNMAPPED_PG_TYPE');
});

test('PostgreSQL array literals decode with quoting, escapes and NULLs', () => {
  assert.deepEqual(parsePgArray('{}'), []);
  assert.deepEqual(parsePgArray('{a,b}'), ['a', 'b']);
  assert.deepEqual(parsePgArray('{"a,b",c}'), ['a,b', 'c'], 'an embedded comma is not a separator');
  assert.deepEqual(parsePgArray('{NULL,a}'), [null, 'a']);
  assert.deepEqual(parsePgArray('{"NULL"}'), ['NULL'], 'quoted NULL is the string');
  assert.deepEqual(parsePgArray('{"say \\"hi\\""}'), ['say "hi"']);
  assert.deepEqual(parsePgArray('{"شركة","סוכנות"}'), ['شركة', 'סוכנות']);
  assert.equal(parsePgArray(null), null);
  throwsCode(() => parsePgArray('not an array'), 'MALFORMED_PG_ARRAY');
});

test('scalars round-trip source -> document -> canonical', () => {
  roundTrip('7a2849f6-61ef-402e-91e4-0e0f70c1ad9b', 'string');
  roundTrip('migration-test-- عميل לדוגמה a 1', 'string');
  roundTrip('', 'string');
  roundTrip('42', 'int');
  roundTrip('-1', 'int');
  roundTrip('t', 'bool');
  roundTrip('f', 'bool');
  roundTrip('2026-12-01', 'date');
  roundTrip('\\xdeadbeef', 'bytes');
  roundTrip(null, 'string');
  roundTrip(null, 'decimal');
  roundTrip(null, 'timestamp');
});

test('decimals round-trip at the value own scale, including the odd ones', () => {
  // These are the exact shapes the live synthetic slice produces.
  for (const text of ['711.29', '918.43', '0.00000000000000000000',
    '270.1100000000000000', '1', '0.00', '-0.01', '29.12']) {
    const fields = roundTrip(text, 'decimal');
    assert.equal(fields.f.decimal, text, `stored decimal must reproduce ${text} exactly`);
  }
});

test('a decimal is never stored as a bare number', () => {
  const fields = firestoreFieldsFromSource('amount', '918.43', 'decimal', ctx);
  assert.equal(typeof fields.amount, 'object');
  assert.equal(fields.amount.unitsText, '91843');
  assert.equal(fields.amount.scale, 2);
  assert.equal(fields.amount.units, 91843);
  throwsCode(() => canonicalFromTarget({ amount: 918.43 }, 'amount', 'decimal'),
    'DECIMAL_NOT_STORED_AS_OBJECT');
});

test('a tampered decimal is detected on read-back', () => {
  const fields = firestoreFieldsFromSource('amount', '918.43', 'decimal', ctx);
  throwsCode(() => canonicalFromTarget({ amount: { ...fields.amount, units: 91844 } },
    'amount', 'decimal'), 'DECIMAL_UNITS_DISAGREE');
  throwsCode(() => canonicalFromTarget({ amount: { scale: 2 } }, 'amount', 'decimal'),
    'DECIMAL_MISSING_UNITS_TEXT');
  // Changing only unitsText still changes the canonical value, which is the point.
  const tampered = canonicalFromTarget({ amount: { unitsText: '91844', scale: 2, units: 91844 } },
    'amount', 'decimal');
  assert.notEqual(encode(tampered), encode(canonicalFromSource('918.43', 'decimal')));
});

test('timestamps keep microseconds and carry a shadow that must agree', () => {
  const fields = roundTrip('2026-09-09 16:34:20.90482+00', 'timestamp');
  assert.equal(fields.fMicros, '1788971660904820');
  assert.equal(fields.f.seconds, 1788971660);
  assert.equal(fields.f.nanoseconds, 904820000);

  throwsCode(() => canonicalFromTarget({ f: fields.f }, 'f', 'timestamp'),
    'MISSING_TIMESTAMP_SHADOW');
  throwsCode(() => canonicalFromTarget({ f: fields.f, fMicros: '1788971660904821' },
    'f', 'timestamp'), 'TIMESTAMP_SHADOW_DISAGREES');
  // A Timestamp rewritten to a different instant is caught even though the
  // shadow is what the canonical value is ultimately built from.
  throwsCode(() => canonicalFromTarget(
    { f: new Timestamp(1788971661, 904820000), fMicros: fields.fMicros }, 'f', 'timestamp'),
    'TIMESTAMP_SHADOW_DISAGREES');
});

test('JSON is stored natively and canonicalises identically', () => {
  const travelers = '[{"full_name": "migration-test-- مسافر ראשון a", "nationality": "TEST"}]';
  const fields = roundTrip(travelers, 'json');
  assert.equal(fields.fEncoding, 'native');
  assert.deepEqual(fields.f, JSON.parse(travelers));
  roundTrip('[]', 'json');
  roundTrip('{}', 'json');
  roundTrip('{"a": 1.10, "b": null, "c": [1,2,3]}', 'json');
});

test('JSON null and SQL NULL are different facts and stay different', () => {
  // The source financial audit holds both: a column that is SQL NULL, and a
  // column whose JSONB value is the literal null. Storing them the same way
  // would lose the difference between "no audit value" and "the value was null".
  const sqlNull = firestoreFieldsFromSource('v', null, 'json', ctx);
  const jsonNull = firestoreFieldsFromSource('v', 'null', 'json', ctx);
  assert.equal(sqlNull.v, null);
  assert.equal(sqlNull.vEncoding, undefined, 'a SQL NULL column carries no encoding');
  assert.equal(jsonNull.v, null);
  assert.equal(jsonNull.vEncoding, 'native', 'JSON null carries its encoding');

  assert.notEqual(encode(canonicalFromTarget(jsonNull, 'v', 'json')),
    encode(canonicalFromTarget(sqlNull, 'v', 'json')));
  assert.equal(encode(canonicalFromTarget(sqlNull, 'v', 'json')),
    encode(canonicalFromSource(null, 'json')));
  assert.equal(encode(canonicalFromTarget(jsonNull, 'v', 'json')),
    encode(canonicalFromSource('null', 'json')));
});

test('JSON numeric literals JavaScript would rewrite are stored as text', () => {
  assert.equal(jsonNumberLiteralsPreserved('{"a":1}').preserved, true);
  assert.equal(jsonNumberLiteralsPreserved('{"a":0.5,"b":-3}').preserved, true);
  assert.equal(jsonNumberLiteralsPreserved('0.00000000000000000000').preserved, false);
  assert.equal(jsonNumberLiteralsPreserved('1.10').preserved, false);
  // A number inside a string is text, not a literal.
  assert.equal(jsonNumberLiteralsPreserved('{"name":"room 1.10"}').preserved, true);
  assert.equal(jsonNumberLiteralsPreserved('{"n":"1.10"}').preserved, true);

  // These are the exact literals the live financial audit holds.
  for (const text of ['0.00000000000000000000', '270.1100000000000000', '111.1100000000000000']) {
    const fields = roundTrip(text, 'json');
    assert.equal(fields.fEncoding, 'text', `${text} must not be stored natively`);
    assert.equal(fields.fJson, text, 'the source literal is preserved byte for byte');
  }
  assert.equal(firestoreFieldsFromSource('f', '918.43', 'json', ctx).fEncoding, 'native');
});

test('JSON Firestore cannot hold natively falls back to text, still exactly', () => {
  assert.equal(inspectJsonForFirestore([[1]]).reason, 'NESTED_ARRAY');
  assert.equal(inspectJsonForFirestore({ __name__: 1 }).reason, 'RESERVED_KEY:__name__');
  assert.equal(inspectJsonForFirestore({ '': 1 }).reason, 'EMPTY_KEY');
  assert.equal(inspectJsonForFirestore({ a: [1, 2] }).safe, true);

  const nested = '[[1,2],[3]]';
  const fields = roundTrip(nested, 'json');
  assert.equal(fields.fEncoding, 'text');
  assert.equal(fields.fJson, nested);
  assert.equal(fields.fTextReason, 'NESTED_ARRAY');
});

test('an integer too large to be exact blocks rather than rounds', () => {
  assert.equal(firestoreFieldsFromSource('id', '9007199254740991', 'int', ctx).id,
    9007199254740991);
  throwsCode(() => firestoreFieldsFromSource('id', '9007199254740993', 'int', ctx),
    'UNSAFE_INTEGER');
});

test('arrays round-trip including NULL elements and RTL text', () => {
  roundTrip('{a,b}', 'array');
  roundTrip('{NULL,a}', 'array');
  roundTrip('{"شركة","סוכנות"}', 'array');
  roundTrip('{}', 'array');
});

test('document size is estimated and an oversized document is refused', () => {
  assert.ok(estimateDocumentBytes({ a: 'x' }) > 0);
  const columns = [{ name: 'id', type: 'uuid' }, { name: 'blob', type: 'text' }];
  const ok = transformRow({
    row: { id: 'abc', blob: 'x'.repeat(1000) }, columns, kind: 'trip', docId: 'abc', ctx });
  assert.equal(ok.data.id, 'abc');
  assert.ok(ok.estimatedBytes > 1000);

  assert.throws(() => transformRow({
    row: { id: 'abc', blob: 'x'.repeat(DOCUMENT_SIZE_BUDGET_BYTES + 1) },
    columns, kind: 'trip', docId: 'abc', ctx,
  }), (e) => e.code === 'DOCUMENT_EXCEEDS_BUDGET');
});

test('a large embedded array is warned about rather than silently accepted', () => {
  const columns = [{ name: 'id', type: 'uuid' }, { name: 'travelers', type: 'jsonb' }];
  const many = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ n: `t${i}` })));
  const result = transformRow({ row: { id: 'a', travelers: many }, columns,
    kind: 'trip', docId: 'a', ctx });
  assert.equal(result.warnings.some((w) => w.kind === 'EMBEDDED_ARRAY_LARGE'), true);
});

test('a whole row transforms with both views agreeing field by field', () => {
  const columns = [
    { name: 'id', type: 'uuid' },
    { name: 'user_id', type: 'uuid' },
    { name: 'sale_price', type: 'numeric' },
    { name: 'cash_paid_amount', type: 'numeric' },
    { name: 'created_at', type: 'timestamp with time zone' },
    { name: 'start_date', type: 'date' },
    { name: 'travelers', type: 'jsonb' },
    { name: 'export_to_pdf', type: 'boolean' },
    { name: 'travelers_count', type: 'integer' },
    { name: 'deleted_at', type: 'timestamp with time zone' },
  ];
  const row = {
    id: '7a2849f6-61ef-402e-91e4-0e0f70c1ad9b',
    user_id: 'b4a1c115-62e0-4cd8-a8cd-5e19ecb73496',
    sale_price: '918.43',
    cash_paid_amount: '270.1100000000000000',
    created_at: '2026-09-09 16:34:20.90482+00',
    start_date: '2026-12-01',
    travelers: '[{"full_name": "migration-test-- مسافر ראשון a"}]',
    export_to_pdf: 'false',
    travelers_count: '2',
    deleted_at: null,
  };
  const result = transformRow({ row, columns, kind: 'trip', docId: row.id,
    extraFields: { ownerUid: row.user_id, schemaVersion: 1 }, ctx });

  assert.equal(result.data.ownerUid, row.user_id);
  assert.equal(result.data.schemaVersion, 1);
  assert.equal(result.data.deletedAt, null);

  for (const column of columns) {
    const field = camel(column.name);
    const type = canonicalTypeFor(column.type);
    assert.equal(encode(canonicalFromTarget(result.data, field, type)),
      encode(result.canonicalSource[field]), `field ${field} must agree`);
  }
});
