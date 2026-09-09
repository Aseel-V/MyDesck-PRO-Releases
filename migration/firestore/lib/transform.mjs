/**
 * Source row -> Firestore document, and both sides -> the same canonical form.
 *
 * The transform is written once and used three ways: to build the document, to
 * canonicalise the SOURCE row, and to canonicalise the TARGET document read
 * back out of Firestore. Reconciliation compares the second against the third,
 * so a bug in the writer cannot hide itself by also corrupting the comparison —
 * the source side never touches Firestore at all.
 *
 * Values arrive as the text PostgreSQL produced. Nothing is parsed into a
 * JavaScript number on the way in.
 */

import {
  ABSENT, cNull, cString, cBool, cInt, cDecimal, cDate, cBytesHex,
  cTimestampMicros, timestampTextToMicros, cJson, cJsonText, cList,
} from './canonical.mjs';
import { parseDecimalString, toStoredExact, decimalStringToScaledInteger } from './exact-decimal.mjs';

export class TransformError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'TransformError';
    this.code = code;
  }
}

const fail = (code, detail) => { throw new TransformError(code, detail); };

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** Firestore rejects field names that are reserved in this shape. */
const RESERVED_KEY = /^__.*__$/;
/** Firestore refuses a document larger than 1 MiB; stay well under it. */
export const DOCUMENT_SIZE_BUDGET_BYTES = 900 * 1024;
/** An embedded array past this length is a signal to promote it out. */
export const EMBEDDED_ARRAY_WARN_LENGTH = 200;

/** snake_case -> camelCase, so the target reads as a Firebase-native model. */
export const camel = (name) => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * Which canonical type a source column has, derived from its PostgreSQL type.
 * Deriving rather than hand-listing 1089 columns means a new column is typed
 * correctly by default; anything unrecognised fails loudly instead of being
 * guessed at as text.
 */
export function canonicalTypeFor(pgType, udtName) {
  switch (pgType) {
    case 'uuid': case 'text': case 'character varying': case 'character':
    case 'USER-DEFINED': case 'inet': case 'citext':
      return 'string';
    case 'smallint': case 'integer': case 'bigint':
      return 'int';
    case 'numeric': case 'decimal':
      return 'decimal';
    case 'boolean':
      return 'bool';
    case 'timestamp with time zone': case 'timestamp without time zone':
      return 'timestamp';
    case 'date':
      return 'date';
    case 'json': case 'jsonb':
      return 'json';
    case 'bytea':
      return 'bytes';
    case 'ARRAY':
      return 'array';
    case 'time without time zone': case 'time with time zone': case 'interval':
      return 'string';
    default:
      fail('UNMAPPED_PG_TYPE', `${pgType}${udtName ? ` (${udtName})` : ''}`);
  }
}

/**
 * Parse a PostgreSQL array literal into its element texts.
 * The previous phase hit this exact decoding problem with metadata arrays, so
 * quoting, escapes, embedded commas and NULL elements are all handled rather
 * than split on a comma and hoped for.
 */
export function parsePgArray(literal) {
  if (literal === null || literal === undefined) return null;
  const text = String(literal);
  if (!text.startsWith('{') || !text.endsWith('}')) fail('MALFORMED_PG_ARRAY', text.slice(0, 40));
  const body = text.slice(1, -1);
  if (body === '') return [];
  const out = [];
  let current = '';
  let quoted = false;
  let started = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '\\') { current += body[i + 1]; i += 1; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') { quoted = true; started = true; }
    else if (ch === ',') {
      out.push(!started && current === 'NULL' ? null : current);
      current = ''; started = false;
    } else current += ch;
  }
  out.push(!started && current === 'NULL' ? null : current);
  return out;
}

// ---------------------------------------------------------------------------
// Source value -> canonical node
// ---------------------------------------------------------------------------

