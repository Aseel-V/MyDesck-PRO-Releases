import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('APP_FIXTURE_REQUIRES_LOCAL_EMULATORS');
}
const payload = JSON.parse(readFileSync('migration/firestore/export.local/synthetic-payloads.json', 'utf8'));
if (payload.authUsers.length !== 2
  || !payload.authUsers.every((user) => user.email.startsWith('migration-test--'))) {
  throw new Error('SYNTHETIC_IDENTITIES_REQUIRED');
}
const app = initializeApp({ projectId: 'mydesck-migration-proof' }, `app-fixture-${process.pid}`);
const auth = getAuth(app);
const password = `Emulator-${randomBytes(12).toString('base64url')}!9`;
for (const user of payload.authUsers) {
  try { await auth.deleteUser(user.id); } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  await auth.createUser({ uid: user.id, email: user.email, emailVerified: true, password });
}
mkdirSync('migration/app-layer.local', { recursive: true });
writeFileSync('migration/app-layer.local/app-credentials.json', JSON.stringify({
  projectId: 'mydesck-migration-proof', users: payload.authUsers.map(({ id: uid, email }) => ({ uid, email })), password,
}, null, 2));
await deleteApp(app);
console.log(JSON.stringify({ identities: payload.authUsers.length, uidPreserved: true, output: 'local ignored file' }));
