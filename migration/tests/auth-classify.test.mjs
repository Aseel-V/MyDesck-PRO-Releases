#!/usr/bin/env node
/**
 * Offline tests for the Firebase Auth import logic.
 *
 * These run with no Firebase project, no credentials and no database, because
 * the decisions they cover — which account is transparent, which UID is
 * preservable, what never reaches a log — must be correct BEFORE anyone has
 * credentials to do damage with.
 *
 * They do NOT prove that Firebase accepts a GoTrue bcrypt hash. That requires a
 * real project and is tracked as a separate, blocking gate.
 *
 *   node migration/tests/auth-classify.test.mjs
 */

import assert from 'node:assert/strict';
import {
  parseBcrypt, isUidPreservable, classifyAccount, buildImportRecord,
  chunk, redact, toLedgerRows, summarize,
  FIREBASE_UID_MAX_LENGTH, FIREBASE_IMPORT_BATCH_SIZE,
} from '../tools/lib/auth-classify.mjs';

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { failures.push({ name, message: e.message }); }
}

// A real-shaped GoTrue bcrypt hash: $2a$, cost 10, 22-char salt + 31-char digest.
const GOTRUE_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

// ---------------------------------------------------------------- bcrypt format

test('accepts a GoTrue-shaped bcrypt hash', () => {
  const r = parseBcrypt(GOTRUE_HASH);
  assert.equal(r.ok, true);
  assert.equal(r.cost, 10);
  assert.equal(r.unusualCost, false);
});

test('accepts $2b and $2y variants', () => {
  for (const v of ['b', 'y']) {
    assert.equal(parseBcrypt(GOTRUE_HASH.replace('$2a$', `$2${v}$`)).ok, true, `variant 2${v}`);
  }
});

test('flags an unusual cost factor for human review rather than importing blind', () => {
  const low = parseBcrypt(GOTRUE_HASH.replace('$10$', '$04$'));
  assert.equal(low.ok, true);
  assert.equal(low.unusualCost, true);
});

test('rejects non-bcrypt, truncated, empty and null hashes', () => {
  assert.equal(parseBcrypt('').ok, false);
  assert.equal(parseBcrypt(null).ok, false);
  assert.equal(parseBcrypt(undefined).ok, false);
  assert.equal(parseBcrypt('not-a-hash').ok, false);
  assert.equal(parseBcrypt(GOTRUE_HASH.slice(0, -1)).ok, false, 'one char short must fail');
  // bcrypt's alphabet is [./A-Za-z0-9]; '+' and '!' are outside it.
  assert.equal(parseBcrypt('$2a$10$' + '+'.repeat(53)).ok, false, 'invalid base64 alphabet');
  assert.equal(parseBcrypt('$2a$10$' + '!'.repeat(53)).ok, false, 'invalid base64 alphabet');
  assert.equal(parseBcrypt('$2c$10$' + 'a'.repeat(53)).ok, false, 'unknown bcrypt variant');
  // An argon2/scrypt hash must not be mistaken for bcrypt and imported as one.
  assert.equal(parseBcrypt('$argon2id$v=19$m=65536,t=3,p=4$abc$def').ok, false);
});

// ---------------------------------------------------------------- uid preservation

test('a Supabase uuid is preservable as a Firebase uid', () => {
  assert.equal(isUidPreservable(UUID_A).ok, true);
  assert.equal(UUID_A.length, 36);
  assert.ok(36 <= FIREBASE_UID_MAX_LENGTH);
});

test('uid at exactly the Firebase limit is allowed, one over is refused', () => {
  assert.equal(isUidPreservable('x'.repeat(FIREBASE_UID_MAX_LENGTH)).ok, true);
  const over = isUidPreservable('x'.repeat(FIREBASE_UID_MAX_LENGTH + 1));
  assert.equal(over.ok, false);
  assert.match(over.reason, /too_long/);
});

