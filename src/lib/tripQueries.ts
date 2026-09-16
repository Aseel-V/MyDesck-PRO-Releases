import type { Trip } from '../types/trip';
import { getBackend } from '../data/backend';

export const TRIPS_PAGE_SIZE = 24;

export interface TripPageSummary {
  currency: string;
  trip_count: number;
  revenue: number;
  profit: number;
  amount_due: number;
}

export interface TripPageResult {
  items: Trip[];
  total_count: number;
  summary: TripPageSummary[];
  upcoming_count: number;
  destinations: string[];
}

export async function logTripPaymentContractComparison(tripId: string, year: string): Promise<void> {
  if (!import.meta.env.DEV) return;
  await getBackend().travel.logPaymentContractComparison(tripId, year);
}

export type TripSortKey =
  | 'updated_desc'
  | 'updated_asc'
  | 'created_desc'
  | 'created_asc'
  | 'start_date_asc'
  | 'start_date_desc'
  | 'destination_asc'
  | 'destination_desc'
  | 'client_name_asc'
  | 'client_name_desc'
  | 'sale_price_desc'
  | 'sale_price_asc'
  | 'profit_desc'
  | 'profit_asc'
  | 'remaining_desc'
  | 'remaining_asc'
  | 'overdue_first';

export interface TripPageInput {
  year: string;
  page: number;
  pageSize?: number;
  search?: string;
  paymentStatus?: string;
  tripStatus?: string;
  month?: string;
  destination?: string;
  sortKey?: TripSortKey;
}

export function asTripListItem(value: Partial<Trip>): Trip {
  return {
    ...value,
    travelers: [],
    itinerary: [],
    payments: [],
    attachments: [],
    notes: '',
  } as Trip;
}

function stripLegacyTravelerFields(value: unknown): Trip {
  const trip = value as Omit<Trip, 'travelers'> & { travelers?: Array<Record<string, unknown>> };
  const travelers = Array.isArray(trip.travelers)
    ? trip.travelers.map((rawTraveler) => {
        const traveler = { ...rawTraveler };
        delete traveler.passport_number;
        return { ...traveler, full_name: typeof traveler.full_name === 'string' ? traveler.full_name : '' };
      })
    : [];
  return { ...trip, travelers } as unknown as Trip;
}

export async function fetchTripDashboardItems(year: string): Promise<Trip[]> {
  return getBackend().travelDashboard.listDashboardTrips(year);
}

export async function fetchTripPage(input: TripPageInput): Promise<TripPageResult> {
  return getBackend().travel.getTripsPage(input);
}

export async function fetchAllFilteredTrips(input: Omit<TripPageInput, 'page' | 'pageSize'>, onProgress?: (loaded: number, total: number) => void): Promise<Trip[]> {
  const items: Trip[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await fetchTripPage({ ...input, page, pageSize: 100 });
    total = result.total_count;
    items.push(...result.items.filter((item) => !items.some((existing) => existing.id === item.id)));
    onProgress?.(items.length, total);
    page += 1;
  } while (items.length < total && page <= 100);
  return items;
}

export async function fetchTripDetails(tripId: string): Promise<Trip> {
  const data = await getBackend().travel.getTripDetails(tripId);
  if (!data) throw new Error('TRIP_NOT_FOUND');
  return stripLegacyTravelerFields(data);
}

export async function fetchLatestTripForClient(clientName: string, clientPhone?: string): Promise<Trip> {
  const id = await getBackend().travel.findLatestTripIdForClient(clientName, clientPhone);
  if (!id) throw new Error('TRIP_NOT_FOUND');
  return fetchTripDetails(id);
}
