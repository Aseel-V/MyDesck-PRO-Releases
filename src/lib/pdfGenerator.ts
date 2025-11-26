import { Trip } from '../types/trip';
import { BusinessProfile } from './supabase';

type Language = 'en' | 'ar' | 'he';

interface PDFOptions {
  profile: BusinessProfile;
  trips: Trip[]; // نستخدمه للفاتورة (رحلة واحدة) وللتقرير (عدة رحلات)
  userFullName: string;
  phoneNumber: string;
  language: Language;
}

type PdfMode = 'invoice' | 'summary';

// 🔹 دالة داخلية مشتركة بين الفاتورة والتقرير
const generatePDF = async (mode: PdfMode, options: PDFOptions): Promise<void> => {
  const { profile, trips, userFullName, phoneNumber, language } = options;

  if (!trips.length) {
    throw new Error('No trips provided for PDF generation.');
  }

  // الرحلة الأولى تستعمل للفواتير (Invoice)
  const firstTrip = trips[0];

  // تجهيز البيانات التي ستُرسل إلى Electron Main
  const payload = {
    mode,            // 'invoice' أو 'summary' – يمكنك استعمالها في الـ main لتبديل القالب
    language,
    userFullName,
    phoneNumber,
    trips,           // للتقرير (summary) أو إذا احتجت كل الرحلات
    trip: firstTrip, // للفاتورة (رحلة واحدة) – للحفاظ على التوافق مع القالب الحالي
    profile: {
      ...profile,
      // لو كان عندك email في الـ profile تقدر تستخدمه، وإلا يظل undefined
      email: (profile as any).email ?? undefined,
      phone_number: phoneNumber,
    },
  };

  try {
    const pdfBytes = await window.electronAPI.printToPDF(payload);

    // إنشاء Blob من البايتات
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);

    // اختيار اسم الملف حسب نوع التقرير
    const fileName =
      mode === 'invoice'
        ? `Invoice_${firstTrip.client_name}_${firstTrip.destination}.pdf`
        : `Trips_Summary_${(profile as any).business_name ?? 'Report'}.pdf`;

    // تفعيل التحميل
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
};

/**
 * 🔹 توليد فاتورة (Invoice) لرحلة واحدة
 */
export const generateTripInvoice = async (
  trip: Trip,
  profile: BusinessProfile,
  userFullName: string,
  phoneNumber: string,
  language: Language
): Promise<void> => {
  const options: PDFOptions = {
    profile,
    trips: [trip], // نضع الرحلة في Array حتى نستغل نفس الدالة المشتركة
    userFullName,
    phoneNumber,
    language,
  };

  return generatePDF('invoice', options);
};

/**
 * 🔹 توليد تقرير ملخّص لعدة رحلات (Summary Report)
 *  يمكنك لاحقاً في الـ Electron Main تمييزه بـ mode === 'summary'
 *  واستخدام قالب HTML مختلف.
 */
export const generateSummaryReport = async (
  trips: Trip[],
  profile: BusinessProfile,
  userFullName: string,
  phoneNumber: string,
  language: Language
): Promise<void> => {
  const options: PDFOptions = {
    profile,
    trips,
    userFullName,
    phoneNumber,
    language,
  };

  return generatePDF('summary', options);
};
