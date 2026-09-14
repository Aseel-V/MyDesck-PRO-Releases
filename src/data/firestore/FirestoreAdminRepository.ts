import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import {
  OPERATOR_ONLY_SECURITY_MUTATION, type AdminCreateUserPayload, type AdminRepository,
} from '../domain/admin';
import type { BusinessProfile, UserProfile } from '../domain/profiles';
import { decodeRow, encodeInsert } from './documentCodec';
import type { FirebaseSession } from './FirebaseSession';
import { firebaseAuthMessage } from './FirestoreAuthGateway';

const ADMIN_LIST_BOUND = 1000;

/**
 * Platform administration on the Spark runtime.
 *
 * Reads: the Rules let a platform admin (users/{uid}.role == 'admin', the same predicate as the
 * source is_admin()) list profiles and businesses.
 *
 * Create user: the source uses the `create-user` Edge Function with the service role. Without a
 * server, the account is created on a short-lived secondary Firebase app (so the administrator's own
 * session is untouched), and the profile documents are written by the administrator under Rules that
 * reproduce the function's check: the caller must be an active platform admin.
 *
 * Edit user: in the source this update matches no row, because business_profiles and user_profiles
 * only permit an owner to update their own row, so it silently changes nothing while reporting
 * success. The Spark runtime does not invent that capability; it refuses explicitly.
 */
export class FirestoreAdminRepository implements AdminRepository {
  constructor(private readonly session: FirebaseSession) {}

  async listUserProfiles(): Promise<UserProfile[]> {
    const rows = await getDocs(query(collection(this.session.db, 'users'), limit(ADMIN_LIST_BOUND + 1)));
    if (rows.size > ADMIN_LIST_BOUND) throw new Error('ADMIN_LIST_BOUND_EXCEEDED');
    const profiles = rows.docs.filter((row) => row.data().migrationAuthOnly !== true)
      .map((row) => decodeRow<UserProfile>('user_profiles', row.data({ serverTimestamps: 'estimate' })));
    // PostgreSQL ORDER BY created_at DESC puts NULLs first.
    return profiles.sort((a, b) => {
      if (a.created_at === b.created_at) return 0;
      if (a.created_at === null) return -1;
      if (b.created_at === null) return 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  }

  async listBusinessProfiles(): Promise<BusinessProfile[]> {
    const rows = await getDocs(query(collection(this.session.db, 'businesses'), limit(ADMIN_LIST_BOUND + 1)));
    if (rows.size > ADMIN_LIST_BOUND) throw new Error('ADMIN_LIST_BOUND_EXCEEDED');
    return rows.docs.map((row) => decodeRow<BusinessProfile>('business_profiles', row.data({ serverTimestamps: 'estimate' })));
  }

  async updateUserAdminFields(): Promise<void> {
    throw new Error(OPERATOR_ONLY_SECURITY_MUTATION);
  }

  async createUser(payload: AdminCreateUserPayload): Promise<{ userId: string; businessId: string | null }> {
    this.session.assertOnline();
    if (!payload.email || !payload.password) throw new Error('Email and password are required');
    if (!['user', 'admin'].includes(payload.role)) throw new Error('INVALID_ROLE');
    const adminUid = await this.session.requireUid();
    if (payload.businessId) {
      const target = await getDoc(doc(this.session.db, 'businesses', payload.businessId));
      if (!target.exists()) throw new Error('Invalid Business ID');
    }
    const options = this.session.client.app.options;
    const secondary = initializeApp({ apiKey: options.apiKey, authDomain: options.authDomain, projectId: options.projectId },
      `admin-create-user-${crypto.randomUUID()}`);
    const secondaryAuth = getAuth(secondary);
    if (this.session.client.mode === 'firestore-emulator') connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    try {
      let created;
      try {
        created = await createUserWithEmailAndPassword(secondaryAuth, payload.email, payload.password);
      } catch (error) {
        throw firebaseAuthMessage(error);
      }
      const userId = created.user.uid;
      const ctx = this.session.codec();
      const batch = writeBatch(this.session.db);
      let businessId: string | null = payload.businessId ?? null;
      if (!payload.businessId) {
        const business = encodeInsert('business_profiles', {
          user_id: userId, business_name: payload.businessName || 'My Business',
          business_type: payload.businessType ?? 'tourism', logo_url: payload.logoUrl || null,
          preferred_currency: payload.currency ?? 'USD', preferred_language: payload.language ?? 'en',
        }, ctx, { ownerUid: userId, businessId: null });
        businessId = business.id;
        batch.set(doc(this.session.db, 'businesses', business.id), { ...business.data, businessId: business.id, createdBy: adminUid });
        batch.set(doc(this.session.db, 'businessOwners', userId), { uid: userId, businessId: business.id, schemaVersion: 1 });
      }
      // Derived tenancy exactly as the migration resolves it: a user linked to a business belongs to
      // that business's owner; an owner (or an unlinked user) belongs to itself.
      let ownerUid = userId;
      if (payload.businessId) {
        const linked = await getDoc(doc(this.session.db, 'businesses', payload.businessId));
        ownerUid = String(linked.data()?.ownerUid ?? userId);
      }
      const profile = encodeInsert('user_profiles', {
        user_id: userId, full_name: payload.fullName, phone_number: payload.phoneNumber, role: payload.role,
        ...(businessId ? { business_id: businessId } : {}),
      }, ctx, { ownerUid, businessId: null });
      // The Edge Function stores business_id for both modes; the derived businessId matches it.
      batch.set(doc(this.session.db, 'users', userId), {
        ...profile.data, uid: userId, legacyProfileId: profile.id, businessId, createdBy: adminUid,
      });
      try {
        await batch.commit();
      } catch (error) {
        // The Edge Function deletes the auth user when profile creation fails; the secondary session can.
        await deleteUser(created.user).catch(() => undefined);
        throw error;
      }
      return { userId, businessId };
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(secondary).catch(() => undefined);
    }
  }
}
