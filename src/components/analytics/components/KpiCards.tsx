
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
} from 'lucide-react';
import { PeriodStats } from '../AnalyticsEngine';
import { useLanguage } from '../../../contexts/LanguageContext';

interface KpiCardsProps {
  currentStats: PeriodStats;
  prevStats: PeriodStats | null;
  currency: string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
}

export default function KpiCards({
  currentStats,
  prevStats,
  formatCurrency,
  formatNumber,
}: KpiCardsProps) {
  const { t } = useLanguage();

  // Helper to compute stats comparison
  const getComparison = (
    currentVal: number,
    prevVal: number,
    trendType: 'positive' | 'negative' | 'neutral'
  ) => {
    if (prevStats === null || prevVal === 0) {
      return { status: 'none', label: t('analytics.noComparisonData'), percent: 0, diff: 0 };
    }

    const diff = currentVal - prevVal;
    const percent = (diff / prevVal) * 100;

    let status: 'green' | 'red' | 'neutral' = 'neutral';
    if (trendType === 'positive') {
      status = percent > 0 ? 'green' : percent < 0 ? 'red' : 'neutral';
    } else if (trendType === 'negative') {
      // For outstanding balance, increase is red (bad), decrease is green (good)
      status = percent > 0 ? 'red' : percent < 0 ? 'green' : 'neutral';
    } else {
      // Neutral KPIs (e.g. travelers, trip count)
      status = 'neutral';
    }

    return {
      status,
      percent,
      diff,
    };
  };

  // Card definition
  interface CardDef {
    title: string;
    description: string;
    value: string;
    icon: LucideIcon;
    iconClass: string;
    valueClass: string;
    comparison: ReturnType<typeof getComparison>;
    isCurrency: boolean;
  }

  const cards: CardDef[] = [
    {
      title: t('analytics.totalRevenue'),
      description: t('analytics.revenueDesc'),
      value: formatCurrency(currentStats.totalRevenue),
      icon: DollarSign,
      iconClass: 'text-slate-600 dark:text-slate-300',
      valueClass: 'text-slate-950 dark:text-white',
      comparison: getComparison(currentStats.totalRevenue, prevStats?.totalRevenue ?? 0, 'positive'),
      isCurrency: true,
    },
    {
      title: t('analytics.totalProfit'),
      description: t('analytics.profitDesc'),
      value: formatCurrency(currentStats.totalProfit),
      icon: TrendingUp,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-300',
      comparison: getComparison(currentStats.totalProfit, prevStats?.totalProfit ?? 0, 'positive'),
      isCurrency: true,
    },
    {
      title: t('analytics.profitMargin'),
      description: t('analytics.profitMarginDesc'),
      value: `${currentStats.profitMarginPct.toFixed(1)}%`,
      icon: TrendingUp,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-300',
      comparison: getComparison(currentStats.profitMarginPct, prevStats?.profitMarginPct ?? 0, 'positive'),
      isCurrency: false,
    },
    {
      title: t('analytics.totalPaid'),
      description: t('analytics.totalPaidDesc'),
      value: formatCurrency(currentStats.totalCollected),
      icon: WalletCards,
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-sky-600 dark:text-sky-300',
      comparison: getComparison(currentStats.totalCollected, prevStats?.totalCollected ?? 0, 'positive'),
      isCurrency: true,
    },
    {
      title: t('analytics.outstandingBalance'),
      description: t('analytics.outstandingBalanceDesc'),
      value: formatCurrency(currentStats.totalOutstanding),
      icon: WalletCards,
      iconClass: 'text-rose-600 dark:text-rose-400',
      valueClass: 'text-rose-600 dark:text-rose-300',
      comparison: getComparison(currentStats.totalOutstanding, prevStats?.totalOutstanding ?? 0, 'negative'),
      isCurrency: true,
    },
    {
      title: t('analytics.totalTrips'),
      description: t('analytics.totalTripsDesc'),
      value: formatNumber(currentStats.totalTrips),
      icon: MapPin,
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-slate-900 dark:text-slate-100',
      comparison: getComparison(currentStats.totalTrips, prevStats?.totalTrips ?? 0, 'neutral'),
      isCurrency: false,
    },
    {
      title: t('analytics.totalTravelers'),
      description: t('analytics.averagePassengersDesc'),
      value: formatNumber(currentStats.totalPassengers),
      icon: Users,
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-slate-900 dark:text-slate-100',
      comparison: getComparison(currentStats.totalPassengers, prevStats?.totalPassengers ?? 0, 'neutral'),
      isCurrency: false,
    },
    {
      title: t('analytics.averageProfit'),
      description: t('analytics.averageProfitDesc'),
      value: formatCurrency(currentStats.averageProfit),
      icon: TrendingUp,
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-300',
      comparison: getComparison(currentStats.averageProfit, prevStats?.averageProfit ?? 0, 'positive'),
      isCurrency: true,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 dark:divide-slate-800">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const comp = card.comparison;

        // Render trend indicator
        const renderTrend = () => {
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

          // Neutral
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
            key={idx}
            className="flex min-h-[132px] flex-col justify-between p-5 bg-white dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.title}
                </p>
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
