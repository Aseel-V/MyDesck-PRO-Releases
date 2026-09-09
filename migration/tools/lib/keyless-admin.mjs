import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { assertKeylessCredentials } from './adc-credentials.mjs';

export const PROJECT = 'mydesckpro';
export const MIGRATION_ACCOUNT = 'mydesck-migration@mydesckpro.iam.gserviceaccount.com';

/** This proof deliberately accepts only the operator's verified impersonation. */
export function assertProofCredentials(env = process.env) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('PROOF_REQUIRES_DEFAULT_ADC_AND_REAL_FIREBASE');
  }
  const credentials = assertKeylessCredentials(env);
  if (credentials.summary.credentialType !== 'impersonated_service_account' ||
      credentials.summary.impersonatedServiceAccount !== MIGRATION_ACCOUNT) {
    throw new Error('PROOF_REQUIRES_MIGRATION_SERVICE_ACCOUNT_IMPERSONATION');
  }
  return credentials;
}

export function openKeylessAdmin() {
  const credentials = assertProofCredentials();
  const app = initializeApp({ projectId: PROJECT, credential: applicationDefault() },
    `migration-proof-${process.pid}-${Date.now()}`);
  return { auth: getAuth(app), credentials: credentials.summary, close: () => deleteApp(app) };
}

/** Never turn permission/network errors into a false account-absence result. */
export async function lookupOrAbsent(lookup) {
  try { return await lookup(); }
  catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}
