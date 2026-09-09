/**
 * Canonical representation and hashing for source rows and Firestore documents.
 *
 * A relational row and a Firestore document do not have the same shape, so the
 * raw bytes of one will never equal the raw bytes of the other. Both sides are
 * therefore normalized into ONE tagged logical form and hashed from that.
 *
 * The tagging is the whole point. A canonicaliser that renders NULL, the empty
 * string, a missing field, `false` and `0` into anything that can collide will
 * happily report parity across a migration that lost data — so every value here
 * carries its type in its encoding, and the tests deliberately try to make two
 * semantically different values hash the same.
 *
 * Strings are preserved code point for code point. Arabic and Hebrew fields are
 * NOT Unicode-normalized: the source does not normalize them, so normalizing
 * here would silently rewrite customer names. Whether a string happens to be in
 * NFC is recorded as metadata, never enforced.
 */

import { createHash } from 'node:crypto';
import { parseDecimalString, normalizeDecimalString } from './exact-decimal.mjs';

export class CanonicalError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'CanonicalError';
    this.code = code;
  }
}

const fail = (code, detail) => { throw new CanonicalError(code, detail); };

/** Sentinel for "this field is not present at all", distinct from null. */
export const ABSENT = Symbol('ABSENT');

const TAG = {
  ABSENT: 'absent', NULL: 'null', STRING: 'str', BOOL: 'bool', INT: 'int',
  DECIMAL: 'dec', TIMESTAMP: 'ts', DATE: 'date', BYTES: 'bytes',
  LIST: 'list', SET: 'set', MAP: 'map', JSON: 'json',
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Scalar constructors — each fixes the logical type of a value explicitly.
// ---------------------------------------------------------------------------

export const cAbsent = () => [TAG.ABSENT];
export const cNull = () => [TAG.NULL];

export function cString(value) {
  if (typeof value !== 'string') fail('NOT_A_STRING', typeof value);
  return [TAG.STRING, value];
}

export function cBool(value) {
  if (typeof value === 'boolean') return [TAG.BOOL, value];
  // PostgreSQL text protocol renders booleans as t/f; accept only those forms.
  if (value === 't' || value === 'true') return [TAG.BOOL, true];
  if (value === 'f' || value === 'false') return [TAG.BOOL, false];
  fail('NOT_A_BOOLEAN', String(value));
}

export function cInt(value) {
  const text = typeof value === 'bigint' ? value.toString() : String(value);
  if (!/^-?\d+$/.test(text)) fail('NOT_AN_INTEGER', text);
  // Strip a leading "-0" and redundant leading zeros so 007 and 7 agree.
  const normalized = BigInt(text).toString();
  return [TAG.INT, normalized];
}

/** Decimal with an explicit scale; both sides must declare the same scale. */
export function cDecimal(value, scale) {
  const text = typeof value === 'string' ? value : String(value);
  if (!Number.isInteger(scale)) fail('DECIMAL_SCALE_REQUIRED', String(scale));
  return [TAG.DECIMAL, normalizeDecimalString(text, scale), scale];
}

/**
 * Timestamp canonicalized to UTC microseconds.
 *
 * PostgreSQL timestamptz has microsecond resolution; Firestore Timestamp has
 * nanosecond fields but the client libraries commonly round-trip microseconds.
 * Canonicalising to an integer microsecond count keeps the comparison honest
 * and makes a lost sub-second component a mismatch rather than a near-match.
 */
export function cTimestampMicros(micros) {
  const text = typeof micros === 'bigint' ? micros.toString() : String(micros);
  if (!/^-?\d+$/.test(text)) fail('NOT_TIMESTAMP_MICROS', text);
  return [TAG.TIMESTAMP, BigInt(text).toString()];
}

/** ISO-8601 timestamp text -> canonical UTC microseconds. */
export function timestampTextToMicros(text) {
  if (typeof text !== 'string') fail('NOT_A_STRING', typeof text);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/
    .exec(text.trim());
  if (!m) fail('MALFORMED_TIMESTAMP', text);
  const [, y, mo, d, h, mi, s, frac = '', zone] = m;
  // Sub-second digits are taken as written. Anything finer than microseconds
  // must be non-zero-checked rather than truncated, so precision loss is loud.
  const fracPadded = frac.padEnd(9, '0');
  const nanos = fracPadded.slice(0, 9);
  if (/[^0]/.test(nanos.slice(6))) fail('SUB_MICROSECOND_PRECISION', text);
  const micros = BigInt(nanos.slice(0, 6));
  let offsetMinutes = 0n;
  if (zone && zone !== 'Z') {
    const zm = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
    offsetMinutes = BigInt(zm[1] === '-' ? -1 : 1) * (BigInt(zm[2]) * 60n + BigInt(zm[3] ?? '0'));
  }
  const epochDays = BigInt(Date.UTC(Number(y), Number(mo) - 1, Number(d)) / 86400000);
  const secondsOfDay = BigInt(h) * 3600n + BigInt(mi) * 60n + BigInt(s);
  const epochSeconds = epochDays * 86400n + secondsOfDay - offsetMinutes * 60n;
  return epochSeconds * 1000000n + micros;
}

export function cDate(value) {
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail('MALFORMED_DATE', text);
  return [TAG.DATE, text];
}

export function cBytesHex(value) {
  const text = String(value).replace(/^\\x/, '').toLowerCase();
  if (!/^[0-9a-f]*$/.test(text)) fail('MALFORMED_BYTES', text.slice(0, 32));
  return [TAG.BYTES, text];
}

// ---------------------------------------------------------------------------
// Composite constructors
// ---------------------------------------------------------------------------

/** Ordered sequence: position is part of the meaning. */
export function cList(items) {
  if (!Array.isArray(items)) fail('NOT_AN_ARRAY', typeof items);
  return [TAG.LIST, items];
}

/**
 * Unordered collection: order is NOT part of the meaning.
 * Members are sorted by their own encoded text so the result is stable, and
 * duplicates are preserved — a set that silently deduplicates would hide a
 * migration that dropped one of two identical rows.
 */
export function cSet(items) {
  if (!Array.isArray(items)) fail('NOT_AN_ARRAY', typeof items);
  return [TAG.SET, [...items].map(encode).sort()];
}

/** Keyed map; key order is irrelevant, key presence is not. */
export function cMap(entries) {
  const pairs = entries instanceof Map ? [...entries.entries()]
    : isPlainObject(entries) ? Object.entries(entries)
    : fail('NOT_A_MAP', typeof entries);
  return [TAG.MAP, pairs];
}

/**
 * Arbitrary JSON/JSONB value, canonicalized structurally.
 *
 * JSON numbers are kept as their exact source text: PostgreSQL JSONB preserves
 * large numeric literals that JavaScript would round, so parsing them into
 * `number` here would reintroduce precisely the loss this module exists to
 * detect. Callers pass already-parsed JSON only when it came from a parser
 * that preserved the text; otherwise pass the raw string to `cJsonText`.
 */
export function cJson(value) {
  return [TAG.JSON, canonicalJsonNode(value)];
}

export function cJsonText(text) {
  if (typeof text !== 'string') fail('NOT_A_STRING', typeof text);
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('MALFORMED_JSON', text.slice(0, 60)); }
  return [TAG.JSON, canonicalJsonNode(parsed, text)];
}

