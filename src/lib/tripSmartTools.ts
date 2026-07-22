import type { ItineraryItem, Trip, TripFormData } from '../types/trip';
import { getTripDuration } from './tripDates';
import { calculateTripFinancials } from './tripFinancials';

export type FindingLevel = 'error' | 'warning' | 'suggestion';
export interface CompletenessFinding { code: string; level: FindingLevel }

export function generateInitialItinerary(input: {
  startDate: string; endDate: string; categories?: string[]; freeDay?: boolean;
}): ItineraryItem[] {
  const duration = getTripDuration(input.startDate, input.endDate);
  if (!duration) return [];
  const categories = input.categories?.filter(Boolean) ?? [];
  return Array.from({ length: duration.days }, (_, index) => {
    const date = new Date(`${input.startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const isFirst = index === 0;
    const isLast = index === duration.days - 1;
    const isFree = Boolean(input.freeDay && duration.days > 3 && index === Math.floor(duration.days / 2));
    return {
      day: index + 1,
      date: date.toISOString().slice(0, 10),
      title: isFirst ? 'arrival' : isLast ? 'departure' : isFree ? 'free_day' : 'activity_day',
      description: isFirst
        ? 'transfer_to_hotel'
        : isLast
          ? 'departure_transfer'
          : isFree
            ? 'shopping_or_free_time'
            : categories[index % Math.max(categories.length, 1)] || 'city_tour',
    };
  });
}

export interface SchedulableActivity {
  id: string; date: string; startTime: string; durationMinutes: number; area?: string;
  priority?: number; fixed?: boolean;
}

export function organizeActivities(items: SchedulableActivity[]) {
  const changes: string[] = [];
  const warnings: string[] = [];
  const organized = [...items].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder) return dateOrder;
    if (a.fixed !== b.fixed) return a.fixed ? -1 : 1;
    const areaOrder = (a.area || '').localeCompare(b.area || '');
    if (areaOrder) return areaOrder;
    return (b.priority || 0) - (a.priority || 0) || a.startTime.localeCompare(b.startTime);
  });
  organized.forEach((item, index) => {
    if (items[index]?.id !== item.id) changes.push(item.id);
    const next = organized[index + 1];
    if (!next || next.date !== item.date) return;
    const [hour, minute] = item.startTime.split(':').map(Number);
    const end = hour * 60 + minute + item.durationMinutes;
    const [nextHour, nextMinute] = next.startTime.split(':').map(Number);
    if (end > nextHour * 60 + nextMinute) warnings.push(`${item.id}:${next.id}`);
  });
  return { organized, changes, warnings };
}

export function generatePackingList(input: {
  days: number; weather?: 'warm' | 'cold' | 'rainy'; activities?: string[];
  children?: boolean; business?: boolean;
}): Record<string, string[]> {
  const result: Record<string, string[]> = {
    documents: ['booking_confirmations', 'travel_insurance'],
    clothing: ['underwear', 'socks', `daily_outfits:${Math.max(1, input.days)}`],
    toiletries: ['toiletries'], electronics: ['phone_charger'],
    medication: ['personal_medication'], general: ['reusable_bottle', 'luggage_tag'],
  };
  if (input.weather === 'cold') result.winter = ['warm_layer', 'coat', 'closed_shoes'];
  if (input.weather === 'rainy') result.rain = ['umbrella', 'rain_jacket'];
  if (input.weather === 'warm') result.warm = ['sun_protection', 'hat'];
  if (input.activities?.includes('beach')) result.beach = ['swimwear', 'beach_towel'];
  if (input.activities?.includes('hiking')) result.hiking = ['walking_shoes', 'day_pack'];
  if (input.children) result.children = ['child_essentials', 'snacks'];
  if (input.business) result.business = ['business_clothing', 'presentation_materials'];
  return result;
}

export function checkTripCompleteness(trip: Partial<TripFormData> | Partial<Trip>): CompletenessFinding[] {
  const findings: CompletenessFinding[] = [];
  const add = (code: string, level: FindingLevel) => findings.push({ code, level });
  if (!trip.client_name?.trim()) add('client_name', 'error');
  if (!trip.destination?.trim()) add('destination', 'error');
  if (!trip.start_date || !trip.end_date) add('dates', 'error');
  else if (!getTripDuration(trip.start_date, trip.end_date)) add('date_range', 'error');
  if (!trip.travelers_count || trip.travelers_count < 1) add('travelers', 'error');
  if (!trip.client_phone?.trim()) add('client_phone', 'warning');
  if (trip.service_type !== 'ticket' && !trip.hotel_name?.trim()) add('hotel', 'error');
  if (trip.service_type !== 'hotel' && !trip.flight_number?.trim()) add('flight', 'warning');
  if (!trip.sale_price || trip.sale_price <= 0) add('sale_price', 'warning');
  if (trip.payment_method === 'mixed') {
    const split = (trip.card_paid_amount || 0) + (trip.cash_paid_amount || 0);
    if (Math.abs(split - (trip.amount_paid || 0)) > 0.005) add('payment_split', 'error');
  }
  if (!trip.itinerary?.length) add('itinerary', 'suggestion');
  return findings;
}

export function suggestPrice(input: {
  wholesaleCost: number; targetMarkup: number; historicalMarkups?: number[]; minimumProfit?: number;
}) {
  const validHistory = (input.historicalMarkups || []).filter(Number.isFinite);
  const historicalAverage = validHistory.length
    ? validHistory.reduce((sum, value) => sum + value, 0) / validHistory.length
    : null;
  const markup = Math.max(0, input.targetMarkup);
  const markupPrice = input.wholesaleCost * (1 + markup / 100);
  const suggestedSalePrice = Math.max(markupPrice, input.wholesaleCost + Math.max(0, input.minimumProfit || 0));
  return { suggestedSalePrice, expectedProfit: suggestedSalePrice - input.wholesaleCost, markup, historicalAverage, hasSufficientHistory: validHistory.length >= 3 };
}

export function buildTripSummary(trip: Trip, clientSafe: boolean) {
  const financials = calculateTripFinancials(trip);
  return {
    client: trip.client_name, destination: trip.destination, startDate: trip.start_date, endDate: trip.end_date,
    duration: getTripDuration(trip.start_date, trip.end_date), travelersCount: trip.travelers_count,
    hotel: trip.hotel_name || null, flights: [trip.airline_name, trip.flight_number].filter(Boolean).join(' ') || null,
    itinerary: trip.itinerary.map(({ day, title }) => ({ day, title })), currency: trip.currency,
    total: financials.salePrice, paid: financials.amountPaid, remaining: financials.amountDue,
    notes: clientSafe ? undefined : trip.notes,
    missing: checkTripCompleteness(trip).map((finding) => finding.code),
  };
}
