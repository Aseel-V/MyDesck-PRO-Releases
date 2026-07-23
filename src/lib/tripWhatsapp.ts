import { supabase } from './supabase';
import { getTripDuration } from './tripDates';
import { fromMinorUnits } from './tripInstallments';
import type { Trip } from '../types/trip';
import type { TripInstallment, TripPaymentPlan } from './tripPayments';

export type WhatsappLanguage = 'en' | 'he' | 'ar';
export type WhatsappMessageType =
  | 'booking_confirmation' | 'upcoming_trip' | 'visa_installment' | 'cash_balance'
  | 'payment_summary' | 'itinerary_update' | 'trip_summary' | 'missing_information'
  | 'hotel_details' | 'flight_details' | 'final_reminder' | 'thank_you' | 'custom';

export const WHATSAPP_MESSAGE_TYPES: readonly WhatsappMessageType[] = [
  'booking_confirmation', 'upcoming_trip', 'visa_installment', 'cash_balance',
  'payment_summary', 'itinerary_update', 'trip_summary', 'missing_information',
  'hotel_details', 'flight_details', 'final_reminder', 'thank_you', 'custom',
];

export interface TripWhatsappTemplate {
  id: string;
  name: string;
  body: string;
  language: WhatsappLanguage;
  category: string;
  is_favorite: boolean;
  is_archived: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappPaymentContext {
  plan: TripPaymentPlan | null;
  installments: TripInstallment[];
}

export interface WhatsappBusinessContext {
  businessName?: string | null;
  businessPhone?: string | null;
  agentName?: string | null;
}

export type WhatsappTranslate = (key: string, values?: Record<string, unknown>) => string;

export interface WhatsappMessageResult {
  message: string;
  missing: string[];
  variables: Record<string, string>;
}

const PRIVATE_VARIABLES = /passport|password|secret|wholesale|profit|markup|internal|attachment|storage|encryption/i;
const SAFE_VARIABLES = new Set([
  'client_name', 'destination', 'start_date', 'end_date', 'days', 'nights', 'travelers_count',
  'hotel_name', 'hotel_dates', 'room_information', 'board_basis', 'flight_information',
  'sale_amount', 'currency', 'cash_confirmed', 'cash_remaining', 'scheduled_through_today',
  'combined_remaining', 'installment_number', 'installment_count', 'next_installment_amount',
  'next_installment_date', 'remaining_scheduled_amount', 'final_installment_date',
  'business_name', 'business_phone', 'agent_name',
]);

export function normalizeWhatsAppPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (/^05\d{8}$/.test(compact)) return `+972${compact.slice(1)}`;
  if (/^9725\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^00\d{8,15}$/.test(compact)) return `+${compact.slice(2)}`;
  return null;
}

export function formatWhatsAppPhone(value: string): string {
  const normalized = normalizeWhatsAppPhone(value);
  if (!normalized) return value.trim();
  if (/^\+9725\d{8}$/.test(normalized)) return `${normalized.slice(0, 4)} ${normalized.slice(4, 6)}-${normalized.slice(6, 9)}-${normalized.slice(9)}`;
  return normalized;
}

export function maskWhatsAppPhone(value: string): string | null {
  const normalized = normalizeWhatsAppPhone(value);
  return normalized ? `******${normalized.slice(-4)}` : null;
}

export function containsSensitiveWhatsAppContent(value: string): boolean {
  return /passport|דרכון|جواز|password|סיסמה|كلمة السر|secret|סוד|سر|storage[_ ]?path|https?:\/\/[^\s]+(?:storage|object|attachment)/i.test(value);
}

export function findUnknownWhatsappVariables(body: string): string[] {
  const variables = Array.from(body.matchAll(/{{\s*([a-z_]+)\s*}}/gi), (match) => match[1].toLowerCase());
  return Array.from(new Set(variables.filter((key) => !SAFE_VARIABLES.has(key) || PRIVATE_VARIABLES.test(key))));
}

function localeFor(language: WhatsappLanguage): string {
  return language === 'he' ? 'he-IL-u-nu-latn' : language === 'ar' ? 'ar-IL-u-nu-latn' : 'en-IL-u-nu-latn';
}

