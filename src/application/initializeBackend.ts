import { selectBackend } from '../data/backendMode';

let initialization: Promise<void> | null = null;

export function initializeBackend(): Promise<void> {
  if (initialization) return initialization;

  initialization = (async () => {
    const mode = selectBackend(import.meta.env, window.location.hostname);
    const [{ registerBackend }, { registerStorageIdentity }] = await Promise.all([
      import('../data/backend'),
      import('../data/storageIdentity'),
    ]);

    if (mode === 'supabase') {
      const { createSupabaseBackend } = await import('../data/supabase/createSupabaseBackend');
      const backend = createSupabaseBackend();
      registerBackend(backend);
      registerStorageIdentity(backend.auth);
      return;
    }

    const [{ createEmulatorClient, createProductionClient }, { createFirestoreBackend }] = await Promise.all([
      import('../data/firebaseClient'),
      import('../data/firestore/createFirestoreBackend'),
    ]);
    const client = mode === 'firestore'
      ? createProductionClient(import.meta.env, window.location.hostname)
      : createEmulatorClient(import.meta.env, window.location.hostname);
    const backend = createFirestoreBackend(client);
    registerBackend(backend);
    registerStorageIdentity(backend.auth);
  })();

  return initialization;
}

