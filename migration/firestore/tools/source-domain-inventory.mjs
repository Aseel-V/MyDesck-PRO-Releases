#!/usr/bin/env node
/**
 * Phase A — complete, live, READ-ONLY source domain inventory.
 *
 * Historical reports are evidence of what was true when they were written, not
 * of what is true now: the earlier staging proof recorded 77 public tables and
 * this run already sees a different count. So every number here is re-derived
 * from the live catalog inside the same read-only snapshot the rest of the
 * migration uses. Nothing is carried forward from a previous report.
 *
 * Function bodies are deliberately NOT exported. A SECURITY DEFINER body can
 * embed secrets; signature-level metadata is enough to classify an RPC.
 *
 *   node migration/firestore/tools/source-domain-inventory.mjs
 */

import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';
import { writeReport } from '../../tools/lib/write-report.mjs';

const DELETE_ACTION = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
const VOLATILITY = { i: 'IMMUTABLE', s: 'STABLE', v: 'VOLATILE' };

const evidence = {};
const config = localConfig();

const inventory = await withSourceSnapshot(config, async (select) => {
  const q = async (sql, values) => (await select(sql, values)).rows;
  const optional = async (sql) => {
    try { return await q(sql); } catch { return []; }
  };

  const server = await q(`SELECT version() AS version, current_database() AS database,
    current_setting('server_encoding') AS encoding, current_user AS role`);

  const tables = await q(`SELECT c.relname AS name,
      c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`);

  const columns = await q(`SELECT c.table_name, c.column_name, c.ordinal_position,
      c.data_type, c.udt_name, c.is_nullable, c.column_default,
      c.numeric_precision, c.numeric_scale, c.datetime_precision,
      c.character_maximum_length, c.is_generated, c.is_identity
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position`);

  const primaryKeys = await q(`SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position`);

  const foreignKeys = await q(`SELECT con.conname AS name,
      cl.relname AS child_table, ns.nspname AS child_schema,
      pcl.relname AS parent_table, pns.nspname AS parent_schema,
      con.confdeltype AS on_delete, con.convalidated AS validated,
      (SELECT array_agg(att.attname ORDER BY x.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = x.attnum) AS child_columns,
      (SELECT array_agg(att.attname ORDER BY x.ord)
         FROM unnest(con.confkey) WITH ORDINALITY AS x(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = x.attnum) AS parent_columns
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_class pcl ON pcl.oid = con.confrelid JOIN pg_namespace pns ON pns.oid = pcl.relnamespace
    WHERE con.contype = 'f' AND ns.nspname = 'public'
    ORDER BY cl.relname, con.conname`);

  const uniques = await q(`SELECT cl.relname AS table_name, con.conname AS name,
      (SELECT array_agg(att.attname ORDER BY x.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = x.attnum) AS columns
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE con.contype = 'u' AND ns.nspname = 'public' ORDER BY cl.relname, con.conname`);

  const checks = await q(`SELECT cl.relname AS table_name, con.conname AS name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE con.contype = 'c' AND ns.nspname = 'public'
    ORDER BY cl.relname, con.conname`);

  const enums = await q(`SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname`);

  const indexes = await q(`SELECT tablename AS table_name, indexname AS name, indexdef AS definition
    FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`);

  const triggers = await q(`SELECT cl.relname AS table_name, tg.tgname AS name,
      tg.tgisinternal AS internal, p.proname AS function_name
    FROM pg_trigger tg JOIN pg_class cl ON cl.oid = tg.tgrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE ns.nspname = 'public' ORDER BY cl.relname, tg.tgname`);

  const functions = await q(`SELECT p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS returns,
      p.prosecdef AS security_definer, p.provolatile AS volatility,
      array_to_string(p.proconfig, ',') AS config
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' ORDER BY p.proname`);

  const policies = await q(`SELECT schemaname, tablename, policyname, cmd, roles,
      qual, with_check
    FROM pg_policies WHERE schemaname IN ('public','storage')
    ORDER BY schemaname, tablename, policyname`);

  const sequences = await q(`SELECT sequence_name, data_type
    FROM information_schema.sequences WHERE sequence_schema = 'public' ORDER BY sequence_name`);

  const rowCounts = await q(`SELECT c.relname AS table_name, c.reltuples::bigint::text AS estimated_rows
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`);

  const storageBuckets = await optional(`SELECT id, public::text AS public,
      file_size_limit::text AS file_size_limit,
      array_to_string(allowed_mime_types, ',') AS allowed_mime_types
    FROM storage.buckets ORDER BY id`);

  const storageObjectCounts = await optional(`SELECT bucket_id, count(*)::text AS objects
    FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id`);

  const authUsers = await q(`SELECT count(*)::text AS total FROM auth.users`);

  return { server: server[0], tables, columns, primaryKeys, foreignKeys, uniques, checks,
    enums, indexes, triggers, functions, policies, sequences, storageBuckets,
    storageObjectCounts, rowCounts, authUsersTotal: authUsers[0].total };
}, evidence);

