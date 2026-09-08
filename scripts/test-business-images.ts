import assert from 'node:assert/strict';
import { businessImageReference, canonicalBusinessImage, resolveBusinessImage } from '../src/lib/businessImages';
import { supabase } from '../src/lib/supabase';
const legacy = 'https://example.supabase.co/storage/v1/object/public/logos/business-signatures/sig-a.png';
assert.deepEqual(businessImageReference(legacy), { bucket: 'logos', path: 'business-signatures/sig-a.png' });
assert.equal(businessImageReference('https://attacker.invalid/storage/v1/object/public/logos/a.png'), null);
assert.equal(canonicalBusinessImage(legacy), legacy.replace('/public/', '/authenticated/'));
const original = supabase.storage.from;
let calls = 0;
supabase.storage.from = ((bucket: string) => ({ createSignedUrl: async (path: string, ttl: number) => {
  assert.equal(bucket, 'logos'); assert.equal(path, 'business-signatures/sig-a.png'); assert.equal(ttl, 600);
  calls++; return { data: { signedUrl: 'https://signed.invalid/image' }, error: null };
} })) as typeof original;
assert.equal(await resolveBusinessImage(legacy), 'https://signed.invalid/image');
assert.equal(calls, 1);
supabase.storage.from = (() => ({ createSignedUrl: async () => ({ data: null, error: new Error('denied') }) })) as typeof original;
assert.equal(await resolveBusinessImage(legacy), null);
supabase.storage.from = original;
console.log('Business image URL resolution assertions passed; denied signatures are hidden. Storage RLS requires the DB suite.');
