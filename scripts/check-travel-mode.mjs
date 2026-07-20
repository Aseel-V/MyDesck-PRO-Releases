import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'mydesck-travel-tests-'));
const outfile = join(directory, 'tests.mjs');

try {
  await build({
    entryPoints: ['scripts/travel-mode-tests.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    define: {
      'import.meta.env': JSON.stringify({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-public-anon-key-for-static-unit-tests',
        DEV: false,
        MODE: 'test',
      }),
    },
    logLevel: 'warning',
  });
  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
