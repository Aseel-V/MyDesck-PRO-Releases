import type { Database, Json } from '../types/database';
import type { TripFormData } from '../types/trip';
import { finiteMoney } from './tripFinancials';
import { toMinorUnits, validatePaymentSplit } from './tripInstallments';

type TripInsert = Database['public']['Tables']['trips']['Insert'];
type TripUpdate = Database['public']['Tables']['trips']['Update'];

export function sanitizeTripFormData(formData: TripFormData): TripFormData {
  return {
    destination: formData.destination.trim(),
    client_name: formData.client_name.trim(),
    client_phone: formData.client_phone?.trim() || undefined,
    travelers: Array.isArray(formData.travelers) ? formData.travelers.map((traveler) => ({
      full_name: traveler.full_name.trim(),
      nationality: traveler.nationality?.trim() || undefined,
      room_type: traveler.room_type,
    })) : [],
    travelers_count: Math.max(0, Math.trunc(finiteMoney(formData.travelers_count))),
    itinerary: Array.isArray(formData.itinerary) ? formData.itinerary : [],
    start_date: formData.start_date,
    end_date: formData.end_date,
    currency: formData.currency,
    exchange_rate: finiteMoney(formData.exchange_rate) || 1,
    wholesale_cost: finiteMoney(formData.wholesale_cost),
    sale_price: finiteMoney(formData.sale_price),
    payments: Array.isArray(formData.payments) ? formData.payments : [],
    payment_status: formData.payment_status,
    amount_paid: finiteMoney(formData.amount_paid),
    payment_date: formData.payment_date || undefined,
    payment_method: formData.payment_method ?? null,
    card_paid_amount: formData.card_paid_amount == null ? null : finiteMoney(formData.card_paid_amount),
    cash_paid_amount: formData.cash_paid_amount == null ? null : finiteMoney(formData.cash_paid_amount),
    payment_plan: formData.payment_plan ? {
      plan_id: formData.payment_plan.plan_id ?? null,
      card_total: finiteMoney(formData.payment_plan.card_total),
      cash_total: finiteMoney(formData.payment_plan.cash_total),
      installment_count: Math.max(1, Math.trunc(finiteMoney(formData.payment_plan.installment_count))),
      first_installment_date: formData.payment_plan.first_installment_date,
    } : null,
    source_template_id: formData.source_template_id ?? null,
    source_template_name: formData.source_template_name?.trim() || null,
    room_type: formData.room_type,
    board_basis: formData.board_basis?.trim() || undefined,
    hotel_name: formData.hotel_name?.trim() || undefined,
    service_type: formData.service_type,
    trip_type: formData.trip_type ?? null,
    airline_name: formData.airline_name?.trim() || null,
    flight_number: formData.flight_number?.trim() || null,
    booking_reference: formData.booking_reference?.trim() || null,
    departure_airport: formData.departure_airport?.trim() || null,
    arrival_airport: formData.arrival_airport?.trim() || null,
    departure_datetime: formData.departure_datetime || null,
    arrival_datetime: formData.arrival_datetime || null,
    return_flight_number: formData.return_flight_number?.trim() || null,
    return_departure_airport: formData.return_departure_airport?.trim() || null,
    return_arrival_airport: formData.return_arrival_airport?.trim() || null,
    return_departure_datetime: formData.return_departure_datetime || null,
    return_arrival_datetime: formData.return_arrival_datetime || null,
    ticket_class: formData.ticket_class ?? null,
    ticket_cost_ils: formData.ticket_cost_ils == null ? null : finiteMoney(formData.ticket_cost_ils),
    ticket_notes: formData.ticket_notes?.trim() || null,
    wholesale_original_amount: formData.wholesale_original_amount == null
      ? undefined
      : finiteMoney(formData.wholesale_original_amount),
    wholesale_currency: formData.wholesale_currency,
    sale_original_amount: formData.sale_original_amount == null
      ? undefined
      : finiteMoney(formData.sale_original_amount),
    sale_currency: formData.sale_currency,
    attachments: Array.isArray(formData.attachments) ? formData.attachments : [],
    notes: formData.notes?.trim() || '',
    status: formData.status,
  };
}
function writableFields(formData: TripFormData) {
  const data = sanitizeTripFormData(formData);
  return {
    destination: data.destination,
    client_name: data.client_name,
    client_phone: data.client_phone ?? null,
    travelers: data.travelers as unknown as Json,
    travelers_count: data.travelers_count,
    itinerary: data.itinerary as unknown as Json,
    start_date: data.start_date,
    end_date: data.end_date,
    currency: data.currency,
    exchange_rate: data.exchange_rate,
    wholesale_cost: data.wholesale_cost,
    sale_price: data.sale_price,
    payments: data.payments as unknown as Json,
    payment_status: data.payment_status,
    amount_paid: data.amount_paid,
    payment_date: data.payment_date ?? null,
    payment_method: data.payment_method ?? null,
    card_paid_amount: data.card_paid_amount ?? null,
    cash_paid_amount: data.cash_paid_amount ?? null,
    room_type: (data.room_type ?? {}) as unknown as Json,
    board_basis: data.board_basis ?? null,
    hotel_name: data.hotel_name ?? null,
    service_type: data.service_type,
    trip_type: data.trip_type ?? null,
    airline_name: data.airline_name ?? null,
    flight_number: data.flight_number ?? null,
    booking_reference: data.booking_reference ?? null,
    departure_airport: data.departure_airport ?? null,
    arrival_airport: data.arrival_airport ?? null,
    departure_datetime: data.departure_datetime ?? null,
    arrival_datetime: data.arrival_datetime ?? null,
    return_flight_number: data.return_flight_number ?? null,
    return_departure_airport: data.return_departure_airport ?? null,
    return_arrival_airport: data.return_arrival_airport ?? null,
    return_departure_datetime: data.return_departure_datetime ?? null,
    return_arrival_datetime: data.return_arrival_datetime ?? null,
    ticket_class: data.ticket_class ?? null,
    ticket_cost_ils: data.ticket_cost_ils ?? null,
    ticket_notes: data.ticket_notes ?? null,
    wholesale_original_amount: data.wholesale_original_amount ?? null,
    wholesale_currency: data.wholesale_currency ?? null,
    sale_original_amount: data.sale_original_amount ?? null,
    sale_currency: data.sale_currency ?? null,
    attachments: data.attachments as unknown as Json,
    notes: data.notes ?? '',
    status: data.status,
  } satisfies TripUpdate;
}

