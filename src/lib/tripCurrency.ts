import type { Trip } from '../types/trip';

export type TripCurrencyMode = 'ils' | 'new_usd' | 'legacy_usd' | 'foreign';

/**
 * Robust classification of a trip's currency mode.
 * A trip is classified as legacy USD ONLY if it was created under historical USD reporting
 * (i.e. trip.currency !== 'ILS' AND it lacks modern canonical/original currency fields).
 */
export function getTripCurrencyMode(trip?: Partial<Trip> | null): TripCurrencyMode {
  if (!trip) return 'ils';
  const currency = trip.currency || 'ILS';
  if (currency === 'ILS') return 'ils';

  // Genuine legacy trip has currency != 'ILS' AND no explicit sale_currency metadata
  if (!trip.sale_currency && (trip.sale_original_amount === undefined || trip.sale_original_amount === null)) {
    return 'legacy_usd';
  }

  return currency === 'USD' ? 'new_usd' : 'foreign';
}
