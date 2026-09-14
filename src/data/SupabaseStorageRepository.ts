import { getStorageBackend, getStorageIdentityUid } from './supabaseStorageClient';
import type { StorageRepository, StorageUploadOptions } from './contracts';

/** The private bucket that holds business signatures. Never served over a public URL. */
export const SIGNATURE_BUCKET = 'business-signatures';

/**
 * The production Storage implementation.
 *
 * It reaches Supabase only through `getStorageBackend()`, which exposes the `storage` handle
 * and nothing else, so no database, RPC, Auth or realtime API is reachable from here. Identity
 * comes from the registered access-token provider: the Supabase session today, the Firebase ID
 * token after Third-Party Auth is enabled.
 *
 * `uid` comes from the identity registered at the composition root, not from a Supabase
 * session: reading `supabase.auth.getUser()` here would reintroduce the Auth surface and break
 * the moment Supabase Auth is removed. A caller may still pass one explicitly. Because UIDs are
 * preserved across the migration, the `{uid}/...` path model is unchanged on either side of the
 * cutover.
 */
export class SupabaseStorageRepository implements StorageRepository {
  private readonly uid: string | null;

  // Defaults to the registered identity. An earlier revision defaulted to null, which made
  // every private read and upload throw PRIVATE_PATH_DENIED at call sites that pass nothing.
  constructor(uid?: string | null) {
    this.uid = uid === undefined ? getStorageIdentityUid() : uid;
  }

  /**
   * Private paths are namespaced by owner. Rejecting traversal here is defence in depth: the
   * Storage RLS policy is the actual boundary, and it is enforced server-side.
   */
  private authorize(path: string): string {
    if (!this.uid) throw new Error('PRIVATE_PATH_DENIED');
    if (!path.startsWith(`${this.uid}/`) || path.includes('..')) throw new Error('PRIVATE_PATH_DENIED');
    return path;
  }

  async readPrivateFile(path: string): Promise<Blob> {
    const { data, error } = await getStorageBackend().from(SIGNATURE_BUCKET).download(this.authorize(path));
    if (error || !data) throw new Error('PRIVATE_DOWNLOAD_FAILED');
    return data;
  }

  async uploadPrivateFile(path: string, file: Blob): Promise<string> {
    const authorized = this.authorize(path);
    const { error } = await getStorageBackend().from(SIGNATURE_BUCKET)
      .upload(authorized, file, { upsert: false, contentType: file.type, cacheControl: '0' });
    if (error) throw new Error('PRIVATE_UPLOAD_FAILED');
    // An authenticated object reference, never a public URL.
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/${SIGNATURE_BUCKET}/${authorized.split('/').map(encodeURIComponent).join('/')}`;
  }

  async upload(bucket: string, path: string, file: Blob, options: StorageUploadOptions = {}): Promise<void> {
    const { error } = await getStorageBackend().from(bucket).upload(path, file, {
      upsert: options.upsert ?? false,
      contentType: options.contentType ?? file.type,
      ...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
    });
    if (error) throw error;
  }

  async download(bucket: string, path: string): Promise<Blob> {
    const { data, error } = await getStorageBackend().from(bucket).download(path);
    if (error || !data) throw new Error('STORAGE_DOWNLOAD_FAILED');
    return data;
  }

  publicUrl(bucket: string, path: string): string {
    if (bucket === SIGNATURE_BUCKET) throw new Error('SIGNATURES_ARE_NEVER_PUBLIC');
    return getStorageBackend().from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await getStorageBackend().from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw error ?? new Error('SIGNED_URL_FAILED');
    return data.signedUrl;
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await getStorageBackend().from(bucket).remove(paths);
    if (error) throw error;
  }
}
