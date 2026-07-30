import { CheckCircle2, Circle } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getPaymentStatusLabel } from '../../../lib/tripStatus';
import { PaymentHealthData, PeriodAggregateStats } from '../../../lib/analyticsQueries';

interface PaymentHealthProps {
  paymentHealth: PaymentHealthData;
  currentStats: PeriodAggregateStats;
  canViewFinancials?: boolean;
  currency: string;
  formatCurrency: (value: number) => string;
  onOpenTripsWithFilter?: (options: { pendingOnly?: boolean }) => void;
}

export default function PaymentHealth({
  paymentHealth,
  currentStats: rawCurrentStats,
  canViewFinancials = true,
  formatCurrency: formatCurrencyValue,
  onOpenTripsWithFilter,
}: PaymentHealthProps) {
  const { t } = useLanguage();

  const counts = paymentHealth.counts ?? { paid: 0, partial: 0, unpaid: 0 };
  const amounts = paymentHealth.amounts ?? { paid: 0, partial_remaining: 0, unpaid_remaining: 0 };
  const collectionRate = rawCurrentStats.collection_rate !== null && Number.isFinite(rawCurrentStats.collection_rate)
    ? Math.min(Math.max(rawCurrentStats.collection_rate, 0), 100)
    : null;
  const formatCurrency = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value)
    ? formatCurrencyValue(value)
    : t('analytics.noData');

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-baseline justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('analytics.paymentHealth')}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('analytics.paymentHealthDesc')}</p>
        </div>
        <span dir="ltr" className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {collectionRate === null ? t('analytics.noData') : `${collectionRate.toFixed(1)}%`}
        </span>
      </div>

      <div className="flex-1 space-y-4">
        {/* Collection rate progress bar */}
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-500 dark:text-slate-400">
              {t('analytics.collectionRate')}
            </span>
            <span dir="ltr" className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">
              {collectionRate === null ? t('analytics.noData') : `${collectionRate.toFixed(1)}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                collectionRate !== null && collectionRate >= 90
                  ? 'bg-emerald-500'
                  : collectionRate !== null && collectionRate >= 70
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${collectionRate ?? 0}%` }}
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
              {canViewFinancials ? formatCurrency(rawCurrentStats.total_collected) : '• • • •'}
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
                {canViewFinancials ? formatCurrency(rawCurrentStats.total_outstanding) : '• • • •'}
              </button>
            ) : (
              <p dir="ltr" className="mt-1 text-base font-extrabold tabular-nums text-rose-600 dark:text-rose-300">
                {canViewFinancials ? formatCurrency(rawCurrentStats.total_outstanding) : '• • • •'}
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-200 py-3 text-xs dark:border-slate-800 sm:grid-cols-3">
          {[
            ['confirmedCash', paymentHealth.confirmed_cash],
            ['confirmedVisa', paymentHealth.confirmed_visa],
            ['overdueUnconfirmedVisa', paymentHealth.overdue_unconfirmed_visa],
            ['futureScheduledVisa', paymentHealth.future_scheduled_visa],
            ['currentlyDueUnconfirmed', paymentHealth.currently_due_unconfirmed],
            ['totalUnpaid', paymentHealth.total_unpaid],
          ].map(([key, value]) => (
            <div key={String(key)}>
              <dt className="text-slate-500 dark:text-slate-400">{t(`analytics.${key}`)}</dt>
              <dd dir="ltr" className="mt-1 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {canViewFinancials ? formatCurrency(value as number | null | undefined) : '••••'}
              </dd>
            </div>
          ))}
        </dl>

        {/* Category breakdowns with correct remaining amounts */}
        <div className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {/* Paid */}
          <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>{getPaymentStatusLabel('paid', t)}</span>
              <span dir="ltr" className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] tabular-nums text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                {counts.paid}
              </span>
            </div>
            <span dir="ltr" className="font-extrabold tabular-nums text-emerald-600 dark:text-emerald-300">
              {canViewFinancials ? formatCurrency(amounts.paid) : '• • • •'}
            </span>
          </div>

          {/* Partial */}
          <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 fill-amber-500/20 text-amber-500" />
              <span>{getPaymentStatusLabel('partial', t)} ({t('analytics.remaining')})</span>
              <span dir="ltr" className="rounded-full bg-amber-50 px-1.5 py-0.2 text-[10px] tabular-nums text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                {counts.partial}
              </span>
            </div>
            <span dir="ltr" className="font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
              {canViewFinancials ? formatCurrency(amounts.partial_remaining) : '• • • •'}
            </span>
          </div>

          {/* Unpaid */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 fill-rose-500/20 text-rose-500" />
              <span>{getPaymentStatusLabel('unpaid', t)} ({t('analytics.remaining')})</span>
              <span dir="ltr" className="rounded-full bg-rose-50 px-1.5 py-0.2 text-[10px] tabular-nums text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                {counts.unpaid}
              </span>
            </div>
            <span dir="ltr" className="font-extrabold tabular-nums text-rose-600 dark:text-rose-300">
              {canViewFinancials ? formatCurrency(amounts.unpaid_remaining) : '• • • •'}
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
