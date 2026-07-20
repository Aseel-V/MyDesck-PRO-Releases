-- ============================================================================
-- MARKET MODE PRODUCT EXTENSIONS
-- Migration: 20260122_market_products.sql
-- Purpose: Add support for product images and weight-based items
-- ============================================================================

-- Add image_url column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_menu_items' AND column_name = 'image_url') THEN
    ALTER TABLE restaurant_menu_items ADD COLUMN image_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_menu_items' AND column_name = 'type') THEN
    ALTER TABLE restaurant_menu_items ADD COLUMN type TEXT CHECK (type IN ('unit', 'weight')) DEFAULT 'unit';
  END IF;
END $$;

-- Update comments
COMMENT ON COLUMN restaurant_menu_items.image_url IS 'URL to product image in storage';
COMMENT ON COLUMN restaurant_menu_items.type IS 'Product type: unit (counts) or weight (kg/g)';
