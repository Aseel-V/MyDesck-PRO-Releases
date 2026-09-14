/**
 * Business and user profile contract.
 *
 * Row shapes are the source table rows, so both composition roots hand the UI the same objects.
 */
import type { Database } from '../../types/database';

export type BusinessProfile = Database['public']['Tables']['business_profiles']['Row'];
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type PreferredCurrency = BusinessProfile['preferred_currency'];
export type PreferredLanguage = BusinessProfile['preferred_language'];

export interface OwnerRegistration {
  businessName: string;
  logoUrl: string | null;
  currency: PreferredCurrency;
  language: PreferredLanguage;
}

export interface ProfileRepository {
  /** The business the user owns, as the raw stored row (images are resolved by the caller). */
  fetchBusinessProfile(uid: string): Promise<BusinessProfile | null>;
  fetchUserProfile(uid: string): Promise<UserProfile | null>;
  /** Self-registration: the owner's business profile and user profile. */
  createOwnerProfiles(uid: string, email: string, registration: OwnerRegistration): Promise<void>;
  updateBusinessProfile(uid: string, updates: Partial<BusinessProfile>): Promise<void>;
  /** Settings "profile" tab: update the user profile, or create it when none exists. */
  saveUserProfile(uid: string, fields: { full_name: string; phone_number: string }): Promise<void>;
  /** Settings "reset branding". */
  resetBranding(uid: string, currency: PreferredCurrency, language: PreferredLanguage): Promise<void>;
}
