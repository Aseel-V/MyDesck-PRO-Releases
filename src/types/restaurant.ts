// ============================================================================
// RESTAURANT MODE - COMPLETE TYPE DEFINITIONS
// Version: 2.0.0 | Production-Ready Enterprise Types
// ============================================================================

// ============================================================================
// SECTION 1: ENUMS & STATUS TYPES
// ============================================================================

export type TableStatus = 'free' | 'occupied' | 'billed' | 'reserved' | 'dirty' | 'blocked';
export type StaffRole = 'Waiter' | 'Chef' | 'Manager' | 'Other' | 'Host' | 'Cashier' | 'Kitchen';
export type OrderStatus = 'draft' | 'pending' | 'in_progress' | 'ready' | 'served' | 'billed' | 'closed' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'split';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export type AllergenCode = 
  | 'gluten' | 'dairy' | 'nuts' | 'peanuts' | 'eggs' 
  | 'soy' | 'fish' | 'shellfish' | 'sesame' | 'celery'
  | 'mustard' | 'lupin' | 'molluscs' | 'sulphites';

// Extended User Roles for RBAC
export type UserRole = 
  | 'super_admin' 
  | 'branch_manager' 
  | 'head_chef' 
  | 'waiter' 
  | 'kitchen_staff' 
  | 'cashier' 
  | 'host';

// Session & Ticket Statuses
export type SessionStatus = 'active' | 'billed' | 'closed';
export type TicketStatus = 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled';
export type TicketItemStatus = 'pending' | 'cooking' | 'ready' | 'cancelled';

// Reservation Statuses
export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

// Kitchen Stations
export type KitchenStation = 'grill' | 'fry' | 'salad' | 'bar' | 'expo' | 'dessert' | 'general';

// Table Shapes
export type TableShape = 'round' | 'square' | 'rectangle' | 'booth' | 'bar';

// Floor Zones
export type FloorZone = 'indoor' | 'outdoor' | 'patio' | 'private' | 'bar_area';

// ============================================================================
// SECTION 2: PERMISSION SYSTEM TYPES
// ============================================================================

export interface RolePermissions {
  // Dashboard & Reports
  canViewDashboard: boolean;
  canViewAllReports: boolean;
  canCloseDay: boolean;
  
  // Staff Management
  canManageStaff: boolean;
  canViewStaffCosts: boolean;
  
  // Menu Management
  canEditMenu: boolean;
  canEditPrices: boolean;
  can86Items: boolean;
  
  // Floor & Tables
  canEditFloorPlan: boolean;
  canManageReservations: boolean;
  canAssignTables: boolean;
  
  // Orders
  canTakeOrders: boolean;
  canViewAllOrders: boolean;
  canViewOwnOrdersOnly: boolean;
  canVoidOrders: boolean;
  canVoidItems: boolean;
  
  // Payments
  canProcessPayments: boolean;
  canApplyDiscounts: boolean;
  maxDiscountPercent: number;
  canProcessRefunds: boolean;
  canAccessCashDrawer: boolean;
  
  // Kitchen
  canViewKDS: boolean;
  canBumpTickets: boolean;
  canManageStations: boolean;
  
  // Guest Profiles
  canViewGuestProfiles: boolean;
  canEditGuestProfiles: boolean;
  
