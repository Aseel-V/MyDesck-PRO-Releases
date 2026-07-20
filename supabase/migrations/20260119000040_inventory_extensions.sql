-- =====================================================================
-- ISRAELI SUPERMARKET - INVENTORY EXTENSIONS
-- Migration: 20260119_inventory_extensions.sql
-- Purpose: Add expiry tracking, batch management, and shrinkage
-- Implements: ניהול תפוגה, מעקב מנות, פחת
-- =====================================================================

-- =====================================================================
-- 0. ENSURE HELPER FUNCTION EXISTS
-- =====================================================================
-- This function may already exist from fiscal_documents migration
-- Using CREATE OR REPLACE to avoid errors if it exists
CREATE OR REPLACE FUNCTION update_fiscal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. ADD EXPIRY AND BATCH FIELDS TO MENU ITEMS
-- =====================================================================

-- Add new columns to existing menu items table
ALTER TABLE public.restaurant_menu_items 
    ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS default_shelf_life_days INTEGER,
    ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS requires_weighing BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sold_by_weight BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'g', 'lb', 'oz')),
    ADD COLUMN IF NOT EXISTS min_stock_alert INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS supplier_sku TEXT,
    ADD COLUMN IF NOT EXISTS country_of_origin TEXT;

-- =====================================================================
-- 2. INVENTORY BATCHES TABLE (מנות/אצוות)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Item reference
    menu_item_id uuid REFERENCES public.restaurant_menu_items(id) ON DELETE CASCADE NOT NULL,
    ingredient_id uuid REFERENCES public.restaurant_ingredients(id) ON DELETE CASCADE,
    
    -- Batch identification
    batch_number TEXT NOT NULL,
    lot_number TEXT,
    
    -- Quantity
    initial_quantity NUMERIC(10, 3) NOT NULL,
    current_quantity NUMERIC(10, 3) NOT NULL,
    unit TEXT DEFAULT 'pcs',
    
    -- Cost
    unit_cost BIGINT DEFAULT 0,  -- In agorot
    total_cost BIGINT DEFAULT 0, -- In agorot
    
    -- Dates
    production_date DATE,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    
    -- Supplier
    supplier_name TEXT,
    supplier_invoice TEXT,
    
    -- Status
    status TEXT CHECK (status IN ('active', 'depleted', 'expired', 'recalled', 'written_off')) DEFAULT 'active',
    
    -- Traceability
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    CONSTRAINT positive_quantity CHECK (current_quantity >= 0)
);

