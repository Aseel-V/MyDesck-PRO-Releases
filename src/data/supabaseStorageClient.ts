import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase client that can only reach Storage.
 *
 * Supabase Storage is the one Supabase dependency the target architecture keeps. Retaining it
 * must not retain a general-purpose client: `src/lib/supabase.ts` also exposes `.from()`,
 * `.rpc()`, `.auth` and `.channel()`, and any module importing it inherits the whole surface.
 *
 * This module therefore exposes a `StorageBackend` - the `storage` handle and nothing else.
 * The underlying client is created here, never exported, and never returned. Business code
 * cannot reach a database, RPC, Auth or realtime API through this module even by accident.
 *
 * Authentication: the token provider is injected. During the Supabase-Auth era it yields the
 * Supabase session token; after the Firebase cutover it yields the Firebase ID token, which
 * Supabase verifies through Third-Party Auth. Supabase requires the token to carry
 * `role: authenticated`; the migration import path already sets that custom claim.
 */

export type AccessTokenProvider = () => Promise<string | null>;

/** The only capability this module hands out. No `from`, `rpc`, `auth` or `channel`. */
export type StorageBackend = SupabaseClient['storage'];

let cached: { client: SupabaseClient; provider: AccessTokenProvider } | null = null;

export function createStorageBackend(
  url: string,
  publishableKey: string,
  accessToken: AccessTokenProvider,
): StorageBackend {
  if (!url || !publishableKey) throw new Error('STORAGE_PUBLIC_CONFIG_REQUIRED');
  // `accessToken` makes supabase-js delegate identity to the provider. It also makes the
  // client refuse its own auth methods, which is exactly the isolation we want.
  const client = createClient(url, publishableKey, {
    accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  cached = { client, provider: accessToken };
  return client.storage;
}

/**
 * Process-wide Storage backend.
 *
 * Kept module-private so a caller cannot widen it back into a database client: the getter
 * returns `StorageBackend`, not `SupabaseClient`.
 */
export function getStorageBackend(): StorageBackend {
  if (!cached) throw new Error('STORAGE_BACKEND_NOT_INITIALISED');
  return cached.client.storage;
}

export function isStorageBackendInitialised(): boolean {
  return cached !== null;
}

/** Test seam only. Never call from application code. */
export function resetStorageBackendForTests(): void {
  cached = null;
}
