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

  room_type?: string;
  board_basis?: string;

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

  room_type?: string;
  board_basis?: string;

  // Stored Original Values
  wholesale_original_amount?: number;
  wholesale_currency?: string;
  sale_original_amount?: number;
  sale_currency?: string;

  attachments: Attachment[];

  notes?: string;
  status: 'active' | 'completed' | 'cancelled';
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

  room_type?: string;
  board_basis?: string;

  wholesale_original_amount?: number;
  wholesale_currency?: string;
  sale_original_amount?: number;
  sale_currency?: string;

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled';

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

  room_type?: string;

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled';

  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
  updated_at?: string;
}
