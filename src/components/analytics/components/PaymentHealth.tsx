import { useMemo } from 'react';
import { AlertTriangle, WalletCards, CheckCircle2, Circle } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Trip } from '../../../types/trip';
import { getEffectivePaymentStatus, getPaymentStatusLabel } from '../../../lib/tripStatus';
import { PeriodStats, normalizeMoney, getTripRevenue } from '../AnalyticsEngine';

interface PaymentHealthProps {
  filteredTrips: Trip[];
  currentStats: PeriodStats;
  currency: string;
  formatCurrency: (value: number) => string;
  rates: Record<string, number> | null;
  convert: (amt: number, from: string, to: string) => number;
  onOpenTripsWithFilter?: (options: { pendingOnly?: boolean }) => void;
}

export default function PaymentHealth({
  filteredTrips,
  currentStats,
  currency,
  formatCurrency,
  rates,
  convert,
  onOpenTripsWithFilter,
}: PaymentHealthProps) {
  const { t } = useLanguage();

  // Group trips by payment status
  const paymentBreakdown = useMemo(() => {
    const counts = { paid: 0, partial: 0, unpaid: 0 };
    const amounts = { paid: 0, partial: 0, unpaid: 0 };

    filteredTrips.forEach((trip) => {
      const status = getEffectivePaymentStatus(trip);
      const rev = normalizeMoney(getTripRevenue(trip), trip.currency, currency, rates, convert);
      counts[status]++;
      amounts[status] += rev;
    });

    return { counts, amounts };
  }, [filteredTrips, currency, rates, convert]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="mb-4 flex items-center justify-between border-b border-slate-50 pb-3 dark:border-slate-800/30">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500 dark:bg-emerald-950/50">
            <WalletCards className="h-4 w-4" />
          </div>
          <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100">
            {t('analytics.paymentHealth')}
          </h3>
        </div>
        <AlertTriangle
          className={`h-5 w-5 ${currentStats.totalOutstanding > 0 ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`}
        />
      </div>

      <div className="flex-1 space-y-4">
        {/* Collection rate progress bar */}
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {t('analytics.collectionRate')}
            </span>
            <span className="font-black text-slate-800 dark:text-slate-200">
              {currentStats.collectionRate.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full border border-slate-100 bg-slate-50 dark:border-slate-800/30 dark:bg-slate-950">
            <div
              className={`h-full transition-all duration-500 ${
                currentStats.collectionRate >= 90
                  ? 'bg-emerald-500'
                  : currentStats.collectionRate >= 70
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${currentStats.collectionRate}%` }}
            />
          </div>
        </div>

        {/* Collected vs Outstanding summary */}
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50/50 p-3.5 dark:bg-slate-950/30">
          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {t('analytics.collected')}
            </span>
            <p className="mt-1 text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(currentStats.totalCollected)}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {t('analytics.pending')}
            </span>
            {onOpenTripsWithFilter ? (
              <button
                type="button"
                onClick={() => onOpenTripsWithFilter({ pendingOnly: true })}
                className="mt-1 block text-start text-base font-extrabold text-rose-600 underline underline-offset-4 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              >
                {formatCurrency(currentStats.totalOutstanding)}
              </button>
            ) : (
              <p className="mt-1 text-base font-extrabold text-rose-600 dark:text-rose-400">
                {formatCurrency(currentStats.totalOutstanding)}
              </p>
            )}
          </div>
        </div>

        {/* Category breakdowns */}
        <div className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {/* Paid */}
          <div className="flex items-center justify-between rounded-lg border border-slate-50/50 px-3 py-2 dark:border-slate-800/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>{getPaymentStatusLabel('paid', t)}</span>
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                {paymentBreakdown.counts.paid}
              </span>
            </div>
            <span className="font-extrabold text-slate-850 dark:text-slate-200">
              {formatCurrency(paymentBreakdown.amounts.paid)}
            </span>
          </div>

          {/* Partial */}
          <div className="flex items-center justify-between rounded-lg border border-slate-50/50 px-3 py-2 dark:border-slate-800/20">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 fill-amber-500/20 text-amber-500" />
              <span>{getPaymentStatusLabel('partial', t)}</span>
              <span className="rounded-full bg-amber-50 px-1.5 py-0.2 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                {paymentBreakdown.counts.partial}
              </span>
            </div>
            <span className="font-extrabold text-slate-850 dark:text-slate-200">
              {formatCurrency(paymentBreakdown.amounts.partial)}
            </span>
          </div>

          {/* Unpaid */}
          <div className="flex items-center justify-between rounded-lg border border-slate-50/50 px-3 py-2 dark:border-slate-800/20">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 fill-rose-500/20 text-rose-500" />
              <span>{getPaymentStatusLabel('unpaid', t)}</span>
              <span className="rounded-full bg-rose-50 px-1.5 py-0.2 text-[10px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                {paymentBreakdown.counts.unpaid}
              </span>
            </div>
            <span className="font-extrabold text-slate-850 dark:text-slate-200">
              {formatCurrency(paymentBreakdown.amounts.unpaid)}
            </span>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          {t('analytics.paymentHealthDesc')}
        </p>
      </div>
    </div>
  );
}
