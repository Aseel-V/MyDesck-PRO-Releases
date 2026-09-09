#!/usr/bin/env node
/**
 * Phase 1 — Supabase dependency inventory (machine readable).
 *
 * Read-only. Parses the repository at HEAD and emits JSON to
 * migration/reports/inventory.json plus a short human summary on stdout.
 *
 * This exists so the migration is planned against CURRENT code rather than a
 * stale report. Re-run it before every migration stage; a diff in these numbers
 * means the migration plan needs revisiting.
 *
 *   node migration/tools/build-inventory.mjs
 *   node migration/tools/build-inventory.mjs --check   # non-zero exit on drift
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = 'supabase/migrations';
const FUNCTIONS_DIR = 'supabase/functions';
const OUT = 'migration/reports/inventory.json';

// ---------------------------------------------------------------- file walking

function walk(dir, exts, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full, exts, acc);
    } else if (exts.some((e) => entry.endsWith(e))) {
      acc.push(full.split('\\').join('/'));
    }
  }
  return acc;
}

const srcFiles = walk('src', ['.ts', '.tsx']);
const srcBlobs = srcFiles.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

const migrationFiles = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  : [];
const migrationBlobs = migrationFiles.map((f) => ({
  file: `${MIGRATIONS_DIR}/${f}`,
  name: f,
  text: readFileSync(join(MIGRATIONS_DIR, f), 'utf8'),
}));
const allSql = migrationBlobs.map((m) => m.text).join('\n');

// ---------------------------------------------------------------- helpers

/** Every match of `re` across src, with file + 1-based line. */
function scanSrc(re) {
  const hits = [];
  for (const { file, text } of srcBlobs) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(re)) {
        hits.push({ file, line: i + 1, match: m[1] ?? m[0] });
      }
    }
  }
  return hits;
}

const countAll = (text, re) => (text.match(re) || []).length;
const uniq = (xs) => [...new Set(xs)].sort();

