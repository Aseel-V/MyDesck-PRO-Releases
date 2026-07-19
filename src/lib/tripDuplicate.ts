import type { Trip, TripFormData } from '../types/trip';

export interface TripDuplicateOptions {
  travelers: boolean; itinerary: boolean; hotel: boolean; flights: boolean;
  attachments: boolean; notes: boolean; pricing: boolean; payments: boolean;
  startDate: string; endDate: string;
}

function dayDifference(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function shiftDate(value: string | null | undefined, days: number): string | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return value.includes('T') ? date.toISOString() : date.toISOString().slice(0, 10);
}

export function getDuplicateDatePreview(trip: Trip, startDate: string) {
  const durationDays = dayDifference(trip.start_date, trip.end_date);
  const shiftDays = dayDifference(trip.start_date, startDate);
  return {
    shiftDays,
    endDate: shiftDate(trip.end_date, shiftDays) || startDate,
    durationDays: durationDays + 1,
  };
}

export function buildDuplicateTripForm(trip: Trip, options: TripDuplicateOptions): TripFormData {
  const shiftDays = dayDifference(trip.start_date, options.startDate);
  const travelers = options.travelers ? trip.travelers.map(({ full_name, nationality, room_type }) => ({ full_name, nationality, room_type })) : [];
  return {
    destination: trip.destination,
    client_name: options.travelers ? trip.client_name : '',
    client_phone: undefined,
    travelers,
    travelers_count: options.travelers ? trip.travelers_count : 1,
    itinerary: options.itinerary ? trip.itinerary.map((item) => ({ ...item, date: shiftDate(item.date, shiftDays) || undefined })) : [],
    start_date: options.startDate,
    end_date: options.endDate,
    currency: trip.currency,
    exchange_rate: trip.exchange_rate,
    wholesale_cost: options.pricing ? trip.wholesale_cost : 0,
    sale_price: options.pricing ? trip.sale_price : 0,
    payments: options.payments ? trip.payments : [],
    payment_status: options.payments ? trip.payment_status : 'unpaid',
    amount_paid: options.payments ? trip.amount_paid : 0,
    payment_method: options.payments ? trip.payment_method : null,
    card_paid_amount: options.payments ? trip.card_paid_amount : 0,
    cash_paid_amount: options.payments ? trip.cash_paid_amount : 0,
    room_type: options.hotel ? trip.room_type : {},
    board_basis: options.hotel ? trip.board_basis : undefined,
    hotel_name: options.hotel ? trip.hotel_name ?? undefined : undefined,
    service_type: trip.service_type,
    trip_type: options.flights ? trip.trip_type : null,
    airline_name: options.flights ? trip.airline_name : null,
    flight_number: options.flights ? trip.flight_number : null,
    booking_reference: options.flights ? trip.booking_reference : null,
    departure_airport: options.flights ? trip.departure_airport : null,
    arrival_airport: options.flights ? trip.arrival_airport : null,
    departure_datetime: options.flights ? shiftDate(trip.departure_datetime, shiftDays) : null,
    arrival_datetime: options.flights ? shiftDate(trip.arrival_datetime, shiftDays) : null,
    return_flight_number: options.flights ? trip.return_flight_number : null,
    return_departure_airport: options.flights ? trip.return_departure_airport : null,
    return_arrival_airport: options.flights ? trip.return_arrival_airport : null,
    return_departure_datetime: options.flights ? shiftDate(trip.return_departure_datetime, shiftDays) : null,
    return_arrival_datetime: options.flights ? shiftDate(trip.return_arrival_datetime, shiftDays) : null,
    ticket_class: options.flights ? trip.ticket_class : null,
    ticket_cost_ils: options.flights && options.pricing ? trip.ticket_cost_ils : null,
    ticket_notes: options.flights ? trip.ticket_notes : null,
    attachments: options.attachments ? trip.attachments : [],
    notes: options.notes ? trip.notes : '',
    status: 'active',
  };
}
