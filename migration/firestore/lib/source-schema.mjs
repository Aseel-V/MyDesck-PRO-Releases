/**
 * Source schema derivation shared by the application-schema and Rules-schema generators.
 *
 * Input is the committed catalog snapshot (migration/firestore/config/source-schema.json), itself
 * produced from the read-only production catalog. Field naming reproduces the full rehearsal: a
 * `business_id` referencing auth.users becomes `legacyBusinessUserId`, any other `sourceBusinessId`.
 */
import { TABLE_MAP } from './table-map.mjs';

export const camel = (name) => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const splitColumns = (text) => text.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));

export function kindFor(dataType, udt) {
  switch (dataType) {
    case 'uuid': case 'text': case 'character varying': case 'character': case 'USER-DEFINED': case 'inet': case 'citext':
      return { kind: 'string' };
    case 'smallint': case 'integer': case 'bigint': return { kind: 'int' };
    case 'numeric': case 'decimal': case 'double precision': case 'real': return { kind: 'decimal' };
    case 'boolean': return { kind: 'bool' };
    case 'timestamp with time zone': case 'timestamp without time zone': return { kind: 'timestamp' };
    case 'date': return { kind: 'date' };
    case 'time without time zone': case 'time with time zone': return { kind: 'time' };
    case 'interval': return { kind: 'string' };
    case 'json': case 'jsonb': return { kind: 'json' };
    case 'bytea': return { kind: 'bytes' };
    case 'ARRAY': {
      if (['_text', '_varchar', '_uuid', '_bpchar'].includes(udt)) return { kind: 'array', element: 'string' };
      if (['_int2', '_int4', '_int8'].includes(udt)) return { kind: 'array', element: 'int' };
      return fail('UNMAPPED_ARRAY_ELEMENT', udt);
    }
    default: return fail('UNMAPPED_PG_TYPE', `${dataType} (${udt})`);
  }
}

function parseArrayLiteral(body, element) {
  if (body === '') return [];
  return body.split(',').map((item) => {
    const value = item.trim().replace(/^"|"$/g, '');
    return element === 'int' ? Number(value) : value;
  });
}

export function parseDefault(expression, column, kind) {
  if (expression === null || expression === undefined) return undefined;
  const text = expression.trim();
  if (/^(gen_random_uuid|uuid_generate_v4)\(\)$/.test(text)) return { kind: 'uuid' };
  if (/^(now\(\)|timezone\('utc'::text, now\(\)\)|CURRENT_TIMESTAMP)$/.test(text)) return { kind: 'now' };
  if (text === 'CURRENT_DATE') return { kind: 'currentDate' };
  if (/^nextval\('.+'::regclass\)$/.test(text)) return { kind: 'sequence' };
  if (text === 'true' || text === 'false') return { kind: 'literal', value: text === 'true' };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'literal', value: kind === 'decimal' ? text : Number(text) };
  let match = /^\(?'((?:[^']|'')*)'::(?:text|character varying|uuid|vat_category|fiscal_document_status|fiscal_document_type)\)?$/.exec(text);
  if (match) return { kind: 'literal', value: match[1].replace(/''/g, "'") };
  match = /^'(\{.*\})'::(text|integer|uuid)\[\]$/.exec(text);
  if (match) return { kind: 'literal', value: parseArrayLiteral(match[1].slice(1, -1), match[2] === 'integer' ? 'int' : 'string') };
  match = /^ARRAY\[(.*)\]$/.exec(text);
  if (match) return { kind: 'literal', value: parseArrayLiteral(match[1], column.element ?? 'int') };
  match = /^'(.*)'::jsonb?$/s.exec(text);
  if (match) return { kind: 'literal', value: JSON.parse(match[1].replace(/''/g, "'")) };
  return fail('UNMAPPED_DEFAULT', `${column.name}: ${text}`);
}

