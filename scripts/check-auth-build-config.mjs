import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const modes = new Set(process.argv.slice(2));
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

const validatePublicConfig = () => {
  assert.ok(supabaseUrl, 'VITE_SUPABASE_URL is required for production authentication');
  assert.ok(supabaseKey, 'VITE_SUPABASE_ANON_KEY is required for production authentication');

  const parsedUrl = new URL(supabaseUrl);
  assert.equal(parsedUrl.protocol, 'https:', 'Supabase production URL must use HTTPS');
  assert.ok(!['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname));
  assert.ok(!parsedUrl.hostname.includes('placeholder'));
  assert.ok(!supabaseKey.includes('placeholder'));
  assert.ok(!supabaseKey.startsWith('sb_secret_'), 'A Supabase secret key must never be bundled');

  if (supabaseKey.startsWith('eyJ')) {
    const payload = JSON.parse(Buffer.from(supabaseKey.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(payload.role, 'anon', 'Only the public Supabase anon key may be bundled');
  } else {
    assert.match(supabaseKey, /^sb_publishable_/, 'Expected a public Supabase publishable key');
  }
};

const collectJavaScript = (directory) => readdirSync(directory).flatMap((entry) => {
  const path = resolve(directory, entry);
  return statSync(path).isDirectory()
    ? collectJavaScript(path)
    : path.endsWith('.js')
      ? [path]
      : [];
});

if (modes.has('--env')) {
  validatePublicConfig();
  console.log('Production authentication environment configuration is valid.');
}

if (modes.has('--dist')) {
  validatePublicConfig();

  const assetsDirectory = resolve('dist', 'assets');
  const bundle = collectJavaScript(assetsDirectory)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  assert.ok(bundle.includes(supabaseUrl), 'Production bundle is missing the configured Supabase URL');
  assert.ok(bundle.includes(supabaseKey), 'Production bundle is missing the public Supabase key');
  assert.ok(!bundle.includes('https://placeholder.supabase.co'));
  assert.ok(!bundle.includes('placeholder-key'));
  assert.ok(!bundle.includes('sb_secret_'), 'Production bundle contains a Supabase secret key marker');

  console.log('Production authentication bundle configuration is valid.');
}

assert.ok(modes.has('--env') || modes.has('--dist'), 'Use --env or --dist');
