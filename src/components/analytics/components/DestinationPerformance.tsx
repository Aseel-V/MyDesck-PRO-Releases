import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Map,
  TrendingUp,
  Users,
  AlertTriangle,
  Award,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getDestinationHighlights, calculateDestinationStats } from '../AnalyticsEngine';
import { Trip } from '../../../types/trip';

interface DestinationPerformanceProps {
  filteredTrips: Trip[];
  currency: string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  rates: Record<string, number> | null;
  convert: (amt: number, from: string, to: string) => number;
}

export default function DestinationPerformance({
  filteredTrips,
  currency,
  formatCurrency,
  formatNumber,
  rates,
  convert,
}: DestinationPerformanceProps) {
  const { t, direction } = useLanguage();
  const isRtl = direction === 'rtl';

  // Calculate destination statistics
  const destinationStats = useMemo(() => {
    return calculateDestinationStats(filteredTrips, currency, rates, convert);
  }, [filteredTrips, currency, rates, convert]);

  const highlights = useMemo(() => {
    return getDestinationHighlights(destinationStats);
  }, [destinationStats]);

  const chartData = useMemo(() => {
    // Return top 6 destinations for the chart to keep it clean and legible
    return destinationStats.slice(0, 6);
  }, [destinationStats]);

  interface TooltipEntry {
    value: number;
    name: string;
    color?: string;
  }

  interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-slate-100 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
        <p className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-200">{label}</p>
        {payload.map((entry: TooltipEntry, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs py-0.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500 dark:text-slate-400">{entry.name}:</span>
            <span className="font-semibold text-slate-850 dark:text-slate-150">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="mb-5 flex items-center gap-2 border-b border-slate-50 pb-3 dark:border-slate-800/30">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500 dark:bg-sky-950/50">
          <Map className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100">
          {t('analytics.destinationPerformance')}
        </h3>
      </div>

      {destinationStats.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center text-center text-sm text-slate-400 dark:text-slate-500">
          <p>{t('analytics.noDestinations')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Highlights row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Best Revenue */}
            <div className="rounded-xl border border-slate-50 bg-slate-50/20 p-3.5 dark:border-slate-800/30 dark:bg-slate-950/20">
              <div className="flex items-center gap-2 text-emerald-500">
                <Award className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                  {t('analytics.bestRevenueDest')}
                </span>
              </div>
              <p className="mt-1.5 truncate text-sm font-bold text-slate-800 dark:text-slate-200">
                {highlights.bestRevenueDest || '-'}
              </p>
              <p className="text-xs font-semibold text-slate-450">
                {highlights.bestRevenueDest ? formatCurrency(highlights.bestRevenueValue) : ''}
              </p>
            </div>

            {/* Best Profit */}
            <div className="rounded-xl border border-slate-50 bg-slate-50/20 p-3.5 dark:border-slate-800/30 dark:bg-slate-950/20">
              <div className="flex items-center gap-2 text-emerald-500">
                <TrendingUp className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                  {t('analytics.bestProfitDest')}
                </span>
              </div>
              <p className="mt-1.5 truncate text-sm font-bold text-slate-800 dark:text-slate-200">
                {highlights.bestProfitDest || '-'}
              </p>
              <p className="text-xs font-semibold text-slate-450">
                {highlights.bestProfitDest ? formatCurrency(highlights.bestProfitValue) : ''}
              </p>
            </div>

            {/* Highest Travelers */}
            <div className="rounded-xl border border-slate-50 bg-slate-50/20 p-3.5 dark:border-slate-800/30 dark:bg-slate-950/20">
              <div className="flex items-center gap-2 text-sky-500">
                <Users className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                  {t('analytics.highestPaxVolume')}
                </span>
              </div>
              <p className="mt-1.5 truncate text-sm font-bold text-slate-800 dark:text-slate-200">
                {highlights.highestPaxDest || '-'}
              </p>
              <p className="text-xs font-semibold text-slate-450">
                {highlights.highestPaxDest ? `${formatNumber(highlights.highestPaxValue)} ${t('analytics.travelers')}` : ''}
              </p>
            </div>

            {/* Weakest Performance */}
            <div className="rounded-xl border border-slate-50 bg-slate-50/20 p-3.5 dark:border-slate-800/30 dark:bg-slate-950/20">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                  {t('analytics.weakestDest')}
                </span>
              </div>
              <p className="mt-1.5 truncate text-sm font-bold text-slate-850 dark:text-slate-200">
                {highlights.weakestDest || '-'}
              </p>
              <p className="text-xs font-semibold text-slate-450">
                {highlights.weakestDest ? formatCurrency(highlights.weakestValue) : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Ranked Table */}
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800/40 xl:col-span-7">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-start text-xs font-semibold">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 dark:border-slate-800/40 dark:bg-slate-950/20 dark:text-slate-400">
                      <th className="p-3 text-start">{t('trips.destination')}</th>
                      <th className="p-3 text-center">{t('dashboard.trips')}</th>
                      <th className="p-3 text-start">{t('analytics.revenue')}</th>
                      <th className="p-3 text-start">{t('analytics.profit')}</th>
                      <th className="p-3 text-center">{t('analytics.profitMargin')}</th>
                      <th className="p-3 text-center">{t('analytics.travelers')}</th>
                      <th className="p-3 text-start">{t('analytics.outstandingBalance')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700 dark:divide-slate-800/30 dark:text-slate-350">
                    {destinationStats.map((stat, idx) => (
                      <tr
                        key={stat.name}
                        className="transition hover:bg-slate-50/50 dark:hover:bg-slate-950/20"
                      >
                        <td className="p-3 text-start">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-slate-850 dark:text-slate-400">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {stat.name}
                            </span>
                            {stat.unknownProfitCount > 0 && (
                              <span title={t('analytics.insights.missingCostWarning').replace('{{count}}', String(stat.unknownProfitCount))}>
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono">{formatNumber(stat.trips)}</td>
                        <td className="p-3 text-start">{formatCurrency(stat.revenue)}</td>
                        <td
                          className={`p-3 text-start font-bold ${
                            stat.profit > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : stat.profit < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {formatCurrency(stat.profit)}
                        </td>
                        <td className="p-3 text-center font-mono">{stat.profitMargin.toFixed(1)}%</td>
                        <td className="p-3 text-center font-mono">{formatNumber(stat.passengers)}</td>
                        <td
                          className={`p-3 text-start font-bold ${
                            stat.outstandingBalance > 0
                              ? 'text-rose-500'
                              : 'text-slate-450 dark:text-slate-500'
                          }`}
                        >
                          {stat.outstandingBalance > 0 ? formatCurrency(stat.outstandingBalance) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/15 p-4 dark:border-slate-800/40 dark:bg-slate-950/10 xl:col-span-5">
              <div className="h-[280px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{
                      top: 10,
                      right: isRtl ? 10 : 20,
                      left: isRtl ? 20 : 10,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:stroke-slate-800/40" />
                    <XAxis type="number" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      orientation={isRtl ? 'right' : 'left'}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(10,165,200,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar
                      dataKey="revenue"
                      fill="#10B981"
                      name={t('analytics.revenue')}
                      radius={isRtl ? [4, 0, 0, 4] : [0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="profit"
                      fill="#3B82F6"
                      name={t('analytics.profit')}
                      radius={isRtl ? [4, 0, 0, 4] : [0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
