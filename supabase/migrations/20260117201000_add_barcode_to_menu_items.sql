-- ============================================================================
-- ADD BARCODE COLUMN TO MENU ITEMS
-- Migration: 20260117201000_add_barcode_to_menu_items.sql
-- Purpose: Enable barcode scanning for Market Mode
-- ============================================================================

-- Add barcode column (nullable to not break existing items)
ALTER TABLE restaurant_menu_items 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Create B-Tree index for O(1) barcode lookups
-- Note: Not unique per business as same product might exist in multiple businesses
CREATE INDEX IF NOT EXISTS idx_menu_items_barcode ON restaurant_menu_items(barcode);

-- Compound index for fast lookup by business + barcode
CREATE INDEX IF NOT EXISTS idx_menu_items_business_barcode 
ON restaurant_menu_items(business_id, barcode) 
WHERE barcode IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN restaurant_menu_items.barcode IS 'Product barcode (EAN-13, UPC-A, or custom). Used for scanner lookups in Market Mode.';
