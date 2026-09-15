/**
 * Allow/deny behaviour of the generated schema-validator helpers, exactly as committed.
 *
 * The helpers check a whole group of columns with one list operation to stay inside Firestore's
 * 1,000-expression budget (see migration/firestore/tools/generate-rules-schema.mjs). That is only
 * sound if each one refuses every wrong type, so each helper is exercised here with the values that
 * look closest to valid: digit strings next to integers, 1.0 next to 1, 'true' next to true, text
 * containing the separator, maps and lists where scalars belong.
 *
 * The SCHEMA-VALIDATORS block is taken from migration/firestore/rules/firestore.rules and loaded
 * with one probe rule into a separate emulator project; values are sent over REST so that integers
 * and doubles are distinguished exactly.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test scripts/test-firestore-schema-validators.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'mydesck-validator-probe';
const RULES = readFileSync('migration/firestore/rules/firestore.rules', 'utf8');
const BEGIN = RULES.indexOf('    // SCHEMA-VALIDATORS:BEGIN');
const END = RULES.indexOf('    // SCHEMA-VALIDATORS:END');
const BLOCK = RULES.slice(BEGIN, END);

/** A double that happens to be integral; plain JS numbers that are integers are sent as integers. */
class Double { constructor(value) { this.value = value; } }
const double = (value) => new Double(value);

function encode(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Double) return { doubleValue: value.value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'bigint') return { integerValue: value.toString() };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
}

let counter = 0;
async function verdict(expression, data) {
  const content = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n${BLOCK}\n`
    + `    function probe(d) { return ${expression}; }\n    match /probe/{id} { allow create: if probe(request.resource.data); }\n  }\n}\n`;
  const loaded = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  if (!loaded.ok) throw new Error(`RULES_LOAD_FAILED:${loaded.status}:${(await loaded.text()).slice(0, 400)}`);
  counter += 1;
  const response = await fetch(`http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents/probe?documentId=p${counter}x${Date.now()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, encode(item)])) }),
  });
  if (response.ok) return 'allow';
  if (response.status === 403) return 'deny';
  throw new Error(`UNEXPECTED_STATUS:${response.status}:${await response.text()}`);
}

async function expectAll(expression, cases) {
  for (const [label, data, expected] of cases) {
    assert.equal(await verdict(expression, data), expected, `${expression} :: ${label}`);
  }
}

test('the committed Rules contain the generated block', () => {
  assert.ok(BEGIN > 0 && END > BEGIN);
  for (const helper of ['sfStrings', 'sfBools', 'sfBoolsRequired', 'sfInts', 'sfDecimal', 'sfDecimalScaled', 'sfDecimalValue', 'sfJsonRequired', 'sfJson']) {
    assert.match(BLOCK, new RegExp(`function ${helper}\\(`), helper);
  }
});

test('sfStrings accepts text and null only', async () => {
  await expectAll('sfStrings([d.a, d.b, d.c])', [
    ['text and null', { a: 'x', b: null, c: 'y z' }, 'allow'],
    ['empty strings anywhere', { a: '', b: '', c: '' }, 'allow'],
    ['all null', { a: null, b: null, c: null }, 'allow'],
    ['unicode, RTL, regex metacharacters, newlines', { a: 'חלב 3% (1L) [x]*+?', b: 'كامل \\ $ ^ |', c: 'line\n\tend' }, 'allow'],
    ['the sentinel word itself', { a: 'end', b: 'end', c: null }, 'allow'],
    ['integer', { a: 'x', b: 1, c: null }, 'deny'],
    ['integral double', { a: double(1), b: null, c: null }, 'deny'],
    ['boolean', { a: true, b: null, c: null }, 'deny'],
    ['digit string next to an integer', { a: '1', b: 1, c: null }, 'deny'],
    ['map', { a: { k: 'v' }, b: null, c: null }, 'deny'],
    ['list', { a: ['x'], b: null, c: null }, 'deny'],
    ['timestamp', { a: new Date('2026-09-14T08:00:00Z'), b: null, c: null }, 'deny'],
    ['text containing the separator', { a: 'x￿y', b: null, c: null }, 'deny'],
  ]);
});

