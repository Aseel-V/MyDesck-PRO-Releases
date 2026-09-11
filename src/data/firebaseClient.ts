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
  return { app, auth, db, functions, storage, ready };
}
export type FirebaseClient = ReturnType<typeof createEmulatorClient>;
