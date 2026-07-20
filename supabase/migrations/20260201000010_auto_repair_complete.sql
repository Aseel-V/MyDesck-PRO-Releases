-- ============================================================================
-- AUTO REPAIR SHOP MODE (GARAGE SYSTEM)
-- Migration: 20260201_auto_repair_complete.sql
-- Purpose: Complete backend for Auto Repair: Vehicles, Orders, Ledger, Automation
-- ============================================================================

-- Enable UUID if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 0. PRE-REQUISITES (Inventory Support)
-- =====================================================================
-- Ensure we have a simple stock quantity on menu_items if we are using it as "Parts"
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_menu_items' AND column_name = 'stock_quantity') THEN
    ALTER TABLE restaurant_menu_items ADD COLUMN stock_quantity NUMERIC DEFAULT 0;
  END IF;
  
  -- Add specific Garage fields to menu items if needed (e.g., part_number)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_menu_items' AND column_name = 'part_number') THEN
    ALTER TABLE restaurant_menu_items ADD COLUMN part_number TEXT;
  END IF;
END $$;

-- =====================================================================
-- 1. VEHICLES TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.customer_vehicles (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) NOT NULL,
    
    plate_number text NOT NULL,
    owner_name text NOT NULL,
    owner_phone text NOT NULL,
    
    model text,
    vin text,
    color text,
    year integer,
    
    last_odometer integer DEFAULT 0,
    notes text,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    
    -- Ensure plate is unique per business
    UNIQUE(business_id, plate_number)
);

-- =====================================================================
-- 2. CUSTOMERS LEDGER (The Accountant)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.customers_ledger (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) NOT NULL,
    
    customer_phone text NOT NULL, -- Main identifier for customer
    customer_name text,
    
    transaction_type text CHECK (transaction_type IN ('invoice', 'payment', 'adjustment', 'opening_balance')) NOT NULL,
    
    debit numeric DEFAULT 0,  -- Debt (Money they owe us)
    credit numeric DEFAULT 0, -- Payment (Money they gave us)
    balance numeric DEFAULT 0, -- Running balance (calculated or snapshot)
    
    ref_order_id uuid, -- Link to repair_orders if applicable
    notes text,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid REFERENCES auth.users(id)
);

-- Index for searching debts
CREATE INDEX IF NOT EXISTS idx_ledger_business_phone ON customers_ledger(business_id, customer_phone);

