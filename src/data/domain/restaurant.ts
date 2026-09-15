/**
 * Restaurant contract: every data operation the restaurant screens perform.
 *
 * Source tables scope by `business_id = auth.uid()`, the owner uid, so methods that the hooks call with a
 * business context take that uid. Rows are returned in the PostgREST shape the screens already consume,
 * embedded resources included.
 *
 * Staff identity differs by backend: the Supabase backend authorises a manager action with a PIN, the
 * Firebase backend with a Firebase account of the owner or an active manager membership (`approvalCredential`).
 */
import type { Json } from '../../types/supabase';
import type {
  BusinessSettings, DailyReport, GuestProfile, KitchenTicket, MenuCategory, MenuItem, Modifier, ModifierGroup,
  OrderItem, RealtimeKPIs, Reservation, ReservationStatus, RestaurantOrder, RestaurantStaff, RestaurantTable,
  TableSession, TableStatus, TicketStatus, Waitlist,
} from '../../types/restaurant';

/** Tables whose changes the screens follow live (postgres_changes in the source). */
export type RestaurantFeed = 'restaurant_tables' | 'restaurant_orders' | 'restaurant_kitchen_tickets'
  | 'restaurant_table_sessions' | 'restaurant_reservations' | 'restaurant_waitlist';

export interface StaffAuthorizationResult {
  authorized: boolean;
  staff_id?: string;
  full_name?: string;
  name?: string;
  role?: string;
  error?: string;
}

/** What the manager-approval dialog collects: a PIN (Supabase) or a Firebase account (Firebase). */
export type ApprovalCredential = { pin: string } | { email: string; password: string };

export interface StaffPinResult {
  valid: boolean;
  error?: string;
  staff_id?: string;
  full_name?: string;
  role?: string;
  restaurant_role?: string;
  is_clocked_in?: boolean;
  assigned_tables?: string[];
  assigned_station?: string;
  hourly_rate?: number;
}

export interface NewOrderInput {
  table_id?: string | null;
  session_id?: string | null;
  server_id?: string;
  guest_id?: string;
  order_type?: RestaurantOrder['order_type'];
  is_rush?: boolean;
  is_vip?: boolean;
  notes?: string | null;
  currency: string;
}

export interface OrderItemInput {
  orderId: string;
  itemId: string;
  quantity: number;
  priceAtTime: number;
  notes?: string;
  courseNumber?: number;
  seatNumber?: number;
  modifiers?: Array<{ modifier_id: string; name: string; price: number }>;
}

/** One OrderModal cart line: saved lines carry their id. */
export interface CartLineInput {
  id?: string;
  item_id?: string;
  quantity?: number;
  price_at_time?: number;
  notes?: string | null;
  course_number?: number;
}

/** One EditRestaurantOrderModal line: new lines have no id. */
export interface EditedLineInput {
  id?: string;
  item_id: string;
  quantity: number;
  price_at_time: number;
  notes: string | null;
  status: string;
}

export interface OrderPayment {
  method: string;
  total_amount: number;
  tax_amount: number;
}

export interface DiscountInput {
  orderId: string;
  discountAmount?: number;
  discountPercentage?: number;
  reason: string;
  authStaffId: string;
}

export interface RefundInput {
  orderId: string;
  itemIds?: string[];
  amount: number;
  reason: string;
  authStaffId: string;
}

export interface CloseDayInput {
  staffId: string;
  date: string;
  shifts: Json[];
  expenses: Json[];
}

export interface ActivityInput {
  p_activity_type: string;
  p_details: Record<string, unknown>;
  p_business_id?: string | null;
  p_entity_type?: string | null;
  p_entity_id?: string | null;
  p_staff_id?: string | null;
}

export interface PaymentInput {
  orderId: string;
  amount: number;
  method: 'cash' | 'card' | 'split';
  tipAmount?: number;
  processedBy: string;
}

export interface SplitPaymentInput {
  orderId: string;
  payments: Array<{ amount: number; method: 'cash' | 'card'; tipAmount?: number }>;
  processedBy: string;
}

export type ReservationInput = Partial<Reservation> & {
  guest_name: string;
  guest_phone: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
};

export type BusinessSettingsPatch = Partial<Pick<BusinessSettings, 'operation_mode' | 'market_scale_prefix' | 'market_scale_port'>>;

export interface RestaurantRepository {
  /** 'pin' when a manager approves with a PIN, 'account' when with a Firebase account. */
  readonly approvalCredential: 'pin' | 'account';
  /** Whether a staff record stores PIN, e-mail password and similar credentials (Supabase only). */
  readonly staffRecordCredentials: boolean;

  subscribe(feed: RestaurantFeed, businessId: string, onChange: () => void): () => void;

