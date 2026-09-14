/**
 * Types for the generated source schema.
 *
 * The Firestore application model is the rehearsed migration model: every source column keeps its
 * camelCased field, money stays an exact decimal object and timestamps keep their microsecond
 * shadow. The generated schema carries the column facts the codec needs to write documents in
 * exactly that shape, and to read them back into the row shapes the UI already consumes.
 */
export type ColumnKind =
  | 'string' | 'int' | 'decimal' | 'bool' | 'timestamp' | 'date' | 'time' | 'json' | 'array' | 'bytes';

export type ArrayElementKind = 'string' | 'int';

export type DefaultSpec =
  | { kind: 'uuid' }
  | { kind: 'now' }
  | { kind: 'currentDate' }
  | { kind: 'sequence' }
  | { kind: 'literal'; value: string | number | boolean | null | unknown[] | Record<string, unknown> };

export interface ColumnSpec {
  /** Source column name, as the UI and PostgREST see it. */
  name: string;
  /** Firestore field name. `business_id` is renamed exactly as the rehearsal renames it. */
  field: string;
  kind: ColumnKind;
  element?: ArrayElementKind;
  nullable: boolean;
  /** NUMERIC typmod. Absent for unconstrained numeric. */
  precision?: number;
  scale?: number;
  default?: DefaultSpec;
  /** From CHECK (col = ANY (ARRAY[...])). */
  enumValues?: string[];
  /** From CHECK range predicates on this column. */
  min?: number;
  minExclusive?: boolean;
  max?: number;
  /** From CHECK (char_length(col) ...). */
  minLength?: number;
  maxLength?: number;
}

export interface ForeignKeySpec {
  columns: string[];
  parent: string;
  parentColumns: string[];
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
}

export interface TriggerSpec {
  name: string;
  definition: string;
  function: string;
  /**
   * TOUCH_UPDATED_AT: a BEFORE UPDATE trigger whose whole effect is `NEW.updated_at = now()`; the
   * Firestore repositories reproduce it on every update. Anything else is listed so each vertical
   * report classifies it explicitly (replaced, unreachable, or blocking).
   */
  classification: 'TOUCH_UPDATED_AT' | 'REQUIRES_VERTICAL_CLASSIFICATION';
}

export interface TableSpec {
  name: string;
  /** Firestore path template from the table map, with the document id placeholder normalised to {id}. */
  path: string;
  primaryKey: string[];
  /** Where the source business_id lives on the document, or null when the table has none. */
  businessIdField: 'legacyBusinessUserId' | 'sourceBusinessId' | null;
  /** True when the source business_id references auth.users, i.e. it holds the owner uid. */
  businessIdIsOwnerUid: boolean;
  columns: ColumnSpec[];
  uniques: string[][];
  foreignKeys: ForeignKeySpec[];
  /** CHECK constraints the generator did not reduce to column facts. Each is classified in the vertical report. */
  unparsedChecks: string[];
  triggers: TriggerSpec[];
}

export type SourceSchema = Record<string, TableSpec>;
