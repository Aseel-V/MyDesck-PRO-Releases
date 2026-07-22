import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const entryPoint = process.argv[2];
if (!entryPoint) throw new Error('Usage: node scripts/run-typescript-source-test.mjs <test-entry.mjs>');

const directory = await mkdtemp(join(tmpdir(), 'mydesck-source-test-'));
const outfile = join(directory, 'test.mjs');

try {
  await build({
    entryPoints: [entryPoint],
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
    plugins: [{
      name: 'resolve-typescript-source',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\.\.\/src\/.*\.js$/ }, (args) => {
          const typescriptPath = resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
          if (!existsSync(typescriptPath)) return null;
          return { path: typescriptPath };
        });
      },
    }],
    absWorkingDir: resolve('.'),
    logLevel: 'warning',
  });
  await import(`${pathToFileURL(outfile).href}?entry=${encodeURIComponent(dirname(entryPoint))}&run=${Date.now()}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
