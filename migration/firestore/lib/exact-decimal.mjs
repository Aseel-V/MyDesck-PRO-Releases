/**
 * Exact decimal and money representation for the Firestore migration.
 *
 * PostgreSQL NUMERIC is arbitrary precision. JavaScript `number` is binary
 * floating point. Routing a source decimal through `Number` is how a migration
 * silently changes money, so nothing in this module ever does: every value
 * enters as the text PostgreSQL produced, is parsed digit by digit, and is
 * carried as a BigInt of scaled units.
 *
 * Scale is a property of the VALUE, never an assumption about the currency.
 * The live source inventory found 74 of 93 numeric columns declared as
 * unconstrained NUMERIC — no precision, no scale — so there is no column-level
 * scale to lean on. The application separately stores `*_minor` columns that
 * are scale 2 by construction (`round(sale_price * 100)`), including for JOD,
 * which ISO 4217 defines with three decimals. That mismatch is REPORTED as
 * metadata, never corrected here: a migration that "fixes" money is a migration
 * that loses parity.
 *
 * Firestore integers are int64. JavaScript numbers are exact only to 2^53-1.
 * So the authoritative field on every stored amount is `unitsText`, the base-10
 * string of the scaled integer. `units` is a numeric convenience for queries
 * and aggregation, and is present only when it is provably exact.
 */

export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;
export const JS_SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER); // 2^53 - 1

/** ISO 4217 minor-unit exponents for the currencies this product handles. */
export const ISO_CURRENCY_SCALE = Object.freeze({
  ILS: 2, USD: 2, EUR: 2, GBP: 2, JOD: 3, KWD: 3, BHD: 3, TND: 3, JPY: 0,
});

const DECIMAL_RE = /^(?<sign>[+-])?(?<int>\d+)(?:\.(?<frac>\d*))?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export class ExactDecimalError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExactDecimalError';
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ExactDecimalError(code, detail); };

/**
 * Split a decimal string into its exact parts without any arithmetic.
 * Accepts only what PostgreSQL emits for NUMERIC in this pipeline: an optional
 * sign, digits, an optional fraction. No exponent, no NaN, no Infinity — those
 * are real values in PostgreSQL NUMERIC and must be rejected loudly rather than
 * coerced into something that looks like money.
 */
export function parseDecimalString(text) {
  if (typeof text !== 'string') fail('NOT_A_STRING', typeof text);
  const trimmed = text.trim();
  if (trimmed === '') fail('EMPTY_STRING');
  if (/^-?(nan|infinity)$/i.test(trimmed)) fail('NON_FINITE_NUMERIC', trimmed);
  const m = DECIMAL_RE.exec(trimmed);
  if (!m) fail('MALFORMED_DECIMAL', trimmed);
  const frac = m.groups.frac ?? '';
  return {
    negative: m.groups.sign === '-',
    intDigits: m.groups.int,
    fracDigits: frac,
    /** Digits actually written after the point — the value's own scale. */
    sourceScale: frac.length,
    /** Scale with trailing zeros removed; the smallest lossless scale. */
    significantScale: frac.replace(/0+$/, '').length,
  };
}

/** The smallest scale at which `text` can be represented with no loss. */
export function minimumScaleFor(text) {
  return parseDecimalString(text).significantScale;
}

/**
 * Exact decimal string -> scaled BigInt.
 *
 * Widening (target scale >= the value's own) is always exact. Narrowing is
 * refused unless the discarded digits are zeros, so no value is ever rounded
 * on the way into Firestore.
 */
export function decimalStringToScaledInteger(text, scale) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 32) fail('INVALID_SCALE', String(scale));
  const { negative, intDigits, fracDigits } = parseDecimalString(text);
  let digits;
  if (fracDigits.length <= scale) {
    digits = intDigits + fracDigits.padEnd(scale, '0');
  } else {
    const kept = fracDigits.slice(0, scale);
    const dropped = fracDigits.slice(scale);
    if (/[^0]/.test(dropped)) {
      fail('EXCESS_PRECISION', `"${text}" needs scale ${fracDigits.length}, target scale ${scale}`);
    }
    digits = intDigits + kept;
  }
  const magnitude = BigInt(digits);
  return negative ? -magnitude : magnitude;
}

