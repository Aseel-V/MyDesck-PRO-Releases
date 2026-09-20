import { normalizeIsraeliPhoneNumber } from '../../../src/lib/phoneNumbers.ts';

export type WhatsappLanguage = 'en' | 'he' | 'ar';
export type OfficialTemplateKey =
  | 'trip_confirmation'
  | 'trip_departure_reminder'
  | 'outstanding_payment_reminder'
  | 'visa_installment_due_soon'
  | 'visa_installment_overdue'
  | 'final_payment_reminder'
  | 'hotel_details'
  | 'flight_details';

export const TEMPLATE_FOR_MESSAGE: Readonly<Record<string, OfficialTemplateKey | null>> = {
  booking_confirmation: 'trip_confirmation',
  upcoming_trip: 'trip_departure_reminder',
  cash_balance: 'outstanding_payment_reminder',
  visa_installment: 'visa_installment_due_soon',
  final_reminder: 'final_payment_reminder',
  hotel_details: 'hotel_details',
  flight_details: 'flight_details',
  payment_summary: null,
  itinerary_update: null,
  trip_summary: null,
  missing_information: null,
  thank_you: null,
  custom: null,
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function isLanguage(value: unknown): value is WhatsappLanguage {
  return value === 'en' || value === 'he' || value === 'ar';
}

export function isTemplateKey(value: unknown): value is OfficialTemplateKey {
  return typeof value === 'string' && Object.values(TEMPLATE_FOR_MESSAGE).includes(value as OfficialTemplateKey);
}

export function canonicalRecipient(value: unknown): string | null {
  return typeof value === 'string' ? normalizeIsraeliPhoneNumber(value) : null;
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function safeProviderFailure(status: number): { code: string; message: string; retryable: boolean } {
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', message: 'The provider is temporarily rate limited.', retryable: true };
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', message: 'The provider is temporarily unavailable.', retryable: true };
  return { code: 'PROVIDER_REJECTED', message: 'The provider rejected the approved template request.', retryable: false };
}
