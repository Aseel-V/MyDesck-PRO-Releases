import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import {
  createSupabaseFetchWithLogging,
  validateSupabasePublicConfig,
} from './authNetwork';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

validateSupabasePublicConfig({ supabaseUrl, supabaseAnonKey });

const globalScope = globalThis as typeof globalThis & {
  __mydesck_supabase_client__?: ReturnType<typeof createClient<Database>>;
};

if (!globalScope.__mydesck_supabase_client__) {
  console.log('[Supabase] Initializing client with URL:', supabaseUrl);

  globalScope.__mydesck_supabase_client__ = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
      global: {
        fetch: createSupabaseFetchWithLogging(),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}

export const supabase = globalScope.__mydesck_supabase_client__;
// Admin client is removed for security. Use Edge Functions instead.

export type BusinessProfile = Database['public']['Tables']['business_profiles']['Row'];
