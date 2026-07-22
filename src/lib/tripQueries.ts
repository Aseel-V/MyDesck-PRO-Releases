import { supabase } from './supabase';
import type { Trip } from '../types/trip';
import { recordRpcFallback, recordRpcSuccess } from './rpcAvailability';
import { calculateTripFinancials } from './tripFinancials';

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

const TRIP_LIST_FIELDS = 'id,user_id,destination,client_name,travelers_count,start_date,end_date,currency,exchange_rate,wholesale_cost,sale_price,profit,profit_percentage,payment_date,payment_status,amount_paid,amount_due,payment_method,card_paid_amount,cash_paid_amount,room_type,board_basis,hotel_name,service_type,trip_type,airline_name,flight_number,booking_reference,departure_airport,arrival_airport,departure_datetime,arrival_datetime,return_flight_number,return_departure_airport,return_arrival_airport,return_departure_datetime,return_arrival_datetime,ticket_class,ticket_cost_ils,wholesale_original_amount,wholesale_currency,sale_original_amount,sale_currency,checklist_flight,checklist_hotel,checklist_payment,status,export_to_pdf,created_at,updated_at';

function getYearBounds(year: string) {
  const numericYear = /^\d{4}$/.test(year) ? Number(year) : new Date().getFullYear();
  return {
    start: `${numericYear}-01-01`,
    end: `${numericYear + 1}-01-01`,
  };
}

