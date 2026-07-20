import { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTripMutations } from '../../hooks/useTripMutations';
import { buildDuplicateTripForm, getDuplicateDatePreview, type TripDuplicateOptions } from '../../lib/tripDuplicate';
import type { Trip } from '../../types/trip';
import { supabase } from '../../lib/supabase';
import { Button } from '../travel-ui/Button';

interface Props { trip: Trip; onClose: () => void; onCreated?: () => void }

export function DuplicateTripDialog({ trip, onClose, onCreated }: Props) {
  const { t, direction } = useLanguage();
  const { saveTrip, isSaving } = useTripMutations();
  const [options, setOptions] = useState<TripDuplicateOptions>({ travelers: false, itinerary: true, hotel: true, flights: true, attachments: false, notes: true, pricing: true, payments: false, startDate: trip.start_date, endDate: trip.end_date });
  const datePreview = getDuplicateDatePreview(trip, options.startDate);
  const toggles: Array<keyof Pick<TripDuplicateOptions, 'travelers' | 'itinerary' | 'hotel' | 'flights' | 'attachments' | 'notes' | 'pricing' | 'payments'>> = ['travelers', 'itinerary', 'hotel', 'flights', 'attachments', 'notes', 'pricing', 'payments'];
  const submit = async () => {
    if (options.endDate < options.startDate) { toast.error(t('trips.validation.endDateAfterStart')); return; }
    try {
      const created = await saveTrip({ formData: buildDuplicateTripForm(trip, options) });
      await supabase.rpc('log_trip_activity', { p_trip_id: created.id, p_activity_type: 'trip_duplicated', p_metadata: { source_trip_id: trip.id } });
      onCreated?.(); onClose();
    }
    catch { /* mutation owns localized error feedback */ }
  };
  const changeStartDate = (startDate: string) => {
    const preview = getDuplicateDatePreview(trip, startDate);
    setOptions((current) => ({ ...current, startDate, endDate: preview.endDate }));
  };
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
    <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
      <div className="flex items-center justify-between"><h3 id="duplicate-title" className="text-lg font-bold">{t('trips.duplicate.title')}</h3><Button size="icon" variant="ghost" onClick={onClose} aria-label={t('trips.close')}><X/></Button></div>
      <p className="mt-1 text-sm text-slate-500">{t('trips.duplicate.description')}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">{toggles.map((key) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={options[key]} onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))}/>{t(`trips.duplicate.options.${key}`)}</label>)}</div>
      <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm">{t('trips.startDate')}<input type="date" value={options.startDate} onChange={(event) => changeStartDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-transparent px-3"/></label><label className="text-sm">{t('trips.endDate')}<input type="date" value={options.endDate} onChange={(event) => setOptions((current) => ({ ...current, endDate: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-transparent px-3"/></label></div>
      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
        {t('trips.duplicate.datePreview', { days: datePreview.durationDays, shift: datePreview.shiftDays })}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t('trips.duplicate.privacy')}</p>
      <div className="mt-5 flex justify-end gap-2"><Button onClick={onClose}>{t('trips.cancel')}</Button><Button variant="primary" disabled={isSaving} onClick={() => void submit()}><Copy className="h-4 w-4"/>{t('trips.duplicate.create')}</Button></div>
    </div>
  </div>;
}
