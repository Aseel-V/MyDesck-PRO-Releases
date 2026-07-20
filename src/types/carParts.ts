// Car Parts Inventory Types

export interface CarPart {
  id: string;
  business_id: string;
  part_name: string;
  description: string | null;
  serial_number: string | null;
  compatible_cars: string[] | null;
  quantity: number;
  purchase_price_unit: number | null;
  purchase_price_total: number | null;
  selling_price_unit: number | null;
  created_at: string;
  updated_at: string;
}

export interface CarPartInput {
  part_name: string;
  description?: string;
  serial_number?: string;
  compatible_cars?: string[];
  quantity: number;
  purchase_price_unit?: number;
  purchase_price_total?: number;
  selling_price_unit?: number;
}
