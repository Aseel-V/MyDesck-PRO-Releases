// Trip row as stored in Supabase
export interface Traveler {
  full_name: string;
  nationality?: string;
  room_type?: 'single' | 'double' | 'triple' | 'suite';
}

export interface ItineraryItem {
  day: number;
  date?: string;
  title: string;
  description: string;
}

export interface Payment {
  date: string;
  amount: number;
  method: 'cash' | 'transfer' | 'card' | 'check';
  receipt_id?: string;
}

export interface Attachment {
  file_name: string;
  url: string;
  type: 'ticket' | 'visa' | 'voucher' | 'other';
  bucket?: string;
  storage_path?: string;
}

export interface TripPaymentPlanSummary {
  plan_id: string | null;
  source: 'native' | 'legacy';
  payment_source?: 'native' | 'legacy_fallback';
  reconciliation_state?: 'aligned' | 'legacy_fallback' | 'legacy_mismatch' | 'ledger_mismatch' | 'allocation_mismatch' | 'schedule_mismatch';
  visa_collection_basis?: 'schedule_date' | 'legacy_receipts';
  business_timezone?: string;
  payment_method: 'card' | 'cash' | 'mixed';
  currency: string;
  sale_total_minor?: number;
  cash_confirmed_minor?: number;
  cash_remaining_minor?: number;
  visa_schedule_total_minor?: number;
  visa_confirmed_minor?: number;
  effective_visa_paid_minor?: number;
  visa_scheduled_through_today_minor?: number;
  /** Contract-v3 compatibility field. Always zero for native schedule-date plans. */
  visa_overdue_unconfirmed_minor?: number;
  visa_future_scheduled_minor?: number;
  confirmed_total_minor?: number;
  effective_confirmed_total_minor?: number;
  total_unpaid_minor?: number;
  /** Contract-v3 compatibility field. Always zero for native schedule-date plans. */
  currently_due_unconfirmed_minor?: number;
  confirmed_installments?: number;
  effective_paid_installment_count?: number;
  partial_installments?: number;
  next_installment_due_date?: string | null;
  next_installment_expected_minor?: number | null;
  next_installment_confirmed_minor?: number | null;
  last_confirmed_visa_at?: string | null;
  last_confirmed_visa_minor?: number | null;
  last_scheduled_visa_date?: string | null;
  last_scheduled_visa_minor?: number | null;
  manual_visa_received_minor?: number;
  manual_confirmed_installments?: number;
  manual_partial_installments?: number;
  last_manual_visa_received_at?: string | null;
  last_manual_visa_received_minor?: number | null;
  derived_payment_status?: 'paid' | 'partial' | 'unpaid';
  card_total_minor: number;
  cash_total_minor: number;
  cash_paid_minor: number;
  stored_cash_paid_minor?: number;
  installment_count: number;
  processed_installments: number;
  scheduled_minor_to_date: number;
  remaining_scheduled_minor: number;
  next_installment_minor: number | null;
  next_installment_date: string | null;
  final_installment_date: string | null;
  authoritative_paid_minor?: number;
  authoritative_remaining_minor?: number;
  authoritative_payment_status?: 'paid' | 'partial' | 'unpaid';
  combined_remaining_minor?: number;
}

export interface TripPaymentPlanDraft {
  plan_id?: string | null;
  card_total: number;
  cash_total: number;
  installment_count: number;
  first_installment_date: string;
}

// Room configuration as JSONB for analytics
export interface RoomConfiguration {
  Single?: number;
  Double?: number;
  Triple?: number;
  Quad?: number;
  Suite?: number;
  Family?: number;
  [key: string]: number | undefined;
}

export interface Trip {
  id: string;
  user_id: string;
  destination: string;
  client_name: string;
  client_phone?: string;

  // Detailed Traveler Management
  travelers: Traveler[];
  travelers_count: number; // Kept for backward compatibility/quick access

  // Itinerary
  itinerary: ItineraryItem[];

  // Dates
  start_date: string;
  end_date: string;

  // Financials
  currency: 'USD' | 'EUR' | 'ILS';
  exchange_rate: number;
  wholesale_cost: number;
  sale_price: number;
  profit: number;
  profit_percentage: number;

  // Payment History
  payments: Payment[];
  payment_date?: string; // One-off payment date
  payment_status: 'paid' | 'partial' | 'unpaid';
  amount_paid: number; // Compatibility mirror of total confirmed receipts
  amount_due: number;
  payment_method?: 'card' | 'cash' | 'mixed' | null;
  card_paid_amount?: number | null;
  cash_paid_amount?: number | null;
  payment_plan_summary?: TripPaymentPlanSummary | null;
  payment_plan?: TripPaymentPlanDraft | null;

  room_type?: RoomConfiguration;
  board_basis?: string;
  hotel_name?: string | null;
  service_type: 'ticket' | 'hotel' | 'both';
  trip_type?: 'one_way' | 'round_trip' | null;
  airline_name?: string | null;
  flight_number?: string | null;
  booking_reference?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_datetime?: string | null;
  arrival_datetime?: string | null;
  return_flight_number?: string | null;
  return_departure_airport?: string | null;
  return_arrival_airport?: string | null;
  return_departure_datetime?: string | null;
  return_arrival_datetime?: string | null;
  ticket_class?: 'economy' | 'premium_economy' | 'business' | 'first' | null;
  ticket_cost_ils?: number | null;
  ticket_notes?: string | null;

  // Multi-Currency Storage (Original Input Preservation)
  wholesale_original_amount?: number;
  wholesale_currency?: string;
  sale_original_amount?: number;
  sale_currency?: string;