  // Floor and menu
  listTables(businessId: string): Promise<RestaurantTable[]>;
  createTable(businessId: string, table: Partial<RestaurantTable> & { name: string }): Promise<RestaurantTable>;
  updateTable(id: string, updates: Partial<RestaurantTable>): Promise<void>;
  deleteTable(id: string): Promise<void>;
  listMenu(businessId: string): Promise<MenuCategory[]>;
  createCategory(businessId: string, category: Partial<MenuCategory> & { name: string }): Promise<MenuCategory>;
  updateCategory(id: string, updates: Partial<MenuCategory>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  createMenuItem(item: Partial<MenuItem> & { category_id: string; name: string; price: number }): Promise<MenuItem>;
  updateMenuItem(id: string, updates: Partial<MenuItem>): Promise<void>;
  deleteMenuItem(id: string): Promise<void>;
  listAvailableMenuItems(): Promise<MenuItem[]>;
  verifyMenuPrices(itemIds: string[]): Promise<Array<Pick<MenuItem, 'id' | 'price' | 'name' | 'is_available'>>>;
  listModifierGroups(businessId: string): Promise<ModifierGroup[]>;
  createModifierGroup(businessId: string, group: Partial<ModifierGroup> & { name: string }): Promise<ModifierGroup>;
  createModifier(modifier: Partial<Modifier> & { group_id: string; name: string }): Promise<Modifier>;

  // Staff
  listStaff(businessId: string): Promise<RestaurantStaff[]>;
  createStaff(businessId: string, staff: Partial<RestaurantStaff> & { full_name: string }): Promise<RestaurantStaff>;
  updateStaff(id: string, updates: Partial<RestaurantStaff>): Promise<void>;
  deleteStaff(id: string): Promise<void>;
  setStaffClockedIn(staffId: string, clockedIn: boolean): Promise<void>;
  verifyStaffPin(staffId: string, pin: string, businessId: string): Promise<StaffPinResult>;
  authorizeStaffAction(businessId: string, credential: ApprovalCredential, requiredRole?: string): Promise<StaffAuthorizationResult>;

  // Service
  listActiveSessions(businessId: string): Promise<TableSession[]>;
  startSession(businessId: string, params: { tableId: string; guestCount: number; serverId?: string }): Promise<TableSession>;
  endSession(sessionId: string): Promise<void>;
  getSessionGuestId(sessionId: string): Promise<string | null>;
  listActiveOrders(businessId: string): Promise<RestaurantOrder[]>;
  createOrder(businessId: string, order: NewOrderInput): Promise<RestaurantOrder>;
  updateOrder(id: string, updates: Partial<RestaurantOrder>): Promise<void>;
  addOrderItem(params: OrderItemInput): Promise<OrderItem>;
  updateOrderItem(id: string, updates: Partial<OrderItem>): Promise<void>;
  /** OrderModal save: order totals for an existing order (null for a new one), then every cart line. */
  saveOrderCart(orderId: string, lines: CartLineInput[], fire: boolean, totals: { total_amount: number; tax_amount: number } | null): Promise<void>;
  /** OrderModal payment: the order is closed with the amount the payment screen showed. */
  closeOrderPaid(orderId: string, payment: OrderPayment): Promise<void>;
  /** OrderModal cancel after manager approval. */
  cancelOrderByManager(orderId: string, authStaffId: string): Promise<void>;
  cancelOrder(params: { orderId: string; reason: string; managerId: string }): Promise<void>;
  voidOrderItem(params: { itemId: string; reason: string; authStaffId: string }): Promise<void>;
  applyDiscount(params: DiscountInput): Promise<void>;
  refundOrder(businessId: string, params: RefundInput): Promise<void>;
  logActivity(input: ActivityInput): Promise<void>;
  processPayment(ownerUid: string, params: PaymentInput): Promise<unknown>;
  processSplitPayment(ownerUid: string, params: SplitPaymentInput): Promise<void>;

  // Kitchen
  listKitchenTickets(businessId: string): Promise<KitchenTicket[]>;
  sendToKitchen(orderId: string, station?: string | null): Promise<string | null>;
  updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void>;
  updateTicketItemStatus(itemId: string, status: string): Promise<void>;
  bumpTicket(ticketId: string): Promise<void>;

  // Reports and analytics
  listDailyReports(businessId: string): Promise<DailyReport[]>;
  createDailyReport(businessId: string, report: Partial<DailyReport>, currency: string): Promise<DailyReport>;
  closeBusinessDay(input: CloseDayInput): Promise<unknown>;
  listClosedOrders(fromIso: string, toIso: string): Promise<RestaurantOrder[]>;
  listOrderHistory(page: number, pageSize: number, search: string): Promise<RestaurantOrder[]>;
  deleteOrder(orderId: string): Promise<void>;
  saveOrderEdit(order: RestaurantOrder, lines: EditedLineInput[], totals: { total_amount: number; subtotal_amount: number; tax_amount: number }): Promise<void>;
  getKpis(today: string): Promise<RealtimeKPIs>;

  // Reservations, waitlist, guests
  listReservations(businessId: string): Promise<Reservation[]>;
  listReservationsOn(businessId: string, date: string): Promise<Reservation[]>;
  createReservation(businessId: string, reservation: ReservationInput): Promise<Reservation>;
  updateReservation(id: string, updates: Partial<Reservation>): Promise<void>;
  listWaitlist(businessId: string): Promise<Waitlist[]>;
  addToWaitlist(businessId: string, entry: Partial<Waitlist>): Promise<Waitlist>;
  updateWaitlist(id: string, updates: Partial<Waitlist>): Promise<void>;
  listGuests(): Promise<GuestProfile[]>;
  searchGuests(queryText: string): Promise<GuestProfile[]>;
  getGuestByPhone(phone: string): Promise<GuestProfile | null>;
  createGuest(ownerUid: string, guest: Partial<GuestProfile>): Promise<GuestProfile>;
  updateGuest(id: string, updates: Partial<GuestProfile>): Promise<void>;
  recordVisit(params: { guestId: string; amountSpent: number }): Promise<void>;
  /** Server clock minus client clock in milliseconds; 0 when the backend has no clock to offer. */
  getServerTimeOffset(): Promise<number>;

  // Operation mode
  getOrCreateBusinessSettings(ownerUid: string): Promise<BusinessSettings>;
  updateBusinessSettings(ownerUid: string, updates: BusinessSettingsPatch): Promise<BusinessSettings>;
}

export type { ReservationStatus, TableStatus };