function formatDate(value: string | null | undefined, language: WhatsappLanguage): string {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function formatMoney(value: number, currency: string, language: WhatsappLanguage): string {
  return new Intl.NumberFormat(localeFor(language), { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

function roomInformation(trip: Trip): string {
  if (!trip.room_type) return '';
  return Object.entries(trip.room_type).filter(([, count]) => Number(count) > 0).map(([room, count]) => `${room}: ${count}`).join(', ');
}

function flightInformation(trip: Trip): string {
  return [trip.airline_name, trip.flight_number, trip.departure_airport && trip.arrival_airport ? `${trip.departure_airport}-${trip.arrival_airport}` : '', trip.departure_datetime?.replace('T', ' ').slice(0, 16)].filter(Boolean).join(' | ');
}

export function buildWhatsappVariables(
  trip: Trip,
  language: WhatsappLanguage,
  business: WhatsappBusinessContext = {},
  payment: WhatsappPaymentContext = { plan: null, installments: [] },
): Record<string, string> {
  const duration = getTripDuration(trip.start_date, trip.end_date);
  const active = payment.installments.filter((item) => item.status !== 'cancelled');
  const next = active.find((item) => item.paid_amount_minor < item.expected_amount_minor) ?? null;
  const processed = active.filter((item) => item.status === 'paid').length;
  const plan = payment.plan;
  const cardRemainingMinor = plan ? Math.max(0, plan.card_total_minor - plan.card_paid_minor) : Math.round(Math.max(0, trip.payment_plan_summary?.remaining_scheduled_minor ?? 0));
  const cashConfirmedMinor = plan?.cash_paid_minor ?? Math.round((trip.cash_paid_amount ?? 0) * 100);
  const cashRemainingMinor = plan ? Math.max(0, plan.cash_total_minor - plan.cash_paid_minor) : 0;
  const nextMinor = next ? Math.max(0, next.expected_amount_minor - next.paid_amount_minor) : trip.payment_plan_summary?.next_installment_minor ?? 0;
  const currency = plan?.currency || trip.currency;
  return {
    client_name: trip.client_name || '', destination: trip.destination || '',
    start_date: formatDate(trip.start_date, language), end_date: formatDate(trip.end_date, language),
    days: duration ? String(duration.days) : '', nights: duration ? String(duration.nights) : '',
    travelers_count: trip.travelers_count > 0 ? String(trip.travelers_count) : '',
    hotel_name: trip.hotel_name || '', hotel_dates: trip.hotel_name ? `${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}` : '',
    room_information: roomInformation(trip), board_basis: trip.board_basis || '', flight_information: flightInformation(trip),
    sale_amount: formatMoney(trip.sale_price, trip.currency, language), currency,
    cash_confirmed: cashConfirmedMinor > 0 ? formatMoney(fromMinorUnits(cashConfirmedMinor), currency, language) : '',
    cash_remaining: cashRemainingMinor > 0 ? formatMoney(fromMinorUnits(cashRemainingMinor), currency, language) : '',
    scheduled_through_today: plan?.card_paid_minor ? formatMoney(fromMinorUnits(plan.card_paid_minor), currency, language) : '',
    combined_remaining: cardRemainingMinor + cashRemainingMinor > 0 ? formatMoney(fromMinorUnits(cardRemainingMinor + cashRemainingMinor), currency, language) : '',
    installment_number: next ? String(next.installment_number) : trip.payment_plan_summary?.next_installment_date ? String((trip.payment_plan_summary.processed_installments || 0) + 1) : '',
    installment_count: String(plan?.installment_count || trip.payment_plan_summary?.installment_count || active.length || ''),
    next_installment_amount: nextMinor > 0 ? formatMoney(fromMinorUnits(nextMinor), currency, language) : '',
    next_installment_date: formatDate(next?.due_date || trip.payment_plan_summary?.next_installment_date, language),
    remaining_scheduled_amount: cardRemainingMinor > 0 ? formatMoney(fromMinorUnits(cardRemainingMinor), currency, language) : '',
    final_installment_date: formatDate(active[active.length - 1]?.due_date || trip.payment_plan_summary?.final_installment_date, language),
    business_name: business.businessName || '', business_phone: business.businessPhone || '', agent_name: business.agentName || '',
    processed_installments: String(processed || trip.payment_plan_summary?.processed_installments || ''),
  };
}

export function interpolateWhatsappVariables(body: string, variables: Record<string, string>): string {
  return body
    .split('\n')
    .filter((line) => !Array.from(line.matchAll(/{{\s*([a-z_]+)\s*}}/gi)).some((match) => !variables[match[1].toLowerCase()]))
    .map((line) => line.replace(/{{\s*([a-z_]+)\s*}}/gi, (_token, key: string) => variables[key.toLowerCase()] || ''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function generateTripWhatsappMessage(
  type: WhatsappMessageType,
  trip: Trip,
  language: WhatsappLanguage,
  translate: WhatsappTranslate,
  business: WhatsappBusinessContext = {},
  payment: WhatsappPaymentContext = { plan: null, installments: [] },
  includeSignature = true,
): WhatsappMessageResult {
  const variables = buildWhatsappVariables(trip, language, business, payment);
  const missing: string[] = [];
  if (!variables.client_name) missing.push('client_name');
  if (!variables.destination) missing.push('destination');
  if ((type === 'visa_installment' || type === 'payment_summary') && !variables.installment_count) missing.push('payment_plan');
  if (type === 'hotel_details' && !variables.hotel_name) missing.push('hotel');
  const body = type === 'custom' ? '' : translate(`trips.whatsapp.messages.${type}`);
  const signature = includeSignature && variables.business_name ? `\n\n${translate('trips.whatsapp.messages.signature', { businessName: variables.business_name, businessPhone: variables.business_phone })}` : '';
  return { message: interpolateWhatsappVariables(`${body}${signature}`, variables), missing, variables };
}

// Backward-compatible adapter for saved templates created before snake_case variables.
export function interpolateWhatsAppTemplate(body: string, trip: Trip, businessName: string, payment?: { nextAmount?: string; nextDate?: string }): string {
  const aliases = buildWhatsappVariables(trip, 'en', { businessName });
  Object.assign(aliases, {
    clientname: trip.client_name, startdate: trip.start_date, enddate: trip.end_date,
    amountpaid: String(trip.amount_paid), amountdue: String(trip.amount_due), currency: trip.currency,
    businessname: businessName, nextinstallmentamount: payment?.nextAmount || '', nextinstallmentdate: payment?.nextDate || '',
  });
  return interpolateWhatsappVariables(body, aliases);
}

export function createWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  const trimmed = message.trim();
  if (!normalized || !trimmed) return null;
  return `https://wa.me/${normalized.replace(/\D/g, '')}?text=${encodeURIComponent(trimmed)}`;
}

const TEMPLATE_FIELDS = 'id,name,body,language,category,is_favorite,is_archived,usage_count,last_used_at,created_at,updated_at';

export async function fetchWhatsAppTemplates(): Promise<TripWhatsappTemplate[]> {
  const { data, error } = await supabase.from('trip_whatsapp_templates').select(TEMPLATE_FIELDS).eq('is_archived', false).order('is_favorite', { ascending: false }).order('updated_at', { ascending: false });
  if (error) throw error;
  return data as unknown as TripWhatsappTemplate[];
}

export async function saveWhatsAppTemplate(userId: string, template: Pick<TripWhatsappTemplate, 'name' | 'body' | 'language' | 'category'> & { id?: string }): Promise<void> {
  if (findUnknownWhatsappVariables(template.body).length) throw new Error('UNKNOWN_TEMPLATE_VARIABLE');
  const values = { name: template.name.trim(), body: template.body.trim(), language: template.language, category: template.category, updated_at: new Date().toISOString() };
  const { error } = template.id
    ? await supabase.from('trip_whatsapp_templates').update(values).eq('id', template.id)
    : await supabase.from('trip_whatsapp_templates').insert({ ...values, user_id: userId });
  if (error) throw error;
}

export async function updateWhatsappTemplateState(id: string, values: { is_favorite?: boolean; is_archived?: boolean }): Promise<void> {
  const { error } = await supabase.from('trip_whatsapp_templates').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function markWhatsappTemplateUsed(id: string, usageCount: number): Promise<void> {
  const { error } = await supabase.from('trip_whatsapp_templates').update({ usage_count: usageCount + 1, last_used_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteWhatsAppTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('trip_whatsapp_templates').delete().eq('id', id);
  if (error) throw error;
}
