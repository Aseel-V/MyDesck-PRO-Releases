-- ============================================================================
-- FIX KDS ITEM TIMESTAMPS
-- Date: 2026-01-24
-- Description: Add missing timestamp columns to restaurant_ticket_items
-- ============================================================================

ALTER TABLE public.restaurant_ticket_items 
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz;
