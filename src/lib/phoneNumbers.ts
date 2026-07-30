const INTERNATIONAL_PHONE = /^\+[1-9]\d{7,14}$/;
const ISRAELI_SUBSCRIBER = /^(?:5\d{8}|7[2-9]\d{7}|[23489]\d{7})$/;

const DIGIT_TRANSLATION: Record<string, string> = {
  '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
  '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',
  '\u06f0': '0', '\u06f1': '1', '\u06f2': '2', '\u06f3': '3', '\u06f4': '4',
  '\u06f5': '5', '\u06f6': '6', '\u06f7': '7', '\u06f8': '8', '\u06f9': '9',
};

function compactPhoneNumber(value: string): string | null {
  const translated = value.normalize('NFKC').trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => DIGIT_TRANSLATION[digit]);
  if (!translated || /[A-Za-z]/.test(translated)) return null;
  const compact = translated.replace(/[\s().\-./]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  return compact;
}

function normalizeIsraeliSubscriber(subscriber: string): string | null {
  return ISRAELI_SUBSCRIBER.test(subscriber) ? `+972${subscriber}` : null;
}

export function normalizeIsraeliPhoneNumber(value: string): string | null {
  const compact = compactPhoneNumber(value);
  if (!compact) return null;

  if (compact.startsWith('00972')) return normalizeIsraeliSubscriber(compact.slice(5));
  if (compact.startsWith('+972')) return normalizeIsraeliSubscriber(compact.slice(4));
  if (compact.startsWith('972')) return normalizeIsraeliSubscriber(compact.slice(3));
  if (compact.startsWith('00')) {
    const international = `+${compact.slice(2)}`;
    return INTERNATIONAL_PHONE.test(international) ? international : null;
  }
  if (compact.startsWith('0')) return normalizeIsraeliSubscriber(compact.slice(1));

  return INTERNATIONAL_PHONE.test(compact) ? compact : null;
}

export function isValidIsraeliPhoneNumber(value: string): boolean {
  const normalized = normalizeIsraeliPhoneNumber(value);
  return normalized !== null && normalized.startsWith('+972') && ISRAELI_SUBSCRIBER.test(normalized.slice(4));
}

export function formatIsraeliPhoneForDisplay(value: string): string {
  const normalized = normalizeIsraeliPhoneNumber(value);
  if (!normalized) return value.trim();
  if (/^\+9725\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 6)}-${normalized.slice(6, 9)}-${normalized.slice(9)}`;
  }
  if (/^\+972[23489]\d{7}$/.test(normalized)) {
    return `${normalized.slice(0, 4)} ${normalized.slice(4, 5)}-${normalized.slice(5, 8)}-${normalized.slice(8)}`;
  }
  return normalized;
}

export function getWhatsAppPhoneNumber(value: string): string | null {
  return normalizeIsraeliPhoneNumber(value);
}
