/**
 * Supabase composition root: the shipped product until the Firebase cutover.
 *
 * It renders exactly the same UI as `src/firebase-main.tsx`; only the registered backend differs.
 * Storage identity is registered once, here, from the same gateway the app authenticates with.
 */
import { registerBackend } from './data/backend';
import { createSupabaseBackend } from './data/supabase/createSupabaseBackend';
import { registerStorageIdentity } from './data/storageIdentity';
import { renderApp } from './AppRoot';

const backend = createSupabaseBackend();
registerBackend(backend);
registerStorageIdentity(backend.auth);
renderApp();
