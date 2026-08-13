import { supabase } from './supabase';
import type { Json } from '../types/database';

export interface VisaPaymentArrival {
  id: string;
  tripId: string;
  createdAt: string;
  destination: string;
  currency: string;
  amountMinor: number;
  previousVisaConfirmedMinor: number;
  visaConfirmedMinor: number;
  previousConfirmedTotalMinor: number;
  confirmedTotalMinor: number;
  previousUnpaidMinor: number;
  totalUnpaidMinor: number;
  previousConfirmedInstallments: number;
  confirmedInstallments: number;
  partialInstallments: number;
  installmentCount: number;
}

const asRecord = (value: Json): Record<string, Json | undefined> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
const integer = (value: Json | undefined): number => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;

export function mapVisaPaymentArrival(row: { id: string; trip_id: string | null; params: Json; created_at: string }): VisaPaymentArrival | null {
  if (!row.trip_id) return null;
  const params = asRecord(row.params);
  return {
    id: row.id,
    tripId: row.trip_id,
    createdAt: row.created_at,
    destination: typeof params.destination === 'string' ? params.destination : '',
    currency: typeof params.currency === 'string' ? params.currency : 'ILS',
    amountMinor: integer(params.amountMinor),
    previousVisaConfirmedMinor: integer(params.previousVisaConfirmedMinor),
    visaConfirmedMinor: integer(params.visaConfirmedMinor),
    previousConfirmedTotalMinor: integer(params.previousConfirmedTotalMinor),
    confirmedTotalMinor: integer(params.confirmedTotalMinor),
    previousUnpaidMinor: integer(params.previousUnpaidMinor),
    totalUnpaidMinor: integer(params.totalUnpaidMinor),
    previousConfirmedInstallments: integer(params.previousConfirmedInstallments),
    confirmedInstallments: integer(params.confirmedInstallments),
    partialInstallments: integer(params.partialInstallments),
    installmentCount: integer(params.installmentCount),
  };
}

export async function fetchUnseenVisaPaymentArrivals(): Promise<VisaPaymentArrival[]> {
  const { error: materializeError } = await supabase.rpc('materialize_due_visa_progress_events');
  if (materializeError) throw materializeError;
  const { data, error } = await supabase
    .from('trip_notifications')
    .select('id,trip_id,params,created_at,scheduled_for')
    .eq('notification_type', 'visa_schedule_collected')
    .is('read_at', null)
    .is('dismissed_at', null)
    .order('scheduled_for', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).flatMap((row) => mapVisaPaymentArrival(row) ?? []);
}

export async function markVisaPaymentArrivalSeen(id: string): Promise<void> {
  const { error } = await supabase.from('trip_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
