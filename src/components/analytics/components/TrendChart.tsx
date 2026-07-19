import React, { useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Calendar } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { MeasuredChart } from '../../travel-ui/MeasuredChart';
import { Trip } from '../../../types/trip';
import {
  getTripDateObj,
  normalizeMoney,
  getTripRevenue,
  getTripCollected,
  getTripProfit,
} from '../AnalyticsEngine';

interface TrendChartProps {
  filteredTrips: Trip[];
  year: string;
  month: string;
  currency: string;
  formatCurrency: (value: number) => string;
  rates: Record<string, number> | null;
  convert: (amt: number, from: string, to: string) => number;
}

export default function TrendChart({
  filteredTrips,
  year,
  month,
  currency,
  formatCurrency,
  rates,
  convert,
}: TrendChartProps) {
  const { t, direction } = useLanguage();
  const isRtl = direction === 'rtl';

  // Toggle view state:
  // For year (no month filter): 'monthly' | 'quarterly'
  // For month: 'daily' | 'monthly'
  const [viewType, setViewType] = useState<'daily' | 'monthly' | 'quarterly'>('monthly');

  // Reset or adjust viewType if the month filter changes
  React.useEffect(() => {
    if (month) {
      setViewType('daily');
    } else {
      setViewType('monthly');
    }
  }, [month]);

  const monthLabel = React.useCallback((monthIndex: number) => {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    return t(`analytics.months.${months[monthIndex]}`);
  }, [t]);

  const chartData = useMemo(() => {
    // 1. Daily View (only if month filter is active)
    if (month && viewType === 'daily') {
      const yearNum = Number(year);
      const monthIndex = Number(month) - 1;
      const daysInMonth = new Date(yearNum, monthIndex + 1, 0).getDate();

      return Array.from({ length: daysInMonth }).map((_, index) => {
        const day = index + 1;
        const dayTrips = filteredTrips.filter((trip) => {
          const date = getTripDateObj(trip);
          return date && date.getDate() === day;
        });

        const revenue = dayTrips.reduce(
          (sum, trip) => sum + normalizeMoney(getTripRevenue(trip), trip.currency, currency, rates, convert),
          0
        );
        const collected = dayTrips.reduce(
          (sum, trip) => sum + normalizeMoney(getTripCollected(trip), trip.currency, currency, rates, convert),
          0
        );
        const profit = dayTrips.reduce((sum, trip) => {
          const p = getTripProfit(trip);
          return sum + (p !== null ? normalizeMoney(p, trip.currency, currency, rates, convert) : 0);
        }, 0);

        return {
          name: String(day),
          revenue,
          collected,
          profit,
        };
      });
    }

    // 2. Quarterly View (only if no month filter and 'quarterly' is selected)
    if (!month && viewType === 'quarterly') {
      return Array.from({ length: 4 }).map((_, qIdx) => {
        const quarterMonths = [qIdx * 3, qIdx * 3 + 1, qIdx * 3 + 2];
        const quarterTrips = filteredTrips.filter((trip) => {
          const date = getTripDateObj(trip);
          return date && quarterMonths.includes(date.getMonth());
        });

        const revenue = quarterTrips.reduce(
          (sum, trip) => sum + normalizeMoney(getTripRevenue(trip), trip.currency, currency, rates, convert),
          0
        );
        const collected = quarterTrips.reduce(
          (sum, trip) => sum + normalizeMoney(getTripCollected(trip), trip.currency, currency, rates, convert),
          0
        );
        const profit = quarterTrips.reduce((sum, trip) => {
          const p = getTripProfit(trip);
          return sum + (p !== null ? normalizeMoney(p, trip.currency, currency, rates, convert) : 0);
        }, 0);

        return {
          name: `Q${qIdx + 1}`,
          revenue,
          collected,
          profit,
        };
      });
    }

    // 3. Monthly View (default for full year, or optional for month filter)
    return Array.from({ length: 12 }).map((_, mIdx) => {
      const monthTrips = filteredTrips.filter((trip) => {
        const date = getTripDateObj(trip);
        return date && date.getMonth() === mIdx;
      });

      const revenue = monthTrips.reduce(
        (sum, trip) => sum + normalizeMoney(getTripRevenue(trip), trip.currency, currency, rates, convert),
        0
      );
      const collected = monthTrips.reduce(
        (sum, trip) => sum + normalizeMoney(getTripCollected(trip), trip.currency, currency, rates, convert),
        0
      );
      const profit = monthTrips.reduce((sum, trip) => {
        const p = getTripProfit(trip);
        return sum + (p !== null ? normalizeMoney(p, trip.currency, currency, rates, convert) : 0);
      }, 0);

      return {
        name: monthLabel(mIdx),
        revenue,
        collected,
        profit,
      };
    });
  }, [filteredTrips, viewType, year, month, currency, rates, convert, monthLabel]);

  interface TooltipEntry {
    value: number;
    name: string;
    color?: string;
    dataKey?: string;
  }

  interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div dir={direction} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-lg dark:border-slate-700 dark:bg-slate-950">
        <p className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-200">{label}</p>
        {payload.map((entry: TooltipEntry, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs py-0.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500 dark:text-slate-400">{entry.name}:</span>
            <span
              dir="ltr"
              className={`font-bold tabular-nums ${
                entry.dataKey === 'profit'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : entry.dataKey === 'collected'
                    ? 'text-cyan-700 dark:text-cyan-300'
                    : 'text-slate-950 dark:text-white'
              }`}
            >
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-50 pb-3 dark:border-slate-800/30">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500 dark:bg-sky-950/50">
            <Calendar className="h-4 w-4" />
          </div>
          <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100">
            {t('analytics.revenueProfitTrend')}
          </h3>
        </div>

        {/* View toggles */}
        <div className="flex rounded-lg bg-slate-50 p-1 dark:bg-slate-950/50 text-[11px] font-bold">
          {month ? (
            <>
              <button
                type="button"
                onClick={() => setViewType('daily')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  viewType === 'daily'
                    ? 'bg-white text-slate-850 shadow dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-450 hover:text-slate-850 dark:hover:text-slate-200'
                }`}
              >
                {t('analytics.daily')}
              </button>
              <button
                type="button"
                onClick={() => setViewType('monthly')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  viewType === 'monthly'
                    ? 'bg-white text-slate-850 shadow dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-450 hover:text-slate-850 dark:hover:text-slate-200'
                }`}
              >
                {t('analytics.monthly')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setViewType('monthly')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  viewType === 'monthly'
                    ? 'bg-white text-slate-850 shadow dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-450 hover:text-slate-850 dark:hover:text-slate-200'
                }`}
              >
                {t('analytics.monthly')}
              </button>
              <button
                type="button"
                onClick={() => setViewType('quarterly')}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  viewType === 'quarterly'
                    ? 'bg-white text-slate-850 shadow dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-450 hover:text-slate-850 dark:hover:text-slate-200'
                }`}
              >
                {t('analytics.quarterly')}
              </button>
            </>
          )}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center text-center text-sm text-slate-400 dark:text-slate-500">
          <p>{t('analytics.noTripsForSelection')}</p>
        </div>
      ) : (
        <MeasuredChart className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}>
            <ComposedChart
              data={chartData}
              margin={{
                top: 10,
                right: isRtl ? 10 : 20,
                left: isRtl ? 20 : 10,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:stroke-slate-800/40" />
              <XAxis
                dataKey="name"
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 10 }}
                reversed={isRtl}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 10 }}
                orientation={isRtl ? 'right' : 'left'}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(14,165,233,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey="revenue"
                fill="#0EA5E9"
                name={t('analytics.revenue')}
                barSize={20}
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#16A34A"
                strokeWidth={2.5}
                dot={{ r: 3.5, strokeWidth: 1.5, fill: '#fff' }}
                name={t('analytics.profit')}
              />
              <Line
                type="monotone"
                dataKey="collected"
                stroke="#0891B2"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 2.5, strokeWidth: 1.5, fill: '#fff' }}
                name={t('analytics.collected')}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </MeasuredChart>
      )}
    </div>
  );
}
