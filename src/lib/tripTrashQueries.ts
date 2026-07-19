import { supabase } from './supabase';
import { isMissingRpcError } from './queryRetryPolicy';
import { asTripListItem } from './tripQueries';
import type { Trip } from '../types/trip';

export interface DeletedTrip extends Trip {
  deleted_at: string;
  purge_at: string;
  cleanup_status: string | null;
}

export interface DeletedTripsPage {
  items: DeletedTrip[];
  total_count: number;
}

let warnedFallback = false;

export async function fetchDeletedTripsPage(page: number, search: string, pageSize = 20): Promise<DeletedTripsPage> {
  const { data, error } = await supabase.rpc('get_deleted_trips_page', {
    p_page: page,
    p_page_size: pageSize,
    p_search: search.trim() || null,
  });
  if (!error) {
    const payload = (data ?? {}) as { items?: Array<Partial<DeletedTrip>>; total_count?: number };
    return {
      items: (payload.items ?? []).map((item) => ({ ...asTripListItem(item), ...item } as DeletedTrip)),
      total_count: Number(payload.total_count ?? 0),
    };
  }
  if (!isMissingRpcError(error)) throw error;
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn('[Travel Trash] RPC unavailable; using the RLS table fallback until migrations are deployed.');
  }

  const from = (Math.max(page, 1) - 1) * pageSize;
  let query = supabase
    .from('trips')
    .select('*', { count: 'exact' })
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .range(from, from + pageSize - 1);
  const safeSearch = search.trim().replace(/[,()'"\\%_]/g, ' ').slice(0, 120);
  if (safeSearch) query = query.or(`destination.ilike.%${safeSearch}%,client_name.ilike.%${safeSearch}%`);
  const fallback = await query;
  if (fallback.error) throw fallback.error;
  return {
    items: (fallback.data ?? []).map((row) => ({
      ...asTripListItem(row as unknown as Partial<Trip>),
      deleted_at: row.deleted_at || new Date().toISOString(),
      purge_at: new Date(new Date(row.deleted_at || Date.now()).getTime() + 30 * 86_400_000).toISOString(),
      cleanup_status: null,
    })),
    total_count: fallback.count ?? 0,
  };
}

export async function restoreDeletedTrips(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('restore_deleted_trips', { p_trip_ids: ids });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function permanentlyDeleteTrips(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('permanently_delete_trips', { p_trip_ids: ids });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function retryAttachmentCleanup(jobId: number): Promise<void> {
  const { data, error } = await supabase.rpc('retry_trip_attachment_cleanup', { p_job_id: jobId });
  if (error) throw error;
  if (!data) throw new Error('CLEANUP_RETRY_NOT_APPLIED');
}
