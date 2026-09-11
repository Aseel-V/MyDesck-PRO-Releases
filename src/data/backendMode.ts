export type BackendMode = 'supabase' | 'firestore-emulator' | 'firestore';
export function selectBackend(env: Record<string, unknown>, host: string): BackendMode {
  const mode = env.VITE_DATA_BACKEND ?? 'supabase';
  if (!['supabase', 'firestore-emulator', 'firestore'].includes(String(mode))) throw Error('INVALID_BACKEND_MODE');
  if (mode === 'supabase') return mode;
  // Phase 2 is emulator-only. Production builds cannot opt out of this guard.
  if (env.PROD !== false || env.DEV !== true) throw Error('PRODUCTION_BACKEND_LOCKED');
  if (!['localhost', '127.0.0.1'].includes(host)) throw Error('MIGRATION_REQUIRES_LOOPBACK');
  if (mode === 'firestore') throw Error('REAL_FIRESTORE_APPLICATION_NOT_APPROVED');
  if (env.VITE_FIREBASE_PROJECT_ID !== 'mydesck-migration-proof') throw Error('EMULATOR_PROJECT_REQUIRED');
  return 'firestore-emulator';
}
