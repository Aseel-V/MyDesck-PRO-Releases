#!/usr/bin/env node
/**
 * Exact-decimal controls.
 *
 * Every assertion here is about a way money could silently change. The positive
 * cases prove the transform is lossless; the negative cases prove the library
 * REFUSES rather than approximates, because a library that quietly rounds is
 * worse than one that has no round-trip test at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INT64_MAX, INT64_MIN, JS_SAFE_MAX, ISO_CURRENCY_SCALE,
  parseDecimalString, minimumScaleFor, decimalStringToScaledInteger,
  scaledIntegerToDecimalString, assertExactRoundTrip, normalizeDecimalString,
  classifyUnits, toStoredExact, fromStoredExact, assertCurrency,
  moneyFromDecimalString, moneyFromMinorUnits,
  addExactMoney, subtractExactMoney, compareExactMoney, sumExactMoney, splitExactMoney,
} from '../lib/exact-decimal.mjs';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code,
  `expected ${code}, got something else`);

test('parses sign, integer and fraction without arithmetic', () => {
  assert.deepEqual(parseDecimalString('123.45'),
    { negative: false, intDigits: '123', fracDigits: '45', sourceScale: 2, significantScale: 2 });
  assert.deepEqual(parseDecimalString('-0.00100'),
    { negative: true, intDigits: '0', fracDigits: '00100', sourceScale: 5, significantScale: 3 });
  assert.equal(parseDecimalString('7').sourceScale, 0);
  assert.equal(minimumScaleFor('1.500'), 1);
  assert.equal(minimumScaleFor('1.000'), 0);
});

test('rejects everything that is not a plain finite decimal', () => {
  throwsCode(() => parseDecimalString(123.45), 'NOT_A_STRING');
  throwsCode(() => parseDecimalString(''), 'EMPTY_STRING');
  throwsCode(() => parseDecimalString('NaN'), 'NON_FINITE_NUMERIC');
  throwsCode(() => parseDecimalString('Infinity'), 'NON_FINITE_NUMERIC');
  throwsCode(() => parseDecimalString('-Infinity'), 'NON_FINITE_NUMERIC');
  // Exponent notation is not what this pipeline reads, and silently accepting
  // it would let 1e3 and 1000 hash differently for the same value.
  throwsCode(() => parseDecimalString('1e3'), 'MALFORMED_DECIMAL');
  throwsCode(() => parseDecimalString('12,34'), 'MALFORMED_DECIMAL');
  throwsCode(() => parseDecimalString('--1'), 'MALFORMED_DECIMAL');
  throwsCode(() => parseDecimalString('0x10'), 'MALFORMED_DECIMAL');
});

test('scaling is exact in both directions', () => {
  assert.equal(decimalStringToScaledInteger('123.45', 2), 12345n);
  assert.equal(decimalStringToScaledInteger('123.45', 4), 1234500n);
  assert.equal(decimalStringToScaledInteger('-0.01', 2), -1n);
  assert.equal(decimalStringToScaledInteger('0', 2), 0n);
  assert.equal(decimalStringToScaledInteger('1.500', 2), 150n, 'trailing zeros are not precision');
  assert.equal(scaledIntegerToDecimalString(12345n, 2), '123.45');
  assert.equal(scaledIntegerToDecimalString(-1n, 2), '-0.01');
  assert.equal(scaledIntegerToDecimalString(5n, 4), '0.0005');
  assert.equal(scaledIntegerToDecimalString(7n, 0), '7');
});

test('refuses to round: excess precision is an error, not a rounding decision', () => {
  throwsCode(() => decimalStringToScaledInteger('123.456', 2), 'EXCESS_PRECISION');
  throwsCode(() => decimalStringToScaledInteger('0.001', 2), 'EXCESS_PRECISION');
  throwsCode(() => decimalStringToScaledInteger('-0.005', 2), 'EXCESS_PRECISION');
  // The classic float trap: 1.005 at scale 2 must not become 1.00 or 1.01.
  throwsCode(() => decimalStringToScaledInteger('1.005', 2), 'EXCESS_PRECISION');
});

test('invalid scales are rejected', () => {
  throwsCode(() => decimalStringToScaledInteger('1.0', -1), 'INVALID_SCALE');
  throwsCode(() => decimalStringToScaledInteger('1.0', 1.5), 'INVALID_SCALE');
  throwsCode(() => decimalStringToScaledInteger('1.0', 33), 'INVALID_SCALE');
  throwsCode(() => scaledIntegerToDecimalString(1n, -1), 'INVALID_SCALE');
  throwsCode(() => scaledIntegerToDecimalString(1, 2), 'UNITS_NOT_BIGINT');
});

test('round trip holds across boundaries and formatting variants', () => {
  for (const [text, scale] of [
    ['0', 0], ['0.00', 2], ['-0.00', 2], ['+1.5', 1], ['0.50', 2],
    ['9007199254740993.12345677', 8], // beyond 2^53, from the existing fixture
    ['0.000000000000000001', 18],
    ['99999999999999999999999999.999999', 6],
  ]) {
    const { units, text: back } = assertExactRoundTrip(text, scale);
    assert.equal(back, normalizeDecimalString(text, scale), `round trip for ${text}`);
    assert.equal(scaledIntegerToDecimalString(units, scale), back);
  }
  assert.equal(normalizeDecimalString('-0.00', 2), '0.00', 'negative zero is zero');
  assert.equal(normalizeDecimalString('+1.5', 1), '1.5');
});

test('a value that JS Number would corrupt survives exactly', () => {
  const text = '9007199254740993.12345677'; // 2^53 + 1, plus a fraction
  const units = decimalStringToScaledInteger(text, 8);
  assert.equal(units, 900719925474099312345677n);
  assert.equal(scaledIntegerToDecimalString(units, 8), text);
  // Proof the naive route loses it.
  assert.notEqual(String(Number(text)), text);
});

test('classifies how a scaled integer may be carried', () => {
  assert.equal(classifyUnits(0n), 'JS_SAFE_INTEGER');
  assert.equal(classifyUnits(JS_SAFE_MAX), 'JS_SAFE_INTEGER');
  assert.equal(classifyUnits(-JS_SAFE_MAX), 'JS_SAFE_INTEGER');
  assert.equal(classifyUnits(JS_SAFE_MAX + 1n), 'INT64_TEXT_ONLY');
  assert.equal(classifyUnits(INT64_MAX), 'INT64_TEXT_ONLY');
  assert.equal(classifyUnits(INT64_MIN), 'INT64_TEXT_ONLY');
  assert.equal(classifyUnits(INT64_MAX + 1n), 'DECIMAL_STRING_ONLY');
  assert.equal(classifyUnits(INT64_MIN - 1n), 'DECIMAL_STRING_ONLY');
});

test('stored shape never narrows a number it cannot hold', () => {
  const safe = toStoredExact(12345n, 2, { currency: 'ILS' });
  assert.equal(safe.units, 12345);
  assert.equal(safe.unitsText, '12345');
  assert.equal(safe.decimal, '123.45');

  const big = toStoredExact(JS_SAFE_MAX + 1n, 2);
  assert.equal(big.units, null, 'above 2^53-1 the numeric field must be null, not rounded');
  assert.equal(big.unitsText, '9007199254740992');

  const huge = toStoredExact(INT64_MAX + 1n, 2);
  assert.equal(huge.units, null);
  assert.equal(huge.exceedsInt64, true);
  assert.equal(huge.unitsText, '9223372036854775808');
});

test('reading back detects a document whose fields disagree', () => {
  const stored = toStoredExact(12345n, 2, { currency: 'ILS' });
  assert.equal(fromStoredExact(stored).units, 12345n);
  throwsCode(() => fromStoredExact({ ...stored, units: 12346 }), 'UNITS_DISAGREE');
  throwsCode(() => fromStoredExact({ ...stored, units: 2 ** 60 }), 'UNITS_DISAGREE');
  throwsCode(() => fromStoredExact({ ...stored, unitsText: '12.5' }), 'MISSING_UNITS_TEXT');
  throwsCode(() => fromStoredExact({ ...stored, unitsText: undefined }), 'MISSING_UNITS_TEXT');
  throwsCode(() => fromStoredExact({ ...stored, scale: '2' }), 'MISSING_SCALE');
  throwsCode(() => fromStoredExact(null), 'NOT_A_STORED_AMOUNT');
  // unitsText alone is enough to recover the value.
  assert.equal(fromStoredExact({ unitsText: '9223372036854775808', scale: 2 }).decimal,
    '92233720368547758.08');
});

test('currency codes are validated', () => {
  assert.equal(assertCurrency('ILS'), 'ILS');
  throwsCode(() => assertCurrency('ils'), 'INVALID_CURRENCY');
  throwsCode(() => assertCurrency('SHEKEL'), 'INVALID_CURRENCY');
  throwsCode(() => assertCurrency(''), 'INVALID_CURRENCY');
  throwsCode(() => assertCurrency(null), 'INVALID_CURRENCY');
});

test('money carries its own scale and reports an ISO mismatch instead of fixing it', () => {
  const ils = moneyFromDecimalString('123.45', { currency: 'ILS', scale: 2 });
  assert.equal(ils.unitsText, '12345');
  assert.equal(ils.isoScaleMismatch, undefined, 'ILS at scale 2 matches ISO');

  // This application stores every currency in hundredths, including JOD, which
  // ISO 4217 defines with three decimals. Parity requires migrating it as the
  // source holds it; the mismatch is recorded so it stays visible.
  assert.equal(ISO_CURRENCY_SCALE.JOD, 3);
  const jod = moneyFromMinorUnits('12345', { currency: 'JOD', scale: 2 });
  assert.equal(jod.decimal, '123.45');
  assert.equal(jod.isoScale, 3);
  assert.equal(jod.isoScaleMismatch, true);
});

test('minor-unit money rejects malformed and out-of-range input', () => {
  throwsCode(() => moneyFromMinorUnits('12.5', { currency: 'ILS', scale: 2 }), 'MALFORMED_MINOR_UNITS');
  throwsCode(() => moneyFromMinorUnits('', { currency: 'ILS', scale: 2 }), 'MALFORMED_MINOR_UNITS');
  throwsCode(() => moneyFromMinorUnits(12345, { currency: 'ILS', scale: 2 }), 'MALFORMED_MINOR_UNITS');
  throwsCode(() => moneyFromMinorUnits((INT64_MAX + 1n).toString(), { currency: 'ILS', scale: 2 }),
    'MINOR_UNITS_EXCEED_INT64');
  throwsCode(() => moneyFromMinorUnits((INT64_MIN - 1n).toString(), { currency: 'ILS', scale: 2 }),
    'MINOR_UNITS_EXCEED_INT64');
  assert.equal(moneyFromMinorUnits(INT64_MAX.toString(), { currency: 'ILS', scale: 2 }).unitsText,
    '9223372036854775807');
});

test('negative amounts and zero are ordinary values', () => {
  const negative = moneyFromDecimalString('-42.00', { currency: 'EUR', scale: 2 });
  assert.equal(negative.unitsText, '-4200');
  assert.equal(negative.decimal, '-42.00');
  const zero = moneyFromDecimalString('0.00', { currency: 'EUR', scale: 2 });
  assert.equal(zero.unitsText, '0');
  assert.equal(zero.decimal, '0.00');
});

test('arithmetic is exact and refuses mixed currency or scale', () => {
  const a = moneyFromDecimalString('0.10', { currency: 'ILS', scale: 2 });
  const b = moneyFromDecimalString('0.20', { currency: 'ILS', scale: 2 });
  assert.equal(addExactMoney(a, b).decimal, '0.30', 'the 0.1 + 0.2 float trap');
  assert.equal(subtractExactMoney(b, a).decimal, '0.10');
  assert.equal(compareExactMoney(a, b), -1);
  assert.equal(compareExactMoney(b, a), 1);
  assert.equal(compareExactMoney(a, a), 0);

  const eur = moneyFromDecimalString('0.10', { currency: 'EUR', scale: 2 });
  throwsCode(() => addExactMoney(a, eur), 'CURRENCY_MISMATCH');
  const scale4 = moneyFromDecimalString('0.1000', { currency: 'ILS', scale: 4 });
  throwsCode(() => addExactMoney(a, scale4), 'SCALE_MISMATCH');
  throwsCode(() => compareExactMoney(a, eur), 'CURRENCY_MISMATCH');
});

test('addition overflow is refused, not wrapped', () => {
  const max = moneyFromMinorUnits(INT64_MAX.toString(), { currency: 'ILS', scale: 2 });
  const one = moneyFromMinorUnits('1', { currency: 'ILS', scale: 2 });
  throwsCode(() => addExactMoney(max, one), 'MONEY_OVERFLOW');
  const min = moneyFromMinorUnits(INT64_MIN.toString(), { currency: 'ILS', scale: 2 });
  throwsCode(() => subtractExactMoney(min, one), 'MONEY_OVERFLOW');
});

test('summing an empty set is null, not a fabricated zero', () => {
  assert.equal(sumExactMoney([]), null);
  const items = ['0.01', '0.02', '0.03'].map(
    (t) => moneyFromDecimalString(t, { currency: 'ILS', scale: 2 }));
  assert.equal(sumExactMoney(items).decimal, '0.06');
  throwsCode(() => sumExactMoney('nope'), 'NOT_AN_ARRAY');
});

test('installment split reproduces the source remainder rule exactly', () => {
  // 100.00 over 3: the source computes 3333 each and gives the remainder to the
  // last row, so the schedule is 33.33 / 33.33 / 33.34 and sums to the total.
  const total = moneyFromMinorUnits('10000', { currency: 'ILS', scale: 2 });
  const parts = splitExactMoney(total, 3);
  assert.deepEqual(parts.map((p) => p.decimal), ['33.33', '33.33', '33.34']);
  assert.equal(sumExactMoney(parts).unitsText, total.unitsText, 'split must be conservative');

  assert.deepEqual(splitExactMoney(total, 1).map((p) => p.decimal), ['100.00']);
  const seven = splitExactMoney(moneyFromMinorUnits('10000', { currency: 'ILS', scale: 2 }), 7);
  assert.equal(sumExactMoney(seven).unitsText, '10000');

  throwsCode(() => splitExactMoney(total, 0), 'INVALID_SPLIT_COUNT');
  throwsCode(() => splitExactMoney(total, 1.5), 'INVALID_SPLIT_COUNT');
  throwsCode(() => splitExactMoney(moneyFromMinorUnits('-1', { currency: 'ILS', scale: 2 }), 2),
    'NEGATIVE_SPLIT_TOTAL');
  throwsCode(() => splitExactMoney(moneyFromMinorUnits('2', { currency: 'ILS', scale: 2 }), 3),
    'SPLIT_COUNT_EXCEEDS_TOTAL');
});

test('no authoritative path converts through JavaScript Number', async () => {
  // A guard against regression: the module must not reach for Number(), parseFloat
  // or toFixed on a value path. Number() appears only where a safe-integer bound
  // has already been proven, so the check is deliberately specific.
  const source = await import('node:fs').then(
    (fs) => fs.readFileSync(new URL('../lib/exact-decimal.mjs', import.meta.url), 'utf8'));
  assert.equal(/parseFloat|toFixed|Math\.round/.test(source), false,
    'exact-decimal must not use float helpers');
  const numberCalls = source.match(/\bNumber\(/g) ?? [];
  assert.equal(numberCalls.length, 1,
    'Number() is allowed exactly once, in toStoredExact, under a proven safe-integer bound');
});
