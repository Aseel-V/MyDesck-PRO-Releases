import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getBackend } from '../data/backend';
import { TripFormData } from '../types/trip';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { getSafeErrorCode, logSafeDatabaseError } from '../lib/safeError';
import { logTripPaymentContractComparison } from '../lib/tripQueries';
import {
    addOptimisticTrip,
    patchTripInPages,
    removeTripFromPages,
    replaceOptimisticTripId,
    restoreTripPages,
    snapshotTripPages,
    type TripCacheSnapshot,
} from '../lib/tripOptimisticCache';

/** The Supabase repository's guard, kept at the call site: no command runs without a signed-in user. */
function requireUserId(user: { id: string } | null): string {
    if (!user?.id) throw new Error('USER_NOT_AUTHENTICATED');
    return user.id;
}

export function useTripMutations() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    const saveTripMutation = useMutation({
        mutationFn: async ({ formData, editTripId, clientRequestId }: { formData: TripFormData; editTripId?: string; clientRequestId?: string }) => {
            return getBackend().travel.saveTrip(requireUserId(user), formData, editTripId, clientRequestId);
        },
        onMutate: async ({ formData, editTripId }) => {
            await queryClient.cancelQueries({ queryKey: ['trips-page'] });
            const snapshot = snapshotTripPages(queryClient);
            const temporaryId = editTripId ? undefined : `optimistic-${crypto.randomUUID()}`;
            if (editTripId) patchTripInPages(queryClient, editTripId, { ...formData, updated_at: new Date().toISOString() });
            else if (user?.id && temporaryId) addOptimisticTrip(queryClient, formData, user.id, temporaryId);
            return { snapshot, temporaryId };
        },
        onSuccess: async (result, variables, context) => {
            if (context?.temporaryId) replaceOptimisticTripId(queryClient, context.temporaryId, result.id);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['trips-page'] }),
                queryClient.invalidateQueries({ queryKey: ['trips-search'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-years'] }),
                queryClient.invalidateQueries({ queryKey: ['distinct-clients'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-payment-plan'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-details'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-detail'] }),
                queryClient.invalidateQueries({ queryKey: ['travel-reports'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-activity'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-financial-audit'] }),
                queryClient.invalidateQueries({ queryKey: ['trip-notifications'] }),
                queryClient.invalidateQueries({ queryKey: ['travel-analytics-summary'] }),
            ]);
            const effectiveDate = variables.formData.payment_date || variables.formData.start_date || '';
            const year = /^\d{4}/.test(effectiveDate) ? effectiveDate.slice(0, 4) : String(new Date().getFullYear());
            void logTripPaymentContractComparison(result.id, year);
            toast.success(t('notifications.tripSaved'));
        },
        onError: (error: Error, variables, context) => {
            restoreTripPages(queryClient, context?.snapshot);
            const paymentMode = variables.formData.payment_method || 'none';
            logSafeDatabaseError(`Trip save_trip_transaction failed (${paymentMode}):`, error);
            const code = getSafeErrorCode(error);
            const message = typeof error.message === 'string' ? error.message : '';
            if (code === 'CANONICAL_PAYMENT_CONTRACT_REQUIRED' || message.includes('CANONICAL_PAYMENT_CONTRACT_REQUIRED')) {
                toast.error(t('notifications.paymentContractUpgradeRequired'));
            } else if (code === 'PAYMENT_PLAN_SPLIT_MISMATCH' || message.includes('PAYMENT_PLAN_SPLIT_MISMATCH')) {
                toast.error(t('notifications.tripPaymentSplitError'));
            } else if (paymentMode === 'card' || paymentMode === 'mixed') {
                toast.error(t('notifications.tripPaymentPlanSaveError'));
            } else {
                toast.error(t('notifications.tripSaveError'));
            }
        }
    });

    const restoreTripMutation = useMutation({
        mutationFn: async (id: string) => {
            return getBackend().travel.restoreTrip(requireUserId(user), id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips-page'] });
            queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['trip-years'] });
            queryClient.invalidateQueries({ queryKey: ['travel-analytics-summary'] });
            toast.success(t('notifications.tripRestored'));
        },
        onError: (error: Error) => {
            console.error('Trip restore failed:', getSafeErrorCode(error));
            toast.error(t('notifications.tripRestoreError'));
        },
    });

    const deleteTripMutation = useMutation({
        mutationFn: async (id: string) => {
            return getBackend().travel.deleteTrip(requireUserId(user), id);
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
            queryClient.invalidateQueries({ queryKey: ['travel-analytics-summary'] });
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
            return getBackend().travel.archiveTrip(requireUserId(user), id, archived);
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
            queryClient.invalidateQueries({ queryKey: ['travel-analytics-summary'] });
            toast.success(t(variables.archived ? 'notifications.tripArchived' : 'notifications.tripRestored'));
        },
        onError: (error: Error, _variables, context: { snapshot: TripCacheSnapshot } | undefined) => {
            restoreTripPages(queryClient, context?.snapshot);
            console.error('Trip archive failed:', getSafeErrorCode(error));
            toast.error(t('notifications.tripArchiveError'));
        }
    });

    const toggleExportMutation = useMutation({
        mutationFn: async ({ id, value }: { id: string, value: boolean }) => {
            return getBackend().travel.toggleExport(requireUserId(user), id, value);
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
        toggleExport: toggleExportMutation.mutate,
        isSaving: saveTripMutation.isPending,
        isDeleting: deleteTripMutation.isPending,
        isRestoring: restoreTripMutation.isPending,
        isArchiving: archiveTripMutation.isPending,
    };
}
