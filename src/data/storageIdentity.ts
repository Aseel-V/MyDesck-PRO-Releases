import { supabase } from '../lib/supabase';
import { setStorageAccessTokenProvider } from './supabaseStorageClient';

/**
 * Registers which identity the Storage client presents.
 *
 * This is the seam between the two eras, and it lives outside the Storage layer on purpose:
 * the Storage layer must never import the general Supabase client, because that client also
 * exposes `.from()`, `.rpc()` and `.auth`.
 *
 * Today the app authenticates with Supabase Auth, so the provider yields the Supabase session
 * token. Once Supabase Third-Party Auth for Firebase is enabled, `useFirebaseStorageIdentity`
 * replaces it with the Firebase ID token and no other Storage code changes. Supabase requires
 * the token to carry `role: authenticated`; the Firebase import path already sets that claim.
 */

export function useSupabaseStorageIdentity(): void {
  setStorageAccessTokenProvider(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  });
}

/**
 * Firebase-backed identity for Storage.
 *
 * Not wired into any composition root yet: Supabase Third-Party Auth for Firebase is not
 * enabled on the project, so a Firebase RS256 token is currently rejected at the algorithm
 * check. Enabling it is the only change required to switch over.
 */
export function useFirebaseStorageIdentity(getIdToken: () => Promise<string | null>): void {
  setStorageAccessTokenProvider(getIdToken);
}
