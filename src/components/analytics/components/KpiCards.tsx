import {
  TrendingUp,
  DollarSign,
  MapPin,
  Users,
  WalletCards,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  LucideIcon,
  HelpCircle,
} from 'lucide-react';
import { analyticsDifference, analyticsPercentageChange, PeriodAggregateStats } from '../../../lib/analyticsQueries';
import { useLanguage } from '../../../contexts/LanguageContext';

interface KpiCardsProps {
  currentStats: PeriodAggregateStats;
  prevStats: PeriodAggregateStats | null;
  currency: string;
  canViewFinancials?: boolean;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  onOpenTripsWithFilter?: (options: { pendingOnly?: boolean; tripStatus?: string }) => void;
}

export default function KpiCards({
  currentStats,
  prevStats,
  canViewFinancials = true,
  formatCurrency,
  formatNumber,
  onOpenTripsWithFilter,
}: KpiCardsProps) {
  const { t } = useLanguage();

  // Helper to compute stats comparison
  const getComparison = (
    currentVal: number | null,
    prevVal: number | null,
    trendType: 'positive' | 'negative' | 'neutral'
  ) => {
    const diff = analyticsDifference(currentVal, prevVal);
    const percent = analyticsPercentageChange(currentVal, prevVal);
    if (prevStats === null || diff === null || percent === null) {
      return { status: 'none', label: t('analytics.noComparisonData'), percent: 0, diff: 0 };
    }

    let status: 'green' | 'red' | 'neutral' = 'neutral';
    if (trendType === 'positive') {
      status = percent > 0 ? 'green' : percent < 0 ? 'red' : 'neutral';
    } else if (trendType === 'negative') {
      status = percent > 0 ? 'red' : percent < 0 ? 'green' : 'neutral';
    } else {
      status = 'neutral';
    }

    return {
      status,
      percent,
      diff,
    };
  };

  interface CardDef {
    id: string;
    title: string;
    description: string;
    tooltip: string;
    value: string;
    icon: LucideIcon;
    iconClass: string;
    valueClass: string;
    comparison: ReturnType<typeof getComparison>;
    isCurrency: boolean;
    isFinancial: boolean;
    onClick?: () => void;
  }

  const allCards: CardDef[] = [
    {
      id: 'revenue',
      title: t('analytics.totalRevenue'),
      description: t('analytics.revenueDesc'),
      tooltip: t('analytics.tooltips.revenue'),
      value: canViewFinancials && currentStats.total_revenue !== null ? formatCurrency(currentStats.total_revenue) : '• • • •',
      icon: DollarSign,
      iconClass: 'text-slate-600 dark:text-slate-300',
      valueClass: 'text-slate-950 dark:text-white',
      comparison: getComparison(currentStats.total_revenue, prevStats?.total_revenue ?? null, 'positive'),
      isCurrency: true,
      isFinancial: true,
    },
    {
      id: 'profit',
      title: t('analytics.totalProfit'),
      description: t('analytics.profitDesc'),
      tooltip: t('analytics.tooltips.profit'),
      value: canViewFinancials && currentStats.total_profit !== null ? formatCurrency(currentStats.total_profit) : '• • • •',
      icon: TrendingUp,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-300',
      comparison: getComparison(currentStats.total_profit, prevStats?.total_profit ?? null, 'positive'),
      isCurrency: true,
      isFinancial: true,
    },
    {
      id: 'profit_margin',
      title: t('analytics.profitMargin'),
      description: t('analytics.profitMarginDesc'),
      tooltip: t('analytics.tooltips.margin'),
      value: canViewFinancials && currentStats.profit_margin_pct !== null ? `${currentStats.profit_margin_pct.toFixed(1)}%` : '• • • •',
      icon: TrendingUp,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-300',
      comparison: getComparison(currentStats.profit_margin_pct, prevStats?.profit_margin_pct ?? null, 'positive'),
      isCurrency: false,
      isFinancial: true,
    },
    {
      id: 'collected',
      title: t('analytics.totalPaid'),
      description: t('analytics.totalPaidDesc'),
      tooltip: t('analytics.tooltips.collected'),
      value: canViewFinancials && currentStats.total_collected !== null ? formatCurrency(currentStats.total_collected) : '• • • •',
      icon: WalletCards,
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-sky-600 dark:text-sky-300',
      comparison: getComparison(currentStats.total_collected, prevStats?.total_collected ?? null, 'positive'),
      isCurrency: true,
      isFinancial: true,
    },
    {
      id: 'outstanding',
      title: t('analytics.outstandingBalance'),
      description: t('analytics.outstandingBalanceDesc'),
      tooltip: t('analytics.tooltips.outstanding'),
      value: canViewFinancials && currentStats.total_outstanding !== null ? formatCurrency(currentStats.total_outstanding) : '• • • •',
      icon: WalletCards,
      iconClass: 'text-rose-600 dark:text-rose-400',
      valueClass: 'text-rose-600 dark:text-rose-300',
      comparison: getComparison(currentStats.total_outstanding, prevStats?.total_outstanding ?? null, 'negative'),
      isCurrency: true,
      isFinancial: true,
      onClick: () => onOpenTripsWithFilter?.({ pendingOnly: true }),
    },
    {
      id: 'trips',
      title: t('analytics.totalTrips'),
      description: t('analytics.totalTripsDesc'),
      tooltip: t('analytics.tooltips.trips'),
      value: currentStats.total_trips === null ? t('analytics.noData') : formatNumber(currentStats.total_trips),
      icon: MapPin,
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-slate-900 dark:text-slate-100',
      comparison: getComparison(currentStats.total_trips, prevStats?.total_trips ?? null, 'neutral'),
      isCurrency: false,
      isFinancial: false,
      onClick: () => onOpenTripsWithFilter?.({}),
    },
    {
      id: 'travelers',
      title: t('analytics.totalTravelers'),
      description: t('analytics.averagePassengersDesc'),
      tooltip: t('analytics.tooltips.travelers'),
      value: currentStats.total_passengers === null ? t('analytics.noData') : formatNumber(currentStats.total_passengers),
      icon: Users,
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-slate-900 dark:text-slate-100',
      comparison: getComparison(currentStats.total_passengers, prevStats?.total_passengers ?? null, 'neutral'),
      isCurrency: false,
      isFinancial: false,
    },
    {
      id: 'average_profit',
      title: t('analytics.averageProfit'),
      description: t('analytics.averageProfitDesc'),
      tooltip: t('analytics.tooltips.averageProfit'),
      value: canViewFinancials && currentStats.average_profit !== null ? formatCurrency(currentStats.average_profit) : '• • • •',
      icon: TrendingUp,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-300',
      comparison: getComparison(currentStats.average_profit, prevStats?.average_profit ?? null, 'positive'),
      isCurrency: true,
      isFinancial: true,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 dark:divide-slate-800">
        {allCards.map((card) => {
          const Icon = card.icon;
          const comp = card.comparison;

          const renderTrend = () => {
            if (!canViewFinancials && card.isFinancial) return null;
            if (comp.status === 'none') {
              return (
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {comp.label}
                </span>
              );
            }

            const percentVal = `${comp.percent >= 0 ? '+' : ''}${comp.percent.toFixed(1)}%`;
            const diffFormatted = card.isCurrency ? formatCurrency(Math.abs(comp.diff)) : formatNumber(Math.abs(comp.diff));
            const diffText = ` (${comp.diff >= 0 ? '+' : '-'}${diffFormatted})`;

            if (comp.status === 'green') {
              return (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                  {comp.percent > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {percentVal}
                  <span className="text-[10px] font-medium opacity-80">{diffText}</span>
                </span>
              );
            }

            if (comp.status === 'red') {
              return (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                  {comp.percent > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {percentVal}
                  <span className="text-[10px] font-medium opacity-80">{diffText}</span>
                </span>
              );
            }

            return (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-850 dark:text-slate-400">
                {comp.percent > 0 ? <ArrowUpRight className="h-3 w-3" /> : comp.percent < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {percentVal}
                <span className="text-[10px] font-medium opacity-80">{diffText}</span>
              </span>
            );
          };

          return (
            <div
              key={card.id}
              onClick={card.onClick}
              className={`flex min-h-[132px] flex-col justify-between p-5 bg-white dark:bg-slate-950 ${
                card.onClick ? 'cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-slate-900/50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {card.title}
                    </p>
                    <span title={card.tooltip} className="cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <h3 dir="ltr" className={`mt-2.5 overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-black tracking-tight tabular-nums xl:text-3xl ${card.valueClass}`}>
                    {card.value}
                  </h3>
                </div>
                <Icon className={`h-4 w-4 shrink-0 ${card.iconClass}`} aria-hidden="true" />
              </div>
              <div className="mt-4 flex flex-col gap-1 border-t border-slate-50/50 pt-3 dark:border-slate-800/30">
                <div dir="ltr" className="flex min-h-[22px] flex-wrap items-center gap-1.5 tabular-nums">
                  {renderTrend()}
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate" title={card.description}>
                  {card.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
