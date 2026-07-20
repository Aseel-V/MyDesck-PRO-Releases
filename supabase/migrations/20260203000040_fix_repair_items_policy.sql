-- Fix RLS policies for repair_order_items
-- Migration: 20260203_fix_repair_items_policy.sql

-- Drop the existing policy if it exists (to avoid conflicts or if it was malformed)
DROP POLICY IF EXISTS "Users can manage their own repair items" ON repair_order_items;
DROP POLICY IF EXISTS "Users can manage own repair items" ON repair_order_items;

-- Enable RLS just in case
ALTER TABLE repair_order_items ENABLE ROW LEVEL SECURITY;

-- Create a comprehensive policy for the Business Owner
-- This allows CRUD if the related order belongs to the business
CREATE POLICY "Users can manage own repair items" ON repair_order_items
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM repair_orders 
        WHERE id = repair_order_items.order_id 
        AND business_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM repair_orders 
        WHERE id = order_id 
        AND business_id = auth.uid()
    )
);

-- Note: If we have staff users, we would need a policy for them too.
-- Assuming for now that the Dashboard is used by the Owner (auth.uid = business_id).
