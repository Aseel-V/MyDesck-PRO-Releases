/**
 * GitHub credential revocation evidence.
 *
 * The dry-run's `secret` gate used to be a hardcoded FAIL, so a genuine operator revocation could
 * never close it. This module replaces the constant with a validator, in the same shape as
 * `client-smoke-evidence.mjs`.
 *
 * Revocation is a fact about the provider, not about this repository: nothing here can observe it,
 * and authenticating with the credential to test it is forbidden. So the gate requires an explicit,
 * attributed operator confirmation AND evidence that the value is gone from the working tree and the
 * git index. Either half alone is insufficient — source cleanliness is not revocation, and a claimed
 * revocation while the value is still present locally is not a closed incident.
 *
 * Fails closed: missing, malformed, unattributed or still-present evidence is FAIL, never PASS.
 */

/**
 * @param {unknown} artifact parsed migration/reports/github-credential-revocation.json, or null
 * @returns {{status:'PASS'|'FAIL', reasons:string[], evidence:object}}
 */
export function evaluateSecretRevocation(artifact) {
  const reasons = [];
  const evidence = { present: Boolean(artifact), credentialType: null, revoked: null,
    revokedBy: null, revokedAt: null, removalVerified: null };

  if (!artifact || typeof artifact !== 'object') {
    return { status: 'FAIL', reasons: ['ARTIFACT_ABSENT'], evidence };
  }

  evidence.credentialType = artifact.credentialType ?? null;
  evidence.revoked = artifact.revoked ?? null;
  evidence.revokedBy = artifact.revokedBy ?? null;
  evidence.revokedAt = artifact.revokedAt ?? null;

  if (artifact.revoked !== true) reasons.push(`NOT_REVOKED:${artifact.revoked ?? 'ABSENT'}`);
  if (artifact.revocationConfirmed !== true) reasons.push('REVOCATION_UNCONFIRMED');
  if (typeof artifact.revokedBy !== 'string' || !artifact.revokedBy) reasons.push('REVOKED_BY_ABSENT');
  if (typeof artifact.revokedAt !== 'string' || Number.isNaN(Date.parse(artifact.revokedAt))) {
    reasons.push('REVOKED_AT_INVALID');
  }
  if (typeof artifact.credentialType !== 'string' || !artifact.credentialType) reasons.push('CREDENTIAL_TYPE_ABSENT');

  // A recorded secret value would itself be an incident; refuse to pass on such an artifact.
  if (artifact.secretValueRecorded !== false) reasons.push('SECRET_VALUE_MAY_BE_RECORDED');

  // The credential must also be gone locally, proven by fingerprint comparison rather than by claim.
  const removal = artifact.removalVerification;
  if (!removal || typeof removal !== 'object') {
    reasons.push('REMOVAL_VERIFICATION_ABSENT');
  } else {
    evidence.removalVerified = {
      workingTreeMatches: removal.workingTreeLeakFingerprintMatches ?? null,
      gitIndexMatches: removal.gitIndexLeakFingerprintMatches ?? null,
      assignmentsRemaining: removal.ghTokenAssignmentsRemaining ?? null,
    };
    for (const field of ['workingTreeLeakFingerprintMatches', 'gitIndexLeakFingerprintMatches',
      'ghTokenAssignmentsRemaining']) {
      if (removal[field] !== 0) reasons.push(`CREDENTIAL_STILL_PRESENT:${field}:${removal[field] ?? 'ABSENT'}`);
    }
  }
  if (artifact.stillPresentInLocalEnvironment === true) reasons.push('STILL_PRESENT_IN_LOCAL_ENVIRONMENT');

  return reasons.length
    ? { status: 'FAIL', reasons, evidence }
    : { status: 'PASS', reasons: [], evidence };
}
