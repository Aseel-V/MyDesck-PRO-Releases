import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabase';
import {
  fetchDeletedTripsPage,
  permanentlyDeleteTrips,
  restoreDeletedTrips,
  retryAttachmentCleanup,
  type DeletedTripsPage,
} from '../../lib/tripTrashQueries';
import { getSafeErrorCode } from '../../lib/safeError';
import { Button } from '../travel-ui/Button';
import { TripPagination } from './TripPagination';

interface TripTrashProps { onClose: () => void }

export function TripTrash({ onClose }: TripTrashProps) {
  const { t, direction, language } = useLanguage();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US';

  useEffect(() => setPage(1), [search]);
  const { data = { items: [], total_count: 0 }, isLoading, error } = useQuery({
    queryKey: ['trip-trash', page, search],
    queryFn: () => fetchDeletedTripsPage(page, search),
  });
  const totalPages = Math.max(1, Math.ceil(data.total_count / 20));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const { data: cleanupJobs = [] } = useQuery({
    queryKey: ['trip-cleanup-issues'],
    queryFn: async () => {
      const result = await supabase.from('trip_attachment_cleanup_queue')
        .select('id,trip_id,status,attempts,last_error,next_retry_at,created_at')
        .eq('status', 'failed').order('created_at', { ascending: false }).limit(20);
      if (result.error) throw result.error;
      return result.data;
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trip-trash'] }),
      queryClient.invalidateQueries({ queryKey: ['trip-cleanup-issues'] }),
      queryClient.invalidateQueries({ queryKey: ['trips-page'] }),
      queryClient.invalidateQueries({ queryKey: ['trip-dashboard'] }),
    ]);
    setSelected(new Set());
  };
  const restoreMutation = useMutation({
    mutationFn: restoreDeletedTrips,
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['trip-trash'] });
      const snapshot = queryClient.getQueriesData<DeletedTripsPage>({ queryKey: ['trip-trash'] });
      const idSet = new Set(ids);
      queryClient.setQueriesData<DeletedTripsPage>({ queryKey: ['trip-trash'] }, (current) => current ? {
        ...current,
        items: current.items.filter((item) => !idSet.has(item.id)),
        total_count: Math.max(0, current.total_count - current.items.filter((item) => idSet.has(item.id)).length),
      } : current);
      return { snapshot };
    },
    onSuccess: async () => { await refresh(); toast.success(t('trips.trash.restored')); },
    onError: (value, _ids, context) => {
      context?.snapshot.forEach(([key, pageData]) => queryClient.setQueryData(key, pageData));
      console.error('Trash restore failed:', getSafeErrorCode(value)); toast.error(t('trips.trash.restoreFailed'));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: permanentlyDeleteTrips,
    onSuccess: async () => { await refresh(); setConfirmIds([]); setConfirmText(''); toast.success(t('trips.trash.permanentlyDeleted')); },
    onError: (value) => { console.error('Permanent trip deletion failed:', getSafeErrorCode(value)); toast.error(t('trips.trash.deleteFailed')); },
  });
  const retryMutation = useMutation({
    mutationFn: retryAttachmentCleanup,
    onSuccess: async () => { await refresh(); toast.success(t('trips.trash.retryScheduled')); },
    onError: (value) => { console.error('Cleanup retry failed:', getSafeErrorCode(value)); toast.error(t('trips.trash.retryFailed')); },
  });

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  return (
    <div className="fixed inset-0 z-[90] bg-slate-50 dark:bg-slate-950" dir={direction} role="dialog" aria-modal="true" aria-labelledby="trash-title">
      <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
        <div><h2 id="trash-title" className="text-lg font-bold text-slate-950 dark:text-white">{t('trips.trash.title')}</h2><p className="text-sm text-slate-500 dark:text-slate-400">{t('trips.trash.subtitle')}</p></div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('trips.close')}><X /></Button>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 overflow-y-auto p-4 pb-24 sm:p-6" style={{ maxHeight: 'calc(100dvh - 4rem)' }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block min-w-0 flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><span className="sr-only">{t('trips.trash.search')}</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('trips.trash.search')} className="h-10 w-full rounded-lg border border-slate-300 bg-white ps-10 pe-3 text-sm dark:border-slate-700 dark:bg-slate-900"/></label>
          <div className="flex gap-2"><Button variant="secondary" disabled={!selectedIds.length || restoreMutation.isPending} onClick={() => restoreMutation.mutate(selectedIds)}><RotateCcw className="h-4 w-4"/>{t('trips.trash.restoreSelected')}</Button><Button variant="danger" disabled={!selectedIds.length} onClick={() => setConfirmIds(selectedIds)}><Trash2 className="h-4 w-4"/>{t('trips.trash.deleteSelected')}</Button></div>
        </div>
        {error ? <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-800 dark:bg-rose-950/20 dark:text-rose-200">{t('trips.trash.loadFailed')}</div> : isLoading ? <div className="p-8 text-center text-slate-500">{t('auth.loading')}</div> : data.items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500 dark:border-slate-700">{t('trips.trash.empty')}</div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="divide-y divide-slate-200 dark:divide-slate-800">{data.items.map((trip) => <div key={trip.id} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"><input type="checkbox" checked={selected.has(trip.id)} onChange={() => toggle(trip.id)} aria-label={t('trips.trash.selectTrip', { destination: trip.destination })}/><div className="min-w-0"><p className="truncate font-semibold text-slate-950 dark:text-white">{trip.destination}</p><p className="truncate text-sm text-slate-500">{trip.client_name}</p><p className="mt-1 text-xs text-slate-500">{t('trips.trash.deletedAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(trip.deleted_at)) })} · {t('trips.trash.purgeAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(trip.purge_at)) })}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => restoreMutation.mutate([trip.id])}>{t('trips.trash.restore')}</Button><Button size="sm" variant="danger" onClick={() => setConfirmIds([trip.id])}>{t('trips.trash.deleteForever')}</Button></div></div>)}</div></div>}
        <TripPagination page={page} totalPages={totalPages} onPageChange={setPage}/>
        {cleanupJobs.length > 0 && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><h3 className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-100"><AlertTriangle className="h-4 w-4"/>{t('trips.trash.cleanupIssues')}</h3><div className="mt-3 space-y-2">{cleanupJobs.map((job) => <div key={job.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 p-3 text-sm dark:bg-slate-900/70"><span>{t('trips.trash.cleanupIssue', { attempts: job.attempts })}</span><Button size="sm" variant="secondary" disabled={retryMutation.isPending} onClick={() => retryMutation.mutate(job.id)}><RefreshCw className="h-4 w-4"/>{t('trips.retry')}</Button></div>)}</div></section>}
      </main>
      {confirmIds.length > 0 && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900"><h3 className="text-lg font-bold">{t('trips.trash.strongConfirmTitle')}</h3><p className="mt-2 text-sm text-slate-500">{t('trips.trash.strongConfirmBody', { count: confirmIds.length })}</p><label className="mt-4 block text-sm font-medium">{t('trips.trash.typeDelete')}<input autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-transparent px-3" dir="ltr"/></label><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => { setConfirmIds([]); setConfirmText(''); }}>{t('trips.cancel')}</Button><Button variant="danger" disabled={confirmText !== 'DELETE' || deleteMutation.isPending} onClick={() => deleteMutation.mutate(confirmIds)}>{t('trips.trash.deleteForever')}</Button></div></div></div>}
    </div>
  );
}
