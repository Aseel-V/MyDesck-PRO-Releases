import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Trip } from '../../types/trip';

interface UpdatePaymentFormProps {
  trip: Trip;
  onClose: () => void;
  onUpdate: (
    tripId: string,
    amountPaid: number,
    paymentStatus: 'paid' | 'partial' | 'unpaid'
  ) => Promise<void>;
}

export default function UpdatePaymentForm({
  trip,
  onClose,
  onUpdate,
}: UpdatePaymentFormProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();

  const [amountPaid, setAmountPaid] = useState(trip.amount_paid);
  const [paymentStatus, setPaymentStatus] = useState<
    'paid' | 'partial' | 'unpaid'
  >(trip.payment_status);
  const [loading, setLoading] = useState(false);

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD':
        return '$';
      case 'EUR':
        return '€';
      case 'ILS':
        return '₪';
      default:
        return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(
    profile?.preferred_currency || 'USD'
  );

  const total = trip.sale_price || 0;
  const due = Math.max(0, total - amountPaid);
  const paidPercent =
    total > 0 ? Math.min(100, Math.max(0, (amountPaid / total) * 100)) : 0;

  const handleAmountChange = (value: number) => {
    const safeValue = Number.isNaN(value) ? 0 : value;
    setAmountPaid(safeValue);

    if (safeValue >= total && total > 0) {
      setPaymentStatus('paid');
    } else if (safeValue > 0) {
      setPaymentStatus('partial');
    } else {
      setPaymentStatus('unpaid');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onUpdate(trip.id, amountPaid, paymentStatus);
      onClose();
    } catch (error) {
      console.error('Failed to update payment:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      {/* Glow background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-emerald-500/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -left-32 w-80 h-80 bg-sky-500/15 blur-3xl rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass-panel bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl animate-scaleIn overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-xl font-bold text-slate-50">
                {t('trips.updatePayment')}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {trip.destination} • {trip.client_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-300 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Summary card */}
            <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 px-4 py-3 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-300">{t('trips.salePrice')}</span>
                <span className="font-semibold text-sky-200">
                  {currencySymbol}
                  {total.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">{t('trips.amountPaid')}</span>
                <span className="font-semibold text-emerald-200">
                  {currencySymbol}
                  {amountPaid.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">{t('trips.amountDue')}</span>
                <span
                  className={`font-semibold ${due <= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                >
                  {currencySymbol}
                  {due.toFixed(2)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Payment progress</span>
                  <span>{paidPercent.toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${due <= 0
                        ? 'bg-emerald-500'
                        : paidPercent > 0
                          ? 'bg-sky-500'
                          : 'bg-slate-600'
                      }`}
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                {t('trips.amountPaid')} ({currencySymbol}) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={total}
                value={amountPaid}
                onChange={(e) =>
                  handleAmountChange(parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-lg font-semibold"
                required
              />
            </div>

            {/* Status select */}
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                {t('trips.paymentStatus')} *
              </label>
              <select
                value={paymentStatus}
                onChange={(e) =>
                  setPaymentStatus(
                    e.target.value as 'paid' | 'partial' | 'unpaid'
                  )
                }
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="unpaid">
                  {t('trips.paymentStatuses.unpaid')}
                </option>
                <option value="partial">
                  {t('trips.paymentStatuses.partial')}
                </option>
                <option value="paid">
                  {t('trips.paymentStatuses.paid')}
                </option>
              </select>
            </div>

            {/* Due badge */}
            <div
              className={`rounded-xl px-4 py-3 border text-sm flex items-center justify-between ${due <= 0
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-100'
                  : 'bg-rose-500/10 border-rose-500/40 text-rose-100'
                }`}
            >
              <span className="font-medium">
                {due <= 0
                  ? t('trips.paymentStatuses.paid')
                  : t('trips.amountDue')}
              </span>
              <span className="text-lg font-bold">
                {currencySymbol}
                {due.toFixed(2)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 transition-all text-sm font-medium"
              >
                {t('trips.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 focus:ring-4 focus:ring-emerald-400/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? t('auth.loading') : t('settings.save')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
