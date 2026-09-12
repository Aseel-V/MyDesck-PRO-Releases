export type BackendMode = 'supabase' | 'firestore-emulator' | 'firestore';
export function selectBackend(env: Record<string, unknown>, host: string): BackendMode {
  const mode = env.VITE_DATA_BACKEND ?? 'supabase';
  if (!['supabase', 'firestore-emulator', 'firestore'].includes(String(mode))) throw Error('INVALID_BACKEND_MODE');
  if (mode === 'supabase') return mode;
  if (mode === 'firestore') {
    if (env.PROD !== true || env.DEV !== false) throw Error('REAL_FIRESTORE_REQUIRES_PRODUCTION_BUILD');
    if (env.VITE_FIREBASE_PROJECT_ID !== 'mydesckpro' || env.VITE_FIRESTORE_DATABASE_ID !== 'default') throw Error('REAL_FIRESTORE_TARGET_MISMATCH');
    if (env.VITE_FIRESTORE_PRODUCTION_RELEASE !== 'mydesck-firestore-v1') throw Error('REAL_FIRESTORE_RELEASE_NOT_APPROVED');
    if (env.VITE_SUPABASE_FALLBACK_DISABLED !== 'true') throw Error('SUPABASE_FALLBACK_MUST_BE_DISABLED');
    return 'firestore';
  }
  // Emulator mode is never accepted by a production build.
  if (env.PROD !== false || env.DEV !== true) throw Error('PRODUCTION_BACKEND_LOCKED');
  if (!['localhost', '127.0.0.1'].includes(host)) throw Error('MIGRATION_REQUIRES_LOOPBACK');
  if (env.VITE_FIREBASE_PROJECT_ID !== 'mydesck-migration-proof') throw Error('EMULATOR_PROJECT_REQUIRED');
  return 'firestore-emulator';
}
