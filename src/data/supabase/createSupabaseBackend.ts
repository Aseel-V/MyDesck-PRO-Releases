import type { ProductBackend } from '../domain/ProductBackend';
import { SupabaseAdminRepository } from './SupabaseAdminRepository';
import { SupabaseAuthGateway } from './SupabaseAuthGateway';
import { SupabaseProfileRepository } from './SupabaseProfileRepository';
import { SupabaseSupermarketRepository } from './SupabaseSupermarketRepository';

/**
 * The shipped product's backend until cutover. Imported only by `src/production-main.tsx`; the
 * Firebase composition root must never reach this module (enforced by the Firebase root guard).
 */
export function createSupabaseBackend(): ProductBackend {
  return {
    kind: 'supabase',
    auth: new SupabaseAuthGateway(),
    profiles: new SupabaseProfileRepository(),
    admin: new SupabaseAdminRepository(),
    supermarket: new SupabaseSupermarketRepository(),
  };
}
