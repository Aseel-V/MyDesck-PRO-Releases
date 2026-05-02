import { Trip } from '../types/trip';
import { RestaurantOrder, RestaurantTable, DailyReport } from '../types/restaurant';
import { BusinessProfile } from './supabase';
import { formatRoomConfiguration } from './tripRoom';
import { formatCurrency, formatDate, getTextDirection } from '../utils/localeFormatting';
import { safeImageSrc } from './safeUrl';

type Language = 'en' | 'ar' | 'he';
type PdfMode = 'invoice' | 'summary' | 'receipt' | 'report';

interface PDFOptions {
  profile: BusinessProfile;
  trips: Trip[];
  userFullName: string;
  phoneNumber: string;
  language: Language;
  templateId?: 'modern' | 'classic';
}

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    destination: 'Destination',
    client: 'Client',
    dates: 'Dates',
    roomType: 'Room Type',
    boardBasis: 'Board Basis',
    travelers: 'Travelers',
    salePrice: 'Sale Price',
    paidAmount: 'Paid Amount',
    amountDue: 'Amount Due',
    paymentStatus: 'Payment Status',
    notes: 'Notes',
    signature: 'Digital Signature / Stamp',
    notSpecified: 'Not specified',
    tripSummary: 'Trip Summary',
    summaryTitle: 'Trips Summary',
    totalRevenue: 'Total Revenue',
    totalPaid: 'Total Paid',
    totalDue: 'Total Due',
    totalTrips: 'Total Trips',
    paid: 'Paid',
    partial: 'Partial',
    unpaid: 'Unpaid',
  },
  he: {
    destination: 'יעד',
    client: 'לקוח',
    dates: 'תאריכים',
    roomType: 'סוג חדר',
    boardBasis: 'פנסיון',
    travelers: 'נוסעים',
    salePrice: 'מחיר מכירה',
    paidAmount: 'שולם',
    amountDue: 'יתרה',
    paymentStatus: 'סטטוס תשלום',
    notes: 'הערות',
    signature: 'חתימה דיגיטלית / חותמת',
    notSpecified: 'לא צוין',
    tripSummary: 'חשבונית טיול',
    summaryTitle: 'סיכום טיולים',
    totalRevenue: 'סה"כ הכנסות',
    totalPaid: 'סה"כ שולם',
    totalDue: 'סה"כ יתרה',
    totalTrips: 'סה"כ טיולים',
    paid: 'שולם',
    partial: 'חלקי',
    unpaid: 'לא שולם',
  },
  ar: {
    destination: 'الوجهة',
    client: 'العميل',
    dates: 'التواريخ',
    roomType: 'نوع الغرفة',
    boardBasis: 'نوع الإقامة',
    travelers: 'المسافرون',
    salePrice: 'سعر البيع',
    paidAmount: 'المدفوع',
    amountDue: 'المتبقي',
    paymentStatus: 'حالة الدفع',
    notes: 'ملاحظات',
    signature: 'التوقيع الرقمي / الختم',
    notSpecified: 'غير محدد',
    tripSummary: 'ملخص الرحلة',
    summaryTitle: 'ملخص الرحلات',
    totalRevenue: 'إجمالي الإيراد',
    totalPaid: 'إجمالي المدفوع',
    totalDue: 'إجمالي المتبقي',
    totalTrips: 'إجمالي الرحلات',
    paid: 'مدفوع',
    partial: 'جزئي',
    unpaid: 'غير مدفوع',
  },
};

