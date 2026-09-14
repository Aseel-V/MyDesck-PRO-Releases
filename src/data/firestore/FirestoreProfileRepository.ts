import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type {
  BusinessProfile, OwnerRegistration, PreferredCurrency, PreferredLanguage, ProfileRepository, UserProfile,
} from '../domain/profiles';
import { decodeRow, encodeInsert, encodeUpdate } from './documentCodec';
import type { FirebaseSession } from './FirebaseSession';

/**
 * Profiles on Firestore.
 *
 * `users/{uid}` holds the user_profiles row (document id = Firebase uid, the surrogate id kept as
 * legacyProfileId). `businesses/{businessId}` holds the business_profiles row. `businessOwners/{uid}`
 * is the uniqueness index that replaces UNIQUE(business_profiles.user_id): the Rules only allow a
 * business to be created in the same batch as a previously absent index document.
 */
export class FirestoreProfileRepository implements ProfileRepository {
  constructor(private readonly session: FirebaseSession) {}

  async fetchBusinessProfile(uid: string): Promise<BusinessProfile | null> {
    const business = await this.session.ownedBusiness(uid);
    return business ? decodeRow<BusinessProfile>('business_profiles', business.data) : null;
  }

  async fetchUserProfile(uid: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(doc(this.session.db, 'users', uid));
    // An auth-only document stands for an auth.users row with no user_profiles row.
    if (!snapshot.exists() || snapshot.data().migrationAuthOnly === true) return null;
    return decodeRow<UserProfile>('user_profiles', snapshot.data({ serverTimestamps: 'estimate' }));
  }

  async createOwnerProfiles(uid: string, email: string, registration: OwnerRegistration): Promise<void> {
    this.session.assertOnline();
    const ctx = this.session.codec();
    const business = encodeInsert('business_profiles', {
      user_id: uid,
      business_name: registration.businessName,
      logo_url: registration.logoUrl,
      preferred_currency: registration.currency || 'USD',
      preferred_language: registration.language || 'en',
    }, ctx, { ownerUid: uid, businessId: null });
    const profile = encodeInsert('user_profiles', {
      user_id: uid,
      full_name: registration.businessName || email,
      role: 'user',
      is_suspended: false,
    }, ctx, { ownerUid: uid, businessId: null });
    const batch = writeBatch(this.session.db);
    batch.set(doc(this.session.db, 'businesses', business.id), { ...business.data, businessId: business.id });
    batch.set(doc(this.session.db, 'businessOwners', uid), { uid, businessId: business.id, schemaVersion: 1 });
    // Same derived tenancy the migration writes: an owner's users document names the business it owns.
    batch.set(doc(this.session.db, 'users', uid), { ...profile.data, uid, legacyProfileId: profile.id, businessId: business.id });
    await batch.commit();
  }

  async updateBusinessProfile(uid: string, updates: Partial<BusinessProfile>): Promise<void> {
    this.session.assertOnline();
    const business = await this.session.ownedBusiness(uid);
    if (!business) throw new Error('BUSINESS_NOT_FOUND');
    const patch = encodeUpdate('business_profiles', { ...updates, updated_at: new Date().toISOString() }, this.session.codec());
    await updateDoc(doc(this.session.db, 'businesses', business.businessId), patch);
  }

  async saveUserProfile(uid: string, fields: { full_name: string; phone_number: string }): Promise<void> {
    this.session.assertOnline();
    const reference = doc(this.session.db, 'users', uid);
    const snapshot = await getDoc(reference);
    const ctx = this.session.codec();
    if (snapshot.exists()) {
      await updateDoc(reference, encodeUpdate('user_profiles', {
        full_name: fields.full_name, phone_number: fields.phone_number, updated_at: new Date().toISOString(),
      }, ctx));
      return;
    }
    const profile = encodeInsert('user_profiles', { user_id: uid, full_name: fields.full_name, phone_number: fields.phone_number },
      ctx, { ownerUid: uid, businessId: null });
    const owned = await this.session.ownedBusiness(uid);
    const batch = writeBatch(this.session.db);
    batch.set(reference, { ...profile.data, uid, legacyProfileId: profile.id, businessId: owned?.businessId ?? null });
    await batch.commit();
  }

  async resetBranding(uid: string, currency: PreferredCurrency, language: PreferredLanguage): Promise<void> {
    this.session.assertOnline();
    const business = await this.session.ownedBusiness(uid);
    if (!business) throw new Error('BUSINESS_NOT_FOUND');
    await updateDoc(doc(this.session.db, 'businesses', business.businessId), encodeUpdate('business_profiles', {
      business_name: 'MyDesck PRO', logo_url: null, preferred_currency: currency, preferred_language: language,
    }, this.session.codec()));
  }
}
