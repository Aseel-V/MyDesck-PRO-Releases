import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Lightbulb,
} from 'lucide-react';
import { BusinessInsight } from '../AnalyticsEngine';
import { useLanguage } from '../../../contexts/LanguageContext';

interface BusinessInsightsProps {
  insights: BusinessInsight[];
}

export default function BusinessInsights({ insights }: BusinessInsightsProps) {
  const { t } = useLanguage();

  const getIcon = (type: BusinessInsight['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />;
      case 'danger':
        return <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-sky-500 shrink-0" />;
    }
  };

  const getBgClass = (type: BusinessInsight['type']) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-50/40 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-950/20';
      case 'warning':
        return 'bg-amber-50/40 border-amber-105 dark:bg-amber-950/10 dark:border-amber-950/20';
      case 'danger':
        return 'bg-rose-50/40 border-rose-100 dark:bg-rose-950/10 dark:border-rose-950/20';
      case 'info':
      default:
        return 'bg-sky-50/40 border-sky-100 dark:bg-sky-950/10 dark:border-sky-950/20';
    }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800/40 dark:bg-slate-900/50">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-50 pb-3 dark:border-slate-800/30">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-500 dark:bg-sky-950/50">
          <Lightbulb className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100">
          {t('analytics.businessInsights')}
        </h3>
      </div>

      {insights.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          <p>{t('analytics.noData')}</p>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {insights.map((insight, idx) => {
            const message = t(`analytics.insights.${insight.key}`, insight.params || {});
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 rounded-xl border p-3.5 transition hover:scale-[1.01] ${getBgClass(
                  insight.type
                )}`}
              >
                {getIcon(insight.type)}
                <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-350">
                  {message}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
