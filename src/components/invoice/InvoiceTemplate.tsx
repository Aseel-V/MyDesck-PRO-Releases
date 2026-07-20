import { useEffect, useMemo, useState } from 'react';
import { Trip } from '../../types/trip';
import { BusinessProfile } from '../../lib/supabase';
import { formatRoomConfiguration } from '../../lib/tripRoom';
import { formatCurrency, formatDate, getTextDirection } from '../../utils/localeFormatting';

type Language = 'en' | 'ar' | 'he';
type PdfMode = 'invoice' | 'summary';

interface ExtendedProfile extends BusinessProfile {
  email?: string;
}

interface InvoicePayload {
  mode?: PdfMode;
  language?: Language;
  dir?: 'ltr' | 'rtl';
  trip?: Trip;
  trips?: Trip[];
  profile: ExtendedProfile;
  userFullName?: string;
  phoneNumber?: string;
}

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    titleInvoice: 'Trip Invoice',
    titleSummary: 'Trips Summary',
    businessDetails: 'Business Details',
    client: 'Client',
    destination: 'Destination',
    dates: 'Dates',
    travelers: 'Travelers',
    roomType: 'Room Type',
    boardBasis: 'Board Basis',
    salePrice: 'Sale Price',
    paidAmount: 'Paid Amount',
    amountDue: 'Amount Due',
    paymentStatus: 'Payment Status',
    notes: 'Notes',
    tripId: 'Trip ID',
    generatedAt: 'Generated At',
    paymentPaid: 'Paid',
    paymentPartial: 'Partial',
    paymentUnpaid: 'Unpaid',
    notSpecified: 'Not specified',
    totalTrips: 'Total Trips',
    totalRevenue: 'Total Revenue',
    totalPaid: 'Total Paid',
    totalDue: 'Total Due',
    tripPeriod: 'Trip Period',
  },
  he: {
    titleInvoice: 'חשבונית טיול',
    titleSummary: 'סיכום טיולים',
    businessDetails: 'פרטי העסק',
    client: 'לקוח',
    destination: 'יעד',
    dates: 'תאריכים',
    travelers: 'נוסעים',
    roomType: 'סוג חדר',
    boardBasis: 'פנסיון',
    salePrice: 'מחיר מכירה',
    paidAmount: 'שולם',
    amountDue: 'יתרה',
    paymentStatus: 'סטטוס תשלום',
    notes: 'הערות',
    tripId: 'מספר טיול',
    generatedAt: 'הופק בתאריך',
    paymentPaid: 'שולם',
    paymentPartial: 'חלקי',
    paymentUnpaid: 'לא שולם',
    notSpecified: 'לא צוין',
    totalTrips: 'סה״כ טיולים',
    totalRevenue: 'סה״כ הכנסות',
    totalPaid: 'סה״כ שולם',
    totalDue: 'סה״כ יתרה',
    tripPeriod: 'תקופת הטיול',
  },
  ar: {
    titleInvoice: 'فاتورة رحلة',
    titleSummary: 'ملخص الرحلات',
    businessDetails: 'بيانات النشاط',
    client: 'العميل',
    destination: 'الوجهة',
    dates: 'التواريخ',
    travelers: 'المسافرون',
    roomType: 'نوع الغرفة',
    boardBasis: 'نوع الإقامة',
    salePrice: 'سعر البيع',
    paidAmount: 'المدفوع',
    amountDue: 'المتبقي',
    paymentStatus: 'حالة الدفع',
    notes: 'ملاحظات',
    tripId: 'رقم الرحلة',
    generatedAt: 'تاريخ الإصدار',
    paymentPaid: 'مدفوع',
    paymentPartial: 'جزئي',
    paymentUnpaid: 'غير مدفوع',
    notSpecified: 'غير محدد',
    totalTrips: 'إجمالي الرحلات',
    totalRevenue: 'إجمالي الإيراد',
    totalPaid: 'إجمالي المدفوع',
    totalDue: 'إجمالي المتبقي',
    tripPeriod: 'مدة الرحلة',
  },
};

