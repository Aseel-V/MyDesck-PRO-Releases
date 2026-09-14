import { supabase } from '../../lib/supabase';
import type { AdminCreateUserPayload, AdminRepository, AdminUserUpdate } from '../domain/admin';
import type { BusinessProfile, UserProfile } from '../domain/profiles';
import type { Database } from '../../types/database';

type BusinessUpdate = Database['public']['Tables']['business_profiles']['Update'];

/** Admin dashboard data access, moved verbatim from the admin components. */
export class SupabaseAdminRepository implements AdminRepository {
  async listUserProfiles(): Promise<UserProfile[]> {
    const { data, error } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as UserProfile[];
  }

  async listBusinessProfiles(): Promise<BusinessProfile[]> {
    const { data, error } = await supabase.from('business_profiles').select('*');
    if (error) throw error;
    return (data ?? []) as BusinessProfile[];
  }

  async updateUserAdminFields(targetUserId: string, update: AdminUserUpdate): Promise<void> {
    const { error: businessError } = await supabase.from('business_profiles').update({
      business_type: update.businessType as BusinessUpdate['business_type'],
      trial_start_date: update.trialStartDate,
      subscription_status: update.subscriptionStatus as BusinessUpdate['subscription_status'],
      is_suspended: update.isSuspended,
    }).eq('user_id', targetUserId);
    if (businessError) throw businessError;
    const { error: profileError } = await supabase.from('user_profiles').update({
      is_suspended: update.isSuspended,
    }).eq('user_id', targetUserId);
    if (profileError) throw profileError;
  }

  async createUser(payload: AdminCreateUserPayload): Promise<{ userId: string; businessId: string | null }> {
    const { data, error } = await supabase.functions.invoke('create-user', { body: payload });
    if (error) {
      let errorMessage = error.message || 'Unknown error';
      if ('context' in error && error.context) {
        try {
          const response = error.context as Response;
          if (typeof response.text === 'function' && !response.bodyUsed) {
            const rawText = await response.text();
            try {
              const json = JSON.parse(rawText);
              if (json.error) errorMessage = json.error;
              else if (json.message) errorMessage = json.message;
            } catch {
              if (rawText && rawText.length < 500) errorMessage = rawText;
            }
          } else if (typeof response.json === 'function' && !response.bodyUsed) {
            const json = await response.json();
            if (json.error) errorMessage = json.error;
          }
        } catch (parseError) {
          console.warn('Could not parse error body:', parseError);
        }
      }
      if (errorMessage === 'Unknown error' || errorMessage === 'Edge Function returned a non-2xx status code') {
        const details = error as unknown as { details?: string; hint?: string };
        if (details.details) errorMessage = details.details;
        else if (details.hint) errorMessage = details.hint;
      }
      throw new Error(errorMessage);
    }
    if (data?.error) throw new Error(data.error);
    return { userId: data?.user?.id ?? '', businessId: data?.businessId ?? null };
  }
}
