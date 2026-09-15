import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Removes every document and account the synthetic tenants produced. */
export default function globalTeardown() {
  const run = spawnSync(process.execPath, ['scripts/run-typescript-source-test.mjs', 'e2e/firebase/fixtures.mjs', '--cleanup'],
    { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8', env: process.env });
  if (run.status !== 0) throw new Error(`UI_SMOKE_FIXTURE_CLEANUP_FAILED\n${run.stdout}\n${run.stderr}`);
}
