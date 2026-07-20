import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Trip, TripFormData } from '../types/trip';
import type { TripPageResult } from './tripQueries';
import { calculateTripFinancials } from './tripFinancials';

export interface TripCacheSnapshot { entries: Array<[QueryKey, TripPageResult | undefined]> }

export function snapshotTripPages(client: QueryClient): TripCacheSnapshot {
  return { entries: client.getQueriesData<TripPageResult>({ queryKey: ['trips-page'] }) };
}

export function restoreTripPages(client: QueryClient, snapshot?: TripCacheSnapshot): void {
  snapshot?.entries.forEach(([key, value]) => client.setQueryData(key, value));
}

export function patchTripInPages(client: QueryClient, id: string, patch: Partial<Trip>): void {
  client.setQueriesData<TripPageResult>({ queryKey: ['trips-page'] }, (page) => page ? {
    ...page,
    items: page.items.map((trip) => trip.id === id ? { ...trip, ...patch } : trip),
  } : page);
}

export function removeTripFromPages(client: QueryClient, id: string): void {
  client.setQueriesData<TripPageResult>({ queryKey: ['trips-page'] }, (page) => {
    if (!page || !page.items.some((trip) => trip.id === id)) return page;
    return { ...page, items: page.items.filter((trip) => trip.id !== id), total_count: Math.max(0, page.total_count - 1) };
  });
}

function isDefaultPageKey(key: QueryKey, startDate: string): boolean {
  const filters = key[2];
  const page = key[3];
  if (!filters || typeof filters !== 'object' || page !== 1) return false;
  const values = filters as Record<string, unknown>;
  return values.year === startDate.slice(0, 4) && !values.search && !values.paymentStatus && !values.tripStatus && !values.month && !values.destination;
}

export function addOptimisticTrip(client: QueryClient, form: TripFormData, userId: string, id: string): void {
  const financials = calculateTripFinancials(form);
  const now = new Date().toISOString();
  const item: Trip = {
    ...form,
    id,
    user_id: userId,
    travelers: [],
    itinerary: [],
    payments: [],
    attachments: [],
    notes: '',
    checklist_flight: false,
    checklist_hotel: false,
    checklist_payment: false,
    profit: financials.profit,
    profit_percentage: form.sale_price ? (financials.profit / form.sale_price) * 100 : 0,
    amount_due: financials.amountDue,
    export_to_pdf: false,
    created_at: now,
    updated_at: now,
  };
  client.getQueriesData<TripPageResult>({ queryKey: ['trips-page'] }).forEach(([key, page]) => {
    if (!page || !isDefaultPageKey(key, form.start_date) || page.items.some((trip) => trip.id === id)) return;
    client.setQueryData<TripPageResult>(key, { ...page, items: [item, ...page.items].slice(0, 24), total_count: page.total_count + 1 });
  });
}

export function replaceOptimisticTripId(client: QueryClient, temporaryId: string, realId: string): void {
  client.setQueriesData<TripPageResult>({ queryKey: ['trips-page'] }, (page) => page ? {
    ...page,
    items: page.items.map((trip) => trip.id === temporaryId ? { ...trip, id: realId } : trip),
  } : page);
}
