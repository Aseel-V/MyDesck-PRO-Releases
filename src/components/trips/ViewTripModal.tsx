import { useState } from 'react'; // Added useState
import { 
  X, 
  Users, 
  Calendar, 
  CreditCard, 
  FileText, 
  Paperclip, 
  MapPin, 
  DollarSign,

  Archive,
  Loader2
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { supabase } from '../../lib/supabase'; // Import supabase
import { toast } from 'sonner';

interface ViewTripModalProps {
  trip: Trip;
  onClose: () => void;
  onUpdate?: () => void; // Callback to refresh list
}

export default function ViewTripModal({ trip: initialTrip, onClose, onUpdate }: ViewTripModalProps) {
  const { t } = useLanguage();
  const { format } = useCurrency();
  const [trip] = useState(initialTrip);
  const [updating, setUpdating] = useState(false);



  const handleArchive = async () => {
      if(!confirm('Are you sure you want to archive this trip? It will be hidden from the main list.')) return;
      
      setUpdating(true);
      const { error } = await supabase.from('trips').update({ status: 'archived' }).eq('id', trip.id);
      
      if (error) {
          toast.error('Failed to archive trip');
          setUpdating(false);
      } else {
          toast.success('Trip archived');
          onClose();
          if(onUpdate) onUpdate();
      }
  };

  // ... (calcs)
  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;
  const profitValue = typeof trip.profit === 'number' ? trip.profit : sale - wholesale;
  const amountDue = Math.max(sale - paid, 0);

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden dark:bg-slate-950 dark:border-slate-800 dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)]">
        
        {/* Header */}
        <div className="flex-none">
          <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.25em] text-sky-600/80 dark:text-sky-300/80">
                  {t('trips.viewTrip')}
                </span>
                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full border ${
                  trip.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                  trip.status === 'cancelled' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                  trip.status === 'archived' ? 'bg-slate-500/10 border-slate-500/30 text-slate-400' :
                  'bg-sky-500/10 border-sky-500/30 text-sky-400'
                }`}>
                  {trip.status}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2 dark:text-slate-50">
                {trip.destination} 
                <span className="text-slate-400 dark:text-slate-600">—</span>
                <span className="text-slate-500 font-medium dark:text-slate-300">{trip.client_name}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
                {trip.status !== 'archived' && (
                    <button
                        onClick={handleArchive}
                        disabled={updating}
                        className="p-2 rounded-full text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                        title="Archive Trip (Soft Delete)"
                    >
                        {updating ? <Loader2 className="w-5 h-5 animate-spin"/> : <Archive className="w-5 h-5" />}
                    </button>
                )}
                <button
                onClick={onClose}
                className="p-2 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all dark:border-slate-700/80 dark:bg-slate-950/90 dark:hover:bg-slate-800/80 dark:text-slate-300"
                >
                <X className="w-5 h-5" />
                </button>
            </div>
          </div>
        </div>

        {/* Content Area - Single Scrollable View */}
        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-950 space-y-8">
          


          {/* 1. Key Info Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fadeIn">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <Calendar className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.duration')}</span>
              </div>
              <p className="text-slate-900 font-medium dark:text-slate-100">{formatDate(trip.start_date)}</p>
              <p className="text-slate-500 text-sm">to {formatDate(trip.end_date)}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <MapPin className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.accommodation')}</span>
              </div>
              <p className="text-slate-900 font-medium dark:text-slate-100">
                {trip.room_type || 'No Room Config'}
              </p>
              <p className="text-slate-500 text-sm">
                {trip.board_basis || 'No Board Basis'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <Users className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.travelers')}</span>
              </div>
              <p className="text-slate-900 font-medium dark:text-slate-100">{trip.travelers_count} {t('trips.people')}</p>
            </div>
          </section>

          {/* 2. Financial Summary */}
          {(sale > 0 || wholesale > 0 || paid > 0) && (
            <section className="animate-fadeIn">
              <div className="flex items-center gap-2 mb-3 px-1">
                 <DollarSign className="w-4 h-4 text-emerald-500" />
                 <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.financials')}</h3>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden dark:border-slate-800 dark:bg-slate-900">
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase">{t('trips.wholesaleCost')}</p>
                    <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">{format(wholesale, trip.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase">{t('trips.salePrice')}</p>
                    <p className="text-lg font-semibold text-sky-600 dark:text-sky-300">{format(sale, trip.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase">{t('trips.stats.totalProfit')}</p>
                    <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{format(profitValue, trip.currency)}</p>
                  </div>
                   <div>
                    <p className="text-xs text-slate-500 mb-1 uppercase">{t('trips.amountDue')}</p>
                    <p className={`text-lg font-bold ${amountDue > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'}`}>
                      {format(amountDue, trip.currency)}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 3. Travelers */}
          {trip.travelers && trip.travelers.length > 0 && (
             <section className="animate-fadeIn">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Users className="w-4 h-4 text-sky-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.travelerDetails')}</h3>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">{t('admin.table.fullName')}</th>
                        <th className="px-4 py-3 font-medium">{t('trips.passportNumber')}</th>
                        <th className="px-4 py-3 font-medium">{t('trips.nationality')}</th>
                        <th className="px-4 py-3 font-medium">{t('trips.roomType')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900/30">
                      {trip.travelers.map((traveler, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-900 font-medium dark:text-slate-200">{traveler.full_name}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono dark:text-slate-400">{traveler.passport_number || '-'}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{traveler.nationality || '-'}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{traveler.room_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </section>
          )}

          {/* 4. Itinerary */}
          {trip.itinerary && trip.itinerary.length > 0 && (
             <section className="animate-fadeIn">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Calendar className="w-4 h-4 text-fuchsia-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.itinerary')}</h3>
                </div>
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-8 py-2 dark:border-slate-800">
                  {trip.itinerary.map((item, idx) => (
                    <div key={idx} className="relative pl-8">
                      <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-50 border-2 border-sky-500 dark:bg-slate-950" />
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-2">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('trips.day')} {item.day}</h4>
                        {item.date && (
                          <span className="text-xs text-sky-400 font-medium px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20">
                            {formatDate(item.date)}
                          </span>
                        )}
                      </div>
                      <h5 className="text-sm font-semibold text-slate-700 mb-1 dark:text-slate-200">{item.title}</h5>
                      <p className="text-sm text-slate-500 leading-relaxed dark:text-slate-400">{item.description}</p>
                    </div>
                  ))}
                </div>
             </section>
          )}

          {/* 5. Payments List (if any) */}
          {trip.payments && trip.payments.length > 0 && (
            <section className="animate-fadeIn">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <CreditCard className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.paymentHistory')}</h3>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">{t('trips.date')}</th>
                        <th className="px-4 py-3 font-medium">{t('trips.amount')}</th>
                        <th className="px-4 py-3 font-medium">{t('trips.method')}</th>
                        <th className="px-4 py-3 font-medium">{t('trips.receiptId')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900/30">
                      {trip.payments.map((payment, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDate(payment.date)}</td>
                          <td className="px-4 py-3 text-emerald-600 font-medium dark:text-emerald-400">{format(payment.amount, trip.currency)}</td>
                          <td className="px-4 py-3 text-slate-500 capitalize dark:text-slate-400">{payment.method}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs dark:text-slate-500">{payment.receipt_id || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </section>
          )}

          {/* 6. Files */}
          {trip.attachments && trip.attachments.length > 0 && (
             <section className="animate-fadeIn">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Paperclip className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.attachments')}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {trip.attachments.map((file, idx) => (
                    <a 
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-sky-500/30 hover:shadow-lg hover:shadow-sky-500/10 transition-all group dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                    >
                      <div className="p-2.5 rounded-lg bg-slate-200 group-hover:bg-sky-500/20 group-hover:text-sky-600 text-slate-500 transition-colors dark:bg-slate-800 dark:group-hover:text-sky-400 dark:text-slate-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate group-hover:text-sky-600 dark:text-slate-200 dark:group-hover:text-sky-300">{file.file_name}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">{file.type}</p>
                      </div>
                    </a>
                  ))}
                </div>
             </section>
          )}

          {/* 7. Notes */}
          {trip.notes && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('trips.notesAndRequirements')}</h3>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-slate-600 text-sm whitespace-pre-wrap leading-relaxed dark:bg-amber-500/5 dark:border-amber-500/20 dark:text-slate-300">
                {trip.notes}
              </div>
            </section>
          )}

        </div>
        
        {/* Footer */}
        <div className="flex-none p-4 md:px-6 border-t border-slate-200 bg-slate-50 flex justify-end dark:border-slate-800 dark:bg-slate-950">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-medium border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200"
          >
            {t('trips.close') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}