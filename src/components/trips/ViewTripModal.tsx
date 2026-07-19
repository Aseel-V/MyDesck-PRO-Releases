import { useState } from 'react';
import {
  X,
  Users,
  Calendar,
  CreditCard,
  FileText,
  Paperclip,
  DollarSign,
  Archive,
  Loader2,
  Phone,
  BedDouble,
  Plane,
  UserRound,
  Clock3,
  Copy,
  MessageCircle,
  BookTemplate,
  RotateCcw,
  Wand2,
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
import { StatusBadge } from '../travel-ui/StatusBadge';
import { Surface } from '../travel-ui/Surface';
import {
  getEffectivePaymentStatus,
  getPaymentStatusDescription,
  getPaymentStatusLabel,
  getTripStatusDescription,
  getTripStatusLabel,
} from '../../lib/tripStatus';
import { getTripDuration } from '../../lib/tripDates';
import { calculateTripFinancials } from '../../lib/tripFinancials';
import { getSafeErrorCode } from '../../lib/safeError';
import { TripHistoryPanel } from './TripHistoryPanel';
import { DuplicateTripDialog } from './DuplicateTripDialog';
import { TripWhatsappDialog } from './TripWhatsappDialog';
import { TripTemplatesPanel } from './TripTemplatesPanel';
import { TripPaymentPlanPanel } from './TripPaymentPlanPanel';
import { TripSmartToolsDialog } from './TripSmartToolsDialog';

interface ViewTripModalProps {
  trip: Trip;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ViewTripModal({ trip: initialTrip, onClose, onUpdate }: ViewTripModalProps) {
  const { t, direction } = useLanguage();
  const { format } = useCurrency();
  const [trip] = useState(initialTrip);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showWhatsapp, setShowWhatsapp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPaymentPlan, setShowPaymentPlan] = useState(false);
  const [showSmartTools, setShowSmartTools] = useState(false);
  const { archiveTrip, unarchiveTrip, isArchiving } = useTripMutations();

  const handleArchive = async () => {
    try {
      await archiveTrip(trip.id);
      setShowArchiveConfirm(false);
      onClose();
      onUpdate?.();
    } catch (error) {
      console.error('Trip archive failed:', getSafeErrorCode(error));
    }
  };

  const handleUnarchive = async () => {
    try {
      await unarchiveTrip(trip.id);
      onClose();
      onUpdate?.();
    } catch (error) {
      console.error('Trip unarchive failed:', getSafeErrorCode(error));
    }
  };

  const handleOpenAttachment = async (file: Trip['attachments'][number]) => {
    try {
      const url = await getTripAttachmentUrl(file);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Trip attachment open failed:', getSafeErrorCode(error));
      toast.error(t('trips.attachmentOpenError'));
    }
  };

  const financials = calculateTripFinancials(trip);
  const wholesale = financials.wholesaleCost;
  const sale = financials.salePrice;
  const paid = financials.amountPaid;
  const profitValue = financials.profit;
  const amountDue = financials.amountDue;
  const statusLabel = getTripStatusLabel(trip.status, t);
  const effectivePaymentStatus = getEffectivePaymentStatus(trip);
  const paymentStatusLabel = getPaymentStatusLabel(effectivePaymentStatus, t);
  const tripDuration = getTripDuration(trip.start_date, trip.end_date);
  const serviceType = trip.service_type || 'both';
  const serviceTypeLabel = t(`trips.serviceTypes.${serviceType}`);
  const ticketDetails = [
    [t('trips.journeyType'), trip.trip_type ? t(`trips.tripTypes.${trip.trip_type}`) : null],
    [t('trips.airline'), trip.airline_name],
    [t('trips.flightNumber'), trip.flight_number],
    [t('trips.bookingReference'), trip.booking_reference],
    [t('trips.departureAirport'), trip.departure_airport],
    [t('trips.arrivalAirport'), trip.arrival_airport],
    [t('trips.departureDateTime'), trip.departure_datetime ? formatDate(trip.departure_datetime) : null],
    [t('trips.arrivalDateTime'), trip.arrival_datetime ? formatDate(trip.arrival_datetime) : null],
    [t('trips.returnFlight'), trip.return_flight_number],
    [t('trips.returnDepartureAirport'), trip.return_departure_airport],
    [t('trips.returnArrivalAirport'), trip.return_arrival_airport],
    [t('trips.returnDepartureDateTime'), trip.return_departure_datetime ? formatDate(trip.return_departure_datetime) : null],
    [t('trips.returnArrivalDateTime'), trip.return_arrival_datetime ? formatDate(trip.return_arrival_datetime) : null],
    [t('trips.ticketClass'), trip.ticket_class ? t(`trips.ticketClasses.${trip.ticket_class}`) : null],
    [t('trips.ticketCost'), trip.ticket_cost_ils != null ? format(trip.ticket_cost_ils, 'ILS') : null],
    [t('trips.ticketNotes'), trip.ticket_notes],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-md animate-fadeIn sm:p-4" dir={direction}>
      <Surface className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl dark:shadow-[0_22px_65px_rgba(15,23,42,0.95)] sm:max-h-[92vh]">
        <div className="flex-none">
          <div className="h-[2px] bg-gradient-to-r from-sky-500/70 via-fuchsia-500/50 to-sky-400/70" />
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 border-b border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] uppercase tracking-[0.25em] text-sky-600/80 dark:text-sky-300/80">
                    {t('trips.viewTrip')}
                  </span>
                  <StatusBadge tone={trip.status === 'active' || trip.status === 'completed' ? 'success' : trip.status === 'cancelled' ? 'danger' : 'neutral'}>
                    {statusLabel}
                  </StatusBadge>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2 dark:text-slate-50">
                  <span className="break-words">{trip.destination}</span>
                  <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">—</span>
                  <span className="text-slate-500 font-medium break-words dark:text-slate-300">{trip.client_name}</span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {getTripStatusDescription(trip.status, t)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setShowTemplates(true)} className="p-2 rounded-full text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors" title={t('trips.templates.fromTrip')} aria-label={t('trips.templates.fromTrip')}><BookTemplate className="h-5 w-5"/></button>
                <button onClick={() => setShowPaymentPlan(true)} className="p-2 rounded-full text-slate-400 hover:bg-cyan-50 hover:text-cyan-600 transition-colors" title={t('trips.installments.title')} aria-label={t('trips.installments.title')}><CreditCard className="h-5 w-5"/></button>
                <button onClick={() => setShowSmartTools(true)} className="p-2 rounded-full text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" title={t('trips.smartTools.title')} aria-label={t('trips.smartTools.title')}><Wand2 className="h-5 w-5"/></button>
                <button onClick={() => setShowWhatsapp(true)} className="p-2 rounded-full text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" title={t('trips.whatsapp.title')} aria-label={t('trips.whatsapp.title')}><MessageCircle className="h-5 w-5"/></button>
                <button onClick={() => setShowDuplicate(true)} className="p-2 rounded-full text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition-colors" title={t('trips.duplicate.title')} aria-label={t('trips.duplicate.title')}><Copy className="h-5 w-5"/></button>
                {trip.status !== 'archived' && (
                  <button
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={isArchiving}
                    className="p-2 rounded-full text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                    title={t('trips.archiveTrip')}
                    aria-label={t('trips.archiveTrip')}
                  >
                    {isArchiving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Archive className="w-5 h-5" />}
                  </button>
                )}
                {trip.status === 'archived' && <button onClick={() => void handleUnarchive()} disabled={isArchiving} className="p-2 rounded-full text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" title={t('trips.unarchive')} aria-label={t('trips.unarchive')}>{isArchiving ? <Loader2 className="h-5 w-5 animate-spin"/> : <RotateCcw className="h-5 w-5"/>}</button>}
                <button
                  onClick={onClose}
                  aria-label={t('trips.close')}
                  className="p-2 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all dark:border-slate-700/80 dark:bg-slate-950/90 dark:hover:bg-slate-800/80 dark:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white dark:bg-slate-950 space-y-8">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 animate-fadeIn">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <UserRound className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.customerDetails')}</span>
              </div>
              <p className="text-slate-900 font-semibold dark:text-slate-100">{trip.client_name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                <Phone className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                <span dir="ltr">{trip.client_phone || t('trips.notSpecified')}</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <Calendar className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.tripDuration')}</span>
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
              </p>
              {tripDuration && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('trips.nightsCount', { count: tripDuration.nights })} · {t('trips.daysCount', { count: tripDuration.days })}</p>}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <BedDouble className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.accommodation')}</span>
              </div>
              <p className="text-slate-900 font-semibold dark:text-slate-100" dir="auto">{trip.hotel_name || t('trips.notSpecified')}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatRoomConfiguration(trip.room_type, t('trips.notSpecified'))} · {trip.board_basis || t('trips.notSpecified')}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-2 text-slate-500 dark:text-slate-400">
                <Plane className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{t('trips.serviceType')}</span>
              </div>
              <p className="text-slate-900 font-semibold dark:text-slate-100">{serviceTypeLabel}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{trip.travelers_count} {t('trips.people')}</p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2 animate-fadeIn">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-sky-500" aria-hidden="true" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.paymentDetails')}</h3>
              </div>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">{t('trips.paymentStatus')}</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{paymentStatusLabel}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('trips.paymentMethod')}</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{trip.payment_method ? t(`trips.paymentMethods.${trip.payment_method}`) : t('trips.notSpecified')}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('trips.paymentDate')}</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{trip.payment_date ? formatDate(trip.payment_date) : t('trips.notSpecified')}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('trips.amountPaid')}</dt><dd className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{format(paid, trip.currency)}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('trips.amountDue')}</dt><dd className="mt-1 font-semibold text-rose-600 dark:text-rose-400" dir="ltr">{format(amountDue, trip.currency)}</dd></div>
              </dl>
              <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{getPaymentStatusDescription(effectivePaymentStatus, t)}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-sky-500" aria-hidden="true" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.bookingDetails')}</h3>
              </div>
              {ticketDetails.length > 0 ? (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ticketDetails.map(([label, value]) => (
                    <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 truncate font-medium text-slate-900 dark:text-slate-100" dir="auto">{value}</dd></div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('trips.noBookingDetails')}</p>
              )}
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
                <table className="w-full text-start text-sm">
                  <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">{t('admin.table.fullName')}</th>
                      <th scope="col" className="px-4 py-3 font-medium">{t('trips.nationality')}</th>
                      <th scope="col" className="px-4 py-3 font-medium">{t('trips.roomType')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900/30">
                    {trip.travelers.map((traveler, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-900 font-medium dark:text-slate-200">{traveler.full_name}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{traveler.nationality || t('trips.notSpecified')}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{traveler.room_type || t('trips.notSpecified')}</td>
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
                {t('trips.emptyStates.noTravelerDetailsInTrip')}
              </div>
            </section>
          )}

          {trip.itinerary && trip.itinerary.length > 0 ? (
            <section className="animate-fadeIn">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Calendar className="w-4 h-4 text-fuchsia-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('trips.itinerary')}</h3>
              </div>
              <div className="relative ms-4 space-y-8 border-s-2 border-slate-200 py-2 dark:border-slate-800">
                {trip.itinerary.map((item, index) => (
                  <div key={index} className="relative ps-8">
                    <span className="absolute -start-[9px] top-0 h-4 w-4 rounded-full border-2 border-sky-500 bg-slate-50 dark:bg-slate-950" />
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
                {t('trips.emptyStates.noItineraryInTrip')}
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
                <table className="w-full text-start text-sm">
                  <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">{t('trips.date')}</th>
                      <th scope="col" className="px-4 py-3 font-medium">{t('trips.amount')}</th>
                      <th scope="col" className="px-4 py-3 font-medium">{t('trips.method')}</th>
                      <th scope="col" className="px-4 py-3 font-medium">{t('trips.receiptId')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900/30">
                    {trip.payments.map((payment, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDate(payment.date)}</td>
                        <td className="px-4 py-3 text-emerald-600 font-medium dark:text-emerald-400">{format(payment.amount, trip.currency)}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{t(`trips.paymentMethods.${payment.method}`)}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs dark:text-slate-500">{payment.receipt_id || t('trips.notSpecified')}</td>
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
                    aria-label={t('trips.openAttachment', { fileName: file.file_name })}
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
                {t('trips.emptyStates.noAttachmentsInTrip')}
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
                {t('trips.emptyStates.noNotesInTrip')}
              </div>
            </section>
          )}

          <TripHistoryPanel trip={trip} />
        </div>

        <div className="flex-none p-4 md:px-6 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-medium border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-200"
          >
            {t('trips.close')}
          </button>
        </div>
      </Surface>
      <ConfirmationModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={() => void handleArchive()}
        title={t('trips.archiveTrip')}
        description={t('trips.archiveTripDescription')}
        confirmText={t('trips.archive')}
        cancelText={t('trips.cancel')}
        variant="warning"
        isLoading={isArchiving}
      />
      {showDuplicate && <DuplicateTripDialog trip={trip} onClose={() => setShowDuplicate(false)} onCreated={onUpdate} />}
      {showWhatsapp && <TripWhatsappDialog trip={trip} onClose={() => setShowWhatsapp(false)} />}
      {showTemplates && <TripTemplatesPanel sourceTrip={trip} onClose={() => setShowTemplates(false)} />}
      {showPaymentPlan && <TripPaymentPlanPanel trip={trip} onClose={() => setShowPaymentPlan(false)} />}
      {showSmartTools && <TripSmartToolsDialog trip={trip} onClose={() => setShowSmartTools(false)} onUpdated={onUpdate} />}
    </div>
  );
}
