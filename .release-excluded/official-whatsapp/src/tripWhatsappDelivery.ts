import { supabase } from './supabase';
import { normalizeIsraeliPhoneNumber } from './phoneNumbers';
import type { WhatsappLanguage, WhatsappMessageType } from './tripWhatsapp';

export type OfficialWhatsappTemplateKey =
  | 'trip_confirmation' | 'trip_departure_reminder' | 'outstanding_payment_reminder'
  | 'visa_installment_due_soon' | 'visa_installment_overdue' | 'final_payment_reminder'
  | 'hotel_details' | 'flight_details';

export const OFFICIAL_TEMPLATE_FOR_MESSAGE: Partial<Record<WhatsappMessageType, OfficialWhatsappTemplateKey>> = {
  booking_confirmation: 'trip_confirmation', upcoming_trip: 'trip_departure_reminder',
  cash_balance: 'outstanding_payment_reminder', visa_installment: 'visa_installment_due_soon',
  final_reminder: 'final_payment_reminder', hotel_details: 'hotel_details', flight_details: 'flight_details',
};

export const REMINDER_TRIGGER_FOR_MESSAGE: Partial<Record<WhatsappMessageType, string>> = {
  booking_confirmation: 'trip_confirmation', upcoming_trip: 'pre_departure',
  cash_balance: 'outstanding_cash_payment', visa_installment: 'upcoming_visa_installment',
  final_reminder: 'final_payment', hotel_details: 'hotel_details', flight_details: 'flight_details',
};

export type WhatsappConsent = {
  whatsapp_opt_in: boolean;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_in_source: string | null;
  whatsapp_opt_out_at: string | null;
};

export type WhatsappDeliveryResult = {
  message_id?: string;
  reminder_id?: string;
  status: string;
  scheduled_for?: string;
  duplicate?: boolean;
};

export type WhatsappReminder = {
  id: string;
  trigger_type: string;
  scheduled_for: string;
  timezone: string;
  template_key: string;
  language: WhatsappLanguage;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'skipped';
  attempt_count: number;
};

export type WhatsappMessageLog = {
  id: string;
  template_key: string;
  language: WhatsappLanguage;
  status: 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled' | 'skipped';
  attempt_count: number;
  failure_code: string | null;
  failure_message_safe: string | null;
  created_at: string;
};

export async function fetchWhatsappConsent(userId: string, phone: string): Promise<WhatsappConsent | null> {
  const recipient = normalizeIsraeliPhoneNumber(phone);
  if (!recipient) return null;
  const { data, error } = await supabase.from('whatsapp_contact_consents')
    .select('whatsapp_opt_in,whatsapp_opt_in_at,whatsapp_opt_in_source,whatsapp_opt_out_at')
    .eq('user_id', userId).eq('recipient_phone', recipient).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setWhatsappConsent(userId: string, phone: string, optedIn: boolean): Promise<void> {
  const recipient = normalizeIsraeliPhoneNumber(phone);
  if (!recipient) throw new Error('INVALID_PHONE');
  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_contact_consents').upsert({
    user_id: userId, recipient_phone: recipient, whatsapp_opt_in: optedIn,
    whatsapp_opt_in_at: optedIn ? now : null,
    whatsapp_opt_in_source: optedIn ? 'travel_whatsapp_dialog' : null,
    whatsapp_opt_out_at: optedIn ? null : now, updated_at: now,
  }, { onConflict: 'user_id,recipient_phone' });
  if (error) throw error;
}

type DeliveryRequest = {
  tripId: string;
  phone: string;
  messageType: WhatsappMessageType;
  language: WhatsappLanguage;
};

async function invokeDelivery(payload: Record<string, unknown>): Promise<WhatsappDeliveryResult> {
  const { data, error } = await supabase.functions.invoke('send-whatsapp-message', { body: payload });
  if (error) throw new Error((data as { error?: string } | null)?.error || 'WHATSAPP_DELIVERY_FAILED');
  const result = data as WhatsappDeliveryResult & { error?: string };
  if (result.error) throw new Error(result.error);
  return result;
}

export async function sendOfficialWhatsappMessage(request: DeliveryRequest): Promise<WhatsappDeliveryResult> {
  const recipient = normalizeIsraeliPhoneNumber(request.phone);
  const templateKey = OFFICIAL_TEMPLATE_FOR_MESSAGE[request.messageType];
  if (!recipient) throw new Error('INVALID_PHONE');
  if (!templateKey) throw new Error('TEMPLATE_NOT_ALLOWED');
  return invokeDelivery({
    action: 'send', trip_id: request.tripId, message_type: request.messageType,
    recipient_phone: recipient, template_key: templateKey, language: request.language, variables: {},
  });
}

export async function scheduleOfficialWhatsappReminder(
  request: DeliveryRequest & { scheduledFor: string; timezone: string; triggerType: string },
): Promise<WhatsappDeliveryResult> {
  const recipient = normalizeIsraeliPhoneNumber(request.phone);
  const templateKey = OFFICIAL_TEMPLATE_FOR_MESSAGE[request.messageType];
  if (!recipient) throw new Error('INVALID_PHONE');
  if (!templateKey) throw new Error('TEMPLATE_NOT_ALLOWED');
  return invokeDelivery({
    action: 'schedule', trip_id: request.tripId, message_type: request.messageType,
    recipient_phone: recipient, template_key: templateKey, language: request.language, variables: {},
    scheduled_for: new Date(request.scheduledFor).toISOString(), timezone: request.timezone,
    trigger_type: request.triggerType,
  });
}

export async function fetchTripWhatsappReminders(tripId: string): Promise<WhatsappReminder[]> {
  const { data, error } = await supabase.from('whatsapp_reminders')
    .select('id,trigger_type,scheduled_for,timezone,template_key,language,status,attempt_count')
    .eq('trip_id', tripId).order('scheduled_for', { ascending: false }).limit(20);
  if (error) throw error;
  return data;
}

export async function cancelOfficialWhatsappReminder(reminderId: string): Promise<WhatsappDeliveryResult> {
  return invokeDelivery({ action: 'cancel', reminder_id: reminderId });
}

export async function fetchTripWhatsappMessages(tripId: string): Promise<WhatsappMessageLog[]> {
  const { data, error } = await supabase.from('whatsapp_message_log')
    .select('id,template_key,language,status,attempt_count,failure_code,failure_message_safe,created_at')
    .eq('trip_id', tripId).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return data;
}

export async function retryOfficialWhatsappMessage(messageId: string, request: DeliveryRequest): Promise<WhatsappDeliveryResult> {
  const recipient = normalizeIsraeliPhoneNumber(request.phone);
  const templateKey = OFFICIAL_TEMPLATE_FOR_MESSAGE[request.messageType];
  if (!recipient) throw new Error('INVALID_PHONE');
  if (!templateKey) throw new Error('TEMPLATE_NOT_ALLOWED');
  return invokeDelivery({
    action: 'retry', retry_message_id: messageId, trip_id: request.tripId,
    message_type: request.messageType, recipient_phone: recipient,
    template_key: templateKey, language: request.language, variables: {},
  });
}
