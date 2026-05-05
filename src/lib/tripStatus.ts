import { Trip } from '../types/trip';

type TranslateFn = (key: string) => string;

export const TRIP_STATUS_OPTIONS: Array<Trip['status']> = ['active', 'completed', 'cancelled', 'archived'];
export const PAYMENT_STATUS_OPTIONS: Array<Trip['payment_status']> = ['paid', 'partial', 'unpaid'];

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

export function getTripStatusLabel(status: Trip['status'], t: TranslateFn): string {
  if (status === 'archived') {
    return t('trips.statuses.archived') || 'Archived';
  }

  return t(`trips.statuses.${status}`) || status;
}

export function getTripStatusDescription(status: Trip['status'], t: TranslateFn): string {
  switch (status) {
    case 'active':
      return t('trips.statusDescriptions.active') || 'The trip is ongoing, upcoming, or still being managed.';
    case 'completed':
      return t('trips.statusDescriptions.completed') || 'The trip finished successfully and remains in your normal records.';
    case 'cancelled':
      return t('trips.statusDescriptions.cancelled') || 'The trip will stay in records, but it should not count as an active booking.';
    case 'archived':
      return t('trips.statusDescriptions.archived') || 'The trip is hidden from the main list, but still kept for reference.';
    default:
      return status;
  }
}

export function getPaymentStatusLabel(status: Trip['payment_status'], t: TranslateFn): string {
  return t(`trips.paymentStatuses.${status}`) || status;
}

export function getPaymentStatusDescription(status: Trip['payment_status'], t: TranslateFn): string {
  switch (status) {
    case 'paid':
      return t('trips.paymentStatusDescriptions.paid') || 'The full amount has been received.';
    case 'partial':
      return t('trips.paymentStatusDescriptions.partial') || 'Part of the payment was received, but there is still a remaining balance.';
    case 'unpaid':
      return t('trips.paymentStatusDescriptions.unpaid') || 'No payment has been received yet.';
    default:
      return status;
  }
}
