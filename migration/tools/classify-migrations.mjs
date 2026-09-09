#!/usr/bin/env node
/**
 * Phase 3 — classify every migration for Cloud SQL portability.
 *
 * Read-only static analysis. Emits migration/reports/portability.json and a
 * table on stdout.
 *
 * Classes:
 *   PORTABLE            runs unchanged on stock PostgreSQL 17
 *   PORTABLE_WITH_SHIM  runs once the auth/storage compatibility layer exists
 *   SUPABASE_SPECIFIC   depends on Supabase-managed infrastructure; needs rework
 *   BLOCKED             cannot run on Cloud SQL without a decision from a human
 *
 * A migration is only PORTABLE if it trips no marker at all. This is deliberately
 * pessimistic: a false "portable" is far more expensive than a false "shim".
 *
 *   node migration/tools/classify-migrations.mjs
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const OUT = 'migration/reports/portability.json';

/**
 * Markers. `class` is the severity this marker forces.
 * Ordered most-severe first so the summary reads sensibly.
 */
const MARKERS = [
  // --- BLOCKED: Supabase-managed infrastructure with no Cloud SQL analogue ---
  {
    id: 'storage_objects',
    class: 'BLOCKED',
    re: /\bstorage\.(objects|buckets|foldername)\b/gi,
    why: 'Supabase models object storage as Postgres tables with RLS. Cloud Storage has no equivalent; these policies must be re-expressed as Security Rules or backend-signed access.',
  },
  {
    id: 'supabase_realtime',
    class: 'BLOCKED',
    re: /supabase_realtime|ALTER PUBLICATION/gi,
    why: 'Supabase Realtime publication. No Cloud SQL analogue.',
  },
  {
    id: 'vault_schema',
    class: 'BLOCKED',
    re: /\bvault\./gi,
    why: 'Supabase Vault. Replace with Google Secret Manager.',
  },

  // --- SUPABASE_SPECIFIC: fixable, but needs deliberate rework ---
  {
    id: 'supabase_admin_role',
    class: 'SUPABASE_SPECIFIC',
    re: /\bsupabase_admin\b/gi,
    why: 'References the Supabase superuser role by name. Cloud SQL has no supabase_admin; the Phase 1 trigger guards test current_user against it.',
  },
  {
    id: 'extensions_schema',
    class: 'SUPABASE_SPECIFIC',
    re: /WITH SCHEMA extensions|\bextensions\.[a-z_]+\(/gi,
    why: 'Supabase installs extensions into a dedicated "extensions" schema. Cloud SQL installs into public (or a schema you create).',
  },
  {
    id: 'graphql',
    class: 'SUPABASE_SPECIFIC',
    re: /graphql_public|pg_graphql/gi,
    why: 'Supabase pg_graphql. Not available on Cloud SQL.',
  },

  // --- PORTABLE_WITH_SHIM: works once the compat layer is installed ---
  {
    id: 'auth_users_fk',
    class: 'PORTABLE_WITH_SHIM',
    re: /REFERENCES\s+auth\.users\s*\(/gi,
    why: 'FK to the Supabase-owned auth.users table. Requires the application-owned auth.users shim to exist first (migration/sql/001).',
  },
  {
    id: 'auth_uid',
    class: 'PORTABLE_WITH_SHIM',
    re: /auth\.uid\(\)/g,
    why: 'Requires the auth.uid() compatibility function backed by transaction-local state (migration/sql/001).',
  },
  {
    id: 'auth_role',
    class: 'PORTABLE_WITH_SHIM',
    re: /auth\.role\(\)/g,
    why: 'Requires the auth.role() compatibility function (migration/sql/001).',
  },
  {
    id: 'auth_users_read',
    class: 'PORTABLE_WITH_SHIM',
    re: /FROM\s+auth\.users|JOIN\s+auth\.users/gi,
    why: 'Reads auth.users directly. Satisfied by the shim table, but the columns it selects must exist there.',
  },
  {
    id: 'supabase_roles',
    class: 'PORTABLE_WITH_SHIM',
    re: /\b(?:TO|FROM)\s+(?:[a-z_, ]*\b)?(authenticated|anon|service_role)\b/gi,
    why: 'Grants to Supabase role names. Portable once roles of the same name are created in Cloud SQL — required, because Phase 1 guards compare current_user against them.',
  },
];

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const SEVERITY = { PORTABLE: 0, PORTABLE_WITH_SHIM: 1, SUPABASE_SPECIFIC: 2, BLOCKED: 3 };
const results = [];

for (const name of files) {
  const text = readFileSync(join(DIR, name), 'utf8');
  // Strip line and block comments so a marker mentioned in prose does not
  // misclassify an otherwise clean migration.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

  const hits = [];
  for (const m of MARKERS) {
    const n = (code.match(m.re) || []).length;
    if (n > 0) hits.push({ id: m.id, class: m.class, count: n, why: m.why });
  }

  const cls = hits.length
    ? hits.reduce((a, h) => (SEVERITY[h.class] > SEVERITY[a] ? h.class : a), 'PORTABLE')
    : 'PORTABLE';

  results.push({
    file: name,
    classification: cls,
    lines: text.split('\n').length,
    markers: hits.sort((a, b) => SEVERITY[b.class] - SEVERITY[a.class] || b.count - a.count),
  });
}

const summary = { PORTABLE: 0, PORTABLE_WITH_SHIM: 0, SUPABASE_SPECIFIC: 0, BLOCKED: 0 };
results.forEach((r) => summary[r.classification]++);

// Which markers drive the most files — this is the shim backlog, ordered.
const markerFileCounts = {};
for (const r of results) {
  for (const m of r.markers) {
    markerFileCounts[m.id] ??= { class: m.class, files: 0, occurrences: 0, why: m.why };
    markerFileCounts[m.id].files++;
    markerFileCounts[m.id].occurrences += m.count;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  note: 'Static analysis only. A PORTABLE classification is a hypothesis until the migration actually runs against PostgreSQL 17; see migration/tools/verify-portability.mjs.',
  totalMigrations: files.length,
  summary,
  markers: Object.fromEntries(
    Object.entries(markerFileCounts).sort((a, b) => b[1].files - a[1].files)
  ),
  migrations: results,
};

mkdirSync('migration/reports', { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`[portability] ${files.length} migrations classified -> ${OUT}\n`);
for (const [k, v] of Object.entries(summary)) {
  console.log(`  ${k.padEnd(20)} ${String(v).padStart(3)}`);
}
console.log('\n  marker                   class                 files  occurrences');
console.log('  ' + '-'.repeat(68));
for (const [id, v] of Object.entries(report.markers)) {
  console.log(
    `  ${id.padEnd(24)} ${v.class.padEnd(20)} ${String(v.files).padStart(5)} ${String(v.occurrences).padStart(12)}`
  );
}

const blocked = results.filter((r) => r.classification === 'BLOCKED');
if (blocked.length) {
  console.log('\n  BLOCKED migrations:');
  for (const b of blocked) {
    console.log(`    ${b.file}  [${b.markers.filter((m) => m.class === 'BLOCKED').map((m) => m.id).join(', ')}]`);
  }
}

const supaSpecific = results.filter((r) => r.classification === 'SUPABASE_SPECIFIC');
if (supaSpecific.length) {
  console.log('\n  SUPABASE_SPECIFIC migrations:');
  for (const b of supaSpecific) {
    console.log(`    ${b.file}  [${b.markers.filter((m) => m.class === 'SUPABASE_SPECIFIC').map((m) => m.id).join(', ')}]`);
  }
}
