import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, setDoc, Timestamp, where, writeBatch,
  type CollectionReference, type DocumentData, type DocumentReference,
} from 'firebase/firestore';
import type {
  CategorySeed, MarketTransactionRow, MenuCategoryRow, MenuItemRow, ProductInput, SaleInput, SalePatch,
  SupermarketRepository,
} from '../domain/supermarket';
import { decodeRow, encodeInsert, encodeUpdate } from './documentCodec';
import { microsToSecondsAndNanos, timestampToMicros } from './exactValues';
import type { FirebaseSession } from './FirebaseSession';

/** PostgREST caps an unpaginated select at max_rows (1000 on the hosted project); the same bound applies. */
export const SUPERMARKET_LIST_BOUND = 1000;

const read = (snapshot: { data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }) =>
  snapshot.data({ serverTimestamps: 'estimate' }) ?? {};

/**
 * Supermarket on Firestore.
 *
 *   businesses/{businessId}/menuItems/{id}           restaurant_menu_items
 *   businesses/{businessId}/menuCategories/{id}      restaurant_menu_categories
 *   businesses/{businessId}/marketTransactions/{id}  market_transactions
 *
 * The source filters by `business_id = owner uid`. Every document under the owner's business path is
 * already that tenant's, and the Rules enforce it; the explicit business_id filter is still applied
 * after reading, so a menu item whose source business_id was NULL (tenancy through its category) is
 * excluded exactly as the source query excludes it.
 */
export class FirestoreSupermarketRepository implements SupermarketRepository {
  constructor(private readonly session: FirebaseSession) {}

  private async tenant(ownerUid: string) {
    const business = await this.session.requireOwnedBusiness();
    if (business.uid !== ownerUid) throw new Error('TENANT_MISMATCH');
    return business;
  }

  private items(businessId: string): CollectionReference { return collection(this.session.db, 'businesses', businessId, 'menuItems'); }
  private categories(businessId: string): CollectionReference { return collection(this.session.db, 'businesses', businessId, 'menuCategories'); }
  private sales(businessId: string): CollectionReference { return collection(this.session.db, 'businesses', businessId, 'marketTransactions'); }

  async listAvailableProducts(ownerUid: string): Promise<MenuItemRow[]> {
    const { businessId } = await this.tenant(ownerUid);
    const rows = await getDocs(query(this.items(businessId), where('isAvailable', '==', true), limit(SUPERMARKET_LIST_BOUND)));
    // The generated database types predate restaurant_menu_items.business_id; the live column exists.
    return rows.docs.map((row) => decodeRow<MenuItemRow>('restaurant_menu_items', read(row)))
      .filter((row) => (row as unknown as { business_id: string | null }).business_id === ownerUid);
  }

  async listCategories(ownerUid: string): Promise<MenuCategoryRow[]> {
    const { businessId } = await this.tenant(ownerUid);
    const rows = await getDocs(query(this.categories(businessId), limit(SUPERMARKET_LIST_BOUND)));
    // ORDER BY sort_order ASC puts NULLs last in PostgreSQL; the id tie-break only makes the
    // order deterministic where the source's is unspecified.
    return rows.docs.map((row) => decodeRow<MenuCategoryRow>('restaurant_menu_categories', read(row)))
      .filter((row) => row.business_id === ownerUid)
      .sort((a, b) => {
        const left = a.sort_order ?? Number.POSITIVE_INFINITY;
        const right = b.sort_order ?? Number.POSITIVE_INFINITY;
        return left === right ? a.id.localeCompare(b.id) : left - right;
      });
  }

  async seedDefaultCategories(ownerUid: string, seeds: CategorySeed[]): Promise<MenuCategoryRow[]> {
    this.session.assertOnline();
    const { businessId } = await this.tenant(ownerUid);
    const ctx = this.session.codec();
    const batch = writeBatch(this.session.db);
    const created = seeds.map((seed) => {
      const encoded = encodeInsert('restaurant_menu_categories', { business_id: ownerUid, ...seed }, ctx,
        { ownerUid, businessId });
      batch.set(doc(this.categories(businessId), encoded.id), encoded.data);
      return encoded.id;
    });
    await batch.commit();
    const rows = await Promise.all(created.map((id) => getDoc(doc(this.categories(businessId), id))));
    return rows.map((row) => decodeRow<MenuCategoryRow>('restaurant_menu_categories', read(row)));
  }

