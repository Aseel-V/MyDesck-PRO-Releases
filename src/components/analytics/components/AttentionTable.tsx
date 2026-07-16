import { useMemo } from 'react';
import { AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Trip } from '../../../types/trip';
import { getPaymentStatusLabel } from '../../../lib/tripStatus';
import { getAttentionRequiredTrips } from '../AnalyticsEngine';

interface AttentionTableProps {
  filteredTrips: Trip[];
  currency: string;
  formatCurrency: (value: number) => string;
  rates: Record<string, number> | null;
  convert: (amt: number, from: string, to: string) => number;
  onSelectTrip?: (trip: Trip) => void;
}

export default function AttentionTable({
  filteredTrips,
  currency,
  formatCurrency,
  rates,
  convert,
  onSelectTrip,
}: AttentionTableProps) {
  const { t } = useLanguage();

  const attentionItems = useMemo(() => {
    return getAttentionRequiredTrips(filteredTrips, currency, rates, convert);
  }, [filteredTrips, currency, rates, convert]);

  const getReasonLabel = (reasonKey: string) => {
    return t(`analytics.attentionReasons.${reasonKey}`);
  };

  const getPaymentStatusBadgeClass = (status: Trip['payment_status']) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
      case 'partial':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
      case 'unpaid':
      default:
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-50 pb-3 dark:border-slate-800/30">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-950/50">
          <AlertCircle className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-bold text-slate-855 dark:text-slate-100">
          {t('analytics.tripsRequiringAttention')}
        </h3>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
          {attentionItems.length}
        </span>
      </div>

      {attentionItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-350">
            {t('analytics.noTripsAttention')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-start text-xs font-semibold">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 dark:border-slate-800/40 dark:bg-slate-950/20 dark:text-slate-400">
                <th className="p-3 text-start">{t('trips.clientName')}</th>
                <th className="p-3 text-start">{t('trips.destination')}</th>
                <th className="p-3 text-start">{t('trips.startDate')}</th>
                <th className="p-3 text-center">{t('trips.paymentStatus')}</th>
                <th className="p-3 text-start">{t('analytics.outstandingBalance')}</th>
                <th className="p-3 text-start">{t('analytics.reason')}</th>
                <th className="p-3 text-end">{t('analytics.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 dark:divide-slate-800/30 dark:text-slate-350">
              {attentionItems.map(({ trip, outstandingBalance, reasons }) => (
                <tr
                  key={trip.id}
                  className="transition hover:bg-slate-50/50 dark:hover:bg-slate-950/20"
                >
                  <td className="p-3 text-start font-bold text-slate-800 dark:text-slate-200">
                    {trip.client_name}
                  </td>
                  <td className="p-3 text-start font-bold text-slate-800 dark:text-slate-200">
                    {trip.destination}
                  </td>
                  <td className="p-3 text-start font-mono text-slate-550 dark:text-slate-400">
                    {trip.start_date}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getPaymentStatusBadgeClass(trip.payment_status)}`}>
                      {getPaymentStatusLabel(trip.payment_status, t)}
                    </span>
                  </td>
                  <td className="p-3 text-start font-bold text-rose-500">
                    {outstandingBalance > 0 ? formatCurrency(outstandingBalance) : '-'}
                  </td>
                  <td className="p-3 text-start">
                    <div className="flex flex-wrap gap-1.5 max-w-[320px]">
                      {reasons.map((r, index) => (
                        <span
                          key={index}
                          className="inline-flex rounded bg-rose-50/50 px-1.5 py-0.5 text-[10px] text-rose-600 dark:bg-rose-950/20 dark:text-rose-450"
                        >
                          {getReasonLabel(r)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-end">
                    {onSelectTrip && (
                      <button
                        type="button"
                        onClick={() => onSelectTrip(trip)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:text-slate-350 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                      >
                        <span>{t('analytics.openDetails')}</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