  // Documents
  attachments: Attachment[];

  // Checklist
  checklist_flight: boolean;
  checklist_hotel: boolean;
  checklist_payment: boolean;

  notes: string;
  has_itinerary?: boolean;
  source_template_id?: string | null;
  source_template_name?: string | null;
  status: 'active' | 'completed' | 'cancelled' | 'archived';
  export_to_pdf: boolean;
  created_at: string;
  updated_at: string;
}

// Form input used in UI
export interface TripFormData {
  destination: string;
  client_name: string;
  client_phone?: string;

  travelers: Traveler[];
  travelers_count: number;

  itinerary: ItineraryItem[];

  start_date: string;
  end_date: string;

  currency: 'USD' | 'EUR' | 'ILS';
  exchange_rate: number;
  wholesale_cost: number;
  sale_price: number;

  payments: Payment[];
  payment_status: 'paid' | 'partial' | 'unpaid';
  amount_paid: number;
  payment_date?: string;
  payment_method?: 'card' | 'cash' | 'mixed' | null;
  card_paid_amount?: number | null;
  cash_paid_amount?: number | null;
  payment_plan?: TripPaymentPlanDraft | null;
  source_template_id?: string | null;
  source_template_name?: string | null;

  room_type?: RoomConfiguration;
  board_basis?: string;
  hotel_name?: string;
  service_type: 'ticket' | 'hotel' | 'both';
  trip_type?: 'one_way' | 'round_trip' | null;
  airline_name?: string | null;
  flight_number?: string | null;
  booking_reference?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_datetime?: string | null;
  arrival_datetime?: string | null;
  return_flight_number?: string | null;
  return_departure_airport?: string | null;
  return_arrival_airport?: string | null;
  return_departure_datetime?: string | null;
  return_arrival_datetime?: string | null;
  ticket_class?: 'economy' | 'premium_economy' | 'business' | 'first' | null;
  ticket_cost_ils?: number | null;
  ticket_notes?: string | null;

  // Stored Original Values
  wholesale_original_amount?: number;
  wholesale_currency?: string;
  sale_original_amount?: number;
  sale_currency?: string;

  attachments: Attachment[];

  notes?: string;
  status: 'active' | 'completed' | 'cancelled' | 'archived';
}

// Insert type for Supabase
export interface TripInsert {
  user_id: string;
  destination: string;
  client_name: string;
  client_phone?: string;

  travelers?: Traveler[];
  travelers_count?: number;

  itinerary?: ItineraryItem[];

  start_date: string;
  end_date: string;

  currency?: 'USD' | 'EUR' | 'ILS';
  exchange_rate?: number;
  wholesale_cost: number;
  sale_price: number;

  payments?: Payment[];
  payment_status?: 'paid' | 'partial' | 'unpaid';
  amount_paid?: number;
  payment_date?: string;
  payment_method?: 'card' | 'cash' | 'mixed' | null;
  card_paid_amount?: number | null;
  cash_paid_amount?: number | null;
  source_template_id?: string | null;
  source_template_name?: string | null;

  room_type?: RoomConfiguration;
  board_basis?: string;
  hotel_name?: string;
  service_type?: 'ticket' | 'hotel' | 'both';
  trip_type?: 'one_way' | 'round_trip' | null;
  airline_name?: string | null;
  flight_number?: string | null;
  booking_reference?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_datetime?: string | null;
  arrival_datetime?: string | null;
  return_flight_number?: string | null;
  return_departure_airport?: string | null;
  return_arrival_airport?: string | null;
  return_departure_datetime?: string | null;
  return_arrival_datetime?: string | null;
  ticket_class?: 'economy' | 'premium_economy' | 'business' | 'first' | null;
  ticket_cost_ils?: number | null;
  ticket_notes?: string | null;

  wholesale_original_amount?: number;
  wholesale_currency?: string;
  sale_original_amount?: number;
  sale_currency?: string;

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled' | 'archived';

  // computed fields optional
  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Update type for Supabase
export interface TripUpdate {
  destination?: string;
  client_name?: string;
  client_phone?: string;

  travelers?: Traveler[];
  travelers_count?: number;

  itinerary?: ItineraryItem[];

  start_date?: string;
  end_date?: string;

  currency?: 'USD' | 'EUR' | 'ILS';
  exchange_rate?: number;
  wholesale_cost?: number;
  sale_price?: number;

  payments?: Payment[];
  payment_status?: 'paid' | 'partial' | 'unpaid';
  amount_paid?: number;
  payment_date?: string;
  payment_method?: 'card' | 'cash' | 'mixed' | null;
  card_paid_amount?: number | null;
  cash_paid_amount?: number | null;
  source_template_id?: string | null;
  source_template_name?: string | null;

  room_type?: RoomConfiguration;
  board_basis?: string;
  hotel_name?: string;
  service_type?: 'ticket' | 'hotel' | 'both';
  trip_type?: 'one_way' | 'round_trip' | null;
  airline_name?: string | null;
  flight_number?: string | null;
  booking_reference?: string | null;
  departure_airport?: string | null;
  arrival_airport?: string | null;
  departure_datetime?: string | null;
  arrival_datetime?: string | null;
  return_flight_number?: string | null;
  return_departure_airport?: string | null;
  return_arrival_airport?: string | null;
  return_departure_datetime?: string | null;
  return_arrival_datetime?: string | null;
  ticket_class?: 'economy' | 'premium_economy' | 'business' | 'first' | null;
  ticket_cost_ils?: number | null;
  ticket_notes?: string | null;

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled' | 'archived';

  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
  updated_at?: string;
}
