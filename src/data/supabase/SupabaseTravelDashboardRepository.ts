import { supabase } from '../../lib/supabase';
import { fetchTripDashboardItems } from '../../lib/tripQueries';
import type { Trip } from '../../types/trip';
import type { TravelDashboardRepository } from '../domain/travelDashboard';

/**
 * The travel dashboard reads of the shipped Supabase product: the get_trip_years call moved verbatim from
 * Dashboard, and fetchTripDashboardItems with its fallback query.
 */
export class SupabaseTravelDashboardRepository implements TravelDashboardRepository {
  async listTripYears(): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_trip_years');
    if (error) throw error;
    return (data as { year: string }[]).map((item) => item.year);
  }

  listDashboardTrips(year: string): Promise<Trip[]> {
    return fetchTripDashboardItems(year);
  }
}