export function toTripInsert(formData: TripFormData, userId: string): TripInsert {
  return { ...writableFields(formData), user_id: userId };
}

export function toTripUpdate(formData: TripFormData): TripUpdate {
  return writableFields(formData);
}

export function toTripPaymentPlanInput(formData: TripFormData) {
  const method = formData.payment_method;
  if (!method) return null;
  const saleMinor = toMinorUnits(finiteMoney(formData.sale_price));
  if (saleMinor <= 0) return null;
  const plan = formData.payment_plan;
  const cardTotalMinor = method === 'cash' ? 0 : toMinorUnits(finiteMoney(plan?.card_total));
  const cashTotalMinor = method === 'card' ? 0 : method === 'cash' ? saleMinor : toMinorUnits(finiteMoney(plan?.cash_total));
  if (method === 'mixed' && !validatePaymentSplit(saleMinor, cardTotalMinor, cashTotalMinor)) throw new Error('PAYMENT_PLAN_SPLIT_MISMATCH');
  return {
    existingPlanId: plan?.plan_id ?? null,
    method,
    currency: formData.currency,
    cardTotalMinor,
    cashTotalMinor,
    installmentCount: cardTotalMinor > 0 ? Math.max(1, Math.trunc(finiteMoney(plan?.installment_count))) : 0,
    firstDate: plan?.first_installment_date || formData.payment_date || new Date().toISOString().slice(0, 10),
    confirmedCashMinor: method === 'card' ? 0 : toMinorUnits(method === 'cash' ? finiteMoney(formData.amount_paid) : finiteMoney(formData.cash_paid_amount)),
    paymentDate: formData.payment_date || new Date().toISOString().slice(0, 10),
  };
}
