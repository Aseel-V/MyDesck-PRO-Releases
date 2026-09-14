import { setStorageAccessTokenProvider, setStorageIdentityUidProvider } from './supabaseStorageClient';
import type { AuthGateway } from './domain/auth';

/**
 * Registers which identity the Storage client presents.
 *
 * This is the seam between the two eras, and it lives outside the Storage layer on purpose: the
 * Storage layer must never import the general Supabase client, because that client also exposes
 * `.from()`, `.rpc()` and `.auth`. Nothing here imports it either; the composition root passes in
 * whichever AuthGateway it registered.
 *
 * Supabase root: the gateway yields the Supabase session token. Firebase root: the gateway yields
 * the Firebase ID token, which Supabase Third-Party Auth verifies (RS256, proven end to end). Supabase
 * requires the token to carry `role: authenticated`; the Firebase import path sets that claim.
 */
export function registerStorageIdentity(auth: AuthGateway): () => void {
  let currentUid: string | null = auth.currentUid();
  const getUid = () => currentUid ?? auth.currentUid();
  bindStorageIdentity(async () => {
    const token = await auth.getAccessToken();
    currentUid = auth.currentUid();
    return token;
  }, getUid);
  // The uid must track sign-in and sign-out, not just the first read: private paths are {uid}/...
  return auth.onAuthStateChange((user) => { currentUid = user?.id ?? null; });
}

/**
 * Token plus uid, from one source.
 *
 * `getUid` is required, not optional: private paths are namespaced by uid, and omitting it is exactly
 * the defect that made every private read fail closed.
 */
export function bindStorageIdentity(
  getIdToken: () => Promise<string | null>,
  getUid: () => string | null,
): void {
  setStorageAccessTokenProvider(getIdToken);
  setStorageIdentityUidProvider(getUid);
}