  async createProduct(ownerUid: string, input: ProductInput): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.tenant(ownerUid);
    const encoded = encodeInsert('restaurant_menu_items', { business_id: ownerUid, ...input, is_available: true },
      this.session.codec(), { ownerUid, businessId });
    await setDoc(doc(this.items(businessId), encoded.id), encoded.data);
  }

  /**
   * UPDATE ... WHERE id = $1 changes nothing, without an error, when the row is gone. Rules cannot
   * evaluate an update of a missing document and refuse it, so the existence check and the write run
   * in one transaction: a row deleted concurrently makes the transaction retry and then do nothing.
   */
  private async updateIfPresent(reference: DocumentReference, data: DocumentData): Promise<void> {
    await runTransaction(this.session.db, async (transaction) => {
      const current = await transaction.get(reference);
      if (current.exists()) transaction.update(reference, data);
    });
  }

  async updateProduct(productId: string, patch: Partial<ProductInput>): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    await this.updateIfPresent(doc(this.items(businessId), productId), encodeUpdate('restaurant_menu_items', patch, this.session.codec()));
  }

  /**
   * DELETE restaurant_menu_items WHERE id, with the source foreign keys reproduced:
   *   NO ACTION  restaurant_order_items.item_id, shrinkage_records.menu_item_id, stock_take_items.menu_item_id
   *              -> a referenced product is not deleted (PostgreSQL raises 23503)
   *   CASCADE    inventory_batches, restaurant_item_modifier_groups, restaurant_recipes
   *              -> dependents are removed in the same atomic batch
   * Rules cannot run these queries, so a raw client delete bypassing this method can orphan a
   * reference inside its own tenant; reconciliation's orphan check detects that case.
   */
  async deleteProduct(productId: string): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    const scoped = (name: string) => collection(this.session.db, 'businesses', businessId, name);
    const restricting: Array<[string, string]> = [['orderItems', 'itemId'], ['shrinkageRecords', 'menuItemId'], ['stockTakeItems', 'menuItemId']];
    for (const [name, field] of restricting) {
      const referenced = await getDocs(query(scoped(name), where(field, '==', productId), limit(1)));
      if (!referenced.empty) {
        throw Object.assign(new Error(`update or delete on table "restaurant_menu_items" violates foreign key constraint (${name})`), { code: '23503' });
      }
    }
    const batch = writeBatch(this.session.db);
    const cascading: Array<[string, string]> = [['inventoryBatches', 'menuItemId'], ['itemModifierGroups', 'itemId'], ['recipes', 'menuItemId']];
    for (const [name, field] of cascading) {
      const dependents = await getDocs(query(scoped(name), where(field, '==', productId), limit(450)));
      if (dependents.size >= 450) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
      dependents.docs.forEach((dependent) => batch.delete(dependent.ref));
    }
    batch.delete(doc(this.items(businessId), productId));
    await batch.commit();
  }

  async recordSale(ownerUid: string, sale: SaleInput): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.tenant(ownerUid);
    const encoded = encodeInsert('market_transactions', { business_id: ownerUid, ...sale }, this.session.codec(),
      { ownerUid, businessId });
    await setDoc(doc(this.sales(businessId), encoded.id), encoded.data);
  }

  async listSales(ownerUid: string, fromIso: string, toIso: string): Promise<MarketTransactionRow[]> {
    const { businessId } = await this.tenant(ownerUid);
    const bound = (iso: string) => {
      const { seconds, nanoseconds } = microsToSecondsAndNanos(timestampToMicros(iso));
      return new Timestamp(seconds, nanoseconds);
    };
    const rows = await getDocs(query(this.sales(businessId), where('createdAt', '>=', bound(fromIso)),
      where('createdAt', '<=', bound(toIso)), orderBy('createdAt', 'desc'), limit(SUPERMARKET_LIST_BOUND)));
    return rows.docs.map((row) => decodeRow<MarketTransactionRow>('market_transactions', read(row)))
      .filter((row) => row.business_id === ownerUid);
  }

  async getSaleOwner(saleId: string): Promise<{ id: string; business_id: string } | null> {
    try {
      const { businessId } = await this.session.requireOwnedBusiness();
      const snapshot = await getDoc(doc(this.sales(businessId), saleId));
      if (!snapshot.exists()) return null;
      const row = decodeRow<MarketTransactionRow>('market_transactions', read(snapshot));
      return { id: row.id, business_id: row.business_id };
    } catch {
      // The source ignores this lookup's error and proceeds as "not found".
      return null;
    }
  }

  async updateSale(saleId: string, patch: SalePatch): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    await this.updateIfPresent(doc(this.sales(businessId), saleId), encodeUpdate('market_transactions', { ...patch }, this.session.codec()));
  }

  async deleteSale(saleId: string): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    await deleteDoc(doc(this.sales(businessId), saleId));
  }
}
