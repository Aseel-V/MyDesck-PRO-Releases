import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { createReportCsv, createReportXlsx, fetchTravelReports, type TravelReportPayload } from '../../lib/travelReports';
import { downloadBlob } from '../../lib/tripExport';
import { fetchLatestTripForClient, fetchTripDetails } from '../../lib/tripQueries';
import type { WhatsappMessageType } from '../../lib/tripWhatsapp';
import type { Trip } from '../../types/trip';
import { Button } from '../travel-ui/Button';
import { TripWhatsappDialog } from '../trips/TripWhatsappDialog';

interface Props { year: string; destination?: string; currency?: string; onClose: () => void }
type ReportKey = keyof TravelReportPayload;

const columns: Record<ReportKey, string[]> = {
  monthly: ['month','currency','trip_count','sales','cost','profit','average_markup','paid','outstanding'],
  destinations: ['destination','currency','trip_count','sales','profit','average_markup','repeat_clients','outstanding'],
  repeat_clients: ['client_name','client_phone','currency','trip_count','last_trip_date','sales','outstanding','common_destination','average_trip_value'],
  unpaid: ['client_name','destination','start_date','currency','sale_price','amount_paid','amount_due','next_installment_date','next_installment_minor','overdue_minor','payment_method','payment_status'],
  currencies: ['currency','sales','cost','profit','paid','outstanding','trip_count'],
  markups: ['dimension','label','currency','average_markup','minimum_markup','maximum_markup','trip_count'],
};

export function TravelReportsPanel({ year, destination, currency, onClose }: Props) {
  const { t, direction, language } = useLanguage();
  const [tab, setTab] = useState<ReportKey>('monthly');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [whatsapp, setWhatsapp] = useState<{ trip: Trip; type: WhatsappMessageType } | null>(null);
  const [loadingWhatsapp, setLoadingWhatsapp] = useState<string | null>(null);
  const report = useQuery({ queryKey: ['travel-reports',year,destination,currency,includeArchived], queryFn: () => fetchTravelReports({ startDate: `${year}-01-01`, endDate: `${year}-12-31`, destination, currency, includeArchived }) });
  const headers = useMemo(() => columns[tab].map((key) => ({ key, label: t(`analytics.travelReports.columns.${key}`) })), [t, tab]);
  const rows = report.data?.[tab] || [];
  const supportsWhatsapp = tab === 'unpaid' || tab === 'repeat_clients';

  const exportReport = async (kind: 'csv' | 'xlsx') => {
    const generatedAt = new Date().toISOString();
    const name = `travel-report-${tab}-${year}-${language}`;
    if (kind === 'csv') downloadBlob(new Blob([createReportCsv(rows, headers, generatedAt)], { type: 'text/csv;charset=utf-8' }), name, 'csv');
    else downloadBlob(await createReportXlsx(rows, headers), name, 'xlsx');
  };

  const openWhatsapp = async (row: Record<string, unknown>, rowKey: string) => {
    setLoadingWhatsapp(rowKey);
    try {
      const trip = tab === 'unpaid'
        ? await fetchTripDetails(String(row.id))
        : await fetchLatestTripForClient(String(row.client_name || ''), row.client_phone ? String(row.client_phone) : undefined);
      setWhatsapp({ trip, type: tab === 'unpaid' ? 'cash_balance' : 'booking_confirmation' });
    } catch {
      toast.error(t('trips.loadDetailsError'));
    } finally {
      setLoadingWhatsapp(null);
    }
  };

  return <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/75 p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="travel-reports-title">
    <div className="mx-auto my-4 w-full max-w-7xl rounded-lg bg-white shadow-2xl dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800"><div><h2 id="travel-reports-title" className="text-lg font-bold">{t('analytics.travelReports.title')}</h2><p className="text-sm text-slate-500">{year}{destination ? ` · ${destination}` : ''}{currency ? ` · ${currency}` : ''}</p></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => void exportReport('csv')} aria-label={t('analytics.travelReports.csv')}><Download/></Button><Button size="icon" variant="ghost" onClick={() => void exportReport('xlsx')} aria-label={t('analytics.travelReports.xlsx')}><FileSpreadsheet/></Button><Button size="icon" variant="ghost" onClick={onClose} aria-label={t('trips.close')}><X/></Button></div></header>
      <nav className="flex overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800">{(Object.keys(columns) as ReportKey[]).map((key) => <Button key={key} variant={tab === key ? 'primary' : 'ghost'} onClick={() => setTab(key)}>{t(`analytics.travelReports.tabs.${key}`)}</Button>)}</nav>
      <div className="flex justify-end p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)}/>{t('analytics.travelReports.includeArchived')}</label></div>
      <main className="overflow-x-auto p-4">{report.isLoading ? <p className="p-8 text-center text-slate-500">{t('analytics.loading')}</p> : report.isError ? <p className="p-8 text-center text-rose-600">{t('analytics.travelReports.error')}</p> : !rows.length ? <p className="p-8 text-center text-slate-500">{t('analytics.travelReports.empty')}</p> : <table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b border-slate-200 dark:border-slate-700">{headers.map((header) => <th key={header.key} className="p-3 text-start font-semibold">{header.label}</th>)}{supportsWhatsapp && <th><span className="sr-only">{t('trips.card.prepareWhatsapp')}</span></th>}</tr></thead><tbody>{rows.map((row,index) => { const rowKey = `${tab}-${index}`; return <tr key={rowKey} className="border-b border-slate-100 dark:border-slate-800">{headers.map((header) => <td key={header.key} className="p-3 tabular-nums">{String(row[header.key] ?? '-')}</td>)}{supportsWhatsapp && <td className="p-2"><Button size="icon" variant="ghost" disabled={loadingWhatsapp === rowKey} onClick={() => void openWhatsapp(row, rowKey)} aria-label={t('trips.card.prepareWhatsapp')}>{loadingWhatsapp === rowKey ? <Loader2 className="h-4 w-4 animate-spin"/> : <MessageCircle className="h-4 w-4"/>}</Button></td>}</tr>; })}</tbody></table>}</main>
    </div>
    {whatsapp && <TripWhatsappDialog trip={whatsapp.trip} initialType={whatsapp.type} onClose={() => setWhatsapp(null)}/>}
  </div>;
}
