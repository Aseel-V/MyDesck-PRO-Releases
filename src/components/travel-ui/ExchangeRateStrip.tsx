import { useMemo } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useLanguage } from '../../contexts/LanguageContext';

const currencies = ['USD', 'EUR', 'JOD'] as const;

function getRateToIls(rates: Record<string, number> | null, code: typeof currencies[number]) {
  if (!rates || !Number.isFinite(rates.ILS)) return null;
  const baseRate = code === 'USD' ? 1 : rates[code];
  if (!Number.isFinite(baseRate) || baseRate <= 0) return null;
  return rates.ILS / baseRate;
}

export function ExchangeRateStrip({ compact = false }: { compact?: boolean }) {
  const { rates, isLoading, isStale, lastUpdated } = useCurrency();
  const { t, language } = useLanguage();
  const values = useMemo(() => currencies.map((code) => ({ code, value: getRateToIls(rates, code) })), [rates]);
  const updatedLabel = lastUpdated
    ? `${t('settings.business.lastUpdated')} ${new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(lastUpdated)}`
    : null;

  return (
    <div
      className={`flex w-fit max-w-[calc(100vw-2rem)] items-center divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white/90 text-[11px] text-slate-600 shadow-sm dark:divide-slate-700 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 ${compact ? 'px-1' : ''}`}
      dir="ltr"
      aria-live="polite"
    >
      {values.map(({ code, value }) => (
        <span key={code} className="flex shrink-0 items-baseline gap-1 px-2 py-1.5 tabular-nums">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{code}</span>
          <span aria-label={value === null ? t('analytics.currencyUnavailableValue') : undefined}>
            {isLoading ? '…' : value === null ? '—' : `${value.toFixed(3)} ₪`}
          </span>
        </span>
      ))}
      {isStale && (
        <span className="shrink-0 px-2 py-1.5 text-amber-700 dark:text-amber-300" title={t('analytics.staleRatesWarning')}>
          *<span className="sr-only">{t('analytics.staleRatesWarning')}</span>
        </span>
      )}
      {updatedLabel && <span className="hidden shrink-0 px-2 py-1.5 text-slate-400 xl:inline">{updatedLabel}</span>}
    </div>
  );
}
