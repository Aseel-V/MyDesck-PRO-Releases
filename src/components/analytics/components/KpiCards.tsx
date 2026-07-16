
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
    colorClass: string;
    borderClass: string;
    glowClass: string;
    cardTint: string;
    comparison: ReturnType<typeof getComparison>;
    isCurrency: boolean;
  }

  const cards: CardDef[] = [
    {
      title: t('analytics.totalRevenue'),
      description: t('analytics.revenueDesc'),
      value: formatCurrency(currentStats.totalRevenue),
      icon: DollarSign,
      colorClass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400',
      borderClass: 'border-emerald-100/70 hover:border-emerald-300 dark:border-emerald-950/60 dark:hover:border-emerald-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(16,185,129,0.02)] hover:shadow-[0_0_15px_rgba(16,185,129,0.08)]',
      cardTint: 'bg-gradient-to-br from-emerald-50/10 to-transparent dark:from-emerald-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.totalRevenue, prevStats?.totalRevenue ?? 0, 'positive'),
      isCurrency: true,
    },
    {
      title: t('analytics.totalProfit'),
      description: t('analytics.profitDesc'),
      value: formatCurrency(currentStats.totalProfit),
      icon: TrendingUp,
      colorClass: 'text-teal-650 bg-teal-50 dark:bg-teal-950/20 dark:text-teal-400',
      borderClass: 'border-teal-100/70 hover:border-teal-300 dark:border-teal-950/60 dark:hover:border-teal-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(20,184,166,0.02)] hover:shadow-[0_0_15px_rgba(20,184,166,0.08)]',
      cardTint: 'bg-gradient-to-br from-teal-50/10 to-transparent dark:from-teal-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.totalProfit, prevStats?.totalProfit ?? 0, 'positive'),
      isCurrency: true,
    },
    {
      title: t('analytics.profitMargin'),
      description: t('analytics.profitMarginDesc'),
      value: `${currentStats.profitMarginPct.toFixed(1)}%`,
      icon: TrendingUp,
      colorClass: 'text-lime-600 bg-lime-50 dark:bg-lime-950/20 dark:text-lime-400',
      borderClass: 'border-lime-100/70 hover:border-lime-300 dark:border-lime-950/60 dark:hover:border-lime-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(132,204,22,0.02)] hover:shadow-[0_0_15px_rgba(132,204,22,0.08)]',
      cardTint: 'bg-gradient-to-br from-lime-50/10 to-transparent dark:from-lime-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.profitMarginPct, prevStats?.profitMarginPct ?? 0, 'positive'),
      isCurrency: false,
    },
    {
      title: t('analytics.totalPaid'),
      description: t('analytics.totalPaidDesc'),
      value: formatCurrency(currentStats.totalCollected),
      icon: WalletCards,
      colorClass: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-400',
      borderClass: 'border-blue-100/70 hover:border-blue-300 dark:border-blue-950/60 dark:hover:border-blue-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(59,130,246,0.02)] hover:shadow-[0_0_15px_rgba(59,130,246,0.08)]',
      cardTint: 'bg-gradient-to-br from-blue-50/10 to-transparent dark:from-blue-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.totalCollected, prevStats?.totalCollected ?? 0, 'positive'),
      isCurrency: true,
    },
    {
      title: t('analytics.outstandingBalance'),
      description: t('analytics.outstandingBalanceDesc'),
      value: formatCurrency(currentStats.totalOutstanding),
      icon: WalletCards,
      colorClass: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 dark:text-orange-400',
      borderClass: 'border-orange-100/70 hover:border-orange-300 dark:border-orange-950/60 dark:hover:border-orange-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(249,115,22,0.02)] hover:shadow-[0_0_15px_rgba(249,115,22,0.08)]',
      cardTint: 'bg-gradient-to-br from-orange-50/10 to-transparent dark:from-orange-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.totalOutstanding, prevStats?.totalOutstanding ?? 0, 'negative'),
      isCurrency: true,
    },
    {
      title: t('analytics.totalTrips'),
      description: t('analytics.totalTripsDesc'),
      value: formatNumber(currentStats.totalTrips),
      icon: MapPin,
      colorClass: 'text-violet-600 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-400',
      borderClass: 'border-violet-100/70 hover:border-violet-300 dark:border-violet-950/60 dark:hover:border-violet-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(139,92,246,0.02)] hover:shadow-[0_0_15px_rgba(139,92,246,0.08)]',
      cardTint: 'bg-gradient-to-br from-violet-50/10 to-transparent dark:from-violet-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.totalTrips, prevStats?.totalTrips ?? 0, 'neutral'),
      isCurrency: false,
    },
    {
      title: t('analytics.totalTravelers'),
      description: t('analytics.averagePassengersDesc'),
      value: formatNumber(currentStats.totalPassengers),
      icon: Users,
      colorClass: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/20 dark:text-cyan-400',
      borderClass: 'border-cyan-100/70 hover:border-cyan-300 dark:border-cyan-950/60 dark:hover:border-cyan-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(6,182,212,0.02)] hover:shadow-[0_0_15px_rgba(6,182,212,0.08)]',
      cardTint: 'bg-gradient-to-br from-cyan-50/10 to-transparent dark:from-cyan-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.totalPassengers, prevStats?.totalPassengers ?? 0, 'neutral'),
      isCurrency: false,
    },
    {
      title: t('analytics.averageTripValue'),
      description: t('analytics.averageTripValueDesc'),
      value: formatCurrency(currentStats.averageTripValue),
      icon: DollarSign,
      colorClass: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 dark:text-indigo-400',
      borderClass: 'border-indigo-100/70 hover:border-indigo-300 dark:border-indigo-950/60 dark:hover:border-indigo-900/40',
      glowClass: 'shadow-[0_0_12px_rgba(99,102,241,0.02)] hover:shadow-[0_0_15px_rgba(99,102,241,0.08)]',
      cardTint: 'bg-gradient-to-br from-indigo-50/10 to-transparent dark:from-indigo-950/5 dark:to-transparent',
      comparison: getComparison(currentStats.averageTripValue, prevStats?.averageTripValue ?? 0, 'positive'),
      isCurrency: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            className={`flex h-full flex-col justify-between rounded-2xl border p-5 transition-all duration-300 bg-white dark:bg-slate-900/50 ${card.borderClass} ${card.glowClass} ${card.cardTint}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.title}
                </p>
                <h3 className="mt-2.5 overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-black tracking-tight text-slate-850 dark:text-slate-100 xl:text-3xl">
                  {card.value}
                </h3>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${card.colorClass}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-1 border-t border-slate-50/50 pt-3 dark:border-slate-800/30">
              <div className="flex items-center flex-wrap gap-1.5 min-h-[22px]">
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
  );
}
