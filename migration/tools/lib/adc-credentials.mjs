/**
 * Keyless credential verification for Firebase Admin.
 *
 * The operator's rule: Admin SDK must initialise from Application Default
 * Credentials backed by a user login or service-account impersonation. A static
 * service-account private key is forbidden, and the specific key exposed on
 * 2026-09-09 must never be loaded.
 *
 * This module decides whether a credential source is acceptable. It reads only
 * the `type` discriminator and, for impersonation, the target service-account
 * email from the impersonation URL. It never reads, returns or logs a token,
 * a refresh token, a client secret or any private key.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVOKED_KEY_IDS, PRODUCTION_PROJECT_IDS } from './firebase-safety.mjs';

export const EXPECTED_PROJECT_ID = 'mydesckpro';

/**
 * Where gcloud writes ADC. CLOUDSDK_CONFIG overrides the default location.
 */
export function adcSearchPaths(env = process.env) {
  const paths = [];
  if (env.CLOUDSDK_CONFIG) {
    paths.push(join(env.CLOUDSDK_CONFIG, 'application_default_credentials.json'));
  }
  if (env.APPDATA) {
    paths.push(join(env.APPDATA, 'gcloud', 'application_default_credentials.json'));
  }
  if (env.HOME || env.USERPROFILE) {
    paths.push(join(env.HOME ?? env.USERPROFILE, '.config', 'gcloud',
      'application_default_credentials.json'));
  }
  return paths;
}

export function findAdc(env = process.env) {
  for (const p of adcSearchPaths(env)) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Classify an ADC file by credential type, without touching secret material.
 *
 *   authorized_user              user login          -> acceptable
 *   impersonated_service_account impersonation       -> preferred
 *   external_account             workload identity   -> acceptable (keyless)
 *   service_account              static private key  -> REFUSED
 */
export function inspectAdc(path) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
  catch { return { ok: false, reason: 'not_valid_json' }; }

  const type = parsed.type ?? null;

  // Only the impersonation target email is extracted, from the URL path.
  let impersonatedServiceAccount = null;
  const url = parsed.service_account_impersonation_url;
  if (typeof url === 'string') {
    const m = /serviceAccounts\/([^:/]+):generateAccessToken/.exec(url);
    impersonatedServiceAccount = m ? m[1] : null;
  }

  return {
    ok: true,
    path,
    type,
    isStaticPrivateKey: type === 'service_account',
    isUserCredential: type === 'authorized_user',
    isImpersonation: type === 'impersonated_service_account' || Boolean(impersonatedServiceAccount),
    isWorkloadIdentity: type === 'external_account',
    impersonatedServiceAccount,
    // Present only on a static-key ADC; recorded so a revoked key is caught here too.
    keyId: parsed.private_key_id ?? null,
    isRevokedKey: parsed.private_key_id ? REVOKED_KEY_IDS.has(parsed.private_key_id) : false,
    quotaProjectId: parsed.quota_project_id ?? null,
  };
}

/**
 * Check GOOGLE_APPLICATION_CREDENTIALS. It must be absent, or point at
 * something that is not a revoked static key.
 */
export function inspectGacEnv(env = process.env) {
  const p = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!p) return { set: false, acceptable: true, reason: 'absent' };
  if (!existsSync(p)) {
    return { set: true, acceptable: false, path: p, reason: 'points_at_missing_file' };
  }
  let parsed;
  try { parsed = JSON.parse(readFileSync(p, 'utf8')); }
  catch { return { set: true, acceptable: false, path: p, reason: 'unparseable' }; }

  const keyId = parsed.private_key_id ?? null;
  if (keyId && REVOKED_KEY_IDS.has(keyId)) {
    return { set: true, acceptable: false, path: p, reason: 'references_revoked_key', keyId };
  }
  if (parsed.type === 'service_account') {
    return { set: true, acceptable: false, path: p, reason: 'static_private_key_forbidden' };
  }
  return { set: true, acceptable: true, path: p, reason: 'non_key_credential' };
}

