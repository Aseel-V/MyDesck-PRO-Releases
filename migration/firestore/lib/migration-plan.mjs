/**
 * The migration document plan: source snapshot in, complete document set out, nothing written.
 *
 * The verified full rehearsal built its 1,477 documents inline, interleaving planning with emulator
 * writes, ledger bookkeeping and audits. Production cannot reuse that loop as-is (it is emulator
 * only, by an explicit guard) and must not re-implement it either, so the planning half is extracted
 * here, verbatim in behaviour, with every document-building decision still delegated to the same
 * already-verified primitives: `full-rehearsal-core.mjs` for tenancy, ids, paths, extra fields and
 * exclusions, `transform.mjs` for field values, `canonical.mjs` for hashing, `table-map.mjs` for
 * dispositions.
 *
 * This module writes nothing and takes no target. It is therefore safe to run against production in
 * validate-only mode, and its output is comparable against the rehearsal's recorded expected.json
 * document for document — which is how its equivalence is proven rather than asserted.
 *
 * Expected shape for the pinned snapshot: 1,474 source rows, 8 excluded as derived operational
 * state, 1,466 table documents, 11 derived documents, 1,477 documents total.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { qi } from '../../tools/lib/staging-source.mjs';
import { TABLE_MAP, validateTableMap } from './table-map.mjs';
import { canonicalHash } from './canonical.mjs';
import { firestoreFieldsFromSource, transformRow } from './transform.mjs';
import { parseDecimalString, decimalStringToScaledInteger } from './exact-decimal.mjs';
import {
  authDerivedDocument, businessOwnerIndexDocument, credentialExclusions, documentId,
  extraFields, indexRisk, migratableColumns, normalizePgArray, rawDocumentHash, resolveTenancy,
  restaurantLedgerFields, sizeClass, sourceKey, sourcePk, targetPath, topologicalTables,
  vehiclePlateIndexDocument, vehiclePlateKey,
} from './full-rehearsal-core.mjs';

const READ_PAGE = 100;

/**
 * Auth identities the operator has excluded as migration-preparation residue.
 *
 * Read from config rather than compiled in, so that the decision is auditable and reversing it is
 * itself a recorded change. An excluded identity is not imported into Firebase Auth and gets no
 * derived Firestore user document; it is still counted, still reported, and still has to survive the
 * relationship check, because an identity that something references cannot safely be dropped.
 */
export const EXCLUDED_AUTH_CONFIG_PATH = 'migration/firestore/config/excluded-auth-identities.json';
export function uidFingerprint(uid) {
  return createHash('sha256').update(uid).digest('hex').slice(0, 12);
}
export function loadExcludedAuthIdentities(path = EXCLUDED_AUTH_CONFIG_PATH) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
  catch { return { fingerprints: new Set(), entries: [] }; }
  const entries = Array.isArray(parsed.identities) ? parsed.identities : [];
  return { fingerprints: new Set(entries.map((entry) => entry.uidFingerprint)), entries,
    decision: parsed.decision ?? null, decidedAt: parsed.decidedAt ?? null };
}

/** Path with every id segment replaced by a short hash, for logs and reports. */
export function redactPath(path, createHash) {
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i += 2) {
    parts[i] = `<sha256:${createHash('sha256').update(parts[i]).digest('hex').slice(0, 12)}>`;
  }
  return parts.join('/');
}

async function readCatalog(select) {
  const catalogRows = (await select(`SELECT c.table_name, c.column_name AS name,
    c.data_type AS type, c.udt_name AS udt, c.ordinal_position
    FROM information_schema.columns c WHERE c.table_schema = 'public'
      AND c.table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    ORDER BY c.table_name, c.ordinal_position`)).rows;
  const pkRows = (await select(`SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position`)).rows;
  const fkRows = (await select(`SELECT cl.relname AS child_table,
    pns.nspname || '.' || pcl.relname AS parent,
    (SELECT array_agg(att.attname ORDER BY x.ord) FROM unnest(con.conkey)
      WITH ORDINALITY AS x(attnum, ord) JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = x.attnum) AS columns,
    (SELECT array_agg(att.attname ORDER BY x.ord) FROM unnest(con.confkey)
      WITH ORDINALITY AS x(attnum, ord) JOIN pg_attribute att
      ON att.attrelid = con.confrelid AND att.attnum = x.attnum) AS parent_columns
    FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_class pcl ON pcl.oid = con.confrelid
    JOIN pg_namespace pns ON pns.oid = pcl.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public'
    ORDER BY cl.relname, con.conname`)).rows;
  const names = [...new Set(catalogRows.map((row) => row.table_name))];
  const coverage = validateTableMap(names);
  if (!coverage.ok) throw new Error(`TABLE_MAP_DRIFT:${JSON.stringify(coverage)}`);
  return names.map((name) => ({
    name,
    columns: catalogRows.filter((row) => row.table_name === name)
      .map(({ name: columnName, type, udt }) => ({ name: columnName, type, udt })),
    primaryKey: pkRows.filter((row) => row.table_name === name).map((row) => row.column_name),
    foreignKeys: fkRows.filter((row) => row.child_table === name).map((row) => ({
      parent: row.parent, columns: normalizePgArray(row.columns),
      parentColumns: normalizePgArray(row.parent_columns),
    })),
  }));
}

