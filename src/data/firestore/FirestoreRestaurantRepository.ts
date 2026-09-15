import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection, deleteField, doc, documentId, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, where, writeBatch,
  type CollectionReference, type DocumentData, type DocumentReference, type Firestore, type Query,
} from 'firebase/firestore';
import type {
  BusinessSettings, DailyReport, GuestProfile, KitchenTicket, MenuCategory, MenuItem, Modifier, ModifierGroup,
  OrderItem, RealtimeKPIs, Reservation, RestaurantOrder, RestaurantStaff, RestaurantTable, TableSession, TicketStatus,
  Waitlist,
} from '../../types/restaurant';
import type {
  ActivityInput, ApprovalCredential, CartLineInput, DiscountInput, EditedLineInput, NewOrderInput, OrderItemInput, OrderPayment,
  RefundInput, ReservationInput, RestaurantFeed, RestaurantRepository, StaffAuthorizationResult, StaffPinResult,
} from '../domain/restaurant';
import type { IsolatedIdentity } from '../firebaseClient';
import { decodeRow, encodeInsert, encodeUpdate } from './documentCodec';
import { encodeNumeric, readStoredDecimal, storedDecimalToNumber, toStoredDecimal, type StoredDecimal } from './exactValues';
import { firebaseAuthMessage } from './FirestoreAuthGateway';
import type { FirebaseSession } from './FirebaseSession';

/** PostgREST caps an unpaginated select at max_rows (1000 on the hosted project); the same bound applies. */
export const RESTAURANT_LIST_BOUND = 1000;
const CHUNK = 30;
const BATCH_BOUND = 450;
const APPROVAL_TTL_MS = 2 * 60 * 1000;
/** A ticket line costs the Rules document reads of its line, ticket line and dish; five distinct dishes is the measured ceiling. */
const TICKET_LINES_PER_WRITE = 3;
const OPEN_ORDER_STATUSES = ['draft', 'pending', 'in_progress', 'ready', 'served', 'billed', 'open'];
const ACTIVE_TICKET_STATUSES = ['new', 'in_progress', 'ready'];
const MANAGER_ROLES = ['super_admin', 'branch_manager'];
/** Columns of restaurant_staff that never reach Firestore, as row keys and as document fields. */
const CREDENTIAL_COLUMNS = new Set(['pin_code', 'pin_hash', 'password']);
const CREDENTIAL_FIELDS = new Set(['pinCode', 'pinHash', 'password']);
/** VAT-inclusive split the order screens use: tax = total * (0.17 / 1.17). */
const VAT_SHARE = 0.17 / 1.17;

type Row = Record<string, unknown>;

/** A write that only a screen the product never mounts can reach; see migration/firestore/verticals/restaurant.md. */
export class RestaurantFlowUnavailable extends Error {
  constructor(readonly flow: string, readonly classification: 'LEGACY_UNREACHABLE' | 'AUTH_REPLACED') {
    super(`RESTAURANT_FLOW_${classification}:${flow}`);
    this.name = 'RestaurantFlowUnavailable';
  }
}

const read = (snapshot: { data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }) =>
  snapshot.data({ serverTimestamps: 'estimate' }) ?? {};
const defined = (row: Row): Row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
const chunks = <T>(values: T[], size: number): T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
const unique = (values: unknown[]) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== '').map(String))];
const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });
/** ORDER BY on text follows the source database collation (en_US.UTF-8). */
const collation = new Intl.Collator('en-US');
const micros = (value: unknown) => (value ? new Date(String(value)).getTime() : Number.NaN);
const byCreation = (a: Row, b: Row) => (micros(a.created_at) - micros(b.created_at)) || String(a.id).localeCompare(String(b.id));

// ---------------------------------------------------------------- exact money

const ZERO: StoredDecimal = toStoredDecimal(0n, 0);
const stored = (value: unknown): StoredDecimal => (value === null || value === undefined ? ZERO : (value as StoredDecimal));
const at = (value: unknown, scale: number) => { const v = readStoredDecimal(stored(value)); return v.units * 10n ** BigInt(scale - v.scale); };
const scaleOf = (value: unknown) => readStoredDecimal(stored(value)).scale;
const isActiveLine = (item: DocumentData | null) => !!item && item.status !== 'cancelled' && item.voided !== true;
const sameDecimal = (a: unknown, b: unknown) => { const s = Math.max(scaleOf(a), scaleOf(b)); return at(a, s) === at(b, s); };

/** A line as PostgreSQL sums it: price_at_time * quantity, zero once cancelled or voided. */
function lineAmount(item: DocumentData | null): StoredDecimal {
  if (!isActiveLine(item)) return ZERO;
  const price = readStoredDecimal(stored(item!.priceAtTime));
  return toStoredDecimal(price.units * BigInt(Number(item!.quantity ?? 0)), price.scale);
}

function sameLine(before: DocumentData | null, after: DocumentData | null) {
  if (!before || !after) return false;
  if (isActiveLine(before) !== isActiveLine(after)) return false;
  if (!isActiveLine(before)) return true;
  return before.quantity === after.quantity && sameDecimal(before.priceAtTime, after.priceAtTime)
    && scaleOf(before.priceAtTime) === scaleOf(after.priceAtTime);
}

/** The order ledger after one line changes: itemsTotal moves by exactly the line's difference. */
function ledgerUpdate(order: DocumentData, itemId: string, before: DocumentData | null, after: DocumentData | null) {
  const scale = Math.max(scaleOf(order.itemsTotal),
    isActiveLine(before) ? scaleOf(before!.priceAtTime) : 0, isActiveLine(after) ? scaleOf(after!.priceAtTime) : 0);
  const next = at(order.itemsTotal, scale) + at(lineAmount(after), scale) - at(lineAmount(before), scale);
  return { itemsTotal: toStoredDecimal(next, scale), ledgerRevision: Number(order.ledgerRevision ?? 0) + 1, ledgerItemId: itemId };
}

/** max(0, itemsTotal - discount_amount), exact. */
function netOfDiscount(order: DocumentData): StoredDecimal {
  const scale = Math.max(scaleOf(order.itemsTotal), scaleOf(order.discountAmount));
  const net = at(order.itemsTotal, scale) - at(order.discountAmount, scale);
  return toStoredDecimal(net > 0n ? net : 0n, scale);
}

// ---------------------------------------------------------------- tenancy and approval

interface RestaurantContext { uid: string; businessId: string; ownerUid: string; role: string; staffId: string | null }
interface Approval { identity: IsolatedIdentity; uid: string; staffId: string | null; name: string; businessId: string; ownerUid: string; timer: ReturnType<typeof setTimeout> }

/**
 * Restaurant on Firestore.
 *
 *   businesses/{businessId}/tables, menuCategories, menuItems, modifierGroups, modifiers, restaurantStaff,
 *   tableSessions, orders, orderItems, orderItemModifiers, kitchenTickets, ticketItems, voidLogs,
 *   restaurantAuditLogs, restaurantPayments, dailyReports, reservations, waitlist, guestProfiles, settings
 *   businesses/{businessId}/restaurantCounters/orders   replaces the global order_number sequence
 *
 * The source scopes every table by business_id = the owner uid under owner-only RLS. Here the path fixes the tenant
 * and the Rules admit the owner and the business's active restaurant members by role.
 *
 * Money is never taken from the client. Each order keeps itemsTotal, the exact sum of its active lines, and every
 * line change runs in one transaction with the order so the Rules can check the difference; totals are written from
 * that ledger. A manager-approved action (void, discount, cancel) runs under the approver's own Firebase identity in an
 * isolated in-memory app, so the Rules decide on the approver rather than on a staff id the client names.
 */
export class FirestoreRestaurantRepository implements RestaurantRepository {
  readonly approvalCredential = 'account' as const;
  readonly staffRecordCredentials = false;
  private readonly approvals = new Map<string, Approval>();

  constructor(private readonly session: FirebaseSession) {}

  private async context(): Promise<RestaurantContext> {
    const uid = await this.session.requireUid();
    // A staff identity owns no business; the Rules refuse its owner lookup, which means "not an owner".
    const owned = await this.session.ownedBusiness(uid).catch((error: { code?: string }) => {
      if (error?.code === 'permission-denied') return null;
      throw error;
    });
    if (owned) {
      if (owned.data.isSuspended === true) throw new Error('BUSINESS_SUSPENDED');
      return { uid, businessId: owned.businessId, ownerUid: uid, role: 'owner', staffId: null };
    }
    const memberships = await getDocs(query(collection(this.session.db, 'restaurantMemberships'),
      where('uid', '==', uid), where('status', '==', 'active'), where('enabled', '==', true), limit(2)));
    if (memberships.size !== 1) throw new Error(memberships.size ? 'STAFF_MEMBERSHIP_NOT_UNIQUE' : 'BUSINESS_NOT_FOUND');
    const membership = memberships.docs[0].data();
    const business = await getDoc(doc(this.session.db, 'businesses', String(membership.businessId)));
    if (!business.exists()) throw new Error('BUSINESS_NOT_FOUND');
    return { uid, businessId: business.id, ownerUid: String(business.data().ownerUid), role: String(membership.role),
      staffId: membership.staffId ? String(membership.staffId) : null };
  }

  /** The screens pass the source business_id (the owner uid); a staff session may pass its own uid. */
  private async tenant(businessUid: string): Promise<RestaurantContext> {
    const ctx = await this.context();
    if (businessUid !== ctx.ownerUid && businessUid !== ctx.uid) throw new Error('TENANT_MISMATCH');
    return ctx;
  }

  private col(ctx: { businessId: string }, name: string, db: Firestore = this.session.db): CollectionReference {
    return collection(db, 'businesses', ctx.businessId, name);
  }