function safeSearchTerm(value?: string): string {
  return (value || '').trim().replace(/[,()'"\\%_]/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
}

function isMissingDeletedColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' && Boolean(error.message?.includes('deleted_at'));
}

function isPaymentStatus(value?: string): value is Trip['payment_status'] {
  return value === 'paid' || value === 'partial' || value === 'unpaid';
}

function isTripStatus(value?: string): value is Trip['status'] {
  return value === 'active' || value === 'completed' || value === 'cancelled' || value === 'archived';
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
  const { data, error } = await supabase.rpc('get_trip_dashboard_items', { p_year: year });
  if (!error) {
    recordRpcSuccess('get_trip_dashboard_items');
    return Array.isArray(data) ? (data as unknown as Array<Partial<Trip>>).map(asTripListItem) : [];
  }
  if (!recordRpcFallback('get_trip_dashboard_items', error)) throw error;

  const bounds = getYearBounds(year);
  const runFallback = (withDeletedFilter: boolean) => {
    let query = supabase
      .from('trips')
      .select(TRIP_LIST_FIELDS)
      .gte('start_date', bounds.start)
      .lt('start_date', bounds.end)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (withDeletedFilter) query = query.is('deleted_at', null);
    return query;
  };
  let fallback = await runFallback(true);
  if (isMissingDeletedColumn(fallback.error)) fallback = await runFallback(false);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((item) => asTripListItem(item as unknown as Partial<Trip>));
}

export async function fetchTripPage(input: TripPageInput): Promise<TripPageResult> {
  const { data, error } = await supabase.rpc('get_trips_page', {
    p_year: input.year,
    p_page: input.page,
    p_page_size: input.pageSize ?? TRIPS_PAGE_SIZE,
    p_search: input.search?.trim() || null,
    p_payment_status: input.paymentStatus || null,
    p_trip_status: input.tripStatus || null,
    p_month: input.month ? Number(input.month) : null,
    p_destination: input.destination || null,
    p_sort_key: input.sortKey || 'updated_desc',
  });
  if (error) {
    if (!recordRpcFallback('get_trips_page', error)) throw error;
    return fetchTripPageFallback(input);
  }
  recordRpcSuccess('get_trips_page');

  const payload = (data ?? {}) as unknown as Partial<TripPageResult>;
  return {
    items: Array.isArray(payload.items) ? payload.items.map(asTripListItem) : [],
    total_count: Number(payload.total_count ?? 0),
    summary: Array.isArray(payload.summary) ? payload.summary : [],
    upcoming_count: Number(payload.upcoming_count ?? 0),
    destinations: Array.isArray(payload.destinations) ? payload.destinations : [],
  };
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

async function fetchTripPageFallback(input: TripPageInput): Promise<TripPageResult> {
  const bounds = getYearBounds(input.year);
  const pageSize = Math.min(Math.max(input.pageSize ?? TRIPS_PAGE_SIZE, 1), 100);
  const from = (Math.max(input.page, 1) - 1) * pageSize;
  const search = safeSearchTerm(input.search);

  const buildListQuery = (withDeletedFilter: boolean) => {
    let query = supabase
      .from('trips')
      .select(TRIP_LIST_FIELDS, { count: 'exact' })
      .gte('start_date', bounds.start)
      .lt('start_date', bounds.end);
    if (withDeletedFilter) query = query.is('deleted_at', null);
    if (isPaymentStatus(input.paymentStatus)) query = query.eq('payment_status', input.paymentStatus);
    if (isTripStatus(input.tripStatus)) query = query.eq('status', input.tripStatus);
    else query = query.neq('status', 'archived');
    if (input.destination) query = query.eq('destination', input.destination);
    if (input.month) {
      const month = String(Number(input.month)).padStart(2, '0');
      const monthStart = `${input.year}-${month}-01`;
      const nextMonth = new Date(Date.UTC(Number(input.year), Number(month), 1)).toISOString().slice(0, 10);
      query = query.gte('start_date', monthStart).lt('start_date', nextMonth);
    }
    if (search) query = query.or(`destination.ilike.%${search}%,client_name.ilike.%${search}%,hotel_name.ilike.%${search}%`);

    const sortKey = input.sortKey || 'updated_desc';
    switch (sortKey) {
      case 'updated_asc':
        query = query.order('updated_at', { ascending: true });
        break;
      case 'created_desc':
        query = query.order('created_at', { ascending: false });
        break;
      case 'created_asc':
        query = query.order('created_at', { ascending: true });
        break;
      case 'start_date_asc':
        query = query.order('start_date', { ascending: true, nullsFirst: false });
        break;
      case 'start_date_desc':
        query = query.order('start_date', { ascending: false, nullsFirst: false });
        break;
      case 'destination_asc':
        query = query.order('destination', { ascending: true });
        break;
      case 'destination_desc':
        query = query.order('destination', { ascending: false });
        break;
      case 'client_name_asc':
        query = query.order('client_name', { ascending: true });
        break;
      case 'client_name_desc':
        query = query.order('client_name', { ascending: false });
        break;
      case 'sale_price_desc':
        query = query.order('sale_price', { ascending: false });
        break;
      case 'sale_price_asc':
        query = query.order('sale_price', { ascending: true });
        break;
      case 'profit_desc':
        query = query.order('profit', { ascending: false });
        break;
      case 'profit_asc':
        query = query.order('profit', { ascending: true });
        break;
      case 'updated_desc':
      default:
        query = query.order('updated_at', { ascending: false });
        break;
    }

    return query.order('id', { ascending: false }).range(from, from + pageSize - 1);
  };

  let response = await buildListQuery(true);
  if (isMissingDeletedColumn(response.error)) response = await buildListQuery(false);
  if (response.error) throw response.error;
  const items = (response.data ?? []).map((item) => asTripListItem(item as unknown as Partial<Trip>));

  const summaries = new Map<string, TripPageSummary>();
  for (const trip of items.filter((item) => item.status !== 'cancelled' && item.status !== 'archived')) {
    const currency = trip.currency || 'ILS';
    const financials = calculateTripFinancials(trip);
    const current = summaries.get(currency) || { currency, trip_count: 0, revenue: 0, profit: 0, amount_due: 0 };
    current.trip_count += 1;
    current.revenue += financials.salePrice;
    current.profit += financials.profit;
    current.amount_due += financials.amountDue;
    summaries.set(currency, current);
  }

  const destinations = Array.from(new Set(items.map((item) => item.destination))).sort();
  return {
    items,
    total_count: response.count ?? items.length,
    summary: Array.from(summaries.values()),
    upcoming_count: items.filter((item) => item.status !== 'cancelled' && item.start_date >= new Date().toISOString().slice(0, 10)).length,
    destinations,
  };
}

export async function fetchTripDetails(tripId: string): Promise<Trip> {
  const { data, error } = await supabase.rpc('get_trip_details', { p_trip_id: tripId });
  if (!error) {
    recordRpcSuccess('get_trip_details');
    if (!data) throw new Error('TRIP_NOT_FOUND');
    return stripLegacyTravelerFields(data);
  }
  if (!recordRpcFallback('get_trip_details', error)) throw error;

  const runFallback = (withDeletedFilter: boolean) => {
    let query = supabase.from('trips').select('*').eq('id', tripId);
    if (withDeletedFilter) query = query.is('deleted_at', null);
    return query.maybeSingle();
  };
  let fallback = await runFallback(true);
  if (isMissingDeletedColumn(fallback.error)) fallback = await runFallback(false);
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw new Error('TRIP_NOT_FOUND');
  return stripLegacyTravelerFields(fallback.data);
}

export async function fetchLatestTripForClient(clientName: string, clientPhone?: string): Promise<Trip> {
  let query = supabase.from('trips').select('id').eq('client_name', clientName).is('deleted_at', null);
  if (clientPhone) query = query.eq('client_phone', clientPhone);
  const { data, error } = await query.order('start_date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('TRIP_NOT_FOUND');
  return fetchTripDetails(data.id);
}
