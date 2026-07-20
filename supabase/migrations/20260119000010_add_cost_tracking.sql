-- =====================================================================
-- MIGRATION: ADD COST TRACKING TO FISCAL ITEMS
-- Purpose: Enable "Net Profit" reporting by snapshotting item cost at time of sale
-- =====================================================================

DO $$ 
BEGIN
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

-- Update the view or create a new one for "Net Profit"
CREATE OR REPLACE VIEW view_daily_profit_summary WITH (security_invoker = true) AS
SELECT 
    date_trunc('day', created_at) as report_date,
    business_id,
    COUNT(id) as transaction_count,
    SUM(total_amount) as total_revenue,
    SUM(subtotal_before_vat) as net_revenue, -- Revenue ex VAT
    SUM(
        (SELECT SUM(di.total_cost) 
         FROM fiscal_document_items di 
         WHERE di.document_id = fiscal_documents.id)
    ) as total_cogs, -- Cost of Goods Sold
    
    -- Gross Profit = Net Revenue - COGS
    SUM(subtotal_before_vat) - SUM(
        (SELECT SUM(di.total_cost) 
         FROM fiscal_document_items di 
         WHERE di.document_id = fiscal_documents.id)
    ) as gross_profit

FROM fiscal_documents
WHERE status = 'issued'
GROUP BY 1, 2;
