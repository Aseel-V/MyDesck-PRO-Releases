import JSZip from 'jszip';
import type { Trip } from '../types/trip';
import { sanitizeFilename } from './utils';

export type TripExportColumn = 'destination' | 'client' | 'start' | 'end' | 'status' | 'paymentStatus' | 'currency' | 'salePrice' | 'amountPaid' | 'amountDue';
export type TripExportLabels = Record<TripExportColumn, string>;

const columns: TripExportColumn[] = ['destination', 'client', 'start', 'end', 'status', 'paymentStatus', 'currency', 'salePrice', 'amountPaid', 'amountDue'];

function cellValue(trip: Trip, column: TripExportColumn): string | number {
  const values: Record<TripExportColumn, string | number> = {
    destination: trip.destination,
    client: trip.client_name,
    start: trip.start_date,
    end: trip.end_date,
    status: trip.status,
    paymentStatus: trip.payment_status,
    currency: trip.currency,
    salePrice: trip.sale_price,
    amountPaid: trip.amount_paid,
    amountDue: trip.amount_due,
  };
  return values[column];
}

export function escapeCsvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function createTripCsv(trips: Trip[], labels: TripExportLabels): string {
  const lines = [columns.map((column) => escapeCsvCell(labels[column])).join(',')];
  trips.forEach((trip) => lines.push(columns.map((column) => escapeCsvCell(cellValue(trip, column))).join(',')));
  return `\uFEFF${lines.join('\r\n')}`;
}

function xml(value: string | number): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function createTripXlsx(trips: Trip[], labels: TripExportLabels): Promise<Blob> {
  const rows: Array<Array<string | number>> = [columns.map((column) => labels[column]), ...trips.map((trip) => columns.map((column) => cellValue(trip, column)))];
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
    return typeof value === 'number' ? `<c r="${reference}"><v>${value}</v></c>` : `<c r="${reference}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.folder('_rels')?.file('.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl')?.file('workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Trips" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, baseName: string, extension: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(baseName, 'trips_export')}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
