import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { getFriendlyAuthError } from '../../lib/authNetwork';
import { AuthSessionResetError, type AppUser, type AuthGateway, type StaffSignIn } from '../domain/auth';
import type { BusinessProfile } from '../domain/profiles';

const toAppUser = (user: User): AppUser => ({ id: user.id, email: user.email ?? null, created_at: user.created_at });

/**
 * Supabase Auth, moved verbatim from AuthContext. This is the shipped product's identity until
 * cutover; the Firebase root never imports this module.
 */
export class SupabaseAuthGateway implements AuthGateway {
  readonly provider = 'supabase' as const;
  private uid: string | null = null;

  constructor() {
    void supabase.auth.getSession().then(({ data }) => { this.uid = data.session?.user?.id ?? null; });
    supabase.auth.onAuthStateChange((_event, session) => { this.uid = session?.user?.id ?? null; });
  }

  currentUid() { return this.uid; }

  async getSessionUser(): Promise<AppUser | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      this.uid = session?.user?.id ?? null;
      return session?.user ? toAppUser(session.user) : null;
    } catch (err: unknown) {
      const e = err as { message?: string; error_description?: string };
      const errorMessage = e?.message || e?.error_description || JSON.stringify(e);
      if (errorMessage.includes('Invalid Refresh Token') || errorMessage.includes('Refresh Token Not Found')
        || errorMessage.includes('not found')) {
        console.warn('[Auth] Critical session error detected, wiping storage and resetting...');
        await supabase.auth.signOut().catch(() => console.warn('SignOut failed during recovery'));
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('sb-') || key.startsWith('supabase.')) localStorage.removeItem(key);
        });
        this.uid = null;
        throw new AuthSessionResetError();
      }
      throw err;
    }
  }

  onAuthStateChange(listener: (user: AppUser | null) => void): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      this.uid = session?.user?.id ?? null;
      listener(session?.user ? toAppUser(session.user) : null);
    });
    return () => subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('[Auth] Primary sign-in failed:', { message: error.message, status: 'status' in error ? error.status : undefined });
      const friendly = new Error(getFriendlyAuthError(error)) as Error & { status?: number };
      friendly.status = 'status' in error ? (error as { status?: number }).status : undefined;
      throw friendly;
    }
    this.uid = data.user.id;
    return toAppUser(data.user);
  }

  async signUp(email: string, password: string): Promise<AppUser> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('SIGN_UP_RETURNED_NO_USER');
    return toAppUser(data.user);
  }

  async signInStaff(email: string, password: string): Promise<StaffSignIn> {
    const { data, error } = await supabase.rpc('authenticate_staff', { p_email: email, p_password: password });
    if (error) {
      console.warn('[Auth] Staff sign-in RPC failed:', { message: error.message, status: 'status' in error ? error.status : undefined });
      throw new Error(getFriendlyAuthError(error));
    }
    const result = data as unknown as { success: boolean; error?: string; staff: StaffSignIn['staff']; business_profile: BusinessProfile | null };
    if (!result.success) throw new Error(result.error || 'Login failed');
    return { staff: result.staff, businessProfile: result.business_profile };
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('[Auth] SignOut warning:', error.message);
    this.uid = null;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async sendPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async completePasswordReset(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    this.uid = data.session?.user?.id ?? null;
    return data.session?.access_token ?? null;
  }
}
