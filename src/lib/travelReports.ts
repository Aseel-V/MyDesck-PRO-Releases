import type { Trip } from '../types/trip';
import { escapeCsvCell } from './tripExport';
import JSZip from 'jszip';
import { supabase } from './supabase';

export interface CurrencyReport {
  currency: string; sales: number; cost: number; profit: number; paid: number; outstanding: number; tripCount: number;
}

export interface TravelReportPayload {
  monthly: Array<Record<string, string | number | null>>;
  destinations: Array<Record<string, string | number | null>>;
  repeat_clients: Array<Record<string, string | number | null>>;
  unpaid: Array<Record<string, string | number | null>>;
  currencies: Array<Record<string, string | number | null>>;
  markups: Array<Record<string, string | number | null>>;
}

export async function fetchTravelReports(input: { startDate: string; endDate: string; currency?: string; destination?: string; includeArchived?: boolean }): Promise<TravelReportPayload> {
  const { data, error } = await supabase.rpc('get_travel_reports', { p_start_date: input.startDate, p_end_date: input.endDate, p_currency: input.currency || null, p_destination: input.destination || null, p_include_archived: input.includeArchived || false });
  if (error) throw error;
  const payload = (data || {}) as unknown as Partial<TravelReportPayload>;
  return { monthly: payload.monthly || [], destinations: payload.destinations || [], repeat_clients: payload.repeat_clients || [], unpaid: payload.unpaid || [], currencies: payload.currencies || [], markups: payload.markups || [] };
}

export function aggregateSalesByCurrency(trips: Trip[]): CurrencyReport[] {
  const grouped = new Map<string, CurrencyReport>();
  trips.filter((trip) => trip.status !== 'cancelled' && trip.status !== 'archived').forEach((trip) => {
    const current = grouped.get(trip.currency) || { currency: trip.currency, sales: 0, cost: 0, profit: 0, paid: 0, outstanding: 0, tripCount: 0 };
    current.sales += trip.sale_price; current.cost += trip.wholesale_cost; current.profit += trip.profit;
    current.paid += trip.amount_paid; current.outstanding += trip.amount_due; current.tripCount += 1;
    grouped.set(trip.currency, current);
  });
  return [...grouped.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function createCurrencyReportCsv(rows: CurrencyReport[], labels: string[], generatedAt: string): string {
  const metadata = ['Generated at', generatedAt].map(escapeCsvCell).join(',');
  const body = rows.map((row) => [row.currency,row.sales,row.cost,row.profit,row.paid,row.outstanding,row.tripCount].map(escapeCsvCell).join(','));
  return `\uFEFF${metadata}\r\n${labels.map(escapeCsvCell).join(',')}\r\n${body.join('\r\n')}`;
}

export function createReportCsv(rows: Array<Record<string, unknown>>, headers: Array<{ key: string; label: string }>, generatedAt: string): string {
  const lines = [
    [escapeCsvCell('generated_at'), escapeCsvCell(generatedAt)].join(','),
    headers.map((header) => escapeCsvCell(header.label)).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(String(row[header.key] ?? ''))).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

function xml(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function createReportXlsx(rows: Array<Record<string, unknown>>, headers: Array<{ key: string; label: string }>): Promise<Blob> {
  const values = [headers.map((header) => header.label), ...rows.map((row) => headers.map((header) => row[header.key] ?? ''))];
  const sheetRows = values.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => { const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`; return typeof value === 'number' ? `<c r="${reference}"><v>${value}</v></c>` : `<c r="${reference}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`; }).join('')}</row>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.folder('_rels')?.file('.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl')?.file('workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml',`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
