import type { ProductBackend } from '../domain/ProductBackend';
import { SupabaseAdminRepository } from './SupabaseAdminRepository';
import { SupabaseAuthGateway } from './SupabaseAuthGateway';
import { SupabaseProfileRepository } from './SupabaseProfileRepository';
import { SupabaseSupermarketRepository } from './SupabaseSupermarketRepository';
import { SupabaseAutoRepairRepository } from './SupabaseAutoRepairRepository';
import { SupabaseTravelDashboardRepository } from './SupabaseTravelDashboardRepository';
import { SupabaseCarPartsRepository } from './SupabaseCarPartsRepository';
import { SupabaseRestaurantRepository } from './SupabaseRestaurantRepository';

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
    autoRepair: new SupabaseAutoRepairRepository(),
    travelDashboard: new SupabaseTravelDashboardRepository(),
    carParts: new SupabaseCarPartsRepository(),
    restaurant: new SupabaseRestaurantRepository(),
  };
}