function getPaymentStatusLabel(status: Trip['payment_status'], labels: Record<string, string>): string {
  switch (status) {
    case 'paid':
      return labels.paymentPaid;
    case 'partial':
      return labels.paymentPartial;
    default:
      return labels.paymentUnpaid;
  }
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function TripDetailGrid({
  trip,
  language,
  labels,
}: {
  trip: Trip;
  language: Language;
  labels: Record<string, string>;
}) {
  const roomTypeLabel = formatRoomConfiguration(trip.room_type, labels.notSpecified);

  return (
    <div className="grid grid-cols-2 gap-4">
      <MetricCard label={labels.client} value={trip.client_name || labels.notSpecified} />
      <MetricCard label={labels.destination} value={trip.destination || labels.notSpecified} />
      <MetricCard
        label={labels.dates}
        value={`${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}`}
      />
      <MetricCard label={labels.travelers} value={trip.travelers_count || 0} />
      <MetricCard label={labels.roomType} value={roomTypeLabel} />
      <MetricCard label={labels.boardBasis} value={trip.board_basis || labels.notSpecified} />
      <MetricCard label={labels.salePrice} value={formatCurrency(trip.sale_price || 0, trip.currency || 'USD', language)} />
      <MetricCard label={labels.paidAmount} value={formatCurrency(trip.amount_paid || 0, trip.currency || 'USD', language)} />
      <MetricCard label={labels.amountDue} value={formatCurrency(trip.amount_due || 0, trip.currency || 'USD', language)} />
      <MetricCard label={labels.paymentStatus} value={getPaymentStatusLabel(trip.payment_status, labels)} />
    </div>
  );
}

function InvoiceLayout({
  trip,
  profile,
  userFullName,
  phoneNumber,
  language,
}: {
  trip: Trip;
  profile: ExtendedProfile;
  userFullName: string;
  phoneNumber: string;
  language: Language;
}) {
  const labels = LABELS[language];

  return (
    <div className="bg-white p-10 text-slate-900">
      <header className="flex items-start justify-between gap-8 border-b border-slate-200 pb-6">
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">{labels.titleInvoice}</div>
          <h1 className="mt-2 text-3xl font-black">{trip.destination}</h1>
          <div className="mt-4 text-sm text-slate-600 space-y-1">
            <div>{userFullName || profile.business_name}</div>
            <div>{profile.business_name}</div>
            {profile.address && <div>{profile.address}</div>}
            {(phoneNumber || profile.phone_number) && <div>{phoneNumber || profile.phone_number}</div>}
            {profile.business_registration_number && <div>{profile.business_registration_number}</div>}
          </div>
        </div>
        {profile.logo_url && (
          <img src={profile.logo_url} alt="Logo" className="max-h-24 max-w-[180px] object-contain" />
        )}
      </header>

      <section className="mt-6 grid grid-cols-2 gap-4">
        <MetricCard label={labels.tripId} value={trip.id.slice(0, 8).toUpperCase()} />
        <MetricCard label={labels.generatedAt} value={formatDate(new Date(), language)} />
      </section>

      <section className="mt-8">
        <TripDetailGrid trip={trip} language={language} labels={labels} />
      </section>

      {trip.notes && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{labels.notes}</div>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{trip.notes}</div>
        </section>
      )}
    </div>
  );
}

