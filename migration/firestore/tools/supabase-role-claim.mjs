#!/usr/bin/env node
/**
 * Supabase-compatible role claim tooling for Firebase Auth.
 *
 * Supabase Third-Party Auth requires the incoming JWT to carry `role: authenticated`, or every
 * RLS predicate denies. Firebase does not add that claim, and Cloud Functions are forbidden by
 * the Spark constraint, so it is applied here - in operator/migration tooling, outside the
 * shipped app. No privileged credential ever reaches the Electron bundle.
 *
 * Modes:
 *   --mode=verify (default)  read-only audit of which users carry the claim
 *   --mode=apply             set the claim, merging with existing custom claims
 *
 * Safety: `apply` refuses any account whose email is not in the synthetic
 * `migration-test--` namespace unless --include-production is passed together with an exact
 * approval hash, so a stray run can never rewrite real customer claims.
 *
 * Never prints tokens, passwords, hashes or emails. UIDs appear only as fingerprints.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = 'mydesckpro';
const SYNTHETIC_PREFIX = 'migration-test--';
const REQUIRED_CLAIM = { role: 'authenticated' };
const APPROVAL = 'I_ACKNOWLEDGE_MYDESCK_PRODUCTION_CLAIM_WRITE';

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = arg('--mode', 'verify');
if (!['verify', 'apply'].includes(mode)) throw Error('UNSUPPORTED_MODE');
const includeProduction = process.argv.includes('--include-production');
const approval = arg('--approval');
if (mode === 'apply' && includeProduction && approval !== APPROVAL) {
  throw Error('PRODUCTION_CLAIM_WRITE_REQUIRES_EXACT_APPROVAL');
}

const sdk = process.env.GCLOUD_SDK_ROOT ?? join(process.env.LOCALAPPDATA, 'Google/Cloud SDK/google-cloud-sdk');
const token = execFileSync(join(sdk, 'platform/bundledpython/python.exe'),
  [join(sdk, 'lib/gcloud.py'), 'auth', 'print-access-token'], { encoding: 'utf8', timeout: 60000 }).trim();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
const fingerprint = (uid) => createHash('sha256').update(uid).digest('hex').slice(0, 12);

async function listUsers() {
  const users = []; let pageToken;
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet`);
    url.searchParams.set('maxResults', '1000');
    if (pageToken) url.searchParams.set('nextPageToken', pageToken);
    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok) throw Error(`LIST_FAILED_${response.status}`);
    users.push(...(data.users ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return users;
}

const parseClaims = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return null; } };

const users = await listUsers();
const rows = users.map((user) => {
  const claims = parseClaims(user.customAttributes);
  const synthetic = (user.email ?? '').startsWith(SYNTHETIC_PREFIX);
  return {
    uidFingerprint: fingerprint(user.localId),
    localId: user.localId,
    scope: synthetic ? 'SYNTHETIC' : 'PRODUCTION',
    claimsParsed: claims !== null,
    hasRequiredClaim: claims?.role === 'authenticated',
    otherClaimKeys: claims ? Object.keys(claims).filter((k) => k !== 'role') : [],
    disabled: Boolean(user.disabled),
  };
});

const needing = rows.filter((r) => !r.hasRequiredClaim);
const targets = needing.filter((r) => includeProduction || r.scope === 'SYNTHETIC');
const applied = [];
if (mode === 'apply') {
  for (const row of targets) {
    const user = users.find((u) => u.localId === row.localId);
    // Merge: existing custom claims are preserved, only `role` is added or corrected.
    const merged = { ...(parseClaims(user.customAttributes) ?? {}), ...REQUIRED_CLAIM };
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
      { method: 'POST', headers,
        body: JSON.stringify({ localId: row.localId, customAttributes: JSON.stringify(merged) }) });
    applied.push({ uidFingerprint: row.uidFingerprint, scope: row.scope, http: response.status,
      ok: response.ok, preservedClaimKeys: row.otherClaimKeys });
  }
}

// Re-read so the verification reflects the server, not our intent.
const after = mode === 'apply' ? await listUsers() : users;
const verified = after.map((u) => parseClaims(u.customAttributes)?.role === 'authenticated');

const report = {
  generatedAt: new Date().toISOString(),
  project: PROJECT,
  mode,
  includeProduction,
  totalUsers: rows.length,
  byScope: rows.reduce((acc, r) => { acc[r.scope] = (acc[r.scope] ?? 0) + 1; return acc; }, {}),
  withRequiredClaimBefore: rows.filter((r) => r.hasRequiredClaim).length,
  withRequiredClaimAfter: verified.filter(Boolean).length,
  missingClaim: needing.map((r) => ({ uidFingerprint: r.uidFingerprint, scope: r.scope })),
  applied,
  productionClaimWrites: applied.filter((a) => a.scope === 'PRODUCTION').length,
  customerRecordsModified: mode === 'apply' ? applied.filter((a) => a.scope === 'PRODUCTION').length : 0,
  note: 'Firebase custom claims reach a client only on the next ID-token refresh; synthetic tests must force a refresh before asserting.',
  decision: verified.every(Boolean) ? 'ROLE_CLAIM_READY' : 'ROLE_CLAIM_INCOMPLETE',
};
writeFileSync('migration/reports/supabase-role-claim.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ mode, totalUsers: report.totalUsers, byScope: report.byScope,
  withRequiredClaimBefore: report.withRequiredClaimBefore, withRequiredClaimAfter: report.withRequiredClaimAfter,
  productionClaimWrites: report.productionClaimWrites, decision: report.decision }, null, 2));
if (report.decision !== 'ROLE_CLAIM_READY') process.exitCode = 2;