function canonicalJsonNode(value, rawText) {
  if (value === null) return ['n'];
  if (typeof value === 'boolean') return ['b', value];
  if (typeof value === 'string') return ['s', value];
  if (typeof value === 'bigint') return ['num', value.toString()];
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NON_FINITE_JSON_NUMBER', String(value));
    // Integers beyond the safe range cannot have survived JSON.parse intact.
    if (!Number.isInteger(value) || Number.isSafeInteger(value)) {
      return ['num', numericJsonText(value, rawText)];
    }
    fail('UNSAFE_JSON_NUMBER', String(value));
  }
  if (Array.isArray(value)) return ['a', value.map((v) => canonicalJsonNode(v))];
  if (isPlainObject(value)) {
    return ['o', Object.keys(value).sort().map((k) => [k, canonicalJsonNode(value[k])])];
  }
  fail('UNSUPPORTED_JSON_NODE', typeof value);
}

/**
 * Render a JSON number so that 1, 1.0 and 1.00 agree while 0.1 stays 0.1.
 * PostgreSQL JSONB already normalizes numeric literals, so matching that rule
 * keeps source and target on the same footing.
 */
function numericJsonText(value, rawText) {
  const text = String(value);
  if (text.includes('e') || text.includes('E')) {
    // Exponential rendering would make two equal values encode differently.
    fail('JSON_NUMBER_NEEDS_EXPONENT', rawText ? `${text} (from JSON text)` : text);
  }
  return text.includes('.') ? normalizeDecimalString(text, parseDecimalString(text).significantScale)
    : text;
}

