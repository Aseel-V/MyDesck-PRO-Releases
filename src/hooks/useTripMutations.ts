import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TripFormData } from '../types/trip';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

export function useTripMutations() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    const saveTripMutation = useMutation({
        mutationFn: async ({ formData, editTripId }: { formData: TripFormData; editTripId?: string }) => {
            if (!user?.id) throw new Error('User not authenticated');

            if (editTripId) {
                const { error } = await supabase
                    .from('trips')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .update({ ...(formData as any), updated_at: new Date().toISOString() })
                    .eq('id', editTripId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('trips')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .insert([{ ...(formData as any), user_id: user.id }]);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success(t('notifications.tripSaved') || 'Trip saved successfully');
        },
        onError: (error: Error) => {
            console.error('Error saving trip:', error);
            toast.error(t('notifications.tripSaveError') || 'Failed to save trip');
        }
    });

    const deleteTripMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('trips').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success(t('notifications.tripDeleted') || 'Trip deleted');
        },
        onError: (error: Error) => {
            console.error('Error deleting trip:', error);
            toast.error(t('notifications.tripDeleteError') || 'Failed to delete trip');
        }
    });

    const updatePaymentMutation = useMutation({
        mutationFn: async ({ tripId, amountPaid, paymentStatus, payments }: { tripId: string, amountPaid: number, paymentStatus: 'paid' | 'partial' | 'unpaid', payments?: { amount: number, date: string }[] }) => {
            const { error } = await supabase
                .from('trips')
                .update({
                    amount_paid: amountPaid,
                    payment_status: paymentStatus,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    payments: payments as any, // Update the payments history/array
                    updated_at: new Date().toISOString(),
                })
                .eq('id', tripId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success(t('notifications.paymentUpdated') || 'Payment updated');
        },
        onError: (error: Error) => {
            console.error('Error updating payment:', error);
            toast.error(t('notifications.paymentUpdateError') || 'Failed to update payment');
        }
    });

    const toggleExportMutation = useMutation({
        mutationFn: async ({ id, value }: { id: string, value: boolean }) => {
            const { error } = await supabase
                .from('trips')
                .update({ export_to_pdf: value, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
        },
        onError: (error: Error) => {
            console.error('Error toggling export:', error);
            toast.error(t('notifications.exportStatusError') || 'Failed to update export status');
        }
    });

    return {
        saveTrip: saveTripMutation.mutateAsync,
        deleteTrip: deleteTripMutation.mutate,
        updatePayment: updatePaymentMutation.mutateAsync,
        toggleExport: toggleExportMutation.mutate,
        isSaving: saveTripMutation.isPending,
        isDeleting: deleteTripMutation.isPending,
    };
}
