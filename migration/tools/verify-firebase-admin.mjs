#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { openKeylessAdmin, lookupOrAbsent, PROJECT } from './lib/keyless-admin.mjs';
import { makeTestEmail } from './lib/firebase-safety.mjs';
import { writeReport } from './lib/write-report.mjs';

const report = {
  generatedAt: new Date().toISOString(), projectId: PROJECT,
  initialized: false, readOnlyProof: 'NOT RUN', existingUsersModified: 0,
  staticPrivateKeyUsed: false, exposedHistoricalKeyUsed: false,
};
let admin;
try {
  admin = openKeylessAdmin();
  report.credentials = admin.credentials;
  report.initialized = true;
  // Exact random synthetic lookup: no enumeration and no customer records.
  const email = makeTestEmail(`adc-probe-${randomUUID()}`, 'example.test');
  const user = await lookupOrAbsent(() => admin.auth.getUserByEmail(email));
  report.readOnlyProof = 'PASS';
  report.operation = 'getUserByEmail (random migration-test-- email)';
  report.lookupResult = user ? 'exists; no action taken' : 'auth/user-not-found';
} catch (error) {
  report.readOnlyProof = 'FAIL';
  // SDK/network error messages may contain request bodies or credential data.
  report.errorCode = /^[a-zA-Z0-9_/-]+$/.test(error.code ?? '') ? error.code : 'ADMIN_PROOF_FAILED';
  process.exitCode = 1;
} finally {
  if (admin) await admin.close();
  writeReport('migration/reports/firebase-admin-keyless.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
