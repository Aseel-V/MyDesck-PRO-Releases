import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'mydesck-database-contracts-'));
const outfile = join(directory, 'database-contract-tests.mjs');

try {
  await build({
    entryPoints: ['scripts/database-contract-tests.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
  });
  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
