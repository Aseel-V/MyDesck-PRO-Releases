#!/usr/bin/env node
/**
 * Storage identity wiring.
 *
 * These are source-level assertions rather than runtime ones because the defect they guard
 * against was invisible to both `tsc` and the runtime tests: the repository's uid parameter
 * defaulted to `null`, and every private call site constructs it with no argument, so
 * `readPrivateFile` and `uploadPrivateFile` threw `PRIVATE_PATH_DENIED` unconditionally. A
 * default-valued parameter type-checks perfectly while being wrong.
 *
 *   node --test migration/firestore/tests/storage-identity.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const repository = readFileSync('src/data/SupabaseStorageRepository.ts', 'utf8');
const client = readFileSync('src/data/supabaseStorageClient.ts', 'utf8');
const bootstrap = readFileSync('src/data/storageIdentity.ts', 'utf8');
const images = readFileSync('src/lib/businessImages.ts', 'utf8');

test('the repository resolves an identity instead of defaulting to none', () => {
  // The exact shape that was broken: `= null` as the constructor default.
  assert.doesNotMatch(repository, /constructor\([^)]*uid[^)]*=\s*null\s*\)/,
    'a null-defaulting uid makes every private call fail closed at call sites that pass nothing');
  assert.match(repository, /getStorageIdentityUid\(\)/,
    'the repository must fall back to the registered identity');
  assert.match(repository, /uid === undefined \? getStorageIdentityUid\(\) : uid/,
    'an explicitly passed null must still mean "no identity", so only undefined falls back');
});

test('private paths remain namespaced by the owner uid', () => {
  assert.match(repository, /path\.startsWith\(`\$\{this\.uid\}\/`\)/,
    'private objects live under {uid}/, matching the Storage RLS folder predicate');
  assert.match(repository, /path\.includes\('\.\.'\)/, 'traversal is rejected');
});

test('the storage client carries an identity alongside the token', () => {
  assert.match(client, /setStorageIdentityUidProvider/);
  assert.match(client, /export function getStorageIdentityUid\(\)/);
  // Failing closed is correct as a default; the bug was that nothing ever registered one.
  assert.match(client, /let identity: IdentityUidProvider = \(\) => null;/);
});

test('the composition root registers both token and uid from one source', () => {
  assert.match(bootstrap, /setStorageAccessTokenProvider/);
  assert.match(bootstrap, /setStorageIdentityUidProvider/);
  assert.match(bootstrap, /onAuthStateChange/,
    'the uid must track sign-in and sign-out, not just the first read');
  assert.match(bootstrap, /setStorageIdentityUidProvider\(getUid\)/,
    'the Firebase path must supply a uid too, or it reintroduces the same defect at cutover');
});

test('signature reads go through the private repository, never a public URL', () => {
  assert.match(images, /ref\.bucket === 'business-signatures'/);
  assert.match(images, /readPrivateFile\(ref\.path\)/);
  assert.match(repository, /SIGNATURES_ARE_NEVER_PUBLIC/);
  assert.doesNotMatch(images, /getPublicUrl/);
});
