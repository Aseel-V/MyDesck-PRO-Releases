import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TripFormData } from '../types/trip';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export function useTripMutations() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const saveTripMutation = useMutation({
        mutationFn: async ({ formData, editTripId }: { formData: TripFormData; editTripId?: string }) => {
            if (!user?.id) throw new Error('User not authenticated');

            if (editTripId) {
                const { error } = await supabase
                    .from('trips')
                    .update({ ...formData, updated_at: new Date().toISOString() })
                    .eq('id', editTripId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('trips')
                    .insert([{ ...formData, user_id: user.id }]);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success('Trip saved successfully');
        },
        onError: (error: any) => {
            console.error('Error saving trip:', error);
            toast.error('Failed to save trip');
        }
    });

    const deleteTripMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('trips').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success('Trip deleted');
        },
        onError: (error: any) => {
            console.error('Error deleting trip:', error);
            toast.error('Failed to delete trip');
        }
    });

    const updatePaymentMutation = useMutation({
        mutationFn: async ({ tripId, amountPaid, paymentStatus, payments }: { tripId: string, amountPaid: number, paymentStatus: 'paid' | 'partial' | 'unpaid', payments?: any[] }) => {
            const { error } = await supabase
                .from('trips')
                .update({
                    amount_paid: amountPaid,
                    payment_status: paymentStatus,
                    payments: payments, // Update the payments history/array
                    updated_at: new Date().toISOString(),
                })
                .eq('id', tripId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success('Payment updated');
        },
        onError: (error: any) => {
            console.error('Error updating payment:', error);
            toast.error('Failed to update payment');
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
        onError: (error: any) => {
            console.error('Error toggling export:', error);
            toast.error('Failed to update export status');
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
