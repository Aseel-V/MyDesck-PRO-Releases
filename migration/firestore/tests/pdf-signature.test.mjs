#!/usr/bin/env node
/**
 * Private signature resolution for the invoice PDF.
 *
 * The bug these guard against was invisible to every existing test: the PDF path DID call
 * `resolvePrivateSignature`, DID await it, and never touched a public URL. It then handed the
 * already-resolved `data:` URL to `imageUrlToDataUrl`, which re-fetched it - and the app's CSP
 * allows `data:` under `img-src` but not under `connect-src`. The fetch was blocked, a bare
 * `catch` swallowed the violation, and the signature vanished from the PDF while still
 * rendering correctly in Settings. Logos were unaffected because they resolve to an https
 * Supabase URL, which `connect-src` permits.
 *
 * Source-level assertions, because the failure lives in the interaction between a CSP header,
 * a swallowed exception and a render path that no unit test exercises end to end.
 *
 *   node --test migration/firestore/tests/pdf-signature.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pdf = readFileSync('src/lib/pdfGenerator.ts', 'utf8');
const images = readFileSync('src/lib/businessImages.ts', 'utf8');
const auth = readFileSync('src/contexts/AuthContext.tsx', 'utf8');
const html = readFileSync('index.html', 'utf8');
const repository = readFileSync('src/data/SupabaseStorageRepository.ts', 'utf8');

const connectSrc = html.match(/connect-src[^;]*/)?.[0] ?? '';
const imgSrc = html.match(/img-src[^;]*/)?.[0] ?? '';

test('the CSP that caused this still allows data: for images but not for fetch', () => {
  // If this ever flips, the short-circuit below stops being load-bearing - but it stays correct.
  assert.match(imgSrc, /\bdata:/, 'img-src must allow data: or no inline image renders');
  assert.doesNotMatch(connectSrc, /\bdata:/,
    'connect-src still excludes data:, which is why fetching a data URL fails');
});

test('the PDF returns an already-resolved data URL instead of re-fetching it', () => {
  assert.match(pdf, /if \(src\.startsWith\('data:'\)\) return src;/,
    'an inline image must be handed back directly, never fetched');
  const shortCircuit = pdf.indexOf("src.startsWith('data:')");
  const fetchCall = pdf.indexOf('await fetch(src)');
  assert.ok(shortCircuit > 0 && fetchCall > 0 && shortCircuit < fetchCall,
    'the short-circuit must come before the fetch, or it never runs');
});

test('the PDF uses the same canonical resolver as Settings', () => {
  assert.match(pdf, /import \{ resolvePrivateSignature \} from '\.\/businessImages'/);
  assert.match(pdf, /await imageUrlToDataUrl\(await resolvePrivateSignature\(/,
    'the resolver must be awaited before the value is used');
  assert.match(auth, /resolvePrivateSignature\(data\.signature_url\)/,
    'Settings receives its value through the same resolver');
});

test('no public URL and no public fallback is used for signatures', () => {
  assert.doesNotMatch(pdf, /getPublicUrl/);
  assert.doesNotMatch(images, /getPublicUrl/);
  assert.doesNotMatch(pdf, /object\/public\//,
    'the PDF must never reach for a public object path');
  assert.match(repository, /SIGNATURES_ARE_NEVER_PUBLIC/);
});

test('signatures resolve only from the private bucket, so a wrong tenant resolves nothing', () => {
  // resolvePrivateSignature refuses any reference that is not the private bucket, and
  // readPrivateFile refuses any path outside the caller's own uid folder.
  assert.match(images, /reference\.bucket !== 'business-signatures'\) return null/,
    'a non-private reference must resolve to null rather than to something public');
  assert.match(repository, /path\.startsWith\(`\$\{this\.uid\}\/`\)/,
    'a path outside the caller uid folder is refused before the request is made');
});

test('a missing signature renders no signature rather than failing', () => {
  assert.match(pdf, /const imageMarkup = signatureUrl\s*\n?\s*\?/,
    'renderSignature must branch on absence');
  assert.match(pdf, /if \(!src\) return null;/, 'an absent image resolves to null, not an error');
});

test('no Supabase Auth session is used to resolve a signature', () => {
  // Comments are stripped first: the file documents the auth call it deliberately no longer
  // makes, and a guard that trips on its own rationale is a guard nobody keeps.
  const code = repository
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*/gm, '$1 ');
  assert.doesNotMatch(code, /supabase[A-Za-z]*\s*\.\s*auth\b/,
    'the Storage layer must not reach an auth client');
  assert.doesNotMatch(images, /from '\.\/supabase'/,
    'signature resolution must not import the general Supabase client');
});

test('saving a form never writes a resolved display value over the stored reference', () => {
  assert.match(auth, /const isResolvedDisplayValue = \(value: unknown\): boolean =>/);
  assert.match(auth, /\/\^\(data:\|blob:\)\/i/,
    'both data: and blob: payloads must be treated as display-only');
  for (const field of ['logo_url', 'signature_url']) {
    const guard = new RegExp(
      `hasOwnProperty\\.call\\(updates, '${field}'\\) && !isResolvedDisplayValue\\(updates\\.${field}\\)`);
    assert.match(auth, guard, `${field} must be dropped from the update when it is a display value`);
  }
});