// ---------------------------------------------------------------------------
// Encoding and hashing
// ---------------------------------------------------------------------------

/**
 * Encode a canonical node into deterministic text.
 * The output is a self-delimiting tagged form; it is never parsed back, only
 * compared and hashed, so readability is favoured over compactness.
 */
export function encode(node) {
  if (node === ABSENT) return `${TAG.ABSENT}:`;
  if (!Array.isArray(node) || node.length === 0) fail('NOT_A_CANONICAL_NODE', JSON.stringify(node));
  const [tag, ...rest] = node;
  switch (tag) {
    case TAG.ABSENT:
    case TAG.NULL:
      return `${tag}:`;
    case TAG.STRING:
      return `${tag}:${escapeText(rest[0])}`;
    case TAG.BOOL:
      return `${tag}:${rest[0] ? '1' : '0'}`;
    case TAG.INT:
    case TAG.TIMESTAMP:
    case TAG.DATE:
    case TAG.BYTES:
      return `${tag}:${rest[0]}`;
    case TAG.DECIMAL:
      return `${tag}:${rest[1]}:${rest[0]}`;
    case TAG.LIST:
      return `${tag}:[${rest[0].map(encode).join(',')}]`;
    case TAG.SET:
      // Members were already encoded and sorted by cSet.
      return `${tag}:{${rest[0].join(',')}}`;
    case TAG.MAP: {
      const pairs = rest[0]
        .map(([k, v]) => [String(k), encode(v)])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const seen = new Set();
      for (const [k] of pairs) {
        if (seen.has(k)) fail('DUPLICATE_MAP_KEY', k);
        seen.add(k);
      }
      return `${tag}:{${pairs.map(([k, v]) => `${escapeText(k)}=${v}`).join(',')}}`;
    }
    case TAG.JSON:
      return `${tag}:${encodeJsonNode(rest[0])}`;
    default:
      fail('UNKNOWN_TAG', String(tag));
  }
}

function encodeJsonNode(node) {
  const [kind, payload] = node;
  switch (kind) {
    case 'n': return 'n';
    case 'b': return `b${payload ? '1' : '0'}`;
    case 's': return `s(${escapeText(payload)})`;
    case 'num': return `#${payload}`;
    case 'a': return `[${payload.map(encodeJsonNode).join(',')}]`;
    case 'o': return `{${payload.map(([k, v]) => `${escapeText(k)}=${encodeJsonNode(v)}`).join(',')}}`;
    default: fail('UNKNOWN_JSON_KIND', String(kind));
  }
}

/**
 * Escape the structural characters so a string can never impersonate structure.
 * Without this, the string "a,b" inside a list would encode the same as two
 * separate members — a collision that would let a lost element pass parity.
 */
function escapeText(text) {
  return String(text).replace(/[\\,:=[\]{}()]/g, (c) => `\\${c.charCodeAt(0).toString(16)}`);
}

export const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Canonical hash of one entity, bound to its logical type and identity. */
export function canonicalHash({ kind, id, fields }) {
  if (typeof kind !== 'string' || kind === '') fail('KIND_REQUIRED');
  if (typeof id !== 'string' || id === '') fail('ID_REQUIRED');
  // The kind and id are inside the hashed text so an otherwise-identical
  // document under the wrong identity cannot match.
  const body = encode(cMap({ ...fields, __kind: cString(kind), __id: cString(id) }));
  return { canonicalText: body, hash: sha256Hex(body) };
}

/** Report which fields differ, so a mismatch names the field, not just the hash. */
export function diffCanonicalFields(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const differences = [];
  for (const key of keys) {
    const a = key in left ? encode(left[key]) : `${TAG.ABSENT}:`;
    const b = key in right ? encode(right[key]) : `${TAG.ABSENT}:`;
    if (a !== b) differences.push({ field: key, source: a, target: b });
  }
  return differences;
}

/** Informational only: whether a string is already NFC. Never enforced. */
export const isNfc = (text) => typeof text === 'string' && text.normalize('NFC') === text;
