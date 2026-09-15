/**
 * Auto repair (workshop) contract: repair jobs on customer vehicles, and the services and parts added to them.
 *
 * Every source table here scopes by `business_id = business_profiles.id` of the owner, not the owner uid, so
 * the methods take that business id, exactly as the screens pass `profile.id`.
 */
import type { AutoRepairOrder } from '../../types/autoRepair';
import type { CarPart } from '../../types/carParts';

/** The customer_vehicles columns NewCarForm writes. An undefined field is not sent, as in the source request. */
export interface VehicleInput {
  plate_number: string;
  model: string;
  owner_name: string;
  owner_phone?: string;
  color?: string;
  year?: number;
  test_expiry: string | null;
  trim_level?: string;
  ownership?: string;
}

/** The repair_orders columns NewCarForm chooses when it opens a job; the rest are fixed by the flow. */
export interface WorkingOrderInput {
  odometer_reading?: number;
  notes?: string;
  currency: string;
}

/** One element of add_repair_service_transaction's p_items, as AddServiceModal builds it. */
export interface ServiceItemInput {
  type: 'part' | 'labor';
  inventory_item_id: string | null;
  name: string;
  quantity: number;
  cost: number;
  price: number;
}

export interface AutoRepairRepository {
  /** repair_orders with vehicle:customer_vehicles(*) and items:repair_order_items(*), newest first. */
  listRepairOrders(businessId: string): Promise<AutoRepairOrder[]>;
  /** DELETE repair_orders WHERE id; its items cascade. */
  deleteRepairOrder(orderId: string): Promise<void>;
  /** NewCarForm: find the vehicle by plate, create or update it, and open a working order on it. */
  registerVehicleAndOpenOrder(businessId: string, vehicle: VehicleInput, order: WorkingOrderInput): Promise<void>;
  /** AddServiceModal: the business's parts with stock, ordered by part_name. */
  listPartsInStock(businessId: string): Promise<CarPart[]>;
  /** add_repair_service_transaction: consume the stock, add the items and raise the order totals, atomically. */
  addServiceToOrder(orderId: string, items: ServiceItemInput[]): Promise<void>;
}
