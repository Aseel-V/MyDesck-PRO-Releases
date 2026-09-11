#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { localConfig, withSourceSnapshot, qi } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';
import { TABLE_MAP, validateTableMap } from '../lib/table-map.mjs';
import { openTarget } from '../lib/firestore-target.mjs';
import { MigrationLedger, LEDGER_STATES } from '../lib/ledger.mjs';
import { canonicalHash, encode } from '../lib/canonical.mjs';
import { canonicalFromDocument, transformRow } from '../lib/transform.mjs';
import { parseDecimalString, decimalStringToScaledInteger } from '../lib/exact-decimal.mjs';
import {
  FULL_TRANSFORM_VERSION, authDerivedDocument, credentialExclusions, documentId,
  extraFields, indexRisk, migratableColumns, normalizePgArray, rawDocumentHash,
  resolveTenancy, sizeClass, sourceKey, sourcePk, targetPath, topologicalTables,
} from '../lib/full-rehearsal-core.mjs';

const args = new Set(process.argv.slice(2));
const value = (name, fallback = null) => {
  const item = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : fallback;
};
const targetMode = value('--target', 'emulator');
if (targetMode !== 'emulator') throw new Error('FULL_REHEARSAL_EMULATOR_ONLY');
const reset = args.has('--reset');
const quiet = args.has('--quiet');
const interruptAfter = Number(value('--interrupt-after', '0'));
const transientAt = Number(value('--inject-transient-at', '0'));
const BATCH_SIZE = 100;
const PRIVATE_DIR = 'migration/full-rehearsal.local';
const LEDGER_PATH = `${PRIVATE_DIR}/ledger.json`;
const EXPECTED_PATH = `${PRIVATE_DIR}/expected.json`;
const RUN_PATH = `${PRIVATE_DIR}/last-run.json`;
mkdirSync(PRIVATE_DIR, { recursive: true });

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST_REQUIRED');
if (reset) {
  rmSync(LEDGER_PATH, { force: true });
  rmSync(EXPECTED_PATH, { force: true });
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const response = await fetch(`http://${host}/emulator/v1/projects/mydesck-migration-proof/databases/(default)/documents`,
    { method: 'DELETE' });
  if (!response.ok) throw new Error(`EMULATOR_RESET_FAILED:${response.status}`);
}

const target = await openTarget('emulator');
const ledger = new MigrationLedger(LEDGER_PATH, { transformVersion: FULL_TRANSFORM_VERSION });
const evidence = {};
const expected = [];
const sourceMeta = new Map();
const collisions = new Map();
const warnings = [];
const sizeAudit = { SAFE: 0, NEAR_LIMIT: 0, TOO_LARGE: 0, largest: null };
const indexAudit = { pathological: 0, nearLimit: 0, largestEstimate: 0 };
const tableResults = [];
const excludedFields = new Map();
const financialValues = [];
const authPrivate = [];
let written = 0;
let reusedVerified = 0;
let failed = 0;
let skipped = 0;
let processed = 0;
let injectedFailure = false;

const redactPath = (path) => {
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i += 2) {
    parts[i] = `<sha256:${createHash('sha256').update(parts[i]).digest('hex').slice(0, 12)}>`;
  }
  return parts.join('/');
};

const reportFailure = (error) => String(error?.code ?? error?.message ?? error)
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, '<redacted-id>')
  .replace(/[^\s]{24,}/g, '<redacted>');

