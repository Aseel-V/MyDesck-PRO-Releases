import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Payment, TripFormData } from '../types/trip';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { toTripInsert, toTripPaymentPlanInput, toTripUpdate } from '../lib/tripPayload';
import type { Json } from '../types/database';
import { getSafeErrorCode, logSafeDatabaseError } from '../lib/safeError';
import {
    addOptimisticTrip,
    patchTripInPages,
    removeTripFromPages,
    replaceOptimisticTripId,
    restoreTripPages,
    snapshotTripPages,
    type TripCacheSnapshot,
} from '../lib/tripOptimisticCache';

export function useTripMutations() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    const saveTripMutation = useMutation({
        mutationFn: async ({ formData, editTripId, clientRequestId }: { formData: TripFormData; editTripId?: string; clientRequestId?: string }) => {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const paymentPlan = toTripPaymentPlanInput(formData);
            const rawPayload = editTripId ? { id: editTripId, ...toTripUpdate(formData) } : toTripInsert(formData, user.id);

            const requestId = clientRequestId || crypto.randomUUID();

            const { data, error } = await supabase.rpc('save_trip_transaction', {
                p_trip_data: rawPayload as unknown as Json,
                p_payment_plan: (paymentPlan ?? undefined) as unknown as Json,
                p_client_request_id: requestId,
            });

            if (error) throw error;
            return data as { id: string; client_name: string; destination: string; updated_at: string };
        },
        onMutate: async ({ formData, editTripId }) => {
            await queryClient.cancelQueries({ queryKey: ['trips-page'] });
            const snapshot = snapshotTripPages(queryClient);
            const temporaryId = editTripId ? undefined : `optimistic-${crypto.randomUUID()}`;
            if (editTripId) patchTripInPages(queryClient, editTripId, { ...formData, updated_at: new Date().toISOString() });
            else if (user?.id && temporaryId) addOptimisticTrip(queryClient, formData, user.id, temporaryId);
            return { snapshot, temporaryId };
        },
        onSuccess: async (result, _variables, context) => {
            if (context?.temporaryId) replaceOptimisticTripId(queryClient, context.temporaryId, result.id);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['trips-page'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-years'] }),
                queryClient.invalidateQueries({ queryKey: ['distinct-clients'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-payment-plan'] }),
            ]);
            toast.success(t('notifications.tripSaved'));
        },
        onError: (error: Error) => {
            logSafeDatabaseError('Trip save failed:', error);
            toast.error(t('notifications.tripSaveError'));
        }
    });

    const restoreTripMutation = useMutation({
        mutationFn: async (id: string) => {
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
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips-page'] });
            queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['trip-years'] });
            toast.success(t('notifications.tripRestored'));
        },
        onError: (error: Error) => {
            console.error('Trip restore failed:', getSafeErrorCode(error));
            toast.error(t('notifications.tripRestoreError'));
        },
    });

    const deleteTripMutation = useMutation({
        mutationFn: async (id: string) => {
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
        },
        onMutate: async (tripId) => {
            await queryClient.cancelQueries({ queryKey: ['trips-page'] });
            const snapshot = snapshotTripPages(queryClient);
            removeTripFromPages(queryClient, tripId);
            return { snapshot };
        },
        onSuccess: (tripId) => {
            queryClient.invalidateQueries({ queryKey: ['trips-page'] });
            queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['trip-years'] });
            toast.success(t('notifications.tripMovedToTrash'), {
                action: {
                    label: t('trips.undo'),
                    onClick: () => void restoreTripMutation.mutateAsync(tripId),
                },
            });
        },
        onError: (error: Error, _tripId, context) => {
            restoreTripPages(queryClient, context?.snapshot);
            console.error('Trip soft-delete failed:', getSafeErrorCode(error));
            toast.error(t('notifications.tripDeleteError'));
        }
    });

    const archiveTripMutation = useMutation({
        mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const { error } = await supabase
                .from('trips')
                .update({ status: archived ? 'archived' : 'active', updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .is('deleted_at', null);
            if (error) throw error;
        },
        onMutate: async ({ id, archived }) => {
            await queryClient.cancelQueries({ queryKey: ['trips-page'] });
            const snapshot = snapshotTripPages(queryClient);
            if (archived) removeTripFromPages(queryClient, id);
            else patchTripInPages(queryClient, id, { status: 'active' });
            return { snapshot };
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['trips-page'] });
            queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['trip-years'] });
            toast.success(t(variables.archived ? 'notifications.tripArchived' : 'notifications.tripRestored'));
        },
        onError: (error: Error, _variables, context: { snapshot: TripCacheSnapshot } | undefined) => {
            restoreTripPages(queryClient, context?.snapshot);
            console.error('Trip archive failed:', getSafeErrorCode(error));
            toast.error(t('notifications.tripArchiveError'));
        }
    });

    const updatePaymentMutation = useMutation({
        mutationFn: async ({ tripId, amountPaid, paymentStatus, payments }: { tripId: string, amountPaid: number, paymentStatus: 'paid' | 'partial' | 'unpaid', payments?: Payment[] }) => {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const { error } = await supabase
                .from('trips')
                .update({
                    amount_paid: amountPaid,
                    payment_status: paymentStatus,
                    payments: (payments ?? []) as unknown as Json,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', tripId)
                .eq('user_id', user.id)
                .is('deleted_at', null);
            if (error) throw error;
        },
        onMutate: async ({ tripId, amountPaid, paymentStatus, payments }) => {
            await queryClient.cancelQueries({ queryKey: ['trips-page'] });
            const snapshot = snapshotTripPages(queryClient);
            patchTripInPages(queryClient, tripId, { amount_paid: amountPaid, payment_status: paymentStatus, payments: payments ?? [] });
            return { snapshot };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips-page'] });
            queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] });
            toast.success(t('notifications.paymentUpdated'));
        },
        onError: (error: Error, _variables, context) => {
            restoreTripPages(queryClient, context?.snapshot);
            console.error('Trip payment update failed:', getSafeErrorCode(error));
            toast.error(t('notifications.paymentUpdateError'));
        }
    });

    const toggleExportMutation = useMutation({
        mutationFn: async ({ id, value }: { id: string, value: boolean }) => {
            if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
            const { error } = await supabase
                .from('trips')
                .update({ export_to_pdf: value, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .is('deleted_at', null);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips-page'] });
            queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] });
        },
        onError: (error: Error) => {
            console.error('Trip export status update failed:', getSafeErrorCode(error));
            toast.error(t('notifications.exportStatusError'));
        }
    });

    return {
        saveTrip: saveTripMutation.mutateAsync,
        deleteTrip: deleteTripMutation.mutateAsync,
        restoreTrip: restoreTripMutation.mutateAsync,
        archiveTrip: (id: string) => archiveTripMutation.mutateAsync({ id, archived: true }),
        unarchiveTrip: (id: string) => archiveTripMutation.mutateAsync({ id, archived: false }),
        updatePayment: updatePaymentMutation.mutateAsync,
        toggleExport: toggleExportMutation.mutate,
        isSaving: saveTripMutation.isPending,
        isDeleting: deleteTripMutation.isPending,
        isRestoring: restoreTripMutation.isPending,
        isArchiving: archiveTripMutation.isPending,
    };
}
