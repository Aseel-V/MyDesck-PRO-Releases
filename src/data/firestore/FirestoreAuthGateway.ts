import {
  confirmPasswordReset, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updatePassword, type User as FirebaseUser,
} from 'firebase/auth';
import { collection, getDocs, limit, query, where, getDoc, doc } from 'firebase/firestore';
import type { AppUser, AuthGateway, StaffSignIn } from '../domain/auth';
import type { BusinessProfile } from '../domain/profiles';
import type { RestaurantStaff } from '../../types/restaurant';
import { decodeRow } from './documentCodec';
import type { FirebaseSession } from './FirebaseSession';

const toAppUser = (user: FirebaseUser): AppUser => ({
  id: user.uid,
  email: user.email,
  ...(user.metadata.creationTime ? { created_at: new Date(user.metadata.creationTime).toISOString() } : {}),
});

/**
 * Firebase Auth error -> the message shapes the Login screen already understands. Login treats a
 * message matching /invalid|credential|password/ as bad credentials, and `shouldAttemptStaffFallback`
 * looks for "invalid login credentials"; both keep working unchanged.
 */
export function firebaseAuthMessage(error: unknown): Error & { status?: number; code?: string } {
  const code = (error as { code?: string })?.code ?? '';
  const map: Record<string, [string, number | undefined]> = {
    'auth/invalid-credential': ['Invalid login credentials', 400],
    'auth/wrong-password': ['Invalid login credentials', 400],
    'auth/user-not-found': ['Invalid login credentials', 400],
    'auth/invalid-email': ['Invalid login credentials', 400],
    'auth/user-disabled': ['User account is disabled', 400],
    'auth/too-many-requests': ['Too many attempts. Please try again later.', 429],
    'auth/network-request-failed': ['Failed to fetch', undefined],
    'auth/email-already-in-use': ['User already registered', 422],
    'auth/weak-password': ['Password should be at least 6 characters', 422],
    'auth/requires-recent-login': ['Please sign in again to change your password', 401],
    'auth/expired-action-code': ['The reset link has expired', 400],
    'auth/invalid-action-code': ['The reset link is invalid', 400],
  };
  const [message, status] = map[code] ?? [error instanceof Error ? error.message : 'Sign-in failed. Please try again.', undefined];
  return Object.assign(new Error(message), { status, code });
}

/** Legacy staff role labels the UI routes on, derived from the membership role. */
const LEGACY_ROLE: Record<string, RestaurantStaff['role']> = {
  super_admin: 'Manager', branch_manager: 'Manager', kitchen_staff: 'Kitchen', waiter: 'Waiter',
} as Record<string, RestaurantStaff['role']>;

export class FirestoreAuthGateway implements AuthGateway {
  readonly provider = 'firebase' as const;

  constructor(private readonly session: FirebaseSession) {}

  private get auth() { return this.session.client.auth; }

  currentUid() { return this.auth.currentUser?.uid ?? null; }

  async getSessionUser(): Promise<AppUser | null> {
    const user = await this.session.currentUser();
    return user ? toAppUser(user) : null;
  }

  onAuthStateChange(listener: (user: AppUser | null) => void): () => void {
    return onAuthStateChanged(this.auth, (user) => listener(user ? toAppUser(user) : null));
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    await this.session.client.ready;
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      return toAppUser(credential.user);
    } catch (error) {
      throw firebaseAuthMessage(error);
    }
  }

  async signUp(email: string, password: string): Promise<AppUser> {
    await this.session.client.ready;
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      return toAppUser(credential.user);
    } catch (error) {
      throw firebaseAuthMessage(error);
    }
  }

  /**
   * Staff are first-class Firebase identities. Signing in succeeds only when the identity holds an
   * active, enabled restaurant membership; the membership (not a password column) is the grant.
   * There is no PIN, hash or password anywhere in Firestore to verify.
   */
  async signInStaff(email: string, password: string): Promise<StaffSignIn> {
    const user = await this.signIn(email, password);
    const memberships = await getDocs(query(collection(this.session.db, 'restaurantMemberships'),
      where('uid', '==', user.id), where('status', '==', 'active'), where('enabled', '==', true), limit(2)));
    if (memberships.size !== 1) {
      await signOut(this.auth);
      throw new Error(memberships.size ? 'STAFF_MEMBERSHIP_NOT_UNIQUE' : 'Invalid login credentials');
    }
    const membership = memberships.docs[0].data();
    const business = await getDoc(doc(this.session.db, 'businesses', String(membership.businessId)));
    const businessProfile = business.exists() ? decodeRow<BusinessProfile>('business_profiles', business.data()) : null;
    const staff = {
      id: String(membership.staffId ?? user.id),
      business_id: String(business.exists() ? business.data().ownerUid : ''),
      full_name: user.email ?? '',
      email: user.email ?? undefined,
      role: LEGACY_ROLE[String(membership.role)] ?? 'Waiter',
      restaurant_role: membership.role,
      hourly_rate: 0,
      is_active: true,
    } as unknown as RestaurantStaff;
    return { staff, businessProfile };
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const user = await this.session.currentUser();
    if (!user) throw new Error('UNAUTHENTICATED');
    try { await updatePassword(user, newPassword); } catch (error) { throw firebaseAuthMessage(error); }
  }

  /** Firebase sends its own reset link; the default action handler completes it. */
  async sendPasswordReset(email: string): Promise<void> {
    try { await sendPasswordResetEmail(this.auth, email); } catch (error) {
      const mapped = firebaseAuthMessage(error);
      // Reveal nothing about whether the address exists, as the Supabase flow does not.
      if (mapped.code === 'auth/user-not-found' || mapped.code === 'auth/invalid-email') return;
      throw mapped;
    }
  }

  async completePasswordReset(newPassword: string, actionCode?: string | null): Promise<void> {
    try {
      if (actionCode) await confirmPasswordReset(this.auth, actionCode, newPassword);
      else await this.updatePassword(newPassword);
    } catch (error) {
      throw firebaseAuthMessage(error);
    }
  }

  async getAccessToken(forceRefresh = false): Promise<string | null> {
    const user = await this.session.currentUser();
    return user ? user.getIdToken(forceRefresh) : null;
  }
}
