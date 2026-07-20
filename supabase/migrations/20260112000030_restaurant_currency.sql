-- ============================================================================
-- RESTAURANT MODE - CURRENCY COLUMN FIX
-- Version: 1.0.0 | Apply via Supabase SQL Editor
-- ============================================================================

-- Add currency column to orders table if missing
ALTER TABLE restaurant_orders 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ILS';

-- Add currency column to daily reports table if missing
ALTER TABLE restaurant_daily_reports 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ILS';
