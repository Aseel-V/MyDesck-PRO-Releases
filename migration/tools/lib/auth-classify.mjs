/**
 * Phase 6/7/8 — pure classification and payload construction for the Firebase
 * Auth import.
 *
 * Deliberately dependency-free and side-effect-free so it can be unit tested
 * offline, without a Firebase project, without credentials and without a
 * database. Everything here is the part of the import that MUST be correct
 * before anyone is allowed near production.
 *
 * Nothing in this module logs. Callers do the logging, through redact().
 */

/** Firebase: "The uid must be a non-empty string with at most 128 characters." */
export const FIREBASE_UID_MAX_LENGTH = 128;

/** Firebase Auth import API accepts at most 1000 users per call. */
export const FIREBASE_IMPORT_BATCH_SIZE = 1000;

/**
 * Modular-crypt bcrypt: $2<variant>$<cost>$<22 char salt><31 char digest>.
 * GoTrue (Supabase Auth) emits $2a$; we accept the other standard variants
 * because a hash written by an older or different library is still valid
 * bcrypt and Firebase treats it as an opaque BCRYPT value.
 */
const BCRYPT_RE = /^\$2[abxy]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

export function parseBcrypt(hash) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return { ok: false, reason: 'missing' };
  }
  const m = BCRYPT_RE.exec(hash);
  if (!m) return { ok: false, reason: 'not_bcrypt_modular_crypt' };
  const cost = Number(m[1]);
  // Cost outside 4..31 is not representable; outside 10..14 is unusual enough
  // that it deserves a human look before import rather than after.
  if (cost < 4 || cost > 31) return { ok: false, reason: `cost_out_of_range:${cost}` };
  return { ok: true, cost, unusualCost: cost < 10 || cost > 14 };
}