function getPaymentStatusLabel(status: Trip['payment_status'], language: Language): string {
  const labels = LABELS[language];
  switch (status) {
    case 'paid':
      return labels.paid;
    case 'partial':
      return labels.partial;
    default:
      return labels.unpaid;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function imageUrlToDataUrl(value: string | null | undefined): Promise<string | null> {
  const src = safeImageSrc(value);
  if (!src) return null;

  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function renderLogo(logoUrl: string | null): string {
  if (!logoUrl) {
    return `
      <div style="width:112px;height:112px;border-radius:24px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;letter-spacing:.04em;">
        MD
      </div>
    `;
  }

  return `
    <div style="width:136px;height:112px;border:1px solid #e2e8f0;border-radius:22px;background:#fff;display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;">
      <img src="${escapeHtml(logoUrl)}" crossorigin="anonymous" style="max-width:100%;max-height:100%;object-fit:contain;" />
    </div>
  `;
}

function renderMetric(label: string, value: unknown, accent = false): string {
  return `
    <div style="border:1px solid ${accent ? '#38bdf8' : '#e2e8f0'};background:${accent ? '#ecfeff' : '#f8fafc'};border-radius:14px;padding:15px;min-height:76px;box-sizing:border-box;">
      <div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:${accent ? '#0369a1' : '#64748b'};text-transform:uppercase;">${escapeHtml(label)}</div>
      <div style="margin-top:8px;font-size:${accent ? '18px' : '16px'};font-weight:900;color:#0f172a;line-height:1.45;">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderSignature(signatureUrl: string | null, label: string): string {
  const imageMarkup = signatureUrl
    ? `<img src="${escapeHtml(signatureUrl)}" crossorigin="anonymous" style="max-width:220px;max-height:86px;object-fit:contain;" />`
    : `<div style="width:220px;height:1px;background:#94a3b8;margin-top:58px;"></div>`;

  return `
    <section style="margin-top:28px;display:flex;justify-content:flex-end;">
      <div style="width:280px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:16px;box-sizing:border-box;text-align:center;">
        <div style="height:92px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;">
          ${imageMarkup}
        </div>
        <div style="margin-top:10px;font-size:12px;font-weight:900;color:#475569;">${escapeHtml(label)}</div>
      </div>
    </section>
  `;
}

function renderInvoiceHtml(options: PDFOptions, logoUrl: string | null, signatureUrl: string | null): string {
  const { profile, trips, userFullName, phoneNumber, language } = options;
  const trip = trips[0];
  const labels = LABELS[language];
  const dir = getTextDirection(language);
  const roomType = formatRoomConfiguration(trip.room_type, labels.notSpecified);
  const paidStatus = getPaymentStatusLabel(trip.payment_status, language);

  return `
    <div dir="${dir}" style="width:794px;background:#fff;color:#0f172a;font-family:Arial,'Rubik','Noto Sans Hebrew',sans-serif;padding:38px;box-sizing:border-box;">
      <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:32px;border-bottom:3px solid #0ea5e9;padding-bottom:24px;">
        <div style="flex:1;">
          <div style="display:inline-block;border-radius:999px;background:#e0f2fe;color:#0369a1;padding:7px 12px;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(labels.tripSummary)}</div>
          <h1 style="margin:14px 0 0;font-size:34px;font-weight:900;line-height:1.2;color:#0f172a;">${escapeHtml(trip.destination || labels.notSpecified)}</h1>
          <div style="margin-top:16px;font-size:14px;color:#475569;line-height:1.8;">
            <div>${escapeHtml(userFullName || profile.business_name || '')}</div>
            <div>${escapeHtml(profile.business_name || '')}</div>
            ${profile.address ? `<div>${escapeHtml(profile.address)}</div>` : ''}
            ${(phoneNumber || profile.phone_number) ? `<div>${escapeHtml(phoneNumber || profile.phone_number)}</div>` : ''}
            ${profile.business_registration_number ? `<div>${escapeHtml(profile.business_registration_number)}</div>` : ''}
          </div>
        </div>
        ${renderLogo(logoUrl)}
      </header>

      <section style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px;">
        ${renderMetric(labels.client, trip.client_name || labels.notSpecified)}
        ${renderMetric(labels.destination, trip.destination || labels.notSpecified)}
        ${renderMetric(labels.dates, `${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}`)}
        ${renderMetric(labels.travelers, trip.travelers_count || 0)}
        ${renderMetric(labels.roomType, roomType)}
        ${renderMetric(labels.boardBasis, trip.board_basis || labels.notSpecified)}
        ${renderMetric(labels.salePrice, formatCurrency(trip.sale_price || 0, trip.currency || 'USD', language), true)}
        ${renderMetric(labels.paidAmount, formatCurrency(trip.amount_paid || 0, trip.currency || 'USD', language))}
        ${renderMetric(labels.amountDue, formatCurrency(trip.amount_due || 0, trip.currency || 'USD', language), true)}
        ${renderMetric(labels.paymentStatus, paidStatus)}
      </section>

      ${trip.notes ? `
        <section style="margin-top:26px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:18px;">
          <div style="font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;">${escapeHtml(labels.notes)}</div>
          <div style="margin-top:10px;font-size:14px;color:#334155;line-height:1.8;white-space:pre-wrap;">${escapeHtml(trip.notes)}</div>
        </section>
      ` : ''}
      ${renderSignature(signatureUrl, labels.signature)}
      <footer style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:16px;color:#64748b;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <span>${escapeHtml(profile.business_name || 'MyDesck PRO')}</span>
        <span>MyDesck PRO</span>
      </footer>
    </div>
  `;
}

function renderSummaryHtml(options: PDFOptions, logoUrl: string | null, signatureUrl: string | null): string {
  const { profile, trips, userFullName, phoneNumber, language } = options;
  const labels = LABELS[language];
  const dir = getTextDirection(language);
  const summaryCurrency = trips[0]?.currency || profile.preferred_currency || 'USD';
  const totalRevenue = trips.reduce((sum, trip) => sum + (trip.sale_price || 0), 0);
  const totalPaid = trips.reduce((sum, trip) => sum + (trip.amount_paid || 0), 0);
  const totalDue = trips.reduce((sum, trip) => sum + (trip.amount_due || 0), 0);

  const rows = trips.map((trip) => `
    <tr>
      <td>${escapeHtml(trip.client_name || labels.notSpecified)}</td>
      <td>${escapeHtml(trip.destination || labels.notSpecified)}</td>
      <td>${escapeHtml(`${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}`)}</td>
      <td>${escapeHtml(formatCurrency(trip.sale_price || 0, trip.currency || summaryCurrency, language))}</td>
      <td>${escapeHtml(formatCurrency(trip.amount_paid || 0, trip.currency || summaryCurrency, language))}</td>
      <td>${escapeHtml(formatCurrency(trip.amount_due || 0, trip.currency || summaryCurrency, language))}</td>
      <td>${escapeHtml(getPaymentStatusLabel(trip.payment_status, language))}</td>
    </tr>
  `).join('');

  return `
    <div dir="${dir}" style="width:794px;background:#fff;color:#0f172a;font-family:Arial,'Rubik','Noto Sans Hebrew',sans-serif;padding:38px;box-sizing:border-box;">
      <header style="display:flex;align-items:flex-start;justify-content:space-between;gap:32px;border-bottom:3px solid #0ea5e9;padding-bottom:24px;">
        <div style="flex:1;">
          <div style="display:inline-block;border-radius:999px;background:#e0f2fe;color:#0369a1;padding:7px 12px;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(labels.summaryTitle)}</div>
          <h1 style="margin:14px 0 0;font-size:34px;font-weight:900;line-height:1.2;color:#0f172a;">${escapeHtml(profile.business_name || 'MyDesck PRO')}</h1>
          <div style="margin-top:16px;font-size:14px;color:#475569;line-height:1.8;">
            <div>${escapeHtml(userFullName || profile.business_name || '')}</div>
            ${(phoneNumber || profile.phone_number) ? `<div>${escapeHtml(phoneNumber || profile.phone_number)}</div>` : ''}
            ${profile.address ? `<div>${escapeHtml(profile.address)}</div>` : ''}
          </div>
        </div>
        ${renderLogo(logoUrl)}
      </header>

      <section style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px;">
        ${renderMetric(labels.totalTrips, trips.length)}
        ${renderMetric(labels.totalRevenue, formatCurrency(totalRevenue, summaryCurrency, language), true)}
        ${renderMetric(labels.totalPaid, formatCurrency(totalPaid, summaryCurrency, language))}
        ${renderMetric(labels.totalDue, formatCurrency(totalDue, summaryCurrency, language), true)}
      </section>

      <table style="width:100%;border-collapse:collapse;margin-top:28px;font-size:12px;">
        <thead>
          <tr style="background:#0e7490;color:#fff;">
            <th>${escapeHtml(labels.client)}</th>
            <th>${escapeHtml(labels.destination)}</th>
            <th>${escapeHtml(labels.dates)}</th>
            <th>${escapeHtml(labels.salePrice)}</th>
            <th>${escapeHtml(labels.paidAmount)}</th>
            <th>${escapeHtml(labels.amountDue)}</th>
            <th>${escapeHtml(labels.paymentStatus)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <style>
        th,td{border-bottom:1px solid #e2e8f0;padding:10px;text-align:start;vertical-align:top;}
        tbody tr:nth-child(even){background:#f8fafc;}
      </style>
      ${renderSignature(signatureUrl, labels.signature)}
      <footer style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:16px;color:#64748b;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <span>${escapeHtml(profile.business_name || 'MyDesck PRO')}</span>
        <span>MyDesck PRO</span>
      </footer>
    </div>
  `;
}

async function generateTripRasterPDF(mode: 'invoice' | 'summary', options: PDFOptions): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');
  const logoUrl = await imageUrlToDataUrl(options.profile.logo_url);
  const signatureUrl = await imageUrlToDataUrl(options.profile.signature_url);

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-10000px;top:0;background:#fff;';
  container.innerHTML = mode === 'summary'
    ? renderSummaryHtml(options, logoUrl, signatureUrl)
    : renderInvoiceHtml(options, logoUrl, signatureUrl);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL('image/png');
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    if (mode === 'invoice') {
      const fitScale = Math.min(1, pageHeight / imgHeight);
      const fittedWidth = pageWidth * fitScale;
      const fittedHeight = imgHeight * fitScale;
      const x = (pageWidth - fittedWidth) / 2;
      doc.addImage(imgData, 'PNG', x, 0, fittedWidth, fittedHeight);
      return new Uint8Array(doc.output('arraybuffer'));
    }

    let remainingHeight = imgHeight;
    let y = 0;
    doc.addImage(imgData, 'PNG', 0, y, pageWidth, imgHeight);
    remainingHeight -= pageHeight;

    while (remainingHeight > 2) {
      y -= pageHeight;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 0, y, pageWidth, imgHeight);
      remainingHeight -= pageHeight;
    }

    return new Uint8Array(doc.output('arraybuffer'));
  } finally {
    document.body.removeChild(container);
  }
}

async function generateTripFallbackPDF(mode: 'invoice' | 'summary', options: PDFOptions): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { trips, language } = options;
  const labels = LABELS[language];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isRtl = getTextDirection(language) === 'rtl';
  const startX = isRtl ? 196 : 14;

  const align = isRtl ? 'right' : 'left';
  doc.setFontSize(18);
  doc.text(mode === 'summary' ? labels.summaryTitle : labels.tripSummary, startX, 18, { align });

  if (mode === 'invoice') {
    const trip = trips[0];
    const roomType = formatRoomConfiguration(trip.room_type, labels.notSpecified);
    const rows = [
      [labels.client, trip.client_name || labels.notSpecified],
      [labels.destination, trip.destination || labels.notSpecified],
      [labels.dates, `${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}`],
      [labels.travelers, String(trip.travelers_count || 0)],
      [labels.roomType, roomType],
      [labels.boardBasis, trip.board_basis || labels.notSpecified],
      [labels.salePrice, formatCurrency(trip.sale_price || 0, trip.currency || 'USD', language)],
      [labels.paidAmount, formatCurrency(trip.amount_paid || 0, trip.currency || 'USD', language)],
      [labels.amountDue, formatCurrency(trip.amount_due || 0, trip.currency || 'USD', language)],
      [labels.paymentStatus, getPaymentStatusLabel(trip.payment_status, language)],
      [labels.notes, trip.notes || labels.notSpecified],
    ];

    autoTable(doc, {
      startY: 28,
      styles: { fontSize: 10, halign: isRtl ? 'right' : 'left' },
      headStyles: { fillColor: [14, 116, 144] },
      head: [['Field', 'Value']],
      body: rows,
    });
  } else {
    const summaryCurrency = trips[0]?.currency || options.profile.preferred_currency || 'USD';
    const totalRevenue = trips.reduce((sum, trip) => sum + (trip.sale_price || 0), 0);
    const totalPaid = trips.reduce((sum, trip) => sum + (trip.amount_paid || 0), 0);
    const totalDue = trips.reduce((sum, trip) => sum + (trip.amount_due || 0), 0);

    const summaryRows = [
      [labels.totalTrips, String(trips.length)],
      [labels.totalRevenue, formatCurrency(totalRevenue, summaryCurrency, language)],
      [labels.totalPaid, formatCurrency(totalPaid, summaryCurrency, language)],
      [labels.totalDue, formatCurrency(totalDue, summaryCurrency, language)],
    ];

    autoTable(doc, {
      startY: 28,
      styles: { fontSize: 10, halign: isRtl ? 'right' : 'left' },
      headStyles: { fillColor: [14, 116, 144] },
      head: [['Metric', 'Value']],
      body: summaryRows,
    });

    const detailRows = trips.map((trip) => [
      trip.client_name || labels.notSpecified,
      trip.destination || labels.notSpecified,
      `${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}`,
      formatCurrency(trip.sale_price || 0, trip.currency || summaryCurrency, language),
      formatCurrency(trip.amount_paid || 0, trip.currency || summaryCurrency, language),
      formatCurrency(trip.amount_due || 0, trip.currency || summaryCurrency, language),
      getPaymentStatusLabel(trip.payment_status, language),
    ]);

    autoTable(doc, {
      startY: 72,
      styles: { fontSize: 9, halign: isRtl ? 'right' : 'left' },
      headStyles: { fillColor: [51, 65, 85] },
      head: [[labels.client, labels.destination, labels.dates, labels.salePrice, labels.paidAmount, labels.amountDue, labels.paymentStatus]],
      body: detailRows,
    });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

async function generateBrowserPDF(payload: Record<string, unknown>): Promise<Uint8Array> {
  if ((payload.mode === 'invoice' || payload.mode === 'summary') && Array.isArray(payload.trips)) {
    try {
      return await generateTripRasterPDF(payload.mode, payload as unknown as PDFOptions & { mode: 'invoice' | 'summary' });
    } catch (error) {
      console.error('Raster PDF generation failed, using text fallback:', error);
      return generateTripFallbackPDF(payload.mode, payload as unknown as PDFOptions & { mode: 'invoice' | 'summary' });
    }
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('PDF Export', 14, 20);
  doc.setFontSize(10);
  doc.text('This export mode uses the browser fallback renderer.', 14, 30);
  return new Uint8Array(doc.output('arraybuffer'));
}

async function generatePDF(mode: PdfMode, options: Record<string, unknown>): Promise<Uint8Array> {
  const payload = {
    ...options,
    mode,
  };

  try {
    return await generateBrowserPDF(payload);
  } catch (error) {
    console.error('Error generating PDF:', error);
    return generateBrowserPDF(payload);
  }
}

export const generateSingleTripPDF = async (
  options: Omit<PDFOptions, 'trips'> & { trips: Trip[] }
): Promise<Uint8Array> => {
  return generatePDF('invoice', options as unknown as Record<string, unknown>);
};

export const generateTripInvoice = async (
  trip: Trip,
  profile: BusinessProfile,
  userFullName: string,
  phoneNumber: string,
  language: Language
): Promise<Uint8Array> => {
  return generateSingleTripPDF({
    profile,
    trips: [trip],
    userFullName,
    phoneNumber,
    language,
  });
};

export const generateMultipleTripsPDF = async (
  options: PDFOptions
): Promise<Uint8Array> => {
  return generatePDF('summary', options as unknown as Record<string, unknown>);
};

export const generateSummaryReport = async (
  trips: Trip[],
  profile: BusinessProfile,
  userFullName: string,
  phoneNumber: string,
  language: Language
): Promise<Uint8Array> => {
  return generateMultipleTripsPDF({
    profile,
    trips,
    userFullName,
    phoneNumber,
    language,
  });
};

export const generateReceiptPDF = async (
  order: RestaurantOrder,
  table: RestaurantTable,
  profile: BusinessProfile,
  userFullName: string
): Promise<Uint8Array> => {
  return generatePDF('receipt', {
    type: 'receipt',
    order,
    table,
    profile,
    userFullName,
  });
};

export const generateAccountantReportPDF = async (
  reports: DailyReport[],
  periodLabel: string,
  profile: BusinessProfile,
  userFullName: string
): Promise<Uint8Array> => {
  return generatePDF('report', {
    type: 'report',
    reports,
    periodLabel,
    profile,
    userFullName,
  });
};

