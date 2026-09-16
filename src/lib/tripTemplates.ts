import type { Json } from '../types/database';
import { getBackend } from '../data/backend';
import type { Trip } from '../types/trip';
import { getTripDuration } from './tripDates';

export interface TripTemplateData {
  destination?: string; duration_days?: number;
  itinerary_structure?: Array<{ day: number; title: string; description: string }>;
  hotel_notes?: string; transportation_notes?: string; internal_notes?: string;
  default_pricing?: { currency: Trip['currency']; wholesale_cost: number; sale_price: number };
  checklist?: { flight: boolean; hotel: boolean; payment: boolean };
  message_templates?: string[];
}

export type TripTemplateType = 'full_trip' | 'itinerary' | 'hotel' | 'transportation' | 'pricing' | 'checklist' | 'message';
export interface TripTemplate { id: string; user_id: string; name: string; description: string | null; template_data: Json; template_type: TripTemplateType; is_favorite: boolean; usage_count: number; last_used_at: string | null; status: 'active' | 'archived'; deleted_at: string | null; created_at: string; updated_at: string }

export function templateContainsSensitiveData(data: TripTemplateData): boolean {
  return /passport|דרכון|جواز|client[_ ]?phone|https?:\/\/|storage[_ ]?path|\b[A-Z0-9]{7,9}\b/i.test(JSON.stringify(data));
}

export function createTemplateDataFromTrip(trip: Trip): TripTemplateData {
  return {
    destination: trip.destination,
    duration_days: getTripDuration(trip.start_date, trip.end_date)?.days ?? 1,
    itinerary_structure: trip.itinerary.map(({ day, title, description }) => ({ day, title, description })),
    hotel_notes: [trip.hotel_name, trip.board_basis].filter(Boolean).join(' · '),
    transportation_notes: trip.ticket_notes || undefined,
    default_pricing: { currency: trip.currency, wholesale_cost: trip.wholesale_cost, sale_price: trip.sale_price },
    checklist: { flight: trip.checklist_flight, hotel: trip.checklist_hotel, payment: trip.checklist_payment },
  };
}

export async function fetchTripTemplates(search = '', type?: TripTemplateType, includeArchived = false): Promise<TripTemplate[]> {
  return getBackend().travel.listTripTemplates(search, type, includeArchived);
}

export async function fetchTripTemplate(id: string): Promise<TripTemplate> {
  return getBackend().travel.getTripTemplate(id);
}

export async function saveTripTemplate(userId: string, value: { id?: string; name: string; description?: string; data: TripTemplateData; templateType?: TripTemplateType }): Promise<void> {
  if (templateContainsSensitiveData(value.data)) throw new Error('SENSITIVE_TEMPLATE_DATA');
  await getBackend().travel.saveTripTemplate(userId, value);
}

export async function toggleTripTemplateFavorite(id: string, isFavorite: boolean): Promise<void> {
  await getBackend().travel.toggleTripTemplateFavorite(id, isFavorite);
}

export async function recordTripTemplateUse(id: string): Promise<void> {
  await getBackend().travel.recordTripTemplateUse(id);
}

export async function updateTripTemplateStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  await getBackend().travel.updateTripTemplateStatus(id, status);
}

export async function softDeleteTripTemplate(id: string): Promise<void> {
  await getBackend().travel.softDeleteTripTemplate(id);
}

export function templateToTripDraft(template: TripTemplate): Trip {
  const data = template.template_data as unknown as TripTemplateData;
  const start = new Date(); start.setHours(12, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + Math.max(0, (data.duration_days ?? 1) - 1));
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const pricing = data.default_pricing ?? { currency: 'ILS' as const, wholesale_cost: 0, sale_price: 0 };
  return {
    id: '', user_id: '', destination: data.destination ?? '', client_name: '', client_phone: '', travelers: [], travelers_count: 1,
    itinerary: data.itinerary_structure ?? [], start_date: iso(start), end_date: iso(end), currency: pricing.currency, exchange_rate: 1,
    wholesale_cost: pricing.wholesale_cost, sale_price: pricing.sale_price, profit: pricing.sale_price - pricing.wholesale_cost,
    profit_percentage: pricing.sale_price ? ((pricing.sale_price - pricing.wholesale_cost) / pricing.sale_price) * 100 : 0,
    payments: [], payment_status: 'unpaid', amount_paid: 0, amount_due: pricing.sale_price, payment_method: null,
    card_paid_amount: 0, cash_paid_amount: 0, room_type: {}, board_basis: data.hotel_notes, hotel_name: '', service_type: 'both',
    trip_type: null, attachments: [], checklist_flight: data.checklist?.flight ?? false, checklist_hotel: data.checklist?.hotel ?? false,
    checklist_payment: false, notes: data.internal_notes ?? '', status: 'active', export_to_pdf: false,
    created_at: '', updated_at: '', source_template_id: template.id, source_template_name: template.name,
  };
}
