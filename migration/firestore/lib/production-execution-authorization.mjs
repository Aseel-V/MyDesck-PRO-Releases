/**
 * Production execution authorization.
 *
 * Until now the three production write tools refused unconditionally
 * (`PRODUCTION_COPY_NOT_AUTHORIZED_IN_PREPARATION_MILESTONE`), and that throw was doing all the real
 * work: `--go-manifest` was only checked for being non-empty, never parsed, and `validateIdentity`
 * existed and was unit-tested but was wired into none of them. Replacing the throw with anything
 * weaker than a full check would therefore have *reduced* safety, not preserved it.
 *
 * This module is the gate that replaces it. Every condition must hold, and each one is checked
 * independently so a failure names itself:
 *
 *   1. mode is a writing mode the caller declared
 *   2. --ack is exactly PRODUCTION_ACK
 *   3. --go-manifest exists, parses, and is a JSON object
 *   4. manifest integrity hash recomputes (tamper-evident)
 *   5. manifest decision is exactly GO
 *   6. manifest stage matches the stage the tool implements
 *   7. manifest is within its validity window (issuedAt <= now < expiresAt)
 *   8. manifest identity == frozen EXPECTED identity == config identity
 *   9. approvedPreparationCommit is pinned, is a real commit, and is HEAD or an ancestor of it
 *  10. the migration tooling has not changed since that pinned commit
 *  11. current readiness evidence says DRY_RUN_GO with zero blockers
 *
 * Fail-closed by construction: `authorize()` returns a reason list and the caller must treat any
 * non-empty list as a refusal. There is no --force, --yes, --skip-checks or environment-variable
 * bypass, and `--mode=production-copy` on its own authorizes nothing.
 *
 * On integrity vs signature: `integrityHash` is a SHA-256 over the canonical manifest body and makes
 * casual tampering evident. It is NOT a cryptographic signature and is not presented as one — no
 * signing key exists in this repository, and inventing a keyless "signature" would be theatre. The
 * operator-held control is the acknowledgement plus the commit pin.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { EXPECTED, PRODUCTION_ACK, WRITING_MODES, sha256 } from './production-guard.mjs';

/** Paths whose content the authorization is pinned to. A change here invalidates the pin. */
export const PINNED_TOOLING = Object.freeze([
  'migration/firestore/lib/production-guard.mjs',
  'migration/firestore/lib/production-execution-authorization.mjs',
  'migration/firestore/tools/production-data-migration.mjs',
  'migration/firestore/tools/production-auth-import.mjs',
  'migration/firestore/tools/production-storage-migration.mjs',
  'migration/firestore/config/production-migration.json',
]);

/** The one pinned path that legitimately differs from the pin: it carries the pin itself. */
export const CONFIG_PATH = 'migration/firestore/config/production-migration.json';

export const STAGES = Object.freeze({
  firestoreBulkCopy: 'firestore-bulk-copy',
  firestoreFinalDelta: 'firestore-final-delta',
  authImport: 'auth-import',
});

/** Canonical body for hashing: every field except the hash itself, key-sorted. */
export function canonicalManifestBody(manifest) {
  const body = { ...manifest };
  delete body.integrityHash;
  return JSON.stringify(body, Object.keys(body).sort());
}

export function manifestIntegrityHash(manifest) {
  return sha256(canonicalManifestBody(manifest));
}

const git = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
};
/** Blob content, untrimmed: trimming would make every file's trailing newline read as drift. */
const gitShowRaw = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { return null; }
};

/**
 * @returns {{authorized:boolean, reasons:string[], checks:object}}
 */
