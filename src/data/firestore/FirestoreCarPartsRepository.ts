import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, setDoc, where,
  type CollectionReference, type DocumentData,
} from 'firebase/firestore';
import type { CarPart, CarPartInput } from '../../types/carParts';
import type { CarPartsRepository } from '../domain/carParts';
import { decodeRow, encodeInsert, encodeUpdate } from './documentCodec';
import { timestampToMicros } from './exactValues';
import type { FirebaseSession } from './FirebaseSession';

/** PostgREST caps an unpaginated select at max_rows (1000 on the hosted project); the same bound applies. */
export const CAR_PARTS_LIST_BOUND = 1000;

type Row = Record<string, unknown>;
const read = (snapshot: { data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }) =>
  snapshot.data({ serverTimestamps: 'estimate' }) ?? {};
/** A request body without the fields the form left undefined, which PostgREST never receives. */
const defined = (row: CarPartInput): Row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
const createdMicros = (part: CarPart) => {
  const value = (part as unknown as { created_at: string | null }).created_at;
  return value === null ? null : timestampToMicros(value);
};

/**
 * Car parts inventory on Firestore: businesses/{businessId}/parts/{id}, one document per car_parts row.
 *
 * The owner writes parts through the Rules' inventory path: the generated schema validator, tenancy bound to the
 * caller and the path, and the touch trigger's updated_at as the request time. The stock a repair service consumes
 * moves only through the service record (FirestoreAutoRepairRepository).
 */
export class FirestoreCarPartsRepository implements CarPartsRepository {
  constructor(private readonly session: FirebaseSession) {}

  private async tenant(businessId: string) {
    const business = await this.session.requireOwnedBusiness();
    if (business.businessId !== businessId) throw new Error('TENANT_MISMATCH');
    return business;
  }

  private parts(businessId: string): CollectionReference {
    return collection(this.session.db, 'businesses', businessId, 'parts');
  }

  /**
   * ORDER BY created_at DESC puts NULLs first in PostgreSQL; a descending Firestore ordering puts them last, so near
   * the bound it would keep other rows. The parts without a creation time are therefore read on their own. A null
   * createdAt is still a value to Firestore, so such a part also comes back from the ordered query: the two results
   * are merged by id, then ordered once. Among equal creation times the source order is unspecified; the id makes it
   * deterministic.
   */
  async listParts(businessId: string): Promise<CarPart[]> {
    await this.tenant(businessId);
    const [undated, dated] = await Promise.all([
      getDocs(query(this.parts(businessId), where('createdAt', '==', null), limit(CAR_PARTS_LIST_BOUND))),
      getDocs(query(this.parts(businessId), orderBy('createdAt', 'desc'), limit(CAR_PARTS_LIST_BOUND))),
    ]);
    const parts = new Map<string, CarPart>();
    for (const snapshot of [...undated.docs, ...dated.docs]) {
      const part = decodeRow<CarPart>('car_parts', read(snapshot));
      if (part.business_id === businessId) parts.set(part.id, part);
    }
    const newestFirst = (a: CarPart, b: CarPart) => {
      const left = createdMicros(a);
      const right = createdMicros(b);
      if (left === right) return a.id.localeCompare(b.id);
      if (left === null) return -1;
      if (right === null) return 1;
      return left > right ? -1 : 1;
    };
    return [...parts.values()].sort(newestFirst).slice(0, CAR_PARTS_LIST_BOUND);
  }

  async createPart(businessId: string, input: CarPartInput): Promise<CarPart> {
    this.session.assertOnline();
    const { uid } = await this.tenant(businessId);
    const encoded = encodeInsert('car_parts', { ...defined(input), business_id: businessId }, this.session.codec(),
      { ownerUid: uid, businessId });
    const reference = doc(this.parts(businessId), encoded.id);
    await setDoc(reference, encoded.data);
    return decodeRow<CarPart>('car_parts', read(await getDoc(reference)));
  }

  /**
   * UPDATE ... WHERE id RETURNING * read with `.single()`: when no row matches, PostgREST answers PGRST116 and nothing
   * changes. The existence check and the write run in one transaction, so a part deleted meanwhile is refused the same
   * way. The touch trigger sets updated_at to the server time.
   */
  async updatePart(partId: string, input: CarPartInput): Promise<CarPart> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    const reference = doc(this.parts(businessId), partId);
    const data = encodeUpdate('car_parts', defined(input), this.session.codec());
    await runTransaction(this.session.db, async (transaction) => {
      const current = await transaction.get(reference);
      if (!current.exists()) {
        throw Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' });
      }
      transaction.update(reference, data);
    });
    return decodeRow<CarPart>('car_parts', read(await getDoc(reference)));
  }

  /** DELETE car_parts WHERE id: no row is not an error, and repair items keep their inventory_item_id (no foreign key). */
  async deletePart(partId: string): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    await deleteDoc(doc(this.parts(businessId), partId));
  }
}
