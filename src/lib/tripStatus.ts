import { Trip } from '../types/trip';

type TranslateFn = (key: string) => string;

export const TRIP_STATUS_OPTIONS: Array<Trip['status']> = ['active', 'completed', 'cancelled', 'archived'];
export const PAYMENT_STATUS_OPTIONS: Array<Trip['payment_status']> = ['paid', 'partial', 'unpaid'];

const SPECIAL_TRIP_STATUSES: ReadonlySet<Trip['status']> = new Set(['cancelled', 'archived']);

type TripStatusInput = {
  startDate?: string | null;
  endDate?: string | null;
  currentStatus?: Trip['status'] | null;
  now?: Date;
};

/** Maps date-based lifecycle state to the persisted trip enum. */
export function deriveTripStatus({ startDate, endDate, currentStatus, now = new Date() }: TripStatusInput): Trip['status'] {
  if (currentStatus && SPECIAL_TRIP_STATUSES.has(currentStatus)) return currentStatus;
  if (!startDate || !endDate) return currentStatus === 'completed' ? 'completed' : 'active';

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return currentStatus === 'completed' ? 'completed' : 'active';
  }

  // The stored enum has no `upcoming` member; `active` is its compatible normal state.
  if (now < start) return 'active';
  return now > end ? 'completed' : 'active';
}

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
  return t(`trips.statuses.${status}`);
}

export function getTripStatusDescription(status: Trip['status'], t: TranslateFn): string {
  switch (status) {
    case 'active':
      return t('trips.statusDescriptions.active');
    case 'completed':
      return t('trips.statusDescriptions.completed');
    case 'cancelled':
      return t('trips.statusDescriptions.cancelled');
    case 'archived':
      return t('trips.statusDescriptions.archived');
    default:
      return status;
  }
}

export function getPaymentStatusLabel(status: Trip['payment_status'], t: TranslateFn): string {
  return t(`trips.paymentStatuses.${status}`);
}

export function getEffectivePaymentStatus(
  trip: Pick<Trip, 'payment_status' | 'sale_price' | 'amount_paid'>
): Trip['payment_status'] {
  const rawSale = Number(trip.sale_price ?? 0);
  const rawPaid = Number(trip.amount_paid ?? 0);
  const sale = Number.isFinite(rawSale) ? Math.max(0, rawSale) : 0;
  const paid = Number.isFinite(rawPaid) ? Math.max(0, rawPaid) : 0;

  if (paid <= 0) return 'unpaid';
  if (paid < sale) return 'partial';
  return 'paid';
}

export function getPaymentStatusDescription(status: Trip['payment_status'], t: TranslateFn): string {
  switch (status) {
    case 'paid':
      return t('trips.paymentStatusDescriptions.paid');
    case 'partial':
      return t('trips.paymentStatusDescriptions.partial');
    case 'unpaid':
      return t('trips.paymentStatusDescriptions.unpaid');
    default:
      return status;
  }
}
