import { useState, useEffect, MouseEvent } from 'react';
import {
  MapPin,
  Users,
  Calendar,
  Edit,
  Trash2,
  CreditCard,
  CheckSquare,
  Square,
  Share2,
} from 'lucide-react';
import { formatDateHijri } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Trip } from '../../types/trip';

interface TripCardProps {
  trip: Trip;
  onEdit: (trip: Trip) => void;
  onDelete: (id: string) => void;
  onUpdatePayment: (trip: Trip) => void;
  onToggleExport: (id: string, value: boolean) => void | Promise<void>;
  onView?: (trip: Trip) => void;
}

export default function TripCard({
  trip,
  onEdit,
  onDelete,
  onUpdatePayment,
  onToggleExport,
  onView,
}: TripCardProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [showDetails, setShowDetails] = useState(false);

  // PDF state (عشان التبديل يكون فوري في الواجهة)
  const [exportChecked, setExportChecked] = useState<boolean>(
    !!trip.export_to_pdf
  );

  useEffect(() => {
    setExportChecked(!!trip.export_to_pdf);
  }, [trip.export_to_pdf]);

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

  const currencySymbol = getCurrencySymbol(profile?.preferred_currency || 'USD');

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

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(
      profile?.preferred_language || 'en',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }
    );
  };

  // قيم آمنة
  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;

  const profitValue =
    typeof trip.profit === 'number' ? trip.profit : sale - wholesale;

  const amountDue = Math.max(sale - paid, 0);
  const isProfitPositive = profitValue >= 0;
  const profitColor = isProfitPositive ? 'text-emerald-400' : 'text-rose-400';
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
    const text = `Trip Details:\nDestination: ${trip.destination}\nClient: ${trip.client_name}\nDates: ${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}\nPrice: ${currencySymbol}${sale.toFixed(2)}\nStatus: ${trip.status}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className="relative rounded-2xl bg-slate-950/95 border border-slate-800/80 shadow-lg shadow-slate-950/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/70 hover:shadow-[0_18px_45px_rgba(15,23,42,0.95)] cursor-pointer"
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
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/90 border border-sky-500/60 shadow-sm shadow-sky-900/70">
                <MapPin className="w-4 h-4 text-sky-300" />
              </div>
              <h3 className="text-base md:text-lg font-semibold text-slate-50 truncate">
                {trip.destination}
              </h3>
            </div>
            <p className="text-sm text-slate-300 font-medium truncate">
              {trip.client_name}
            </p>
          </div>

          {/* PDF toggle */}
          <button
            onClick={handleExportClick}
            className="px-2.5 py-2 rounded-xl border border-slate-700 bg-slate-950/95 hover:bg-slate-900/95 hover:border-sky-400 text-slate-200 transition-all flex flex-col items-center gap-1"
            title={t('trips.exportToPdf')}
          >
            {exportChecked ? (
              <CheckSquare className="w-4 h-4 md:w-5 md:h-5 text-sky-400" />
            ) : (
              <Square className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
            )}
            <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
              PDF
            </span>
          </button>
        </div>

        {/* status + travelers */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
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
        <div className="flex flex-wrap items-center gap-2 text-slate-300 text-sm">
          <Calendar className="w-4 h-4" />
          <div className="flex flex-col">
            <span className="font-medium">
              {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
            </span>
            <span className="text-xs text-slate-500">
              {formatDateHijri(trip.start_date)} — {formatDateHijri(trip.end_date)}
            </span>
          </div>
        </div>

        {/* money strip */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 md:px-5 md:py-4 shadow-inner shadow-slate-950/70">
          <div className="grid grid-cols-3 gap-4 items-center">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                {t('trips.wholesaleCost')}
              </p>
              <p className="text-sm font-semibold text-slate-100">
                {currencySymbol}
                {wholesale.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                {t('trips.salePrice')}
              </p>
              <p className="text-sm font-semibold text-slate-100">
                {currencySymbol}
                {sale.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400 mb-1">
                {t('trips.profit')}
              </p>
              <p className={`text-sm font-bold ${profitColor}`}>
                {profitSign}
                {currencySymbol}
                {Math.abs(profitValue).toFixed(2)}{' '}
                <span className="text-[11px] text-slate-400">
                  ({profitPercentageDisplay})
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* payment */}
        <div className="pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm font-medium text-slate-200">
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
                <p className="text-[11px] text-slate-400 mb-1">
                  {t('trips.amountPaid')}
                </p>
                <p className="text-sm font-semibold text-slate-100">
                  {currencySymbol}
                  {paid.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 mb-1">
                  {t('trips.amountDue')}
                </p>
                <p className="text-sm font-semibold text-rose-300">
                  {currencySymbol}
                  {amountDue.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* notes preview عندما التفاصيل مغلقة */}
        {trip.notes && !showDetails && (
          <div className="pt-3 border-t border-slate-800/80">
            <p className="text-[11px] text-slate-400 mb-2">
              {t('trips.notes')}
            </p>
            <p className="text-sm text-slate-100 bg-slate-950/90 border border-slate-800 px-3 py-2.5 rounded-xl line-clamp-3">
              {trip.notes}
            </p>
          </div>
        )}

        {/* actions (ما تفتحش/تسكر التفاصيل) */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-800/80">
          <button
            onClick={(e) => {
              stopPropagation(e);
              onUpdatePayment(trip);
            }}
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-emerald-600/85 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            aria-label={t('trips.updatePayment')}
          >
            <CreditCard className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              stopPropagation(e);
              onEdit(trip);
            }}
            className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-amber-400/95 hover:bg-amber-300 text-slate-900 text-sm font-medium transition-colors"
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
          <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-4 mt-1">
            <p className="text-sm text-slate-100 whitespace-pre-wrap">
              {trip.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