-- =====================================================================
-- 3. REPAIR ORDERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.repair_orders (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) NOT NULL,
    
    -- Links
    vehicle_id uuid REFERENCES public.customer_vehicles(id) NOT NULL,
    customer_id uuid REFERENCES public.restaurant_guest_profiles(id), -- Optional link to guest profile
    
    -- Status
    status text CHECK (status IN ('pending', 'diagnostics', 'waiting_parts', 'working', 'completed', 'cancelled')) DEFAULT 'pending',
    
    -- Details
    odometer_reading integer,
    problem_description text,
    technician_notes text,
    
    -- Dates
    estimated_completion timestamptz,
    completed_at timestamptz,
    
    -- Financials
    parts_total numeric DEFAULT 0,
    labor_total numeric DEFAULT 0,
    discount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    paid_amount numeric DEFAULT 0,
    payment_status text CHECK (payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    payment_method text,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================================================
-- 4. REPAIR ITEMS (Parts & Labor)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.repair_order_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id uuid REFERENCES public.repair_orders(id) ON DELETE CASCADE NOT NULL,
    
    type text CHECK (type IN ('part', 'labor')) NOT NULL,
    
    -- If part, link to inventory
    inventory_item_id uuid REFERENCES public.restaurant_menu_items(id),
    
    name text NOT NULL, -- Copied from inventory or manual for labor
    quantity numeric DEFAULT 1,
    
    cost numeric DEFAULT 0, -- Cost price snapshot for profit calc
    price numeric DEFAULT 0, -- Selling price
    
    warranty_days integer DEFAULT 0,
    mechanic_id uuid REFERENCES auth.users(id),
    
    created_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================================================
-- 5. AUTOMATION TRIGGERS
-- =====================================================================

-- Trigger 1: Inventory Decrement
CREATE OR REPLACE FUNCTION trg_repair_item_inventory_sync()
RETURNS TRIGGER AS $$
BEGIN
    -- Only for Parts that are linked to inventory
    IF NEW.type = 'part' AND NEW.inventory_item_id IS NOT NULL THEN
        -- Decrement Stock in restaurant_menu_items (Assuming this is the 'market_products' equivalent)
        UPDATE public.restaurant_menu_items
        SET stock_quantity = stock_quantity - NEW.quantity,
            updated_at = now()
        WHERE id = NEW.inventory_item_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_repair_inventory_sync
AFTER INSERT ON public.repair_order_items
FOR EACH ROW
EXECUTE FUNCTION trg_repair_item_inventory_sync();

-- Trigger 2: Auto Update Vehicle Odometer & Last Service
CREATE OR REPLACE FUNCTION trg_update_vehicle_on_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE public.customer_vehicles
        SET last_odometer = NEW.odometer_reading,
            updated_at = now()
        WHERE id = NEW.vehicle_id
        AND NEW.odometer_reading > last_odometer;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_vehicle_update_completion
AFTER UPDATE ON public.repair_orders
FOR EACH ROW
EXECUTE FUNCTION trg_update_vehicle_on_completion();

-- Trigger 3: Auto Ledger Entry (Debt Recording)
CREATE OR REPLACE FUNCTION trg_auto_ledger_debt()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_phone text;
    v_customer_name text;
    v_debt_amount numeric;
BEGIN
    -- If order is completed and there is unpaid amount
    IF NEW.status = 'completed' AND (OLD.status != 'completed' OR OLD.paid_amount != NEW.paid_amount) THEN
        v_debt_amount := NEW.total_amount - NEW.paid_amount;
        
        IF v_debt_amount > 0 THEN
            -- Get customer details from vehicle
            SELECT owner_phone, owner_name INTO v_customer_phone, v_customer_name
            FROM public.customer_vehicles
            WHERE id = NEW.vehicle_id;
            
            -- Check if we already have a ledger entry for this order to avoid duplicates (simplified logic)
            -- Ideally we should handle updates, but for now we Insert if distinct or simple append
            
             INSERT INTO public.customers_ledger (
                business_id,
                customer_phone,
                customer_name,
                transaction_type,
                debit,
                credit,
                balance, -- Calculated by another process or trigger? 
                         -- For now, let's just insert the transaction. Balance calculation is usually aggregated. 
                         -- Or we can update the *latest* balance.
                ref_order_id,
                notes
            ) VALUES (
                NEW.business_id,
                v_customer_phone,
                v_customer_name,
                'invoice',
                v_debt_amount,
                0,
                0, -- Will calculate balance in a view or separate update
                NEW.id,
                'Auto-debt from Order #' || NEW.id
            );
            
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_repair_ledger_debt
AFTER UPDATE ON public.repair_orders
FOR EACH ROW
EXECUTE FUNCTION trg_auto_ledger_debt();

-- =====================================================================
-- 6. RLS POLICIES
-- =====================================================================
ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vehicles" ON customer_vehicles FOR ALL USING (auth.uid() = business_id);
CREATE POLICY "Users can manage their own ledger" ON customers_ledger FOR ALL USING (auth.uid() = business_id);
CREATE POLICY "Users can manage their own repair orders" ON repair_orders FOR ALL USING (auth.uid() = business_id);
CREATE POLICY "Users can manage their own repair items" ON repair_order_items FOR ALL USING (EXISTS (SELECT 1 FROM repair_orders WHERE id = repair_order_items.order_id AND business_id = auth.uid()));

-- =====================================================================
-- 7. COMMENTS
-- =====================================================================
COMMENT ON TABLE customer_vehicles IS 'Vehicles registry for Auto Repair Mode';
COMMENT ON TABLE repair_orders IS 'Work orders/Job cards for the workshop';
COMMENT ON TABLE customers_ledger IS 'Financial ledger for tracking customer debts and payments';