-- =====================================================================
-- 3. SHRINKAGE RECORDS TABLE (פחת)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.shrinkage_records (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Item reference
    menu_item_id uuid REFERENCES public.restaurant_menu_items(id),
    ingredient_id uuid REFERENCES public.restaurant_ingredients(id),
    batch_id uuid REFERENCES public.inventory_batches(id),
    
    -- Type of shrinkage
    shrinkage_type TEXT CHECK (shrinkage_type IN (
        'expired',           -- תפוגה
        'spoilage',          -- קלקול
        'damage',            -- נזק
        'theft',             -- גניבה
        'breakage',          -- שבירה
        'counting_variance', -- הפרש ספירה
        'other'
    )) NOT NULL,
    
    -- Quantities
    quantity NUMERIC(10, 3) NOT NULL,
    unit TEXT,
    
    -- Valuation (in agorot)
    unit_cost BIGINT DEFAULT 0,
    total_value BIGINT NOT NULL,  -- Loss value
    
    -- Details
    reason TEXT,
    notes TEXT,
    
    -- Recorded by
    recorded_by uuid REFERENCES auth.users(id),
    recorded_by_name TEXT,
    recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Approval (for significant losses)
    approved_by uuid REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Photo evidence (optional)
    photo_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 4. STOCK TAKES TABLE (ספירות מלאי)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.stock_takes (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Identification
    stock_take_number SERIAL,
    name TEXT NOT NULL,
    
    -- Period
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    
    -- Status
    status TEXT CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')) DEFAULT 'draft',
    
    -- Totals (in agorot)
    expected_value BIGINT DEFAULT 0,
    counted_value BIGINT DEFAULT 0,
    variance_value BIGINT DEFAULT 0,
    
    -- Item counts
    total_items INTEGER DEFAULT 0,
    items_counted INTEGER DEFAULT 0,
    items_with_variance INTEGER DEFAULT 0,
    
    -- Staff
    created_by uuid REFERENCES auth.users(id),
    completed_by uuid REFERENCES auth.users(id),
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 5. STOCK TAKE ITEMS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.stock_take_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    stock_take_id uuid REFERENCES public.stock_takes(id) ON DELETE CASCADE NOT NULL,
    
    -- Item reference
    menu_item_id uuid REFERENCES public.restaurant_menu_items(id),
    ingredient_id uuid REFERENCES public.restaurant_ingredients(id),
    
    -- Expected vs Actual
    expected_quantity NUMERIC(10, 3) NOT NULL,
    counted_quantity NUMERIC(10, 3),
    variance NUMERIC(10, 3) GENERATED ALWAYS AS (
        COALESCE(counted_quantity, 0) - expected_quantity
    ) STORED,
    
    -- Valuation
    unit_cost BIGINT DEFAULT 0,
    expected_value BIGINT DEFAULT 0,
    counted_value BIGINT DEFAULT 0,
    variance_value BIGINT DEFAULT 0,
    
    -- Status
    is_counted BOOLEAN DEFAULT FALSE,
    counted_at TIMESTAMPTZ,
    counted_by uuid REFERENCES auth.users(id),
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 6. RLS POLICIES
-- =====================================================================
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shrinkage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_take_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own batches"
    ON inventory_batches FOR ALL
    USING (auth.uid() = business_id);

CREATE POLICY "Users can manage their own shrinkage records"
    ON shrinkage_records FOR ALL
    USING (auth.uid() = business_id);

CREATE POLICY "Users can manage their own stock takes"
    ON stock_takes FOR ALL
    USING (auth.uid() = business_id);

CREATE POLICY "Users can manage their own stock take items"
    ON stock_take_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM stock_takes st
            WHERE st.id = stock_take_items.stock_take_id
            AND st.business_id = auth.uid()
        )
    );

