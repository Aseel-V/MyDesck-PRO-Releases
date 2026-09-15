import { createHash } from 'node:crypto';
import { ENTITIES, SCHEMA_VERSION, TRANSFORM_VERSION } from './entities.mjs';

export const FULL_TRANSFORM_VERSION = `${TRANSFORM_VERSION}.full.1`;
export const FIRESTORE_MAX_DOCUMENT_BYTES = 1024 * 1024;
export const NEAR_LIMIT_BYTES = 800 * 1024;
export const MAX_INDEX_ENTRIES = 40_000;

const CREDENTIAL_FIELDS = new Map([
  ['restaurant_staff', new Set(['pin_code', 'pin_hash', 'password'])],
  ['restaurant_whatsapp_settings', new Set(['access_token', 'webhook_verify_token'])],
]);

export const normalizePgArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '{}') return [];
  const text = String(value);
  if (!text.startsWith('{') || !text.endsWith('}')) return [text];
  return text.slice(1, -1).split(',').filter(Boolean);
};

export function credentialExclusions(table, columns) {
  const denied = CREDENTIAL_FIELDS.get(table) ?? new Set();
  return columns.filter((column) => denied.has(column.name)).map((column) => ({
    field: column.name,
    reason: 'CREDENTIAL_REPROVISION_REQUIRED',
  }));
}

export function migratableColumns(table, columns) {
  const excluded = new Set(credentialExclusions(table, columns).map((x) => x.field));
  return columns.filter((column) => !excluded.has(column.name));
}

export function sourceKey(table, primaryKey, row) {
  if (!primaryKey.length) throw new Error(`SOURCE_TABLE_WITHOUT_PRIMARY_KEY:${table}`);
  const values = primaryKey.map((key) => row[key]);
  if (values.some((value) => value === null || value === undefined)) {
    throw new Error(`NULL_PRIMARY_KEY:${table}`);
  }
  return `${table}#${values.map((value) => encodeURIComponent(String(value))).join('|')}`;
}

export function sourcePk(primaryKey, row) {
  return primaryKey.map((key) => String(row[key]));
}

export function documentId(table, primaryKey, row) {
  if (ENTITIES[table]) return ENTITIES[table].docId(row);
  const values = sourcePk(primaryKey, row).map((value) => encodeURIComponent(value));
  return values.join('__');
}

export function topologicalTables(tables) {
  const names = new Set(tables.map((table) => table.name));
  const dependencies = new Map(tables.map((table) => [table.name, new Set()]));
  for (const table of tables) {
    for (const fk of table.foreignKeys ?? []) {
      const [schema, parent] = String(fk.parent).split('.');
      if (schema === 'public' && parent !== table.name && names.has(parent)) {
        dependencies.get(table.name).add(parent);
      }
    }
  }
  const ordered = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining].filter((name) =>
      [...dependencies.get(name)].every((dependency) => !remaining.has(dependency))).sort();
    if (!ready.length) {
      throw new Error(`TABLE_DEPENDENCY_CYCLE:${[...remaining].sort().join(',')}`);
    }
    for (const name of ready) {
      ordered.push(name);
      remaining.delete(name);
    }
  }
  return ordered;
}

function parentMetadata(table, row, catalogByName, metadataBySourceKey) {
  for (const fk of table.foreignKeys ?? []) {
    const [schema, parentName] = String(fk.parent).split('.');
    if (schema !== 'public') continue;
    const childColumns = normalizePgArray(fk.columns);
    const parentColumns = normalizePgArray(fk.parentColumns);
    const parentTable = catalogByName.get(parentName);
    if (!parentTable || childColumns.length !== parentColumns.length) continue;
    const values = childColumns.map((name) => row[name]);
    if (values.some((value) => value === null || value === undefined)) continue;
    const pseudo = Object.fromEntries(parentColumns.map((name, i) => [name, values[i]]));
    const key = sourceKey(parentName, parentTable.primaryKey, pseudo);
    const found = metadataBySourceKey.get(key);
    if (found) return found;
  }
  return null;
}

export function resolveTenancy({ table, row, businessByOwner, ownerByBusiness,
  catalogByName, metadataBySourceKey }) {
  let ownerUid = null;
  let businessId = null;

  if (row.user_id && businessByOwner.has(row.user_id)) {
    ownerUid = row.user_id;
    businessId = businessByOwner.get(row.user_id);
  }
  if (row.business_id) {
    if (ownerByBusiness.has(row.business_id)) {
      businessId = row.business_id;
      ownerUid = ownerByBusiness.get(row.business_id);
    } else if (businessByOwner.has(row.business_id)) {
      ownerUid = row.business_id;
      businessId = businessByOwner.get(row.business_id);
    }
  }

  if (!ownerUid || !businessId) {
    const parent = parentMetadata(table, row, catalogByName, metadataBySourceKey);
    ownerUid ??= parent?.ownerUid ?? null;
    businessId ??= parent?.businessId ?? null;
  }
  return { ownerUid, businessId };
}

