import { X } from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';

interface ViewTripModalProps {
  trip: Trip;
  onClose: () => void;
}

export default function ViewTripModal({ trip, onClose }: ViewTripModalProps) {
  const { t } = useLanguage();

  const { format } = useCurrency();





  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;
  const profitValue =
    typeof trip.profit === 'number' ? trip.profit : sale - wholesale;
  const amountDue = Math.max(sale - paid, 0);

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-2xl w-full max-h-[90vh] my-6 rounded-2xl bg-slate-950/95 border border-slate-800/80 shadow-[0_22px_65px_rgba(15,23,42,0.95)] overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/95">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.25em] text-sky-300/80">
              View Trip
            </span>
            <h2 className="text-lg md:text-xl font-bold text-slate-50">
              {trip.destination} — {trip.client_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full border border-slate-700/80 bg-slate-950/90 hover:bg-slate-800/80 text-slate-300 transition-all"
            aria-label={t('trips.cancel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 md:px-6 md:py-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.destination')}</p>
              <p className="text-sm font-semibold text-slate-100">{trip.destination}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.clientName')}</p>
              <p className="text-sm font-semibold text-slate-100">{trip.client_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.startDate')}</p>
              <p className="text-sm font-semibold text-slate-100">{formatDate(trip.start_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.endDate')}</p>
              <p className="text-sm font-semibold text-slate-100">{formatDate(trip.end_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.travelers')}</p>
              <p className="text-sm font-semibold text-slate-100">{trip.travelers_count}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.paymentStatus')}</p>
              <p className="text-sm font-semibold text-slate-100">{t(`trips.paymentStatuses.${trip.payment_status}`)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 md:px-5 md:py-4 shadow-inner shadow-slate-950/80">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('trips.wholesaleCost')}</p>
                <p className="text-sm font-semibold text-slate-100">{format(wholesale, trip.currency || 'USD')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('trips.salePrice')}</p>
                <p className="text-sm font-semibold text-slate-100">{format(sale, trip.currency || 'USD')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{t('trips.profit')}</p>
                <p className="text-sm font-semibold text-slate-100">{format(profitValue, trip.currency || 'USD')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.paymentDate') || 'Payment Date'}</p>
              <p className="text-sm font-semibold text-slate-100">{trip.payment_date ? formatDate(trip.payment_date) : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.amountPaid')}</p>
              <p className="text-sm font-semibold text-slate-100">{format(paid, trip.currency || 'USD')}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.amountDue')}</p>
              <p className="text-sm font-semibold text-rose-300">{format(amountDue, trip.currency || 'USD')}</p>
            </div>
          </div>

          {trip.notes && (
            <div>
              <p className="text-xs text-slate-400 mb-1">{t('trips.notes')}</p>
              <p className="text-sm text-slate-100 whitespace-pre-wrap bg-slate-950/90 border border-slate-800 px-3 py-2.5 rounded-xl">
                {trip.notes}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-4 md:px-6 border-t border-slate-800/80 bg-slate-950/95">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-600/80 text-slate-200 bg-slate-950/90 hover:bg-slate-900/90 transition-all"
          >
            {t('trips.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
