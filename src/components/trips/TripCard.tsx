import { useState, useEffect, MouseEvent } from 'react';
import {
  MapPin,
  Users,
  Calendar,
  Edit,
  Trash2,
  CheckSquare,
  Square,
  Share2,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';

interface TripCardProps {
  trip: Trip;
  onEdit: (trip: Trip) => void;
  onDelete: (id: string) => void;

  onToggleExport: (id: string, value: boolean) => void | Promise<void>;
  onView?: (trip: Trip) => void;
}

export default function TripCard({
  trip,
  onEdit,
  onDelete,

  onToggleExport,
  onView,
}: TripCardProps) {
  const { t } = useLanguage();

  const { format } = useCurrency();
  const [showDetails, setShowDetails] = useState(false);

  // PDF state (عشان التبديل يكون فوري في الواجهة)
  const [exportChecked, setExportChecked] = useState<boolean>(
    !!trip.export_to_pdf
  );

  useEffect(() => {
    setExportChecked(!!trip.export_to_pdf);
  }, [trip.export_to_pdf]);



  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
      case 'partial':
        return 'bg-amber-500/15 text-amber-200 border-amber-500/40';
      case 'unpaid':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
      default:
        return 'bg-slate-700/40 text-slate-200 border-slate-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
      case 'completed':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
      case 'cancelled':
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
    }
  };



  // قيم آمنة
  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;

  const profitValue =
    typeof trip.profit === 'number' ? trip.profit : sale - wholesale;

  const amountDue = Math.max(sale - paid, 0);
  const isProfitPositive = profitValue >= 0;

  const profitSign = isProfitPositive ? '+' : '';

  // الربح كنسبة من سعر البيع
  const profitPercentage =
    sale > 0 ? (profitValue / sale) * 100 : 0;
  const profitPercentageDisplay = `${profitPercentage.toFixed(1)}%`;

  // الكرت كله clickable
  const handleCardClick = () => {
    if (onView) {
      onView(trip);
      return;
    }
    setShowDetails((prev) => !prev);
  };

  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const handleExportClick = async (e: MouseEvent) => {
    e.stopPropagation();
    const newValue = !exportChecked;
    setExportChecked(newValue); // UI فوري
    try {
      await onToggleExport(trip.id, newValue);
    } catch (err) {
      // لو صار error ممكن نرجع القيمة
      setExportChecked(!newValue);
      console.error('Failed to toggle export_to_pdf', err);
    }
  };

  const handleShare = (e: MouseEvent) => {
    e.stopPropagation();
    const text = `Trip Details:\nDestination: ${trip.destination}\nClient: ${trip.client_name}\nDates: ${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}\nPrice: ${format(sale, trip.currency || 'USD')}\nStatus: ${trip.status}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className="relative rounded-2xl bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/70 hover:shadow-md cursor-pointer dark:bg-slate-950/95 dark:border-slate-800/80 dark:shadow-lg dark:shadow-slate-950/70 dark:hover:shadow-[0_18px_45px_rgba(15,23,42,0.95)]"
      onClick={handleCardClick}
      role="button"
    >
      {/* gradient highlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(56,189,248,0.4), transparent 55%)',
        }}
      />

      <div className="relative p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 border border-sky-200 shadow-sm text-sky-600 dark:bg-slate-900/90 dark:border-sky-500/60 dark:shadow-sky-900/70 dark:text-sky-300">
                <MapPin className="w-4 h-4" />
              </div>
              <h3 className="text-base md:text-lg font-semibold text-slate-900 truncate dark:text-slate-50">
                {trip.destination}
              </h3>
            </div>
            <p className="text-sm text-slate-500 font-medium truncate dark:text-slate-300">
              {trip.client_name}
            </p>
          </div>

          {/* PDF toggle */}
          <button
            onClick={handleExportClick}
            className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-sky-400 text-slate-600 transition-all flex flex-col items-center gap-1 dark:border-slate-700 dark:bg-slate-950/95 dark:hover:bg-slate-900/95 dark:text-slate-200"
            title={t('trips.exportToPdf')}
          >
            {exportChecked ? (
              <CheckSquare className="w-4 h-4 md:w-5 md:h-5 text-sky-500 dark:text-sky-400" />
            ) : (
              <Square className="w-4 h-4 md:w-5 md:h-5 text-slate-400 dark:text-slate-500" />
            )}
            <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              PDF
            </span>
          </button>
        </div>

        {/* status + travelers */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-500 text-sm dark:text-slate-300">
            <Users className="w-4 h-4" />
            <span>
              {trip.travelers_count} {t('trips.travelers')}
            </span>
          </div>

          <div
            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[11px] font-semibold border ${getStatusColor(
              trip.status
            )}`}
          >
            {t(`trips.statuses.${trip.status}`)}
          </div>
        </div>

        {/* dates */}
        <div className="flex flex-wrap items-center gap-2 text-slate-500 text-sm dark:text-slate-300">
          <Calendar className="w-4 h-4" />
          <div className="flex flex-col">
            <span className="font-medium">
              {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
            </span>

          </div>
        </div>

        {/* money strip */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 md:px-5 md:py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-inner dark:shadow-slate-950/70">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div>
              <p className="text-[11px] text-slate-500 mb-1 dark:text-slate-400">
                {t('trips.wholesaleCost')}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {format(wholesale, trip.currency || 'USD')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1 dark:text-slate-400">
                {t('trips.salePrice')}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {format(sale, trip.currency || 'USD')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-500 mb-1 dark:text-slate-400">
                {t('trips.profit')}
              </p>
              <p className={`text-sm font-bold ${isProfitPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {profitSign}
                {format(Math.abs(profitValue), trip.currency || 'USD')}{' '}
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  ({profitPercentageDisplay})
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* payment */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-200">
              {t('trips.paymentStatus')}
            </span>
            <span
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border ${getPaymentStatusColor(
                trip.payment_status
              )}`}
            >
              {t(`trips.paymentStatuses.${trip.payment_status}`)}
            </span>
          </div>

          {trip.payment_status !== 'paid' && (
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <p className="text-[11px] text-slate-500 mb-1 dark:text-slate-400">
                  {t('trips.amountPaid')}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {format(paid, trip.currency || 'USD')}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 mb-1 dark:text-slate-400">
                  {t('trips.amountDue')}
                </p>
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                  {format(amountDue, trip.currency || 'USD')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* notes preview عندما التفاصيل مغلقة */}
        {trip.notes && !showDetails && (
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
            <p className="text-[11px] text-slate-500 mb-2 dark:text-slate-400">
              {t('trips.notes')}
            </p>
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl line-clamp-3 dark:text-slate-100 dark:bg-slate-950/90 dark:border-slate-800">
              {trip.notes}
            </p>
          </div>
        )}

        {/* actions (ما تفتحش/تسكر التفاصيل) */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">


          <button
            onClick={(e) => {
              stopPropagation(e);
              onEdit(trip);
            }}
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-amber-400/90 hover:bg-amber-300 text-slate-900 text-sm font-medium transition-colors border border-amber-400/20"
            aria-label={t('trips.edit')}
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              stopPropagation(e);
              onDelete(trip.id);
            }}
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-sm font-medium transition-colors"
            aria-label={t('trips.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleShare}
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-green-600/90 hover:bg-green-500 text-white text-sm font-medium transition-colors"
            aria-label="Share on WhatsApp"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* details (full notes) */}
      {showDetails && trip.notes && (
        <div className="relative px-5 md:px-6 pb-5 pt-0 animate-fadeIn">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-1 dark:bg-slate-950/95 dark:border-slate-800">
            <p className="text-sm text-slate-600 whitespace-pre-wrap dark:text-slate-100">
              {trip.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
