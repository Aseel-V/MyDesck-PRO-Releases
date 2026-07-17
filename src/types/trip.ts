// Trip row as stored in Supabase
export interface Traveler {
  full_name: string;
  passport_number?: string;
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
  amount_paid: number; // Calculated sum of payments
  amount_due: number;
  payment_method?: 'card' | 'cash' | 'mixed' | null;
  card_paid_amount?: number | null;
  cash_paid_amount?: number | null;

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

  room_type?: RoomConfiguration;
  board_basis?: string;
  hotel_name?: string;
  service_type: 'ticket' | 'hotel' | 'both';

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

  room_type?: RoomConfiguration;
  board_basis?: string;
  hotel_name?: string;
  service_type?: 'ticket' | 'hotel' | 'both';

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

  room_type?: RoomConfiguration;
  hotel_name?: string;
  service_type?: 'ticket' | 'hotel' | 'both';

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled' | 'archived';

  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
  updated_at?: string;
}