const group = (rows, key) => rows.reduce((acc, r) => {
  (acc[r[key]] ??= []).push(r);
  return acc;
}, Object.create(null));

const columnsByTable = group(inventory.columns, 'table_name');
const pkByTable = group(inventory.primaryKeys, 'table_name');

const defaultKind = (value) => value === null ? null
  : /nextval/.test(value) ? 'sequence'
  : /gen_random_uuid|uuid_generate/.test(value) ? 'uuid'
  : /now\(\)|CURRENT_TIMESTAMP/i.test(value) ? 'now'
  : 'literal';

const report = {
  generatedAt: new Date().toISOString(),
  phase: 'A',
  status: 'INVENTORIED',
  sourceSafety: evidence,
  sourceWrites: 0,
  realCustomerRowsExported: 0,
  server: inventory.server,
  totals: {
    publicTables: inventory.tables.length,
    columns: inventory.columns.length,
    foreignKeys: inventory.foreignKeys.length,
    foreignKeysToAuthUsers: inventory.foreignKeys.filter(
      (f) => f.parent_schema === 'auth' && f.parent_table === 'users').length,
    uniqueConstraints: inventory.uniques.length,
    checkConstraints: inventory.checks.length,
    enums: inventory.enums.length,
    indexes: inventory.indexes.length,
    triggersTotal: inventory.triggers.length,
    userTriggers: inventory.triggers.filter((t) => !t.internal).length,
    functions: inventory.functions.length,
    securityDefinerFunctions: inventory.functions.filter((f) => f.security_definer).length,
    securityDefinerWithoutSearchPath: inventory.functions.filter(
      (f) => f.security_definer && !(f.config ?? '').includes('search_path')).length,
    policies: inventory.policies.length,
    publicPolicies: inventory.policies.filter((p) => p.schemaname === 'public').length,
    storagePolicies: inventory.policies.filter((p) => p.schemaname === 'storage').length,
    rlsEnabledTables: inventory.tables.filter((t) => t.rls_enabled).length,
    rlsForcedTables: inventory.tables.filter((t) => t.rls_forced).length,
    generatedColumns: inventory.columns.filter((c) => c.is_generated === 'ALWAYS').length,
    identityColumns: inventory.columns.filter((c) => c.is_identity === 'YES').length,
    sequences: inventory.sequences.length,
    storageBuckets: inventory.storageBuckets.length,
    authUsers: inventory.authUsersTotal,
  },
  decimalDomains: inventory.columns
    .filter((c) => ['numeric', 'decimal'].includes(c.data_type))
    .map((c) => ({ table: c.table_name, column: c.column_name,
      precision: c.numeric_precision, scale: c.numeric_scale,
      nullable: c.is_nullable === 'YES' })),
  floatDomains: inventory.columns
    .filter((c) => ['double precision', 'real'].includes(c.data_type))
    .map((c) => ({ table: c.table_name, column: c.column_name, type: c.data_type })),
  timestampDomains: inventory.columns
    .filter((c) => String(c.data_type).startsWith('timestamp'))
    .map((c) => ({ table: c.table_name, column: c.column_name,
      type: c.data_type, precision: c.datetime_precision })),
  jsonDomains: inventory.columns
    .filter((c) => ['json', 'jsonb'].includes(c.data_type))
    .map((c) => ({ table: c.table_name, column: c.column_name, type: c.data_type })),
  arrayDomains: inventory.columns
    .filter((c) => c.data_type === 'ARRAY')
    .map((c) => ({ table: c.table_name, column: c.column_name, udt: c.udt_name })),
  tables: inventory.tables.map((t) => ({
    name: t.name,
    rlsEnabled: t.rls_enabled,
    rlsForced: t.rls_forced,
    estimatedRows: inventory.rowCounts.find((r) => r.table_name === t.name)?.estimated_rows ?? '0',
    primaryKey: (pkByTable[t.name] ?? []).map((p) => p.column_name),
    columns: (columnsByTable[t.name] ?? []).map((c) => ({
      name: c.column_name, type: c.data_type, udt: c.udt_name,
      nullable: c.is_nullable === 'YES',
      defaultKind: defaultKind(c.column_default),
      numericPrecision: c.numeric_precision, numericScale: c.numeric_scale,
      datetimePrecision: c.datetime_precision, maxLength: c.character_maximum_length,
      generated: c.is_generated === 'ALWAYS', identity: c.is_identity === 'YES',
    })),
    foreignKeys: inventory.foreignKeys.filter((f) => f.child_table === t.name).map((f) => ({
      name: f.name, columns: f.child_columns,
      parent: `${f.parent_schema}.${f.parent_table}`, parentColumns: f.parent_columns,
      onDelete: DELETE_ACTION[f.on_delete], validated: f.validated,
    })),
    uniques: inventory.uniques.filter((u) => u.table_name === t.name)
      .map((u) => ({ name: u.name, columns: u.columns })),
    checks: inventory.checks.filter((c) => c.table_name === t.name)
      .map((c) => ({ name: c.name, definition: c.definition })),
    userTriggers: inventory.triggers.filter((g) => g.table_name === t.name && !g.internal)
      .map((g) => ({ name: g.name, function: g.function_name })),
    policies: inventory.policies.filter((p) => p.schemaname === 'public' && p.tablename === t.name)
      .map((p) => ({ name: p.policyname, cmd: p.cmd, roles: p.roles,
        using: p.qual, withCheck: p.with_check })),
  })),
  enums: inventory.enums,
  functions: inventory.functions.map((f) => ({
    name: f.name, arguments: f.arguments, returns: f.returns,
    securityDefiner: f.security_definer,
    volatility: VOLATILITY[f.volatility],
    pinnedSearchPath: (f.config ?? '').includes('search_path'),
  })),
  storage: {
    buckets: inventory.storageBuckets,
    objectCounts: inventory.storageObjectCounts,
    policies: inventory.policies.filter((p) => p.schemaname === 'storage')
      .map((p) => ({ table: p.tablename, name: p.policyname, cmd: p.cmd })),
  },
  foreignKeys: inventory.foreignKeys.map((f) => ({
    name: f.name, child: `${f.child_schema}.${f.child_table}`, childColumns: f.child_columns,
    parent: `${f.parent_schema}.${f.parent_table}`, parentColumns: f.parent_columns,
    onDelete: DELETE_ACTION[f.on_delete],
  })),
};

writeReport('migration/reports/firestore-source-domain-inventory.json',
  JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  status: report.status,
  sourceWrites: report.sourceWrites,
  transactionOutcome: evidence.transactionOutcome,
  ...report.totals,
}, null, 2));