  private tenancy(ctx: { ownerUid: string; businessId: string }) {
    return { ownerUid: ctx.ownerUid, businessId: ctx.businessId };
  }

  private decode<T>(table: string, snapshots: Array<{ data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }>): T[] {
    return snapshots.map((snapshot) => decodeRow<T>(table, read(snapshot)));
  }

  private async list(q: Query, table: string): Promise<Row[]> {
    return this.decode<Row>(table, (await getDocs(q)).docs);
  }

  private async byIds(ctx: RestaurantContext, name: string, table: string, ids: unknown[]): Promise<Map<string, Row>> {
    const found = new Map<string, Row>();
    for (const part of chunks(unique(ids), CHUNK)) {
      for (const row of await this.list(query(this.col(ctx, name), where(documentId(), 'in', part)), table)) found.set(String(row.id), row);
    }
    return found;
  }

  private async byField(ctx: RestaurantContext, name: string, table: string, field: string, column: string, values: unknown[]): Promise<Map<string, Row[]>> {
    const found = new Map<string, Row[]>();
    for (const part of chunks(unique(values), CHUNK)) {
      for (const row of await this.list(query(this.col(ctx, name), where(field, 'in', part)), table)) {
        const key = String(row[column]);
        found.set(key, [...(found.get(key) ?? []), row]);
      }
    }
    return found;
  }

  private unavailable(flow: string): never {
    throw new RestaurantFlowUnavailable(flow, 'LEGACY_UNREACHABLE');
  }

  // ---------------------------------------------------------------- live updates

