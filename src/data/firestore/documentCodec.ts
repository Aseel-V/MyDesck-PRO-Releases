/**
 * Source row <-> Firestore document, for application reads and writes.
 *
 * Reads return the row shape PostgREST returned for `select *`, so UI code that consumed Supabase
 * rows consumes Firestore documents unchanged. Writes produce the document shape the migration
 * writes (migration/firestore/lib/transform.mjs): the same field names, the same exact decimal
 * objects, the same timestamp shadow and the same JSON encoding markers. A document the app creates
 * or edits is therefore indistinguishable in shape from one the migration created, and the Rules
 * validate one model rather than two.
 *
 * Write-side behaviour mirrors PostgreSQL where the product relied on it: column defaults, NOT NULL,
 * CHECK enumerations and ranges, NUMERIC typmod rounding, and rejection of unknown columns (the
 * PostgREST PGRST204 behaviour). Rejections throw CodecError with a stable code.
 */
import { SOURCE_SCHEMA } from './sourceSchema.generated';
import type { ColumnSpec, TableSpec } from './sourceSchemaTypes';
import {
  encodeNumeric, microsToSecondsAndNanos, microsToTimestampText, normaliseDate, normaliseTime,
  storedDecimalToNumber, timestampToMicros,
} from './exactValues';

export class CodecError extends Error {
  constructor(readonly code: string, readonly table: string, readonly column?: string, detail?: string) {
    super(`${code}: ${table}${column ? `.${column}` : ''}${detail ? ` (${detail})` : ''}`);
    this.name = 'CodecError';
  }
}

/** Firestore SDK primitives the codec needs, injected so the codec works with any SDK flavour. */
export interface CodecContext {
  timestamp(seconds: number, nanoseconds: number): unknown;
  serverTimestamp(): unknown;
  deleteField(): unknown;
  newId(): string;
}

export type SourceRow = Record<string, unknown>;
export type DocumentData = Record<string, unknown>;

export const APP_TRANSFORM_VERSION = 'app-v1';

export function tableSpec(table: string): TableSpec {
  const spec = SOURCE_SCHEMA[table];
  if (!spec) throw new CodecError('UNKNOWN_TABLE', table);
  return spec;
}

const RESERVED_KEY = /^__.*__$/;

/** Firestore cannot hold nested arrays or reserved keys; the migration stores such JSON as text. */
function jsonFirestoreSafety(node: unknown, depth = 0, insideArray = false): string | null {
  if (depth > 15) return 'DEPTH_EXCEEDS_15';
  if (Array.isArray(node)) {
    if (insideArray) return 'NESTED_ARRAY';
    for (const item of node) { const reason = jsonFirestoreSafety(item, depth + 1, true); if (reason) return reason; }
    return null;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '') return 'EMPTY_KEY';
      if (RESERVED_KEY.test(key)) return `RESERVED_KEY:${key}`;
      const reason = jsonFirestoreSafety(value, depth + 1, false);
      if (reason) return reason;
    }
    return null;
  }
  if (typeof node === 'number' && !Number.isFinite(node)) return 'NON_FINITE_NUMBER';
  return null;
}

function timestampMicrosFromStored(value: unknown, shadow: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof shadow === 'string' && /^-?\d+$/.test(shadow)) return BigInt(shadow);
  const candidate = value as { seconds?: number; nanoseconds?: number; _seconds?: number; _nanoseconds?: number; toDate?: () => Date };
  const seconds = candidate.seconds ?? candidate._seconds;
  const nanos = candidate.nanoseconds ?? candidate._nanoseconds ?? 0;
  if (typeof seconds === 'number') return BigInt(seconds) * 1_000_000n + BigInt(Math.floor(nanos / 1000));
  if (typeof candidate.toDate === 'function') return BigInt(candidate.toDate().getTime()) * 1000n;
  return null;
}

function decodeColumn(column: ColumnSpec, data: DocumentData): unknown {
  const value = data[column.field];
  switch (column.kind) {
    case 'json': {
      const encoding = data[`${column.field}Encoding`];
      if (encoding === 'text') return JSON.parse(String(data[`${column.field}Json`]));
      return value === undefined ? null : value;
    }
    case 'timestamp': {
      const micros = timestampMicrosFromStored(value, data[`${column.field}Micros`]);
      return micros === null ? null : microsToTimestampText(micros);
    }
    case 'decimal':
      return value === null || value === undefined ? null : storedDecimalToNumber(value);
    case 'array':
      if (!Array.isArray(value)) return value === undefined ? null : value;
      return column.element === 'int' ? value.map((item) => (item === null ? null : Number(item))) : value;
    case 'bytes':
      return value === null || value === undefined ? null : `\\x${String(value)}`;
    default:
      return value === undefined ? null : value;
  }
}

/** A Firestore document -> the row PostgREST would have returned for `select *`. */
export function decodeRow<T = SourceRow>(table: string, data: DocumentData): T {
  const spec = tableSpec(table);
  const row: SourceRow = {};
  for (const column of spec.columns) row[column.name] = decodeColumn(column, data);
  return row as T;
}

