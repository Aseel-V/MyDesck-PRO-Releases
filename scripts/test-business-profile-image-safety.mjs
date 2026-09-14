/**
 * Settings image safety, as behaviour rather than source text.
 *
 * `profile.logo_url` and `profile.signature_url` are resolved for display: a private signature
 * becomes a `data:` URL, an object can become a `blob:` URL. Settings holds those display values in
 * form state, so a plain "Save business" hands them back. Writing them would replace the Storage
 * reference with an inline base64 payload and destroy the private-bucket model.
 *
 * The earlier guard for this was a regular expression over AuthContext. The function it pinned
 * spread the incoming updates first, so a display value still reached the write while the pattern
 * matched. These assertions call the sanitiser itself.
 *
 *   node scripts/run-typescript-source-test.mjs scripts/test-business-profile-image-safety.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { __testing } from '../src/contexts/AuthContext.tsx';

const { isResolvedDisplayValue, sanitizeBusinessProfileUpdates } = __testing;
const STORAGE = 'https://example.supabase.co/storage/v1/object';

test('display-only values are recognised regardless of case and leading whitespace', () => {
  for (const value of ['data:image/png;base64,AAAA', '  DATA:image/jpeg;base64,BBBB', 'blob:https://app/1234', 'Blob:null/abcd']) {
    assert.equal(isResolvedDisplayValue(value), true, value);
  }
  for (const value of [`${STORAGE}/public/logos/u/logo.png`, '', null, undefined, 42]) {
    assert.equal(isResolvedDisplayValue(value), false, String(value));
  }
});

test('a resolved data: signature is dropped from the update, never written', () => {
  const result = sanitizeBusinessProfileUpdates({
    business_name: 'Agency', signature_url: 'data:image/png;base64,iVBORw0KGgo=',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'signature_url'), false);
  assert.equal(result.business_name, 'Agency', 'unrelated fields still save');
});

test('a resolved blob: logo is dropped from the update, never written', () => {
  const result = sanitizeBusinessProfileUpdates({ logo_url: 'blob:https://app.local/uuid', preferred_currency: 'ILS' });
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'logo_url'), false);
  assert.equal(result.preferred_currency, 'ILS');
});

test('a genuine Storage reference is kept, in canonical authenticated form', () => {
  const result = sanitizeBusinessProfileUpdates({
    logo_url: `${STORAGE}/public/logos/owner-1/logo.png`,
    signature_url: `${STORAGE}/authenticated/business-signatures/owner-1/sig.png`,
  });
  assert.equal(result.logo_url, `${STORAGE}/authenticated/logos/owner-1/logo.png`);
  assert.equal(result.signature_url, `${STORAGE}/authenticated/business-signatures/owner-1/sig.png`);
});

test('an explicit clear is kept, and absent keys stay absent', () => {
  const cleared = sanitizeBusinessProfileUpdates({ logo_url: null });
  assert.equal(Object.prototype.hasOwnProperty.call(cleared, 'logo_url'), true);
  assert.equal(cleared.logo_url, null);
  const untouched = sanitizeBusinessProfileUpdates({ business_name: 'Only name' });
  assert.deepEqual(Object.keys(untouched), ['business_name']);
});

test('an unsafe local path never survives as a reference', () => {
  const result = sanitizeBusinessProfileUpdates({ logo_url: 'C:\\Users\\someone\\logo.png' });
  assert.equal(result.logo_url, null, 'safeImageSrc rejects local paths, so the stored value is cleared rather than set');
});
