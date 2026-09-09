#!/usr/bin/env node
/**
 * Ordered runner for the migration proof harness.
 *
 * ORDER MATTERS AND IS NOT COSMETIC.
 *
 * identity-isolation.test.mjs begins with `DROP SCHEMA auth CASCADE` so it can
 * install a clean compatibility layer over its own minimal fixtures. That
 * cascade also drops every RLS policy whose expression calls auth.uid() —
 * which, on a replayed schema, is most of them. Running it before
 * security-posture.test.mjs leaves that suite testing a schema whose tenant
 * policies have silently disappeared, and it reports a confusing failure
 * ("A cannot see own trip") that looks like a migration defect but is not.
 *
 * So: replay, then the suite that needs the full schema, then the destructive
 * one, then replay again to leave the target in a known-good state.
 *
 *   PGURL=postgres://... node migration/tools/run-harness.mjs
 */

import { spawnSync } from 'node:child_process';

const PGURL = process.env.PGURL || process.env.DATABASE_URL;
if (!PGURL) {
  console.error('NOT RUN: no PGURL. The harness is UNPROVEN. Do not record a pass.');
  process.exit(2);
}

const STEPS = [
  ['verify target',        'migration/tools/verify-target.mjs'],
  ['replay 93 migrations', 'migration/tools/replay-migrations.mjs'],
  ['reconcile inventory',  'migration/tools/reconcile-inventory.mjs'],
  ['security posture',     'migration/tests/security-posture.test.mjs'],
  ['identity + isolation', 'migration/tests/identity-isolation.test.mjs'],  // destructive: last
  ['auth classify (offline)', 'migration/tests/auth-classify.test.mjs'],
  ['firebase safety guards', 'migration/tests/firebase-safety.test.mjs'],
  ['restore replayed schema', 'migration/tools/replay-migrations.mjs'],
];

const results = [];
for (const [label, script] of STEPS) {
  process.stdout.write(`\n${'='.repeat(70)}\n  ${label}\n${'='.repeat(70)}\n`);
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
  results.push({ label, script, code: r.status });
  if (r.status !== 0) {
    console.error(`\n  STEP FAILED: ${label} (exit ${r.status}) — stopping.`);
    break;
  }
}

console.log(`\n${'='.repeat(70)}\n  HARNESS SUMMARY\n${'='.repeat(70)}`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? 'PASS' : r.code === 2 ? 'NOT RUN' : 'FAIL'}  ${r.label}`);
}
const failed = results.filter((r) => r.code !== 0);
const skipped = STEPS.length - results.length;
if (skipped) console.log(`  ${skipped} step(s) not reached.`);
console.log('');
process.exit(failed.length ? 1 : 0);