test('sfBools and sfBoolsRequired accept booleans only', async () => {
  await expectAll('sfBools([d.a, d.b])', [
    ['booleans and null', { a: true, b: null }, 'allow'],
    ['false', { a: false, b: false }, 'allow'],
    ['integer 1', { a: 1, b: null }, 'deny'],
    ['integer 0', { a: 0, b: null }, 'deny'],
    ['string true', { a: 'true', b: null }, 'deny'],
    ['double', { a: double(1), b: null }, 'deny'],
  ]);
  await expectAll('sfBoolsRequired([d.a, d.b])', [
    ['booleans', { a: true, b: false }, 'allow'],
    ['null', { a: true, b: null }, 'deny'],
  ]);
});

test('sfInts accepts integers and null only', async () => {
  await expectAll('sfInts([d.a, d.b, d.c])', [
    ['integers and null', { a: 1, b: -5, c: null }, 'allow'],
    ['int64 bounds', { a: 9223372036854775807n, b: -9223372036854775808n, c: 0 }, 'allow'],
    ['all null', { a: null, b: null, c: null }, 'allow'],
    ['double with a fraction', { a: 1.5, b: null, c: null }, 'deny'],
    ['integral double', { a: double(2), b: null, c: null }, 'deny'],
    ['digit string', { a: '12', b: null, c: null }, 'deny'],
    ['digit string equal to a neighbouring integer', { a: '1', b: 1, c: null }, 'deny'],
    ['string with a comma', { a: '1,2', b: null, c: null }, 'deny'],
    ['string with the separator', { a: '1￿2', b: null, c: null }, 'deny'],
    ['empty string', { a: '', b: 1, c: null }, 'deny'],
    ['boolean', { a: true, b: null, c: null }, 'deny'],
    ['map', { a: { k: 1 }, b: null, c: null }, 'deny'],
    ['list', { a: [1], b: null, c: null }, 'deny'],
  ]);
});

const decimal = (overrides = {}) => ({ unitsText: '590', units: 590, scale: 2, decimal: '5.90', ...overrides });

test('sfDecimal accepts exactly the stored decimal shape', async () => {
  await expectAll('sfDecimal(d.v)', [
    ['codec shape', { v: decimal() }, 'allow'],
    ['units null', { v: decimal({ units: null }) }, 'allow'],
    ['negative', { v: decimal({ unitsText: '-590', units: -590, decimal: '-5.90' }) }, 'allow'],
    ['scale 0', { v: decimal({ unitsText: '7', units: 7, scale: 0, decimal: '7' }) }, 'allow'],
    ['units disagree', { v: decimal({ units: 591 }) }, 'deny'],
    ['units a string', { v: decimal({ units: 'x' }) }, 'deny'],
    ['units an integral double', { v: decimal({ units: double(590) }) }, 'deny'],
    ['extra key', { v: { ...decimal(), extra: true } }, 'deny'],
    ['units missing', { v: { unitsText: '590', scale: 2, decimal: '5.90' } }, 'deny'],
    ['exceedsInt64 marker', { v: decimal({ unitsText: '99999999999999999999', units: null, exceedsInt64: true }) }, 'deny'],
    ['scale a double', { v: decimal({ scale: double(2) }) }, 'deny'],
    ['scale a string', { v: decimal({ scale: '2' }) }, 'deny'],
    ['scale out of range', { v: decimal({ scale: 33 }) }, 'deny'],
    ['negative scale', { v: decimal({ scale: -1 }) }, 'deny'],
    ['unitsText with a plus sign', { v: decimal({ unitsText: '+590' }) }, 'deny'],
    ['unitsText with a point', { v: decimal({ unitsText: '5.90', units: null }) }, 'deny'],
    ['unitsText a number', { v: decimal({ unitsText: 590 }) }, 'deny'],
    ['decimal not a string', { v: decimal({ decimal: 5.9 }) }, 'deny'],
    ['a float instead of the object', { v: 5.9 }, 'deny'],
    ['a string instead of the object', { v: 'abcd' }, 'deny'],
  ]);
});

