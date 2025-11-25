import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import ArabicReshaper from 'arabic-reshaper';
import { Trip } from '../types/trip';
import { BusinessProfile } from './supabase';
import LogoPng from '../../logo.png';

// ✅ LOCAL FONTS ONLY
import RubikLatinRegular from '../assets/fonts/rubik-latin-400-normal.ttf';
import RubikLatinBold from '../assets/fonts/rubik-latin-700-normal.ttf';
import RubikHebrewRegular from '../assets/fonts/rubik-hebrew-400-normal.ttf';
import RubikHebrewBold from '../assets/fonts/rubik-hebrew-700-normal.ttf';
import CairoArabicRegular from '../assets/fonts/cairo-arabic-400-normal.ttf';
import CairoArabicBold from '../assets/fonts/cairo-arabic-700-normal.ttf';

interface PDFOptions {
  profile: BusinessProfile;
  trips: Trip[];
  userFullName: string;
  phoneNumber: string;
  language: 'en' | 'ar' | 'he';
}

interface SummaryData {
  totalRevenue: number;
  totalProfit: number;
  overallProfitPercentage: number;
  totalUnpaid: number;
}

const getCurrencySymbol = (currency: string): string => {
  switch (currency) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'ILS':
      return '₪';
    default:
      return '$';
  }
};

// ✅ New, manual, stable date formatter (no toLocaleDateString quirks)
// ✅ Added LRM to force correct digit order in RTL (Hebrew/Arabic)
const formatDate = (dateString: string, language: string): string => {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  const day = date.getDate();
  const monthIndex = date.getMonth();
  const year = date.getFullYear();

  const heMonths = [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
  ];

  const arMonths = [
    'يناير',
    'فبراير',
    'مارس',
    'أבريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];

  // علامة اتجاه LTR غير مرئية
  const LRM = '\u200E';

  if (language === 'he') {
    const monthName = heMonths[monthIndex] ?? '';
    // مثال: ‎4 ינואר 2026‎ (محاط بـ LRM من الجهتين)
    return `${LRM}${day} ${monthName} ${year}${LRM}`;
  }

  if (language === 'ar') {
    const monthName = arMonths[monthIndex] ?? '';
    return `${LRM}${day} ${monthName} ${year}${LRM}`;
  }

  const dd = String(day).padStart(2, '0');
  const mm = String(monthIndex + 1).padStart(2, '0');
  return `${dd}/${mm}/${year}`; // 04/01/2026
};

/**
 * Processes text for PDF rendering in RTL/Bidi contexts.
 * - Arabic: shapes characters + reverses segments/characters for correct visual flow.
 * - Hebrew: returns text as-is (no reversing), relies on RTL alignment + Hebrew font.
 * - English/others: returns text as-is.
 */
const processBidiText = (text: string, language: string): string => {
  if (!text) return '';

  const isRTL = language === 'ar' || language === 'he';
  if (!isRTL) return text;

  // ---------- Arabic handling ----------
  if (language === 'ar') {
    // 1. Shape Arabic characters (connect letters)
    let processed = text;
    try {
      // @ts-ignore - ArabicReshaper types might be missing
      processed = ArabicReshaper.convert(text);
    } catch {
      processed = text;
    }

    // 2. Split into segments (Words/Numbers) by space
    const segments = processed.split(' ');

    // 3. Reverse the order of segments (Logical -> Visual for RTL line)
    const reversedSegments = segments.reverse();

    // 4. Process each segment
    return reversedSegments
      .map((seg) => {
        // Only reverse segments that actually contain Arabic characters
        const hasArabic =
          /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(seg);
        return hasArabic ? seg.split('').reverse().join('') : seg;
      })
      .join(' ');
  }

  // ---------- Hebrew handling ----------
  if (language === 'he') {
    // Reverse Hebrew string for visual LTR rendering in PDF
    // e.g. "שלום" -> "םולש"
    return text.split('').reverse().join('');
  }

  return text;
};

const drawText = (
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  options: {
    size?: number;
    font: any;
    color?: ReturnType<typeof rgb>;
    align?: 'left' | 'right' | 'center';
  }
) => {
  const size = options.size ?? 12;
  const safeText = text ?? '';

  const width = options.font?.widthOfTextAtSize
    ? options.font.widthOfTextAtSize(safeText, size)
    : 0;

  let xPos = x;
  if (options.align === 'right') {
    xPos = x - width;
  } else if (options.align === 'center') {
    xPos = x - width / 2;
  }

  page.drawText(safeText, {
    x: xPos,
    y,
    size,
    font: options.font,
    color: options.color ?? rgb(0, 0, 0),
  });
};

const drawLine = (
  page: PDFPage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color = rgb(0.8, 0.8, 0.8),
  thickness = 1
) => {
  page.drawLine({
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    thickness,
    color,
  });
};

const drawRectangle = (
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
    color?: ReturnType<typeof rgb>;
  } = {}
) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: options.borderColor ?? rgb(0.8, 0.8, 0.8),
    borderWidth: options.borderWidth ?? 1,
    color: options.color,
  });
};

