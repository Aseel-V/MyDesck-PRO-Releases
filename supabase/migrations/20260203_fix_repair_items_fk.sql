-- Migration: 20260203_fix_repair_items_fk.sql
-- Purpose: Remove the incorrect foreign key constraint on repair_order_items
-- The original schema pointed inventory_item_id to restaurant_menu_items,
-- but for Auto Repair mode we are using the car_parts table.
-- The RPC 'add_repair_service_transaction' handles data integrity verification manually.

DO $$ 
BEGIN
    -- Try to drop the constraint if it exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_order_items_inventory_item_id_fkey') THEN
        ALTER TABLE repair_order_items DROP CONSTRAINT repair_order_items_inventory_item_id_fkey;
    END IF;
END $$;
