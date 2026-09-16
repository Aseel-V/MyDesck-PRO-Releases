/**
 * PostgreSQL NUMERIC and jsonb value semantics for the Firestore ports of the source database functions.
 *
 * Values are exact decimals `{ units, scale }` (units * 10^-scale), the scale being PostgreSQL's display scale.
 * Division follows select_div_scale and div_var (round half away from zero), typmod assignment follows numeric(p, s),
 * and jsonb equality compares numbers by value, as `IS DISTINCT FROM` on jsonb does.
 */
import { applyNumericTypmod, decimalTextFromNumber, parseDecimalText, scaledToDecimalText } from './exactValues';

export type Dec = { units: bigint; scale: number };

export const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });
export const pow10 = (n: number) => 10n ** BigInt(n);
export const DEC_ZERO: Dec = { units: 0n, scale: 0 };

/** Integer division rounded half away from zero. */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (remainder !== 0n && absRemainder * 2n >= absDenominator) return quotient + ((numerator < 0n) !== (denominator < 0n) ? -1n : 1n);
  return quotient;
}

export const align = (value: Dec, scale: number) => value.units * pow10(scale - value.scale);
export const decAdd = (a: Dec, b: Dec): Dec => { const scale = Math.max(a.scale, b.scale); return { units: align(a, scale) + align(b, scale), scale }; };
export const decSub = (a: Dec, b: Dec): Dec => { const scale = Math.max(a.scale, b.scale); return { units: align(a, scale) - align(b, scale), scale }; };
/** numeric * numeric: exact, result scale is the sum of the scales. */
export const decMul = (a: Dec, b: Dec): Dec => ({ units: a.units * b.units, scale: a.scale + b.scale });
export function decCmp(a: Dec, b: Dec): number {
  const scale = Math.max(a.scale, b.scale);
  const x = align(a, scale); const y = align(b, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}
export const decText = (value: Dec) => scaledToDecimalText(value.units, value.scale);
export const decNumber = (value: Dec) => Number(decText(value));
export const intDec = (value: bigint | number): Dec => ({ units: BigInt(value), scale: 0 });

/** Decimal text as PostgreSQL reads it into an unconstrained numeric (scale = fraction digits). */
export function decFromText(text: string): Dec {
  const { negative, intDigits, fracDigits } = parseDecimalText(text);
  const units = BigInt(intDigits + fracDigits);
  return { units: negative ? -units : units, scale: fracDigits.length };
}

/** A JSON value `->>` cast to numeric: a JSON number or numeric string; anything else is invalid input (22P02). */
export function decFromJson(value: unknown): Dec {
  if (typeof value === 'number') return decFromText(decimalTextFromNumber(value));
  if (typeof value === 'string' && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/.test(value)) {
    const trimmed = value.trim().replace(/^\+/, '');
    return decFromText(trimmed.startsWith('.') ? `0${trimmed}` : trimmed.startsWith('-.') ? `-0${trimmed.slice(1)}` : trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed);
  }
  throw pgError(`invalid input syntax for type numeric: "${String(value)}"`, '22P02');
}

/** Assignment to numeric(precision, scale): round half away from zero, refuse overflow (22003). */
export function decTypmod(value: Dec, precision?: number, scale?: number): Dec {
  if (scale === undefined) return value;
  try {
    return applyNumericTypmod(decText(value), precision, scale);
  } catch {
    throw pgError('numeric field overflow', '22003');
  }
}

/** The first base-10000 digit and its weight, as NUMERIC stores the value. */
function nbase(value: Dec): { weight: number; first: number } {
  const abs = value.units < 0n ? -value.units : value.units;
  if (abs === 0n) return { weight: 0, first: 0 };
  const weight = Math.floor((abs.toString().length - value.scale - 1) / 4);
  const shift = -value.scale - 4 * weight;
  const shifted = shift >= 0 ? abs * pow10(shift) : abs / pow10(-shift);
  return { weight, first: Number(shifted % 10000n) };
}

/** numeric / numeric: select_div_scale, then div_var rounding half away from zero. */
export function decDiv(a: Dec, b: Dec): Dec {
  if (b.units === 0n) throw pgError('division by zero', '22012');
  const n1 = nbase(a);
  const n2 = nbase(b);
  let qweight = n1.weight - n2.weight;
  if (n1.first < n2.first) qweight -= 1;
  const rscale = Math.min(Math.max(16 - qweight * 4, a.scale, b.scale, 0), 1000);
  return { units: roundDiv(a.units * pow10(rscale - a.scale + b.scale), b.units), scale: rscale };
}

/** round(x) to scale 0. */
export const decRound0 = (value: Dec): Dec => ({ units: roundDiv(value.units, pow10(value.scale)), scale: 0 });
/** round(x * 100)::bigint */
export const minorOf = (value: Dec): bigint => (value.scale <= 2 ? value.units * pow10(2 - value.scale) : roundDiv(value.units, pow10(value.scale - 2)));

/** A numeric value as to_jsonb renders it, kept exact: the decimal text in a marker object until serialised. */
export interface JsonNumeric { __numeric: string }
export const jsonNumeric = (value: Dec): JsonNumeric => ({ __numeric: decText(value) });
const isJsonNumeric = (value: unknown): value is JsonNumeric => Boolean(value) && typeof value === 'object' && typeof (value as JsonNumeric).__numeric === 'string';

/** jsonb equality: numbers by value, objects regardless of key order, arrays in order. */
export function jsonbEqual(a: unknown, b: unknown): boolean {
  const numberOf = (value: unknown): Dec | null => (isJsonNumeric(value) ? decFromText(value.__numeric)
    : typeof value === 'number' ? decFromText(decimalTextFromNumber(value)) : null);
  const x = numberOf(a); const y = numberOf(b);
  if (x || y) return Boolean(x && y) && decCmp(x as Dec, y as Dec) === 0;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => jsonbEqual(item, b[index]));
  }
  const ka = Object.keys(a as Record<string, unknown>); const kb = Object.keys(b as Record<string, unknown>);
  return ka.length === kb.length && ka.every((key) => Object.prototype.hasOwnProperty.call(b, key)
    && jsonbEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Plain JSON for storage and comparison: numeric markers become JSON numbers (the value PostgREST's JSON yields). */
export function plainJson(value: unknown): unknown {
  if (isJsonNumeric(value)) return Number(value.__numeric);
  if (Array.isArray(value)) return value.map(plainJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, plainJson(item)]));
  return value;
}