const addTripPage = async (
  pdfDoc: PDFDocument,
  trip: Trip,
  profile: BusinessProfile,
  userFullName: string,
  phoneNumber: string,
  language: 'en' | 'ar' | 'he',
  font: any,
  boldFont: any
) => {
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  const currencySymbol = getCurrencySymbol(profile.preferred_currency);
  const isRTL = language === 'ar' || language === 'he';

  let yPosition = height - margin;

  // ==== HEADER ====
  const headerHeight = 120;
  drawRectangle(page, margin, yPosition - headerHeight, width - 2 * margin, headerHeight, {
    color: rgb(0.97, 0.98, 1),
    borderColor: rgb(0.22, 0.45, 0.9),
    borderWidth: 2,
  });

  // Accent line
  drawLine(
    page,
    margin + 12,
    yPosition - headerHeight + 14,
    width - margin - 12,
    yPosition - headerHeight + 14,
    rgb(0.22, 0.55, 0.95),
    3
  );

  // Logo Position
  const logoBoxWidth = 96;
  const logoBoxHeight = 96;
  const logoX = isRTL ? width - margin - logoBoxWidth - 16 : margin + 16;
  const logoY = yPosition - logoBoxHeight - 10;

  const tryEmbedImage = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('logo fetch failed');
    const bytes = await res.arrayBuffer();
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  };

  let logoImg: any | null = null;
  const logoUrl = profile.logo_url || (LogoPng as unknown as string);
  try {
    try {
      logoImg = await tryEmbedImage(logoUrl);
    } catch {
      const cleanUrl = logoUrl.split('?')[0];
      logoImg = await tryEmbedImage(cleanUrl);
    }
  } catch {
    try {
      logoImg = await tryEmbedImage(LogoPng as unknown as string);
    } catch {
      logoImg = null;
    }
  }

  if (logoImg) {
    const scale = Math.min(logoBoxWidth / logoImg.width, logoBoxHeight / logoImg.height);
    const drawW = Math.round(logoImg.width * scale);
    const drawH = Math.round(logoImg.height * scale);
    const drawX = logoX + Math.round((logoBoxWidth - drawW) / 2);
    const drawY = logoY + Math.round((logoBoxHeight - drawH) / 2);
    page.drawImage(logoImg, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  const hasLogo = !!logoImg;
  let headerTextX: number;

  if (isRTL) {
    if (hasLogo) {
      headerTextX = logoX - 20;
    } else {
      headerTextX = width - margin - 16;
    }
  } else {
    if (hasLogo) {
      headerTextX = logoX + logoBoxWidth + 20;
    } else {
      headerTextX = margin + 16;
    }
  }

  const businessNameStr = processBidiText(profile.business_name || 'Business Name', language);
  drawText(page, businessNameStr, headerTextX, yPosition - 30, {
    font: boldFont,
    size: 30,
    color: rgb(0.1, 0.2, 0.6),
    align: isRTL ? 'right' : 'left',
  });

  if (phoneNumber) {
    const phoneStr = processBidiText(phoneNumber, language);
    drawText(page, phoneStr, headerTextX, yPosition - 60, {
      font,
      size: 14,
      color: rgb(0.25, 0.25, 0.3),
      align: isRTL ? 'right' : 'left',
    });
  }

  yPosition -= headerHeight + 24;

  // ==== TITLE ====
  const titleRaw =
    language === 'he'
      ? 'חשבונית טיול'
      : language === 'ar'
        ? 'فاتورة الرحلة'
        : 'TRIP INVOICE';
  const title = processBidiText(titleRaw, language);

  drawText(
    page,
    title,
    isRTL ? width - margin : margin,
    yPosition,
    {
      font: boldFont,
      size: 20,
      color: rgb(0, 0, 0),
      align: isRTL ? 'right' : 'left',
    }
  );

  yPosition -= 32;

  const labels = {
    en: {
      destination: 'Destination',
      client: 'Client Name',
      travelers: 'Travelers',
      dates: 'Travel Dates',
      wholesale: 'Wholesale Cost',
      salePrice: 'Sale Price',
      profit: 'Profit',
      profitPercentage: 'Profit %',
      paymentStatus: 'Payment Status',
      amountPaid: 'Amount Paid',
      amountDue: 'Amount Due',
      notes: 'Notes',
      signedBy: 'Signed by',
      builtBy: 'Built by Aseel Shaheen',
    },
    ar: {
      destination: 'الوجهة',
      client: 'اسم العميل',
      travelers: 'المسافرون',
      dates: 'תاريخ السفر',
      wholesale: 'التكلفة الإجمالية',
      salePrice: 'سعر البيع',
      profit: 'الربح',
      profitPercentage: 'نسبة الربح',
      paymentStatus: 'حالة الدفع',
      amountPaid: 'المبلغ المدفوع',
      amountDue: 'المبلغ المستحق',
      notes: 'ملاحظات',
      signedBy: 'موقّع من',
      builtBy: 'بواسطة أسיל شاهין',
    },
    he: {
      destination: 'יעד',
      client: 'שם לקוח',
      travelers: 'מספר נוסעים',
      dates: 'תאריכי נסיעה',
      wholesale: 'עלות סיטונאית',
      salePrice: 'מחיר מכירה',
      profit: 'רווח',
      profitPercentage: 'אחוז רווח',
      paymentStatus: 'סטטוס תשלום',
      amountPaid: 'סכום ששולם',
      amountDue: 'סכום לתשלום',
      notes: 'הערות',
      signedBy: 'חתום על ידי',
      builtBy: 'נבנה על ידי אסיל שאהין',
    },
  } as const;

  const t = labels[language];

  const drawField = (
    label: string,
    value: string,
    bgColor?: ReturnType<typeof rgb>
  ) => {
    const boxHeight = 26;
    const fullWidth = width - 2 * margin;

    drawRectangle(page, margin, yPosition - boxHeight, fullWidth, boxHeight, {
      color: bgColor,
      borderColor: rgb(0.85, 0.85, 0.9),
      borderWidth: 1,
    });

    const textY = yPosition - 18;

    const safeLabel = processBidiText(label, language);
    const safeValue = processBidiText(value, language);

    if (isRTL) {
      const labelText = safeLabel + (language === 'ar' ? ':' : ':');
      const labelSize = 11;
      const valueSize = 11;

      const labelWidth = boldFont.widthOfTextAtSize(labelText, labelSize);
      const labelX = width - margin - 10;

      drawText(page, labelText, labelX, textY, {
        font: boldFont,
        size: labelSize,
        color: rgb(0.15, 0.15, 0.2),
        align: 'right',
      });

      const valueX = labelX - labelWidth - 10;

      drawText(page, safeValue, valueX, textY, {
        font,
        size: valueSize,
        color: rgb(0.1, 0.1, 0.1),
        align: 'right',
      });
    } else {
      const labelText = `${label}:`;
      drawText(page, labelText, margin + 10, textY, {
        font: boldFont,
        size: 11,
        color: rgb(0.15, 0.15, 0.2),
        align: 'left',
      });

      drawText(page, safeValue, width - margin - 10, textY, {
        font,
        size: 11,
        color: rgb(0.1, 0.1, 0.1),
        align: 'right',
      });
    }

    yPosition -= boxHeight;
  };

  // ==== BASIC INFO ====
  drawField(t.destination, trip.destination || '');
  drawField(t.client, trip.client_name || '');
  drawField(t.travelers, trip.travelers_count.toString());

  drawField(
    t.dates,
    `${formatDate(trip.start_date, language)} - ${formatDate(trip.end_date, language)}`
  );

  yPosition -= 10;

  drawLine(page, margin, yPosition, width - margin, yPosition, rgb(0.8, 0.8, 0.8), 0.7);
  yPosition -= 10;

  // ==== FINANCIAL INFO ====
  drawField(
    t.wholesale,
    `${currencySymbol}${trip.wholesale_cost.toFixed(2)}`
  );
  drawField(
    t.salePrice,
    `${currencySymbol}${trip.sale_price.toFixed(2)}`
  );
  drawField(
    t.profit,
    `${trip.profit >= 0 ? '+' : ''}${currencySymbol}${trip.profit.toFixed(2)}`,
    trip.profit >= 0 ? rgb(0.92, 1, 0.92) : rgb(1, 0.92, 0.92)
  );
  drawField(
    t.profitPercentage,
    `${trip.profit >= 0 ? '+' : ''}${trip.profit_percentage.toFixed(2)}%`,
    trip.profit >= 0 ? rgb(0.92, 1, 0.92) : rgb(1, 0.92, 0.92)
  );

  yPosition -= 10;

  const paymentStatuses = {
    paid:
      language === 'he'
        ? 'שולם'
        : language === 'ar'
          ? 'مدفוע'
          : 'Paid',
    partial:
      language === 'he'
        ? 'חלקי'
        : language === 'ar'
          ? 'דفع جزئي'
          : 'Partial',
    unpaid:
      language === 'he'
        ? 'לא שולם'
        : language === 'ar'
          ? 'غير مدفوع'
          : 'Unpaid',
  };

  drawField(
    t.paymentStatus,
    paymentStatuses[trip.payment_status as keyof typeof paymentStatuses]
  );
  drawField(
    t.amountPaid,
    `${currencySymbol}${trip.amount_paid.toFixed(2)}`
  );
  drawField(
    t.amountDue,
    `${currencySymbol}${trip.amount_due.toFixed(2)}`,
    trip.amount_due > 0 ? rgb(1, 0.95, 0.95) : rgb(0.95, 1, 0.95)
  );

  if (trip.notes) {
    yPosition -= 18;
    drawLine(page, margin, yPosition, width - margin, yPosition, rgb(0.8, 0.8, 0.8), 0.7);
    yPosition -= 26;

    drawText(
      page,
      processBidiText(t.notes, language),
      isRTL ? width - margin : margin,
      yPosition,
      {
        font: boldFont,
        size: 12,
        color: rgb(0.1, 0.1, 0.1),
        align: isRTL ? 'right' : 'left',
      }
    );

    yPosition -= 22;

    const noteLines = trip.notes.split('\n').slice(0, 6);
    noteLines.forEach((line) => {
      const truncated = line.length > 90 ? line.substring(0, 90) + '...' : line;
      drawText(
        page,
        processBidiText(truncated, language),
        isRTL ? width - margin : margin + 10,
        yPosition,
        {
          font,
          size: 10,
          color: rgb(0.3, 0.3, 0.3),
          align: isRTL ? 'right' : 'left',
        }
      );
      yPosition -= 14;
    });
  }

  // ==== FOOTER / SIGNATURE ====
  yPosition = 150;
  drawLine(page, margin, yPosition, width - margin, yPosition, rgb(0.5, 0.5, 0.5), 1);
  yPosition -= 24;

  const userStr = processBidiText(userFullName, language);
  const signedLabel = processBidiText(t.signedBy, language);
  const signedLine =
    userFullName && userFullName.trim().length > 0
      ? `${signedLabel}: ${userStr}`
      : signedLabel;

  drawText(
    page,
    signedLine,
    isRTL ? width - margin : margin,
    yPosition,
    {
      font,
      size: 11,
      color: rgb(0.2, 0.2, 0.2),
      align: isRTL ? 'right' : 'left',
    }
  );

  const builtByStr = processBidiText(t.builtBy, language);
  drawText(page, builtByStr, width / 2 + 80, 30, {
    font,
    size: 9,
    color: rgb(0.5, 0.5, 0.5),
    align: 'right',
  });
};

const addSummaryPage = async (
  pdfDoc: PDFDocument,
  summary: SummaryData,
  profile: BusinessProfile,
  language: 'en' | 'ar' | 'he',
  font: any,
  boldFont: any
) => {
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  const currencySymbol = getCurrencySymbol(profile.preferred_currency);
  const isRTL = language === 'ar' || language === 'he';

  let yPosition = height - margin;

  const labels = {
    en: {
      title: 'SUMMARY REPORT',
      totalRevenue: 'Total Revenue',
      totalProfit: 'Total Profit',
      profitPercentage: 'Overall Profit %',
      totalUnpaid: 'Total Unpaid',
      builtBy: 'Built by Aseel Shaheen',
    },
    ar: {
      title: 'تقرير ملخص',
      totalRevenue: 'إجمالي الإيرادات',
      totalProfit: 'إجمالي الربح',
      profitPercentage: 'نسبة الربح الإجمالية',
      totalUnpaid: 'إجمالي غير المدفوع',
      builtBy: 'بواسطة أسיל شاهין',
    },
    he: {
      title: 'דוח סיכום',
      totalRevenue: 'סך הכנסות',
      totalProfit: 'סך רווח',
      profitPercentage: 'אחוז רווח כולל',
      totalUnpaid: 'סך לא שולם',
      builtBy: 'נבנה על ידי אסיל שאהין',
    },
  } as const;

  const t = labels[language];

  drawRectangle(page, margin, yPosition - 60, width - 2 * margin, 60, {
    color: rgb(0.1, 0.2, 0.6),
  });

  const titleStr = processBidiText(t.title, language);
  drawText(page, titleStr, width / 2, yPosition - 35, {
    font: boldFont,
    size: 26,
    color: rgb(1, 1, 1),
    align: 'center',
  });

  yPosition -= 110;

  const cardWidth = (width - 2 * margin - 30) / 2;
  const cardHeight = 80;
  const rowGap = 30;
  const colGap = 30;

  const summaryCards: {
    label: string;
    value: string;
    bg: ReturnType<typeof rgb>;
  }[] = [
      {
        label: t.totalRevenue,
        value: `${currencySymbol}${summary.totalRevenue.toFixed(2)}`,
        bg: rgb(0.9, 0.95, 1),
      },
      {
        label: t.totalProfit,
        value: `${currencySymbol}${summary.totalProfit.toFixed(2)}`,
        bg: rgb(0.9, 1, 0.9),
      },
      {
        label: t.profitPercentage,
        value: `${summary.overallProfitPercentage.toFixed(2)}%`,
        bg: rgb(1, 0.98, 0.9),
      },
      {
        label: t.totalUnpaid,
        value: `${currencySymbol}${summary.totalUnpaid.toFixed(2)}`,
        bg: rgb(1, 0.95, 0.95),
      },
    ];

  summaryCards.forEach((card, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;

    const x = margin + col * (cardWidth + colGap);
    const y = yPosition - row * (cardHeight + rowGap) - cardHeight;

    drawRectangle(page, x, y, cardWidth, cardHeight, {
      color: card.bg,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 2,
    });

    const labelX = isRTL ? x + cardWidth - 15 : x + 15;
    const valueX = labelX;
    const safeLabel = processBidiText(card.label, language);
    const safeValue = processBidiText(card.value, language);

    drawText(page, safeLabel, labelX, y + cardHeight - 26, {
      font: boldFont,
      size: 12,
      color: rgb(0.3, 0.3, 0.3),
      align: isRTL ? 'right' : 'left',
    });

    drawText(page, safeValue, valueX, y + 18, {
      font: boldFont,
      size: 20,
      color: rgb(0.1, 0.1, 0.1),
      align: isRTL ? 'right' : 'left',
    });
  });

  const builtByStr = processBidiText(t.builtBy, language);
  drawText(page, builtByStr, width / 2 + 80, 30, {
    font,
    size: 9,
    color: rgb(0.5, 0.5, 0.5),
    align: 'right',
  });
};

// 🔠 load fonts from local TTF assets
async function fetchFontAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (!url) throw new Error('Font URL is empty');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} - ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error('Font file is empty');
  }
  return buffer;
}

