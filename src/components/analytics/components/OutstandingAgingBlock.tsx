import { Clock } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { AgingBucketsData } from '../../../lib/analyticsQueries';

interface OutstandingAgingBlockProps {
  aging: AgingBucketsData;
  canViewFinancials: boolean;
  formatCurrency: (value: number) => string;
  onOpenTripsWithFilter?: (options: { pendingOnly?: boolean; overdueOnly?: boolean }) => void;
}

export default function OutstandingAgingBlock({
  aging,
  canViewFinancials,
  formatCurrency,
  onOpenTripsWithFilter,
}: OutstandingAgingBlockProps) {
  const { t } = useLanguage();

  const buckets = [
    {
      key: 'current',
      label: t('analytics.aging.current') || 'Current / Due Now',
      amount: aging.current ?? 0,
      color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800/40',
      badge: 'bg-emerald-500',
    },
    {
      key: 'overdue_1_30',
      label: t('analytics.aging.overdue1to30') || '1–30 Days Overdue',
      amount: aging.overdue_1_30 ?? 0,
      color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800/40',
      badge: 'bg-amber-500',
    },
    {
      key: 'overdue_31_60',
      label: t('analytics.aging.overdue31to60') || '31–60 Days Overdue',
      amount: aging.overdue_31_60 ?? 0,
      color: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
      border: 'border-orange-200 dark:border-orange-800/40',
      badge: 'bg-orange-500',
    },
    {
      key: 'overdue_61_plus',
      label: t('analytics.aging.overdue61Plus') || '61+ Days Overdue',
      amount: aging.overdue_61_plus ?? 0,
      color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-800/40',
      badge: 'bg-rose-600',
    },
    {
      key: 'future_scheduled',
      label: t('analytics.aging.futureScheduled') || 'Future Scheduled Visa',
      amount: aging.future_scheduled ?? 0,
      color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
      border: 'border-sky-200 dark:border-sky-800/40',
      badge: 'bg-sky-500',
    },
    {
      key: 'unscheduled_outstanding',
      label: t('analytics.aging.unscheduledOutstanding') || 'Unscheduled Cash Outstanding',
      amount: aging.unscheduled_outstanding ?? 0,
      color: 'bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
      border: 'border-slate-200 dark:border-slate-800/40',
      badge: 'bg-slate-400',
    },
  ];

  const totalOutstanding = buckets.reduce((acc, b) => acc + (b.amount || 0), 0);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500 dark:bg-indigo-950/50">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('analytics.aging.title') || 'Outstanding Aging Schedule'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('analytics.aging.subtitle') || 'Based on installment due date'}
            </p>
          </div>
        </div>
        {canViewFinancials && (
          <span dir="ltr" className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(totalOutstanding)}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2.5">
        {buckets.map((b) => {
          const pct = totalOutstanding > 0 ? ((b.amount || 0) / totalOutstanding) * 100 : 0;
          return (
            <div key={b.key} className={`rounded-xl border p-2.5 ${b.border} ${b.color}`}>
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${b.badge}`} />
                  <span>{b.label}</span>
                </div>
                {canViewFinancials ? (
                  <span dir="ltr" className="font-extrabold tabular-nums">
                    {formatCurrency(b.amount || 0)} ({pct.toFixed(1)}%)
                  </span>
                ) : (
                  <span>• • • •</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onOpenTripsWithFilter && (
        <button
          type="button"
          onClick={() => onOpenTripsWithFilter({ pendingOnly: true })}
          className="mt-4 text-center text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
        >
          {t('analytics.aging.viewAllPending') || 'View All Pending Trips →'}
        </button>
      )}
    </section>
  );
}
