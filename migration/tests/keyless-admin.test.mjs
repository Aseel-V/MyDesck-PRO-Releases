import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertProofCredentials, lookupOrAbsent, MIGRATION_ACCOUNT } from '../tools/lib/keyless-admin.mjs';

// Credential-source fixtures contain discriminators only, never usable secrets.
const directory = mkdtempSync(join(tmpdir(), 'mydesck-adc-proof-test-'));
const env = { CLOUDSDK_CONFIG: directory, GOOGLE_CLOUD_PROJECT: 'mydesckpro', FIREBASE_PROJECT_ID: 'mydesckpro' };
const fixture = (type, account = MIGRATION_ACCOUNT) => writeFileSync(
  join(directory, 'application_default_credentials.json'), JSON.stringify({ type,
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
  }));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok    ${name}`); };
try {
  await test('missing ADC fails before SDK initialization', () => {
    assert.throws(() => assertProofCredentials(env), { code: 'ADC_NOT_READY' });
  });
  fixture('impersonated_service_account');
  await test('intended keyless impersonation passes credential-source gate', () => {
    assert.equal(assertProofCredentials(env).summary.impersonatedServiceAccount, MIGRATION_ACCOUNT);
  });
  await test('GAC override is refused even when the default ADC is valid', () => {
    assert.throws(() => assertProofCredentials({ ...env, GOOGLE_APPLICATION_CREDENTIALS: 'do-not-open.json' }), /DEFAULT_ADC/);
  });
  await test('emulator cannot masquerade as a real Firebase proof', () => {
    assert.throws(() => assertProofCredentials({ ...env, FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }), /REAL_FIREBASE/);
  });
  await test('a different Firebase project is refused', () => {
    assert.throws(() => assertProofCredentials({ ...env, FIREBASE_PROJECT_ID: 'other' }), { code: 'ADC_NOT_READY' });
  });
  await test('a different service account is refused', () => {
    fixture('impersonated_service_account', 'other@mydesckpro.iam.gserviceaccount.com');
    assert.throws(() => assertProofCredentials(env), /MIGRATION_SERVICE_ACCOUNT/);
  });
  await test('a static ADC key is refused', () => {
    fixture('service_account');
    assert.throws(() => assertProofCredentials(env), { code: 'ADC_NOT_READY' });
  });
  await test('plain user credentials cannot replace the approved impersonation', () => {
    fixture('authorized_user');
    assert.throws(() => assertProofCredentials(env), /MIGRATION_SERVICE_ACCOUNT/);
  });
  await test('only user-not-found means an identity is absent', async () => {
    assert.equal(await lookupOrAbsent(async () => { throw { code: 'auth/user-not-found' }; }), null);
  });
  await test('permission, network and unknown failures never authorize creation', async () => {
    for (const code of ['auth/insufficient-permission', 'ECONNRESET', 'auth/internal-error']) {
      await assert.rejects(lookupOrAbsent(async () => { throw Object.assign(new Error('redacted'), { code }); }), { code });
    }
  });
  await test('existing identity is retained as a collision, never treated as absent', async () => {
    const existing = { uid: 'existing-user' };
    assert.equal(await lookupOrAbsent(async () => existing), existing);
  });
} finally {
  // mkdtemp owns this exact directory; never a caller-provided path.
  rmSync(directory, { recursive: true, force: true });
}
console.log(`\n[keyless-admin] ${passed} passed, 0 failed`);
