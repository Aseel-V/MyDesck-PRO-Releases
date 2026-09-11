import { supabase } from '../lib/supabase';
import type { StorageRepository } from './contracts';

/** Private signatures must be downloaded with the session, never a public URL. */
export class SupabaseStorageRepository implements StorageRepository {
  private async authorize(path: string) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || !path.startsWith(`${data.user.id}/`) || path.includes('..')) throw Error('PRIVATE_PATH_DENIED');
    return path;
  }
  async readPrivateFile(path: string) {
    const { data, error } = await supabase.storage.from('business-signatures').download(await this.authorize(path));
    if (error || !data) throw Error('PRIVATE_DOWNLOAD_FAILED');
    return data;
  }
  async uploadPrivateFile(path: string, file: Blob) {
    const { error } = await supabase.storage.from('business-signatures').upload(await this.authorize(path), file, { upsert: false, contentType: file.type, cacheControl: '0' });
    if (error) throw Error('PRIVATE_UPLOAD_FAILED');
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/business-signatures/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
}
