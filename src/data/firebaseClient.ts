import { deleteApp, initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  connectAuthEmulator, getAuth, browserLocalPersistence, inMemoryPersistence, initializeAuth, setPersistence,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { selectBackend } from './backendMode';

/**
 * A second, short-lived Firebase identity in the same window: a manager approving an action at another
 * user's terminal. Its session is held in memory only, never persisted, and the app is deleted after use.
 */
export interface IsolatedIdentity {
  auth: Auth;
  db: Firestore;
  dispose(): Promise<void>;
}

function isolated(options: FirebaseOptions, databaseId: string | null, emulator: boolean): IsolatedIdentity {
  const app = initializeApp(options, `restaurant-approver-${crypto.randomUUID()}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { auth, db, dispose: () => deleteApp(app) };
}

export function createEmulatorClient(env: Record<string, unknown>, host: string) {
  if (selectBackend(env, host) !== 'firestore-emulator') throw Error('EMULATOR_MODE_REQUIRED');
  const options = { projectId: 'mydesck-migration-proof', apiKey: 'emulator-only', authDomain: 'localhost' };
  const app = initializeApp(options, 'travel-emulator');
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const ready = setPersistence(auth, browserLocalPersistence);
  return { mode: 'firestore-emulator' as const, app, auth, db, ready,
    maintenanceEnabled: false, isolatedIdentity: () => isolated(options, null, true) };
}

export function createProductionClient(env: Record<string, unknown>, host: string) {
  if (selectBackend(env, host) !== 'firestore') throw Error('PRODUCTION_FIRESTORE_MODE_REQUIRED');
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN'];
  for (const key of required) if (!env[key]) throw Error(`MISSING_${key}`);
  const options = { projectId: 'mydesckpro', apiKey: String(env.VITE_FIREBASE_API_KEY),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN) };
  const app = initializeApp(options,
  'travel-production');
  const auth = getAuth(app);
  const db = getFirestore(app, 'default');
  const ready = setPersistence(auth, browserLocalPersistence);
  return { mode: 'firestore' as const, app, auth, db, ready,
    maintenanceEnabled: env.VITE_MIGRATION_MAINTENANCE === 'true', isolatedIdentity: () => isolated(options, 'default', false) };
}
export type FirebaseClient = ReturnType<typeof createEmulatorClient> | ReturnType<typeof createProductionClient>;
