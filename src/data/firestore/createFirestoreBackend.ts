import type { FirebaseClient } from '../firebaseClient';
import type { ProductBackend } from '../domain/ProductBackend';
import { FirebaseSession } from './FirebaseSession';
import { FirestoreAdminRepository } from './FirestoreAdminRepository';
import { FirestoreAuthGateway } from './FirestoreAuthGateway';
import { FirestoreProfileRepository } from './FirestoreProfileRepository';
import { FirestoreSupermarketRepository } from './FirestoreSupermarketRepository';
import { FirestoreAutoRepairRepository } from './FirestoreAutoRepairRepository';
import { FirestoreTravelDashboardRepository } from './FirestoreTravelDashboardRepository';
import { FirestoreCarPartsRepository } from './FirestoreCarPartsRepository';
import { FirestoreRestaurantRepository } from './FirestoreRestaurantRepository';
import { FirestoreTravelRepository } from './FirestoreTravelRepository';

/**
 * The Firebase production backend: Firebase Auth, Firestore and Rules. Supabase appears nowhere in
 * this graph except Storage, which is reached only through StorageRepository.
 */
export function createFirestoreBackend(client: FirebaseClient): ProductBackend {
  const session = new FirebaseSession(client);
  return {
    kind: client.mode,
    auth: new FirestoreAuthGateway(session),
    profiles: new FirestoreProfileRepository(session),
    admin: new FirestoreAdminRepository(session),
    supermarket: new FirestoreSupermarketRepository(session),
    autoRepair: new FirestoreAutoRepairRepository(session),
    travelDashboard: new FirestoreTravelDashboardRepository(session),
    carParts: new FirestoreCarPartsRepository(session),
    restaurant: new FirestoreRestaurantRepository(session),
    travel: new FirestoreTravelRepository(session),
  };
}
