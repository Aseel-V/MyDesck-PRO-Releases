#!/usr/bin/env node
/**
 * VERIFY CREDENTIAL SOURCE — the gate before any Firebase Admin operation.
 *
 * Prints credential TYPE, project and impersonated service-account email only.
 * Never a token, never a refresh token, never ADC file contents, never a key.
 *
 * Exit codes
 *   0  keyless credentials verified, Admin SDK may initialise
 *   1  a check failed
 *   2  no credential source at all (NOT RUN)
 *
 *   node migration/tools/verify-firebase-credentials.mjs
 */

import { verifyCredentialSource, REQUIRED_IAM, EXPECTED_PROJECT_ID } from './lib/adc-credentials.mjs';

const r = verifyCredentialSource(process.env);

console.log('\n  VERIFY CREDENTIAL SOURCE\n');
for (const c of r.checks) {
  console.log(`  ${c.passed ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(52)} ${c.detail}`);
}

console.log('\n  REPORTED CREDENTIAL FACTS (no secrets)\n');
console.log(`  firebase project ............... ${r.summary.firebaseProject}`);
console.log(`  production project ............. ${r.summary.isProductionProject ? 'YES — safe-test rules apply' : 'no'}`);
console.log(`  ADC present .................... ${r.summary.adcPresent ? 'yes' : 'NO'}`);
console.log(`  credential type ................ ${r.summary.credentialType ?? 'n/a'}`);
console.log(`  impersonated service account ... ${r.summary.impersonatedServiceAccount ?? 'none'}`);
console.log(`  static private key used ........ ${r.summary.staticPrivateKeyUsed ? 'YES — FORBIDDEN' : 'NO'}`);

if (r.passed) {
  console.log('\n  PASS — keyless credentials verified. Admin SDK may initialise.\n');
  process.exit(0);
}

console.log('\n  BLOCKED — Firebase Admin must not initialise.\n');
console.log('  To establish keyless credentials, the operator runs these');
console.log('  interactively (both open a browser consent screen and cannot be');
console.log('  automated from here):\n');
console.log('    gcloud auth login');
console.log(`    gcloud config set project ${EXPECTED_PROJECT_ID}`);
console.log('    gcloud auth application-default login \\');
console.log('      --impersonate-service-account=<MIGRATION_SERVICE_ACCOUNT>\n');
console.log(`    setx GOOGLE_CLOUD_PROJECT ${EXPECTED_PROJECT_ID}`);
console.log(`    setx FIREBASE_PROJECT_ID ${EXPECTED_PROJECT_ID}\n`);
console.log('  Minimum IAM on the migration service account:');
console.log(`    ${REQUIRED_IAM.role}`);
for (const c of REQUIRED_IAM.covers) console.log(`      covers: ${c}`);
for (const c of REQUIRED_IAM.alsoNeededByTheCaller) console.log(`      also:   ${c}`);
console.log('    NOT granted:');
for (const c of REQUIRED_IAM.explicitlyNotGranted) console.log(`      - ${c}`);
console.log('');

process.exit(r.summary.adcPresent ? 1 : 2);
