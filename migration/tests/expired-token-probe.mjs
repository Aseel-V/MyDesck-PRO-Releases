// Dedicated process: simulate expiry of a genuinely signed Firebase ID token.
// Token arrives over stdin only and is never written or printed.
import { openKeylessAdmin } from '../tools/lib/keyless-admin.mjs';
let input = '';
for await (const part of process.stdin) input += part;
const { token, expiry } = JSON.parse(input);
input = '';
const admin = openKeylessAdmin();
const originalNow = Date.now;
try {
  Date.now = () => (expiry + 60) * 1000;
  await admin.auth.verifyIdToken(token);
  console.log('EXPIRED_TOKEN_ACCEPTED');
  process.exitCode = 1;
} catch (error) {
  const rejected = error.code === 'auth/id-token-expired';
  console.log(rejected ? 'auth/id-token-expired' : 'UNEXPECTED_VERIFIER_ERROR');
  process.exitCode = rejected ? 0 : 1;
} finally { Date.now = originalNow; await admin.close(); }
