-- =====================================================================
-- MIGRATION: ADD COST TRACKING TO FISCAL ITEMS
-- Purpose: Enable "Net Profit" reporting by snapshotting item cost at time of sale
-- =====================================================================

DO $$
BEGIN
    IF to_regclass('public.fiscal_document_items') IS NULL THEN
        RAISE NOTICE 'Deferring fiscal item cost tracking to 20260119000020_complete_fiscal_migration.sql';
        RETURN;
    END IF;

    -- Add unit_cost if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_document_items' AND column_name = 'unit_cost') THEN
        ALTER TABLE public.fiscal_document_items 
        ADD COLUMN unit_cost BIGINT DEFAULT 0; -- In agorot
    END IF;

    -- Add total_cost (virtual or physical) ?? 
    -- Let's just store unit_cost, we can calculate total easily. 
    -- But for performance on massive reports, a stored column is nice.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fiscal_document_items' AND column_name = 'total_cost') THEN
         ALTER TABLE public.fiscal_document_items 
         ADD COLUMN total_cost BIGINT GENERATED ALWAYS AS (unit_cost * quantity) STORED;
    END IF;

END $$;
