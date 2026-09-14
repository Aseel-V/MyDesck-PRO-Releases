import { supabase } from '../lib/supabase';
import { setStorageAccessTokenProvider, setStorageIdentityUidProvider } from './supabaseStorageClient';

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

let currentUid: string | null = null;

export function useSupabaseStorageIdentity(): void {
  setStorageAccessTokenProvider(async () => {
    const { data } = await supabase.auth.getSession();
    currentUid = data.session?.user?.id ?? null;
    return data.session?.access_token ?? null;
  });
  setStorageIdentityUidProvider(() => currentUid);
  // Seed eagerly so the first private read does not depend on a prior token fetch.
  void supabase.auth.getSession().then(({ data }) => { currentUid = data.session?.user?.id ?? null; });
  supabase.auth.onAuthStateChange((_event, session) => { currentUid = session?.user?.id ?? null; });
}

/**
 * Firebase-backed identity for Storage.
 *
 * Supabase Third-Party Auth for Firebase is enabled on the project and proven end to end, so a
 * Firebase RS256 token is accepted by Storage today. This is not wired into a composition root
 * yet because the app still authenticates with Supabase Auth; swapping the call in
 * `production-main.tsx` is the whole change at cutover.
 *
 * `getUid` is required, not optional: private paths are namespaced by uid, and omitting it is
 * exactly the defect that made every private read fail closed.
 */
export function useFirebaseStorageIdentity(
  getIdToken: () => Promise<string | null>,
  getUid: () => string | null,
): void {
  setStorageAccessTokenProvider(getIdToken);
  setStorageIdentityUidProvider(getUid);
}
