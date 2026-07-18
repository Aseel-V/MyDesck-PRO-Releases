import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Attachment, TripFormData } from '../types/trip';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { removeTripAttachments } from '../lib/tripAttachments';

export function useTripMutations() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    const saveTripMutation = useMutation({
        mutationFn: async ({ formData, editTripId }: { formData: TripFormData; editTripId?: string }) => {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');

            if (editTripId) {
                const { data, error } = await supabase
                    .from('trips')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .update({ ...(formData as any), updated_at: new Date().toISOString() })
                    .eq('id', editTripId)
                    .eq('user_id', user.id)
                    .select('id, updated_at')
                    .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('TRIP_UPDATE_NOT_APPLIED');
                return data;
            } else {
                const { data, error } = await supabase
                    .from('trips')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .insert([{ ...(formData as any), user_id: user.id }])
                    .select('id, updated_at')
                    .single();
                if (error) throw error;
                return data;
            }
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['trips'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-years'] }),
                queryClient.invalidateQueries({ queryKey: ['distinct-clients'] }),
            ]);
            toast.success(t('notifications.tripSaved'));
        },
        onError: (error: Error) => {
            console.error('Error saving trip:', error);
            toast.error(t('notifications.tripSaveError'));
        }
    });

    const deleteTripMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data: tripData } = await supabase
                .from('trips')
                .select('attachments')
                .eq('id', id)
                .maybeSingle();

            const { error } = await supabase.from('trips').delete().eq('id', id);
            if (error) throw error;

            try {
                const attachments = (tripData?.attachments as Attachment[] | null) || [];
                await removeTripAttachments(attachments);
            } catch (cleanupError) {
                console.error('Failed to clean up trip attachments:', cleanupError);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            queryClient.invalidateQueries({ queryKey: ['trip-years'] });
            toast.success(t('notifications.tripDeleted'));
        },
        onError: (error: Error) => {
            console.error('Error deleting trip:', error);
            toast.error(t('notifications.tripDeleteError'));
        }
    });

    const archiveTripMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('trips')
                .update({ status: 'archived', updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            queryClient.invalidateQueries({ queryKey: ['trip-years'] });
            toast.success(t('notifications.tripArchived'));
        },
        onError: (error: Error) => {
            console.error('Error archiving trip:', error);
            toast.error(t('notifications.tripArchiveError'));
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
            toast.success(t('notifications.paymentUpdated'));
        },
        onError: (error: Error) => {
            console.error('Error updating payment:', error);
            toast.error(t('notifications.paymentUpdateError'));
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
            toast.error(t('notifications.exportStatusError'));
        }
    });

    return {
        saveTrip: saveTripMutation.mutateAsync,
        deleteTrip: deleteTripMutation.mutateAsync,
        archiveTrip: archiveTripMutation.mutateAsync,
        updatePayment: updatePaymentMutation.mutateAsync,
        toggleExport: toggleExportMutation.mutate,
        isSaving: saveTripMutation.isPending,
        isDeleting: deleteTripMutation.isPending,
        isArchiving: archiveTripMutation.isPending,
    };
}