export function targetPath({ mapping, table, row, docId, tenancy }) {
  const values = {
    firebaseUid: row.user_id ?? tenancy.ownerUid,
    ownerUid: tenancy.ownerUid ?? row.user_id,
    businessId: table.name === 'business_profiles' ? row.id : tenancy.businessId,
    tripId: table.name === 'trips' ? row.id : row.trip_id,
    settingsId: docId,
    tripIdempotencyId: docId,
    featureKey: row.feature_key,
  };
  const rendered = mapping.target.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = values[key] ?? docId;
    if (value === null || value === undefined || value === '') {
      throw new Error(`TARGET_PATH_VALUE_MISSING:${table.name}:${key}`);
    }
    return encodeURIComponent(String(value));
  });
  const segments = rendered.split('/');
  if (segments.length % 2 !== 0) throw new Error(`TARGET_PATH_NOT_DOCUMENT:${rendered}`);
  return rendered;
}

export function extraFields({ table, row, tenancy, exclusions }) {
  const out = {
    schemaVersion: SCHEMA_VERSION,
    transformVersion: TRANSFORM_VERSION,
    migrationTransformVersion: FULL_TRANSFORM_VERSION,
    isDeleted: row.deleted_at !== null && row.deleted_at !== undefined,
  };
  if (tenancy.ownerUid) out.ownerUid = tenancy.ownerUid;
  if (tenancy.businessId) out.businessId = tenancy.businessId;
  if (table.name === 'user_profiles') {
    out.uid = row.user_id;
    out.userId = row.user_id;
    out.legacyProfileId = row.id;
  }
  if (table.name === 'business_profiles') {
    out.ownerUid = row.user_id;
    out.businessId = row.id;
  }
  if (table.orderingField || ['trip_activity_log', 'trip_financial_audit',
    'trip_payment_events', 'trip_installment_events', 'audit_logs'].includes(table.name)) {
    if (/^\d+$/.test(String(row.id ?? ''))) out.sequence = Number(row.id);
  }
  if (exclusions.length) {
    out.migrationExcludedFields = exclusions.map((x) => `${x.field}:${x.reason}`);
  }
  return out;
}

export function sizeClass(bytes) {
  if (bytes >= FIRESTORE_MAX_DOCUMENT_BYTES) return 'TOO_LARGE';
  if (bytes >= NEAR_LIMIT_BYTES) return 'NEAR_LIMIT';
  return 'SAFE';
}

export function indexEntryEstimate(value) {
  if (value === null || value === undefined) return 1;
  if (Array.isArray(value)) return Math.max(1, value.reduce((sum, item) => sum + indexEntryEstimate(item), 0));
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number' || typeof value._seconds === 'number') return 1;
    return Math.max(1, Object.values(value).reduce((sum, item) => sum + indexEntryEstimate(item), 0));
  }
  return 1;
}

export function indexRisk(data) {
  const estimatedEntries = Object.values(data).reduce((sum, value) => sum + indexEntryEstimate(value), 0);
  return {
    estimatedEntries,
    pathological: estimatedEntries >= MAX_INDEX_ENTRIES,
    nearLimit: estimatedEntries >= MAX_INDEX_ENTRIES * 0.8,
  };
}

export function rawDocumentHash(path, value) {
  const stable = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(stable);
    if (typeof node.seconds === 'number' || typeof node._seconds === 'number') {
      return { seconds: node.seconds ?? node._seconds, nanoseconds: node.nanoseconds ?? node._nanoseconds ?? 0 };
    }
    return Object.fromEntries(Object.keys(node).sort().map((key) => [key, stable(node[key])]));
  };
  return createHash('sha256').update(JSON.stringify({ path, value: stable(value) })).digest('hex');
}

export function authDerivedDocument(uid, businessId = null) {
  return {
    uid,
    userId: uid,
    ownerUid: uid,
    businessId,
    role: 'user',
    isSuspended: false,
    canViewFinancials: false,
    schemaVersion: SCHEMA_VERSION,
    transformVersion: TRANSFORM_VERSION,
    migrationTransformVersion: FULL_TRANSFORM_VERSION,
    migrationAuthOnly: true,
    isDeleted: false,
  };
}

/**
 * businessOwners/{uid}: the index that stands in for UNIQUE(business_profiles.user_id). The Rules let a
 * business be created only while no index document exists for its owner, so every migrated business needs
 * one or its owner could register a second business. The keys are exactly those the Rules allow.
 */
export function businessOwnerIndexDocument(uid, businessId) {
  return {
    uid,
    businessId,
    schemaVersion: SCHEMA_VERSION,
    transformVersion: TRANSFORM_VERSION,
    migrationTransformVersion: FULL_TRANSFORM_VERSION,
  };
}

/** vehiclePlates/{key}: lowercase hex SHA-256 of the exact plate text, as FirestoreAutoRepairRepository derives it. */
export function vehiclePlateKey(plateNumber) {
  return createHash('sha256').update(String(plateNumber), 'utf8').digest('hex');
}

/**
 * businesses/{businessId}/vehiclePlates/{key}: the index that stands in for UNIQUE(customer_vehicles.business_id,
 * plate_number). Without it a migrated plate could be registered again as a second vehicle.
 */
export function vehiclePlateIndexDocument(plateNumber, vehicleId, businessId) {
  return { plateNumber, vehicleId, businessId, schemaVersion: SCHEMA_VERSION };
}

