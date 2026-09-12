import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { selectBackend } from './backendMode';

export function createEmulatorClient(env: Record<string, unknown>, host: string) {
  if (selectBackend(env, host) !== 'firestore-emulator') throw Error('EMULATOR_MODE_REQUIRED');
  const app = initializeApp({ projectId: 'mydesck-migration-proof', apiKey: 'emulator-only', authDomain: 'localhost', storageBucket: 'mydesck-migration-proof.appspot.com' }, 'travel-emulator');
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const functions = getFunctions(app); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', 9199);
  const ready = setPersistence(auth, browserLocalPersistence);
  return { mode: 'firestore-emulator' as const, app, auth, db, functions, storage, ready,
    maintenanceEnabled: false };
}

export function createProductionClient(env: Record<string, unknown>, host: string) {
  if (selectBackend(env, host) !== 'firestore') throw Error('PRODUCTION_FIRESTORE_MODE_REQUIRED');
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_STORAGE_BUCKET'];
  for (const key of required) if (!env[key]) throw Error(`MISSING_${key}`);
  const app = initializeApp({ projectId: 'mydesckpro', apiKey: String(env.VITE_FIREBASE_API_KEY),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN), storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET) },
  'travel-production');
  const auth = getAuth(app);
  const db = getFirestore(app, 'default');
  const functions = getFunctions(app, 'us-central1');
  const storage = getStorage(app);
  const ready = setPersistence(auth, browserLocalPersistence);
  return { mode: 'firestore' as const, app, auth, db, functions, storage, ready,
    maintenanceEnabled: env.VITE_MIGRATION_MAINTENANCE === 'true' };
}
export type FirebaseClient = ReturnType<typeof createEmulatorClient> | ReturnType<typeof createProductionClient>;