test('empty uid is refused', () => {
  assert.equal(isUidPreservable('').ok, false);
  assert.equal(isUidPreservable(null).ok, false);
});

// ---------------------------------------------------------------- classification

const base = {
  id: UUID_A, email: 'owner@agency.example', encrypted_password: GOTRUE_HASH,
  email_confirmed_at: '2026-01-01T00:00:00Z', has_business_profile: true,
  has_user_profile: true, has_oauth_identity: false, is_banned: false,
};

test('a normal password account is transparent and non-blocking', () => {
  const c = classifyAccount(base);
  assert.equal(c.authClass, 'transparent');
  assert.equal(c.blocking, false);
  assert.deepEqual(c.reasons, []);
});

test('OAuth-only account is reauth, not reset_required', () => {
  const c = classifyAccount({ ...base, encrypted_password: null, has_oauth_identity: true });
  assert.equal(c.authClass, 'reauth');
  assert.equal(c.blocking, false);
});

test('no password and no OAuth means reset_required, never silent drop', () => {
  const c = classifyAccount({ ...base, encrypted_password: null, has_oauth_identity: false });
  assert.equal(c.authClass, 'reset_required');
  assert.equal(c.blocking, false);
});

test('duplicate email blocks — Firebase enforces uniqueness and one row would vanish', () => {
  const counts = new Map([['dupe@agency.example', 2]]);
  const c = classifyAccount({ ...base, email: 'dupe@agency.example' }, { emailCounts: counts });
  assert.equal(c.authClass, 'manual_review');
  assert.equal(c.blocking, true);
  assert.ok(c.reasons.includes('duplicate_email'));
});

test('missing email blocks', () => {
  const c = classifyAccount({ ...base, email: null });
  assert.equal(c.authClass, 'manual_review');
  assert.equal(c.blocking, true);
});

test('auth row with no profiles blocks — the customer would arrive with no business', () => {
  const c = classifyAccount({ ...base, has_business_profile: false, has_user_profile: false });
  assert.equal(c.authClass, 'manual_review');
  assert.equal(c.blocking, true);
  assert.ok(c.reasons.includes('orphan_auth_row_no_profiles'));
});

test('banned account still migrates, flagged to be imported disabled', () => {
  const c = classifyAccount({ ...base, is_banned: true });
  assert.equal(c.authClass, 'transparent');
  assert.equal(c.blocking, false);
  assert.ok(c.reasons.includes('banned_must_import_disabled'));
});

test('an unpreservable uid blocks immediately and does not fall through', () => {
  const c = classifyAccount({ ...base, id: 'x'.repeat(200) });
  assert.equal(c.authClass, 'manual_review');
  assert.equal(c.blocking, true);
  assert.equal(c.reasons.length, 1, 'must short-circuit, not accumulate unrelated reasons');
});

// ---------------------------------------------------------------- import record

test('import record preserves the uid verbatim and sets the required role claim', () => {
  const r = buildImportRecord(base);
  assert.equal(r.uid, UUID_A, 'uid must be the original Supabase uuid, unmodified');
  assert.equal(r.email, base.email);
  assert.equal(r.emailVerified, true);
  assert.deepEqual(r.customClaims, { role: 'authenticated' },
    'Supabase picks the Postgres role from this claim; without it every RLS policy denies');
  assert.ok(Buffer.isBuffer(r.passwordHash));
  assert.equal(r.passwordHash.toString('utf8'), GOTRUE_HASH, 'hash must transfer byte-identical');
});

test('unverified email is carried across as unverified, not silently upgraded', () => {
  const r = buildImportRecord({ ...base, email_confirmed_at: null });
  assert.equal(r.emailVerified, false);
});

test('an account with no usable hash yields a record with no passwordHash', () => {
  const r = buildImportRecord({ ...base, encrypted_password: null });
  assert.equal(r.passwordHash, undefined);
  assert.equal(r.uid, UUID_A, 'uid is still preserved');
});