function checkColumn(spec: TableSpec, column: ColumnSpec, value: unknown) {
  if (value === null) return;
  if (column.enumValues && !column.enumValues.includes(String(value))) {
    throw new CodecError('CHECK_VIOLATION', spec.name, column.name, `not one of ${column.enumValues.join('|')}`);
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const numeric = Number(value);
    if (column.min !== undefined && (column.minExclusive ? numeric <= column.min : numeric < column.min)) {
      throw new CodecError('CHECK_VIOLATION', spec.name, column.name, `below ${column.min}`);
    }
    if (column.max !== undefined && numeric > column.max) {
      throw new CodecError('CHECK_VIOLATION', spec.name, column.name, `above ${column.max}`);
    }
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (column.minLength !== undefined && length < column.minLength) throw new CodecError('CHECK_VIOLATION', spec.name, column.name, 'too short');
    if (column.maxLength !== undefined && length > column.maxLength) throw new CodecError('CHECK_VIOLATION', spec.name, column.name, 'too long');
  }
}

/** Encode one column value into the field entries the migration would have written for it. */
function encodeColumn(spec: TableSpec, column: ColumnSpec, value: unknown, ctx: CodecContext, mode: 'insert' | 'update'): DocumentData {
  const field = column.field;
  const clearShadows = (names: string[]) => (mode === 'update'
    ? Object.fromEntries(names.map((name) => [name, ctx.deleteField()])) : {});
  if (value === undefined) throw new CodecError('UNDEFINED_VALUE', spec.name, column.name);
  if (value === null) {
    if (!column.nullable) throw new CodecError('NOT_NULL_VIOLATION', spec.name, column.name);
    if (column.kind === 'timestamp') return { [field]: null, ...clearShadows([`${field}Micros`]) };
    if (column.kind === 'json') return { [field]: null, ...clearShadows([`${field}Encoding`, `${field}Json`, `${field}TextReason`]) };
    return { [field]: null };
  }
  try {
    switch (column.kind) {
      case 'string': {
        if (typeof value !== 'string') throw new CodecError('INVALID_TEXT', spec.name, column.name, typeof value);
        checkColumn(spec, column, value);
        return { [field]: value };
      }
      case 'int': {
        const numeric = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
        if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric)) {
          throw new CodecError('INVALID_INTEGER', spec.name, column.name, String(value));
        }
        checkColumn(spec, column, numeric);
        return { [field]: numeric };
      }
      case 'decimal': {
        if (typeof value !== 'number' && typeof value !== 'string') throw new CodecError('INVALID_NUMERIC', spec.name, column.name, typeof value);
        const stored = encodeNumeric(value, column.precision, column.scale);
        checkColumn(spec, column, stored.decimal);
        return { [field]: stored };
      }
      case 'bool': {
        if (typeof value !== 'boolean') throw new CodecError('INVALID_BOOLEAN', spec.name, column.name, String(value));
        return { [field]: value };
      }
      case 'timestamp': {
        if (typeof value !== 'string' && !(value instanceof Date)) throw new CodecError('INVALID_TIMESTAMP', spec.name, column.name, typeof value);
        const micros = timestampToMicros(value);
        const { seconds, nanoseconds } = microsToSecondsAndNanos(micros);
        return { [field]: ctx.timestamp(seconds, nanoseconds), [`${field}Micros`]: micros.toString() };
      }
      case 'date': {
        if (typeof value !== 'string' && !(value instanceof Date)) throw new CodecError('INVALID_DATE', spec.name, column.name, typeof value);
        return { [field]: normaliseDate(value) };
      }
      case 'time': {
        if (typeof value !== 'string') throw new CodecError('INVALID_TIME', spec.name, column.name, typeof value);
        return { [field]: normaliseTime(value) };
      }
      case 'json': {
        // Round-trip through JSON so the stored value is exactly what jsonb would have received.
        const parsed = JSON.parse(JSON.stringify(value));
        const reason = jsonFirestoreSafety(parsed);
        if (reason) {
          return { [field]: null, [`${field}Json`]: JSON.stringify(parsed), [`${field}Encoding`]: 'text', [`${field}TextReason`]: reason };
        }
        return { [field]: parsed, [`${field}Encoding`]: 'native', ...clearShadows([`${field}Json`, `${field}TextReason`]) };
      }
      case 'array': {
        if (!Array.isArray(value)) throw new CodecError('INVALID_ARRAY', spec.name, column.name, typeof value);
        return { [field]: value.map((item) => {
          if (item === null) return null;
          if (column.element === 'int' && !Number.isSafeInteger(typeof item === 'string' ? Number(item) : item)) {
            throw new CodecError('INVALID_ARRAY_ELEMENT', spec.name, column.name, String(item));
          }
          return String(item);
        }) };
      }
      case 'bytes':
        return { [field]: String(value).replace(/^\\x/, '').toLowerCase() };
      default:
        throw new CodecError('UNSUPPORTED_KIND', spec.name, column.name, column.kind);
    }
  } catch (error) {
    if (error instanceof CodecError) throw error;
    throw new CodecError('INVALID_VALUE', spec.name, column.name, error instanceof Error ? error.message : String(error));
  }
}