/**
 * Build the complete document plan for one source snapshot.
 *
 * @param {object} options
 * @param {Function} options.select query function bound to a READ ONLY source snapshot
 * @param {object} options.Timestamp Firestore Timestamp class, for value transformation only
 * @returns plan entries, per-table coverage, exclusions and counts
 */
export async function buildMigrationPlan({ select, Timestamp }) {
  if (typeof select !== 'function') throw new Error('SOURCE_SELECT_REQUIRED');
  if (!Timestamp) throw new Error('TIMESTAMP_FACTORY_REQUIRED');

  const catalog = await readCatalog(select);
  const catalogByName = new Map(catalog.map((table) => [table.name, table]));

  const businessRows = (await select(`SELECT id::text AS id, user_id::text AS user_id
    FROM public.business_profiles ORDER BY id`)).rows;
  const businessByOwner = new Map(businessRows.map((row) => [row.user_id, row.id]));
  const ownerByBusiness = new Map(businessRows.map((row) => [row.id, row.user_id]));

  const authRows = (await select(`SELECT u.id::text AS uid FROM auth.users u ORDER BY u.id`)).rows;

  const restaurantDerived = {
    orderItemsTotal: new Map((await select(`SELECT order_id::text AS order_id,
      coalesce(sum(price_at_time * quantity) FILTER (WHERE status IS DISTINCT FROM 'cancelled' AND NOT coalesce(voided, false)), 0)::text AS items_total
      FROM public.restaurant_order_items GROUP BY order_id`)).rows.map((row) => [row.order_id, row.items_total])),
    ticketItemByLine: new Map((await select(`SELECT DISTINCT ON (order_item_id) order_item_id::text AS order_item_id, id::text AS id
      FROM public.restaurant_ticket_items ORDER BY order_item_id, created_at DESC, id DESC`)).rows.map((row) => [row.order_item_id, row.id])),
    orderCounters: (await select(`SELECT business_id::text AS owner_uid, max(order_number)::int AS max_number,
      (array_agg(id::text ORDER BY order_number DESC, id DESC))[1] AS last_order_id
      FROM public.restaurant_orders GROUP BY business_id`)).rows,
  };
  const ledgerDecimal = (field, text) => firestoreFieldsFromSource(field, text, 'decimal', { Timestamp });

  const plan = [];
  const excluded = [];
  const coverage = [];
  const collisions = new Map();
  const metadataBySourceKey = new Map();
  const financialValues = [];
  const profileUids = new Set();
  const vehicleRows = [];
  let sourceRows = 0;

  for (const tableName of topologicalTables(catalog)) {
    const table = catalogByName.get(tableName);
    const mapping = TABLE_MAP.find((item) => item.name === tableName);
    const exclusions = credentialExclusions(tableName, table.columns);
    const sourceColumns = migratableColumns(tableName, table.columns);
    const hasBusinessId = sourceColumns.some((column) => column.name === 'business_id');
    const businessIdIsOwnerUid = table.foreignKeys.some((fk) => fk.parent === 'auth.users'
      && fk.columns.includes('business_id'));
    const sourceBusinessField = businessIdIsOwnerUid ? 'legacy_business_user_id' : 'source_business_id';
    const columns = hasBusinessId
      ? [...sourceColumns.filter((column) => column.name !== 'business_id'),
        { name: sourceBusinessField, type: 'uuid', udt: 'uuid' }]
      : sourceColumns;

    const count = Number((await select(`SELECT count(*)::text AS n FROM public.${qi(tableName)}`)).rows[0].n);
    sourceRows += count;
    let tableDocuments = 0;
    let tableExcluded = 0;
    let offset = 0;

    while (offset < count) {
      const projection = sourceColumns.map((column) => `${qi(column.name)}::text AS ${qi(column.name)}`).join(', ');
      const order = table.primaryKey.map(qi).join(', ');
      const rows = (await select(`SELECT ${projection} FROM public.${qi(tableName)}
        ORDER BY ${order} LIMIT $1 OFFSET $2`, [READ_PAGE, offset])).rows;
      if (!rows.length) break;
      for (const row of rows) {
        if (hasBusinessId) row[sourceBusinessField] = row.business_id;
        const pk = sourcePk(table.primaryKey, row);
        if (tableName === 'user_profiles') profileUids.add(row.user_id);

        if (mapping.disposition === 'DERIVED') {
          excluded.push({ sourceTable: tableName, sourcePk: pk,
            sourceFingerprint: rawDocumentHash(`${tableName}/${pk.join('|')}`, row),
            reason: 'DERIVED_OPERATIONAL_STATE_REBUILT_BY_TARGET' });
          tableExcluded += 1;
          continue;
        }

        const tenancy = resolveTenancy({ table, row, businessByOwner, ownerByBusiness,
          catalogByName, metadataBySourceKey });
        const docId = documentId(tableName, table.primaryKey, row);
        const path = targetPath({ mapping, table, row, docId, tenancy });
        const key = sourceKey(tableName, table.primaryKey, row);
        const prior = collisions.get(path);
        if (prior && prior !== key) throw new Error(`TARGET_PATH_COLLISION:${path}`);
        collisions.set(path, key);

        const transformed = transformRow({ row, columns, kind: tableName, docId,
          extraFields: { ...extraFields({ table: { ...table, orderingField: mapping.orderingField },
            row, tenancy, exclusions }),
          ...restaurantLedgerFields(tableName, row, restaurantDerived, ledgerDecimal) },
          ctx: { Timestamp } });
        const sourceFingerprint = canonicalHash({ kind: tableName, id: docId,
          fields: transformed.canonicalSource }).hash;

        const cls = sizeClass(transformed.estimatedBytes);
        const risk = indexRisk(transformed.data);
        if (cls === 'TOO_LARGE' || risk.pathological) {
          throw new Error(`${cls === 'TOO_LARGE' ? 'FIRESTORE_DOCUMENT_TOO_LARGE' : 'INDEX_ENTRY_LIMIT'}:${path}`);
        }

        const entry = { path, collection: path.split('/').slice(0, -1).join('/'), docId,
          sourceTable: tableName, sourcePk: pk, sourceKey: key,
          sourceFingerprint, documentFingerprint: rawDocumentHash(path, transformed.data),
          ownerUid: tenancy.ownerUid, businessId: tenancy.businessId,
          estimatedBytes: transformed.estimatedBytes, derived: false, data: transformed.data,
          canonicalSource: transformed.canonicalSource, columns };
        plan.push(entry);
        // Financial parity is checked against the SOURCE row, not the document, so the comparison
        // cannot be satisfied by a transform that is wrong in both directions. Same column rule and
        // same scaling as the rehearsal.
        for (const column of columns) {
          if (!/amount|price|cost|paid|profit|rate|subtotal|total|tax|tip|discount|cash|card|receivable|margin/i
            .test(column.name)) continue;
          if (!['numeric', 'decimal', 'bigint', 'integer', 'smallint'].includes(column.type)) continue;
          if (row[column.name] === null || row[column.name] === undefined) continue;
          const scale = column.name.endsWith('_minor') ? 2
            : ['numeric', 'decimal'].includes(column.type) ? parseDecimalString(row[column.name]).sourceScale : 0;
          const units = ['numeric', 'decimal'].includes(column.type)
            ? decimalStringToScaledInteger(row[column.name], scale) : BigInt(row[column.name]);
          financialValues.push({ path, field: column.name, units: units.toString(), scale,
            currency: row.currency ?? row.preferred_currency ?? null });
        }
        metadataBySourceKey.set(key, { key, sourceTable: tableName, sourcePk: pk, targetPath: path,
          docId, columns, ownerUid: tenancy.ownerUid, businessId: tenancy.businessId,
          foreignKeys: table.foreignKeys.map((fk) => ({ parent: fk.parent, columns: fk.columns,
            parentColumns: fk.parentColumns, values: fk.columns.map((name) => row[name]) })),
          entityType: tableName });
        tableDocuments += 1;
        if (tableName === 'customer_vehicles') {
          vehicleRows.push({ id: row.id, plateNumber: row.plate_number,
            businessId: tenancy.businessId, ownerUid: tenancy.ownerUid });
        }
      }
      offset += rows.length;
    }
    coverage.push({ table: tableName, disposition: mapping.disposition, sourceRows: count,
      targetDocuments: tableDocuments, excludedRows: tableExcluded,
      exclusionReason: tableExcluded ? 'DERIVED_OPERATIONAL_STATE_REBUILT_BY_TARGET' : null });
  }

  // ---- derived documents, in the rehearsal's order ---------------------------------------------
  const derive = (entry) => { collisions.set(entry.path, entry.sourceKey); plan.push(entry); };

  const excludedAuth = loadExcludedAuthIdentities();
  const excludedIdentities = [];
  for (const row of authRows) {
    const path = `users/${encodeURIComponent(row.uid)}`;
    if (excludedAuth.fingerprints.has(uidFingerprint(row.uid))) {
      // No document, and no foreign-key registration either. If anything in the source references
      // this identity the relationship pass will report it as a source orphan, which is exactly the
      // signal that the exclusion is unsafe — so it is left to surface rather than papered over.
      excludedIdentities.push({ uidFingerprint: uidFingerprint(row.uid), targetPath: path,
        reason: 'OPERATOR_EXCLUDED_MIGRATION_PREPARATION_RESIDUE',
        hasSourceProfile: profileUids.has(row.uid) });
      continue;
    }
    if (!profileUids.has(row.uid) && !collisions.has(path)) {
      const data = authDerivedDocument(row.uid, businessByOwner.get(row.uid) ?? null);
      derive({ path, collection: 'users', docId: row.uid, sourceTable: 'auth.users', sourcePk: [row.uid],
        sourceKey: `auth.users#${encodeURIComponent(row.uid)}`,
        sourceFingerprint: rawDocumentHash(path, data), documentFingerprint: rawDocumentHash(path, data),
        ownerUid: row.uid, businessId: businessByOwner.get(row.uid) ?? null,
        estimatedBytes: Buffer.byteLength(JSON.stringify(data)), derived: true, data, columns: [] });
    }
    // Every auth user is a valid foreign-key target, whether its document came from user_profiles or
    // was derived here. Without this registration every FK into auth.users reads as a source orphan,
    // which is an artefact of the bookkeeping rather than anything about the data. The rehearsal
    // registers it the same way, and for the same reason.
    const userDocument = plan.find((entry) => entry.path === path);
    if (!userDocument) throw new Error('AUTH_USER_DOCUMENT_PLAN_MISSING');
    metadataBySourceKey.set(`auth.users#${encodeURIComponent(row.uid)}`, {
      key: `auth.users#${encodeURIComponent(row.uid)}`, sourceTable: 'auth.users',
      sourcePk: [row.uid], targetPath: path, docId: row.uid, columns: [],
      ownerUid: userDocument.ownerUid, businessId: userDocument.businessId,
      foreignKeys: [], entityType: 'auth.users',
    });
  }

  for (const business of businessRows) {
    const path = `businessOwners/${encodeURIComponent(business.user_id)}`;
    if (collisions.has(path)) throw new Error('BUSINESS_OWNER_NOT_UNIQUE');
    const data = businessOwnerIndexDocument(business.user_id, business.id);
    derive({ path, collection: 'businessOwners', docId: business.user_id,
      sourceTable: 'business_profiles.owner_index', sourcePk: [business.id],
      sourceKey: `businessOwners#${encodeURIComponent(business.user_id)}`,
      sourceFingerprint: rawDocumentHash(path, data), documentFingerprint: rawDocumentHash(path, data),
      ownerUid: business.user_id, businessId: business.id,
      estimatedBytes: Buffer.byteLength(JSON.stringify(data)), derived: true, data, columns: [] });
  }

  for (const vehicle of vehicleRows) {
    if (!vehicle.businessId) throw new Error('VEHICLE_WITHOUT_BUSINESS');
    const path = `businesses/${encodeURIComponent(vehicle.businessId)}/vehiclePlates/${vehiclePlateKey(vehicle.plateNumber)}`;
    if (collisions.has(path)) throw new Error('VEHICLE_PLATE_NOT_UNIQUE');
    const data = vehiclePlateIndexDocument(vehicle.plateNumber, vehicle.id, vehicle.businessId);
    derive({ path, collection: path.split('/').slice(0, -1).join('/'), docId: path.split('/').pop(),
      sourceTable: 'customer_vehicles.plate_index', sourcePk: [vehicle.id],
      sourceKey: `vehiclePlates#${encodeURIComponent(vehicle.id)}`,
      sourceFingerprint: rawDocumentHash(path, data), documentFingerprint: rawDocumentHash(path, data),
      ownerUid: vehicle.ownerUid, businessId: vehicle.businessId,
      estimatedBytes: Buffer.byteLength(JSON.stringify(data)), derived: true, data, columns: [] });
  }

  for (const counter of restaurantDerived.orderCounters) {
    const businessId = businessByOwner.get(counter.owner_uid);
    if (!businessId) throw new Error('RESTAURANT_ORDERS_WITHOUT_BUSINESS');
    const path = `businesses/${encodeURIComponent(businessId)}/restaurantCounters/orders`;
    if (collisions.has(path)) throw new Error('RESTAURANT_COUNTER_NOT_UNIQUE');
    const data = { next: counter.max_number + 1, lastOrderId: counter.last_order_id, businessId, schemaVersion: 1 };
    derive({ path, collection: path.split('/').slice(0, -1).join('/'), docId: 'orders',
      sourceTable: 'restaurant_orders.order_number_counter', sourcePk: [businessId],
      sourceKey: `restaurantCounters#${encodeURIComponent(businessId)}`,
      sourceFingerprint: rawDocumentHash(path, data), documentFingerprint: rawDocumentHash(path, data),
      ownerUid: counter.owner_uid, businessId,
      estimatedBytes: Buffer.byteLength(JSON.stringify(data)), derived: true, data, columns: [] });
  }

  // ---- relationship records, from the foreign keys already captured per row --------------------
  // Derived documents carry no foreign keys of their own, so this walks the table documents only.
  const sourceKeys = new Set(metadataBySourceKey.keys());
  const relationships = [];
  let sourceOrphans = 0;
  let crossTenantReferences = 0;
  for (const item of metadataBySourceKey.values()) {
    for (const fk of item.foreignKeys) {
      if (fk.values.some((value) => value === null || value === undefined)) continue;
      const [schema, parentTableName] = fk.parent.split('.');
      let parentKey;
      if (schema === 'auth') parentKey = `auth.users#${encodeURIComponent(String(fk.values[0]))}`;
      else {
        const parentTable = catalogByName.get(parentTableName);
        const pseudo = Object.fromEntries(fk.parentColumns.map((name, index) => [name, fk.values[index]]));
        parentKey = sourceKey(parentTableName, parentTable.primaryKey, pseudo);
      }
      const parent = metadataBySourceKey.get(parentKey);
      if (!parent && !sourceKeys.has(parentKey)) sourceOrphans += 1;
      if (parent && item.businessId && parent.businessId && item.businessId !== parent.businessId) {
        crossTenantReferences += 1;
      }
      relationships.push({ childPath: item.targetPath, parentPath: parent?.targetPath ?? null,
        sourceExisting: Boolean(parent),
        sameTenant: !parent || !item.businessId || !parent.businessId
          || item.businessId === parent.businessId });
    }
  }

  const tableDocuments = plan.filter((entry) => !entry.derived).length;
  const derivedDocuments = plan.filter((entry) => entry.derived).length;
  return {
    plan,
    excluded,
    coverage,
    // Audit structures. These describe the same snapshot the plan was built from; they add no
    // documents and change no document, so the plan stays byte-for-byte what it was.
    relationships,
    financialValues,
    excludedAuthIdentities: excludedIdentities,
    metadata: [...metadataBySourceKey.values()],
    sourceOrphans,
    crossTenantReferences,
    counts: {
      sourceRows,
      excludedRows: excluded.length,
      migratableRows: sourceRows - excluded.length,
      tableDocuments,
      derivedDocuments,
      excludedAuthIdentities: excludedIdentities.length,
      plannedDocuments: plan.length,
    },
  };
}

/** Fixed-size batches covering every planned document exactly once, in plan order. */
export function partitionBatches(plan, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error('BATCH_SIZE_MUST_BE_1_TO_500');
  }
  const batches = [];
  for (let index = 0; index < plan.length; index += batchSize) {
    batches.push(plan.slice(index, index + batchSize));
  }
  return batches;
}