test('buildImportRecord refuses rather than regenerating an unpreservable id', () => {
  assert.throws(() => buildImportRecord({ ...base, id: 'x'.repeat(200) }), /not preservable/);
  assert.throws(() => buildImportRecord({ ...base, id: '' }), /not preservable/);
});

// ---------------------------------------------------------------- batching

test('batches at the Firebase limit of 1000', () => {
  assert.equal(FIREBASE_IMPORT_BATCH_SIZE, 1000);
  const items = Array.from({ length: 2500 }, (_, i) => i);
  const b = chunk(items);
  assert.deepEqual(b.map((x) => x.length), [1000, 1000, 500]);
  assert.equal(b.flat().length, 2500, 'no user may be dropped by batching');
  assert.deepEqual(b.flat(), items, 'order and content preserved');
});

test('empty population batches to nothing rather than throwing', () => {
  assert.deepEqual(chunk([]), []);
});

// ---------------------------------------------------------------- redaction

test('redact never emits a password hash, in any shape', () => {
  const out = redact({
    uid: UUID_A, email: 'a@b.example', encrypted_password: GOTRUE_HASH,
    passwordHash: Buffer.from(GOTRUE_HASH), refresh_token: 'rt', id_token: 'it',
    service_account_key: 'k', database_url: 'postgres://u:p@h/db',
  });
  const s = JSON.stringify(out);
  assert.ok(!s.includes(GOTRUE_HASH), 'hash leaked');
  assert.ok(!s.includes('postgres://'), 'connection string leaked');
  assert.ok(!s.includes('"rt"') && !s.includes('"it"'), 'token leaked');
  assert.equal(out.uid, UUID_A, 'safe fields still readable');
  assert.equal(out.email, 'a@b.example');
});

test('redaction is allow-list shaped: an unknown new field is redacted by default', () => {
  const out = redact({ uid: UUID_A, some_future_secret_field: 'sensitive' });
  assert.equal(out.some_future_secret_field, '[REDACTED]');
});

test('redact handles nested structures and arrays', () => {
  const out = redact({ reasons: ['a', 'b'], nested: { encrypted_password: GOTRUE_HASH } });
  assert.deepEqual(out.reasons, ['a', 'b']);
  assert.equal(out.nested, '[REDACTED]');
});

// ---------------------------------------------------------------- ledger

test('ledger rows always set firebase_uid = supabase_uid', () => {
  const rows = [base, { ...base, id: UUID_B, email: 'b@agency.example' }];
  const cls = rows.map((r) => classifyAccount(r));
  const ledger = toLedgerRows(rows, cls);
  assert.equal(ledger.length, 2);
  for (const l of ledger) {
    assert.equal(l.firebase_uid, l.supabase_uid,
      'the ledger must never record a regenerated id');
    assert.equal(l.import_status, 'pending');
  }
});

test('ledger records hash presence and format without carrying the hash', () => {
  const l = toLedgerRows([base], [classifyAccount(base)])[0];
  assert.equal(l.has_password_hash, true);
  assert.equal(l.hash_format_ok, true);
  assert.ok(!JSON.stringify(l).includes(GOTRUE_HASH), 'ledger must be safe to export');
});

test('summary accounts for every user with no silent loss', () => {
  const rows = [
    base,
    { ...base, id: UUID_B, email: 'b@x.example', encrypted_password: null, has_oauth_identity: true },
    { ...base, id: '11111111-1111-1111-1111-111111111111', email: null },
  ];
  const s = summarize(rows.map((r) => classifyAccount(r)));
  assert.equal(s.total, 3);
  assert.equal(s.transparent + s.reauth + s.reset_required + s.manual_review, 3,
    'every account must land in exactly one class');
  assert.equal(s.blocking, 1);
});

// ---------------------------------------------------------------- report

console.log(`\n[auth-classify] ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  FAIL  ${f.name}\n        ${f.message}`);
process.exit(failures.length ? 1 : 0);
