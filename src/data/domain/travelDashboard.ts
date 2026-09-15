/**
 * The travel dashboard's reads: the home screen of tourism and auto_repair businesses and of profiles without a
 * business type. They return what the get_trip_years and get_trip_dashboard_items database functions return to
 * the signed-in owner.
 */
import type { Trip } from '../../types/trip';

export interface TravelDashboardRepository {
  /** get_trip_years: distinct years of coalesce(payment_date, start_date) over the owner's live trips, newest first. */
  listTripYears(): Promise<string[]>;
  /** get_trip_dashboard_items(year), each item with empty detail collections as the list screens expect. */
  listDashboardTrips(year: string): Promise<Trip[]>;
}
