#!/usr/bin/env node
/**
 * Restaurant staff identity inventory (RESTAURANT_STAFF_AUTH_MODEL_GO evidence).
 *
 * Today restaurant staff are authenticated by `authenticate_staff`, a SECURITY DEFINER
 * Postgres function that reads `restaurant_staff.password` and verifies it with `crypt()`,
 * and authorised per-action by `authorize_staff_action`, which checks a PIN. Neither survives
 * the removal of the Supabase database, and neither has a no-server equivalent: verifying a
 * password or PIN client-side would mean shipping the secret to an attacker-controlled
 * Electron renderer.
 *
 * This tool classifies each staff record so the replacement identity model is grounded in the
 * real data rather than assumed.
 *
 * STRICTLY READ-ONLY, through `withSourceSnapshot` (migration/tools/lib/staging-source.mjs): a verified TLS
 * connection pinned to the source project, one REPEATABLE READ READ ONLY transaction whose isolation and read-only
 * state are read back from the server, a write control PostgreSQL must reject with 25006, SELECT-only statements,
 * and a rollback. Passwords, hashes, PINs, emails and names are never printed - only credential *format* and
 * classification.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { localConfig, withSourceSnapshot } from '../../tools/lib/staging-source.mjs';

/** Format only. The value itself is never returned, logged or hashed into the report. */
const credentialFormat = (value) => {
  if (value == null || value === '') return 'ABSENT';
  if (/^\$2[aby]\$\d{2}\$/.test(value)) return 'BCRYPT';
  if (/^\$argon2/.test(value)) return 'ARGON2';
  if (/^\$scrypt|^\$s0\$/.test(value)) return 'SCRYPT';
  if (/^[0-9a-f]{64}$/i.test(value)) return 'HEX64_UNIDENTIFIED';
  return 'PLAINTEXT_OR_UNRECOGNISED';
};
const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

const evidence = {};
const records = await withSourceSnapshot(localConfig(), async (select) => {
  const staff = (await select('SELECT * FROM public.restaurant_staff')).rows;
  const authEmails = new Set((await select(
    'SELECT lower(email) AS email FROM auth.users WHERE email IS NOT NULL')).rows.map((r) => r.email));

  return staff.map((row) => {
    const passwordFormat = credentialFormat(row.password);
    const pinHashFormat = credentialFormat(row.pin_hash);
    const pinCodeFormat = credentialFormat(row.pin_code);
    const email = (row.email ?? '').toLowerCase();
    const matchesExisting = Boolean(email) && authEmails.has(email);
    // BCRYPT is the only format Firebase Auth can import directly. Anything else, or an
    // absent credential, means the account has to be provisioned rather than migrated.
    const importable = passwordFormat === 'BCRYPT';
    const classification = row.is_active === false ? 'DISABLED'
      : matchesExisting ? 'MATCHES_EXISTING_FIREBASE_USER'
        : 'NEEDS_FIREBASE_ACCOUNT';
    const credentialDisposition = importable ? 'BCRYPT_IMPORT_CANDIDATE_REQUIRES_SYNTHETIC_PROOF'
      : !email ? 'OWNER_REPROVISION_REQUIRED'
        : 'RESET_REQUIRED';
    return {
      staffFingerprint: fingerprint(row.id),
      businessFingerprint: fingerprint(row.business_id),
      legacyRole: row.role ?? null,
      restaurantRole: row.restaurant_role ?? null,
      isActive: row.is_active !== false,
      hasEmail: Boolean(email),
      matchesExistingAuthUser: matchesExisting,
      passwordFormat, pinHashFormat, pinCodeFormat,
      plaintextPinPresent: pinCodeFormat === 'PLAINTEXT_OR_UNRECOGNISED',
      classification, credentialDisposition,
    };
  });
}, evidence);

const tally = (key) => records.reduce((acc, r) => { acc[r[key]] = (acc[r[key]] ?? 0) + 1; return acc; }, {});
const plaintextPins = records.filter((r) => r.plaintextPinPresent).length;
const report = {
  generatedAt: new Date().toISOString(),
  source: {
    readOnly: evidence.start?.read_only === 'on' && evidence.end?.read_only === 'on',
    isolationLevel: evidence.start?.isolation ?? null,
    isolationLevelAtEnd: evidence.end?.isolation ?? null,
    writeAttemptRejected: evidence.rejectedWriteSqlState === '25006',
    rejectedWriteSqlState: evidence.rejectedWriteSqlState ?? null,
    writesCaused: evidence.successfulWrites ?? null,
    transactionOutcome: evidence.transactionOutcome ?? null,
  },
  staffCount: records.length,
  roles: { legacy: [...new Set(records.map((r) => r.legacyRole).filter(Boolean))],
    restaurant: [...new Set(records.map((r) => r.restaurantRole).filter(Boolean))] },
  productDefinedRestaurantRoles: ['super_admin', 'branch_manager', 'kitchen_staff', 'waiter'],
  counts: { ...tally('classification'), UNKNOWN: 0 },
  credentialDispositions: tally('credentialDisposition'),
  bcryptImportCandidates: records.filter((r) => r.passwordFormat === 'BCRYPT').length,
  plaintextPinsPresent: plaintextPins,
  findings: [
    ...(plaintextPins ? [{ severity: 'MEDIUM', id: 'PLAINTEXT_PIN_AT_REST',
      detail: `${plaintextPins} staff record(s) store an unhashed pin_code.` }] : []),
  ],
  identityModelDecided: false,
  records,
  note: 'authenticate_staff and authorize_staff_action cannot be reimplemented without a server. Staff must become Firebase Auth identities authorised by Firestore membership documents and Rules.',
};
writeFileSync('migration/reports/restaurant-staff-inventory.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ staffCount: report.staffCount, roles: report.roles,
  counts: report.counts, credentialDispositions: report.credentialDispositions,
  bcryptImportCandidates: report.bcryptImportCandidates,
  plaintextPinsPresent: plaintextPins, source: report.source }, null, 2));
