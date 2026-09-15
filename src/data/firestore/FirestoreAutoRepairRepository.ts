import {
  collection, doc, documentId, getDocs, limit, orderBy, query, runTransaction, where, writeBatch,
  type CollectionReference, type DocumentData,
} from 'firebase/firestore';
import type { AutoRepairItem, AutoRepairOrder, AutoRepairVehicle } from '../../types/autoRepair';
import type { CarPart } from '../../types/carParts';
import type { AutoRepairRepository, ServiceItemInput, VehicleInput, WorkingOrderInput } from '../domain/autoRepair';
import { decodeRow, encodeInsert, encodeUpdate } from './documentCodec';
import { addStoredDecimals, encodeNumeric, readStoredDecimal, toStoredDecimal, type StoredDecimal } from './exactValues';
import type { FirebaseSession } from './FirebaseSession';

/** PostgREST caps an unpaginated select at max_rows (1000 on the hosted project); the same bound applies. */
export const AUTO_REPAIR_LIST_BOUND = 1000;
const IN_QUERY_CHUNK = 30;
const CASCADE_BOUND = 450;

type Row = Record<string, unknown>;
const read = (snapshot: { data(options?: { serverTimestamps?: 'estimate' }): DocumentData | undefined }) =>
  snapshot.data({ serverTimestamps: 'estimate' }) ?? {};
/** A request body without the fields the UI left undefined, which PostgREST never receives. */
const defined = <T extends Row>(row: T): Row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
const chunks = <T>(values: T[], size: number): T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
/** ORDER BY on text follows the source database collation (en_US.UTF-8). */
const collation = new Intl.Collator('en-US');

/** vehiclePlates/{key}: the lowercase hex SHA-256 of the exact plate text, the replacement for UNIQUE(business_id, plate_number). */
export async function vehiclePlateKey(plate: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plate));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const ZERO: StoredDecimal = toStoredDecimal(0n, 0);
const stored = (value: unknown): StoredDecimal => (value === null || value === undefined ? ZERO : (value as StoredDecimal));
const times = (value: StoredDecimal, quantity: number): StoredDecimal => {
  const { units, scale } = readStoredDecimal(value);
  return toStoredDecimal(units * BigInt(quantity), scale);
};
const sameAmount = (a: StoredDecimal, b: StoredDecimal) => {
  const left = readStoredDecimal(a); const right = readStoredDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  return left.units * 10n ** BigInt(scale - left.scale) === right.units * 10n ** BigInt(scale - right.scale);
};

/**
 * Auto repair on Firestore.
 *
 *   businesses/{businessId}/repairOrders/{id}       repair_orders
 *   businesses/{businessId}/repairOrderItems/{id}   repair_order_items
 *   businesses/{businessId}/vehicles/{id}           customer_vehicles
 *   businesses/{businessId}/vehiclePlates/{key}     UNIQUE(business_id, plate_number)
 *   businesses/{businessId}/parts/{id}              car_parts
 *   businesses/{businessId}/repairServices/{id}     one immutable record per add_repair_service_transaction call
 *
 * The source tables scope by business_id = the owner's business_profiles.id; the path fixes the tenant and the
 * Rules admit only its owner. The source RPC was SECURITY DEFINER without an ownership check and stored the
 * prices the client sent; here the service is priced from the inventory inside the transaction, and the Rules
 * recompute every amount from the documents before and after the write.
 */
export class FirestoreAutoRepairRepository implements AutoRepairRepository {
  constructor(private readonly session: FirebaseSession) {}

  private async tenant(businessId: string) {
    const business = await this.session.requireOwnedBusiness();
    if (business.businessId !== businessId) throw new Error('TENANT_MISMATCH');
    return business;
  }

  private scoped(businessId: string, name: string): CollectionReference {
    return collection(this.session.db, 'businesses', businessId, name);
  }

