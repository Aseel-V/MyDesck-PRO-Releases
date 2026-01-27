-- Enable RLS
ALTER TABLE market_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_items ENABLE ROW LEVEL SECURITY;

-- 1. MARKET TRANSACTIONS
-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own transactions" ON market_transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON market_transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON market_transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON market_transactions;

-- Create policies
CREATE POLICY "Users can read their own transactions"
ON market_transactions FOR SELECT USING (auth.uid() = business_id);

CREATE POLICY "Users can insert their own transactions"
ON market_transactions FOR INSERT WITH CHECK (auth.uid() = business_id);

CREATE POLICY "Users can update their own transactions"
ON market_transactions FOR UPDATE USING (auth.uid() = business_id);

CREATE POLICY "Users can delete their own transactions"
ON market_transactions FOR DELETE USING (auth.uid() = business_id);


-- 2. PRODUCTS (restaurant_menu_items)
-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own menu items" ON restaurant_menu_items;
DROP POLICY IF EXISTS "Users can insert their own menu items" ON restaurant_menu_items;
DROP POLICY IF EXISTS "Users can update their own menu items" ON restaurant_menu_items;
DROP POLICY IF EXISTS "Users can delete their own menu items" ON restaurant_menu_items;

-- Create policies
CREATE POLICY "Users can read their own menu items"
ON restaurant_menu_items FOR SELECT USING (auth.uid() = business_id);

CREATE POLICY "Users can insert their own menu items"
ON restaurant_menu_items FOR INSERT WITH CHECK (auth.uid() = business_id);

CREATE POLICY "Users can update their own menu items"
ON restaurant_menu_items FOR UPDATE USING (auth.uid() = business_id);

CREATE POLICY "Users can delete their own menu items"
ON restaurant_menu_items FOR DELETE USING (auth.uid() = business_id);
