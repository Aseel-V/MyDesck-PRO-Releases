import { Trip } from '../types/trip';
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

type PdfMode = 'invoice' | 'summary';

const generateQRCode = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, { width: 100, margin: 1 });
  } catch (err) {
    console.error(err);
    return '';
  }
};

const generatePDF = async (mode: PdfMode, options: PDFOptions): Promise<Uint8Array> => {
  const { profile, trips, userFullName, phoneNumber, language, templateId = 'modern' } = options;

  if (!trips.length) {
    throw new Error('No trips provided for PDF generation.');
  }

  const firstTrip = trips[0];

  // Generate QR Code for the first trip (Invoice ID + Amount)
  const qrData = `INV-${firstTrip.id.slice(0, 8)}\nAmount: ${firstTrip.sale_price} ${firstTrip.currency}`;
  const qrCodeDataUrl = await generateQRCode(qrData);

  const payload = {
    mode,
    language,
    userFullName,
    phoneNumber,
    trips,
    trip: firstTrip,
    templateId,
    qrCode: qrCodeDataUrl,
    profile: {
      ...profile,
      email: (profile as any).email ?? undefined,
      phone_number: phoneNumber,
    },
  };

  try {
    const pdfBytes = await window.electronAPI.printToPDF(payload);
    return pdfBytes;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF. Please try again.');
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

