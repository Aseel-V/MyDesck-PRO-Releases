import { supabase } from '../lib/supabase';
import type { TripFormData } from '../types/trip';
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../lib/tripPayload';
import type { Json } from '../types/database';
import { requireCanonicalPaymentWriteContract } from '../lib/paymentContractCompatibility';
/** Compatibility adapter for the production UI contract. No dual writes. */
export class SupabaseTripRepository {
  async saveTrip(user: {id:string} | null, formData: TripFormData, editTripId?: string, clientRequestId?: string) {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const paymentPlan = toTripPaymentPlanInput(formData);
            await requireCanonicalPaymentWriteContract();
            if (import.meta.env.DEV && paymentPlan) {
                console.info('[Travel payment write] Redacted plan payload.', {
                    method: paymentPlan.method,
                    currency: paymentPlan.currency,
                    cardTotalMinor: paymentPlan.cardTotalMinor,
                    cashTotalMinor: paymentPlan.cashTotalMinor,
                    confirmedCashMinor: paymentPlan.confirmedCashMinor,
                    installmentCount: paymentPlan.installmentCount,
                    firstDatePresent: Boolean(paymentPlan.firstDate),
                    existingPlan: Boolean(paymentPlan.existingPlanId),
                });
            }
            const rawPayload = editTripId ? { id: editTripId, ...toTripUpdate(formData) } : toTripInsert(formData, user.id);

            const requestId = clientRequestId || crypto.randomUUID();

            const { data, error } = await supabase.rpc('save_trip_transaction', {
                p_trip_data: rawPayload as unknown as Json,
                p_payment_plan: (paymentPlan ?? undefined) as unknown as Json,
                p_client_request_id: requestId,
            });

            if (error) throw error;
            return data as { id: string; client_name: string; destination: string; updated_at: string };
  }
  async restoreTrip(user: {id:string} | null, id: string) {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const { data, error } = await supabase
                .from('trips')
                .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .not('deleted_at', 'is', null)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('TRIP_RESTORE_NOT_APPLIED');
            return data.id;
  }
  async deleteTrip(user: {id:string} | null, id: string) {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const deletedAt = new Date().toISOString();
            const { data, error } = await supabase
                .from('trips')
                .update({ deleted_at: deletedAt, deleted_by: user.id, updated_at: deletedAt })
                .eq('id', id)
                .eq('user_id', user.id)
                .is('deleted_at', null)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('TRIP_DELETE_NOT_APPLIED');
            return data.id;
  }
  async archiveTrip(user: {id:string} | null, id: string, archived: boolean) {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const { error } = await supabase
                .from('trips')
                .update({ status: archived ? 'archived' : 'active', updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .is('deleted_at', null);
            if (error) throw error;
  }
  async toggleExport(user: {id:string} | null, id: string, value: boolean) {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const { error } = await supabase
                .from('trips')
                .update({ export_to_pdf: value, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .is('deleted_at', null);
            if (error) throw error;
  }
}
