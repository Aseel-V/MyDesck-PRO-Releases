export interface AutoRepairVehicle {
  id: string;
  plate_number: string;
  owner_name: string;
  owner_phone: string;
  model: string;
  vin?: string;
  last_odometer?: number;
  color?: string;
  year?: number;
  test_expiry?: string;
  trim_level?: string;
  ownership?: string;
}

export type RepairStatus = 'pending' | 'diagnostics' | 'waiting_parts' | 'working' | 'completed' | 'cancelled';

export interface AutoRepairOrder {
  id: string;
  business_id: string;
  vehicle_id: string;
  status: RepairStatus;
  odometer_reading: number;
  problem_description?: string;
  technician_notes?: string;
  notes?: string | null;
  estimated_completion?: string;
  completed_at?: string;
  parts_total: number;
  labor_total: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  created_at: string;
  
  // Joins
  vehicle?: AutoRepairVehicle;
  items?: AutoRepairItem[];
}

export interface AutoRepairItem {
  id: string;
  order_id: string;
  type: 'part' | 'labor';
  inventory_item_id?: string;
  name: string;
  quantity: number;
  cost: number;
  price: number;
  warranty_days?: number;
}

export interface LedgerEntry {
  id: string;
  customer_phone: string;
  customer_name: string;
  debit: number;
  credit: number;
  balance: number;
  created_at: string;
}