export function applyChecks(definitions, columnsByName) {
  const unparsed = [];
  for (const definition of definitions) {
    let match = /^CHECK \(\((\w+) = ANY \(ARRAY\[(.+)\]\)\)\)$/.exec(definition)
      ?? /^CHECK \(\(\((\w+) IS NULL\) OR \(\1 = ANY \(ARRAY\[(.+)\]\)\)\)\)$/.exec(definition);
    if (match && columnsByName.has(match[1])) {
      const values = [...match[2].matchAll(/'((?:[^']|'')*)'::text/g)].map((m) => m[1].replace(/''/g, "'"));
      if (values.length) { columnsByName.get(match[1]).enumValues = values; continue; }
    }
    match = /^CHECK \(\(\((\w+) >= \(?(-?\d+(?:\.\d+)?)\)?(?:::numeric)?\) AND \(\1 <= \(?(-?\d+(?:\.\d+)?)\)?(?:::numeric)?\)\)\)$/.exec(definition);
    if (match && columnsByName.has(match[1])) {
      Object.assign(columnsByName.get(match[1]), { min: Number(match[2]), max: Number(match[3]) });
      continue;
    }
    match = /^CHECK \(\((\w+) (>=|>) \(?(-?\d+(?:\.\d+)?)\)?(?:::numeric)?\)\)$/.exec(definition);
    if (match && columnsByName.has(match[1])) {
      Object.assign(columnsByName.get(match[1]), { min: Number(match[3]), ...(match[2] === '>' ? { minExclusive: true } : {}) });
      continue;
    }
    match = /^CHECK \(\(\(char_length\((\w+)\) >= (\d+)\) AND \(char_length\(\1\) <= (\d+)\)\)\)$/.exec(definition);
    if (match && columnsByName.has(match[1])) {
      Object.assign(columnsByName.get(match[1]), { minLength: Number(match[2]), maxLength: Number(match[3]) });
      continue;
    }
    match = /^CHECK \(\(char_length\((\w+)\) <= (\d+)\)\)$/.exec(definition);
    if (match && columnsByName.has(match[1])) {
      columnsByName.get(match[1]).maxLength = Number(match[2]);
      continue;
    }
    unparsed.push(definition);
  }
  return unparsed;
}

export function tableSpec(name, table) {
  const mapping = TABLE_MAP.find((entry) => entry.name === name) ?? fail('TABLE_NOT_IN_TABLE_MAP', name);
  const constraints = table.constraints;
  const primaryKey = splitColumns(/^PRIMARY KEY \((.+)\)$/.exec(constraints.find((c) => c.type === 'p')?.definition ?? '')?.[1]
    ?? fail('TABLE_WITHOUT_PRIMARY_KEY', name));
  const foreignKeys = constraints.filter((c) => c.type === 'f').map((c) => {
    const match = /^FOREIGN KEY \((.+?)\) REFERENCES ([\w.]+)\((.+?)\)(.*)$/.exec(c.definition)
      ?? fail('UNPARSED_FOREIGN_KEY', `${name}: ${c.definition}`);
    const deletion = /ON DELETE (CASCADE|SET NULL|RESTRICT|SET DEFAULT)/.exec(match[4])?.[1] ?? 'NO ACTION';
    return { columns: splitColumns(match[1]), parent: match[2].includes('.') ? match[2] : `public.${match[2]}`,
      parentColumns: splitColumns(match[3]), onDelete: deletion };
  });
  const uniques = constraints.filter((c) => c.type === 'u')
    .map((c) => splitColumns(/^UNIQUE (?:NULLS NOT DISTINCT )?\((.+)\)$/.exec(c.definition)?.[1] ?? fail('UNPARSED_UNIQUE', c.definition)));
  const businessIdIsOwnerUid = foreignKeys.some((fk) => fk.parent === 'auth.users' && fk.columns.includes('business_id'));
  const hasBusinessId = table.columns.some((column) => column.name === 'business_id');
  const columns = table.columns.map((column) => {
    const { kind, element } = kindFor(column.dataType, column.udt);
    const spec = {
      name: column.name,
      field: column.name === 'business_id'
        ? (businessIdIsOwnerUid ? 'legacyBusinessUserId' : 'sourceBusinessId')
        : camel(column.name),
      kind,
      ...(element ? { element } : {}),
      nullable: column.nullable,
      ...(kind === 'decimal' && column.dataType === 'numeric' && column.scale !== null && column.precision !== null
        ? { precision: column.precision, scale: column.scale } : {}),
    };
    const parsedDefault = parseDefault(column.default, spec, kind);
    if (parsedDefault) spec.default = parsedDefault;
    return spec;
  });
  const unparsedChecks = applyChecks(constraints.filter((c) => c.type === 'c').map((c) => c.definition),
    new Map(columns.map((column) => [column.name, column])));
  const segments = mapping.target.split('/');
  segments[segments.length - 1] = '{id}';
  return {
    name, path: segments.join('/'), primaryKey,
    businessIdField: hasBusinessId ? (businessIdIsOwnerUid ? 'legacyBusinessUserId' : 'sourceBusinessId') : null,
    businessIdIsOwnerUid, columns, uniques, foreignKeys, unparsedChecks,
    triggers: (table.triggers ?? []).map(({ name: triggerName, definition, function: fn, classification }) =>
      ({ name: triggerName, definition, function: fn, classification })),
  };
}

export function buildSchema(snapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([name, table]) => [name, tableSpec(name, table)]));
}