export function canonicalFromSource(value, type, { elementType } = {}) {
  if (value === null || value === undefined) return cNull();
  switch (type) {
    case 'string': return cString(String(value));
    case 'int': return cInt(String(value));
    case 'bool': return cBool(String(value));
    case 'date': return cDate(value);
    case 'bytes': return cBytesHex(value);
    case 'timestamp': return cTimestampMicros(timestampTextToMicros(String(value)));
    case 'json': return cJsonText(String(value));
    case 'decimal': {
      // The value's OWN scale, never a column-level or currency assumption.
      // The live slice holds the same column at scale 16 and scale 20, so any
      // fixed scale here would either lose digits or invent them.
      const { sourceScale } = parseDecimalString(String(value));
      return cDecimal(String(value), sourceScale);
    }
    case 'array': {
      const items = parsePgArray(value);
      return cList(items.map((item) => canonicalFromSource(item, elementType ?? 'string')));
    }
    default: fail('UNKNOWN_CANONICAL_TYPE', String(type));
  }
}

// ---------------------------------------------------------------------------
// Source value -> Firestore value
// ---------------------------------------------------------------------------

/**
 * Firestore cannot hold an array whose element is itself an array, and keys
 * shaped like `__x__` are reserved. JSON that violates either is stored as
 * canonical text instead of a native map, flagged so readers know which it is.
 * Both encodings canonicalise identically, so parity is unaffected either way.
 */
export function inspectJsonForFirestore(node, depth = 0, insideArray = false) {
  if (depth > 15) return { safe: false, reason: 'DEPTH_EXCEEDS_15' };
  if (Array.isArray(node)) {
    if (insideArray) return { safe: false, reason: 'NESTED_ARRAY' };
    for (const item of node) {
      const r = inspectJsonForFirestore(item, depth + 1, true);
      if (!r.safe) return r;
    }
    return { safe: true };
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '') return { safe: false, reason: 'EMPTY_KEY' };
      if (RESERVED_KEY.test(key)) return { safe: false, reason: `RESERVED_KEY:${key}` };
      const r = inspectJsonForFirestore(value, depth + 1, false);
      if (!r.safe) return r;
    }
    return { safe: true };
  }
  if (typeof node === 'number' && !Number.isFinite(node)) {
    return { safe: false, reason: 'NON_FINITE_NUMBER' };
  }
  return { safe: true };
}

/**
 * Whether every numeric literal in a JSON text survives JavaScript unchanged.
 *
 * PostgreSQL JSONB stores numbers as `numeric` and renders them with the scale
 * they were written at. JSON.parse turns "0.00000000000000000000" into 0 and
 * "1.10" into 1.1. The VALUE is unchanged, but the literal is not, so any JSON
 * containing such a literal is stored as text rather than natively — exactness
 * costs a string here, and guessing costs an audit record.
 *
 * String contents are skipped, so a digit inside a customer name is not
 * mistaken for a number.
 */
export function jsonNumberLiteralsPreserved(text) {
  const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (m) {
        if (String(Number(m[0])) !== m[0]) {
          return { preserved: false, reason: `JSON_NUMBER_LITERAL:${m[0].slice(0, 24)}` };
        }
        i = NUMBER.lastIndex;
        continue;
      }
    }
    i += 1;
  }
  return { preserved: true };
}

/**
 * Convert one source value for storage.
 * Returns the field entries to merge into the document, because some types
 * need more than one field: a timestamp carries a shadow microsecond string,
 * and JSON carries its encoding.
 */
