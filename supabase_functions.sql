-- Run this in your Supabase SQL Editor to enable secure email checking

create or replace function check_email_exists(email_input text)
returns boolean
language plpgsql
security definer -- Allows this function to run with admin privileges (to check auth.users)
as $$
begin
  return exists (
    select 1 
    from auth.users 
    where email = email_input
  );
end;
$$;

-- Grant access to this function for anonymous and authenticated users
grant execute on function check_email_exists(text) to anon, authenticated;

-- MIGRATION: Multi-Business Type & Subscription Updates
-- Run these commands in your Supabase SQL Editor

-- 1. Add columns to business_profiles (idempotent)
ALTER TABLE business_profiles 
ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'tourism',
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_start_date timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS is_suspended boolean DEFAULT false;

-- 2. Add validation check for business_type
ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS check_business_type;

ALTER TABLE business_profiles 
ADD CONSTRAINT check_business_type 
CHECK (business_type IN ('tourism', 'restaurant', 'supermarket', 'phone_shop', 'car_parts', 'clothes_shop', 'furniture_store', 'auto_repair'));

-- 3. Add validation for subscription_status
ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS check_subscription_status;

ALTER TABLE business_profiles 
ADD CONSTRAINT check_subscription_status 
CHECK (subscription_status IN ('active', 'past_due', 'trial'));

-- 4. Correct FK Constraints (Fixing the 409 Conflict)
-- Ensure business_id references business_profiles(id), NOT users(id)

-- Customer Vehicles FK
ALTER TABLE customer_vehicles DROP CONSTRAINT IF EXISTS customer_vehicles_business_id_fkey;
ALTER TABLE customer_vehicles
  ADD CONSTRAINT customer_vehicles_business_id_fkey 
  FOREIGN KEY (business_id) 
  REFERENCES business_profiles(id);

-- Repair Orders FK
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_business_id_fkey;
ALTER TABLE repair_orders
  ADD CONSTRAINT repair_orders_business_id_fkey 
  FOREIGN KEY (business_id) 
  REFERENCES business_profiles(id);

-- 5. Add missing columns (Fixing 400 Bad Request errors)
ALTER TABLE repair_orders 
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'working',
ADD COLUMN IF NOT EXISTS odometer_reading bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;

-- 4. RLS Policies for Auto Repair Tables

-- CUSTOMER VEHICLES
ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owners can view their customers' vehicles" ON customer_vehicles;
CREATE POLICY "Business owners can view their customers' vehicles"
ON customer_vehicles FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM business_profiles WHERE id = customer_vehicles.business_id
  )
);

DROP POLICY IF EXISTS "Business owners can insert vehicles" ON customer_vehicles;
CREATE POLICY "Business owners can insert vehicles"
ON customer_vehicles FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM business_profiles WHERE id = customer_vehicles.business_id
  )
);

DROP POLICY IF EXISTS "Business owners can update their vehicles" ON customer_vehicles;
CREATE POLICY "Business owners can update their vehicles"
ON customer_vehicles FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM business_profiles WHERE id = customer_vehicles.business_id
  )
);

-- REPAIR ORDERS
ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owners can view their repair orders" ON repair_orders;
CREATE POLICY "Business owners can view their repair orders"
ON repair_orders FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM business_profiles WHERE id = repair_orders.business_id
  )
);

DROP POLICY IF EXISTS "Business owners can insert repair orders" ON repair_orders;
CREATE POLICY "Business owners can insert repair orders"
ON repair_orders FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM business_profiles WHERE id = repair_orders.business_id
  )
);

DROP POLICY IF EXISTS "Business owners can update repair orders" ON repair_orders;
CREATE POLICY "Business owners can update repair orders"
ON repair_orders FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM business_profiles WHERE id = repair_orders.business_id
  )
);