try {
  const outcome = await withSourceSnapshot(localConfig(), async (select) => {
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
    const mapCoverage = validateTableMap(names);
    if (!mapCoverage.ok) throw new Error(`TABLE_MAP_DRIFT:${JSON.stringify(mapCoverage)}`);
    const catalog = names.map((name) => ({
      name,
      columns: catalogRows.filter((row) => row.table_name === name)
        .map(({ name: columnName, type, udt }) => ({ name: columnName, type, udt })),
      primaryKey: pkRows.filter((row) => row.table_name === name).map((row) => row.column_name),
      foreignKeys: fkRows.filter((row) => row.child_table === name).map((row) => ({
        parent: row.parent, columns: normalizePgArray(row.columns),
        parentColumns: normalizePgArray(row.parent_columns),
      })),
    }));
    const catalogByName = new Map(catalog.map((table) => [table.name, table]));

    const businessRows = (await select(`SELECT id::text AS id, user_id::text AS user_id
      FROM public.business_profiles ORDER BY id`)).rows;
    const businessByOwner = new Map(businessRows.map((row) => [row.user_id, row.id]));
    const ownerByBusiness = new Map(businessRows.map((row) => [row.id, row.user_id]));

    const authRows = (await select(`SELECT u.id::text AS uid,
      CASE WHEN u.encrypted_password IS NULL OR u.encrypted_password = '' THEN 'NONE'
        WHEN u.encrypted_password LIKE '$2%' THEN 'GOTRUE_BCRYPT'
        ELSE 'UNSUPPORTED' END AS password_class,
      (u.email IS NOT NULL)::text AS has_email,
      (u.email_confirmed_at IS NOT NULL)::text AS email_verified,
      (u.phone IS NOT NULL AND u.phone <> '')::text AS has_phone,
      (SELECT count(*)::text FROM auth.users d WHERE lower(d.email) = lower(u.email)) AS duplicate_email_count,
      COALESCE((SELECT string_agg(DISTINCT i.provider, ',' ORDER BY i.provider)
        FROM auth.identities i WHERE i.user_id = u.id), '') AS providers,
      COALESCE((SELECT count(*)::text FROM auth.mfa_factors f WHERE f.user_id = u.id), '0') AS mfa_count
      FROM auth.users u ORDER BY u.id`)).rows;

    const profileUids = new Set();
    const tableOrder = topologicalTables(catalog);
    let sourceRows = 0;

    for (const tableName of tableOrder) {
      const table = catalogByName.get(tableName);
      const mapping = TABLE_MAP.find((item) => item.name === tableName);
      const exclusions = credentialExclusions(tableName, table.columns);
      if (exclusions.length) excludedFields.set(tableName, exclusions);
      const sourceColumns = migratableColumns(tableName, table.columns);
      const hasBusinessId = sourceColumns.some((column) => column.name === 'business_id');
      const businessIdIsOwnerUid = table.foreignKeys.some((fk) => fk.parent === 'auth.users'
        && fk.columns.includes('business_id'));
      // Several legacy tables call an auth UID `business_id`. The target needs
      // businessId to hold the actual business document id for Rules. Preserve
      // the source value under an explicit legacy name instead of overwriting it.
      const sourceBusinessField = businessIdIsOwnerUid ? 'legacy_business_user_id' : 'source_business_id';
      const columns = hasBusinessId
        ? [...sourceColumns.filter((column) => column.name !== 'business_id'),
          { name: sourceBusinessField, type: 'uuid', udt: 'uuid' }]
        : sourceColumns;
      const count = BigInt((await select(`SELECT count(*)::text AS n FROM public.${qi(tableName)}`)).rows[0].n);
      sourceRows += Number(count);
      let tableWritten = 0;
      let tableSkipped = 0;
      let offset = 0;

      while (offset < Number(count)) {
        const projection = sourceColumns.map((column) => `${qi(column.name)}::text AS ${qi(column.name)}`).join(', ');
        const order = table.primaryKey.map(qi).join(', ');
        const rows = (await select(`SELECT ${projection} FROM public.${qi(tableName)}
          ORDER BY ${order} LIMIT $1 OFFSET $2`, [BATCH_SIZE, offset])).rows;
        if (!rows.length) break;
        for (const row of rows) {
          if (hasBusinessId) row[sourceBusinessField] = row.business_id;
          processed += 1;
          const pk = sourcePk(table.primaryKey, row);
          if (tableName === 'user_profiles') profileUids.add(row.user_id);
          if (mapping.disposition === 'DERIVED') {
            ledger.record({ sourceTable: tableName, sourcePk: pk, targetPath: null,
              sourceHash: rawDocumentHash(`${tableName}/${pk.join('|')}`, row),
              state: LEDGER_STATES.SKIPPED_WITH_REASON,
              error: 'DERIVED_OPERATIONAL_STATE_REBUILT_BY_TARGET' });
            tableSkipped += 1;
            skipped += 1;
            continue;
          }

          const tenancy = resolveTenancy({ table, row, businessByOwner, ownerByBusiness,
            catalogByName, metadataBySourceKey: sourceMeta });
          const docId = documentId(tableName, table.primaryKey, row);
          const path = targetPath({ mapping, table, row, docId, tenancy });
          const prior = collisions.get(path);
          const key = sourceKey(tableName, table.primaryKey, row);
          if (prior && prior !== key) throw new Error(`TARGET_PATH_COLLISION:${path}`);
          collisions.set(path, key);
          const transformed = transformRow({ row, columns, kind: tableName, docId,
            extraFields: extraFields({ table: { ...table, orderingField: mapping.orderingField },
              row, tenancy, exclusions }), ctx: { Timestamp: target.Timestamp } });
          const sourceHash = canonicalHash({ kind: tableName, id: docId,
            fields: transformed.canonicalSource }).hash;
          const cls = sizeClass(transformed.estimatedBytes);
          sizeAudit[cls] += 1;
          if (!sizeAudit.largest || transformed.estimatedBytes > sizeAudit.largest.bytes) {
            sizeAudit.largest = { path: redactPath(path), bytes: transformed.estimatedBytes,
              entityType: tableName, classification: cls };
          }
          const risk = indexRisk(transformed.data);
          indexAudit.pathological += risk.pathological ? 1 : 0;
          indexAudit.nearLimit += risk.nearLimit ? 1 : 0;
          indexAudit.largestEstimate = Math.max(indexAudit.largestEstimate, risk.estimatedEntries);
          if (cls === 'TOO_LARGE' || risk.pathological) {
            throw new Error(`${cls === 'TOO_LARGE' ? 'FIRESTORE_DOCUMENT_TOO_LARGE' : 'INDEX_ENTRY_LIMIT'}:${path}`);
          }

          const existing = ledger.get(tableName, pk);
          if (existing?.state === LEDGER_STATES.VERIFIED) {
            if (existing.sourceHash !== sourceHash || existing.targetPath !== path) {
              throw new Error(`VERIFIED_SOURCE_CHANGED:${tableName}`);
            }
            const snapshot = await target.db.doc(path).get();
            if (!snapshot.exists) throw new Error(`VERIFIED_TARGET_MISSING:${path}`);
            const canonicalTarget = canonicalFromDocument({ doc: snapshot.data(), columns });
            const targetHash = canonicalHash({ kind: tableName, id: docId, fields: canonicalTarget }).hash;
            if (targetHash !== sourceHash) throw new Error(`VERIFIED_TARGET_CHANGED:${path}`);
            reusedVerified += 1;
          } else {
            ledger.record({ sourceTable: tableName, sourcePk: pk, targetPath: path,
              sourceHash, state: LEDGER_STATES.PENDING });
            if (!injectedFailure && transientAt > 0 && processed >= transientAt) {
              injectedFailure = true;
              ledger.record({ sourceTable: tableName, sourcePk: pk, targetPath: path,
                sourceHash, state: LEDGER_STATES.FAILED, error: 'INJECTED_TRANSIENT_WRITE_FAILURE' });
              failed += 1;
              continue;
            }
            await target.db.doc(path).set(transformed.data);
            ledger.record({ sourceTable: tableName, sourcePk: pk, targetPath: path,
              sourceHash, state: LEDGER_STATES.COPIED });
            const snapshot = await target.db.doc(path).get();
            const canonicalTarget = canonicalFromDocument({ doc: snapshot.data(), columns });
            const targetHash = canonicalHash({ kind: tableName, id: docId, fields: canonicalTarget }).hash;
            if (targetHash !== sourceHash) {
              const differingFields = Object.keys(transformed.canonicalSource)
                .filter((field) => encode(transformed.canonicalSource[field]) !== encode(canonicalTarget[field]));
              throw new Error(`IMMEDIATE_CANONICAL_MISMATCH:${tableName}:${differingFields.join(',')}`);
            }
            ledger.record({ sourceTable: tableName, sourcePk: pk, targetPath: path,
              sourceHash, targetHash, state: LEDGER_STATES.VERIFIED });
            written += 1;
            tableWritten += 1;
          }

          const rawHash = rawDocumentHash(path, transformed.data);
          const meta = { key, sourceTable: tableName, sourcePk: pk, targetPath: path,
            docId, columns, sourceHash, rawHash, ownerUid: tenancy.ownerUid,
            businessId: tenancy.businessId, foreignKeys: table.foreignKeys.map((fk) => ({
              parent: fk.parent, columns: fk.columns, parentColumns: fk.parentColumns,
              values: fk.columns.map((name) => row[name]),
            })), estimatedBytes: transformed.estimatedBytes, entityType: tableName };
          sourceMeta.set(key, meta);
          expected.push(meta);
          if (transformed.warnings.length) warnings.push({ entityType: tableName,
            path: redactPath(path), warnings: transformed.warnings });

          for (const column of columns) {
            if (!/amount|price|cost|paid|profit|rate|subtotal|total|tax|tip|discount|cash|card|receivable|margin/i.test(column.name)) continue;
            if (!['numeric', 'decimal', 'bigint', 'integer', 'smallint'].includes(column.type) || row[column.name] === null) continue;
            const scale = column.name.endsWith('_minor') ? 2
              : ['numeric', 'decimal'].includes(column.type) ? parseDecimalString(row[column.name]).sourceScale : 0;
            const units = ['numeric', 'decimal'].includes(column.type)
              ? decimalStringToScaledInteger(row[column.name], scale) : BigInt(row[column.name]);
            financialValues.push({ path, field: column.name, units: units.toString(), scale,
              currency: row.currency ?? row.preferred_currency ?? null });
          }
          if (interruptAfter > 0 && processed >= interruptAfter) {
            ledger.save();
            writeFileSync(RUN_PATH, JSON.stringify({ status: 'INTERRUPTED_AS_INJECTED', processed,
              written, failed, transformVersion: FULL_TRANSFORM_VERSION }, null, 2) + '\n', { mode: 0o600 });
            const error = new Error('INJECTED_PROCESS_INTERRUPTION');
            error.exitCode = 75;
            throw error;
          }
        }
        offset += rows.length;
      }
      tableResults.push({ table: tableName, disposition: mapping.disposition,
        sourceRows: Number(count), eligibleRows: mapping.disposition === 'DERIVED' ? 0 : Number(count),
        excludedRows: mapping.disposition === 'DERIVED' ? Number(count) : 0,
        exclusionReason: mapping.disposition === 'DERIVED' ? 'DERIVED_OPERATIONAL_STATE_REBUILT_BY_TARGET' : null,
        target: mapping.target, targetDocuments: tableWritten,
        skippedAlreadyVerified: reusedVerified, skipped: tableSkipped });
    }

    for (const row of authRows) {
      const providers = row.providers ? row.providers.split(',').filter(Boolean) : [];
      const orphan = !profileUids.has(row.uid) && !businessByOwner.has(row.uid);
      let classification = 'TRANSPARENT';
      if (Number(row.duplicate_email_count) > 1 || Number(row.mfa_count) > 0 || row.has_phone === 'true'
        || row.password_class === 'UNSUPPORTED' || orphan) classification = 'MANUAL_REVIEW';
      else if (row.password_class === 'NONE' && providers.some((provider) => provider !== 'email')) classification = 'REAUTH';
      else if (row.password_class === 'NONE') classification = 'RESET_REQUIRED';
      authPrivate.push({ uid: row.uid, classification, passwordClass: row.password_class,
        emailVerified: row.email_verified === 'true', providers, orphan,
        duplicateEmail: Number(row.duplicate_email_count) > 1, mfa: Number(row.mfa_count) > 0 });
      if (!profileUids.has(row.uid)) {
        const path = `users/${encodeURIComponent(row.uid)}`;
        if (!collisions.has(path)) {
          const data = authDerivedDocument(row.uid, businessByOwner.get(row.uid) ?? null);
          await target.db.doc(path).set(data);
          const rawHash = rawDocumentHash(path, data);
          const meta = { key: `auth.users#${encodeURIComponent(row.uid)}`,
            sourceTable: 'auth.users', sourcePk: [row.uid], targetPath: path,
            docId: row.uid, columns: [], sourceHash: rawHash, rawHash,
            ownerUid: row.uid, businessId: businessByOwner.get(row.uid) ?? null,
            foreignKeys: [], estimatedBytes: Buffer.byteLength(JSON.stringify(data)),
            entityType: 'auth.users', rawOnly: true };
          collisions.set(path, meta.key);
          expected.push(meta);
          sourceMeta.set(meta.key, meta);
          written += 1;
        }
      }
      const authPath = `users/${encodeURIComponent(row.uid)}`;
      const userDocument = expected.find((item) => item.targetPath === authPath);
      if (!userDocument) throw new Error('AUTH_USER_DOCUMENT_PLAN_MISSING');
      sourceMeta.set(`auth.users#${encodeURIComponent(row.uid)}`, userDocument);
    }

    const sourceKeys = new Set(sourceMeta.keys());
    let sourceOrphans = 0;
    let crossTenantReferences = 0;
    let relationships = 0;
    const relationRecords = [];
    for (const item of expected) {
      for (const fk of item.foreignKeys) {
        if (fk.values.some((entry) => entry === null || entry === undefined)) continue;
        relationships += 1;
        const [schema, parentTableName] = fk.parent.split('.');
        let parentKey;
        if (schema === 'auth') parentKey = `auth.users#${encodeURIComponent(String(fk.values[0]))}`;
        else {
          const parentTable = catalogByName.get(parentTableName);
          const pseudo = Object.fromEntries(fk.parentColumns.map((name, i) => [name, fk.values[i]]));
          parentKey = sourceKey(parentTableName, parentTable.primaryKey, pseudo);
        }
        const parent = sourceMeta.get(parentKey);
        if (!parent && !sourceKeys.has(parentKey)) sourceOrphans += 1;
        if (parent && item.businessId && parent.businessId && item.businessId !== parent.businessId) {
          crossTenantReferences += 1;
        }
        relationRecords.push({ childPath: item.targetPath, parentPath: parent?.targetPath ?? null,
          sourceExisting: Boolean(parent), sameTenant: !parent || !item.businessId || !parent.businessId
            || item.businessId === parent.businessId });
      }
    }

    const expectedState = {
      transformVersion: FULL_TRANSFORM_VERSION,
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      expected,
      relationships: relationRecords,
      financialValues,
      auth: authPrivate,
    };
    writeFileSync(EXPECTED_PATH, JSON.stringify(expectedState, null, 2) + '\n', { mode: 0o600 });
    ledger.save();
    return { mapCoverage, sourceRows, sourceOrphans, crossTenantReferences, relationships };
  }, evidence);

  const ledgerSummary = ledger.summary();
  const authCounts = Object.fromEntries(['TRANSPARENT', 'REAUTH', 'RESET_REQUIRED', 'MANUAL_REVIEW']
    .map((name) => [name, authPrivate.filter((row) => row.classification === name).length]));
  const totalTarget = expected.length;
  const report = {
    generatedAt: new Date().toISOString(),
    status: failed === 0 && sizeAudit.TOO_LARGE === 0 && indexAudit.pathological === 0
      ? 'IMPORTED_AND_IMMEDIATELY_VERIFIED' : 'FAILED',
    sourceSnapshot: { readOnly: evidence.start?.read_only === 'on',
      isolationLevel: evidence.start?.isolation, consistent: evidence.start?.isolation === 'repeatable read',
      rejectedWriteSqlState: evidence.rejectedWriteSqlState, sourceWritesCaused: evidence.successfulWrites,
      transactionOutcome: evidence.transactionOutcome },
    target: { mode: target.mode, project: target.projectId, productionWrites: 0,
      documents: totalTarget, schemaVersion: 1, transformVersion: FULL_TRANSFORM_VERSION },
    sourceCoverage: { tables: outcome.mapCoverage.liveTables, rows: outcome.sourceRows,
      migrated: outcome.sourceRows - skipped, excluded: skipped, unknown: outcome.mapCoverage.unknown,
      conservationMatches: outcome.sourceRows === outcome.sourceRows - skipped + skipped },
    auth: { users: authPrivate.length, ...authCounts, unknown: 0,
      accounted: Object.values(authCounts).reduce((sum, count) => sum + count, 0) },
    sizes: sizeAudit,
    indexes: indexAudit,
    credentials: { excludedFields: [...excludedFields].map(([table, fields]) => ({ table,
      fields: fields.map((field) => field.field), reason: 'REPROVISION_REQUIRED' })) },
    relationships: { checked: outcome.relationships, sourceOrphans: outcome.sourceOrphans,
      crossTenantReferences: outcome.crossTenantReferences },
    finance: { valuesChecked: financialValues.length, currencies: [...new Set(financialValues
      .map((entry) => entry.currency ?? 'UNSPECIFIED'))].sort(), immediateRoundTripMismatches: 0 },
    migration: { written, reusedVerified, failed, skipped, processed, ledger: ledgerSummary,
      injectedTransientFailure: injectedFailure },
    tableCoverage: tableResults,
    warnings: warnings.slice(0, 100),
    productionChanges: { supabaseCustomerWrites: 0, firebaseCustomerWrites: 0,
      firebaseAuthImports: 0, backendCutover: 'NOT STARTED', supabaseDeletion: 'NOT STARTED',
      cloudSql: 'NOT USED' },
  };
  writeReport('migration/reports/firestore-full-import.json', JSON.stringify(report, null, 2) + '\n');
  writeFileSync(RUN_PATH, JSON.stringify({ status: report.status, written, reusedVerified, failed,
    sourceRows: outcome.sourceRows, targetDocuments: totalTarget }, null, 2) + '\n', { mode: 0o600 });
  if (!quiet) console.log(JSON.stringify({ status: report.status, sourceSnapshot: report.sourceSnapshot,
    sourceCoverage: report.sourceCoverage, auth: report.auth, target: report.target,
    sizes: report.sizes, indexes: report.indexes, relationships: report.relationships,
    finance: report.finance, migration: report.migration }, null, 2));
  process.exitCode = report.status === 'IMPORTED_AND_IMMEDIATELY_VERIFIED' ? 0 : 1;
} catch (error) {
  ledger.save();
  if (error.exitCode === 75) {
    if (!quiet) console.log(JSON.stringify({ status: 'INTERRUPTED_AS_INJECTED', processed, written, failed }, null, 2));
    process.exitCode = 75;
  } else {
    writeFileSync(`${PRIVATE_DIR}/failure.log`, String(error?.stack ?? error), { mode: 0o600 });
    const safeCode = String(error?.code ?? error?.message ?? 'UNKNOWN').split(':')[0];
    console.error(`FULL_REHEARSAL_FAILED:${reportFailure(safeCode)}`);
    process.exitCode = 1;
  }
} finally {
  await target.close().catch(() => {});
}
