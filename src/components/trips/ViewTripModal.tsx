import { useState } from 'react';
import { 
  X, 
  Users, 
  Calendar, 
  CreditCard, 
  FileText, 
  Paperclip, 
  MapPin, 
  DollarSign,
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'details' | 'travelers' | 'itinerary' | 'payments' | 'files'>('details');

  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;
  const profitValue = typeof trip.profit === 'number' ? trip.profit : sale - wholesale;
  const amountDue = Math.max(sale - paid, 0);

  const tabs = [
    { id: 'details', label: t('trips.details') || 'Details', icon: FileText },
    { id: 'travelers', label: t('trips.travelers') || 'Travelers', icon: Users },
    { id: 'itinerary', label: t('trips.itinerary') || 'Itinerary', icon: Calendar },
    { id: 'payments', label: t('trips.payments') || 'Payments', icon: CreditCard },
    { id: 'files', label: t('trips.attachments') || 'Files', icon: Paperclip },
  ] as const;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden dark:bg-slate-950/95 dark:border-slate-800/80 dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)]">
        
        {/* Header */}
        <div className="flex-none">
          <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/95 dark:border-slate-800/80 dark:bg-slate-950/95">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.25em] text-sky-600/80 dark:text-sky-300/80">
                  {t('trips.viewTrip')}
                </span>
                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full border ${
                  trip.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                  trip.status === 'cancelled' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
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
            <button
              onClick={onClose}
              className="p-2 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all dark:border-slate-700/80 dark:bg-slate-950/90 dark:hover:bg-slate-800/80 dark:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-slate-50 overflow-x-auto dark:border-slate-800/80 dark:bg-slate-950/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-950/30">
          
          {/* 1. General Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Key Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800/60">
                  <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wider font-semibold">Duration</span>
                  </div>
                  <p className="text-slate-900 font-medium dark:text-slate-100">{formatDate(trip.start_date)}</p>
                  <p className="text-slate-500 text-sm">to {formatDate(trip.end_date)}</p>
                </div>

                {(trip.room_type || trip.board_basis) && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800/60">
                    <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                      <MapPin className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider font-semibold">Accommodation</span>
                    </div>
                    <p className="text-slate-900 font-medium dark:text-slate-100">{trip.room_type || 'Not specified'}</p>
                    <p className="text-slate-500 text-sm">{trip.board_basis || 'Room Only'}</p>
                  </div>
                )}

                {trip.travelers_count > 0 && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800/60">
                    <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                      <Users className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider font-semibold">Travelers</span>
                    </div>
                    <p className="text-slate-900 font-medium dark:text-slate-100">{trip.travelers_count} People</p>
                    <p className="text-slate-500 text-sm">{trip.travelers?.length ? 'See travelers tab' : 'No details added'}</p>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              {(sale > 0 || wholesale > 0 || paid > 0) && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden dark:border-slate-800 dark:bg-slate-900/20">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900/80">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 dark:text-slate-200">
                      <DollarSign className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      Financial Overview
                    </h3>
                  </div>
                  <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase">Wholesale Cost</p>
                      <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">{format(wholesale, trip.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase">Sale Price</p>
                      <p className="text-lg font-semibold text-sky-600 dark:text-sky-300">{format(sale, trip.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase">Total Profit</p>
                      <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{format(profitValue, trip.currency)}</p>
                    </div>
                     <div>
                      <p className="text-xs text-slate-500 mb-1 uppercase">Amount Due</p>
                      <p className={`text-lg font-bold ${amountDue > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'}`}>
                        {format(amountDue, trip.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {trip.notes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes & Requirements</h3>
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-slate-600 text-sm whitespace-pre-wrap leading-relaxed dark:bg-amber-500/5 dark:border-amber-500/20 dark:text-slate-300">
                    {trip.notes}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Travelers Tab */}
          {activeTab === 'travelers' && (
            <div className="space-y-4 animate-fadeIn">
              {trip.travelers && trip.travelers.length > 0 ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Full Name</th>
                        <th className="px-4 py-3 font-medium">Passport No.</th>
                        <th className="px-4 py-3 font-medium">Nationality</th>
                        <th className="px-4 py-3 font-medium">Room Type</th>
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
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Users className="w-12 h-12 mb-3 opacity-20" />
                  <p>No detailed traveler information recorded.</p>
                </div>
              )}
            </div>
          )}

          {/* 3. Itinerary Tab */}
          {activeTab === 'itinerary' && (
            <div className="space-y-6 animate-fadeIn relative">
              {trip.itinerary && trip.itinerary.length > 0 ? (
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-8 py-2 dark:border-slate-800">
                  {trip.itinerary.map((item, idx) => (
                    <div key={idx} className="relative pl-8">
                      <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-50 border-2 border-sky-500 dark:bg-slate-950" />
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-2">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">Day {item.day}</h4>
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
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <MapPin className="w-12 h-12 mb-3 opacity-20" />
                  <p>No itinerary details available.</p>
                </div>
              )}
            </div>
          )}

          {/* 4. Payments Tab */}
          {activeTab === 'payments' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5">
                    <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1 dark:text-emerald-400">Total Paid</p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-100">{format(paid, trip.currency)}</p>
                 </div>
                 <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-50 dark:bg-rose-500/5">
                    <p className="text-xs text-rose-500 uppercase tracking-wider mb-1 dark:text-rose-400">Remaining Due</p>
                    <p className="text-xl font-bold text-rose-700 dark:text-rose-100">{format(amountDue, trip.currency)}</p>
                 </div>
                 <div className="p-4 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 dark:text-slate-400">Payment Status</p>
                    <p className="text-xl font-bold text-slate-700 capitalize dark:text-slate-200">{trip.payment_status}</p>
                 </div>
              </div>

              {trip.payments && trip.payments.length > 0 ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Amount</th>
                        <th className="px-4 py-3 font-medium">Method</th>
                        <th className="px-4 py-3 font-medium">Receipt ID</th>
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
              ) : (
                <div className="text-center py-8 border border-dashed border-slate-300 rounded-xl dark:border-slate-800">
                  <p className="text-slate-500 text-sm">No payment history recorded.</p>
                </div>
              )}
            </div>
          )}

          {/* 5. Files Tab */}
          {activeTab === 'files' && (
            <div className="space-y-4 animate-fadeIn">
              {trip.attachments && trip.attachments.length > 0 ? (
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
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Paperclip className="w-12 h-12 mb-3 opacity-20" />
                  <p>No files attached to this trip.</p>
                </div>
              )}
            </div>
          )}

        </div>
        
        {/* Footer */}
        <div className="flex-none p-4 md:px-6 border-t border-slate-200 bg-slate-50 flex justify-end dark:border-slate-800/80 dark:bg-slate-950/95">
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