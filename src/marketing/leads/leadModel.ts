import type { MarketingLocale } from '../routes/routeModel';

export type LeadIntent = 'trial' | 'demo' | 'sales' | 'support';
export type LeadBusinessType = 'travel-agency' | 'supermarket' | 'restaurant' | 'auto-repair' | 'other';
export type LeadTeamSize = '1' | '2-5' | '6-20' | '21-50' | '51+';

export interface LeadSubmission {
  name: string;
  businessName: string;
  email: string;
  phone?: string;
  country: string;
  businessType: LeadBusinessType;
  teamSize: LeadTeamSize;
  intent: LeadIntent;
  message?: string;
  locale: MarketingLocale;
}

export type LeadField = keyof Omit<LeadSubmission, 'locale'>;
export type LeadValidationErrors = Partial<Record<LeadField, string>>;

export interface LeadSubmissionReceipt {
  delivery: 'mailto';
  stored: false;
  handedOff: boolean;
}

export interface LeadSubmissionAdapter {
  readonly kind: 'mailto';
  submit(lead: LeadSubmission): Promise<LeadSubmissionReceipt>;
}

export const leadIntents: readonly LeadIntent[] = ['trial', 'demo', 'sales', 'support'];
export const leadBusinessTypes: readonly LeadBusinessType[] = ['travel-agency', 'supermarket', 'restaurant', 'auto-repair', 'other'];
export const leadTeamSizes: readonly LeadTeamSize[] = ['1', '2-5', '6-20', '21-50', '51+'];