-- =====================================================================
-- 7. FEFO FUNCTION (First Expired, First Out)
-- =====================================================================
CREATE OR REPLACE FUNCTION get_fefo_batch(
    p_menu_item_id uuid,
    p_quantity NUMERIC
)
RETURNS TABLE (
    batch_id uuid,
    batch_number TEXT,
    available_quantity NUMERIC,
    expiry_date DATE,
    days_until_expiry INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.batch_number,
        b.current_quantity,
        b.expiry_date,
        CASE 
            WHEN b.expiry_date IS NOT NULL 
            THEN (b.expiry_date - CURRENT_DATE)::INTEGER
            ELSE 9999
        END as days_until_expiry
    FROM inventory_batches b
    WHERE b.menu_item_id = p_menu_item_id
      AND b.status = 'active'
      AND b.current_quantity > 0
    ORDER BY 
        COALESCE(b.expiry_date, '9999-12-31'::DATE) ASC,
        b.received_date ASC
    LIMIT 10;
END;
$$;

-- =====================================================================
-- 8. EXPIRY ALERT FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION get_expiring_items(
    p_business_id uuid,
    p_days_ahead INTEGER DEFAULT 7
)
RETURNS TABLE (
    batch_id uuid,
    menu_item_id uuid,
    item_name TEXT,
    batch_number TEXT,
    current_quantity NUMERIC,
    expiry_date DATE,
    days_until_expiry INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.menu_item_id,
        m.name,
        b.batch_number,
        b.current_quantity,
        b.expiry_date,
        (b.expiry_date - CURRENT_DATE)::INTEGER as days_until_expiry
    FROM inventory_batches b
    JOIN restaurant_menu_items m ON m.id = b.menu_item_id
    WHERE b.business_id = p_business_id
      AND b.status = 'active'
      AND b.current_quantity > 0
      AND b.expiry_date IS NOT NULL
      AND b.expiry_date <= (CURRENT_DATE + p_days_ahead)
    ORDER BY b.expiry_date ASC;
END;
$$;

-- =====================================================================
-- 9. DEDUCT BATCH QUANTITY FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION deduct_from_batch_fefo(
    p_menu_item_id uuid,
    p_quantity NUMERIC
)
RETURNS TABLE (
    batch_id uuid,
    deducted_quantity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_remaining NUMERIC;
    v_batch RECORD;
    v_deduct NUMERIC;
BEGIN
    v_remaining := p_quantity;
    
    -- Loop through batches in FEFO order
    FOR v_batch IN
        SELECT b.id, b.current_quantity
        FROM inventory_batches b
        WHERE b.menu_item_id = p_menu_item_id
          AND b.status = 'active'
          AND b.current_quantity > 0
        ORDER BY 
            COALESCE(b.expiry_date, '9999-12-31'::DATE) ASC,
            b.received_date ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        
        -- Calculate how much to deduct from this batch
        v_deduct := LEAST(v_batch.current_quantity, v_remaining);
        
        -- Update the batch
        UPDATE inventory_batches
        SET 
            current_quantity = current_quantity - v_deduct,
            status = CASE 
                WHEN current_quantity - v_deduct <= 0 THEN 'depleted'
                ELSE status
            END,
            updated_at = now()
        WHERE id = v_batch.id;
        
        -- Record the deduction
        batch_id := v_batch.id;
        deducted_quantity := v_deduct;
        RETURN NEXT;
        
        v_remaining := v_remaining - v_deduct;
    END LOOP;
END;
$$;

-- =====================================================================
-- 10. INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_batches_business ON inventory_batches(business_id);
CREATE INDEX IF NOT EXISTS idx_batches_item ON inventory_batches(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_batches_active ON inventory_batches(business_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_shrinkage_business ON shrinkage_records(business_id);
CREATE INDEX IF NOT EXISTS idx_shrinkage_date ON shrinkage_records(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_shrinkage_type ON shrinkage_records(shrinkage_type);
CREATE INDEX IF NOT EXISTS idx_stock_takes_business ON stock_takes(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_items_take ON stock_take_items(stock_take_id);

-- =====================================================================
-- 11. TRIGGERS
-- =====================================================================

-- Auto-expire batches
CREATE OR REPLACE FUNCTION auto_expire_batches()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory_batches
    SET status = 'expired', updated_at = now()
    WHERE status = 'active'
      AND expiry_date IS NOT NULL
      AND expiry_date < CURRENT_DATE;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Run daily (or call manually)
-- This would typically be a scheduled job, but we create the function for it

-- Update timestamp trigger
CREATE TRIGGER trigger_batches_updated
    BEFORE UPDATE ON inventory_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_fiscal_updated_at();

CREATE TRIGGER trigger_stock_takes_updated
    BEFORE UPDATE ON stock_takes
    FOR EACH ROW
    EXECUTE FUNCTION update_fiscal_updated_at();

-- =====================================================================
-- 12. COMMENTS
-- =====================================================================
COMMENT ON TABLE inventory_batches IS 'Batch/lot tracking for perishable items with expiry dates';
COMMENT ON TABLE shrinkage_records IS 'Record of inventory losses: spoilage, theft, damage, etc.';
COMMENT ON TABLE stock_takes IS 'Physical inventory counts for reconciliation';
COMMENT ON FUNCTION get_fefo_batch IS 'Get batches in First Expired First Out order';
COMMENT ON FUNCTION get_expiring_items IS 'Get items expiring within specified days';
COMMENT ON FUNCTION deduct_from_batch_fefo IS 'Deduct quantity from batches using FEFO method';
