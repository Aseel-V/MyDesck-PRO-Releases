/**
 * Firebase production composition root.
 *
 * Firebase Auth + Firestore + Rules for every active vertical, with Supabase Storage reached only
 * through StorageRepository. It renders the same product as `src/production-main.tsx`; only the
 * registered backend differs. Selected by `src/main.tsx` for the `firestore` and
 * `firestore-emulator` modes; the backend-mode guard keeps the emulator out of production builds and
 * requires the Spark / billing-disabled release flags for the real project.
 */
import { selectBackend } from './data/backendMode';
import { createEmulatorClient, createProductionClient } from './data/firebaseClient';
import { createFirestoreBackend } from './data/firestore/createFirestoreBackend';
import { registerBackend } from './data/backend';
import { registerStorageIdentity } from './data/storageIdentity';
import { renderApp } from './AppRoot';

const mode = selectBackend(import.meta.env, location.hostname);
const client = mode === 'firestore'
  ? createProductionClient(import.meta.env, location.hostname)
  : createEmulatorClient(import.meta.env, location.hostname);
const backend = createFirestoreBackend(client);
registerBackend(backend);
// Supabase Third-Party Auth accepts the Firebase RS256 ID token; UIDs are preserved, so the
// {uid}/... private Storage paths keep matching.
registerStorageIdentity(backend.auth);
renderApp();
