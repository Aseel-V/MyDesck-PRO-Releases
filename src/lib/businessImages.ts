import { SupabaseStorageRepository } from '../data/SupabaseStorageRepository';
import { supabase } from './supabase';

// Keep stable references in profiles; resolve private objects only for display.
export function businessImageReference(value: string | null | undefined): { bucket: string; path: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|authenticated|sign)\/(logos|business-signatures)\/(.+)$/);
    return match ? { bucket: match[1], path: decodeURIComponent(match[2]) } : null;
  } catch { return null; }
}

export function canonicalBusinessImage(value: string | null | undefined): string | null {
  const ref = businessImageReference(value);
  if (!ref) return value || null;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/${ref.bucket}/${ref.path.split('/').map(encodeURIComponent).join('/')}`;
}

export async function resolveBusinessImage(value: string | null | undefined): Promise<string | null> {
  const ref = businessImageReference(value);
  if (!ref) return value || null;
  if (ref.bucket === 'business-signatures') {
    try { const blob = await new SupabaseStorageRepository().readPrivateFile(ref.path);
      return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    } catch { return null; }
  }
  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 600);
  return error ? null : data.signedUrl;
}

export async function resolvePrivateSignature(value: string | null | undefined): Promise<string | null> {
  if (value?.startsWith('data:image/')) return value;
  const reference = businessImageReference(value);
  if (!reference || reference.bucket !== 'business-signatures') return null;
  return resolveBusinessImage(value);
}
