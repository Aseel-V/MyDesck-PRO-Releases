import React, { useMemo } from 'react';
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
import { TrendBucket } from '../../../lib/analyticsQueries';

interface TrendChartProps {
  trendData: TrendBucket[];
  year: string;
  month: string;
  currency: string;
  canViewFinancials?: boolean;
  formatCurrency: (value: number) => string;
  onOpenTripsWithFilter?: (options: { month?: string }) => void;
}

export default function TrendChart({
  trendData,
  month,
  canViewFinancials = true,
  formatCurrency,
  onOpenTripsWithFilter,
}: TrendChartProps) {
  const { t, direction } = useLanguage();
  const isRtl = direction === 'rtl';

  const monthLabel = React.useCallback((monthIndex: number) => {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    return t(`analytics.months.${months[monthIndex]}`);
  }, [t]);

  const chartData = useMemo(() => {
    if (!trendData || trendData.length === 0) return [];
    return trendData.map((item) => {
      const idx = item.month_index !== undefined ? item.month_index : (Number(item.name) - 1);
      const nameLabel = !month && Number.isFinite(idx) && idx >= 0 && idx < 12 ? monthLabel(idx) : item.name;
      return {
        ...item,
        displayName: nameLabel,
      };
    });
  }, [trendData, month, monthLabel]);

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
              {entry.dataKey === 'trips' ? entry.value : formatCurrency(entry.value)}
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

        <div className="flex rounded-lg bg-slate-50 p-1 dark:bg-slate-950/50 text-[11px] font-bold">
          <button
            type="button"
            className="rounded-md bg-white px-3 py-1.5 text-slate-850 shadow dark:bg-slate-900 dark:text-slate-100"
          >
            {month ? t('analytics.daily') : t('analytics.monthly')}
          </button>
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
              onClick={(e) => {
                const event = e as unknown as { activePayload?: Array<{ payload: TrendBucket }> };
                if (event.activePayload?.[0]) {
                  const payload = event.activePayload[0].payload;
                  if (!month && payload.month_index !== undefined) {
                    const monthStr = String(payload.month_index + 1).padStart(2, '0');
                    onOpenTripsWithFilter?.({ month: monthStr });
                  }
                }
              }}
              margin={{
                top: 10,
                right: isRtl ? 10 : 20,
                left: isRtl ? 20 : 10,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" className="dark:stroke-slate-800/40" />
              <XAxis
                dataKey="displayName"
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
              {canViewFinancials ? (
                <>
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
                </>
              ) : (
                <Bar
                  dataKey="trips"
                  fill="#0EA5E9"
                  name={t('dashboard.trips')}
                  barSize={20}
                  radius={[4, 4, 0, 0]}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </MeasuredChart>
      )}
    </div>
  );
}