function SummaryLayout({
  trips,
  profile,
  userFullName,
  phoneNumber,
  language,
}: {
  trips: Trip[];
  profile: ExtendedProfile;
  userFullName: string;
  phoneNumber: string;
  language: Language;
}) {
  const labels = LABELS[language];
  const totalRevenue = trips.reduce((sum, trip) => sum + (trip.sale_price || 0), 0);
  const totalPaid = trips.reduce((sum, trip) => sum + (trip.amount_paid || 0), 0);
  const totalDue = trips.reduce((sum, trip) => sum + (trip.amount_due || 0), 0);
  const summaryCurrency = trips[0]?.currency || profile.preferred_currency || 'USD';

  return (
    <div className="bg-white p-10 text-slate-900">
      <header className="flex items-start justify-between gap-8 border-b border-slate-200 pb-6">
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600">{labels.titleSummary}</div>
          <h1 className="mt-2 text-3xl font-black">{profile.business_name}</h1>
          <div className="mt-4 text-sm text-slate-600 space-y-1">
            <div>{userFullName || profile.business_name}</div>
            {(phoneNumber || profile.phone_number) && <div>{phoneNumber || profile.phone_number}</div>}
            {profile.address && <div>{profile.address}</div>}
          </div>
        </div>
        {profile.logo_url && (
          <img src={profile.logo_url} alt="Logo" className="max-h-24 max-w-[180px] object-contain" />
        )}
      </header>

      <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label={labels.totalTrips} value={trips.length} />
        <MetricCard label={labels.totalRevenue} value={formatCurrency(totalRevenue, summaryCurrency, language)} />
        <MetricCard label={labels.totalPaid} value={formatCurrency(totalPaid, summaryCurrency, language)} />
        <MetricCard label={labels.totalDue} value={formatCurrency(totalDue, summaryCurrency, language)} />
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.client}</th>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.destination}</th>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.tripPeriod}</th>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.salePrice}</th>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.paidAmount}</th>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.amountDue}</th>
              <th className="border-b border-slate-200 px-4 py-3 text-start font-semibold text-slate-600">{labels.paymentStatus}</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id} className="align-top odd:bg-white even:bg-slate-50/30">
                <td className="border-b border-slate-100 px-4 py-3">{trip.client_name}</td>
                <td className="border-b border-slate-100 px-4 py-3">{trip.destination}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  {formatDate(trip.start_date, language)} - {formatDate(trip.end_date, language)}
                </td>
                <td className="border-b border-slate-100 px-4 py-3">{formatCurrency(trip.sale_price || 0, trip.currency || summaryCurrency, language)}</td>
                <td className="border-b border-slate-100 px-4 py-3">{formatCurrency(trip.amount_paid || 0, trip.currency || summaryCurrency, language)}</td>
                <td className="border-b border-slate-100 px-4 py-3">{formatCurrency(trip.amount_due || 0, trip.currency || summaryCurrency, language)}</td>
                <td className="border-b border-slate-100 px-4 py-3">{getPaymentStatusLabel(trip.payment_status, labels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function InvoiceTemplateView({ payload }: { payload: InvoicePayload }) {
  const language = payload.language || 'en';
  const dir = payload.dir || getTextDirection(language);
  const trips = payload.trips && payload.trips.length > 0 ? payload.trips : payload.trip ? [payload.trip] : [];
  const trip = payload.trip || trips[0];

  if (!payload.profile || !trip) {
    return <div className="min-h-screen bg-white p-10 text-slate-900">Unable to load trip PDF data.</div>;
  }

  return (
    <div className="min-h-screen bg-white" dir={dir}>
      {payload.mode === 'summary' ? (
        <SummaryLayout
          trips={trips}
          profile={payload.profile}
          userFullName={payload.userFullName || ''}
          phoneNumber={payload.phoneNumber || ''}
          language={language}
        />
      ) : (
        <InvoiceLayout
          trip={trip}
          profile={payload.profile}
          userFullName={payload.userFullName || ''}
          phoneNumber={payload.phoneNumber || ''}
          language={language}
        />
      )}
    </div>
  );
}

export default function InvoiceTemplate() {
  const [payload, setPayload] = useState<InvoicePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleInvoiceData = (data: unknown) => {
      try {
        const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as InvoicePayload;
        setPayload(parsed);
      } catch (error) {
        console.error('Failed to parse invoice data:', error);
      } finally {
        setLoading(false);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const dataStr = params.get('data');

    if (dataStr) {
      try {
        setPayload(JSON.parse(decodeURIComponent(dataStr)) as InvoicePayload);
      } catch (error) {
        console.error('Failed to parse invoice query payload:', error);
      }
      setLoading(false);
    } else if (window.electronAPI?.onInvoiceData) {
      window.electronAPI.onInvoiceData(handleInvoiceData);
    } else {
      setLoading(false);
    }

    return () => {
      window.electronAPI?.removeInvoiceDataListeners?.();
    };
  }, []);

  const isReady = useMemo(() => !loading && !!payload?.profile && (!!payload?.trip || !!payload?.trips?.length), [loading, payload]);

  useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => {
        window.electronAPI?.invoiceReady?.();
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600" />
      </div>
    );
  }

  if (!payload?.profile || (!payload.trip && !payload.trips?.length)) {
    return <div className="min-h-screen bg-white p-10 text-slate-900">Error loading invoice data.</div>;
  }

  return <InvoiceTemplateView payload={payload} />;
}
