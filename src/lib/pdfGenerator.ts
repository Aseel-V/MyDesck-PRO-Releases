import { Trip } from '../types/trip';
import { RestaurantOrder, RestaurantTable, DailyReport } from '../types/restaurant';
import { BusinessProfile } from './supabase';
import QRCode from 'qrcode';

type Language = 'en' | 'ar' | 'he';

interface PDFOptions {
  profile: BusinessProfile;
  trips: Trip[];
  userFullName: string;
  phoneNumber: string;
  language: Language;
  templateId?: 'modern' | 'classic';
}

type PdfMode = 'invoice' | 'summary' | 'receipt' | 'report';

const generateQRCode = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, { width: 100, margin: 1 });
  } catch (err) {
    console.error(err);
    return '';
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateBrowserPDF = async (payload: any): Promise<Uint8Array> => {
  console.warn('Using browser fallback for PDF generation');
  const { jsPDF } = await import('jspdf');
  
  // Try to render the invoice template to PDF using html2canvas-like approach
  try {
    // Create a temporary container to render the invoice
    const container = document.createElement('div');
    container.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 210mm; background: white;';
    document.body.appendChild(container);
    
    // Import html2canvas dynamically
    const html2canvas = (await import('html2canvas')).default;
    
    // Build the invoice HTML matching InvoiceLayout design
    const trip = payload.trip || (payload.trips && payload.trips[0]);
    const profile = payload.profile || {};
    const userFullName = payload.userFullName || '';
    const currencySymbol = profile.preferred_currency === 'ILS' ? '₪' : 
        profile.preferred_currency === 'EUR' ? '€' : '$';
    
    container.innerHTML = `
      <div style="background: white; color: black; padding: 40px; font-family: Arial, sans-serif; direction: rtl;">
        <!-- Header -->
        <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px;">
            ${profile.logo_url ? `<img src="${profile.logo_url}" alt="Logo" style="height: 80px; object-fit: contain;">` : ''}
            <div style="flex: 1; display: flex; justify-content: center;">
              <h1 style="font-size: 28px; font-weight: 800; color: #0f172a; border-bottom: 4px solid #2563eb; padding-bottom: 4px; padding-left: 16px; padding-right: 16px;">קבלה</h1>
            </div>
            <div style="width: 80px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 32px;">
            <div style="flex: 1;">
              <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 4px;">${userFullName}</h2>
              <p style="font-size: 14px; color: #475569;">תיירות ונופש עראבה מיקוד 3081200</p>
              <p style="font-size: 14px; color: #475569;">טל. ${profile.phone_number || ''}</p>
              ${profile.business_registration_number ? `<p style="font-size: 14px; color: #64748b; margin-top: 4px;">ע.מ. ${profile.business_registration_number}</p>` : ''}
            </div>
            <div style="text-align: left;">
              <div style="margin-bottom: 12px;">
                <p style="font-size: 12px; color: #64748b;">מספר מסמך</p>
                <p style="font-size: 18px; font-family: monospace; font-weight: bold; color: #334155;">#${trip?.id?.slice(0, 8).toUpperCase() || 'N/A'}</p>
              </div>
              <div>
                <p style="font-size: 12px; color: #64748b;">תאריך</p>
                <p style="font-size: 18px; font-weight: bold; color: #334155;">${new Date().toLocaleDateString('he-IL')}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Client Info -->
        <div style="margin-bottom: 32px; background: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #f1f5f9;">
          <h3 style="font-size: 16px; font-weight: bold; color: #1e293b; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
            <span style="width: 4px; height: 20px; background: #2563eb; border-radius: 999px;"></span>
            פרטי הלקוח
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <p style="font-size: 12px; font-weight: 600; color: #2563eb; margin-bottom: 4px;">שם הלקוח</p>
              <p style="font-size: 18px; font-weight: bold; color: #1e293b;">${trip?.client_name || ''}</p>
            </div>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <p style="font-size: 12px; font-weight: 600; color: #2563eb; margin-bottom: 4px;">יעד</p>
              <p style="font-size: 18px; font-weight: bold; color: #1e293b;">${trip?.destination || ''}</p>
            </div>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <p style="font-size: 12px; font-weight: 600; color: #2563eb; margin-bottom: 4px;">תאריכים</p>
              <p style="font-size: 16px; font-weight: bold; color: #334155;">${trip?.start_date ? new Date(trip.start_date).toLocaleDateString('he-IL') : ''} - ${trip?.end_date ? new Date(trip.end_date).toLocaleDateString('he-IL') : ''}</p>
            </div>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <p style="font-size: 12px; font-weight: 600; color: #2563eb; margin-bottom: 4px;">פרטי אירוח</p>
              <div style="font-size: 16px; font-weight: bold; color: #334155;">
                <p>${trip?.room_type || 'לא צוין'}</p>
                ${trip?.board_basis ? `<p style="color: #475569;">${trip.board_basis}</p>` : ''}
                <p style="color: #2563eb;">${trip?.travelers_count || 0} נוסעים</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Financials -->
        <div style="margin-bottom: 24px;">
          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background: #f8fafc; padding: 12px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between;">
              <span style="font-weight: bold; font-size: 16px; color: #334155;">תיאור</span>
              <span style="font-weight: bold; font-size: 16px; color: #334155;">סכום</span>
            </div>
            <div style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <p style="font-size: 18px; font-weight: bold; color: #1e293b;">חבילת נופש - ${trip?.destination || ''}</p>
                ${trip?.notes ? `<p style="color: #64748b; margin-top: 8px; font-size: 14px;">${trip.notes}</p>` : ''}
              </div>
              <span style="font-size: 18px; font-weight: bold; color: #1e293b;">${currencySymbol}${trip?.sale_price?.toLocaleString() || 0}</span>
            </div>
            <div style="background: #2563eb; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: bold; font-size: 18px; color: white;">סה"כ לתשלום</span>
              <span style="font-weight: 800; font-size: 24px; color: white;">${currencySymbol}${trip?.sale_price?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>

        <!-- Thank You -->
        <div style="text-align: center; padding: 16px 0; margin-bottom: 16px;">
          <p style="font-size: 18px; font-weight: bold; color: #334155;">תודה רבה על בחירתכם בנו! ❤️</p>
          <p style="font-size: 14px; color: #64748b; margin-top: 4px;">מאחלים לכם חופשה מהנה ונעימה</p>
        </div>

        <!-- Signature -->
        <div style="padding-top: 32px;">
          <div style="text-align: center; width: 180px; margin-right: auto;">
            <div style="display: flex; justify-content: center; align-items: flex-end; height: 64px; margin-bottom: 8px;">
              ${profile.signature_url ? `<img src="${profile.signature_url}" alt="Signature" style="height: 64px; object-fit: contain;">` : ''}
            </div>
            <div style="border-top: 2px solid #cbd5e1; padding-top: 8px;">
              <p style="font-weight: bold; color: #334155; font-size: 14px;">חתימה דיגיטלית / חותמת</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #f1f5f9; text-align: center;">
          <p style="font-size: 14px; font-weight: bold; color: #2563eb; margin-bottom: 4px;">MyDesck PRO</p>
          <p style="font-size: 12px; color: #94a3b8;">Advanced Travel Agency Management System</p>
          <p style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">Developed with ❤️ by Aseel Shaheen</p>
        </div>
      </div>
    `;
    
    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Capture as canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });
    
    // Remove container
    document.body.removeChild(container);
    
    // Create PDF from canvas
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    
    doc.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pdfHeight));

    return new Uint8Array(doc.output('arraybuffer'));
  } catch (error) {
    console.error('HTML to PDF failed, using fallback:', error);
    
    // Simple fallback
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Invoice', 14, 20);
    doc.setFontSize(12);
    
    if (payload.trips && Array.isArray(payload.trips)) {
      const { default: autoTable } = await import('jspdf-autotable');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableData = payload.trips.map((t: any) => [
        t.destination || '',
        t.client_name || '',
        t.sale_price || 0,
        t.currency || 'USD'
      ]);
      
      autoTable(doc, {
        startY: 30,
        head: [['Destination', 'Client', 'Price', 'Currency']],
        body: tableData,
      });
    }
    
    return new Uint8Array(doc.output('arraybuffer'));
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generatePDF = async (mode: PdfMode, options: any): Promise<Uint8Array> => {
  // If we are dealing with Trip PDF options (which matched the User's provided content)
  // We handle the payload construction here to match their design.
  // BUT we must support the other modes (Receipt/Report) which might pass 'options' differently.
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any = {};

  if (mode === 'invoice' || mode === 'summary') {
      const { profile, trips, userFullName, phoneNumber, language, templateId = 'modern' } = options as PDFOptions;

      if (!trips || !trips.length) {
        throw new Error('No trips provided for PDF generation.');
      }

      const firstTrip = trips[0];
      const isRTL = language === 'ar' || language === 'he';

      // Generate QR for the first trip or summary
      // For summary, we might want a different QR, using firstTrip for now as per user logic
      const qrData = `INV-${firstTrip.id.slice(0, 8)}\nAmount: ${firstTrip.sale_price} ${firstTrip.currency}`;
      const qrCodeDataUrl = await generateQRCode(qrData);

      payload = {
        mode,
        language,
        dir: isRTL ? 'rtl' : 'ltr',
        userFullName,
        phoneNumber,
        trips,
        trip: firstTrip,
        templateId,
        qrCode: qrCodeDataUrl,
        profile: {
          ...profile,
          email: (profile as Record<string, unknown>).email ?? undefined,
          phone_number: phoneNumber,
        },
      };
  } else {
      // For receipt/report, usage in code might pass the payload directly or distinct options.
      // Current usage in this file creates a direct payload for 'receipt' and 'report' modes
      // see verify below.
      // Actually, looking at previous code, `generateReceiptPDF` constructed the payload itself.
      // So if called via `generatePDF('receipt', payload)`, `options` IS the payload.
      payload = options;
  }

  try {
    if (window.electronAPI) {
        const pdfBytes = await window.electronAPI.printToPDF(payload);
        if (pdfBytes) return pdfBytes;
    }
    return await generateBrowserPDF(payload);
  } catch (error) {
    console.error('Error generating PDF:', error);
    try {
        return await generateBrowserPDF(payload);
    } catch {
        throw new Error('Failed to generate PDF. Please try again.');
    }
  }
};

export const generateSingleTripPDF = async (
  options: Omit<PDFOptions, 'trips'> & { trips: Trip[] }
): Promise<Uint8Array> => {
  return generatePDF('invoice', options);
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
    language
  });
};

export const generateMultipleTripsPDF = async (
  options: PDFOptions
): Promise<Uint8Array> => {
  return generatePDF('summary', options);
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
    language
  });
};

// --- Restaurant Methods ---

export const generateReceiptPDF = async (
  order: RestaurantOrder,
  table: RestaurantTable,
  profile: BusinessProfile,
  userFullName: string
): Promise<Uint8Array> => {
  const payload = {
    type: 'receipt',
    order,
    table,
    profile: {
        ...profile,
        email: (profile as Record<string, unknown>).email ?? undefined,
        phone_number: profile.phone_number || '',
    },
    userFullName
  };

  return generatePDF('receipt', payload);
};

export const generateAccountantReportPDF = async (
    reports: DailyReport[],
    periodLabel: string,
    profile: BusinessProfile,
    userFullName: string
): Promise<Uint8Array> => {
    const payload = {
        type: 'report', // Matches 'mode' in generic handler if we aligned it, but electron expects type/mode
        reports,
        periodLabel,
        profile: {
            ...profile,
            email: (profile as Record<string, unknown>).email ?? undefined,
            phone_number: profile.phone_number || '',
        },
        userFullName
    };

    return generatePDF('report', payload);
};