async function loadLanguageFonts(language: 'en' | 'ar' | 'he') {
  try {
    let regularUrl: string;
    let boldUrl: string;

    if (language === 'ar') {
      regularUrl = CairoArabicRegular as string;
      boldUrl = CairoArabicBold as string;
    } else if (language === 'he') {
      regularUrl = RubikHebrewRegular as string;
      boldUrl = RubikHebrewBold as string;
    } else {
      regularUrl = RubikLatinRegular as string;
      boldUrl = RubikLatinBold as string;
    }

    const [regularBytes, boldBytes] = await Promise.all([
      fetchFontAsArrayBuffer(regularUrl),
      fetchFontAsArrayBuffer(boldUrl),
    ]);

    return { regularBytes, boldBytes };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error loading fonts';
    console.error('Error in loadLanguageFonts:', error);
    throw new Error(`Failed to load fonts: ${msg}`);
  }
}

export const generateSingleTripPDF = async (
  options: PDFOptions
): Promise<Uint8Array> => {
  const { profile, trips, userFullName, phoneNumber, language } = options;

  if (trips.length === 0) {
    throw new Error('No trips provided');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const { regularBytes, boldBytes } = await loadLanguageFonts(language);
  const font = await pdfDoc.embedFont(regularBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

  const effectiveName = userFullName || profile.business_name || '';
  const effectivePhone = phoneNumber || '';

  await addTripPage(
    pdfDoc,
    trips[0],
    profile,
    effectiveName,
    effectivePhone,
    language,
    font,
    boldFont
  );

  return await pdfDoc.save();
};

export const generateMultipleTripsPDF = async (
  options: PDFOptions
): Promise<Uint8Array> => {
  const { profile, trips, userFullName, phoneNumber, language } = options;

  if (trips.length === 0) {
    throw new Error('No trips provided');
  }

  if (trips.length === 1) {
    return generateSingleTripPDF(options);
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const { regularBytes, boldBytes } = await loadLanguageFonts(language);
  const font = await pdfDoc.embedFont(regularBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

  const summary: SummaryData = {
    totalRevenue: trips.reduce((sum, trip) => sum + trip.sale_price, 0),
    totalProfit: trips.reduce((sum, trip) => sum + trip.profit, 0),
    overallProfitPercentage: 0,
    totalUnpaid: trips.reduce((sum, trip) => sum + trip.amount_due, 0),
  };

  const totalWholesale = trips.reduce(
    (sum, trip) => sum + trip.wholesale_cost,
    0
  );

  summary.overallProfitPercentage =
    totalWholesale > 0 ? (summary.totalProfit / totalWholesale) * 100 : 0;

  await addSummaryPage(pdfDoc, summary, profile, language, font, boldFont);

  const effectiveName = userFullName || profile.business_name || '';
  const effectivePhone = phoneNumber || '';

  for (const trip of trips) {
    await addTripPage(
      pdfDoc,
      trip,
      profile,
      effectiveName,
      effectivePhone,
      language,
      font,
      boldFont
    );
  }

  return await pdfDoc.save();
};