  subscribe(feed: RestaurantFeed, businessUid: string, onChange: () => void): () => void {
    let stop: (() => void) | null = null;
    let cancelled = false;
    this.tenant(businessUid).then((ctx) => {
      if (cancelled) return;
      const feeds: Record<RestaurantFeed, Query> = {
        restaurant_tables: query(this.col(ctx, 'tables'), limit(RESTAURANT_LIST_BOUND)),
        restaurant_orders: query(this.col(ctx, 'orders'), where('status', 'in', OPEN_ORDER_STATUSES), limit(RESTAURANT_LIST_BOUND)),
        restaurant_kitchen_tickets: query(this.col(ctx, 'kitchenTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES), limit(RESTAURANT_LIST_BOUND)),
        restaurant_table_sessions: query(this.col(ctx, 'tableSessions'), where('status', '==', 'active'), limit(RESTAURANT_LIST_BOUND)),
        restaurant_reservations: query(this.col(ctx, 'reservations'), limit(RESTAURANT_LIST_BOUND)),
        restaurant_waitlist: query(this.col(ctx, 'waitlist'), where('status', '==', 'waiting'), limit(RESTAURANT_LIST_BOUND)),
      };
      // postgres_changes delivers changes, not the current rows: nothing counts until the listener has the server's
      // view, and after that only snapshots that actually change documents do.
      let synced = false;
      stop = onSnapshot(feeds[feed], { includeMetadataChanges: true }, (snapshot) => {
        if (!synced) {
          if (!snapshot.metadata.fromCache) synced = true;
          return;
        }
        if (snapshot.docChanges().length) onChange();
      }, () => undefined);
    }).catch(() => undefined);
    return () => { cancelled = true; stop?.(); };
  }

  // ---------------------------------------------------------------- floor and menu

  async listTables(businessUid: string): Promise<RestaurantTable[]> {
    const ctx = await this.tenant(businessUid);
    const rows = await this.list(query(this.col(ctx, 'tables'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_tables');
    return rows.filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => collation.compare(String(a.name), String(b.name)) || String(a.id).localeCompare(String(b.id))) as unknown as RestaurantTable[];
  }

  async createTable(businessUid: string, tableData: Partial<RestaurantTable> & { name: string }): Promise<RestaurantTable> {
    this.session.assertOnline();
    const ctx = await this.tenant(businessUid);
    const created = encodeInsert('restaurant_tables', defined({
      name: tableData.name,
      seats: tableData.seats ?? 4,
      min_party_size: tableData.min_party_size ?? 1,
      status: tableData.status ?? 'free',
      position_x: tableData.position_x ?? 0,
      position_y: tableData.position_y ?? 0,
      shape: tableData.shape ?? 'round',
      zone: tableData.zone ?? 'indoor',
      width: tableData.width ?? 100,
      height: tableData.height ?? 100,
      rotation: tableData.rotation ?? 0,
      is_mergeable: tableData.is_mergeable ?? true,
      business_id: ctx.ownerUid,
    }), this.session.codec(), this.tenancy(ctx));
    const ref = doc(this.col(ctx, 'tables'), created.id);
    await runTransaction(this.session.db, async (transaction) => { transaction.set(ref, created.data); });
    return decodeRow<RestaurantTable>('restaurant_tables', read(await getDoc(ref)));
  }

  /** UPDATE ... WHERE id: a row that no longer exists is not an error. */
  private async updateIfPresent(ref: DocumentReference, data: DocumentData): Promise<void> {
    if (!Object.keys(data).length) return;
    await runTransaction(this.session.db, async (transaction) => {
      if ((await transaction.get(ref)).exists()) transaction.update(ref, data);
    });
  }

  async updateTable(id: string, updates: Partial<RestaurantTable>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    await this.updateIfPresent(doc(this.col(ctx, 'tables'), id), encodeUpdate('restaurant_tables', defined(updates as Row), this.session.codec()));
  }

  /**
   * DELETE restaurant_tables WHERE id, with the source foreign keys: an order that references the table refuses the
   * delete (restaurant_orders.table_id, NO ACTION); sessions and waitlist entries lose the reference (SET NULL).
   */
  async deleteTable(id: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const referenced = await getDocs(query(this.col(ctx, 'orders'), where('tableId', '==', id), limit(1)));
    if (!referenced.empty) {
      throw pgError('update or delete on table "restaurant_tables" violates foreign key constraint "restaurant_orders_table_id_fkey" on table "restaurant_orders"', '23503');
    }
    const batch = writeBatch(this.session.db);
    for (const name of ['tableSessions', 'waitlist']) {
      const dependents = await getDocs(query(this.col(ctx, name), where('tableId', '==', id), limit(BATCH_BOUND)));
      if (dependents.size >= BATCH_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
      dependents.docs.forEach((dependent) => batch.update(dependent.ref, { tableId: null }));
    }
    batch.delete(doc(this.col(ctx, 'tables'), id));
    await batch.commit();
  }

  async listMenu(businessUid: string): Promise<MenuCategory[]> {
    const ctx = await this.tenant(businessUid);
    const categories = (await this.list(query(this.col(ctx, 'menuCategories'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_menu_categories'))
      .filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => (Number(a.sort_order ?? Infinity) - Number(b.sort_order ?? Infinity)) || String(a.id).localeCompare(String(b.id)));
    const items = await this.byField(ctx, 'menuItems', 'restaurant_menu_items', 'categoryId', 'category_id', categories.map((row) => row.id));
    return categories.map((category) => ({ ...category, items: (items.get(String(category.id)) ?? []).sort(byCreation) })) as unknown as MenuCategory[];
  }

  async createCategory(businessUid: string, categoryData: Partial<MenuCategory> & { name: string }): Promise<MenuCategory> {
    this.session.assertOnline();
    const ctx = await this.tenant(businessUid);
    const created = encodeInsert('restaurant_menu_categories', defined({ ...(categoryData as Row), business_id: ctx.ownerUid,
      is_active: categoryData.is_active ?? true }), this.session.codec(), this.tenancy(ctx));
    const ref = doc(this.col(ctx, 'menuCategories'), created.id);
    await runTransaction(this.session.db, async (transaction) => { transaction.set(ref, created.data); });
    return decodeRow<MenuCategory>('restaurant_menu_categories', read(await getDoc(ref)));
  }

  async updateCategory(id: string, updates: Partial<MenuCategory>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    await this.updateIfPresent(doc(this.col(ctx, 'menuCategories'), id), encodeUpdate('restaurant_menu_categories', defined(updates as Row), this.session.codec()));
  }

  /** The references a menu item delete must honour: NO ACTION refuses, CASCADE removes in the same batch. */
  private async menuItemDependents(ctx: RestaurantContext, itemId: string) {
    const restricting: Array<[string, string]> = [['orderItems', 'itemId'], ['shrinkageRecords', 'menuItemId'], ['stockTakeItems', 'menuItemId']];
    for (const [name, field] of restricting) {
      const referenced = await getDocs(query(this.col(ctx, name), where(field, '==', itemId), limit(1)));
      if (!referenced.empty) {
        throw pgError(`update or delete on table "restaurant_menu_items" violates foreign key constraint (${name})`, '23503');
      }
    }
    const cascading: DocumentReference[] = [];
    for (const [name, field] of [['inventoryBatches', 'menuItemId'], ['itemModifierGroups', 'itemId'], ['recipes', 'menuItemId']]) {
      const dependents = await getDocs(query(this.col(ctx, name), where(field, '==', itemId), limit(BATCH_BOUND)));
      if (dependents.size >= BATCH_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
      cascading.push(...dependents.docs.map((dependent) => dependent.ref));
    }
    return cascading;
  }

  /** DELETE restaurant_menu_categories WHERE id: its items go with it (CASCADE), subcategories lose the parent (SET NULL). */
  async deleteCategory(id: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const items = await getDocs(query(this.col(ctx, 'menuItems'), where('categoryId', '==', id), limit(BATCH_BOUND)));
    const children = await getDocs(query(this.col(ctx, 'menuCategories'), where('parentId', '==', id), limit(BATCH_BOUND)));
    const refs: DocumentReference[] = [];
    for (const item of items.docs) refs.push(...await this.menuItemDependents(ctx, item.id), item.ref);
    if (refs.length + children.size >= BATCH_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
    const batch = writeBatch(this.session.db);
    refs.forEach((ref) => batch.delete(ref));
    children.docs.forEach((child) => batch.update(child.ref, { parentId: null }));
    batch.delete(doc(this.col(ctx, 'menuCategories'), id));
    await batch.commit();
  }

  async createMenuItem(itemData: Partial<MenuItem> & { category_id: string; name: string; price: number }): Promise<MenuItem> {
    this.session.assertOnline();
    const ctx = await this.context();
    // The screen sends no business_id: the item belongs to the business through its category, as in the source rows.
    const created = encodeInsert('restaurant_menu_items', defined({
      category_id: itemData.category_id,
      name: itemData.name,
      name_he: itemData.name_he,
      name_ar: itemData.name_ar,
      price: itemData.price,
      cost_price: itemData.cost_price ?? 0,
      description: itemData.description ?? null,
      tax_rate: itemData.tax_rate ?? 17,
      is_available: itemData.is_available ?? true,
      prep_time_minutes: itemData.prep_time_minutes ?? 15,
      station: itemData.station ?? 'general',
      allergens: itemData.allergens ?? [],
      calories: itemData.calories,
      image_url: itemData.image_url,
      sort_order: itemData.sort_order ?? 0,
      is_popular: itemData.is_popular ?? false,
      is_new: itemData.is_new ?? false,
      spicy_level: itemData.spicy_level ?? 0,
      dietary_tags: itemData.dietary_tags ?? [],
    }), this.session.codec(), this.tenancy(ctx));
    const ref = doc(this.col(ctx, 'menuItems'), created.id);
    await runTransaction(this.session.db, async (transaction) => { transaction.set(ref, created.data); });
    return decodeRow<MenuItem>('restaurant_menu_items', read(await getDoc(ref)));
  }

  async updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    await this.updateIfPresent(doc(this.col(ctx, 'menuItems'), id), encodeUpdate('restaurant_menu_items', defined(updates as Row), this.session.codec()));
  }

  /**
   * delete_menu_item_secure (absent from the production database, so the source call always failed): a missing item
   * is a no-op, the tenant is the path, and the source foreign keys are honoured.
   */
  async deleteMenuItem(id: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const ref = doc(this.col(ctx, 'menuItems'), id);
    if (!(await getDoc(ref)).exists()) return;
    const cascading = await this.menuItemDependents(ctx, id);
    const batch = writeBatch(this.session.db);
    cascading.forEach((dependent) => batch.delete(dependent));
    batch.delete(ref);
    await batch.commit();
  }

  async listAvailableMenuItems(): Promise<MenuItem[]> {
    const ctx = await this.context();
    const rows = await this.list(query(this.col(ctx, 'menuItems'), where('isAvailable', '==', true), limit(RESTAURANT_LIST_BOUND)), 'restaurant_menu_items');
    return rows.sort((a, b) => collation.compare(String(a.name), String(b.name)) || String(a.id).localeCompare(String(b.id))) as unknown as MenuItem[];
  }

  async verifyMenuPrices(itemIds: string[]) {
    const ctx = await this.context();
    const found = await this.byIds(ctx, 'menuItems', 'restaurant_menu_items', itemIds);
    return [...found.values()].map((row) => ({ id: row.id, price: row.price, name: row.name, is_available: row.is_available })) as Array<Pick<MenuItem, 'id' | 'price' | 'name' | 'is_available'>>;
  }

  async listModifierGroups(businessUid: string): Promise<ModifierGroup[]> {
    const ctx = await this.tenant(businessUid);
    const groups = (await this.list(query(this.col(ctx, 'modifierGroups'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_modifier_groups'))
      .filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => (Number(a.sort_order ?? Infinity) - Number(b.sort_order ?? Infinity)) || String(a.id).localeCompare(String(b.id)));
    const modifiers = await this.byField(ctx, 'modifiers', 'restaurant_modifiers', 'groupId', 'group_id', groups.map((row) => row.id));
    return groups.map((group) => ({ ...group, modifiers: (modifiers.get(String(group.id)) ?? []).sort(byCreation) })) as unknown as ModifierGroup[];
  }

  async createModifierGroup(): Promise<ModifierGroup> {
    return this.unavailable('createModifierGroup');
  }

  async createModifier(): Promise<Modifier> {
    return this.unavailable('createModifier');
  }

  // ---------------------------------------------------------------- staff

  async listStaff(businessUid: string): Promise<RestaurantStaff[]> {
    const ctx = await this.tenant(businessUid);
    const rows = await this.list(query(this.col(ctx, 'restaurantStaff'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_staff');
    return rows.filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => collation.compare(String(a.full_name), String(b.full_name)) || String(a.id).localeCompare(String(b.id))) as unknown as RestaurantStaff[];
  }

  /** PIN, PIN hash and password never reach Firestore: staff authenticate with Firebase accounts and memberships. */
  private withoutCredentials(row: Row): Row {
    return Object.fromEntries(Object.entries(row).filter(([key]) => !CREDENTIAL_COLUMNS.has(key)));
  }

  async createStaff(businessUid: string, staffData: Partial<RestaurantStaff> & { full_name: string }): Promise<RestaurantStaff> {
    this.session.assertOnline();
    const ctx = await this.tenant(businessUid);
    const created = encodeInsert('restaurant_staff', defined({
      full_name: staffData.full_name,
      role: staffData.role ?? 'Waiter',
      restaurant_role: staffData.restaurant_role ?? 'waiter',
      hourly_rate: staffData.hourly_rate ?? 0,
      email: staffData.email,
      phone: staffData.phone,
      assigned_station: staffData.assigned_station,
      business_id: ctx.ownerUid,
      is_active: true,
      is_clocked_in: false,
    }), this.session.codec(), this.tenancy(ctx));
    // The codec writes every column; the credential columns do not exist in the Firestore model, not even as null.
    const data = Object.fromEntries(Object.entries(created.data).filter(([key]) => !CREDENTIAL_FIELDS.has(key)));
    const ref = doc(this.col(ctx, 'restaurantStaff'), created.id);
    await runTransaction(this.session.db, async (transaction) => { transaction.set(ref, data); });
    return decodeRow<RestaurantStaff>('restaurant_staff', read(await getDoc(ref)));
  }

  async updateStaff(id: string, updates: Partial<RestaurantStaff>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const patch = this.withoutCredentials(defined(updates as Row));
    await this.updateIfPresent(doc(this.col(ctx, 'restaurantStaff'), id), encodeUpdate('restaurant_staff', patch, this.session.codec()));
  }

  /**
   * delete_staff_secure (absent from the production database): a missing member is a no-op; restaurant_audit_logs
   * refuses the delete (NO ACTION); orders and void logs lose the reference (SET NULL). References from flows the
   * product never reaches (sessions, payments, reports, reservations, guests) refuse the delete rather than guess.
   */
  async deleteStaff(id: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const ref = doc(this.col(ctx, 'restaurantStaff'), id);
    if (!(await getDoc(ref)).exists()) return;
    const restricting: Array<[string, string]> = [['restaurantAuditLogs', 'staffId'], ['tableSessions', 'serverId'],
      ['restaurantPayments', 'processedBy'], ['dailyReports', 'closedBy'], ['reservations', 'createdBy'], ['guestProfiles', 'preferredServerId'],
      ['cashDrawers', 'openedBy'], ['cashDrawers', 'closedBy'], ['cashTransactions', 'performedBy']];
    for (const [name, field] of restricting) {
      if (!(await getDocs(query(this.col(ctx, name), where(field, '==', id), limit(1)))).empty) {
        throw pgError(`update or delete on table "restaurant_staff" violates foreign key constraint (${name}.${field})`, '23503');
      }
    }
    const batch = writeBatch(this.session.db);
    let writes = 1;
    for (const [name, field] of [['orders', 'serverId'], ['voidLogs', 'approvedBy'], ['voidLogs', 'performedBy']]) {
      const dependents = await getDocs(query(this.col(ctx, name), where(field, '==', id), limit(BATCH_BOUND)));
      writes += dependents.size;
      dependents.docs.forEach((dependent) => batch.update(dependent.ref, { [field]: null }));
    }
    if (writes >= BATCH_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
    batch.delete(ref);
    await batch.commit();
  }

  async setStaffClockedIn(staffId: string, clockedIn: boolean): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    await this.updateIfPresent(doc(this.col(ctx, 'restaurantStaff'), staffId), encodeUpdate('restaurant_staff',
      clockedIn ? { is_clocked_in: true, clocked_in_at: new Date().toISOString() } : { is_clocked_in: false, clocked_in_at: null },
      this.session.codec()));
  }

  async verifyStaffPin(): Promise<StaffPinResult> {
    throw new RestaurantFlowUnavailable('verifyStaffPin', 'AUTH_REPLACED');
  }

  /**
   * authorize_staff_action without a PIN. The approver signs in with their own Firebase account in an isolated,
   * in-memory app; the business owner, or an active super_admin / branch_manager membership of this business,
   * approves. The signed-in approver is kept for the one action that follows, then signed out.
   */
  async authorizeStaffAction(businessUid: string, credential: ApprovalCredential, requiredRole?: string): Promise<StaffAuthorizationResult> {
    if (!('email' in credential)) return { authorized: false, error: 'Manager approval requires a manager account' };
    const ctx = await this.tenant(businessUid);
    const factory = (this.session.client as unknown as { isolatedIdentity?: () => IsolatedIdentity }).isolatedIdentity;
    if (!factory) throw new Error('APPROVER_IDENTITY_UNAVAILABLE');
    const identity = factory();
    let keep = false;
    try {
      let uid: string;
      try {
        uid = (await signInWithEmailAndPassword(identity.auth, credential.email, credential.password)).user.uid;
      } catch (error) {
        return { authorized: false, error: firebaseAuthMessage(error).message };
      }
      let role = 'owner';
      let staffId: string | null = null;
      if (uid !== ctx.ownerUid) {
        const membership = await getDoc(doc(identity.db, 'restaurantMemberships', `${ctx.businessId}__${uid}`)).catch(() => null);
        const data = membership?.exists() ? membership.data() : null;
        if (!data || data.status !== 'active' || data.enabled !== true) return { authorized: false, error: 'Insufficient permissions' };
        role = String(data.role);
        staffId = data.staffId ? String(data.staffId) : null;
      }
      const wanted = requiredRole?.toLowerCase() ?? null;
      const allowed = role === 'owner' || wanted === null || (wanted === 'manager' ? MANAGER_ROLES.includes(role) : role === wanted);
      if (!allowed) return { authorized: false, error: 'Insufficient permissions' };
      let name = credential.email;
      if (staffId) {
        const staff = await getDoc(doc(identity.db, 'businesses', ctx.businessId, 'restaurantStaff', staffId)).catch(() => null);
        if (staff?.exists()) name = String(staff.data().fullName ?? name);
        else staffId = null;
      }
      const key = staffId ?? uid;
      await this.releaseApproval(key);
      const timer = setTimeout(() => { void this.releaseApproval(key); }, APPROVAL_TTL_MS);
      this.approvals.set(key, { identity, uid, staffId, name, businessId: ctx.businessId, ownerUid: ctx.ownerUid, timer });
      keep = true;
      return { authorized: true, staff_id: key, role, name, full_name: name };
    } finally {
      if (!keep) await identity.dispose().catch(() => undefined);
    }
  }

  private async releaseApproval(key: string): Promise<void> {
    const approval = this.approvals.get(key);
    if (!approval) return;
    this.approvals.delete(key);
    clearTimeout(approval.timer);
    await approval.identity.dispose().catch(() => undefined);
  }

  /** Runs one approved action under the approver's identity, then ends the approval whatever the outcome. */
  private async withApproval<T>(authStaffId: string, work: (approval: Approval, ctx: RestaurantContext) => Promise<T>): Promise<T> {
    this.session.assertOnline();
    const approval = this.approvals.get(authStaffId);
    if (!approval) throw new Error('Authorization Required: Manager ID must be provided.');
    try {
      const ctx: RestaurantContext = { uid: approval.uid, businessId: approval.businessId, ownerUid: approval.ownerUid,
        role: 'approver', staffId: approval.staffId };
      return await work(approval, ctx);
    } finally {
      await this.releaseApproval(authStaffId);
    }
  }

  // ---------------------------------------------------------------- service

  private async embedOrders(ctx: RestaurantContext, orders: Row[], withModifiers: boolean): Promise<RestaurantOrder[]> {
    const items = await this.byField(ctx, 'orderItems', 'restaurant_order_items', 'orderId', 'order_id', orders.map((row) => row.id));
    const allItems = [...items.values()].flat();
    const menu = await this.byIds(ctx, 'menuItems', 'restaurant_menu_items', allItems.map((row) => row.item_id));
    const modifiers = withModifiers
      ? await this.byField(ctx, 'orderItemModifiers', 'restaurant_order_item_modifiers', 'orderItemId', 'order_item_id', allItems.map((row) => row.id))
      : null;
    const tables = await this.byIds(ctx, 'tables', 'restaurant_tables', orders.map((row) => row.table_id));
    const staff = await this.byIds(ctx, 'restaurantStaff', 'restaurant_staff', orders.map((row) => row.server_id));
    return orders.map((order) => ({
      ...order,
      items: (items.get(String(order.id)) ?? []).sort(byCreation).map((item) => ({
        ...item,
        menu_item: menu.get(String(item.item_id)) ?? null,
        ...(modifiers ? { modifiers: (modifiers.get(String(item.id)) ?? []).sort(byCreation) } : {}),
      })),
      table: tables.get(String(order.table_id)) ?? null,
      server: staff.get(String(order.server_id)) ?? null,
    })) as unknown as RestaurantOrder[];
  }

  async listActiveSessions(businessUid: string): Promise<TableSession[]> {
    const ctx = await this.tenant(businessUid);
    const sessions = (await this.list(query(this.col(ctx, 'tableSessions'), where('status', '==', 'active'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_table_sessions'))
      .filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => (micros(b.started_at) - micros(a.started_at)) || String(a.id).localeCompare(String(b.id)));
    const tables = await this.byIds(ctx, 'tables', 'restaurant_tables', sessions.map((row) => row.table_id));
    const staff = await this.byIds(ctx, 'restaurantStaff', 'restaurant_staff', sessions.map((row) => row.server_id));
    const orders = await this.byField(ctx, 'orders', 'restaurant_orders', 'sessionId', 'session_id', sessions.map((row) => row.id));
    return sessions.map((session) => ({ ...session, table: tables.get(String(session.table_id)) ?? null,
      server: staff.get(String(session.server_id)) ?? null, orders: orders.get(String(session.id)) ?? [] })) as unknown as TableSession[];
  }

  async startSession(): Promise<TableSession> {
    return this.unavailable('startSession');
  }

  async endSession(sessionId: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const ref = doc(this.col(ctx, 'tableSessions'), sessionId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    await runTransaction(this.session.db, async (transaction) => {
      if (!(await transaction.get(ref)).exists()) return;
      transaction.update(ref, { status: 'closed', endedAt: serverTimestamp(), endedAtMicros: deleteField() });
    });
    const tableId = snapshot.data().tableId;
    if (tableId) {
      await this.updateIfPresent(doc(this.col(ctx, 'tables'), String(tableId)), { status: 'dirty' }).catch(() => undefined);
    }
  }

  /** restaurant_table_sessions has no guest_id column: the source select fails and the screen reads nothing. */
  async getSessionGuestId(): Promise<string | null> {
    return null;
  }

  async listActiveOrders(businessUid: string): Promise<RestaurantOrder[]> {
    const ctx = await this.tenant(businessUid);
    const orders = (await this.list(query(this.col(ctx, 'orders'), where('status', 'in', OPEN_ORDER_STATUSES), limit(RESTAURANT_LIST_BOUND)), 'restaurant_orders'))
      .filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => (micros(b.created_at) - micros(a.created_at)) || String(a.id).localeCompare(String(b.id)));
    return this.embedOrders(ctx, orders, true);
  }

  /** The source numbers orders from a global sequence; here each business counts its own, in the same transaction. */
  async createOrder(businessUid: string, orderData: NewOrderInput): Promise<RestaurantOrder> {
    this.session.assertOnline();
    const ctx = await this.tenant(businessUid);
    const codec = this.session.codec();
    const counterRef = doc(this.col(ctx, 'restaurantCounters'), 'orders');
    let orderRef: DocumentReference | null = null;
    await runTransaction(this.session.db, async (transaction) => {
      const counter = await transaction.get(counterRef);
      const next = counter.exists() ? Number(counter.data().next) : 1;
      const created = encodeInsert('restaurant_orders', defined({
        business_id: ctx.ownerUid,
        table_id: orderData.table_id,
        session_id: orderData.session_id,
        server_id: orderData.server_id,
        guest_id: orderData.guest_id,
        order_type: orderData.order_type ?? 'dine_in',
        status: 'draft',
        subtotal_amount: 0,
        discount_amount: 0,
        discount_percentage: 0,
        tax_amount: 0,
        tip_amount: 0,
        total_amount: 0,
        payment_status: 'pending',
        is_rush: orderData.is_rush ?? false,
        is_vip: orderData.is_vip ?? false,
        course_number: 1,
        notes: orderData.notes,
        currency: orderData.currency,
        order_number: next,
      }), codec, this.tenancy(ctx));
      orderRef = doc(this.col(ctx, 'orders'), created.id);
      transaction.set(orderRef, { ...created.data, itemsTotal: ZERO, ledgerRevision: 0, ledgerItemId: null });
      transaction.set(counterRef, { next: next + 1, lastOrderId: created.id, businessId: ctx.businessId, schemaVersion: 1 });
    });
    return decodeRow<RestaurantOrder>('restaurant_orders', read(await getDoc(orderRef!)));
  }

  async updateOrder(): Promise<void> {
    return this.unavailable('updateOrder');
  }

  /**
   * One order line in one transaction with its order: the line is inserted or changed, and when its amount changes the
   * order's itemsTotal moves by exactly that difference. Returns the line id, or null when an UPDATE found no row.
   */
  private async writeLine(ctx: RestaurantContext, orderId: string, itemId: string | null, fields: Row,
    mode: 'upsert' | 'update', db: Firestore = this.session.db): Promise<string | null> {
    const codec = this.session.codec();
    const orderRef = doc(this.col(ctx, 'orders', db), orderId);
    let resultId: string | null = itemId;
    await runTransaction(db, async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists()) {
        throw pgError('insert or update on table "restaurant_order_items" violates foreign key constraint "restaurant_order_items_order_id_fkey"', '23503');
      }
      const order = orderSnapshot.data();
      let before: DocumentData | null = null;
      let ref = itemId ? doc(this.col(ctx, 'orderItems', db), itemId) : null;
      if (ref) {
        const current = await transaction.get(ref);
        before = current.exists() ? current.data() : null;
        if (before && before.orderId !== orderId) throw new Error('ORDER_ITEM_BELONGS_TO_ANOTHER_ORDER');
      }
      if (!before && mode === 'update') { resultId = null; return; }
      let after: DocumentData;
      if (before) {
        const patch = encodeUpdate('restaurant_order_items', defined(fields), codec);
        after = { ...before, ...patch };
        if (Object.keys(patch).length) transaction.update(ref!, patch);
      } else {
        const created = encodeInsert('restaurant_order_items', defined({ ...fields, id: itemId ?? undefined, order_id: orderId }), codec, this.tenancy(ctx));
        ref = doc(this.col(ctx, 'orderItems', db), created.id);
        resultId = created.id;
        after = { ...created.data, ticketItemId: null };
        transaction.set(ref, after);
      }
      if (!before || !sameLine(before, after)) transaction.update(orderRef, ledgerUpdate(order, String(resultId), before, after));
    });
    return resultId;
  }

  /** Removes one line with its ticket line (CASCADE), clearing void log references (SET NULL), and moves the ledger. */
  private async deleteLine(ctx: RestaurantContext, orderId: string, itemId: string): Promise<void> {
    const ticketItems = await getDocs(query(this.col(ctx, 'ticketItems'), where('orderItemId', '==', itemId), limit(BATCH_BOUND)));
    const modifiers = await getDocs(query(this.col(ctx, 'orderItemModifiers'), where('orderItemId', '==', itemId), limit(BATCH_BOUND)));
    const voidLogs = await getDocs(query(this.col(ctx, 'voidLogs'), where('orderItemId', '==', itemId), limit(BATCH_BOUND)));
    const orderRef = doc(this.col(ctx, 'orders'), orderId);
    const itemRef = doc(this.col(ctx, 'orderItems'), itemId);
    await runTransaction(this.session.db, async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      const itemSnapshot = await transaction.get(itemRef);
      if (!itemSnapshot.exists()) return;
      const item = itemSnapshot.data();
      if (item.orderId !== orderId || !orderSnapshot.exists()) throw new Error('ORDER_ITEM_BELONGS_TO_ANOTHER_ORDER');
      ticketItems.docs.forEach((dependent) => transaction.delete(dependent.ref));
      modifiers.docs.forEach((dependent) => transaction.delete(dependent.ref));
      voidLogs.docs.forEach((dependent) => transaction.update(dependent.ref, { orderItemId: null }));
      transaction.delete(itemRef);
      transaction.update(orderRef, ledgerUpdate(orderSnapshot.data(), itemId, item, null));
    });
  }

  async addOrderItem(params: OrderItemInput): Promise<OrderItem> {
    if (params.modifiers && params.modifiers.length > 0) this.unavailable('addOrderItem.modifiers');
    this.session.assertOnline();
    const ctx = await this.context();
    const id = await this.writeLine(ctx, params.orderId, null, {
      item_id: params.itemId,
      quantity: params.quantity,
      price_at_time: params.priceAtTime,
      notes: params.notes || null,
      status: 'pending',
      is_fired: false,
      course_number: params.courseNumber ?? 1,
      seat_number: params.seatNumber,
      voided: false,
    }, 'upsert');
    return decodeRow<OrderItem>('restaurant_order_items', read(await getDoc(doc(this.col(ctx, 'orderItems'), String(id)))));
  }

  async updateOrderItem(id: string, updates: Partial<OrderItem>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const current = await getDoc(doc(this.col(ctx, 'orderItems'), id));
    if (!current.exists()) return;
    const patch = Object.fromEntries(Object.entries(updates as Row).filter(([key]) => key !== 'id' && key !== 'order_id'));
    await this.writeLine(ctx, String(current.data().orderId), id, patch, 'update');
  }

  /**
   * OrderModal save. Every cart line is upserted, one transaction each, then an existing order's total and tax are
   * written from its ledger: max(0, itemsTotal - discount_amount), and tax as the screen computes it. The source wrote
   * the total first from the screen's own sum and did not check any response; here a failed write is reported.
   */
  async saveOrderCart(orderId: string, lines: CartLineInput[], fire: boolean, totals: { total_amount: number; tax_amount: number } | null): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    for (const line of lines) {
      await this.writeLine(ctx, orderId, line.id ?? null, {
        item_id: line.item_id,
        quantity: line.quantity,
        price_at_time: line.price_at_time,
        notes: line.notes,
        course_number: line.course_number || 1,
        is_fired: fire,
      }, 'upsert');
    }
    if (!totals) return;
    const orderRef = doc(this.col(ctx, 'orders'), orderId);
    await runTransaction(this.session.db, async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) return;
      const total = netOfDiscount(snapshot.data());
      transaction.update(orderRef, encodeUpdate('restaurant_orders', {
        total_amount: total.decimal,
        tax_amount: storedDecimalToNumber(total) * VAT_SHARE,
      }, this.session.codec()));
    });
  }

  /**
   * OrderModal payment: closed with the ledger total. The amount the payment screen showed must match it, so a
   * payment is never recorded against a total the cashier did not see. payment_method keeps its CHECK constraint.
   */
  async closeOrderPaid(orderId: string, payment: OrderPayment): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const orderRef = doc(this.col(ctx, 'orders'), orderId);
    await runTransaction(this.session.db, async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) return;
      const total = netOfDiscount(snapshot.data());
      if (Math.abs(storedDecimalToNumber(total) - payment.total_amount) > 0.005) throw new Error('ORDER_TOTAL_CHANGED');
      transaction.update(orderRef, {
        ...encodeUpdate('restaurant_orders', {
          status: 'closed',
          payment_method: payment.method,
          total_amount: total.decimal,
          tax_amount: storedDecimalToNumber(total) * VAT_SHARE,
        }, this.session.codec()),
        closedAt: serverTimestamp(),
        closedAtMicros: deleteField(),
      });
    });
  }

  /** Cancels the order and every line in one batch under the approver, with one audit record. */
  private async cancelWithApproval(orderId: string, authStaffId: string, variant: 'modal' | 'entry', reason: string): Promise<void> {
    await this.withApproval(authStaffId, async (approval, ctx) => {
      const db = approval.identity.db;
      const orderRef = doc(this.col(ctx, 'orders', db), orderId);
      if (!(await getDoc(orderRef)).exists()) return;
      const items = await getDocs(query(this.col(ctx, 'orderItems', db), where('orderId', '==', orderId), limit(BATCH_BOUND)));
      if (items.size + 2 >= BATCH_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
      const codec = this.session.codec();
      const audit = encodeInsert('restaurant_audit_logs', {
        business_id: ctx.ownerUid,
        actor_id: approval.uid,
        staff_id: approval.staffId,
        action_type: 'ORDER_CANCELLED',
        entity_id: orderId,
        details: variant === 'modal'
          ? { orderId, reason, authorizedBy: authStaffId }
          : { orderId, reason, authorizedBy: authStaffId },
      }, codec, this.tenancy(ctx));
      const batch = writeBatch(db);
      batch.update(orderRef, {
        ...(variant === 'modal'
          ? { status: 'cancelled', notes: `Cancelled by Manager (ID: ${authStaffId})` }
          : { status: 'cancelled', closedAt: serverTimestamp(), closedAtMicros: deleteField() }),
        lastAuditId: audit.id,
      });
      items.docs.forEach((item) => batch.update(item.ref, encodeUpdate('restaurant_order_items',
        variant === 'modal' ? { status: 'cancelled', voided: true, void_reason: 'Full Order Cancelled' } : { voided: true }, codec)));
      batch.set(doc(this.col(ctx, 'restaurantAuditLogs', db), audit.id), audit.data);
      await batch.commit();
    });
  }

  async cancelOrderByManager(orderId: string, authStaffId: string): Promise<void> {
    await this.cancelWithApproval(orderId, authStaffId, 'modal', 'Full Order Cancelled');
  }

  async cancelOrder({ orderId, reason, managerId }: { orderId: string; reason: string; managerId: string }): Promise<void> {
    await this.cancelWithApproval(orderId, managerId, 'entry', reason);
  }

  /**
   * void_order_item_secure as one transaction under the approver: the line is cancelled with the source's note, the
   * ledger drops its amount, and an immutable void log and audit record are written with it. The production function
   * could never complete (it read columns restaurant_staff and restaurant_order_items do not have).
   */
  async voidOrderItem({ itemId, reason, authStaffId }: { itemId: string; reason: string; authStaffId: string }): Promise<void> {
    await this.withApproval(authStaffId, async (approval, ctx) => {
      const db = approval.identity.db;
      const codec = this.session.codec();
      const itemRef = doc(this.col(ctx, 'orderItems', db), itemId);
      const first = await getDoc(itemRef);
      if (!first.exists()) throw new Error('Order item not found');
      const orderRef = doc(this.col(ctx, 'orders', db), String(first.data().orderId));
      await runTransaction(db, async (transaction) => {
        const itemSnapshot = await transaction.get(itemRef);
        const orderSnapshot = await transaction.get(orderRef);
        if (!itemSnapshot.exists() || !orderSnapshot.exists()) throw new Error('Order item not found');
        const item = itemSnapshot.data();
        if (item.status === 'cancelled') throw new Error('ORDER_ITEM_ALREADY_VOIDED');
        const menu = item.itemId ? await transaction.get(doc(this.col(ctx, 'menuItems', db), String(item.itemId))) : null;
        const patch = encodeUpdate('restaurant_order_items', {
          status: 'cancelled',
          notes: `${item.notes ?? ''} [VOID: ${reason} | Auth: ${approval.name}]`,
        }, codec);
        const after = { ...item, ...patch };
        const voidLog = encodeInsert('restaurant_void_logs', {
          business_id: ctx.ownerUid, order_id: orderRef.id, order_item_id: itemId, void_type: 'item',
          original_amount: lineAmount(item).decimal, reason, approved_by: approval.staffId, performed_by: null,
        }, codec, this.tenancy(ctx));
        const audit = encodeInsert('restaurant_audit_logs', {
          business_id: ctx.ownerUid, actor_id: approval.uid, staff_id: approval.staffId, action_type: 'VOID_ITEM', entity_id: itemId,
          details: { reason, order_id: orderRef.id, item_name: menu?.exists() ? (menu.data().nameHe ?? null) : null },
        }, codec, this.tenancy(ctx));
        transaction.update(itemRef, patch);
        if (!sameLine(item, after)) transaction.update(orderRef, ledgerUpdate(orderSnapshot.data(), itemId, item, after));
        transaction.set(doc(this.col(ctx, 'voidLogs', db), voidLog.id), voidLog.data);
        transaction.set(doc(this.col(ctx, 'restaurantAuditLogs', db), audit.id), audit.data);
      });
    });
  }

  /** apply_discount_secure under the approver: the source formula on subtotal_amount, exact, with its audit record. */
  async applyDiscount(params: DiscountInput): Promise<void> {
    await this.withApproval(params.authStaffId, async (approval, ctx) => {
      const db = approval.identity.db;
      const codec = this.session.codec();
      const orderRef = doc(this.col(ctx, 'orders', db), params.orderId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists()) throw pgError('null value in column "business_id" of relation "restaurant_audit_logs" violates not-null constraint', '23502');
        const order = snapshot.data();
        const subtotal = readStoredDecimal(stored(order.subtotalAmount));
        const percentage = encodeNumeric(params.discountPercentage || 0);
        const amount = encodeNumeric(params.discountAmount || 0);
        const pct = readStoredDecimal(percentage);
        const amt = readStoredDecimal(amount);
        let fields: Row;
        if (pct.units > 0n) {
          const scale = subtotal.scale + pct.scale + 2;
          const discountUnits = subtotal.units * pct.units;
          const net = subtotal.units * 10n ** BigInt(pct.scale + 2) - discountUnits;
          fields = { discount_percentage: percentage.decimal, discount_amount: toStoredDecimal(discountUnits, scale).decimal,
            discount_reason: params.reason, total_amount: toStoredDecimal(net > 0n ? net : 0n, scale).decimal };
        } else if (amt.units > 0n) {
          const scale = Math.max(subtotal.scale, amt.scale);
          const net = at(order.subtotalAmount, scale) - amt.units * 10n ** BigInt(scale - amt.scale);
          fields = { discount_percentage: 0, discount_amount: amount.decimal, discount_reason: params.reason,
            total_amount: toStoredDecimal(net > 0n ? net : 0n, scale).decimal };
        } else {
          fields = { discount_percentage: 0, discount_amount: 0, discount_reason: null, total_amount: toStoredDecimal(subtotal.units, subtotal.scale).decimal };
        }
        const audit = encodeInsert('restaurant_audit_logs', {
          business_id: ctx.ownerUid, actor_id: approval.uid, staff_id: approval.staffId, action_type: 'APPLY_DISCOUNT', entity_id: params.orderId,
          details: { discount_amount: params.discountAmount || 0, discount_percentage: params.discountPercentage || 0, reason: params.reason,
            original_total: storedDecimalToNumber(stored(order.totalAmount)) },
        }, codec, this.tenancy(ctx));
        transaction.update(orderRef, { ...encodeUpdate('restaurant_orders', fields, codec), lastAuditId: audit.id });
        transaction.set(doc(this.col(ctx, 'restaurantAuditLogs', db), audit.id), audit.data);
      });
    });
  }

  /**
   * RefundModal: log_business_activity_v2 (REFUND), then the source's follow-up that marks the order refunded when the
   * amount is within 0.01 of its total. Both run in one transaction under the approver, the order bound to its record.
   */
  async refundOrder(businessId: string, params: RefundInput): Promise<void> {
    await this.tenant(businessId);
    await this.withApproval(params.authStaffId, async (approval, ctx) => {
      const db = approval.identity.db;
      const codec = this.session.codec();
      const orderRef = doc(this.col(ctx, 'orders', db), params.orderId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists()) throw pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
        const audit = encodeInsert('restaurant_audit_logs', {
          business_id: ctx.ownerUid, actor_id: approval.uid, staff_id: approval.staffId, action_type: 'REFUND', entity_id: params.orderId,
          details: defined({ amount: params.amount, reason: params.reason, item_ids: params.itemIds, auth_staff_id: params.authStaffId }),
        }, codec, this.tenancy(ctx));
        transaction.set(doc(this.col(ctx, 'restaurantAuditLogs', db), audit.id), audit.data);
        if (Math.abs(storedDecimalToNumber(stored(snapshot.data().totalAmount)) - params.amount) < 0.01) {
          transaction.update(orderRef, { paymentStatus: 'refunded', closedAt: serverTimestamp(), closedAtMicros: deleteField(), lastAuditId: audit.id });
        }
      });
    });
  }

  /**
   * log_business_activity_v2 (supabase/migrations/20260908120000): the business must be the caller's own, and a staff id
   * must name a restaurant_staff row (its foreign key). OrderEntry's allergy override, the one mounted caller, passes the
   * signed-in user id as the staff id, so it fails there as it does in the source, and the screen swallows the error.
   */
  async logActivity(input: ActivityInput): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    if (ctx.role !== 'owner' || (input.p_business_id ?? ctx.uid) !== ctx.uid) throw pgError('Access denied', 'P0001');
    const audit = encodeInsert('restaurant_audit_logs', {
      business_id: ctx.ownerUid, actor_id: ctx.uid, staff_id: input.p_staff_id ?? null, action_type: input.p_activity_type,
      entity_id: input.p_entity_id ?? null, details: input.p_details,
    }, this.session.codec(), this.tenancy(ctx));
    if (input.p_staff_id && !(await getDoc(doc(this.col(ctx, 'restaurantStaff'), input.p_staff_id))).exists()) {
      throw pgError('insert or update on table "restaurant_audit_logs" violates foreign key constraint "restaurant_audit_logs_staff_id_fkey"', '23503');
    }
    const ref = doc(this.col(ctx, 'restaurantAuditLogs'), audit.id);
    await runTransaction(this.session.db, async (transaction) => { transaction.set(ref, audit.data); });
  }

  async processPayment(): Promise<unknown> {
    return this.unavailable('processPayment');
  }

  async processSplitPayment(): Promise<void> {
    return this.unavailable('processSplitPayment');
  }

  // ---------------------------------------------------------------- kitchen

  async listKitchenTickets(businessUid: string): Promise<KitchenTicket[]> {
    const ctx = await this.tenant(businessUid);
    const tickets = (await this.list(query(this.col(ctx, 'kitchenTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES), limit(RESTAURANT_LIST_BOUND)), 'restaurant_kitchen_tickets'))
      .filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => (micros(a.created_at) - micros(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    const items = await this.byField(ctx, 'ticketItems', 'restaurant_ticket_items', 'ticketId', 'ticket_id', tickets.map((row) => row.id));
    const orders = await this.byIds(ctx, 'orders', 'restaurant_orders', tickets.map((row) => row.order_id));
    return tickets.map((ticket) => ({ ...ticket, items: (items.get(String(ticket.id)) ?? []).sort(byCreation),
      order: orders.get(String(ticket.order_id)) ?? null })) as unknown as KitchenTicket[];
  }

  /**
   * create_kitchen_ticket, and the order's move to 'pending'. A fired line that has no ticket line yet gets one; the line
   * records its ticketItemId in the same write, which is what makes a second ticket line for it impossible even when
   * two terminals send at once. The ticket carries the table name, or 'Counter'.
   *
   * Each ticket line costs the Rules document reads, so lines are written TICKET_LINES_PER_WRITE at a time into the
   * one ticket the first write creates; the order moves to 'pending' with the last write. A write interrupted part-way
   * leaves the lines it did not reach unsent, and the next send picks them up.
   */
  async sendToKitchen(orderId: string, station?: string | null): Promise<string | null> {
    this.session.assertOnline();
    const ctx = await this.context();
    const codec = this.session.codec();
    const orderRef = doc(this.col(ctx, 'orders'), orderId);
    const lines = await getDocs(query(this.col(ctx, 'orderItems'), where('orderId', '==', orderId), limit(BATCH_BOUND)));
    const candidates = lines.docs.filter((line) => line.data().isFired === true && (line.data().ticketItemId ?? null) === null);
    const modifierRows = await this.byField(ctx, 'orderItemModifiers', 'restaurant_order_item_modifiers', 'orderItemId', 'order_item_id', candidates.map((line) => line.id));
    const groups = candidates.length ? chunks(candidates, TICKET_LINES_PER_WRITE) : [[]];
    let ticketId: string | null = null;
    for (const [index, group] of groups.entries()) {
      const last = index === groups.length - 1;
      let attemptTicketId: string | null = null;
      await runTransaction(this.session.db, async (transaction) => {
        attemptTicketId = ticketId;
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists()) throw new Error('Order not found or unauthorized');
        const order = orderSnapshot.data();
        let tableName = 'Counter';
        if (!attemptTicketId && order.tableId) {
          const table = await transaction.get(doc(this.col(ctx, 'tables'), String(order.tableId)));
          if (table.exists()) tableName = String(table.data().name);
        }
        const pending: Array<{ ref: DocumentReference; id: string; item: DocumentData }> = [];
        for (const line of group) {
          const current = await transaction.get(line.ref);
          if (!current.exists()) continue;
          const item = current.data();
          if (item.orderId !== orderId || item.isFired !== true || (item.ticketItemId ?? null) !== null) continue;
          pending.push({ ref: line.ref, id: current.id, item });
        }
        const menu = new Map<string, DocumentData | null>();
        for (const { item } of pending) {
          if (!item.itemId || menu.has(String(item.itemId))) continue;
          const snapshot = await transaction.get(doc(this.col(ctx, 'menuItems'), String(item.itemId)));
          menu.set(String(item.itemId), snapshot.exists() ? snapshot.data() : null);
        }
        const ticketed = pending.filter(({ item }) => item.itemId && menu.get(String(item.itemId)));
        if (ticketed.length && !attemptTicketId) {
          const ticket = encodeInsert('restaurant_kitchen_tickets', {
            business_id: ctx.ownerUid, order_id: orderId, table_name: tableName, station: station ?? null, status: 'new',
          }, codec, this.tenancy(ctx));
          attemptTicketId = ticket.id;
          transaction.set(doc(this.col(ctx, 'kitchenTickets'), ticket.id), ticket.data);
        }
        for (const { ref, id, item } of ticketed) {
          const names = (modifierRows.get(id) ?? []).sort(byCreation).map((row) => String(row.modifier_name));
          const ticketItem = encodeInsert('restaurant_ticket_items', {
            ticket_id: attemptTicketId, order_item_id: id, item_name: String(menu.get(String(item.itemId))!.name),
            quantity: item.quantity ?? null, notes: item.notes ?? null, modifiers_text: names.length ? names.join(', ') : null,
          }, codec, this.tenancy(ctx));
          transaction.set(doc(this.col(ctx, 'ticketItems'), ticketItem.id), ticketItem.data);
          transaction.update(ref, { ticketItemId: ticketItem.id });
        }
        if (last) transaction.update(orderRef, { status: 'pending' });
      });
      // Only a committed attempt's ticket counts; a retried attempt recomputed it from what it read.
      ticketId = attemptTicketId;
    }
    return ticketId;
  }

  /** Status moves are stamped with the server's time; the source stamped the terminal's clock. */
  private stamped(table: string, status: string, stamp: string | null): DocumentData {
    return {
      ...encodeUpdate(table, { status }, this.session.codec()),
      ...(stamp ? { [stamp]: serverTimestamp(), [`${stamp}Micros`]: deleteField() } : {}),
    };
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const stamp = status === 'in_progress' ? 'startedAt' : status === 'ready' ? 'completedAt' : status === 'served' ? 'servedAt' : null;
    await this.updateIfPresent(doc(this.col(ctx, 'kitchenTickets'), ticketId), this.stamped('restaurant_kitchen_tickets', status, stamp));
  }

  async updateTicketItemStatus(itemId: string, status: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const stamp = status === 'cooking' ? 'startedAt' : status === 'ready' ? 'completedAt' : null;
    await this.updateIfPresent(doc(this.col(ctx, 'ticketItems'), itemId), this.stamped('restaurant_ticket_items', status, stamp));
  }

  async bumpTicket(ticketId: string): Promise<void> {
    await this.updateTicketStatus(ticketId, 'ready');
  }

  // ---------------------------------------------------------------- reports and analytics

  async listDailyReports(businessUid: string): Promise<DailyReport[]> {
    const ctx = await this.tenant(businessUid);
    const rows = await this.list(query(this.col(ctx, 'dailyReports'), orderBy('date', 'desc'), limit(30)), 'restaurant_daily_reports');
    return rows.filter((row) => row.business_id === ctx.ownerUid) as unknown as DailyReport[];
  }

  async createDailyReport(): Promise<DailyReport> {
    return this.unavailable('createDailyReport');
  }

  async closeBusinessDay(): Promise<unknown> {
    return this.unavailable('closeBusinessDay');
  }

  async listClosedOrders(fromIso: string, toIso: string): Promise<RestaurantOrder[]> {
    const ctx = await this.context();
    const from = encodeUpdate('restaurant_orders', { closed_at: fromIso }, this.session.codec()).closedAt;
    const to = encodeUpdate('restaurant_orders', { closed_at: toIso }, this.session.codec()).closedAt;
    const orders = (await this.list(query(this.col(ctx, 'orders'), where('closedAt', '>=', from), where('closedAt', '<=', to),
      orderBy('closedAt', 'desc'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_orders'))
      .filter((row) => row.status === 'closed')
      .sort((a, b) => (micros(b.closed_at) - micros(a.closed_at)) || String(a.id).localeCompare(String(b.id)));
    return this.embedOrders(ctx, orders, false);
  }

  async listOrderHistory(page: number, pageSize: number, search: string): Promise<RestaurantOrder[]> {
    const ctx = await this.context();
    if (search && !/^-?\d+$/.test(search) && !/^[0-9a-f-]{36}$/i.test(search)) {
      throw pgError(`invalid input syntax for type integer: "${search}"`, '22P02');
    }
    const orders = (await this.list(query(this.col(ctx, 'orders'), where('status', 'in', ['closed', 'cancelled']), limit(RESTAURANT_LIST_BOUND)), 'restaurant_orders'))
      .filter((row) => !search || String(row.order_number) === search || row.id === search)
      // ORDER BY closed_at DESC puts NULLs first.
      .sort((a, b) => (a.closed_at == null ? (b.closed_at == null ? 0 : -1) : b.closed_at == null ? 1 : micros(b.closed_at) - micros(a.closed_at))
        || String(a.id).localeCompare(String(b.id)))
      .slice(page * pageSize, (page + 1) * pageSize);
    return this.embedOrders(ctx, orders, false);
  }

  /**
   * DELETE an order with the source foreign keys: lines, ticket lines, tickets, modifiers and payments go with it
   * (CASCADE); void logs lose their order and line references (SET NULL). One atomic batch.
   */
  async deleteOrder(orderId: string): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const items = await getDocs(query(this.col(ctx, 'orderItems'), where('orderId', '==', orderId), limit(BATCH_BOUND)));
    const itemIds = items.docs.map((item) => item.id);
    const tickets = await getDocs(query(this.col(ctx, 'kitchenTickets'), where('orderId', '==', orderId), limit(BATCH_BOUND)));
    const payments = await getDocs(query(this.col(ctx, 'restaurantPayments'), where('orderId', '==', orderId), limit(BATCH_BOUND)));
    const deletes = new Map<string, DocumentReference>();
    const nulls = new Map<string, { ref: DocumentReference; fields: DocumentData }>();
    [...items.docs, ...tickets.docs, ...payments.docs].forEach((snapshot) => deletes.set(snapshot.ref.path, snapshot.ref));
    for (const part of chunks(itemIds, CHUNK)) {
      for (const name of ['ticketItems', 'orderItemModifiers']) {
        (await getDocs(query(this.col(ctx, name), where('orderItemId', 'in', part)))).docs.forEach((snapshot) => deletes.set(snapshot.ref.path, snapshot.ref));
      }
      (await getDocs(query(this.col(ctx, 'voidLogs'), where('orderItemId', 'in', part)))).docs
        .forEach((snapshot) => nulls.set(snapshot.ref.path, { ref: snapshot.ref, fields: { orderItemId: null } }));
    }
    for (const part of chunks(tickets.docs.map((ticket) => ticket.id), CHUNK)) {
      (await getDocs(query(this.col(ctx, 'ticketItems'), where('ticketId', 'in', part)))).docs.forEach((snapshot) => deletes.set(snapshot.ref.path, snapshot.ref));
    }
    (await getDocs(query(this.col(ctx, 'voidLogs'), where('orderId', '==', orderId), limit(BATCH_BOUND)))).docs.forEach((snapshot) => {
      const previous = nulls.get(snapshot.ref.path);
      nulls.set(snapshot.ref.path, { ref: snapshot.ref, fields: { ...(previous?.fields ?? {}), orderId: null } });
    });
    if (deletes.size + nulls.size + 1 >= BATCH_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
    const batch = writeBatch(this.session.db);
    deletes.forEach((ref) => batch.delete(ref));
    nulls.forEach(({ ref, fields }) => batch.update(ref, fields));
    batch.delete(doc(this.col(ctx, 'orders'), orderId));
    await batch.commit();
  }

  /**
   * EditRestaurantOrderModal: removed lines are deleted and the rest upserted, one ledger transaction each, then the
   * total is the ledger's itemsTotal (the source recomputed it from the lines, without the discount) with subtotal and
   * tax split from it as the screen splits them. Cancelled lines stay out of the total.
   */
  async saveOrderEdit(order: RestaurantOrder, lines: EditedLineInput[]): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const originalIds = order.items?.map((item) => item.id) || [];
    const currentIds = lines.map((line) => line.id).filter(Boolean);
    for (const id of originalIds.filter((id) => !currentIds.includes(id))) await this.deleteLine(ctx, order.id, id);
    for (const line of lines) {
      await this.writeLine(ctx, order.id, line.id ?? null, {
        item_id: line.item_id, quantity: line.quantity, price_at_time: line.price_at_time, notes: line.notes, status: line.status || 'pending',
      }, 'upsert');
    }
    const orderRef = doc(this.col(ctx, 'orders'), order.id);
    await runTransaction(this.session.db, async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) return;
      const total = stored(snapshot.data().itemsTotal);
      const totalNumber = storedDecimalToNumber(total);
      const subtotal = totalNumber / 1.17;
      transaction.update(orderRef, encodeUpdate('restaurant_orders', {
        total_amount: total.decimal, subtotal_amount: subtotal, tax_amount: totalNumber - subtotal,
      }, this.session.codec()));
    });
  }

  async getKpis(today: string): Promise<RealtimeKPIs> {
    const ctx = await this.context();
    const since = micros(today);
    const closedOrders = (await this.list(query(this.col(ctx, 'orders'), where('status', '==', 'closed'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_orders'))
      .filter((row) => micros(row.closed_at) >= since);
    const openOrders = await this.list(query(this.col(ctx, 'orders'), where('status', 'in', OPEN_ORDER_STATUSES), limit(RESTAURANT_LIST_BOUND)), 'restaurant_orders');
    const sessions = (await this.list(query(this.col(ctx, 'tableSessions'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_table_sessions'))
      .filter((row) => micros(row.started_at) >= since);
    const tables = await this.list(query(this.col(ctx, 'tables'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_tables');
    const tickets = await this.list(query(this.col(ctx, 'kitchenTickets'), where('status', 'in', ['new', 'in_progress']), limit(RESTAURANT_LIST_BOUND)), 'restaurant_kitchen_tickets');
    const items86 = await this.list(query(this.col(ctx, 'menuItems'), where('isAvailable', '==', false), limit(RESTAURANT_LIST_BOUND)), 'restaurant_menu_items');
    const amount = (row: Row) => Number(row.total_amount || 0);
    const todaysRevenue = closedOrders.reduce((sum, row) => sum + amount(row), 0);
    const openOrdersValue = openOrders.reduce((sum, row) => sum + amount(row), 0);
    const coversToday = sessions.reduce((sum, row) => sum + Number(row.guest_count || 0), 0);
    const avgCheck = closedOrders.length > 0 ? todaysRevenue / closedOrders.length : 0;
    const now = Date.now();
    const ticketTimes = tickets.map((row) => Math.floor((now - micros(row.created_at)) / 60000));
    return {
      todays_revenue: todaysRevenue,
      open_orders_value: openOrdersValue,
      covers_today: coversToday,
      average_check: avgCheck,
      table_turnover_rate: 0,
      revpash: 0,
      labor_cost_percent: 0,
      open_tables: tables.filter((row) => row.status === 'free').length,
      occupied_tables: tables.filter((row) => row.status === 'occupied').length,
      pending_kitchen_tickets: tickets.length,
      average_ticket_time_minutes: ticketTimes.length ? ticketTimes.reduce((a, b) => a + b, 0) / ticketTimes.length : 0,
      eighty_sixed_items: items86.length,
    };
  }

  // ---------------------------------------------------------------- reservations, waitlist, guests

  private async reservations(ctx: RestaurantContext, date: string | null): Promise<Reservation[]> {
    const base = this.col(ctx, 'reservations');
    const rows = (await this.list(date ? query(base, where('reservationDate', '==', date), limit(RESTAURANT_LIST_BOUND)) : query(base, limit(RESTAURANT_LIST_BOUND)), 'restaurant_reservations'))
      .filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => String(a.reservation_date).localeCompare(String(b.reservation_date))
        || String(a.reservation_time).localeCompare(String(b.reservation_time)) || String(a.id).localeCompare(String(b.id)));
    const guests = await this.byIds(ctx, 'guestProfiles', 'restaurant_guest_profiles', rows.map((row) => row.guest_id));
    return rows.map((row) => ({ ...row, guest: guests.get(String(row.guest_id)) ?? null })) as unknown as Reservation[];
  }

  async listReservations(businessUid: string): Promise<Reservation[]> {
    return this.reservations(await this.tenant(businessUid), null);
  }

  async listReservationsOn(businessUid: string, date: string): Promise<Reservation[]> {
    return this.reservations(await this.tenant(businessUid), date);
  }

  /** The source insert, column for column; the Rules apply trg_validate_reservation_datetime and the date CHECK. */
  async createReservation(businessId: string, data: ReservationInput): Promise<Reservation> {
    this.session.assertOnline();
    const ctx = await this.tenant(businessId);
    const created = encodeInsert('restaurant_reservations', defined({
      business_id: ctx.ownerUid,
      guest_id: data.guest_id,
      guest_name: data.guest_name,
      guest_phone: data.guest_phone,
      guest_email: data.guest_email,
      party_size: data.party_size,
      reservation_date: data.reservation_date,
      reservation_time: data.reservation_time,
      duration_minutes: data.duration_minutes ?? 90,
      table_ids: data.table_ids ?? [],
      status: 'pending',
      notes: data.notes,
      special_requests: data.special_requests,
      source: data.source ?? 'phone',
    }), this.session.codec(), this.tenancy(ctx));
    const ref = doc(this.col(ctx, 'reservations'), created.id);
    await runTransaction(this.session.db, async (transaction) => { transaction.set(ref, created.data); });
    return decodeRow<Reservation>('restaurant_reservations', read(await getDoc(ref)));
  }

  /** A client clock never reaches a timestamp column: seated_at is the server time of the write. */
  private serverStamped(table: string, updates: Row, stampedColumns: string[]): DocumentData {
    const patch = encodeUpdate(table, Object.fromEntries(Object.entries(updates).filter(([column]) => !stampedColumns.includes(column))), this.session.codec());
    for (const column of stampedColumns) {
      if (updates[column] === undefined) continue;
      const field = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      Object.assign(patch, { [field]: updates[column] === null ? null : serverTimestamp(), [`${field}Micros`]: deleteField() });
    }
    return patch;
  }

  async updateReservation(id: string, updates: Partial<Reservation>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    await this.updateIfPresent(doc(this.col(ctx, 'reservations'), id), this.serverStamped('restaurant_reservations', updates as Row, ['seated_at']));
  }

  async listWaitlist(businessUid: string): Promise<Waitlist[]> {
    const ctx = await this.tenant(businessUid);
    const rows = await this.list(query(this.col(ctx, 'waitlist'), where('status', '==', 'waiting'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_waitlist');
    return rows.filter((row) => row.business_id === ctx.ownerUid)
      .sort((a, b) => (micros(a.check_in_time) - micros(b.check_in_time)) || String(a.id).localeCompare(String(b.id))) as unknown as Waitlist[];
  }

  async addToWaitlist(): Promise<Waitlist> {
    return this.unavailable('addToWaitlist');
  }

  async updateWaitlist(id: string, updates: Partial<Waitlist>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    await this.updateIfPresent(doc(this.col(ctx, 'waitlist'), id), this.serverStamped('restaurant_waitlist', updates as Row, ['seated_at']));
  }

  private async guests(ctx: RestaurantContext): Promise<Row[]> {
    return this.list(query(this.col(ctx, 'guestProfiles'), limit(RESTAURANT_LIST_BOUND)), 'restaurant_guest_profiles');
  }

  async listGuests(): Promise<GuestProfile[]> {
    const rows = await this.guests(await this.context());
    // ORDER BY last_visit_date DESC NULLS LAST
    return rows.sort((a, b) => (a.last_visit_date == null ? (b.last_visit_date == null ? 0 : 1) : b.last_visit_date == null ? -1
      : String(b.last_visit_date).localeCompare(String(a.last_visit_date))) || String(a.id).localeCompare(String(b.id))) as unknown as GuestProfile[];
  }

  /** full_name / phone / email ILIKE %text%, evaluated over the business's bounded guest list. */
  async searchGuests(queryText: string): Promise<GuestProfile[]> {
    const needle = queryText.toLocaleLowerCase();
    const rows = await this.guests(await this.context());
    return rows.filter((row) => ['full_name', 'phone', 'email'].some((column) => String(row[column] ?? '').toLocaleLowerCase().includes(needle)))
      .slice(0, 10) as unknown as GuestProfile[];
  }

  async getGuestByPhone(phone: string): Promise<GuestProfile | null> {
    const ctx = await this.context();
    const rows = await this.list(query(this.col(ctx, 'guestProfiles'), where('phone', '==', phone), limit(2)), 'restaurant_guest_profiles');
    if (rows.length > 1) throw pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    return (rows[0] ?? null) as unknown as GuestProfile | null;
  }

  async createGuest(): Promise<GuestProfile> {
    return this.unavailable('createGuest');
  }

  /**
   * The guest detail panel sends the whole profile back with updated_at from the client clock. The columns it changed
   * are written, and updated_at is the server time of the write.
   */
  async updateGuest(id: string, updates: Partial<GuestProfile>): Promise<void> {
    this.session.assertOnline();
    const ctx = await this.context();
    const ref = doc(this.col(ctx, 'guestProfiles'), id);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return;
    const current = decodeRow<Row>('restaurant_guest_profiles', read(snapshot));
    const changed = Object.fromEntries(Object.entries(updates as Row).filter(([column, value]) => column !== 'updated_at'
      && value !== undefined && JSON.stringify(value) !== JSON.stringify(current[column] ?? null)));
    await this.updateIfPresent(ref, { ...encodeUpdate('restaurant_guest_profiles', changed, this.session.codec()),
      updatedAt: serverTimestamp(), updatedAtMicros: deleteField() });
  }

  async recordVisit(): Promise<void> {
    return this.unavailable('recordVisit');
  }

  /** Firestore has no clock to read; reservation times are checked against request.time by the Rules instead. */
  async getServerTimeOffset(): Promise<number> {
    return 0;
  }

  // ---------------------------------------------------------------- operation mode

  async getOrCreateBusinessSettings(ownerUid: string): Promise<BusinessSettings> {
    const ctx = await this.tenant(ownerUid);
    const rows = await this.list(query(this.col(ctx, 'settings'), where('legacyBusinessUserId', '==', ctx.ownerUid), limit(2)), 'business_settings');
    if (rows.length > 1) throw pgError('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    if (!rows.length) return this.unavailable('createBusinessSettings');
    return rows[0] as unknown as BusinessSettings;
  }

  async updateBusinessSettings(): Promise<BusinessSettings> {
    return this.unavailable('updateBusinessSettings');
  }
}
