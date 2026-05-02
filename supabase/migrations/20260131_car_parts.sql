-- Migration: Add car_parts table for spare parts inventory
-- Created: 2026-01-31

CREATE TABLE IF NOT EXISTS car_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  description TEXT,
  serial_number TEXT,
  compatible_cars TEXT[], -- Array of compatible car models
  quantity INTEGER DEFAULT 0,
  purchase_price_unit DECIMAL(10,2),
  purchase_price_total DECIMAL(10,2),
  selling_price_unit DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_car_parts_business_id ON car_parts(business_id);
CREATE INDEX IF NOT EXISTS idx_car_parts_serial_number ON car_parts(serial_number);
CREATE INDEX IF NOT EXISTS idx_car_parts_part_name ON car_parts(part_name);

-- Enable Row Level Security
ALTER TABLE car_parts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own business parts" ON car_parts
  FOR SELECT USING (business_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert parts for their business" ON car_parts
  FOR INSERT WITH CHECK (business_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their own business parts" ON car_parts
  FOR UPDATE USING (business_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their own business parts" ON car_parts
  FOR DELETE USING (business_id IN (
    SELECT id FROM business_profiles WHERE user_id = auth.uid()
  ));

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_car_parts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_car_parts_updated_at ON car_parts;
CREATE TRIGGER trigger_car_parts_updated_at
  BEFORE UPDATE ON car_parts
  FOR EACH ROW
  EXECUTE FUNCTION update_car_parts_updated_at();
