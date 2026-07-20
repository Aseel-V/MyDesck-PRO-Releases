-- Migration: 20260203_drop_legacy_inventory_trigger.sql
-- Purpose: Drop the legacy trigger 'trigger_repair_inventory_sync'
-- The RPC 'add_repair_service_transaction' now handles inventory updates on 'car_parts'.
-- The old trigger was trying to update 'restaurant_menu_items' which is incorrect for car parts.

DROP TRIGGER IF EXISTS trigger_repair_inventory_sync ON repair_order_items;
DROP FUNCTION IF EXISTS trg_repair_item_inventory_sync();
