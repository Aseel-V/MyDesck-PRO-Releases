-- =====================================================================
-- Enterprise Restaurant Upgrade - Phase 1: Advanced Inventory Engine
-- Tables: restaurant_ingredients, restaurant_recipes
-- Triggers: Auto-deduct stock, Low-stock alerts
-- =====================================================================

-- Enable UUID if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. INGREDIENTS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_ingredients (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  name_he text,
  name_ar text,
  unit text CHECK (unit IN ('kg', 'g', 'L', 'ml', 'pcs', 'portion')) DEFAULT 'pcs',
  current_stock numeric DEFAULT 0,
  alert_threshold numeric DEFAULT 10,
  cost_per_unit numeric DEFAULT 0,
  supplier text,
  sku text,
  is_active boolean DEFAULT true,
  last_restock_date timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================================================
-- 2. RECIPES TABLE (Links Menu Items to Ingredients)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_recipes (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  menu_item_id uuid REFERENCES public.restaurant_menu_items(id) ON DELETE CASCADE NOT NULL,
  ingredient_id uuid REFERENCES public.restaurant_ingredients(id) ON DELETE CASCADE NOT NULL,
  quantity_required numeric NOT NULL CHECK (quantity_required > 0),
  unit text, -- Can override ingredient's default unit
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(menu_item_id, ingredient_id)
);

-- =====================================================================
-- 3. LOW STOCK NOTIFICATIONS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) NOT NULL,
  type text CHECK (type IN ('low_stock', 'out_of_stock', 'expiring', 'system')) DEFAULT 'system',
  title text NOT NULL,
  message text,
  reference_id uuid, -- Can reference ingredient, order, etc.
  is_read boolean DEFAULT false,
  priority text CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- =====================================================================
-- 4. RLS POLICIES
-- =====================================================================
ALTER TABLE restaurant_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own ingredients" ON restaurant_ingredients
  FOR ALL USING (auth.uid() = business_id);

CREATE POLICY "Users can manage their own recipes" ON restaurant_recipes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM restaurant_menu_items mi
      JOIN restaurant_menu_categories mc ON mi.category_id = mc.id
      WHERE mi.id = restaurant_recipes.menu_item_id
      AND mc.business_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own notifications" ON restaurant_notifications
  FOR ALL USING (auth.uid() = business_id);

-- =====================================================================
-- 5. FUNCTION: Deduct Ingredients When Order Items Are Created/Fired
-- =====================================================================
CREATE OR REPLACE FUNCTION deduct_ingredients_on_order()
RETURNS TRIGGER AS $$
DECLARE
  recipe_row RECORD;
  current_ingredient RECORD;
BEGIN
  -- Only deduct when status changes to 'cooking' (fired)
  IF NEW.is_fired = true AND (OLD.is_fired IS NULL OR OLD.is_fired = false) THEN
    -- Get all ingredients for this menu item
    FOR recipe_row IN
      SELECT r.ingredient_id, r.quantity_required, i.name, i.current_stock, i.alert_threshold, i.business_id
      FROM restaurant_recipes r
      JOIN restaurant_ingredients i ON r.ingredient_id = i.id
      WHERE r.menu_item_id = NEW.item_id
    LOOP
      -- Deduct stock (multiply by quantity ordered)
      UPDATE restaurant_ingredients
      SET current_stock = current_stock - (recipe_row.quantity_required * NEW.quantity),
          updated_at = now()
      WHERE id = recipe_row.ingredient_id;

      -- Get updated stock
      SELECT current_stock, alert_threshold INTO current_ingredient
      FROM restaurant_ingredients WHERE id = recipe_row.ingredient_id;

      -- Check if below threshold and create notification
      IF current_ingredient.current_stock <= current_ingredient.alert_threshold THEN
        INSERT INTO restaurant_notifications (business_id, type, title, message, reference_id, priority)
        VALUES (
          recipe_row.business_id,
          CASE WHEN current_ingredient.current_stock <= 0 THEN 'out_of_stock' ELSE 'low_stock' END,
          CASE WHEN current_ingredient.current_stock <= 0 
            THEN 'Out of Stock: ' || recipe_row.name
            ELSE 'Low Stock Alert: ' || recipe_row.name
          END,
          'Current stock: ' || current_ingredient.current_stock || '. Threshold: ' || current_ingredient.alert_threshold,
          recipe_row.ingredient_id,
          CASE WHEN current_ingredient.current_stock <= 0 THEN 'critical' ELSE 'high' END
        )
        ON CONFLICT DO NOTHING; -- Avoid duplicate notifications
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 6. TRIGGER: Attach to order_items table
-- =====================================================================
DROP TRIGGER IF EXISTS trigger_deduct_ingredients ON restaurant_order_items;
CREATE TRIGGER trigger_deduct_ingredients
  AFTER UPDATE ON restaurant_order_items
  FOR EACH ROW
  EXECUTE FUNCTION deduct_ingredients_on_order();

-- =====================================================================
-- 7. INDEX for performance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_ingredients_business ON restaurant_ingredients(business_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_stock ON restaurant_ingredients(current_stock) WHERE current_stock <= alert_threshold;
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON restaurant_recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON restaurant_notifications(business_id, is_read) WHERE is_read = false;

-- =====================================================================
-- 8. COMMENTS
-- =====================================================================
COMMENT ON TABLE restaurant_ingredients IS 'Inventory ingredients for recipe-based stock management';
COMMENT ON TABLE restaurant_recipes IS 'Links menu items to required ingredients with quantities';
COMMENT ON TABLE restaurant_notifications IS 'System notifications for low stock, alerts, etc.';
COMMENT ON FUNCTION deduct_ingredients_on_order IS 'Auto-deducts ingredient stock when order items are fired to kitchen';
