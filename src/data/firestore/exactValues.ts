/**
 * Exact value conversion for Firestore application writes.
 *
 * The migration stores NUMERIC as an exact decimal object and timestamps as a Firestore Timestamp
 * plus a microsecond shadow. Application writes must land in the same shape, or a document the app
 * edits would stop reconciling against the model the migration proved.
 *
 * Nothing here routes money through floating point arithmetic. A JS number arrives as the value the
 * UI already computed; it is turned into the exact decimal text supabase-js would have sent to
 * PostgreSQL (the shortest round-trip rendering), and PostgreSQL's own typmod rounding is then
 * applied to that text, digit by digit.
 */

export interface StoredDecimal {
  unitsText: string;
  units: number | null;
  scale: number;
  decimal: string;
  exceedsInt64?: true;
}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const JS_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const DECIMAL_TEXT = /^([+-])?(\d+)(?:\.(\d*))?$/;

export class ExactValueError extends Error {
  constructor(readonly code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExactValueError';
  }
}

const stripLeadingZeros = (digits: string) => digits.replace(/^0+(?=\d)/, '');

/**
 * The decimal text PostgreSQL receives for a JS number.
 *
 * supabase-js serialises with JSON.stringify, which renders a finite number with the shortest
 * round-trip digits and switches to exponent notation outside [1e-7, 1e21). PostgreSQL NUMERIC
 * accepts the exponent and keeps the value exactly, with display scale max(0, fraction - exponent).
 */
export function decimalTextFromNumber(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ExactValueError('NON_FINITE_NUMERIC', String(value));
  const text = JSON.stringify(value);
  const match = /^(-)?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new ExactValueError('MALFORMED_NUMBER', text);
  const [, sign = '', intPart, fraction = '', exponentText] = match;
  if (!exponentText) return `${sign}${intPart}${fraction ? `.${fraction}` : ''}`;
  const exponent = Number(exponentText);
  let digits = intPart + fraction;
  let point = intPart.length + exponent;
  if (point <= 0) { digits = '0'.repeat(1 - point) + digits; point = 1; }
  if (point >= digits.length) return `${sign}${stripLeadingZeros(digits + '0'.repeat(point - digits.length))}`;
  return `${sign}${stripLeadingZeros(digits.slice(0, point))}.${digits.slice(point)}`;
}

/** Split exact decimal text into sign, integer digits and fraction digits. */
export function parseDecimalText(text: string) {
  const match = DECIMAL_TEXT.exec(text.trim());
  if (!match) throw new ExactValueError('MALFORMED_DECIMAL', text);
  return { negative: match[1] === '-', intDigits: match[2], fracDigits: match[3] ?? '' };
}

/**
 * Apply a NUMERIC(p, s) typmod exactly as PostgreSQL does: round half away from zero to s digits,
 * pad to exactly s digits, and refuse a value whose integer part needs more than p - s digits.
 * Unconstrained NUMERIC keeps the value's own scale.
 */
export function applyNumericTypmod(text: string, precision?: number, scale?: number): { units: bigint; scale: number } {
  const { negative, intDigits, fracDigits } = parseDecimalText(text);
  if (scale === undefined) {
    const units = BigInt(intDigits + fracDigits);
    return { units: negative ? -units : units, scale: fracDigits.length };
  }
  const kept = fracDigits.slice(0, scale).padEnd(scale, '0');
  let magnitude = BigInt(intDigits + kept);
  const dropped = fracDigits.slice(scale);
  if (dropped.length && Number(dropped[0]) >= 5) magnitude += 1n;
  if (precision !== undefined && magnitude >= 10n ** BigInt(precision)) {
    throw new ExactValueError('NUMERIC_FIELD_OVERFLOW', text);
  }
  return { units: negative ? -magnitude : magnitude, scale };
}