/** Scaled BigInt -> exact decimal string. Inverse of the function above. */
export function scaledIntegerToDecimalString(units, scale) {
  if (typeof units !== 'bigint') fail('UNITS_NOT_BIGINT', typeof units);
  if (!Number.isInteger(scale) || scale < 0 || scale > 32) fail('INVALID_SCALE', String(scale));
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? '-' : ''}${intPart}${fracPart}`;
}

/**
 * Prove the transform is lossless for this exact value, at this exact scale.
 * Called on every migrated amount; a migration that cannot round-trip a value
 * must stop on that value rather than write an approximation.
 */
export function assertExactRoundTrip(text, scale) {
  const units = decimalStringToScaledInteger(text, scale);
  const back = scaledIntegerToDecimalString(units, scale);
  const normalizedSource = normalizeDecimalString(text, scale);
  if (back !== normalizedSource) {
    fail('ROUND_TRIP_MISMATCH', `"${text}" -> ${units} -> "${back}" (expected "${normalizedSource}")`);
  }
  return { units, text: back };
}

/**
 * Render `text` the way `scaledIntegerToDecimalString` would, so round-trip
 * comparison tests the arithmetic rather than incidental formatting like
 * "+1.5", ".50" or "-0.00".
 */
export function normalizeDecimalString(text, scale) {
  const units = decimalStringToScaledInteger(text, scale);
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`;
  // -0 is not a distinct decimal value; PostgreSQL renders it as 0.
  return `${negative && units !== 0n ? '-' : ''}${intPart}${fracPart}`;
}

/** How a scaled integer may be carried in a Firestore document. */
export function classifyUnits(units) {
  if (typeof units !== 'bigint') fail('UNITS_NOT_BIGINT', typeof units);
  // Compare against the signed bounds directly. Two's complement is asymmetric
  // — |INT64_MIN| is INT64_MAX + 1 — so classifying by magnitude would push the
  // smallest representable int64 out of the int64 class.
  if (units > INT64_MAX || units < INT64_MIN) return 'DECIMAL_STRING_ONLY';
  if (units > JS_SAFE_MAX || units < -JS_SAFE_MAX) return 'INT64_TEXT_ONLY';
  return 'JS_SAFE_INTEGER';
}

/**
 * Build the stored shape for one exact amount.
 *
 * `unitsText` is authoritative and always present. `units` is a JS number only
 * inside the safe-integer range, and `null` above it: writing 2^60 as a JS
 * number would round it, and a rounded number that looks like an integer is
 * exactly the kind of silent financial change this migration must not make.
 * Values beyond int64 keep `unitsText` alone and are flagged, never truncated.
 */
export function toStoredExact(units, scale, extra = {}) {
  const representation = classifyUnits(units);
  const unitsText = units.toString();
  const stored = {
    unitsText,
    scale,
    decimal: scaledIntegerToDecimalString(units, scale),
    representation,
    units: representation === 'JS_SAFE_INTEGER' ? Number(units) : null,
    ...extra,
  };
  if (representation === 'JS_SAFE_INTEGER' && BigInt(stored.units) !== units) {
    fail('UNSAFE_NUMBER_NARROWING', unitsText);
  }
  if (representation === 'DECIMAL_STRING_ONLY') stored.exceedsInt64 = true;
  return stored;
}