export function isUidPreservable(supabaseUid) {
  if (typeof supabaseUid !== 'string' || supabaseUid.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (supabaseUid.length > FIREBASE_UID_MAX_LENGTH) {
    return { ok: false, reason: `too_long:${supabaseUid.length}` };
  }
  return { ok: true };
}

/**
 * Decide how a single source account can move, and why.
 *
 * `row` is a redacted projection of Supabase auth.users joined to the profile
 * tables — see migration/sql/queries/auth-population.sql. It carries the
 * password hash because the import needs it; it must never be logged.
 *
 * Returns { authClass, blocking, reasons[] }.
 *   transparent    — same email + same password will work, no user action
 *   reauth         — federated identity only; user signs in with the provider
 *   reset_required — no usable password; user needs a reset link
 *   manual_review  — a human must decide before this account moves
 */
export function classifyAccount(row, { emailCounts } = {}) {
  const reasons = [];
  let authClass = 'transparent';
  let blocking = false;

  const uid = isUidPreservable(row.id);
  if (!uid.ok) {
    reasons.push(`uid_not_preservable:${uid.reason}`);
    return { authClass: 'manual_review', blocking: true, reasons };
  }

  // --- identity integrity ---------------------------------------------------
  if (!row.email) {
    reasons.push('no_email');
    authClass = 'manual_review';
    blocking = true;
  } else if (emailCounts && emailCounts.get(row.email.toLowerCase()) > 1) {
    // Firebase enforces email uniqueness. Two Supabase rows sharing an email
    // cannot both import, and silently dropping one loses a customer.
    reasons.push('duplicate_email');
    authClass = 'manual_review';
    blocking = true;
  }

  // --- orphan detection -----------------------------------------------------
  // An auth row with no profile, or a profile with no auth row, means the
  // customer would arrive with no business attached. That is data loss even
  // though every table reconciles.
  if (row.has_business_profile === false && row.has_user_profile === false) {
    reasons.push('orphan_auth_row_no_profiles');
    authClass = 'manual_review';
    blocking = true;
  }

  if (row.is_banned) {
    // Not blocking: a banned account should migrate in a disabled state rather
    // than vanish. Flagged so the disable step is not forgotten.
    reasons.push('banned_must_import_disabled');
  }

  // --- credential path ------------------------------------------------------
  const bc = parseBcrypt(row.encrypted_password);
  if (bc.ok) {
    if (bc.unusualCost) reasons.push(`unusual_bcrypt_cost:${bc.cost}`);
  } else if (row.has_oauth_identity) {
    reasons.push(`no_password_hash:${bc.reason}`, 'has_oauth_identity');
    if (!blocking) authClass = 'reauth';
  } else {
    reasons.push(`no_usable_password:${bc.reason}`);
    if (!blocking) authClass = 'reset_required';
  }

  return { authClass, blocking, reasons };
}

/**
 * Build the Firebase importUsers record for one account.
 * Throws rather than emitting a record that would regenerate an ID.
 */
export function buildImportRecord(row) {
  const uid = isUidPreservable(row.id);
  if (!uid.ok) {
    throw new Error(`refusing to build import record: uid not preservable (${uid.reason})`);
  }

  const record = {
    // UID PRESERVATION: the Supabase uuid IS the Firebase uid, verbatim.
    // Never generated, never derived.
    uid: row.id,
    email: row.email ?? undefined,
    emailVerified: Boolean(row.email_confirmed_at),
    // Supabase's role claim is what tells the database which Postgres role to
    // assume. Omitting it makes every RLS predicate deny.
    customClaims: { role: 'authenticated' },
  };

  if (row.phone) record.phoneNumber = row.phone;
  if (row.display_name) record.displayName = row.display_name;

  const bc = parseBcrypt(row.encrypted_password);
  if (bc.ok) {
    // BCRYPT requires no salt and no parameters; the hash is self-describing.
    record.passwordHash = Buffer.from(row.encrypted_password, 'utf8');
  }

  if (Array.isArray(row.oauth_identities) && row.oauth_identities.length) {
    record.providerData = row.oauth_identities.map((i) => ({
      uid: i.provider_id,
      providerId: i.provider,
      email: i.email ?? undefined,
    }));
  }

  return record;
}

/** Split into Firebase-sized batches. */
export function chunk(items, size = FIREBASE_IMPORT_BATCH_SIZE) {
  if (size < 1) throw new Error('batch size must be >= 1');
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Redaction for every log line and report this tooling writes.
 *
 * Secrets must not reach stdout, a file, a ticket or a git commit. The rule is
 * allow-list shaped on purpose: a new sensitive field added upstream is
 * redacted by default rather than leaked until someone notices.
 */
const SAFE_KEYS = new Set([
  'id', 'uid', 'email', 'emailVerified', 'email_confirmed_at', 'phone', 'phoneNumber',
  'displayName', 'display_name', 'auth_class', 'authClass', 'blocking', 'reasons',
  'import_status', 'verification_status', 'uid_preserved', 'created_at',
  'last_sign_in_at', 'is_banned', 'has_business_profile', 'has_user_profile',
  'has_oauth_identity', 'has_password_hash', 'hash_format_ok', 'failure_reason',
  'providerId', 'provider', 'customClaims', 'role',
]);

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SAFE_KEYS.has(k) ? redact(v) : '[REDACTED]';
    }
    return out;
  }
  if (Buffer.isBuffer(value)) return '[REDACTED]';
  return value;
}

/**
 * Turn a classified population into the ledger rows for migration.user_id_map.
 * The firebase_uid is always the supabase uid — the generated uid_preserved
 * column in the ledger then proves it, rather than us asserting it.
 */
export function toLedgerRows(rows, classifications) {
  return rows.map((row, i) => {
    const c = classifications[i];
    const bc = parseBcrypt(row.encrypted_password);
    return {
      supabase_uid: row.id,
      firebase_uid: row.id,
      email: row.email ?? null,
      auth_class: c.authClass,
      import_status: 'pending',
      verification_status: 'pending',
      has_password_hash: typeof row.encrypted_password === 'string' && row.encrypted_password.length > 0,
      hash_format_ok: bc.ok,
      email_confirmed: Boolean(row.email_confirmed_at),
      has_oauth_identity: Boolean(row.has_oauth_identity),
      has_phone: Boolean(row.phone),
      is_banned: Boolean(row.is_banned),
      has_business_profile: row.has_business_profile ?? null,
      has_user_profile: row.has_user_profile ?? null,
      failure_reason: c.reasons.length ? c.reasons.join('; ') : null,
    };
  });
}

/** Aggregate counts for the milestone report. */
export function summarize(classifications) {
  const s = {
    total: classifications.length,
    transparent: 0, reauth: 0, reset_required: 0, manual_review: 0, blocking: 0,
  };
  for (const c of classifications) {
    s[c.authClass]++;
    if (c.blocking) s.blocking++;
  }
  return s;
}
