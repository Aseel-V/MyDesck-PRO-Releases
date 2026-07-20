-- ============================================================================
-- MIGRATION: ADD COST PRICE TO MENU ITEMS
-- Purpose: Enable profit calculation by tracking cost price of menu items
-- ============================================================================

-- Add cost_price column to restaurant_menu_items if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_menu_items' AND column_name = 'cost_price') THEN
        ALTER TABLE restaurant_menu_items 
        ADD COLUMN cost_price NUMERIC DEFAULT 0;
    END IF;
END $$;
