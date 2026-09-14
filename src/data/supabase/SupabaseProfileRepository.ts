import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type {
  BusinessProfile, OwnerRegistration, PreferredCurrency, PreferredLanguage, ProfileRepository, UserProfile,
} from '../domain/profiles';

/** Profile reads and writes, moved verbatim from AuthContext and Settings. */
export class SupabaseProfileRepository implements ProfileRepository {
  async fetchBusinessProfile(uid: string): Promise<BusinessProfile | null> {
    const { data, error } = await supabase.from('business_profiles').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return (data as BusinessProfile | null) ?? null;
  }

  async fetchUserProfile(uid: string): Promise<UserProfile | null> {
    const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return (data as UserProfile | null) ?? null;
  }

  async createOwnerProfiles(uid: string, email: string, registration: OwnerRegistration): Promise<void> {
    // The shipped flow does not check either insert's result; kept exactly as it was.
    await supabase.from('business_profiles').insert([{
      user_id: uid,
      business_name: registration.businessName,
      logo_url: registration.logoUrl,
      preferred_currency: registration.currency || 'USD',
      preferred_language: registration.language || 'en',
    }]);
    await supabase.from('user_profiles').insert([{
      user_id: uid,
      full_name: registration.businessName || email,
      role: 'user' as const,
      is_suspended: false,
    }]);
  }

  async updateBusinessProfile(uid: string, updates: Partial<BusinessProfile>): Promise<void> {
    const { error } = await supabase.from('business_profiles').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('user_id', uid);
    if (error) throw error;
  }

  async saveUserProfile(uid: string, fields: { full_name: string; phone_number: string }): Promise<void> {
    const { data: existingProfile, error: selectError } = await supabase
      .from('user_profiles').select('id').eq('user_id', uid).maybeSingle();
    if (selectError && (selectError as PostgrestError).code !== 'PGRST116') throw selectError;
    if (existingProfile) {
      const { error: updateError } = await supabase.from('user_profiles').update({
        full_name: fields.full_name,
        phone_number: fields.phone_number,
        updated_at: new Date().toISOString(),
      }).eq('user_id', uid);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from('user_profiles').insert([
        { user_id: uid, full_name: fields.full_name, phone_number: fields.phone_number },
      ]);
      if (insertError) throw insertError;
    }
  }

  async resetBranding(uid: string, currency: PreferredCurrency, language: PreferredLanguage): Promise<void> {
    const { error } = await supabase.from('business_profiles').update({
      business_name: 'MyDesck PRO',
      logo_url: null,
      preferred_currency: currency,
      preferred_language: language,
    }).eq('user_id', uid);
    if (error) throw error;
  }
}