export function firestoreFieldsFromSource(field, value, type, ctx) {
  const { Timestamp } = ctx;
  if (value === null || value === undefined) return { [field]: null };

  switch (type) {
    case 'string': return { [field]: String(value) };
    case 'bool': return { [field]: String(value) === 't' || String(value) === 'true' };
    case 'date': return { [field]: String(value) };
    case 'bytes': return { [field]: String(value).replace(/^\\x/, '').toLowerCase() };

    case 'int': {
      const units = BigInt(String(value));
      // Every id in this schema is a BIGSERIAL well inside the safe range.
      // If that ever stops being true, blocking is the correct outcome: a
      // rounded id is a wrong id.
      if (units > MAX_SAFE || units < -MAX_SAFE) {
        fail('UNSAFE_INTEGER', `${field}=${value} exceeds JavaScript safe integers`);
      }
      return { [field]: Number(units) };
    }

    case 'decimal': {
      const text = String(value);
      const { sourceScale } = parseDecimalString(text);
      const units = decimalStringToScaledInteger(text, sourceScale);
      const stored = toStoredExact(units, sourceScale);
      return {
        [field]: {
          unitsText: stored.unitsText,
          units: stored.units,
          scale: stored.scale,
          decimal: stored.decimal,
          ...(stored.exceedsInt64 ? { exceedsInt64: true } : {}),
        },
      };
    }

    case 'timestamp': {
      const micros = timestampTextToMicros(String(value));
      const seconds = micros / 1000000n;
      const remainder = micros - seconds * 1000000n;
      // Firestore Timestamp is the queryable form; the shadow string is the
      // exactness proof. Reconciliation checks both, so a later milestone can
      // drop the shadow once the Timestamp is PROVEN to round-trip.
      return {
        [field]: new Timestamp(Number(seconds), Number(remainder) * 1000),
        [`${field}Micros`]: micros.toString(),
      };
    }

    case 'json': {
      const text = String(value);
      let parsed;
      try { parsed = JSON.parse(text); } catch { fail('MALFORMED_JSON', `${field}`); }
      const safety = inspectJsonForFirestore(parsed);
      const literals = jsonNumberLiteralsPreserved(text);
      if (!safety.safe || !literals.preserved) {
        // Text encoding keeps the source JSON byte for byte. It is used for
        // shapes Firestore cannot hold natively, and for JSON whose numeric
        // literals would not survive the trip through JavaScript — PostgreSQL
        // JSONB keeps "0.00000000000000000000", JSON.parse gives back 0.
        return { [field]: null, [`${field}Json`]: text, [`${field}Encoding`]: 'text',
          [`${field}TextReason`]: safety.safe ? literals.reason : safety.reason };
      }
      // Encoding is present whenever the column held JSON at all. Its absence
      // is what distinguishes a SQL NULL column from a column holding the JSON
      // value null — two different facts that must not share a representation.
      return { [field]: parsed, [`${field}Encoding`]: 'native' };
    }

    case 'array': {
      const items = parsePgArray(value);
      return { [field]: items.map((item) => (item === null ? null : String(item))) };
    }

    default: fail('UNKNOWN_CANONICAL_TYPE', String(type));
  }
}

// ---------------------------------------------------------------------------
// Firestore value -> canonical node (the independent third view)
// ---------------------------------------------------------------------------

export function canonicalFromTarget(doc, field, type) {
  const present = Object.prototype.hasOwnProperty.call(doc, field);
  if (!present) return ABSENT;
  const value = doc[field];
  if (value === null || value === undefined) {
    if (type === 'json') {
      const encoding = doc[`${field}Encoding`];
      // A JSON field stored as text keeps its payload in the sibling field.
      if (encoding === 'text') return cJsonText(String(doc[`${field}Json`]));
      // Encoding present with a null value means the column held the JSON
      // value null. Encoding absent means the column itself was SQL NULL.
      // Collapsing the two is silent loss, so the distinction is explicit.
      if (encoding === 'native') return cJson(null);
    }
    return cNull();
  }
  switch (type) {
    case 'string': return cString(String(value));
    case 'int': return cInt(String(value));
    case 'bool': return cBool(value);
    case 'date': return cDate(value);
    case 'bytes': return cBytesHex(value);
    case 'timestamp': {
      const shadow = doc[`${field}Micros`];
      if (shadow === undefined || shadow === null) fail('MISSING_TIMESTAMP_SHADOW', field);
      const micros = BigInt(String(shadow));
      // The shadow must agree with the Timestamp itself, or one of them is a
      // rewrite. Checking them against each other is what makes the shadow
      // meaningful rather than merely present.
      const fromTimestamp = BigInt(value.seconds ?? value._seconds) * 1000000n
        + BigInt(Math.round((value.nanoseconds ?? value._nanoseconds ?? 0) / 1000));
      if (fromTimestamp !== micros) {
        fail('TIMESTAMP_SHADOW_DISAGREES', `${field}: ${fromTimestamp} vs ${micros}`);
      }
      return cTimestampMicros(micros);
    }
    case 'decimal': {
      if (typeof value !== 'object') fail('DECIMAL_NOT_STORED_AS_OBJECT', field);
      const { unitsText, scale, units } = value;
      if (typeof unitsText !== 'string') fail('DECIMAL_MISSING_UNITS_TEXT', field);
      if (units !== null && units !== undefined
        && (!Number.isSafeInteger(units) || BigInt(units) !== BigInt(unitsText))) {
        fail('DECIMAL_UNITS_DISAGREE', `${field}: ${units} vs ${unitsText}`);
      }
      const decimal = toStoredExact(BigInt(unitsText), scale).decimal;
      return cDecimal(decimal, scale);
    }
    case 'json': return cJson(value);
    case 'array': return cList(value.map((item) => (item === null ? cNull() : cString(String(item)))));
    default: fail('UNKNOWN_CANONICAL_TYPE', String(type));
  }
}