  async listRepairOrders(businessId: string): Promise<AutoRepairOrder[]> {
    await this.tenant(businessId);
    const orderDocs = await getDocs(query(this.scoped(businessId, 'repairOrders'), orderBy('createdAt', 'desc'), limit(AUTO_REPAIR_LIST_BOUND)));
    const orders = orderDocs.docs.map((snapshot) => decodeRow<Row>('repair_orders', read(snapshot)))
      .filter((row) => row.business_id === businessId);

    const vehicles = new Map<string, Row>();
    const vehicleIds = [...new Set(orders.map((row) => String(row.vehicle_id)))];
    for (const ids of chunks(vehicleIds, IN_QUERY_CHUNK)) {
      const found = await getDocs(query(this.scoped(businessId, 'vehicles'), where(documentId(), 'in', ids)));
      for (const snapshot of found.docs) {
        const vehicle = decodeRow<Row>('customer_vehicles', read(snapshot));
        if (vehicle.business_id === businessId) vehicles.set(String(vehicle.id), vehicle);
      }
    }

    const items = new Map<string, Row[]>();
    for (const ids of chunks(orders.map((row) => String(row.id)), IN_QUERY_CHUNK)) {
      const found = await getDocs(query(this.scoped(businessId, 'repairOrderItems'), where('orderId', 'in', ids)));
      for (const snapshot of found.docs) {
        const item = decodeRow<Row>('repair_order_items', read(snapshot));
        const list = items.get(String(item.order_id)) ?? [];
        list.push(item);
        items.set(String(item.order_id), list);
      }
    }
    const byCreation = (a: Row, b: Row) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));

    return orders.map((row) => ({
      ...row,
      vehicle: (vehicles.get(String(row.vehicle_id)) ?? null) as unknown as AutoRepairVehicle,
      items: (items.get(String(row.id)) ?? []).sort(byCreation) as unknown as AutoRepairItem[],
    })) as unknown as AutoRepairOrder[];
  }

  /**
   * DELETE repair_orders WHERE id, with repair_order_items ON DELETE CASCADE. The service records of the order go
   * with it, in the same atomic batch; the Rules allow those deletes only when the order itself is deleted.
   */
  async deleteRepairOrder(orderId: string): Promise<void> {
    this.session.assertOnline();
    const { businessId } = await this.session.requireOwnedBusiness();
    const [items, services] = await Promise.all([
      getDocs(query(this.scoped(businessId, 'repairOrderItems'), where('orderId', '==', orderId), limit(CASCADE_BOUND))),
      getDocs(query(this.scoped(businessId, 'repairServices'), where('orderId', '==', orderId), limit(CASCADE_BOUND))),
    ]);
    if (items.size + services.size >= CASCADE_BOUND) throw new Error('CASCADE_BATCH_BOUND_EXCEEDED');
    const batch = writeBatch(this.session.db);
    items.docs.forEach((snapshot) => batch.delete(snapshot.ref));
    services.docs.forEach((snapshot) => batch.delete(snapshot.ref));
    batch.delete(doc(this.scoped(businessId, 'repairOrders'), orderId));
    await batch.commit();
  }

  /**
   * NewCarForm in one transaction: the plate index decides whether the vehicle exists (the source's lookup by
   * business and plate), the vehicle is created with its index or updated, and the working order is opened.
   * The source ran these as separate requests, so a failed order insert could leave a new vehicle behind.
   */
  async registerVehicleAndOpenOrder(businessId: string, vehicle: VehicleInput, order: WorkingOrderInput): Promise<void> {
    this.session.assertOnline();
    const { uid } = await this.tenant(businessId);
    const ctx = this.session.codec();
    const plates = this.scoped(businessId, 'vehiclePlates');
    const plateRef = doc(plates, await vehiclePlateKey(vehicle.plate_number));
    const tenancy = { ownerUid: uid, businessId };
    await runTransaction(this.session.db, async (transaction) => {
      const vehicleData = defined({ business_id: businessId, ...vehicle, updated_at: new Date().toISOString() });
      const plate = await transaction.get(plateRef);
      let vehicleId: string;
      if (plate.exists()) {
        vehicleId = String(plate.data().vehicleId);
        const vehicleRef = doc(this.scoped(businessId, 'vehicles'), vehicleId);
        if (!(await transaction.get(vehicleRef)).exists()) throw new Error('VEHICLE_PLATE_INDEX_DANGLING');
        transaction.update(vehicleRef, encodeUpdate('customer_vehicles', vehicleData, ctx));
      } else {
        const created = encodeInsert('customer_vehicles', { ...vehicleData, created_at: new Date().toISOString() }, ctx, tenancy);
        vehicleId = created.id;
        transaction.set(doc(this.scoped(businessId, 'vehicles'), vehicleId), created.data);
        transaction.set(plateRef, { plateNumber: vehicle.plate_number, vehicleId, businessId, schemaVersion: 1 });
      }
      const opened = encodeInsert('repair_orders', defined({
        business_id: businessId, vehicle_id: vehicleId, status: 'working', odometer_reading: order.odometer_reading,
        notes: order.notes, total_amount: 0, currency: order.currency, created_at: new Date().toISOString(),
      }), ctx, tenancy);
      transaction.set(doc(this.scoped(businessId, 'repairOrders'), opened.id), opened.data);
    });
  }

  async listPartsInStock(businessId: string): Promise<CarPart[]> {
    await this.tenant(businessId);
    const rows = await getDocs(query(this.scoped(businessId, 'parts'), where('quantity', '>', 0), limit(AUTO_REPAIR_LIST_BOUND)));
    return rows.docs.map((snapshot) => decodeRow<CarPart>('car_parts', read(snapshot)))
      .filter((row) => row.business_id === businessId)
      .sort((a, b) => collation.compare(a.part_name, b.part_name) || a.id.localeCompare(b.id));
  }

  /**
   * add_repair_service_transaction as one Firestore transaction: lock-read the order and the part, refuse missing
   * rows and insufficient stock with the source messages, decrement the stock, add the items, and add the amounts
   * to parts_total, labor_total and total_amount with NUMERIC semantics (exact, aligned to the larger scale).
   *
   * A part is priced at selling_price_unit x quantity and costed at purchase_price_unit x quantity as read in the
   * transaction. If that differs from the price the screen showed, the call fails instead of charging a different
   * amount. The screen adds at most one part and one labor line per call, which is the shape supported here.
   */
  async addServiceToOrder(orderId: string, items: ServiceItemInput[]): Promise<void> {
    const partLines = items.filter((item) => item.type === 'part');
    const laborLines = items.filter((item) => item.type === 'labor');
    if (partLines.length > 1 || laborLines.length > 1 || partLines.length + laborLines.length !== items.length) {
      throw new Error('REPAIR_SERVICE_SHAPE_UNSUPPORTED');
    }
    if (!items.length) return;
    const [partLine] = partLines;
    const [laborLine] = laborLines;
    if (partLine && (!Number.isSafeInteger(partLine.quantity) || partLine.quantity <= 0 || !partLine.inventory_item_id)) {
      throw new Error('REPAIR_SERVICE_PART_QUANTITY_INVALID');
    }

    this.session.assertOnline();
    const { businessId, uid } = await this.session.requireOwnedBusiness();
    const ctx = this.session.codec();
    const orderRef = doc(this.scoped(businessId, 'repairOrders'), orderId);
    const serviceId = ctx.newId();
    const partItemId = partLine ? ctx.newId() : null;
    const laborItemId = laborLine ? ctx.newId() : null;

    await runTransaction(this.session.db, async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists()) throw new Error('Order not found');
      const order = orderSnapshot.data();

      let partPrice = ZERO;
      let partCost = ZERO;
      if (partLine) {
        const partRef = doc(this.scoped(businessId, 'parts'), String(partLine.inventory_item_id));
        const partSnapshot = await transaction.get(partRef);
        if (!partSnapshot.exists()) throw new Error(`Part not found: ${partLine.inventory_item_id}`);
        const part = partSnapshot.data();
        const stock = Number(part.quantity ?? 0);
        if (stock < partLine.quantity) {
          throw new Error(`Insufficient stock for part. Available: ${stock}, Requested: ${partLine.quantity}`);
        }
        partPrice = times(stored(part.sellingPriceUnit), partLine.quantity);
        partCost = times(stored(part.purchasePriceUnit), partLine.quantity);
        if (!sameAmount(partPrice, encodeNumeric(partLine.price, undefined, 2))) throw new Error('REPAIR_SERVICE_PART_PRICE_CHANGED');
        transaction.update(partRef, {
          ...encodeUpdate('car_parts', { quantity: stock - partLine.quantity }, ctx),
          lastRepairServiceId: serviceId,
        });
        const partItem = encodeInsert('repair_order_items', {
          id: partItemId, order_id: orderId, type: 'part', inventory_item_id: partLine.inventory_item_id,
          name: String(part.partName), quantity: partLine.quantity, cost: '0', price: '0', warranty_days: 0,
        }, ctx, { ownerUid: uid, businessId });
        transaction.set(doc(this.scoped(businessId, 'repairOrderItems'), String(partItemId)), {
          ...partItem.data, cost: partCost, price: partPrice, repairServiceId: serviceId,
        });
      }

      const laborPrice = laborLine ? encodeNumeric(laborLine.price) : ZERO;
      if (laborLine) {
        const laborItem = encodeInsert('repair_order_items', {
          id: laborItemId, order_id: orderId, type: 'labor', inventory_item_id: null, name: laborLine.name,
          quantity: 1, cost: laborLine.cost, price: laborLine.price, warranty_days: 0,
        }, ctx, { ownerUid: uid, businessId });
        transaction.set(doc(this.scoped(businessId, 'repairOrderItems'), String(laborItemId)), {
          ...laborItem.data, price: laborPrice, repairServiceId: serviceId,
        });
      }

      transaction.update(orderRef, {
        partsTotal: addStoredDecimals(stored(order.partsTotal), partPrice),
        laborTotal: addStoredDecimals(stored(order.laborTotal), laborPrice),
        totalAmount: addStoredDecimals(stored(order.totalAmount), partPrice, laborPrice),
        updatedAt: ctx.serverTimestamp(),
        updatedAtMicros: ctx.deleteField(),
        lastRepairServiceId: serviceId,
      });
      transaction.set(doc(this.scoped(businessId, 'repairServices'), serviceId), {
        id: serviceId, orderId, actorUid: uid, businessId, ownerUid: uid,
        partId: partLine ? String(partLine.inventory_item_id) : null,
        partQuantity: partLine ? partLine.quantity : 0,
        partPrice, partCost, laborPrice, partItemId, laborItemId,
        createdAt: ctx.serverTimestamp(), schemaVersion: 1,
      });
    });
  }
}
