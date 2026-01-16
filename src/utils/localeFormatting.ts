// ============================================================================
// LOCALE FORMATTING UTILITIES - Number, Currency, Date for EN/AR/HE
// Version: 1.0.0 | Multi-language formatting helpers
// ============================================================================

type SupportedLanguage = 'en' | 'ar' | 'he';

const LOCALE_MAP: Record<SupportedLanguage, string> = {
  en: 'en-US',
  ar: 'ar-EG',
  he: 'he-IL',
};

const CURRENCY_CODES: Record<string, string> = {
  USD: 'USD',
  EUR: 'EUR',
  ILS: 'ILS',
  JOD: 'JOD',
  SAR: 'SAR',
  AED: 'AED',
};

/**
 * Get the Intl locale string for a supported language
 */
export function getLocale(language: string): string {
  return LOCALE_MAP[language as SupportedLanguage] || LOCALE_MAP.en;
}

/**
 * Format a number according to the current language locale
 */
export function formatNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions
): string {
  const locale = getLocale(language);
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format a currency amount according to the locale
 */
export function formatCurrency(
  amount: number,
  currency: string,
  language: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const locale = getLocale(language);
  const currencyCode = CURRENCY_CODES[currency] || currency;
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/**
 * Format a date according to the locale
 */
export function formatDate(
  date: Date | string,
  language: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const locale = getLocale(language);
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(dateObj);
}

/**
 * Format time according to the locale
 */
export function formatTime(
  time: string | Date,
  language: string,
  use24Hour: boolean = true
): string {
  const locale = getLocale(language);
  
  let dateObj: Date;
  if (typeof time === 'string') {
    // Handle HH:MM format
    if (/^\d{2}:\d{2}$/.test(time)) {
      const [hours, minutes] = time.split(':').map(Number);
      dateObj = new Date();
      dateObj.setHours(hours, minutes, 0, 0);
    } else {
      dateObj = new Date(time);
    }
  } else {
    dateObj = time;
  }
  
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24Hour,
  }).format(dateObj);
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date | string,
  language: string
): string {
  const locale = getLocale(language);
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  
  if (Math.abs(diffDays) >= 1) {
    return rtf.format(diffDays, 'day');
  } else if (Math.abs(diffHours) >= 1) {
    return rtf.format(diffHours, 'hour');
  } else if (Math.abs(diffMinutes) >= 1) {
    return rtf.format(diffMinutes, 'minute');
  } else {
    return rtf.format(diffSeconds, 'second');
  }
}

/**
 * Format a phone number for display (basic formatting)
 * Note: For production, consider using libphonenumber-js
 */
export function formatPhoneDisplay(phone: string, _language: string): string {
  // Remove non-numeric characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it's an Israeli number
  if (cleaned.startsWith('+972') || cleaned.startsWith('972')) {
    const local = cleaned.replace(/^\+?972/, '0');
    // Format as 0XX-XXX-XXXX
    if (local.length === 10) {
      return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
    }
  }
  
  return phone; // Return original if no formatting applied
}

/**
 * Get text direction for a language
 */
export function getTextDirection(language: string): 'ltr' | 'rtl' {
  return language === 'ar' || language === 'he' ? 'rtl' : 'ltr';
}

/**
 * Check if a language is RTL
 */
export function isRTL(language: string): boolean {
  return language === 'ar' || language === 'he';
}

export default {
  getLocale,
  formatNumber,
  formatCurrency,
  formatDate,
  formatTime,
  formatRelativeTime,
  formatPhoneDisplay,
  getTextDirection,
  isRTL,
};
