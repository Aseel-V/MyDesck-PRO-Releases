import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CircleDollarSign } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { fetchTripActivityPage, fetchTripFinancialAuditPage } from '../../lib/tripAuditQueries';
import type { Trip } from '../../types/trip';
import { Button } from '../travel-ui/Button';
import { TripPagination } from './TripPagination';
import { useAuth } from '../../contexts/AuthContext';

interface Props { trip: Trip }

function displayValue(value: unknown, field: string, currency: Trip['currency'], format: (amount: number, from: string, to?: string) => string) {
  if (value == null) return '-';
  const monetary = ['sale_price', 'wholesale_cost', 'amount_paid', 'cash_paid_amount', 'card_paid_amount', 'amount_due'];
  if (monetary.includes(field) && typeof value === 'number') return format(value, currency);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function TripHistoryPanel({ trip }: Props) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { format } = useCurrency();
  const [tab, setTab] = useState<'activity' | 'financial'>('activity');
  const [page, setPage] = useState(1);
  const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US';
  const activity = useQuery({
    queryKey: ['trip-activity', trip.id, page],
    queryFn: () => fetchTripActivityPage(trip.id, page),
    enabled: tab === 'activity',
  });
  const financial = useQuery({
    queryKey: ['trip-financial-audit', trip.id, page],
    queryFn: () => fetchTripFinancialAuditPage(trip.id, page),
    enabled: tab === 'financial',
  });
  const current = tab === 'activity' ? activity : financial;
  const totalPages = Math.max(1, Math.ceil((current.data?.total_count ?? 0) / 20));

  return <section aria-labelledby="trip-history-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id="trip-history-title" className="text-base font-bold text-slate-950 dark:text-white">{t('trips.history.title')}</h3>
      <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700" role="tablist">
        <Button size="sm" variant={tab === 'activity' ? 'primary' : 'ghost'} role="tab" aria-selected={tab === 'activity'} onClick={() => { setTab('activity'); setPage(1); }}><Activity className="h-4 w-4"/>{t('trips.history.activity')}</Button>
        <Button size="sm" variant={tab === 'financial' ? 'primary' : 'ghost'} role="tab" aria-selected={tab === 'financial'} onClick={() => { setTab('financial'); setPage(1); }}><CircleDollarSign className="h-4 w-4"/>{t('trips.history.financial')}</Button>
      </div>
    </div>
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      {current.isLoading ? <p className="p-5 text-sm text-slate-500">{t('auth.loading')}</p> : current.isError ? <p className="p-5 text-sm text-rose-600">{t('trips.history.loadFailed')}</p> : !current.data?.items.length ? <p className="p-5 text-sm text-slate-500">{t('trips.history.empty')}</p> : <ol className="divide-y divide-slate-200 dark:divide-slate-800">
        {tab === 'activity' ? activity.data?.items.map((entry) => <li key={entry.id} className="p-4">
          <p className="font-semibold text-slate-900 dark:text-slate-100">{t(`trips.history.events.${entry.activity_type}`, { defaultValue: entry.activity_type })}</p>
          <time className="text-xs text-slate-500">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at))}</time>
        </li>) : financial.data?.items.map((entry) => <li key={entry.id} className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold text-slate-900 dark:text-slate-100">{t(`trips.history.fields.${entry.changed_field}`, { defaultValue: entry.changed_field })}</p><div className="text-end text-xs text-slate-500"><time className="block">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.changed_at))}</time>{entry.actor_user_id && <span>{t(entry.actor_user_id === user?.id ? 'trips.history.changedByYou' : 'trips.history.changedByUser')}</span>}</div></div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300"><span className="line-through opacity-70">{displayValue(entry.previous_value, entry.changed_field, trip.currency, format)}</span><span aria-hidden="true" className="mx-2">→</span><strong>{displayValue(entry.new_value, entry.changed_field, trip.currency, format)}</strong></p>
        </li>)}
      </ol>}
    </div>
    {totalPages > 1 && <TripPagination page={page} totalPages={totalPages} onPageChange={setPage}/>}
  </section>;
}
