#!/usr/bin/env node
/**
 * Canonicalisation controls.
 *
 * The dangerous failure here is not "the hash differs" — it is "two different
 * things hash the same", because that is what lets a reconciliation report
 * PASS over lost data. Most of these tests are collision hunts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSENT, cAbsent, cNull, cString, cBool, cInt, cDecimal, cDate, cBytesHex,
  cTimestampMicros, timestampTextToMicros, cList, cSet, cMap, cJson, cJsonText,
  encode, sha256Hex, canonicalHash, diffCanonicalFields, isNfc,
} from '../lib/canonical.mjs';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code,
  `expected ${code}`);
const distinct = (...nodes) => {
  const encoded = nodes.map(encode);
  assert.equal(new Set(encoded).size, encoded.length,
    `these must not collide:\n  ${encoded.join('\n  ')}`);
};

test('the empty-ish values are all distinguishable', () => {
  // NULL, absent, empty string, zero, false and "0" are six different facts.
  distinct(cNull(), cAbsent(), cString(''), cInt(0), cBool(false), cString('0'),
    cString('null'), cList([]), cSet([]), cMap({}));
});

test('a string can never impersonate structure', () => {
  distinct(cList([cString('a'), cString('b')]), cList([cString('a,b')]));
  distinct(cMap({ a: cString('1'), b: cString('2') }), cMap({ a: cString('1,b=2') }));
  distinct(cString('list:[str:a]'), cList([cString('a')]));
  distinct(cMap({ 'a=b': cString('c') }), cMap({ a: cString('b=c') }));
});

test('integers normalize leading zeros and negative zero', () => {
  assert.equal(encode(cInt('007')), encode(cInt(7)));
  assert.equal(encode(cInt('-0')), encode(cInt(0)));
  assert.equal(encode(cInt(10n ** 30n)), encode(cInt('1000000000000000000000000000000')));
  throwsCode(() => cInt('1.0'), 'NOT_AN_INTEGER');
  throwsCode(() => cInt('abc'), 'NOT_AN_INTEGER');
});

test('decimals carry their scale, so 1.5 at two scales are different facts', () => {
  assert.equal(encode(cDecimal('1.50', 2)), encode(cDecimal('1.5', 2)));
  distinct(cDecimal('1.5', 1), cDecimal('1.50', 2));
  // A decimal must never collide with the integer or string that looks like it.
  distinct(cDecimal('7.00', 2), cInt(7), cString('7.00'), cString('7'));
  throwsCode(() => cDecimal('1.005', 2), 'EXCESS_PRECISION');
  throwsCode(() => cDecimal('1.5'), 'DECIMAL_SCALE_REQUIRED');
});

test('booleans accept only real boolean forms', () => {
  assert.equal(encode(cBool(true)), encode(cBool('t')));
  assert.equal(encode(cBool(false)), encode(cBool('f')));
  throwsCode(() => cBool('yes'), 'NOT_A_BOOLEAN');
  throwsCode(() => cBool(1), 'NOT_A_BOOLEAN');
  throwsCode(() => cBool(null), 'NOT_A_BOOLEAN');
});

test('timestamps normalize to UTC microseconds', () => {
  const utc = timestampTextToMicros('2026-09-09T12:34:56.123456Z');
  // Cross-checked against an independent implementation so this suite cannot
  // simply agree with itself: Date.parse gives the millisecond instant.
  assert.equal(utc, BigInt(Date.parse('2026-09-09T12:34:56.123Z')) * 1000n + 456n);
  assert.equal(utc, 1788957296123456n, 'exact UTC microseconds since the epoch');
  assert.equal(timestampTextToMicros('2026-09-09 12:34:56.123456+00'), utc);
  assert.equal(timestampTextToMicros('2026-09-09T15:34:56.123456+03:00'), utc,
    'an offset must resolve to the same instant');
  assert.equal(timestampTextToMicros('2026-09-09T15:34:56.123456+0300'), utc);
  // A dropped sub-second component must change the hash, not round away.
  distinct(cTimestampMicros(timestampTextToMicros('2026-09-09T12:34:56.123456Z')),
    cTimestampMicros(timestampTextToMicros('2026-09-09T12:34:56.123000Z')),
    cTimestampMicros(timestampTextToMicros('2026-09-09T12:34:56Z')));
  assert.equal(timestampTextToMicros('2026-09-09T12:34:56Z') % 1000000n, 0n);
});

test('finer-than-microsecond precision is refused rather than truncated', () => {
  assert.doesNotThrow(() => timestampTextToMicros('2026-09-09T12:34:56.123456000Z'));
  throwsCode(() => timestampTextToMicros('2026-09-09T12:34:56.123456789Z'),
    'SUB_MICROSECOND_PRECISION');
  throwsCode(() => timestampTextToMicros('not a time'), 'MALFORMED_TIMESTAMP');
});

test('dates are distinct from the timestamps and strings that resemble them', () => {
  distinct(cDate('2026-09-09'), cString('2026-09-09'),
    cTimestampMicros(timestampTextToMicros('2026-09-09T00:00:00Z')));
  throwsCode(() => cDate('2026-9-9'), 'MALFORMED_DATE');
});

test('bytes normalize the PostgreSQL hex prefix and casing', () => {
  assert.equal(encode(cBytesHex('\\xDEADBEEF')), encode(cBytesHex('deadbeef')));
  distinct(cBytesHex('deadbeef'), cString('deadbeef'));
  throwsCode(() => cBytesHex('zz'), 'MALFORMED_BYTES');
});

test('ordered lists and unordered sets mean different things', () => {
  const a = cString('a'); const b = cString('b');
  assert.notEqual(encode(cList([a, b])), encode(cList([b, a])), 'list order is meaning');
  assert.equal(encode(cSet([a, b])), encode(cSet([b, a])), 'set order is not meaning');
  distinct(cList([a, b]), cSet([a, b]));
});

test('a set preserves duplicates, so a dropped duplicate row is caught', () => {
  const a = cString('a');
  assert.notEqual(encode(cSet([a, a])), encode(cSet([a])),
    'deduplicating would hide a lost row');
});

test('maps are key-order independent but presence sensitive', () => {
  assert.equal(encode(cMap({ a: cInt(1), b: cInt(2) })), encode(cMap({ b: cInt(2), a: cInt(1) })));
  distinct(cMap({ a: cInt(1) }), cMap({ a: cInt(1), b: cNull() }), cMap({ b: cInt(1) }));
  throwsCode(() => encode([ 'map', [['k', cInt(1)], ['k', cInt(2)]] ]), 'DUPLICATE_MAP_KEY');
});

test('JSON canonicalisation is structural, not textual', () => {
  assert.equal(encode(cJsonText('{"a":1,"b":2}')), encode(cJsonText('{"b":2,"a":1}')));
  assert.equal(encode(cJsonText('{"a":1.0}')), encode(cJsonText('{"a":1}')));
  assert.notEqual(encode(cJsonText('[1,2]')), encode(cJsonText('[2,1]')),
    'JSON array order is meaning');
  distinct(cJsonText('null'), cNull(), cJsonText('"null"'), cString('null'));
  distinct(cJsonText('{}'), cJsonText('[]'), cMap({}), cList([]));
  throwsCode(() => cJsonText('{bad'), 'MALFORMED_JSON');
});

test('JSON numbers that JavaScript cannot hold exactly are refused', () => {
  // JSON.parse has already lost these values; encoding them would launder the loss.
  throwsCode(() => cJsonText('{"n":9007199254740993}'), 'UNSAFE_JSON_NUMBER');
  throwsCode(() => cJson({ n: 1e21 }), 'UNSAFE_JSON_NUMBER');
  // A value only representable in exponential form would encode differently
  // from the same magnitude written plainly, so it is refused too.
  throwsCode(() => cJson({ n: 1e-7 }), 'JSON_NUMBER_NEEDS_EXPONENT');
  throwsCode(() => cJson({ n: Infinity }), 'NON_FINITE_JSON_NUMBER');
  throwsCode(() => cJson({ n: NaN }), 'NON_FINITE_JSON_NUMBER');

  // BigInt is the supported way to carry a large JSON integer exactly, and it
  // must not collide with the string that spells the same digits.
  const big = cJson({ n: 9007199254740993n });
  assert.equal(encode(big), encode(cJson({ n: 9007199254740993n })));
  assert.notEqual(encode(big), encode(cJson({ n: '9007199254740993' })));
});

test('Arabic, Hebrew and English text survive code point for code point', () => {
  const samples = ['شركة السفر المتحدة', 'סוכנות נסיעות מאוחדת', 'United Travel Ltd.',
    'رحلة إلى عمّان', 'טיול לעמאן', 'Ammān'];
  for (const s of samples) {
    assert.equal(encode(cString(s)), `str:${s}`, 'no escaping applies to these characters');
    assert.equal(encode(cString(s)) === encode(cString(s.normalize('NFD'))),
      s === s.normalize('NFD'),
      'normalisation is NOT applied, so an NFD variant stays a different string');
  }
  // RTL marks and bidi controls are content, not noise.
  distinct(cString('שלום'), cString('‏שלום'), cString('שלום‎'));
  assert.equal(isNfc('Ammān'), true);
});

test('canonicalHash binds the value to its kind and identity', () => {
  const fields = { name: cString('Trip'), amount: cDecimal('10.00', 2) };
  const a = canonicalHash({ kind: 'trip', id: 'id-1', fields });
  const b = canonicalHash({ kind: 'trip', id: 'id-2', fields });
  const c = canonicalHash({ kind: 'installment', id: 'id-1', fields });
  assert.equal(a.hash, canonicalHash({ kind: 'trip', id: 'id-1', fields }).hash, 'stable');
  assert.notEqual(a.hash, b.hash, 'same content under a different id must not match');
  assert.notEqual(a.hash, c.hash, 'same content under a different kind must not match');
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.hash, sha256Hex(a.canonicalText));
  throwsCode(() => canonicalHash({ kind: '', id: 'x', fields: {} }), 'KIND_REQUIRED');
  throwsCode(() => canonicalHash({ kind: 'k', id: '', fields: {} }), 'ID_REQUIRED');
});

test('a one-unit financial change always changes the hash', () => {
  const base = canonicalHash({ kind: 'payment', id: 'p1',
    fields: { amount: cDecimal('1000.00', 2) } });
  const changed = canonicalHash({ kind: 'payment', id: 'p1',
    fields: { amount: cDecimal('1000.01', 2) } });
  assert.notEqual(base.hash, changed.hash);
});

test('field diff names the field rather than only reporting a hash mismatch', () => {
  const left = { a: cString('x'), b: cInt(1), gone: cString('here') };
  const right = { a: cString('y'), b: cInt(1), added: cString('new') };
  const diff = diffCanonicalFields(left, right);
  assert.deepEqual(diff.map((d) => d.field), ['a', 'added', 'gone']);
  assert.equal(diff.find((d) => d.field === 'gone').target, 'absent:');
  assert.equal(diff.find((d) => d.field === 'added').source, 'absent:');
  assert.equal(diffCanonicalFields(left, left).length, 0);
});

test('the ABSENT sentinel encodes as absence', () => {
  assert.equal(encode(ABSENT), 'absent:');
  assert.equal(encode(ABSENT), encode(cAbsent()));
  throwsCode(() => encode('str:x'), 'NOT_A_CANONICAL_NODE');
  throwsCode(() => encode(['mystery', 1]), 'UNKNOWN_TAG');
});
