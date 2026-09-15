import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Production source connections.
 *
 * Every tool that connects to the production database must verify its TLS certificate, and a tool may report
 * `isolationLevel: 'repeatable read'` only if the shared snapshot helper (migration/tools/lib/staging-source.mjs)
 * started that isolation and read it back from the server: production-guard.mjs trusts the reported value. The
 * live inventories behind the staged gates read production only through that helper.
 */
const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.endsWith('.local')) walk(path);
    } else if (entry.name.endsWith('.mjs')) files.push(path);
  }
};
walk('migration');
const source = (file) => readFileSync(file, 'utf8');

test('no migration tool disables TLS certificate verification', () => {
  assert.ok(files.length > 50, 'the scan found the migration tools');
  assert.deepEqual(files.filter((file) => /rejectUnauthorized\s*:\s*false/.test(source(file))), []);
});

test('a tool that reports repeatable read obtains it from the snapshot helper', () => {
  const tools = files.filter((file) => /\/tools\//.test(file) && file !== 'migration/tools/lib/staging-source.mjs');
  const offenders = tools.filter((file) => /isolationLevel\s*:\s*['"]repeatable read['"]/i.test(source(file))
    && !/withSourceSnapshot\s*\(/.test(source(file)));
  assert.deepEqual(offenders, []);
});

test('the live inventories read production only through the snapshot helper', () => {
  for (const file of ['migration/firestore/tools/live-vertical-inventory.mjs', 'migration/firestore/tools/restaurant-staff-inventory.mjs']) {
    const text = source(file);
    assert.match(text, /withSourceSnapshot\(localConfig\(\)/, file);
    assert.doesNotMatch(text, /new pg\.Client|from 'pg'/, file);
    assert.doesNotMatch(text, /BEGIN TRANSACTION READ ONLY/, file);
  }
});
