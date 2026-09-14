import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase client that can only reach Storage.
 *
 * Supabase Storage is the one Supabase dependency the target architecture keeps. Retaining it
 * must not retain a general-purpose client: `src/lib/supabase.ts` also exposes `.from()`,
 * `.rpc()`, `.auth` and `.channel()`, and any module importing it inherits the whole surface.
 *
 * This module exposes a `StorageBackend` - the `storage` handle and nothing else. The
 * underlying client is created here, never exported and never returned, so business code
 * cannot widen it back into a database client even by accident.
 *
 * Identity is injected rather than imported, which is what lets the same module serve both
 * eras. supabase-js 2.89 accepts `accessToken?: () => Promise<string | null>`; its own
 * documentation describes this as the way to use a third-party authentication provider. Today
 * the registered provider yields the Supabase session token. After the Firebase cutover it
 * yields `firebaseUser.getIdToken()`, which Supabase verifies through Third-Party Auth - at
 * which point nothing in this module changes.
 *
 * Supabase requires the presented token to carry `role: authenticated`, or every RLS predicate
 * denies. The migration import path already sets that custom claim on Firebase users.
 */

export type AccessTokenProvider = () => Promise<string | null>;

/** The only capability this module hands out. No `from`, `rpc`, `auth` or `channel`. */
export type StorageBackend = SupabaseClient['storage'];

/** Anonymous until a provider is registered: public reads work, private access fails closed. */
let provider: AccessTokenProvider = async () => null;
let client: SupabaseClient | null = null;

/**
 * Registers the identity used for Storage requests.
 *
 * Called once from the composition root. Registering after the client exists is still
 * effective: supabase-js invokes the provider per request, and the indirection below means the
 * client always calls whichever provider is currently registered.
 */
export function setStorageAccessTokenProvider(next: AccessTokenProvider): void {
  provider = next;
}

function ensureClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) throw new Error('STORAGE_PUBLIC_CONFIG_REQUIRED');
  client = createClient(url, publishableKey, {
    // The indirection keeps a late-registered provider effective.
    accessToken: () => provider(),
    // This client never manages a session of its own; that belongs to the app's auth provider.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Process-wide Storage backend. Returns `StorageBackend`, never `SupabaseClient`. */
export function getStorageBackend(): StorageBackend {
  return ensureClient().storage;
}

/** Test seam only. Never call from application code. */
export function resetStorageBackendForTests(): void {
  client = null;
  provider = async () => null;
}
