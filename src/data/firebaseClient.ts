import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { selectBackend } from './backendMode';

export function createEmulatorClient(env: Record<string, unknown>, host: string) {
  if (selectBackend(env, host) !== 'firestore-emulator') throw Error('EMULATOR_MODE_REQUIRED');
  const app = initializeApp({ projectId: 'mydesck-migration-proof', apiKey: 'emulator-only', authDomain: 'localhost' }, 'travel-emulator');
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const ready = setPersistence(auth, browserLocalPersistence);
  return { mode: 'firestore-emulator' as const, app, auth, db, ready,
    maintenanceEnabled: false };
}

export function createProductionClient(env: Record<string, unknown>, host: string) {
  if (selectBackend(env, host) !== 'firestore') throw Error('PRODUCTION_FIRESTORE_MODE_REQUIRED');
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN'];
  for (const key of required) if (!env[key]) throw Error(`MISSING_${key}`);
  const app = initializeApp({ projectId: 'mydesckpro', apiKey: String(env.VITE_FIREBASE_API_KEY),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN) },
  'travel-production');
  const auth = getAuth(app);
  const db = getFirestore(app, 'default');
  const ready = setPersistence(auth, browserLocalPersistence);
  return { mode: 'firestore' as const, app, auth, db, ready,
    maintenanceEnabled: env.VITE_MIGRATION_MAINTENANCE === 'true' };
}
export type FirebaseClient = ReturnType<typeof createEmulatorClient> | ReturnType<typeof createProductionClient>;
