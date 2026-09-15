/**
 * Every backend capability the product UI uses.
 *
 * One implementation per composition root: `src/production-main.tsx` registers the Supabase
 * backend (the shipped product until cutover), `src/firebase-main.tsx` registers the Firestore
 * backend. UI modules depend on this interface only, which is what lets the Firebase root's import
 * graph exclude the general Supabase client entirely.
 */
import type { AuthGateway } from './auth';
import type { ProfileRepository } from './profiles';
import type { AdminRepository } from './admin';
import type { SupermarketRepository } from './supermarket';
import type { AutoRepairRepository } from './autoRepair';
import type { TravelDashboardRepository } from './travelDashboard';
import type { CarPartsRepository } from './carParts';

export type BackendKind = 'supabase' | 'firestore' | 'firestore-emulator';

export interface ProductBackend {
  readonly kind: BackendKind;
  readonly auth: AuthGateway;
  readonly profiles: ProfileRepository;
  readonly admin: AdminRepository;
  readonly supermarket: SupermarketRepository;
  readonly autoRepair: AutoRepairRepository;
  readonly travelDashboard: TravelDashboardRepository;
  readonly carParts: CarPartsRepository;
}
