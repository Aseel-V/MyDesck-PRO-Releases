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
  Archive,
  Loader2,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Trip } from '../../types/trip';
import { toast } from 'sonner';
import { useTripMutations } from '../../hooks/useTripMutations';
import { formatRoomConfiguration } from '../../lib/tripRoom';
import { getTripAttachmentUrl } from '../../lib/tripAttachments';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import {
  getPaymentStatusDescription,
  getPaymentStatusLabel,
  getTripStatusDescription,
  getTripStatusLabel,
} from '../../lib/tripStatus';

interface ViewTripModalProps {
  trip: Trip;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ViewTripModal({ trip: initialTrip, onClose, onUpdate }: ViewTripModalProps) {
  const { t } = useLanguage();
  const { format } = useCurrency();
  const [trip] = useState(initialTrip);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const { archiveTrip, isArchiving } = useTripMutations();

  const handleArchive = async () => {
    try {
      await archiveTrip(trip.id);
      setShowArchiveConfirm(false);
      onClose();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to archive trip:', error);
    }
  };

  const handleOpenAttachment = async (file: Trip['attachments'][number]) => {
    try {
      const url = await getTripAttachmentUrl(file);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open attachment:', error);
      toast.error('Failed to open attachment');
    }
  };

  const wholesale = trip.wholesale_cost ?? 0;
  const sale = trip.sale_price ?? 0;
  const paid = trip.amount_paid ?? 0;
  const profitValue = typeof trip.profit === 'number' ? trip.profit : sale - wholesale;
  const amountDue = Math.max(sale - paid, 0);
  const statusLabel = getTripStatusLabel(trip.status, t);
  const paymentStatusLabel = getPaymentStatusLabel(trip.payment_status, t);

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-4xl w-full max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden dark:bg-slate-950 dark:border-slate-800 dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)]">
        <div className="flex-none">
          <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 border-b border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] uppercase tracking-[0.25em] text-sky-600/80 dark:text-sky-300/80">
                    {t('trips.viewTrip')}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full border ${
                    trip.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                    trip.status === 'cancelled' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                    trip.status === 'archived' ? 'bg-slate-500/10 border-slate-500/30 text-slate-400' :
                    'bg-sky-500/10 border-sky-500/30 text-sky-400'
                  }`}>
                    {statusLabel}
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2 dark:text-slate-50">
                  <span className="break-words">{trip.destination}</span>
                  <span className="text-slate-400 dark:text-slate-600">ג€”</span>
                  <span className="text-slate-500 font-medium break-words dark:text-slate-300">{trip.client_name}</span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {getTripStatusDescription(trip.status, t)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {trip.status !== 'archived' && (
                  <button
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={isArchiving}
                    className="p-2 rounded-full text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                    title="Archive Trip (Soft Delete)"
                  >
                    {isArchiving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
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
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white dark:bg-slate-950 space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 animate-fadeIn">
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
                {formatRoomConfiguration(trip.room_type, t('trips.notSpecified') || 'Not specified')}
              </p>
              <p className="text-slate-500 text-sm">
                {trip.board_basis || t('trips.notSpecified') || 'Not specified'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <Users className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.travelers')}</span>
              </div>
              <p className="text-slate-900 font-medium dark:text-slate-100">{trip.travelers_count} {t('trips.people')}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <CreditCard className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.paymentStatus')}</span>
              </div>
              <p className="text-slate-900 font-medium dark:text-slate-100">{paymentStatusLabel}</p>
              <p className="text-slate-500 text-sm">{getPaymentStatusDescription(trip.payment_status, t)}</p>
            </div>
          </section>

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

          {trip.travelers && trip.travelers.length > 0 ? (
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
                    {trip.travelers.map((traveler, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/30">
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
          ) : (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('trips.travelerDetails')}</h3>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {t('trips.emptyStates.noTravelerDetailsInTrip') || 'No detailed traveler entries were added to this trip.'}
              </div>
            </section>
          )}

          {trip.itinerary && trip.itinerary.length > 0 ? (
            <section className="animate-fadeIn">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Calendar className="w-4 h-4 text-fuchsia-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.itinerary')}</h3>
              </div>
              <div className="relative border-l-2 border-slate-200 ml-4 space-y-8 py-2 dark:border-slate-800">
                {trip.itinerary.map((item, index) => (
                  <div key={index} className="relative pl-8">
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
          ) : (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('trips.itinerary')}</h3>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {t('trips.emptyStates.noItineraryInTrip') || 'No itinerary steps were added for this trip.'}
              </div>
            </section>
          )}

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
                    {trip.payments.map((payment, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/30">
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

          {trip.attachments && trip.attachments.length > 0 ? (
            <section className="animate-fadeIn">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Paperclip className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.attachments')}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trip.attachments.map((file, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => void handleOpenAttachment(file)}
                    className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-sky-500/30 hover:shadow-lg hover:shadow-sky-500/10 transition-all group dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                  >
                    <div className="p-2.5 rounded-lg bg-slate-200 group-hover:bg-sky-500/20 group-hover:text-sky-600 text-slate-500 transition-colors dark:bg-slate-800 dark:group-hover:text-sky-400 dark:text-slate-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-sky-600 dark:text-slate-200 dark:group-hover:text-sky-300">{file.file_name}</p>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">{file.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('trips.attachments')}</h3>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {t('trips.emptyStates.noAttachmentsInTrip') || 'No files were added to this trip yet.'}
              </div>
            </section>
          )}

          {trip.notes ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('trips.notesAndRequirements')}</h3>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-slate-600 text-sm whitespace-pre-wrap leading-relaxed dark:bg-amber-500/5 dark:border-amber-500/20 dark:text-slate-300">
                {trip.notes}
              </div>
            </section>
          ) : (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('trips.notesAndRequirements')}</h3>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {t('trips.emptyStates.noNotesInTrip') || 'No notes or extra trip requirements were added yet.'}
              </div>
            </section>
          )}
        </div>

        <div className="flex-none p-4 md:px-6 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-medium border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200"
          >
            {t('trips.close') || 'Close'}
          </button>
        </div>
      </div>
      <ConfirmationModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={() => void handleArchive()}
        title={t('trips.archiveTrip') || 'Archive trip?'}
        description={t('trips.archiveTripDescription') || 'This trip will be hidden from the main list, but kept in your records.'}
        confirmText={t('trips.archive') || 'Archive'}
        cancelText={t('trips.cancel') || 'Cancel'}
        variant="warning"
        isLoading={isArchiving}
      />
    </div>
  );
}
