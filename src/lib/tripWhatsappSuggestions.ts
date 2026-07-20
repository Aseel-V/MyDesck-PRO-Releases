import type { Trip } from '../types/trip';
import type { WhatsappMessageType, WhatsappPaymentContext } from './tripWhatsapp';

const DAY_MS = 86_400_000;
const asUtcDay = (value: string) => Date.parse(`${value.slice(0, 10)}T12:00:00Z`);

export function recommendWhatsappMessage(trip: Trip, payment: WhatsappPaymentContext, today = new Date().toISOString().slice(0, 10)): WhatsappMessageType {
  const todayMs = asUtcDay(today);
  const startDays = Math.round((asUtcDay(trip.start_date) - todayMs) / DAY_MS);
  const endDays = Math.round((asUtcDay(trip.end_date) - todayMs) / DAY_MS);
  const next = payment.installments.find((item) => item.status !== 'paid' && item.status !== 'cancelled');
  const installmentDays = next ? Math.round((asUtcDay(next.due_date) - todayMs) / DAY_MS) : Number.POSITIVE_INFINITY;
  if (endDays < 0) return 'thank_you';
  if (installmentDays >= 0 && installmentDays <= 3) return 'visa_installment';
  if ((payment.plan?.cash_total_minor || 0) > (payment.plan?.cash_paid_minor || 0) && startDays >= 0) return 'cash_balance';
  if (startDays >= 0 && startDays <= 7) return 'final_reminder';
  if (!trip.client_phone || !trip.travelers_count) return 'missing_information';
  if (trip.updated_at > trip.created_at && trip.itinerary.length > 0) return 'itinerary_update';
  return 'booking_confirmation';
}