export function authorize({ mode, stage, acknowledgement, goManifestPath, config, readiness }) {
  const reasons = [];
  const checks = {};

  // 1. mode
  checks.mode = mode ?? null;
  if (!WRITING_MODES.has(mode)) reasons.push(`MODE_NOT_A_WRITING_MODE:${mode ?? 'ABSENT'}`);

  // 2. acknowledgement — exact string, no substring or case tolerance
  checks.acknowledgementSupplied = Boolean(acknowledgement);
  if (acknowledgement !== PRODUCTION_ACK) reasons.push('PRODUCTION_ACKNOWLEDGEMENT_REQUIRED');

  // 3. manifest present and parseable
  checks.goManifestPath = goManifestPath ?? null;
  let manifest = null;
  if (!goManifestPath) reasons.push('SIGNED_GO_MANIFEST_REQUIRED');
  else if (!existsSync(goManifestPath)) reasons.push('GO_MANIFEST_NOT_FOUND');
  else {
    try {
      manifest = JSON.parse(readFileSync(goManifestPath, 'utf8'));
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        reasons.push('GO_MANIFEST_MALFORMED');
        manifest = null;
      }
    } catch { reasons.push('GO_MANIFEST_MALFORMED'); }
  }

  if (manifest) {
    // 4. integrity
    const recomputed = manifestIntegrityHash(manifest);
    checks.integrityHashMatches = manifest.integrityHash === recomputed;
    if (manifest.integrityHash !== recomputed) reasons.push('GO_MANIFEST_INTEGRITY_HASH_MISMATCH');

    // 5. decision
    checks.decision = manifest.decision ?? null;
    if (manifest.decision !== 'GO') reasons.push(`GO_MANIFEST_DECISION_NOT_GO:${manifest.decision ?? 'ABSENT'}`);

    // 6. stage binding — a manifest for one stage can never authorize another
    checks.stage = manifest.stage ?? null;
    checks.stageExpected = stage;
    if (manifest.stage !== stage) reasons.push(`GO_MANIFEST_STAGE_MISMATCH:${manifest.stage ?? 'ABSENT'}`);

    // 7. validity window
    const now = Date.now();
    const issued = Date.parse(manifest.issuedAt ?? '');
    const expires = Date.parse(manifest.expiresAt ?? '');
    checks.issuedAt = manifest.issuedAt ?? null;
    checks.expiresAt = manifest.expiresAt ?? null;
    if (Number.isNaN(issued)) reasons.push('GO_MANIFEST_ISSUED_AT_INVALID');
    else if (issued > now + 60_000) reasons.push('GO_MANIFEST_ISSUED_IN_FUTURE');
    if (Number.isNaN(expires)) reasons.push('GO_MANIFEST_EXPIRES_AT_INVALID');
    else if (expires <= now) reasons.push('GO_MANIFEST_EXPIRED');

    if (typeof manifest.issuedBy !== 'string' || !manifest.issuedBy) reasons.push('GO_MANIFEST_ISSUER_ABSENT');

    // 8. identity, manifest side
    for (const [field, expectedValue] of [['firebaseProject', EXPECTED.firebaseProject],
      ['firestoreDatabaseId', EXPECTED.firestoreDatabaseId], ['supabaseProject', EXPECTED.supabaseProject]]) {
      if (manifest[field] !== expectedValue) reasons.push(`GO_MANIFEST_${field.toUpperCase()}_MISMATCH:${manifest[field] ?? 'ABSENT'}`);
    }
  }

  // 8b. identity, config side — the config must not disagree with the frozen expectation
  checks.configFirebaseProject = config?.firebaseProject ?? null;
  checks.configFirestoreDatabaseId = config?.firestoreDatabaseId ?? null;
  checks.configSupabaseProject = config?.supabaseProject ?? null;
  if (config?.firebaseProject !== EXPECTED.firebaseProject) reasons.push('CONFIG_FIREBASE_PROJECT_MISMATCH');
  if (config?.firestoreDatabaseId !== EXPECTED.firestoreDatabaseId) reasons.push('CONFIG_FIRESTORE_DATABASE_MISMATCH');
  if (config?.supabaseProject !== EXPECTED.supabaseProject) reasons.push('CONFIG_SUPABASE_PROJECT_MISMATCH');
  if (config?.schemaVersion !== EXPECTED.schemaVersion) reasons.push('CONFIG_SCHEMA_VERSION_MISMATCH');
  if (config?.transformVersion !== EXPECTED.transformVersion) reasons.push('CONFIG_TRANSFORM_VERSION_MISMATCH');

  // 9. approved preparation commit
  const pinned = config?.approvedPreparationCommit ?? null;
  checks.approvedPreparationCommit = pinned;
  if (!pinned || !/^[0-9a-f]{40}$/i.test(pinned)) {
    reasons.push(`APPROVED_PREPARATION_COMMIT_NOT_PINNED:${pinned ?? 'ABSENT'}`);
  } else {
    const resolved = git(['rev-parse', '--verify', `${pinned}^{commit}`]);
    checks.pinnedCommitResolves = Boolean(resolved);
    if (!resolved) reasons.push('APPROVED_PREPARATION_COMMIT_UNKNOWN');
    else {
      const head = git(['rev-parse', 'HEAD']);
      checks.head = head;
      // HEAD, or an ancestor of it. A later doc-only commit must not revoke authorization, but a pin
      // that is not in this history must. `merge-base --is-ancestor` signals by exit status, so the
      // verdict comes from whether it throws, never from its (empty) stdout.
      const isAncestor = pinned === head || (() => {
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', pinned, 'HEAD'], { stdio: 'ignore' });
          return true;
        } catch { return false; }
      })();
      checks.pinnedCommitInHeadHistory = isAncestor;
      if (!isAncestor) reasons.push('APPROVED_PREPARATION_COMMIT_NOT_IN_HEAD_HISTORY');

      // 9b. manifest must name the same commit the config pins
      if (manifest && manifest.approvedPreparationCommit !== pinned) {
        reasons.push('GO_MANIFEST_COMMIT_MISMATCH');
      }

      // 10. tooling unchanged since the pin.
      //
      // Compared per path rather than with `git diff`, because the config file is itself pinned and
      // carries the pin: the commit that records approvedPreparationCommit cannot contain its own
      // SHA, so that one field — and only that field — is normalised out before comparing. Every
      // other byte of the config, and every byte of the other pinned files, must match the pin.
      const drift = [];
      for (const path of PINNED_TOOLING) {
        const atPin = gitShowRaw(['show', `${pinned}:${path}`]);
        const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
        if (atPin === null || now === null) { drift.push(`${path}:UNREADABLE`); continue; }
        if (path === CONFIG_PATH) {
          const strip = (text) => {
            try {
              const parsed = JSON.parse(text);
              delete parsed.approvedPreparationCommit;
              return JSON.stringify(parsed, Object.keys(parsed).sort());
            } catch { return null; }
          };
          const a = strip(atPin);
          const b = strip(now);
          if (a === null || b === null || a !== b) drift.push(`${path}:CHANGED`);
          continue;
        }
        if (atPin.replace(/\r\n/g, '\n') !== now.replace(/\r\n/g, '\n')) drift.push(`${path}:CHANGED`);
      }
      checks.toolingDriftSincePin = drift;
      if (drift.length) reasons.push(`MIGRATION_TOOLING_CHANGED_SINCE_PIN:${drift.join('|')}`);
    }
  }

  // 11. current readiness evidence
  checks.dryRunDecision = readiness?.decision ?? null;
  checks.dryRunBlockers = readiness?.knownBlockers ?? null;
  if (readiness?.decision !== 'GO') reasons.push(`DRY_RUN_NOT_GO:${readiness?.decision ?? 'ABSENT'}`);
  if (!Array.isArray(readiness?.knownBlockers) || readiness.knownBlockers.length > 0) {
    reasons.push(`DRY_RUN_BLOCKERS_PRESENT:${JSON.stringify(readiness?.knownBlockers ?? null)}`);
  }

  return { authorized: reasons.length === 0, reasons, checks };
}

/**
 * Storage production copy is refused unconditionally and on purpose.
 *
 * Supabase Storage is the retained production storage backend in the target architecture. There is
 * no Firebase Storage bucket to copy into, and the preserved customer signature object must never be
 * touched. This is an architecture decision, not a milestone gate, so it has no authorization path
 * at all: no manifest, acknowledgement or commit pin can open it.
 */
export function assertStorageCopyForbidden(mode) {
  if (mode === 'production-copy' || mode === 'final-delta') {
    throw new Error('STORAGE_PRODUCTION_COPY_PERMANENTLY_FORBIDDEN_SUPABASE_STORAGE_RETAINED');
  }
}
