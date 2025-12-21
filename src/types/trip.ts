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

  // Documents
  attachments: Attachment[];

  notes: string;
  status: 'active' | 'completed' | 'cancelled';
  export_to_pdf: boolean;
  created_at: string;
  updated_at: string;
}

// Form input used in UI
export interface TripFormData {
  destination: string;
  client_name: string;

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

  attachments: Attachment[];

  notes?: string;
  status: 'active' | 'completed' | 'cancelled';
}

// Insert type for Supabase
export interface TripInsert {
  user_id: string;
  destination: string;
  client_name: string;

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

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled';

  // computed fields optional
  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
}

// Update type for Supabase
export interface TripUpdate {
  destination?: string;
  client_name?: string;

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

  attachments?: Attachment[];

  notes?: string;
  status?: 'active' | 'completed' | 'cancelled';

  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
}
