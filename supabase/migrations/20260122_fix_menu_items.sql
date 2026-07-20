-- ============================================================================
-- FIX MENU ITEMS FOR MARKET MODE
-- Migration: 20260122_fix_menu_items.sql
-- Purpose: Allow items to be linked directly to business (no category required)
-- ============================================================================

-- 1. Add business_id column
ALTER TABLE restaurant_menu_items 
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES auth.users(id);

-- 2. Make category_id optional
ALTER TABLE restaurant_menu_items 
ALTER COLUMN category_id DROP NOT NULL;

-- 3. Update Policy to allow access via business_id
DROP POLICY IF EXISTS "Users can manage their own menu items" ON restaurant_menu_items;

CREATE POLICY "Users can manage their own menu items" ON restaurant_menu_items
FOR ALL 
TO authenticated
USING (
  (business_id = auth.uid()) OR 
  (category_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM restaurant_menu_categories c
    WHERE c.id = restaurant_menu_items.category_id
    AND c.business_id = auth.uid()
  ))
)
WITH CHECK (
  (business_id = auth.uid()) OR 
  (category_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM restaurant_menu_categories c
    WHERE c.id = restaurant_menu_items.category_id
    AND c.business_id = auth.uid()
  ))
);

-- 4. Index on business_id
CREATE INDEX IF NOT EXISTS idx_menu_items_business_id ON restaurant_menu_items(business_id);
