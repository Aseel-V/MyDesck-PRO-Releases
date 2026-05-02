import { Trip } from '../types/trip';

export function getEffectiveTripDate(trip: Pick<Trip, 'payment_date' | 'start_date'>): string {
  return trip.payment_date || trip.start_date;
}

export function isArchivedTrip(trip: Pick<Trip, 'status'>): boolean {
  return trip.status === 'archived';
}

export function isCancelledTrip(trip: Pick<Trip, 'status'>): boolean {
  return trip.status === 'cancelled';
}

export function isTripVisibleInTripList(trip: Pick<Trip, 'status'>): boolean {
  return !isArchivedTrip(trip);
}

export function isTripIncludedInDashboardStats(trip: Pick<Trip, 'status'>): boolean {
  return !isArchivedTrip(trip) && !isCancelledTrip(trip);
}

export function isTripEligibleForAlert(
  trip: Pick<Trip, 'status' | 'payment_status' | 'payment_date' | 'start_date'>,
  today: Date = new Date()
): boolean {
  if (isArchivedTrip(trip) || isCancelledTrip(trip) || trip.payment_status === 'paid') {
    return false;
  }

  const tripDate = new Date(getEffectiveTripDate(trip));
  const normalizedToday = new Date(today);
  normalizedToday.setHours(0, 0, 0, 0);
  tripDate.setHours(0, 0, 0, 0);

  const diffTime = tripDate.getTime() - normalizedToday.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= 7;
}
