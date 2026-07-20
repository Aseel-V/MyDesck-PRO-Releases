import { useMemo } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
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
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-baseline justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div><h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('analytics.paymentHealth')}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('analytics.paymentHealthDesc')}</p></div>
        <span dir="ltr" className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{currentStats.collectionRate.toFixed(1)}%</span>
      </div>

      <div className="flex-1 space-y-4">
        {/* Collection rate progress bar */}
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {t('analytics.collectionRate')}
            </span>
            <span dir="ltr" className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">
              {currentStats.collectionRate.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
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
            <p dir="ltr" className="mt-1 text-base font-extrabold tabular-nums text-sky-600 dark:text-sky-300">
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
                className="mt-1 block text-start text-base font-extrabold tabular-nums text-rose-600 underline underline-offset-4 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                dir="ltr"
              >
                {formatCurrency(currentStats.totalOutstanding)}
              </button>
            ) : (
              <p dir="ltr" className="mt-1 text-base font-extrabold tabular-nums text-rose-600 dark:text-rose-300">
                {formatCurrency(currentStats.totalOutstanding)}
              </p>
            )}
          </div>
        </div>

        {/* Category breakdowns */}
        <div className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {/* Paid */}
          <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>{getPaymentStatusLabel('paid', t)}</span>
              <span dir="ltr" className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] tabular-nums text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                {paymentBreakdown.counts.paid}
              </span>
            </div>
            <span dir="ltr" className="font-extrabold tabular-nums text-emerald-600 dark:text-emerald-300">
              {formatCurrency(paymentBreakdown.amounts.paid)}
            </span>
          </div>

          {/* Partial */}
          <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 fill-amber-500/20 text-amber-500" />
              <span>{getPaymentStatusLabel('partial', t)}</span>
              <span dir="ltr" className="rounded-full bg-amber-50 px-1.5 py-0.2 text-[10px] tabular-nums text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                {paymentBreakdown.counts.partial}
              </span>
            </div>
            <span dir="ltr" className="font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
              {formatCurrency(paymentBreakdown.amounts.partial)}
            </span>
          </div>

          {/* Unpaid */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 fill-rose-500/20 text-rose-500" />
              <span>{getPaymentStatusLabel('unpaid', t)}</span>
              <span dir="ltr" className="rounded-full bg-rose-50 px-1.5 py-0.2 text-[10px] tabular-nums text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                {paymentBreakdown.counts.unpaid}
              </span>
            </div>
            <span dir="ltr" className="font-extrabold tabular-nums text-rose-600 dark:text-rose-300">
              {formatCurrency(paymentBreakdown.amounts.unpaid)}
            </span>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          {t('analytics.paymentHealthDesc')}
        </p>
      </div>
    </section>
  );
}
