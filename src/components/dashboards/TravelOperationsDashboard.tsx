import type { ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, Plus } from 'lucide-react';
import { getEffectivePaymentStatus, getEffectiveTripDate } from '../../lib/tripStatus';
import type { Trip } from '../../types/trip';
import { Button } from '../travel-ui/Button';
import { StatusBadge } from '../travel-ui/StatusBadge';
import { MeasuredChart } from '../travel-ui/MeasuredChart';

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface TravelOperationsDashboardProps {
  alerts: Trip[];
  recentTrips: Trip[];
  upcomingTrips: Trip[];
  monthlyData: Array<{ name: string; revenue: number; profit: number }>;
  financialPosition: { revenue: number; collected: number; outstanding: number; profit: number };
  direction: 'ltr' | 'rtl';
  language: string;
  currency: string;
  showBanner: boolean;
  t: Translate;
  itemVariants: Variants;
  formatCurrency: (value: number) => string;
  formatCompactNumber: (value: number) => string;
  onDismissBanner: () => void;
  onDismissAlert: (tripId: string) => void;
  onSelectTrip: (trip: Trip) => void;
  onNavigate: (page: string) => void;
  onCreateTrip: () => void;
  renderTravelers: (trip: Trip) => ReactNode;
}

export function TravelOperationsDashboard({
  alerts,
  recentTrips,
  upcomingTrips,
  monthlyData,
  financialPosition,
  direction,
  language,
  currency,
  showBanner,
  t,
  itemVariants,
  formatCurrency,
  formatCompactNumber,
  onDismissBanner,
  onDismissAlert,
  onSelectTrip,
  onNavigate,
  onCreateTrip,
  renderTravelers,
}: TravelOperationsDashboardProps) {
  const isRtl = direction === 'rtl';
  const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US';
  const formatDate = (date: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
  const chartMargin = isRtl
    ? { top: 4, right: -10, left: 16, bottom: 2 }
    : { top: 4, right: 16, left: -10, bottom: 2 };

  return (
    <div className="space-y-6" dir={direction}>
      {showBanner && (
        <motion.div variants={itemVariants} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
          <span className="font-medium">{t('dashboard.alertBannerText')}</span>
          <button onClick={onDismissBanner} aria-label={t('dashboard.dismissBanner')} className="rounded p-1 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/30">&times;</button>
        </motion.div>
      )}

      <motion.section variants={itemVariants} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('notifications.paymentReminder')}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.alertBannerText')}</p>
          </div>
          <StatusBadge tone={alerts.length ? 'warning' : 'success'}>{alerts.length}</StatusBadge>
        </div>
        {alerts.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">{t('analytics.noTripsAttention')}</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {alerts.map((trip) => {
              const tripDate = new Date(getEffectiveTripDate(trip));
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              tripDate.setHours(0, 0, 0, 0);
              const daysUntil = Math.ceil((tripDate.getTime() - today.getTime()) / 86400000);
              const status = getEffectivePaymentStatus(trip);
              return (
                <div key={trip.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
                    <div className="min-w-0">
                      <button onClick={() => onSelectTrip(trip)} className="block truncate text-start text-sm font-semibold text-slate-900 hover:text-sky-700 dark:text-slate-100 dark:hover:text-sky-300">{trip.destination}</button>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{trip.client_name} <span aria-hidden="true">·</span> <span dir="ltr">{formatDate(getEffectiveTripDate(trip))}</span></p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span dir="ltr" className="font-mono text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(Number(trip.amount_due) || Math.max(0, Number(trip.sale_price || 0) - Number(trip.amount_paid || 0)))}</span>
                    <StatusBadge tone={status === 'paid' ? 'success' : status === 'partial' ? 'warning' : 'danger'}>{daysUntil === 0 ? t('notifications.today') : t('notifications.inDays', { count: daysUntil })}</StatusBadge>
                    <Button variant="ghost" size="sm" onClick={() => onSelectTrip(trip)}>{t('notifications.viewTrip')}</Button>
                    <button onClick={() => onDismissAlert(trip.id)} aria-label={t('dashboard.dismissAlert')} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">&times;</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-2">
        <motion.section variants={itemVariants} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('dashboard.upcomingTrips')}</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.departuresPending')}</p></div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('trips')}>{t('dashboard.viewAll')}</Button>
          </div>
          {upcomingTrips.length === 0 ? <p className="py-8 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noTripsYet')}</p> : <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {upcomingTrips.map((trip) => {
              const status = getEffectivePaymentStatus(trip);
              return <button key={trip.id} onClick={() => onSelectTrip(trip)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span dir="ltr" className="w-20 font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatDate(getEffectiveTripDate(trip))}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{trip.destination}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{trip.client_name}</span></span>
                <StatusBadge tone={status === 'paid' ? 'success' : status === 'partial' ? 'warning' : 'danger'}>{status === 'paid' ? t('trips.paymentStatuses.paid') : status === 'partial' ? t('trips.paymentStatuses.partial') : t('trips.paymentStatuses.unpaid')}</StatusBadge>
              </button>;
            })}
          </div>}
        </motion.section>

        <motion.section variants={itemVariants} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5"><h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('trips.financials')}</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{currency}</p></div>
          <div className="border-b border-slate-200 pb-5 dark:border-slate-800"><p className="text-sm text-slate-500 dark:text-slate-400">{t('analytics.totalRevenue')}</p><p dir="ltr" className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">{formatCurrency(financialPosition.revenue)}</p></div>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3"><div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('analytics.totalPaid')}</dt><dd dir="ltr" className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(financialPosition.collected)}</dd></div><div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('analytics.totalOutstanding')}</dt><dd dir="ltr" className="mt-1 font-mono text-base font-semibold tabular-nums text-amber-700 dark:text-amber-300">{formatCurrency(financialPosition.outstanding)}</dd></div><div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('analytics.totalProfit')}</dt><dd dir="ltr" className="mt-1 font-mono text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatCurrency(financialPosition.profit)}</dd></div></dl>
        </motion.section>
      </div>

      <motion.section variants={itemVariants} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('analytics.revenueProfitTrend')}</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('analytics.subtitle')}</p></div><div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />{t('analytics.revenue')}</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-500" />{t('analytics.profit')}</span></div></div>
        <MeasuredChart className="h-56"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 1, height: 1 }}><AreaChart data={monthlyData} margin={chartMargin}><defs><linearGradient id="travelRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.14}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient><linearGradient id="travelProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.14}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} className="dark:opacity-30"/><XAxis dataKey="name" reversed={isRtl} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }}/><YAxis orientation={isRtl ? 'right' : 'left'} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(value) => formatCompactNumber(Number(value))}/><Tooltip wrapperStyle={{ direction }} contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }} formatter={(value) => formatCurrency(Number(value))}/><Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#travelRevenue)" name={t('analytics.revenue')}/><Area type="monotone" dataKey="profit" stroke="#0ea5e9" strokeWidth={2} fill="url(#travelProfit)" name={t('analytics.profit')}/></AreaChart></ResponsiveContainer></MeasuredChart>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <motion.section variants={itemVariants} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('dashboard.recentTrips')}</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.realtimeStatus')}</p></div><Button variant="ghost" size="sm" onClick={() => onNavigate('trips')}>{t('dashboard.viewAll')}</Button></div>
          {recentTrips.length === 0 ? <p className="py-8 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.noTripsYet')}</p> : <div className="divide-y divide-slate-200 dark:divide-slate-800">{recentTrips.map((trip) => { const status = getEffectivePaymentStatus(trip); return <button key={trip.id} onClick={() => onSelectTrip(trip)} className="flex w-full items-center justify-between gap-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{trip.destination}</span><span className="block truncate text-xs text-slate-500 dark:text-slate-400">{trip.client_name} <span aria-hidden="true">·</span> <span dir="ltr">{formatDate(trip.start_date)}</span></span></span><span className="flex shrink-0 items-center gap-3"><span className="hidden sm:block">{renderTravelers(trip)}</span><StatusBadge tone={status === 'paid' ? 'success' : status === 'partial' ? 'warning' : 'danger'}>{status === 'paid' ? t('trips.paymentStatuses.paid') : status === 'partial' ? t('trips.paymentStatuses.partial') : t('trips.paymentStatuses.unpaid')}</StatusBadge></span></button>; })}</div>}
        </motion.section>
        <motion.aside variants={itemVariants} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('dashboard.quickActions')}</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.quickActionsSubtitle')}</p><div className="mt-4 space-y-2"><Button variant="primary" className="w-full justify-between" onClick={onCreateTrip}>{t('dashboard.newTrip')}<Plus size={16}/></Button><Button variant="secondary" className="w-full justify-between" onClick={() => onNavigate('trips')}>{t('dashboard.openTrips')}<ArrowRight size={16} className={isRtl ? 'rotate-180' : ''}/></Button><Button variant="ghost" className="w-full justify-between" onClick={() => onNavigate('analytics')}>{t('dashboard.intelligencePanel')}<ArrowRight size={16} className={isRtl ? 'rotate-180' : ''}/></Button><Button variant="ghost" className="w-full justify-between" onClick={() => onNavigate('settings')}>{t('dashboard.openSettings')}<ArrowRight size={16} className={isRtl ? 'rotate-180' : ''}/></Button></div></motion.aside>
      </div>
    </div>
  );
}