export function scaledToDecimalText(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`;
  return `${negative && units !== 0n ? '-' : ''}${intPart}${fraction}`;
}

/** The stored shape, field for field what migration/firestore/lib/transform.mjs writes. */
export function toStoredDecimal(units: bigint, scale: number): StoredDecimal {
  if (!Number.isInteger(scale) || scale < 0 || scale > 32) throw new ExactValueError('INVALID_SCALE', String(scale));
  const exceedsInt64 = units > INT64_MAX || units < INT64_MIN;
  const safe = units <= JS_SAFE && units >= -JS_SAFE;
  return {
    unitsText: units.toString(),
    units: safe ? Number(units) : null,
    scale,
    decimal: scaledToDecimalText(units, scale),
    ...(exceedsInt64 ? { exceedsInt64: true as const } : {}),
  };
}

/** Encode a UI value (number or decimal string) for a NUMERIC column. */
export function encodeNumeric(value: number | string, precision?: number, scale?: number): StoredDecimal {
  const text = typeof value === 'number' ? decimalTextFromNumber(value) : String(value).trim();
  const { units, scale: finalScale } = applyNumericTypmod(text, precision, scale);
  return toStoredDecimal(units, finalScale);
}

/** Read a stored decimal. The exact object is authoritative; `units` must agree when present. */
export function readStoredDecimal(stored: unknown): { units: bigint; scale: number } {
  if (!stored || typeof stored !== 'object') throw new ExactValueError('NOT_A_STORED_DECIMAL');
  const { unitsText, scale, units } = stored as Partial<StoredDecimal>;
  if (typeof unitsText !== 'string' || !/^-?\d+$/.test(unitsText)) throw new ExactValueError('MISSING_UNITS_TEXT');
  if (!Number.isInteger(scale)) throw new ExactValueError('MISSING_SCALE');
  const exact = BigInt(unitsText);
  if (units !== null && units !== undefined && (!Number.isSafeInteger(units) || BigInt(units) !== exact)) {
    throw new ExactValueError('UNITS_DISAGREE', `${units} vs ${unitsText}`);
  }
  return { units: exact, scale: scale as number };
}

/** The JS number PostgREST would have returned for this NUMERIC value. */
export function storedDecimalToNumber(stored: unknown): number {
  const { units, scale } = readStoredDecimal(stored);
  return Number(scaledToDecimalText(units, scale));
}

/** Exact decimal arithmetic on stored values, aligned to the larger scale like PostgreSQL NUMERIC. */
export function addStoredDecimals(...values: StoredDecimal[]): StoredDecimal {
  const read = values.map(readStoredDecimal);
  const scale = Math.max(0, ...read.map((value) => value.scale));
  const sum = read.reduce((total, value) => total + value.units * 10n ** BigInt(scale - value.scale), 0n);
  return toStoredDecimal(sum, scale);
}

export function compareStoredDecimals(left: StoredDecimal, right: StoredDecimal): number {
  const a = readStoredDecimal(left);
  const b = readStoredDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  const x = a.units * 10n ** BigInt(scale - a.scale);
  const y = b.units * 10n ** BigInt(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------------------------

const TIMESTAMP_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Timestamp text -> UTC microseconds, as PostgreSQL timestamptz input would read it in a UTC session.
 * A value without a zone is UTC (Supabase sessions run in UTC). Sub-microsecond digits are rounded
 * half up, which is what timestamptz input does.
 */
export function timestampToMicros(value: string | Date): bigint {
  if (value instanceof Date) {
    const millis = value.getTime();
    if (!Number.isFinite(millis)) throw new ExactValueError('INVALID_DATE');
    return BigInt(millis) * 1000n;
  }
  const match = TIMESTAMP_TEXT.exec(String(value).trim());
  if (!match) throw new ExactValueError('MALFORMED_TIMESTAMP', String(value));
  const [, y, mo, d, h = '00', mi = '00', s = '00', fraction = '', zone] = match;
  const digits = fraction.padEnd(7, '0');
  let micros = BigInt(digits.slice(0, 6));
  if (Number(digits[6]) >= 5) micros += 1n;
  let offsetMinutes = 0n;
  if (zone && zone.toUpperCase() !== 'Z') {
    const parts = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
    if (!parts) throw new ExactValueError('MALFORMED_TIMEZONE', zone);
    offsetMinutes = BigInt(parts[1] === '-' ? -1 : 1) * (BigInt(parts[2]) * 60n + BigInt(parts[3] ?? '0'));
  }
  const epochDays = BigInt(Date.UTC(Number(y), Number(mo) - 1, Number(d)) / 86_400_000);
  const seconds = epochDays * 86_400n + BigInt(h) * 3600n + BigInt(mi) * 60n + BigInt(s) - offsetMinutes * 60n;
  return seconds * 1_000_000n + micros;
}

export function microsToSecondsAndNanos(micros: bigint): { seconds: number; nanoseconds: number } {
  let seconds = micros / 1_000_000n;
  let remainder = micros - seconds * 1_000_000n;
  if (remainder < 0n) { seconds -= 1n; remainder += 1_000_000n; }
  return { seconds: Number(seconds), nanoseconds: Number(remainder) * 1000 };
}

/** UTC microseconds -> the text PostgREST returns for timestamptz: fraction trimmed, +00:00 zone. */
export function microsToTimestampText(micros: bigint): string {
  const { seconds, nanoseconds } = microsToSecondsAndNanos(micros);
  const date = new Date(seconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const base = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  const fraction = String(nanoseconds / 1000).padStart(6, '0').replace(/0+$/, '');
  return `${base}${fraction ? `.${fraction}` : ''}+00:00`;
}

/** DATE input: ISO date, or the date part of an ISO timestamp. */
export function normaliseDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/.exec(text);
  if (!match) throw new ExactValueError('MALFORMED_DATE', text);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new ExactValueError('DATE_OUT_OF_RANGE', text);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** TIME input -> HH:MM:SS[.ffffff], the text PostgreSQL stores and returns. */
export function normaliseTime(value: string): string {
  const match = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?$/.exec(String(value).trim());
  if (!match) throw new ExactValueError('MALFORMED_TIME', String(value));
  const [h, m, s = '0', fraction] = match.slice(1);
  if (Number(h) > 24 || Number(m) > 59 || Number(s) > 60) throw new ExactValueError('TIME_OUT_OF_RANGE', String(value));
  const trimmed = fraction?.replace(/0+$/, '');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}${trimmed ? `.${trimmed}` : ''}`;
}
