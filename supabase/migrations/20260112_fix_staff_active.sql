-- ============================================================================
-- RESTAURANT MODE - FIX STAFF ACTIVE STATUS
-- Version: 1.0.0 | Apply via Supabase SQL Editor
-- ============================================================================

-- 1. Ensure is_active column exists
ALTER TABLE restaurant_staff 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2. Ensure all existing staff are active (fix for nulls)
UPDATE restaurant_staff 
SET is_active = TRUE 
WHERE is_active IS NULL;

-- 3. (Optional) Check triggers or other constraints if needed
-- For now, this should resolve the "Invalid PIN" if it was due to filtering by active
