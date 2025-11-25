// Trip row as stored in Supabase
export interface Trip {
  id: string;
  user_id: string;
  destination: string;
  client_name: string;
  travelers_count: number;
  start_date: string;
  end_date: string;
  wholesale_cost: number;
  sale_price: number;
  profit: number;
  profit_percentage: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  amount_paid: number;
  amount_due: number;
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
  travelers_count: number;
  start_date: string;
  end_date: string;
  wholesale_cost: number;
  sale_price: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  amount_paid: number;
  notes?: string;
  status: 'active' | 'completed' | 'cancelled';
}

// Insert type for Supabase
export interface TripInsert {
  user_id: string;
  destination: string;
  client_name: string;
  travelers_count: number;
  start_date: string;
  end_date: string;
  wholesale_cost: number;
  sale_price: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  amount_paid: number;
  notes?: string;
  status: 'active' | 'completed' | 'cancelled';

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
  travelers_count?: number;
  start_date?: string;
  end_date?: string;
  wholesale_cost?: number;
  sale_price?: number;
  payment_status?: 'paid' | 'partial' | 'unpaid';
  amount_paid?: number;
  notes?: string;
  status?: 'active' | 'completed' | 'cancelled';

  profit?: number;
  profit_percentage?: number;
  amount_due?: number;

  export_to_pdf?: boolean;
}
