import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection, deleteField, doc, getDoc, getDocs, limit, query, serverTimestamp, Timestamp, where,
  type DocumentData, type Firestore,
} from 'firebase/firestore';
import type { FirebaseClient } from '../firebaseClient';
import type { CodecContext } from './documentCodec';

export interface OwnedBusiness {
  uid: string;
  businessId: string;
  ownerUid: string;
  data: DocumentData;
}

/**
 * The signed-in Firebase identity and the tenant it acts for.
 *
 * Tenancy is resolved from data the Rules also read (the business document's ownerUid, or an active
 * restaurant membership), never from anything the client asserts. The Rules remain the authority;
 * this only chooses which paths to address.
 */
export class FirebaseSession {
  constructor(readonly client: FirebaseClient) {}

  get db(): Firestore { return this.client.db; }

  async currentUser(): Promise<FirebaseUser | null> {
    await this.client.ready;
    await this.client.auth.authStateReady();
    return this.client.auth.currentUser;
  }

  async requireUid(): Promise<string> {
    const user = await this.currentUser();
    if (!user) throw new Error('UNAUTHENTICATED');
    return user.uid;
  }

  codec(): CodecContext {
    return {
      timestamp: (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds),
      serverTimestamp: () => serverTimestamp(),
      deleteField: () => deleteField(),
      newId: () => crypto.randomUUID(),
    };
  }

  /** The business this uid owns: the uniqueness index first, the ownerUid query as a fallback. */
  async ownedBusiness(uid: string): Promise<OwnedBusiness | null> {
    const index = await getDoc(doc(this.db, 'businessOwners', uid));
    if (index.exists()) {
      const businessId = String(index.data().businessId);
      const business = await getDoc(doc(this.db, 'businesses', businessId));
      if (business.exists() && business.data().ownerUid === uid) {
        return { uid, businessId, ownerUid: uid, data: business.data() };
      }
    }
    const rows = await getDocs(query(collection(this.db, 'businesses'), where('ownerUid', '==', uid), limit(2)));
    if (rows.size > 1) throw new Error('BUSINESS_NOT_UNIQUE');
    if (rows.empty) return null;
    return { uid, businessId: rows.docs[0].id, ownerUid: uid, data: rows.docs[0].data() };
  }

  async requireOwnedBusiness(): Promise<OwnedBusiness> {
    const uid = await this.requireUid();
    const business = await this.ownedBusiness(uid);
    if (!business) throw new Error('BUSINESS_NOT_FOUND');
    if (business.data.isSuspended === true) throw new Error('BUSINESS_SUSPENDED');
    return business;
  }

  /** Writes need a server acknowledgement; an offline client must not report success. */
  assertOnline(): void {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('SERVER_CONFIRMATION_REQUIRED');
  }
}