  // System
  canAccessSettings: boolean;
  canManageBranches: boolean;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  super_admin: {
    canViewDashboard: true,
    canViewAllReports: true,
    canCloseDay: true,
    canManageStaff: true,
    canViewStaffCosts: true,
    canEditMenu: true,
    canEditPrices: true,
    can86Items: true,
    canEditFloorPlan: true,
    canManageReservations: true,
    canAssignTables: true,
    canTakeOrders: true,
    canViewAllOrders: true,
    canViewOwnOrdersOnly: false,
    canVoidOrders: true,
    canVoidItems: true,
    canProcessPayments: true,
    canApplyDiscounts: true,
    maxDiscountPercent: 100,
    canProcessRefunds: true,
    canAccessCashDrawer: true,
    canViewKDS: true,
    canBumpTickets: true,
    canManageStations: true,
    canViewGuestProfiles: true,
    canEditGuestProfiles: true,
    canAccessSettings: true,
    canManageBranches: true,
  },
  branch_manager: {
    canViewDashboard: true,
    canViewAllReports: true,
    canCloseDay: true,
    canManageStaff: true,
    canViewStaffCosts: true,
    canEditMenu: true,
    canEditPrices: true,
    can86Items: true,
    canEditFloorPlan: true,
    canManageReservations: true,
    canAssignTables: true,
    canTakeOrders: true,
    canViewAllOrders: true,
    canViewOwnOrdersOnly: false,
    canVoidOrders: true,
    canVoidItems: true,
    canProcessPayments: true,
    canApplyDiscounts: true,
    maxDiscountPercent: 100,
    canProcessRefunds: true,
    canAccessCashDrawer: true,
    canViewKDS: true,
    canBumpTickets: true,
    canManageStations: true,
    canViewGuestProfiles: true,
    canEditGuestProfiles: true,
    canAccessSettings: true,
    canManageBranches: false,
  },
  head_chef: {
    canViewDashboard: true,
    canViewAllReports: false,
    canCloseDay: false,
    canManageStaff: false,
    canViewStaffCosts: false,
    canEditMenu: false,
    canEditPrices: false,
    can86Items: true,
    canEditFloorPlan: false,
    canManageReservations: false,
    canAssignTables: false,
    canTakeOrders: false,
    canViewAllOrders: true,
    canViewOwnOrdersOnly: false,
    canVoidOrders: false,
    canVoidItems: false,
    canProcessPayments: false,
    canApplyDiscounts: false,
    maxDiscountPercent: 0,
    canProcessRefunds: false,
    canAccessCashDrawer: false,
    canViewKDS: true,
    canBumpTickets: true,
    canManageStations: true,
    canViewGuestProfiles: false,
    canEditGuestProfiles: false,
    canAccessSettings: false,
    canManageBranches: false,
  },
  waiter: {
    canViewDashboard: false,
    canViewAllReports: false,
    canCloseDay: false,
    canManageStaff: false,
    canViewStaffCosts: false,
    canEditMenu: false,
    canEditPrices: false,
    can86Items: false,
    canEditFloorPlan: false,
    canManageReservations: false,
    canAssignTables: false,
    canTakeOrders: true,
    canViewAllOrders: false,
    canViewOwnOrdersOnly: true,
    canVoidOrders: false,
    canVoidItems: false,
    canProcessPayments: true,
    canApplyDiscounts: true,
    maxDiscountPercent: 10,
    canProcessRefunds: false,
    canAccessCashDrawer: false,
    canViewKDS: false,
    canBumpTickets: false,
    canManageStations: false,
    canViewGuestProfiles: true,
    canEditGuestProfiles: false,
    canAccessSettings: false,
    canManageBranches: false,
  },
  kitchen_staff: {
    canViewDashboard: false,
    canViewAllReports: false,
    canCloseDay: false,
    canManageStaff: false,
    canViewStaffCosts: false,
    canEditMenu: false,
    canEditPrices: false,
    can86Items: true,
    canEditFloorPlan: false,
    canManageReservations: false,
    canAssignTables: false,
    canTakeOrders: false,
    canViewAllOrders: false,
    canViewOwnOrdersOnly: false,
    canVoidOrders: false,
    canVoidItems: false,
    canProcessPayments: false,
    canApplyDiscounts: false,
    maxDiscountPercent: 0,
    canProcessRefunds: false,
    canAccessCashDrawer: false,
    canViewKDS: true,
    canBumpTickets: true,
    canManageStations: false,
    canViewGuestProfiles: false,
    canEditGuestProfiles: false,
    canAccessSettings: false,
    canManageBranches: false,
  },
  cashier: {
    canViewDashboard: false,
    canViewAllReports: false,
    canCloseDay: false,
    canManageStaff: false,
    canViewStaffCosts: false,
    canEditMenu: false,
    canEditPrices: false,
    can86Items: false,
    canEditFloorPlan: false,
    canManageReservations: false,
    canAssignTables: false,
    canTakeOrders: false,
    canViewAllOrders: true,
    canViewOwnOrdersOnly: false,
    canVoidOrders: false,
    canVoidItems: false,
    canProcessPayments: true,
    canApplyDiscounts: true,
    maxDiscountPercent: 10,
    canProcessRefunds: false,
    canAccessCashDrawer: true,
    canViewKDS: false,
    canBumpTickets: false,
    canManageStations: false,
    canViewGuestProfiles: false,
    canEditGuestProfiles: false,
    canAccessSettings: false,
    canManageBranches: false,
  },
  host: {
    canViewDashboard: false,
    canViewAllReports: false,
    canCloseDay: false,
    canManageStaff: false,
    canViewStaffCosts: false,
    canEditMenu: false,
    canEditPrices: false,
    can86Items: false,
    canEditFloorPlan: false,
    canManageReservations: true,
    canAssignTables: true,
    canTakeOrders: false,
    canViewAllOrders: false,
    canViewOwnOrdersOnly: false,
    canVoidOrders: false,
    canVoidItems: false,
    canProcessPayments: false,
    canApplyDiscounts: false,
    maxDiscountPercent: 0,
    canProcessRefunds: false,
    canAccessCashDrawer: false,
    canViewKDS: false,
    canBumpTickets: false,
    canManageStations: false,
    canViewGuestProfiles: true,
    canEditGuestProfiles: false,
    canAccessSettings: false,
    canManageBranches: false,
  },
};