function tally(hits) {
  const out = {};
  for (const h of hits) out[h.match] = (out[h.match] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

// ---------------------------------------------------------------- client surface

const authHits = scanSrc(/supabase\.auth\.([a-zA-Z]+)/g);
const tableHits = scanSrc(/\.from\('([a-z_]+)'\)/g);
const rpcHits = scanSrc(/\.rpc\('([a-z_]+)'/g);
const storageHits = scanSrc(/storage\.from\('([a-z-]+)'\)/g);
const invokeHits = scanSrc(/functions\.invoke\('([a-z-]+)'/g);
const realtimeHits = scanSrc(/\.channel\(([^)]*)\)/g);

// Which tables are written vs only read, so Phase 17 can classify each path.
const writeOps = /\.(insert|update|upsert|delete)\s*\(/;
const tableAccess = {};
for (const { file, text } of srcBlobs) {
  for (const m of text.matchAll(/\.from\('([a-z_]+)'\)([\s\S]{0,240})/g)) {
    const t = m[1];
    tableAccess[t] ??= { reads: 0, writes: 0, files: new Set() };
    tableAccess[t].files.add(file);
    if (writeOps.test(m[2])) tableAccess[t].writes++;
    else tableAccess[t].reads++;
  }
}
const tableAccessOut = Object.fromEntries(
  Object.entries(tableAccess)
    .sort((a, b) => b[1].reads + b[1].writes - (a[1].reads + a[1].writes))
    .map(([t, v]) => [t, { reads: v.reads, writes: v.writes, files: [...v.files].sort() }])
);

// ---------------------------------------------------------------- SQL surface

// CREATE TABLE blocks -> columns + FK edges.
const tableBlocks = [...allSql.matchAll(
  /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z_."]+)\s*\(([\s\S]*?)\n\)\s*;/gi
)];
const tables = {};
for (const [, rawName, body] of tableBlocks) {
  const name = rawName.replace(/"/g, '').replace(/^public\./, '').toLowerCase();
  tables[name] ??= { references: new Set(), generated: [], identity: [], serial: [] };
  for (const m of body.matchAll(/REFERENCES\s+([a-zA-Z_."]+)\s*\(/gi)) {
    const tgt = m[1].replace(/"/g, '').replace(/^public\./, '').toLowerCase();
    if (tgt !== name) tables[name].references.add(tgt);
  }
  for (const m of body.matchAll(/^\s*([a-z_]+)[^,]*GENERATED ALWAYS AS \(/gim)) {
    tables[name].generated.push(m[1]);
  }
  for (const m of body.matchAll(/^\s*([a-z_]+)[^,]*GENERATED ALWAYS AS IDENTITY/gim)) {
    tables[name].identity.push(m[1]);
  }
  for (const m of body.matchAll(/^\s*([a-z_]+)\s+(?:big|small)?serial\b/gim)) {
    tables[name].serial.push(m[1]);
  }
}

// Topological tiers from the FK graph (auth.users is tier 0, external).
const appTables = Object.keys(tables).filter((t) => !t.includes('.'));
const tier = {};
function resolveTier(t, seen = new Set()) {
  if (tier[t] !== undefined) return tier[t];
  if (seen.has(t)) return 1; // defensive; no true cycles observed
  seen.add(t);
  const deps = [...(tables[t]?.references ?? [])].filter((d) => appTables.includes(d));
  tier[t] = deps.length === 0 ? 1 : 1 + Math.max(...deps.map((d) => resolveTier(d, seen)));
  return tier[t];
}
appTables.forEach((t) => resolveTier(t));
const tiers = {};
for (const t of appTables) (tiers[tier[t]] ??= []).push(t);
Object.values(tiers).forEach((a) => a.sort());

// RLS / policies / functions / triggers.
const rlsEnabled = uniq(
  [...allSql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?([a-zA-Z_."]+)\s+ENABLE ROW LEVEL SECURITY/gi)]
    .map((m) => m[1].replace(/"/g, '').replace(/^public\./, '').toLowerCase())
);
const forceRls = uniq(
  [...allSql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?([a-zA-Z_."]+)\s+FORCE ROW LEVEL SECURITY/gi)]
    .map((m) => m[1].replace(/"/g, '').replace(/^public\./, '').toLowerCase())
);

// SECURITY DEFINER functions with search_path posture.
const funcRe = /CREATE (?:OR REPLACE )?FUNCTION\s+([a-zA-Z_."]+)\s*\(/gi;
const functions = {};
for (const { name: file, text } of migrationBlobs) {
  for (const m of text.matchAll(funcRe)) {
    const fname = m[1].replace(/"/g, '').replace(/^public\./, '').toLowerCase();
    const head = text.slice(m.index, m.index + 700);
    const bodyEnd = text.indexOf('$$;', m.index);
    const body = bodyEnd > 0 ? text.slice(m.index, bodyEnd) : head;
    functions[fname] = {
      definedIn: file,
      securityDefiner: /SECURITY\s+DEFINER/i.test(head),
      searchPath: (head.match(/SET\s+search_path\s*=\s*([^\n]*)/i) || [, null])[1]?.trim() ?? null,
      usesAuthUid: /auth\.uid\(\)/.test(body),
    };
  }
}

const storageBuckets = uniq(
  [...allSql.matchAll(/'([a-z-]+)'\s*,\s*'\1'\s*,\s*(?:true|false)/g)].map((m) => m[1])
);

// ---------------------------------------------------------------- edge functions

const edgeFunctions = existsSync(FUNCTIONS_DIR)
  ? readdirSync(FUNCTIONS_DIR)
      .filter((d) => statSync(join(FUNCTIONS_DIR, d)).isDirectory())
      .map((d) => {
        const files = readdirSync(join(FUNCTIONS_DIR, d));
        const code = files
          .filter((f) => f.endsWith('.ts'))
          .map((f) => readFileSync(join(FUNCTIONS_DIR, d, f), 'utf8'))
          .join('\n');
        return {
          name: d,
          files: files.length,
          empty: files.length === 0,
          verifiesCaller: /auth\.getUser\(/.test(code),
          usesServiceRole: /SERVICE_ROLE/.test(code),
          verifyJwtConfigured: existsSync('supabase/config.toml')
            ? new RegExp(`\\[functions\\.${d}\\][\\s\\S]{0,120}verify_jwt\\s*=\\s*true`).test(
                readFileSync('supabase/config.toml', 'utf8')
              )
            : false,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  : [];

// ---------------------------------------------------------------- assemble

const inventory = {
  generatedAt: new Date().toISOString(),
  note: 'Read-only static inventory of the repository. No database or network access.',
  source: {
    migrationCount: migrationFiles.length,
    migrationSqlLines: allSql.split('\n').length,
    srcFileCount: srcFiles.length,
  },
  client: {
    auth: { total: authHits.length, methods: tally(authHits), sites: authHits },
    tables: {
      distinct: Object.keys(tableAccessOut).length,
      totalCallSites: tableHits.length,
      access: tableAccessOut,
    },
    rpc: { distinct: uniq(rpcHits.map((h) => h.match)).length, totalCallSites: rpcHits.length, names: uniq(rpcHits.map((h) => h.match)), sites: rpcHits },
    storage: { buckets: uniq(storageHits.map((h) => h.match)), totalCallSites: storageHits.length, sites: storageHits },
    edgeInvocations: { functions: uniq(invokeHits.map((h) => h.match)), sites: invokeHits },
    realtime: { totalCallSites: realtimeHits.length, sites: realtimeHits },
  },
  database: {
    tables: {
      count: appTables.length,
      tiers: Object.fromEntries(Object.entries(tiers).sort((a, b) => +a[0] - +b[0])),
      references: Object.fromEntries(appTables.map((t) => [t, [...tables[t].references].sort()])),
    },
    authUsersFkCount: countAll(allSql, /REFERENCES\s+auth\.users\s*\(/gi),
    authUidCallSites: countAll(allSql, /auth\.uid\(\)/g),
    authRoleCallSites: countAll(allSql, /auth\.role\(\)/g),
    policyCount: countAll(allSql, /CREATE POLICY/gi),
    triggerCount: countAll(allSql, /CREATE TRIGGER/gi),
    functionDefinitions: countAll(allSql, /CREATE (?:OR REPLACE )?FUNCTION/gi),
    distinctFunctions: Object.keys(functions).length,
    securityDefinerFunctions: Object.values(functions).filter((f) => f.securityDefiner).length,
    securityDefinerWithoutSearchPath: Object.entries(functions)
      .filter(([, f]) => f.securityDefiner && !f.searchPath)
      .map(([n]) => n)
      .sort(),
    rlsEnabledTables: rlsEnabled.length,
    forceRlsTables: forceRls,
    generatedColumns: Object.fromEntries(
      Object.entries(tables).filter(([, v]) => v.generated.length).map(([k, v]) => [k, uniq(v.generated)])
    ),
    identityColumns: Object.fromEntries(
      Object.entries(tables).filter(([, v]) => v.identity.length).map(([k, v]) => [k, uniq(v.identity)])
    ),
    serialColumns: Object.fromEntries(
      Object.entries(tables).filter(([, v]) => v.serial.length).map(([k, v]) => [k, uniq(v.serial)])
    ),
    extensions: uniq(
      [...allSql.matchAll(/CREATE EXTENSION(?:\s+IF NOT EXISTS)?\s+"?([a-zA-Z_-]+)"?/gi)].map((m) =>
        m[1].toLowerCase()
      )
    ),
    supabaseRoleReferences: {
      authenticated: countAll(allSql, /\bauthenticated\b/g),
      anon: countAll(allSql, /\banon\b/g),
      service_role: countAll(allSql, /\bservice_role\b/g),
      supabase_admin: countAll(allSql, /\bsupabase_admin\b/g),
    },
    storageObjectPolicyReferences: countAll(allSql, /storage\.objects/g),
    storageBucketsDeclared: storageBuckets,
    functions,
  },
  edgeFunctions,
};

mkdirSync('migration/reports', { recursive: true });

// --check compares against the committed inventory, ignoring the timestamp.
if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error(`FAIL: ${OUT} does not exist. Run without --check first.`);
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(OUT, 'utf8'));
  const strip = (o) => JSON.stringify({ ...o, generatedAt: null });
  if (strip(prev) !== strip(inventory)) {
    console.error('FAIL: repository inventory has drifted from migration/reports/inventory.json.');
    console.error('The migration plan is based on that file. Re-run without --check and review the diff.');
    process.exit(1);
  }
  console.log('OK: inventory matches committed snapshot.');
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify(inventory, null, 2) + '\n', 'utf8');

const d = inventory.database;
const c = inventory.client;
console.log(`[inventory] written to ${OUT}`);
console.log('');
console.log(`  migrations ................ ${inventory.source.migrationCount}`);
console.log(`  application tables ........ ${d.tables.count} in ${Object.keys(d.tables.tiers).length} FK tiers`);
console.log(`  FKs to auth.users ......... ${d.authUsersFkCount}`);
console.log(`  auth.uid() call sites ..... ${d.authUidCallSites}`);
console.log(`  auth.role() call sites .... ${d.authRoleCallSites}`);
console.log(`  RLS policies .............. ${d.policyCount}`);
console.log(`  FORCE RLS tables .......... ${d.forceRlsTables.length}`);
console.log(`  function definitions ...... ${d.functionDefinitions} (${d.distinctFunctions} distinct)`);
console.log(`  SECURITY DEFINER .......... ${d.securityDefinerFunctions} (${d.securityDefinerWithoutSearchPath.length} without search_path)`);
console.log(`  triggers .................. ${d.triggerCount}`);
console.log(`  extensions ................ ${d.extensions.join(', ')}`);
console.log('');
console.log(`  client: tables ............ ${c.tables.distinct} distinct, ${c.tables.totalCallSites} call sites`);
console.log(`  client: RPCs .............. ${c.rpc.distinct} distinct, ${c.rpc.totalCallSites} call sites`);
console.log(`  client: auth .............. ${c.auth.total} call sites`);
console.log(`  client: storage ........... ${c.storage.buckets.length} buckets, ${c.storage.totalCallSites} call sites`);
console.log(`  client: realtime .......... ${c.realtime.totalCallSites} subscriptions`);
console.log(`  edge functions ............ ${inventory.edgeFunctions.filter((f) => !f.empty).length} with code, ${inventory.edgeFunctions.filter((f) => f.empty).length} empty dirs`);
