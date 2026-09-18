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
  // Identities whose token has already been refreshed once in this session.
  //
  // Supabase requires `role: authenticated`, and a custom claim written after a session signed in
  // does not appear in the token that session is holding: Firebase keeps the cached one until it is
  // close to expiring, so Storage fails for up to an hour. One forced refresh per identity closes
  // that window. It is once per identity rather than per request on purpose — refreshing on every
  // Storage call would be a token request per upload, and refreshing on failure would need a retry
  // path that can loop. After this, normal Firebase refresh behaviour resumes.
  const refreshed = new Set<string>();
  bindStorageIdentity(async () => {
    const uid = auth.currentUid();
    const force = uid !== null && !refreshed.has(uid);
    const token = await auth.getAccessToken(force);
    if (force && uid !== null) refreshed.add(uid);
    currentUid = auth.currentUid();
    return token;
  }, getUid);
  // The uid must track sign-in and sign-out, not just the first read: private paths are {uid}/...
  return auth.onAuthStateChange((user) => {
    currentUid = user?.id ?? null;
    // A signed-out identity gets a fresh forced refresh if it signs back in.
    if (user?.id) refreshed.delete(user.id);
  });
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
