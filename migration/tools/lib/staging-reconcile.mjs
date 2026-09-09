import { createHash } from 'node:crypto';

const sha = text => createHash('sha256').update(text).digest('hex');
const ordered = values => [...values].sort((a,b) => a < b ? -1 : a > b ? 1 : 0);

/** All cells arrive as PostgreSQL text (or NULL), including numeric and JSON.
 * JSONB must be canonicalized by PostgreSQL, never JSON.parse in JavaScript.
 * Column names/types are included to prevent equal bytes hiding schema drift.
 */
export function rowKey(row, pk) {
  if (!pk.length || pk.some(name => row[name] == null)) throw new Error('MISSING_PRIMARY_KEY');
  return JSON.stringify(pk.map(name => row[name]));
}

export function tableDigest(table) {
  if (!table.primaryKey.length) throw new Error('MISSING_PRIMARY_KEY');
  const columns = [...table.columns].sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const entries = table.rows.map(row => {
    const cells = columns.map(column => {
      if (!(column.name in row) || (row[column.name] !== null && typeof row[column.name] !== 'string')) {
        throw new Error('LOSSY_OR_MISSING_CELL');
      }
      return [column.name, column.type, row[column.name]];
    });
    return [rowKey(row, table.primaryKey), sha(JSON.stringify(cells))];
  });
  if (new Set(entries.map(x=>x[0])).size !== entries.length) throw new Error('DUPLICATE_PRIMARY_KEY');
  entries.sort((a,b) => a[0]<b[0] ? -1 : a[0]>b[0] ? 1 : 0);
  return { count:entries.length, primaryKeys:entries.map(x=>x[0]),
    schemaHash:sha(JSON.stringify({ columns, primaryKey:table.primaryKey })),
    contentHash:sha(JSON.stringify(entries)) };
}

export function reconcileTable(source, target) {
  const a = tableDigest(source), b = tableDigest(target);
  const countMatch = a.count === b.count;
  const pkMatch = JSON.stringify(a.primaryKeys) === JSON.stringify(b.primaryKeys);
  const contentMatch = a.schemaHash === b.schemaHash && a.contentHash === b.contentHash;
  return { status:countMatch && pkMatch && contentMatch ? 'MATCH' : 'MISMATCH',
    countMatch, pkMatch, contentMatch, source:a, target:b };
}

/** Arbitrary-precision fixed decimal sum; no financial value passes through Number. */
export function exactSum(values) {
  let coefficient = 0n, scale = 0;
  for (const value of values) {
    if (value === null) continue;
    if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('UNSUPPORTED_NUMERIC');
    const [integer, fraction = ''] = value.split('.');
    const nextScale = fraction.length;
    const next = BigInt(integer + fraction);
    if (nextScale > scale) { coefficient *= 10n ** BigInt(nextScale-scale); scale = nextScale; }
    coefficient += next * 10n ** BigInt(scale-nextScale);
  }
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale+1,'0');
  const value = scale ? digits.slice(0,-scale)+'.'+digits.slice(-scale) : digits;
  const normalized = value.includes('.') ? value.replace(/0+$/,'').replace(/\.$/,'') : value;
  return (negative ? '-' : '') + normalized;
}

export function financialGroups(rows, amountColumn, dimensions) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(dimensions.map(name => row[name] ?? null));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row[amountColumn]);
  }
  return ordered(groups.keys()).map(key => ({ key, total:exactSum(groups.get(key)) }));
}

/** Compare ordered event IDs per parent; order keys include a deterministic ID tie-breaker.
 * Input is ordered in PostgreSQL by native timestamp/sequence types, not lexicographic JS order.
 */
export function eventOrder(rows, parentColumns, idColumn) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(parentColumns.map(name => row[name]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row[idColumn]);
  }
  return ordered(groups.keys()).map(key => ({ key, ids:groups.get(key) }));
}

export function orphanKeys(child, parent, childColumns, parentColumns) {
  const keys = new Set(parent.map(row => JSON.stringify(parentColumns.map(c=>row[c]))));
  return child.filter(row => childColumns.every(c=>row[c] !== null) &&
    !keys.has(JSON.stringify(childColumns.map(c=>row[c]))));
}