function columnFor(spec: TableSpec, key: string): ColumnSpec {
  const column = spec.columns.find((candidate) => candidate.name === key);
  // PostgREST rejects an unknown column (PGRST204); silently dropping it would hide a UI defect.
  if (!column) throw new CodecError('COLUMN_NOT_FOUND', spec.name, key);
  return column;
}

function defaultValue(spec: TableSpec, column: ColumnSpec, ctx: CodecContext): { value?: unknown; serverTime?: true } {
  const fallback = column.default;
  if (!fallback) return { value: null };
  switch (fallback.kind) {
    case 'uuid': return { value: ctx.newId() };
    case 'now': return { serverTime: true };
    case 'currentDate': return { value: new Date().toISOString().slice(0, 10) };
    case 'literal': return { value: fallback.value };
    case 'sequence': throw new CodecError('SEQUENCE_DEFAULT_REQUIRES_COUNTER', spec.name, column.name);
    default: throw new CodecError('UNSUPPORTED_DEFAULT', spec.name, column.name);
  }
}

export interface Tenancy { ownerUid: string | null; businessId: string | null }

/** Document id derived from the source primary key, exactly as the rehearsal derives it. */
export function documentIdFor(table: string, row: SourceRow): string {
  const spec = tableSpec(table);
  const values = spec.primaryKey.map((key) => row[key]);
  if (values.some((value) => value === null || value === undefined || value === '')) throw new CodecError('PRIMARY_KEY_REQUIRED', table);
  return values.map((value) => encodeURIComponent(String(value))).join('__');
}

/**
 * Encode an INSERT. Columns absent from `row` take their PostgreSQL default, or NULL, or fail the
 * NOT NULL constraint, in that order. Returns the document id and the complete document.
 */
export function encodeInsert(table: string, row: SourceRow, ctx: CodecContext, tenancy: Tenancy): { id: string; data: DocumentData; row: SourceRow } {
  const spec = tableSpec(table);
  for (const key of Object.keys(row)) columnFor(spec, key);
  const data: DocumentData = {};
  const resolved: SourceRow = {};
  for (const column of spec.columns) {
    let value = Object.prototype.hasOwnProperty.call(row, column.name) ? row[column.name] : undefined;
    if (value === undefined) {
      const fallback = defaultValue(spec, column, ctx);
      if (fallback.serverTime) {
        data[column.field] = ctx.serverTimestamp();
        resolved[column.name] = null;
        continue;
      }
      value = fallback.value;
    }
    Object.assign(data, encodeColumn(spec, column, value, ctx, 'insert'));
    resolved[column.name] = value;
  }
  const deletedAt = spec.columns.find((column) => column.name === 'deleted_at');
  Object.assign(data, {
    schemaVersion: 1,
    transformVersion: APP_TRANSFORM_VERSION,
    isDeleted: Boolean(deletedAt && resolved.deleted_at !== null && resolved.deleted_at !== undefined),
    ...(tenancy.ownerUid ? { ownerUid: tenancy.ownerUid } : {}),
    ...(tenancy.businessId ? { businessId: tenancy.businessId } : {}),
  });
  return { id: documentIdFor(table, resolved), data, row: resolved };
}

/**
 * Encode an UPDATE patch into field-level Firestore updates. Primary key columns are immutable, as
 * they are for every product flow. When the table has a pure touch-updated_at trigger, updated_at is
 * set to server time regardless of what the patch carried, which is what the trigger does.
 */
export function encodeUpdate(table: string, patch: SourceRow, ctx: CodecContext): DocumentData {
  const spec = tableSpec(table);
  const data: DocumentData = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = columnFor(spec, key);
    if (spec.primaryKey.includes(key)) throw new CodecError('PRIMARY_KEY_IMMUTABLE', spec.name, key);
    if (value === undefined) continue;
    Object.assign(data, encodeColumn(spec, column, value, ctx, 'update'));
  }
  if (spec.triggers.some((trigger) => trigger.classification === 'TOUCH_UPDATED_AT')) {
    const updatedAt = spec.columns.find((column) => column.name === 'updated_at');
    if (updatedAt) {
      data[updatedAt.field] = ctx.serverTimestamp();
      data[`${updatedAt.field}Micros`] = ctx.deleteField();
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'deleted_at')) data.isDeleted = patch.deleted_at !== null;
  return data;
}

/** Firestore field name for a source column. */
export function fieldFor(table: string, column: string): string {
  return columnFor(tableSpec(table), column).field;
}

/** Encode a single value for use in a query filter, in the stored representation. */
export function encodeFilterValue(table: string, column: string, value: unknown, ctx: CodecContext): unknown {
  const spec = tableSpec(table);
  const encoded = encodeColumn(spec, columnFor(spec, column), value, ctx, 'insert');
  return encoded[columnFor(spec, column).field];
}
