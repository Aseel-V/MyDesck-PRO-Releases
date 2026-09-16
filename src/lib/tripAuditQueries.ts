import { getBackend } from '../data/backend';
import type { Json } from '../types/database';

export interface TripActivityEntry {
  id: number;
  activity_type: string;
  actor_user_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface TripFinancialAuditEntry {
  id: number;
  actor_user_id: string | null;
  changed_at: string;
  changed_field: string;
  previous_value: Json | null;
  new_value: Json | null;
  operation_type: string;
}

interface Page<T> { items: T[]; total_count: number }

export async function fetchTripActivityPage(tripId: string, page: number): Promise<Page<TripActivityEntry>> {
  return getBackend().travel.getTripActivityPage(tripId, page);
}

export async function fetchTripFinancialAuditPage(tripId: string, page: number): Promise<Page<TripFinancialAuditEntry>> {
  return getBackend().travel.getTripFinancialAuditPage(tripId, page);
}
