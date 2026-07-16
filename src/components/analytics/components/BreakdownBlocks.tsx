import { useMemo } from 'react';
import { Layers, Compass } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Trip } from '../../../types/trip';
import { getTripStatusLabel, getEffectiveTripDate } from '../../../lib/tripStatus';

interface BreakdownBlocksProps {
  filteredTrips: Trip[];
}

export default function BreakdownBlocks({ filteredTrips }: BreakdownBlocksProps) {
  const { t } = useLanguage();

  // 1. Status Breakdown
  const statusStats = useMemo(() => {
    const counts = { active: 0, completed: 0, cancelled: 0, archived: 0 };
    filteredTrips.forEach((trip) => {
      if (counts[trip.status] !== undefined) {
        counts[trip.status]++;
      }
    });

    const total = filteredTrips.length;
    return Object.entries(counts).map(([status, count]) => {
      const pct = total > 0 ? (count / total) * 100 : 0;
      return {
        status: status as Trip['status'],
        count,
        pct,
      };
    });
  }, [filteredTrips]);

  // 2. Timing Breakdown (Upcoming vs Past)
  const timingStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let upcoming = 0;
    let past = 0;

    filteredTrips.forEach((trip) => {
      const dateStr = getEffectiveTripDate(trip);
      if (dateStr >= todayStr) {
        upcoming++;
      } else {
        past++;
      }
    });

    const total = filteredTrips.length;
    const upcomingPct = total > 0 ? (upcoming / total) * 100 : 0;
    const pastPct = total > 0 ? (past / total) * 100 : 0;

    return {
      upcoming,
      past,
      upcomingPct,
      pastPct,
    };
  }, [filteredTrips]);

  const getStatusColor = (status: Trip['status']) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500';
      case 'completed':
        return 'bg-sky-500';
      case 'cancelled':
        return 'bg-rose-500';
      case 'archived':
      default:
        return 'bg-slate-400 dark:bg-slate-500';
    }
  };

  const getStatusTextClass = (status: Trip['status']) => {
    switch (status) {
      case 'active':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'completed':
        return 'text-sky-650 dark:text-sky-400';
      case 'cancelled':
        return 'text-rose-600 dark:text-rose-400';
      case 'archived':
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {/* Trip Status Breakdown */}
      <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-50 pb-3 dark:border-slate-800/30">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500 dark:bg-sky-950/50">
            <Layers className="h-4 w-4" />
          </div>
          <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100">
            {t('analytics.tripStatusBreakdown')}
          </h3>
        </div>

        <div className="flex-1 space-y-3.5">
          {statusStats.map(({ status, count, pct }) => (
            <div key={status} className="text-xs font-semibold">
              <div className="mb-1.5 flex items-center justify-between">
                <span className={`capitalize ${getStatusTextClass(status)}`}>
                  {getTripStatusLabel(status, t)}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {count} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-50 dark:bg-slate-950">
                <div
                  className={`h-full ${getStatusColor(status)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timing Breakdown */}
      <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-50 pb-3 dark:border-slate-800/30">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500 dark:bg-sky-950/50">
            <Compass className="h-4 w-4" />
          </div>
          <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100">
            {t('analytics.tripStatusBreakdown')} - {t('analytics.yearlyPerformance')}
          </h3>
        </div>

        <div className="flex-1 space-y-5">
          {/* Upcoming */}
          <div className="text-xs font-semibold">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sky-600 dark:text-sky-400">
                {t('trips.stats.upcoming') || 'Upcoming Trips'}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {timingStats.upcoming} ({timingStats.upcomingPct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-50 dark:bg-slate-950">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${timingStats.upcomingPct}%` }}
              />
            </div>
          </div>

          {/* Past */}
          <div className="text-xs font-semibold">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                {t('analytics.pastTrips') || 'Past Trips'}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {timingStats.past} ({timingStats.pastPct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-50 dark:bg-slate-950">
              <div
                className="h-full bg-slate-400 dark:bg-slate-500"
                style={{ width: `${timingStats.pastPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