test('sfDecimalScaled enforces NUMERIC(p,s) scale and precision', async () => {
  await expectAll("sfDecimalScaled(d.v, 2, '-?[0-9]{1,10}')", [
    ['NUMERIC(10,2)', { v: decimal() }, 'allow'],
    ['ten digits', { v: decimal({ unitsText: '9999999999', units: 9999999999, decimal: '99999999.99' }) }, 'allow'],
    ['eleven digits', { v: decimal({ unitsText: '10000000000', units: 10000000000, decimal: '100000000.00' }) }, 'deny'],
    ['other scale', { v: decimal({ unitsText: '5900', units: 5900, scale: 3, decimal: '5.900' }) }, 'deny'],
    ['units disagree', { v: decimal({ units: 1 }) }, 'deny'],
  ]);
  await expectAll('sfDecimalValue(d.v) >= 0', [
    ['zero', { v: decimal({ unitsText: '0', units: 0, decimal: '0.00' }) }, 'allow'],
    ['negative', { v: decimal({ unitsText: '-1', units: -1, decimal: '-0.01' }) }, 'deny'],
  ]);
});

test('sfJsonRequired and sfJson accept the three JSON encodings only', async () => {
  const required = "sfJsonRequired(d.get('xEncoding', null), d.get('x', null), d.get('xJson', null))";
  const nullable = "sfJson(d.get('xEncoding', null), d.get('x', null), d.get('xJson', null))";
  await expectAll(required, [
    ['native', { x: [{ quantity: 1 }], xEncoding: 'native' }, 'allow'],
    ['text', { x: null, xEncoding: 'text', xJson: '{"a":1}', xTextReason: 'NESTED_ARRAY' }, 'allow'],
    ['text with a native value too', { x: [1], xEncoding: 'text', xJson: '[1]' }, 'deny'],
    ['text without its JSON', { x: null, xEncoding: 'text' }, 'deny'],
    ['no marker', { x: [1] }, 'deny'],
    ['SQL NULL is not allowed', { x: null }, 'deny'],
    ['unknown marker', { x: [1], xEncoding: 'binary' }, 'deny'],
  ]);
  await expectAll(nullable, [
    ['SQL NULL', { x: null }, 'allow'],
    ['absent', {}, 'allow'],
    ['value without a marker', { x: [1] }, 'deny'],
  ]);
});

test('timestamp shadows are digit strings when present', async () => {
  await expectAll("d.get('tMicros', '0').matches('-?[0-9]+')", [
    ['absent', {}, 'allow'],
    ['digits', { tMicros: '1789372800000000' }, 'allow'],
    ['negative', { tMicros: '-1' }, 'allow'],
    ['an integer', { tMicros: 1789372800000000 }, 'deny'],
    ['null', { tMicros: null }, 'deny'],
    ['not digits', { tMicros: '2026-09-14' }, 'deny'],
  ]);
});

test('typed in-lists compare strictly', async () => {
  await expectAll("d.v in [null, 'grill', 'fry']", [
    ['member', { v: 'fry' }, 'allow'],
    ['null', { v: null }, 'allow'],
    ['other text', { v: 'moon' }, 'deny'],
    ['integer', { v: 1 }, 'deny'],
  ]);
  await expectAll('d.v in [null, 0, 1, 2, 3]', [
    ['member', { v: 3 }, 'allow'],
    ['out of range', { v: 4 }, 'deny'],
    ['integral double', { v: double(1) }, 'deny'],
    ['digit string', { v: '1' }, 'deny'],
  ]);
});