/** Read an amount back out of a stored document, exactly. */
export function fromStoredExact(stored) {
  if (!stored || typeof stored !== 'object') fail('NOT_A_STORED_AMOUNT', typeof stored);
  const { unitsText, scale } = stored;
  if (typeof unitsText !== 'string' || !/^-?\d+$/.test(unitsText)) {
    fail('MISSING_UNITS_TEXT', String(unitsText));
  }
  if (!Number.isInteger(scale)) fail('MISSING_SCALE', String(scale));
  const units = BigInt(unitsText);
  // A `units` field that disagrees with `unitsText` means the document was
  // edited by something that did not understand the representation.
  if (stored.units !== null && stored.units !== undefined) {
    if (!Number.isSafeInteger(stored.units) || BigInt(stored.units) !== units) {
      fail('UNITS_DISAGREE', `${stored.units} vs ${unitsText}`);
    }
  }
  return { units, scale, decimal: scaledIntegerToDecimalString(units, scale) };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function assertCurrency(currency) {
  if (typeof currency !== 'string' || !CURRENCY_RE.test(currency)) {
    fail('INVALID_CURRENCY', String(currency));
  }
  return currency;
}

/**
 * Money from the exact text PostgreSQL produced.
 *
 * `scale` is required and explicit. When it differs from the ISO minor-unit
 * exponent — JOD held at scale 2 by this application — the value records
 * `isoScaleMismatch` so reconciliation can see it, and still migrates exactly
 * as the source holds it.
 */
export function moneyFromDecimalString(text, { currency, scale }) {
  assertCurrency(currency);
  if (!Number.isInteger(scale) || scale < 0 || scale > 32) fail('INVALID_SCALE', String(scale));
  const { units } = assertExactRoundTrip(text, scale);
  const isoScale = ISO_CURRENCY_SCALE[currency];
  return toStoredExact(units, scale, {
    currency,
    ...(isoScale !== undefined && isoScale !== scale
      ? { isoScale, isoScaleMismatch: true }
      : {}),
  });
}

/** Money already held as scaled minor units (the `*_minor` BIGINT columns). */
export function moneyFromMinorUnits(minorText, { currency, scale }) {
  assertCurrency(currency);
  if (typeof minorText !== 'string' || !/^-?\d+$/.test(minorText)) {
    fail('MALFORMED_MINOR_UNITS', String(minorText));
  }
  const units = BigInt(minorText);
  if (units < INT64_MIN || units > INT64_MAX) fail('MINOR_UNITS_EXCEED_INT64', minorText);
  const isoScale = ISO_CURRENCY_SCALE[currency];
  return toStoredExact(units, scale, {
    currency,
    ...(isoScale !== undefined && isoScale !== scale
      ? { isoScale, isoScaleMismatch: true }
      : {}),
  });
}

const requireSameKind = (a, b, op) => {
  if (a.currency !== b.currency) fail('CURRENCY_MISMATCH', `${op}: ${a.currency} vs ${b.currency}`);
  if (a.scale !== b.scale) fail('SCALE_MISMATCH', `${op}: ${a.scale} vs ${b.scale}`);
};

export function addExactMoney(a, b) {
  requireSameKind(a, b, 'add');
  const sum = BigInt(a.unitsText) + BigInt(b.unitsText);
  if (sum < INT64_MIN || sum > INT64_MAX) fail('MONEY_OVERFLOW', sum.toString());
  return toStoredExact(sum, a.scale, { currency: a.currency });
}

export function subtractExactMoney(a, b) {
  requireSameKind(a, b, 'subtract');
  const difference = BigInt(a.unitsText) - BigInt(b.unitsText);
  if (difference < INT64_MIN || difference > INT64_MAX) fail('MONEY_OVERFLOW', difference.toString());
  return toStoredExact(difference, a.scale, { currency: a.currency });
}

export function compareExactMoney(a, b) {
  requireSameKind(a, b, 'compare');
  const left = BigInt(a.unitsText);
  const right = BigInt(b.unitsText);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Exact sum of many amounts. Returns null for an empty set, never zero. */
export function sumExactMoney(amounts) {
  if (!Array.isArray(amounts)) fail('NOT_AN_ARRAY', typeof amounts);
  if (amounts.length === 0) return null;
  return amounts.reduce((acc, next) => (acc === null ? next : addExactMoney(acc, next)), null);
}

/**
 * Split `total` into `count` parts the way the source RPC does: integer
 * division, with the remainder landing entirely on the last part. Reproducing
 * this exactly matters — a different rounding rule would produce schedules that
 * sum correctly but disagree with every installment already in production.
 */
export function splitExactMoney(total, count) {
  if (!Number.isInteger(count) || count < 1) fail('INVALID_SPLIT_COUNT', String(count));
  const units = BigInt(total.unitsText);
  if (units < 0n) fail('NEGATIVE_SPLIT_TOTAL', total.unitsText);
  if (BigInt(count) > units) fail('SPLIT_COUNT_EXCEEDS_TOTAL', `${count} > ${units}`);
  const each = units / BigInt(count);
  const last = units - each * BigInt(count - 1);
  return Array.from({ length: count }, (_, i) => toStoredExact(
    i === count - 1 ? last : each, total.scale, { currency: total.currency },
  ));
}
