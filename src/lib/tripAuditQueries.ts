import { supabase } from './supabase';
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

function parsePage<T>(value: Json | null): Page<T> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return { items: [], total_count: 0 };
  const record = value as Record<string, Json | undefined>;
  return {
    items: Array.isArray(record.items) ? record.items as unknown as T[] : [],
    total_count: typeof record.total_count === 'number' ? record.total_count : 0,
  };
}

export async function fetchTripActivityPage(tripId: string, page: number): Promise<Page<TripActivityEntry>> {
  const { data, error } = await supabase.rpc('get_trip_activity_page', {
    p_trip_id: tripId, p_page: page, p_page_size: 20, p_type: undefined,
  });
  if (error) throw error;
  return parsePage<TripActivityEntry>(data);
}

export async function fetchTripFinancialAuditPage(tripId: string, page: number): Promise<Page<TripFinancialAuditEntry>> {
  const { data, error } = await supabase.rpc('get_trip_financial_audit_page', {
    p_trip_id: tripId, p_page: page, p_page_size: 20,
  });
  if (error) throw error;
  return parsePage<TripFinancialAuditEntry>(data);
}