/**
 * Full VERIFY CREDENTIAL SOURCE checklist.
 * Returns a structured result; never throws on a missing credential, because
 * the caller needs the whole picture to report, not the first failure.
 */
export function verifyCredentialSource(env = process.env) {
  const checks = [];
  const add = (name, passed, detail) => checks.push({ name, passed, detail });

  const gac = inspectGacEnv(env);
  add('GOOGLE_APPLICATION_CREDENTIALS absent or not the exposed key',
    gac.acceptable,
    gac.set ? `set: ${gac.reason}` : 'absent');

  const project = env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT ?? null;
  add('GOOGLE_CLOUD_PROJECT == mydesckpro',
    project === EXPECTED_PROJECT_ID,
    project ?? 'absent');

  const fbProject = env.FIREBASE_PROJECT_ID ?? null;
  add('FIREBASE_PROJECT_ID == mydesckpro',
    fbProject === EXPECTED_PROJECT_ID,
    fbProject ?? 'absent');

  const adcPath = findAdc(env);
  add('ADC exists', Boolean(adcPath), adcPath ? 'found' : 'not found in any gcloud config location');

  let adc = null;
  if (adcPath) {
    adc = inspectAdc(adcPath);
    add('ADC is user credentials or impersonation',
      Boolean(adc.ok && (adc.isUserCredential || adc.isImpersonation || adc.isWorkloadIdentity)),
      adc.ok ? (adc.type ?? 'unknown') : adc.reason);
    add('no static private key in use',
      Boolean(adc.ok && !adc.isStaticPrivateKey && !adc.isRevokedKey),
      adc.ok && adc.isStaticPrivateKey ? 'ADC is a service_account key' : 'ok');
  } else {
    add('ADC is user credentials or impersonation', false, 'no ADC to classify');
    add('no static private key in use', false, 'no ADC to classify');
  }

  const passed = checks.every((c) => c.passed);

  return {
    passed,
    checks,
    summary: {
      firebaseProject: EXPECTED_PROJECT_ID,
      isProductionProject: PRODUCTION_PROJECT_IDS.has(EXPECTED_PROJECT_ID),
      adcPresent: Boolean(adcPath),
      credentialType: adc?.type ?? null,
      impersonatedServiceAccount: adc?.impersonatedServiceAccount ?? null,
      staticPrivateKeyUsed: Boolean(adc?.isStaticPrivateKey),
    },
  };
}

/**
 * The gate every keyless Admin-SDK entry point calls first.
 * Throws with a machine-readable code so the caller reports the right verdict.
 */
export function assertKeylessCredentials(env = process.env) {
  const r = verifyCredentialSource(env);
  if (!r.passed) {
    const failed = r.checks.filter((c) => !c.passed).map((c) => `${c.name} (${c.detail})`);
    const e = new Error(`keyless credential verification failed:\n  - ${failed.join('\n  - ')}`);
    e.code = 'ADC_NOT_READY';
    e.result = r;
    throw e;
  }
  return r;
}

/**
 * Minimum IAM required for the Firebase auth proof, for the operator to grant.
 * Deliberately narrow: no Owner, no Editor, no Storage, no Firestore, no Cloud SQL.
 */
export const REQUIRED_IAM = {
  role: 'roles/firebaseauth.admin',
  covers: [
    'Firebase Authentication user import (importUsers)',
    'Firebase Authentication user lookup (getUser / getUserByEmail)',
    'Firebase Authentication user deletion — only for migration-test identities, only on explicit approval',
  ],
  explicitlyNotGranted: [
    'roles/owner', 'roles/editor',
    'roles/storage.admin', 'roles/datastore.owner', 'roles/cloudsql.admin',
    'roles/firebase.admin (too broad — grants Firestore, Storage and Hosting)',
  ],
  alsoNeededByTheCaller: [
    'roles/iam.serviceAccountTokenCreator on the migration service account, ' +
    'granted to the human operator, so impersonation can mint short-lived tokens',
  ],
};