// ============================================================================
// SECTION 3: CORE ENTITY INTERFACES
// ============================================================================

export interface RestaurantTable {
  id: string;
  business_id: string;
  name: string;
  status: TableStatus;
  seats: number;
  min_party_size: number;
  position_x: number;
  position_y: number;
  shape: TableShape;
  zone: FloorZone;
  width: number;
  height: number;
  rotation: number;
  is_mergeable: boolean;
  merged_with?: string[];
  created_at: string;
  // Computed/Join fields
  current_session?: TableSession | null;
  active_order?: RestaurantOrder | null;
  elapsed_minutes?: number;
}

export interface MenuCategory {
  id: string;
  business_id: string;
  name: string;
  name_he?: string;
  name_ar?: string;
  description?: string;
  parent_id?: string;
  sort_order: number;
  is_active: boolean;
  icon?: string;
  color?: string;
  created_at: string;
  // Join fields
  items?: MenuItem[];
  subcategories?: MenuCategory[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  name_he?: string;
  name_ar?: string;
  description: string | null;
  price: number;
  cost_price?: number;
  is_available: boolean;
  tax_rate: number;
  prep_time_minutes: number;
  station: KitchenStation;
  allergen_codes: AllergenCode[];
  /** @deprecated Use allergen_codes instead */
  allergens: string[];
  calories?: number;
  image_url?: string;
  sort_order: number;
  is_popular: boolean;
  is_new: boolean;
  available_from?: string; // HH:mm format
  available_until?: string; // HH:mm format
  available_days?: number[]; // 0-6 (Sun-Sat)
  spicy_level?: number; // 0-3
  dietary_tags?: string[]; // vegetarian, vegan, gluten-free, etc.
  created_at: string;
  // Join fields
  modifier_groups?: ModifierGroup[];
}

export interface RestaurantStaff {
  id: string;
  business_id: string;
  user_id?: string; // Link to auth user if applicable
  full_name: string;
  role: StaffRole;
  restaurant_role: UserRole;
  hourly_rate: number;
  pin_code?: string; // 4-6 digit PIN for clock in/out
  email?: string;
  phone?: string;
  is_active: boolean;
  is_clocked_in: boolean;
  clocked_in_at?: string;
  assigned_tables?: string[];
  assigned_station?: KitchenStation;
  created_at: string;
}

export interface RestaurantOrder {
  id: string;
  business_id: string;
  order_number: number;
  session_id: string | null;
  table_id: string | null;
  server_id?: string;
  guest_id?: string;
  order_type: OrderType;
  status: OrderStatus;
  subtotal_amount: number;
  discount_amount: number;
  discount_percentage: number;
  discount_reason?: string;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  is_rush: boolean;
  is_vip: boolean;
  course_number: number;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  currency: string;
  // Join fields
  items?: OrderItem[];
  table?: RestaurantTable;
  server?: RestaurantStaff;
  guest?: GuestProfile;
  tickets?: KitchenTicket[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string;
  quantity: number;
  price_at_time: number;
  notes: string | null;
  status: TicketItemStatus;
  is_fired: boolean;
  course_number: number;
  seat_number?: number;
  voided: boolean;
  void_reason?: string;
  created_at: string;
  // Join fields
  menu_item?: MenuItem;
  modifiers?: OrderItemModifier[];
}

export interface DailyReport {
  id: string;
  business_id: string;
  date: string;
  z_report_number: number;
  total_sales_cash: number;
  total_sales_card: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  total_refunds: number;
  total_voids: number;
  total_expenses: number;
  total_labor_cost: number;
  net_profit: number;
  total_covers: number;
  total_orders: number;
  average_check: number;
  currency?: string;
  created_at: string;
  closed_by?: string;
  // Join fields
  shifts?: StaffShift[];
  category_breakdown?: CategorySalesBreakdown[];
}

export interface StaffShift {
  id: string;
  report_id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string;
  hours_worked: number;
  total_pay: number;
  tips_earned: number;
  sales_total: number;
  orders_count: number;
  created_at: string;
  // Join fields
  staff?: RestaurantStaff;
}

export interface CategorySalesBreakdown {
  category_id: string;
  category_name: string;
  items_sold: number;
  total_revenue: number;
}

// ============================================================================
// SECTION 4: MODIFIER SYSTEM
// ============================================================================

export interface ModifierGroup {
  id: string;
  business_id: string;
  name: string;
  name_he?: string;
  name_ar?: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  created_at: string;
  // Join fields
  modifiers?: Modifier[];
}

export interface Modifier {
  id: string;
  group_id: string;
  name: string;
  name_he?: string;
  name_ar?: string;
  price_adjustment: number;
  is_available: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_id: string | null;
  modifier_name: string;
  price_adjustment: number;
  created_at: string;
}

// ============================================================================
// SECTION 5: TABLE SESSIONS & KDS
// ============================================================================

export interface TableSession {
  id: string;
  business_id: string;
  table_id: string | null;
  guest_count: number;
  server_id: string | null;
  guest_id?: string;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  notes?: string;
  // Join fields
  table?: RestaurantTable;
  server?: RestaurantStaff;
  orders?: RestaurantOrder[];
  guest?: GuestProfile;
}

export interface KitchenTicket {
  id: string;
  business_id: string;
  order_id: string;
  table_name: string | null;
  server_name?: string;
  station: KitchenStation | null;
  status: TicketStatus;
  priority: number;
  is_rush: boolean;
  is_vip: boolean;
  course_number: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  served_at: string | null;
  // Join fields
  order?: RestaurantOrder;
  items?: TicketItem[];
  // Computed
  elapsed_seconds?: number;
  urgency_level?: 'normal' | 'attention' | 'warning' | 'critical';
}

export interface TicketItem {
  id: string;
  ticket_id: string;
  order_item_id: string;
  item_name: string;
  quantity: number;
  notes: string | null;
  modifiers_text: string | null;
  seat_number?: number;
  status: TicketItemStatus;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  // Join fields
  order_item?: OrderItem;
}

// ============================================================================
// SECTION 6: RESERVATIONS
// ============================================================================

export interface Reservation {
  id: string;
  business_id: string;
  guest_id?: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  party_size: number;
  date: string;
  time: string;
  duration_minutes: number;
  table_ids: string[];
  status: ReservationStatus;
  notes?: string;
  special_requests?: string;
  source: 'phone' | 'website' | 'walk_in' | 'app' | 'whatsapp';
  reminder_sent: boolean;
  confirmation_sent: boolean;
  created_at: string;
  created_by?: string;
  seated_at?: string;
  // Join fields
  tables?: RestaurantTable[];
  guest?: GuestProfile;
}

export interface Waitlist {
  id: string;
  business_id: string;
  guest_name: string;
  guest_phone: string;
  party_size: number;
  estimated_wait_minutes: number;
  quoted_wait_minutes: number;
  check_in_time: string;
  status: 'waiting' | 'notified' | 'seated' | 'left' | 'no_show';
  notes?: string;
  notification_sent_at?: string;
  seated_at?: string;
  table_id?: string;
}

// ============================================================================
// SECTION 7: GUEST PROFILES (USP)
// ============================================================================

export interface GuestProfile {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  visit_count: number;
  total_lifetime_spend: number;
  average_check: number;
  last_visit_date?: string | null;
  favorite_items: string[] | null;
  dietary_restrictions: string[] | null;
  allergy_codes: AllergenCode[];
  /** @deprecated Use allergy_codes instead */
  allergies: string[] | null;
  seating_preference: 'booth' | 'table' | 'patio' | 'bar' | 'any';
  noise_preference?: 'quiet' | 'lively' | 'any' | null;
  preferred_server_id?: string | null;
  notes?: string | null;
  tags: GuestTag[];
  birthdate?: string | null;
  anniversary?: string | null;
  vip_level: 0 | 1 | 2 | 3;
  marketing_opt_in: boolean;
  whatsapp_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

export type GuestTag = 'VIP' | 'Regular' | 'Difficult' | 'Press' | 'Influencer' | 'Friend' | 'Blacklist' | 'Birthday' | 'Anniversary';

export interface GuestVisit {
  id: string;
  guest_id: string;
  business_id: string;
  session_id: string;
  order_ids: string[];
  visit_date: string;
  party_size: number;
  total_spent: number;
  items_ordered: string[];
  feedback_rating?: number;
  feedback_notes?: string;
  server_id?: string;
}

// ============================================================================
// SECTION 8: WHATSAPP INTEGRATION (USP)
// ============================================================================

export interface WhatsAppSettings {
  id: string;
  business_id: string;
  is_enabled: boolean;
  phone_number_id?: string;
  access_token?: string;
  webhook_verify_token?: string;
  templates: WhatsAppTemplates;
  automation_rules: WhatsAppAutomation;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppTemplates {
  reservation_confirmed: string;
  reservation_reminder: string;
  table_ready: string;
  receipt: string;
  feedback_request: string;
  loyalty_update: string;
  birthday_offer: string;
  marketing_promo: string;
}

export interface WhatsAppAutomation {
  send_reservation_confirmation: boolean;
  send_reminder_hours_before: number;
  send_table_ready_notification: boolean;
  send_receipt_after_payment: boolean;
  send_feedback_hours_after: number;
  send_birthday_days_before: number;
}

export interface WhatsAppMessage {
  id: string;
  business_id: string;
  guest_id?: string;
  phone_number: string;
  template_name: string;
  direction: 'outbound' | 'inbound';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  message_content?: string;
  error_message?: string;
  sent_at?: string;
  created_at: string;
}

// ============================================================================
// SECTION 9: AI FORECASTING (USP)
// ============================================================================

export interface DemandForecast {
  id: string;
  business_id: string;
  forecast_date: string;
  day_of_week: number;
  predicted_covers: number;
  predicted_revenue: number;
  predicted_orders: number;
  confidence_score: number;
  weather_condition?: string;
  temperature?: number;
  local_events?: string[];
  is_holiday: boolean;
  staffing_recommendation: StaffingRecommendation;
  prep_recommendations: PrepRecommendation[];
  created_at: string;
}

export interface StaffingRecommendation {
  servers_needed: number;
  kitchen_staff_needed: number;
  hosts_needed: number;
  peak_hours: string[];
  notes?: string;
}

export interface PrepRecommendation {
  item_id: string;
  item_name: string;
  predicted_quantity: number;
  current_stock?: number;
  prep_needed: number;
  priority: 'low' | 'medium' | 'high';
}

export interface HistoricalData {
  date: string;
  day_of_week: number;
  covers: number;
  revenue: number;
  orders: number;
  weather?: string;
  temperature?: number;
  was_holiday: boolean;
  special_notes?: string;
}

// ============================================================================
// SECTION 10: PAYMENT & TRANSACTIONS
// ============================================================================

export interface Payment {
  id: string;
  business_id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  tip_amount: number;
  reference_number?: string;
  card_last_four?: string;
  card_type?: string;
  processed_by: string;
  processed_at: string;
  refunded_at?: string;
  refund_reason?: string;
  created_at: string;
}

export interface CashDrawer {
  id: string;
  business_id: string;
  opened_by: string;
  opened_at: string;
  opening_balance: number;
  expected_balance: number;
  actual_balance?: number;
  closed_by?: string;
  closed_at?: string;
  variance?: number;
  status: 'open' | 'closed';
  transactions: CashTransaction[];
}

export interface CashTransaction {
  id: string;
  drawer_id: string;
  type: 'cash_in' | 'cash_out' | 'sale' | 'refund' | 'tip_out' | 'expense';
  amount: number;
  reference_id?: string;
  notes?: string;
  performed_by: string;
  created_at: string;
}

export interface VoidLog {
  id: string;
  business_id: string;
  order_id?: string;
  order_item_id?: string;
  void_type: 'order' | 'item';
  original_amount: number;
  reason: string;
  approved_by: string;
  performed_by: string;
  created_at: string;
}

// ============================================================================
// SECTION 11: ANALYTICS & REPORTING
// ============================================================================

export interface RealtimeKPIs {
  todays_revenue: number;
  open_orders_value: number;
  covers_today: number;
  average_check: number;
  table_turnover_rate: number;
  revpash: number; // Revenue Per Available Seat Hour
  labor_cost_percent: number;
  open_tables: number;
  occupied_tables: number;
  pending_kitchen_tickets: number;
  average_ticket_time_minutes: number;
  eighty_sixed_items: number;
}

export interface HourlySales {
  hour: number;
  revenue: number;
  orders: number;
  covers: number;
}

export interface ServerPerformance {
  server_id: string;
  server_name: string;
  orders_count: number;
  revenue: number;
  average_check: number;
  tips_earned: number;
  tables_served: number;
  average_table_time: number;
}

export interface CategoryPerformance {
  category_id: string;
  category_name: string;
  items_sold: number;
  revenue: number;
  percentage_of_total: number;
  top_items: Array<{ item_name: string; quantity: number; revenue: number }>;
}

export interface XReport {
  generated_at: string;
  generated_by: string;
  period_start: string;
  total_sales_cash: number;
  total_sales_card: number;
  total_tax: number;
  total_tips: number;
  total_discounts: number;
  total_voids: number;
  orders_count: number;
  covers: number;
  average_check: number;
  category_breakdown: CategorySalesBreakdown[];
  hourly_breakdown: HourlySales[];
}

export interface ZReportResult {
  success: boolean;
  report_id?: string;
  z_report_number?: number;
  date?: string;
  error?: string;
  summary?: {
    total_sales_cash: number;
    total_sales_card: number;
    total_tax: number;
    total_tips: number;
    total_sales: number;
    orders_closed: number;
    covers: number;
    labor_cost: number;
    net_profit: number;
  };
}

// ============================================================================
// SECTION 12: EXTENDED TYPES FOR JOINS
// ============================================================================

export interface MenuItemWithModifiers extends MenuItem {
  modifier_groups: ModifierGroup[];
}

export interface OrderItemWithModifiers extends OrderItem {
  modifiers: OrderItemModifier[];
}

export interface OrderWithDetails extends RestaurantOrder {
  table: RestaurantTable;
  server: RestaurantStaff;
  items: OrderItemWithModifiers[];
  guest?: GuestProfile;
}

export interface TableWithSession extends RestaurantTable {
  current_session: TableSession | null | undefined;
  active_order: RestaurantOrder | null | undefined;
  elapsed_minutes: number;
}

export interface TicketWithItems extends KitchenTicket {
  items: TicketItem[];
  elapsed_seconds: number;
  urgency_level: 'normal' | 'attention' | 'warning' | 'critical';
}

// ============================================================================
// SECTION 13: FLOOR PLAN TYPES
// ============================================================================

export interface FloorPlan {
  id: string;
  business_id: string;
  name: string;
  is_active: boolean;
  width: number;
  height: number;
  background_image_url?: string;
  zones: FloorPlanZone[];
  created_at: string;
  updated_at: string;
}

export interface FloorPlanZone {
  id: string;
  name: string;
  type: FloorZone;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

// ============================================================================
// SECTION 14: UTILITY TYPES
// ============================================================================

export interface RestaurantSettings {
  business_id: string;
  default_tax_rate: number;
  currency: string;
  timezone: string;
  language: string;
  auto_print_kitchen_tickets: boolean;
  auto_print_receipts: boolean;
  require_table_for_dine_in: boolean;
  allow_negative_inventory: boolean;
  default_tip_percentages: number[];
  service_charge_percent?: number;
  auto_close_time?: string;
  expected_table_turnover_minutes: number;
  kitchen_alert_thresholds: {
    attention_minutes: number;
    warning_minutes: number;
    critical_minutes: number;
  };
  whatsapp_enabled: boolean;
}

export interface TimeRange {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface OperatingHours {
  [key: number]: TimeRange | null; // 0-6 for Sun-Sat, null if closed
}
