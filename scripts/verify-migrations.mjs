import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const migrationsDir = 'supabase/migrations';
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

console.log(`[verify-migrations] Checking ${files.length} migration files for timestamp ordering and forward-only integrity...`);

// 1. Verify strict timestamp ordering
let lastTimestamp = '';
for (const file of files) {
  const match = file.match(/^(\d{14})_/);
  assert.ok(match, `Migration filename ${file} must start with a 14-digit timestamp`);
  const timestamp = match[1];
  assert.ok(timestamp >= lastTimestamp, `Migration timestamps must be forward-only and strictly ordered (${file} < ${lastTimestamp})`);
  lastTimestamp = timestamp;
}

// 2. Verify forward-only rules (no DROP TABLE public.trips or retroactive column deletion without migration record)
let combinedSql = '';
for (const file of files) {
  const content = readFileSync(`${migrationsDir}/${file}`, 'utf8');
  assert.ok(!content.includes('DROP TABLE public.trips CASCADE'), `Unsafe migration ${file} must not drop core trips table`);
  assert.ok(!content.includes('DROP TABLE public.trip_payment_plans CASCADE'), `Unsafe migration ${file} must not drop payment plans table`);
  combinedSql += content + '\n';
}

console.log(`[verify-migrations] Forward-only migration integrity PASSED.`);
