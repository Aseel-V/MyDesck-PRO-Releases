import type { WhatsappLanguage, WhatsappMessageType } from './tripWhatsapp';

export interface TripWhatsappPreferences {
  language: WhatsappLanguage;
  greetingStyle: 'friendly' | 'formal';
  includeEmojis: boolean;
  includeSignature: boolean;
  businessDisplayName: string;
  businessContactNumber: string;
  closingText: string;
  rememberLastType: boolean;
  confirmBeforeOpen: boolean;
  lastMessageType: WhatsappMessageType;
}

const key = (userId: string) => `travel_whatsapp_preferences:${userId}`;

export function defaultTripWhatsappPreferences(language: WhatsappLanguage): TripWhatsappPreferences {
  return { language, greetingStyle: 'friendly', includeEmojis: true, includeSignature: true, businessDisplayName: '', businessContactNumber: '', closingText: '', rememberLastType: true, confirmBeforeOpen: true, lastMessageType: 'booking_confirmation' };
}

export function loadTripWhatsappPreferences(userId: string, language: WhatsappLanguage): TripWhatsappPreferences {
  const defaults = defaultTripWhatsappPreferences(language);
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) || '{}') as Partial<TripWhatsappPreferences>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveTripWhatsappPreferences(userId: string, preferences: TripWhatsappPreferences): void {
  localStorage.setItem(key(userId), JSON.stringify(preferences));
}