// ---------------------------------------------------------------------------
// Whole-entity transform
// ---------------------------------------------------------------------------

/** Approximate a document's stored size, to keep embedded growth honest. */
export function estimateDocumentBytes(data) {
  const walk = (value) => {
    if (value === null || value === undefined) return 1;
    if (typeof value === 'boolean') return 1;
    if (typeof value === 'number') return 8;
    if (typeof value === 'string') return Buffer.byteLength(value, 'utf8') + 1;
    if (Array.isArray(value)) return value.reduce((n, v) => n + walk(v), 0);
    if (value instanceof Date) return 8;
    if (typeof value === 'object') {
      if (typeof value.seconds === 'number' || typeof value._seconds === 'number') return 8;
      return Object.entries(value).reduce(
        (n, [k, v]) => n + Buffer.byteLength(k, 'utf8') + 1 + walk(v), 0);
    }
    return 8;
  };
  // Firestore adds the document name and per-field overhead; 32 bytes a field
  // is a deliberate over-estimate so the budget errs toward promoting data out.
  return walk(data) + Object.keys(data).length * 32;
}

/**
 * Build the Firestore document and the canonical source view for one row.
 *
 * `columns` is [{ name, type }] from the live inventory, so the transform is
 * driven by the schema that actually exists rather than a copy of it.
 */
export function transformRow({ row, columns, kind, docId, extraFields = {}, ctx }) {
  const data = {};
  const canonicalSource = {};
  const warnings = [];

  for (const column of columns) {
    const type = canonicalTypeFor(column.type, column.udt);
    const field = camel(column.name);
    const value = row[column.name];
    Object.assign(data, firestoreFieldsFromSource(field, value, type, ctx));
    canonicalSource[field] = canonicalFromSource(value, type);

    if (type === 'json' && value !== null && value !== undefined) {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed) && parsed.length > EMBEDDED_ARRAY_WARN_LENGTH) {
        warnings.push({ field, kind: 'EMBEDDED_ARRAY_LARGE', length: parsed.length });
      }
    }
  }

  Object.assign(data, extraFields);
  const bytes = estimateDocumentBytes(data);
  if (bytes > DOCUMENT_SIZE_BUDGET_BYTES) {
    fail('DOCUMENT_EXCEEDS_BUDGET', `${kind}/${docId} ~${bytes} bytes`);
  }
  if (bytes > DOCUMENT_SIZE_BUDGET_BYTES / 2) {
    warnings.push({ kind: 'DOCUMENT_SIZE_HALF_BUDGET', bytes });
  }

  return { kind, docId, data, canonicalSource, estimatedBytes: bytes, warnings };
}

/** The canonical view of a document read back from Firestore. */
export function canonicalFromDocument({ doc, columns }) {
  const canonical = {};
  for (const column of columns) {
    const type = canonicalTypeFor(column.type, column.udt);
    canonical[camel(column.name)] = canonicalFromTarget(doc, camel(column.name), type);
  }
  return canonical;
}
