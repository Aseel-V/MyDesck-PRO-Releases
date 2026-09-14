/**
 * Identity contract shared by both composition roots.
 *
 * The UI only ever sees `AppUser`. The Supabase root backs it with Supabase Auth (the shipped product
 * until cutover); the Firebase root backs it with Firebase Auth. UIDs are preserved across the
 * migration, so `AppUser.id` is the same value on both sides.
 */
import type { BusinessProfile } from './profiles';
import type { RestaurantStaff } from '../../types/restaurant';

export interface AppUser {
  id: string;
  email: string | null;
  created_at?: string;
}

/** Thrown when a stored session was unusable and the gateway reset it; the UI clears its caches. */
export class AuthSessionResetError extends Error {
  constructor() {
    super('AUTH_SESSION_RESET');
    this.name = 'AuthSessionResetError';
  }
}

export interface StaffSignIn {
  staff: RestaurantStaff;
  businessProfile: BusinessProfile | null;
}

export interface AuthGateway {
  readonly provider: 'supabase' | 'firebase';
  getSessionUser(): Promise<AppUser | null>;
  onAuthStateChange(listener: (user: AppUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AppUser>;
  signUp(email: string, password: string): Promise<AppUser>;
  signInStaff(email: string, password: string): Promise<StaffSignIn>;
  signOut(): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  /**
   * Completes a password reset. `actionCode` is the Firebase oobCode when the reset link carried
   * one; Supabase resets through its recovery session instead and ignores it.
   */
  completePasswordReset(newPassword: string, actionCode?: string | null): Promise<void>;
  /** Token presented to Supabase Storage. */
  getAccessToken(): Promise<string | null>;
  currentUid(): string | null;
}
