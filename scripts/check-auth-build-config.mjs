import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Production build configuration gate.
 *
 * This used to validate the Supabase pair and nothing else, which was correct while Supabase was
 * the only backend and became wrong the moment a Firebase cutover build was possible: it would
 * happily pass a build that had no Firebase configuration at all, and the operator would only find
 * out when the app failed to start on a customer's machine.
 *
 * It now validates whichever backend the build actually selects, and `--require-firestore` lets the
 * cutover release assert its own intent. That flag is the fail-closed lever: a cutover build that
 * quietly fell back to Supabase mode — because one variable was missing or misspelled — is rejected
 * here instead of being published.
 *
 * The Supabase variables are still required in every mode. Storage is intentionally retained after
 * cutover and reached through StorageRepository with a Firebase ID token, so removing them would
 * break signatures and logos.
 */

const modes = new Set(process.argv.slice(2));
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Exactly what `src/data/backendMode.ts` demands of a real Firestore build. */
const FIRESTORE_SELECTOR = Object.freeze({
  VITE_DATA_BACKEND: 'firestore',
  VITE_FIREBASE_PROJECT_ID: 'mydesckpro',
  VITE_FIRESTORE_DATABASE_ID: 'default',
  VITE_FIRESTORE_PRODUCTION_RELEASE: 'mydesck-firestore-v1',
  VITE_SUPABASE_FALLBACK_DISABLED: 'true',
  VITE_FIREBASE_EXPECTED_PLAN: 'SPARK',
  VITE_FIREBASE_BILLING_ENABLED: 'false',
});
/** Read by `src/data/firebaseClient.ts`, and NOT checked by the selector. */
const FIREBASE_WEB_CONFIG = Object.freeze(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN']);

const backend = process.env.VITE_DATA_BACKEND?.trim() || 'supabase';
const wantsFirestore = backend === 'firestore';
const requireFirestore = modes.has('--require-firestore');

/** Supabase Storage configuration. Required in every mode, cutover included. */
const validateSupabaseConfig = () => {
  assert.ok(supabaseUrl, 'VITE_SUPABASE_URL is required (Storage is retained after cutover)');
  assert.ok(supabaseKey, 'VITE_SUPABASE_ANON_KEY is required (Storage is retained after cutover)');

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

/** Everything a Firebase/Firestore cutover build needs, checked against the selector's own rules. */
const validateFirestoreConfig = () => {
  for (const [name, expected] of Object.entries(FIRESTORE_SELECTOR)) {
    const actual = process.env[name]?.trim();
    assert.ok(actual, `${name} is required for a Firestore cutover build`);
    assert.equal(actual, expected, `${name} must be "${expected}" for a Firestore cutover build`);
  }
  for (const name of FIREBASE_WEB_CONFIG) {
    const actual = process.env[name]?.trim();
    assert.ok(actual, `${name} is required by src/data/firebaseClient.ts`);
    assert.ok(!actual.includes('placeholder'), `${name} must not be a placeholder`);
  }
  const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN.trim();
  assert.ok(authDomain.startsWith('mydesckpro.'),
    'VITE_FIREBASE_AUTH_DOMAIN must belong to the mydesckpro project');
  // A Firebase Web API key is a public client identifier, but a service-account private key or an
  // OAuth client secret in this slot would be a real leak, so the shape is checked.
  const apiKey = process.env.VITE_FIREBASE_API_KEY.trim();
  assert.match(apiKey, /^AIza[0-9A-Za-z_-]{20,}$/, 'VITE_FIREBASE_API_KEY is not a Firebase Web API key');
  assert.ok(!apiKey.includes('PRIVATE KEY') && !apiKey.startsWith('sb_secret_'));

  // The runtime backend must be Firestore only. Supabase stays for Storage, never for data or auth.
  assert.equal(process.env.VITE_SUPABASE_FALLBACK_DISABLED?.trim(), 'true',
    'Supabase database/auth fallback must be disabled in a cutover build');
};

const validatePublicConfig = () => {
  validateSupabaseConfig();
  if (requireFirestore) {
    assert.equal(backend, 'firestore',
      `--require-firestore was given but VITE_DATA_BACKEND is "${backend}"; refusing a build that `
      + 'would ship the Supabase backend under a cutover release');
  }
  if (wantsFirestore) validateFirestoreConfig();
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
  console.log(`Production environment configuration is valid (backend: ${backend}).`);
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
  // A service-account private key must never reach a client bundle, in any mode.
  assert.ok(!bundle.includes('BEGIN PRIVATE KEY'), 'Production bundle contains a private key');

  if (wantsFirestore) {
    // Vite inlines import.meta.env at build time, so the selector's inputs appear in the bundle as
    // literal constants. Asserting those is what proves the build will choose Firestore at runtime;
    // merely finding the word "mydesckpro" somewhere would prove nothing.
    for (const [name, expected] of Object.entries(FIRESTORE_SELECTOR)) {
      assert.ok(bundle.includes(`${name}:"${expected}"`),
        `Production bundle does not inline ${name}="${expected}"`);
    }
    assert.ok(bundle.includes('PROD:!0'), 'Production bundle is not built in production mode');
    assert.ok(bundle.includes('mydesck-firestore-v1'),
      'Production bundle is missing the approved Firestore release marker');
    assert.ok(bundle.includes(process.env.VITE_FIREBASE_AUTH_DOMAIN.trim()),
      'Production bundle is missing the Firebase auth domain');
    assert.ok(bundle.includes(process.env.VITE_FIREBASE_API_KEY.trim()),
      'Production bundle is missing the Firebase web API key');
    // The emulator project name IS present, and must be: `backendMode.ts` and `firebaseClient.ts`
    // both name it inside guards that throw in a production build (PRODUCTION_BACKEND_LOCKED,
    // EMULATOR_MODE_REQUIRED). Asserting its absence would be asserting that dead-but-required
    // guard code had been stripped, which is not what safety here depends on. What must not happen
    // is the emulator project being the *selected* one, and the inlined constants above settle that.
    assert.ok(!bundle.includes('VITE_FIREBASE_PROJECT_ID:"mydesck-migration-proof"'),
      'Production bundle selects the emulator project');
    console.log('Firestore cutover bundle configuration is valid.');
  }

  console.log('Production bundle configuration is valid.');
}

assert.ok(modes.has('--env') || modes.has('--dist'), 'Use --env or --dist');
