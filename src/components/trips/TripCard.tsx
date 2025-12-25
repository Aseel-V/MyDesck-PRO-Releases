import { useState, useEffect, MouseEvent } from 'react';
import {
  Users,
  Edit,
  Trash2,
  Share2,
  CalendarDays,
  ArrowRight,
  FileText,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { formatDate, generateWhatsAppLink } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { motion, AnimatePresence } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

interface TripCardProps {
  trip: Trip;
  onEdit: (trip: Trip) => void;
  onDelete: (id: string) => void;
  onToggleExport: (id: string, value: boolean) => void | Promise<void>;
  onView?: (trip: Trip) => void;
  isUrgent?: boolean;
}

export default function TripCard({
  trip,
  onEdit,
  onDelete,
  onToggleExport,
  onView,
  isUrgent,
}: TripCardProps) {
  const { t, direction, language } = useLanguage();
  const { format } = useCurrency();
  const [showDetails, setShowDetails] = useState(false);
  const [exportChecked, setExportChecked] = useState<boolean>(!!trip.export_to_pdf);

  useEffect(() => {
    setExportChecked(!!trip.export_to_pdf);
  }, [trip.export_to_pdf]);

  // --- Financial Calculations ---
  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;
  
  const profitValue = typeof trip.profit === 'number' ? trip.profit : sale - wholesale;
  const isProfitPositive = profitValue >= 0;
  const profitPercentage = sale > 0 ? (profitValue / sale) * 100 : 0;

  const amountDue = Math.max(sale - paid, 0);
  const paymentPercentage = sale > 0 ? Math.min((paid / sale) * 100, 100) : 0;

  const getPaymentColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-emerald-500';
      case 'partial': return 'bg-amber-500';
      case 'unpaid': return 'bg-rose-500';
      default: return 'bg-slate-500';
    }
  };

  const statusColor = getPaymentColor(trip.payment_status);
  const isRtl = direction === 'rtl';

  const handleCardClick = () => {
    if (onView) {
      onView(trip);
      return;
    }
    setShowDetails((prev) => !prev);
  };

  const stopPropagation = (e: MouseEvent) => e.stopPropagation();

  const handleExportClick = async (e: MouseEvent) => {
    e.stopPropagation();
    const newValue = !exportChecked;
    setExportChecked(newValue);
    try {
      await onToggleExport(trip.id, newValue);
    } catch {
      setExportChecked(!newValue);
    }
  };

  const handleShare = (e: MouseEvent) => {
    e.stopPropagation();
    const msgTemplate = t('trips.shareMessage', { 
        destination: trip.destination, 
        date: formatDate(trip.start_date),
        price: format(sale, trip.currency || 'USD')
    }) || `Trip to ${trip.destination} on ${formatDate(trip.start_date)}.`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(msgTemplate)}`;
    window.open(url, '_blank');
  };

  const FirstLetter = trip.destination.charAt(0).toUpperCase();
  const actionBtnClass = "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95";

  const formatLocDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-EG' : 'en-US', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative w-full"
      onClick={handleCardClick}
      role="button"
      dir={direction}
    >
      <div className={twMerge(
          "flex flex-col w-full bg-white dark:bg-slate-950 rounded-[2rem] shadow-sm overflow-hidden hover:shadow-xl transition-all duration-300",
          isUrgent 
            ? "ring-2 ring-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] dark:ring-rose-500 dark:shadow-[0_0_20px_rgba(244,63,94,0.2)]" 
            : "ring-1 ring-slate-200 dark:ring-slate-800"
      )}>
        
        {/* Urgent Badge */}
        {isUrgent && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] uppercase font-bold px-3 py-1 rounded-b-lg shadow-md z-20 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>Payment Overdue</span>
            </div>
        )}

        {/* === Top Section === */}
        <div className="p-5 pb-0 relative">
             {/* Background Decoration */}
             <div className="absolute top-0 right-0 rtl:left-0 rtl:right-auto w-40 h-40 bg-gradient-to-br from-sky-400/10 to-purple-400/10 blur-3xl rounded-full pointer-events-none -mr-10 -mt-10 rtl:-ml-10 rtl:-mr-0" />

            {/* Header */}
            <div className="flex items-start gap-4 mb-5 relative z-10">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-inner">
                    <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-tr from-sky-600 to-indigo-600">
                        {FirstLetter}
                    </span>
                </div>
                
                <div className="flex-1 min-w-0 pt-1">
                    <div className="flex justify-between items-start gap-2">
                        <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white leading-tight break-words">
                            {trip.destination}
                        </h3>
                         <span className={twMerge(
                            "flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border shadow-sm",
                            trip.status === 'active' ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800' :
                            trip.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800' :
                            'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        )}>
                            {t(`trips.statuses.${trip.status}`)}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mt-1.5">
                         <Users className="w-4 h-4" />
                         <span className="font-medium truncate">{trip.client_name}</span>
                         <span className="text-slate-300 px-1">•</span>
                         <span className="text-xs bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md">
                            {trip.travelers_count} {t('trips.travelers')}
                         </span>
                    </div>
                </div>
            </div>

            {/* Dates Block */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 mb-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase text-slate-400 font-bold mb-1 tracking-wider">
                            {t('trips.startDate')}
                        </p>
                        <p className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                             <CalendarDays className="w-4 h-4 text-sky-500" />
                             {formatLocDate(trip.start_date)}
                        </p>
                    </div>
                    <div className="px-2 text-slate-300 dark:text-slate-700">
                         <ArrowRight className={twMerge("w-4 h-4", isRtl && "rotate-180")} />
                    </div>
                    <div className="text-end">
                        <p className="text-[10px] uppercase text-slate-400 font-bold mb-1 tracking-wider">
                            {t('trips.endDate')}
                        </p>
                         <p className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 justify-end">
                             {formatLocDate(trip.end_date)}
                             <CalendarDays className="w-4 h-4 text-sky-500" />
                        </p>
                    </div>
                </div>
            </div>

            {/* === DETAILED FINANCIALS === */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-5 shadow-sm">
                
                {/* Row 1: Cost vs Price */}
                <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                    <div>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                            {t('trips.wholesaleCost')}
                         </p>
                         <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                             {format(wholesale, trip.currency || 'USD')}
                         </p>
                    </div>
                    <div className="text-end">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                            {t('trips.salePrice')}
                         </p>
                         <p className="text-lg font-extrabold text-slate-900 dark:text-white">
                             {format(sale, trip.currency || 'USD')}
                         </p>
                    </div>
                </div>

                {/* Row 2: Profit & Percent */}
                <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <div className={twMerge("p-1.5 rounded-full", isProfitPositive ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")}>
                            {isProfitPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                {t('trips.profit')}
                            </p>
                            <p className={twMerge("text-xs font-bold", isProfitPositive ? "text-emerald-600" : "text-rose-600")}>
                                {isProfitPositive ? '+' : ''}{format(profitValue, trip.currency || 'USD')}
                            </p>
                        </div>
                     </div>
                     
                     <div className={twMerge(
                        "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                        isProfitPositive 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" 
                            : "bg-rose-50 text-rose-700 border-rose-100"
                     )}>
                        {profitPercentage.toFixed(1)}% {t('trips.profitPercentage')}
                     </div>
                </div>
            </div>

            {/* Payment Progress Bar */}
            <div className="mb-4">
                 <div className="flex justify-between items-end mb-2">
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {t('trips.paymentStatus')}
                     </span>
                     <span className={twMerge("text-xs font-bold", amountDue > 0 ? "text-rose-500" : "text-emerald-600")}>
                        {amountDue > 0 
                            ? `${t('trips.amountDue')}: ${format(amountDue, trip.currency || 'USD')}` 
                            : t('trips.paymentStatuses.paid')}
                     </span>
                 </div>
                 <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                    <div 
                        className={twMerge("h-full transition-all duration-500 rounded-full relative", statusColor)}
                        style={{ width: `${Math.max(5, paymentPercentage)}%` }}
                    />
                 </div>
            </div>
            
            <AnimatePresence>
            {showDetails && trip.notes && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 mt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 mb-1 font-semibold">{t('trips.notes')}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded-xl border border-yellow-100 dark:border-yellow-900/20 whitespace-pre-wrap">
                    {trip.notes}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* === MINIMALIST FOOTER === */}
        <div className="px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {/* Last Updated */}
            <span className="text-[10px] text-slate-400 font-medium">
               {formatLocDate(trip.updated_at || trip.created_at)}
            </span>
            
            <div className="flex items-center gap-1">
                {/* PDF */}
                <button
                    onClick={handleExportClick}
                    className={twMerge(actionBtnClass, 
                        exportChecked 
                        ? "bg-sky-500 text-white shadow-sky-200 shadow-md" 
                        : "text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                    )}
                    title={t('trips.exportToPdf')}
                >
                    <FileText className="w-4 h-4" />
                </button>

                {/* Edit */}
                <button
                    onClick={(e) => { stopPropagation(e); onEdit(trip); }}
                    className={twMerge(actionBtnClass, "text-slate-400 hover:bg-amber-50 hover:text-amber-600")}
                    title={t('trips.edit')}
                >
                    <Edit className="w-4 h-4" />
                </button>

                {/* Share */}
                <button
                    onClick={(e) => {
                        stopPropagation(e);
                        if (trip.client_phone) {
                            const msgTemplate = `Hello ${trip.client_name}, trip details for ${trip.destination}...`;
                            const url = generateWhatsAppLink(trip.client_phone, msgTemplate);
                            window.open(url, '_blank');
                        } else handleShare(e);
                    }}
                    className={twMerge(actionBtnClass, "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600")}
                    title={t('trips.share') || "Share"}
                >
                    <Share2 className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                     onClick={(e) => { stopPropagation(e); onDelete(trip.id); }}
                     className={twMerge(actionBtnClass, "text-slate-400 hover:bg-rose-50 hover:text-rose-600")}
                     title={t('trips.delete')}
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>

      </div>
    </motion.div>
  );
}