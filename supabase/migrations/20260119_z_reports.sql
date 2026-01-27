-- =====================================================================
-- ISRAELI FISCAL COMPLIANCE - Z-REPORTS & CASH MANAGEMENT SCHEMA
-- Migration: 20260119_z_reports.sql
-- Purpose: End-of-day reporting and cash shift management
-- Implements: דוח Z, דוח X, ניהול משמרות קופה
-- =====================================================================

-- Enable UUID if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for hash functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 0. ENSURE HELPER FUNCTION EXISTS
-- =====================================================================
-- This function may already exist from fiscal_documents migration
CREATE OR REPLACE FUNCTION update_fiscal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. CASH SHIFTS TABLE (משמרת קופה)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cash_shifts (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Shift identification
    shift_number BIGINT NOT NULL,
    terminal_id TEXT DEFAULT 'POS-1',
    
    -- Staff
    opened_by uuid REFERENCES auth.users(id),
    opened_by_name TEXT,
    closed_by uuid REFERENCES auth.users(id),
    closed_by_name TEXT,
    
    -- Timing
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    
    -- Cash amounts (in agorot for precision)
    opening_cash BIGINT NOT NULL DEFAULT 0,
    expected_cash BIGINT DEFAULT 0,       -- Calculated: opening + cash sales - cash refunds
    actual_cash BIGINT,                   -- Counted at close
    variance BIGINT,                      -- Actual - Expected (over/short)
    
    -- Transaction totals (in agorot)
    total_sales BIGINT DEFAULT 0,
    total_refunds BIGINT DEFAULT 0,
    total_voids BIGINT DEFAULT 0,
    net_sales BIGINT DEFAULT 0,
    
    -- By payment method (in agorot)
    cash_sales BIGINT DEFAULT 0,
    card_sales BIGINT DEFAULT 0,
    other_sales BIGINT DEFAULT 0,
    
    -- VAT breakdown (in agorot)
    vat_17_sales BIGINT DEFAULT 0,
    vat_17_amount BIGINT DEFAULT 0,
    vat_0_sales BIGINT DEFAULT 0,
    exempt_sales BIGINT DEFAULT 0,
    
    -- Document counts
    receipts_issued INTEGER DEFAULT 0,
    invoices_issued INTEGER DEFAULT 0,
    credit_notes_issued INTEGER DEFAULT 0,
    
    -- Status
    status TEXT CHECK (status IN ('open', 'closed', 'reconciled')) DEFAULT 'open',
    
    -- Notes
    opening_notes TEXT,
    closing_notes TEXT,
    
    -- Signature for closed shifts
    closing_hash TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_shift_number UNIQUE (business_id, shift_number)
);

-- =====================================================================
-- 2. Z-REPORTS TABLE (דוח Z - סוף יום)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.z_reports (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Z-Report identification (NEVER GAPS)
    z_number BIGINT NOT NULL,
    
    -- Linked shift
    shift_id uuid REFERENCES public.cash_shifts(id),
    
    -- Period covered
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    -- Sales totals (in agorot)
    gross_sales BIGINT NOT NULL DEFAULT 0,
    returns_refunds BIGINT DEFAULT 0,
    discounts BIGINT DEFAULT 0,
    net_sales BIGINT NOT NULL DEFAULT 0,
    
    -- VAT breakdown (in agorot) - CRITICAL FOR TAX AUTHORITY
    vat_17_taxable BIGINT DEFAULT 0,       -- Tax base at 17%
    vat_17_tax BIGINT DEFAULT 0,           -- VAT amount at 17%
    vat_0_taxable BIGINT DEFAULT 0,        -- Zero-rated base
    exempt_taxable BIGINT DEFAULT 0,       -- Exempt base
    total_vat BIGINT DEFAULT 0,
    
    -- Payment methods (in agorot)
    cash_total BIGINT DEFAULT 0,
    credit_card_total BIGINT DEFAULT 0,
    debit_card_total BIGINT DEFAULT 0,
    checks_total BIGINT DEFAULT 0,
    other_payments_total BIGINT DEFAULT 0,
    
    -- Document counts (for audit trail)
    first_receipt_number BIGINT,
    last_receipt_number BIGINT,
    total_receipts INTEGER DEFAULT 0,
    
    first_invoice_number BIGINT,
    last_invoice_number BIGINT,
    total_invoices INTEGER DEFAULT 0,
    
    total_credit_notes INTEGER DEFAULT 0,
    total_cancelled_docs INTEGER DEFAULT 0,
    
    -- Cash drawer
    opening_cash BIGINT DEFAULT 0,
    cash_in BIGINT DEFAULT 0,
    cash_out BIGINT DEFAULT 0,
    expected_cash BIGINT DEFAULT 0,
    actual_cash BIGINT,
    cash_variance BIGINT,
    
    -- Category breakdown (JSONB for flexibility)
    sales_by_category JSONB DEFAULT '{}',
    
    -- Generation info
    generated_by uuid REFERENCES auth.users(id),
    generated_by_name TEXT,
    generated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Digital signature (immutable record)
    report_hash TEXT NOT NULL,
    previous_z_hash TEXT,
    signature_chain_valid BOOLEAN DEFAULT TRUE,
    
    -- Flags
    is_final BOOLEAN DEFAULT TRUE,
    is_resend BOOLEAN DEFAULT FALSE,
    sent_to_tax_authority BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_z_number UNIQUE (business_id, z_number),
    CONSTRAINT valid_period CHECK (period_end > period_start)
);

-- =====================================================================
-- 3. X-REPORTS TABLE (דוח X - צילום ביניים)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.x_reports (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    shift_id uuid REFERENCES public.cash_shifts(id),
    
    -- X-Report identification
    report_number SERIAL,
    
    -- Snapshot timestamp
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Current totals at time of snapshot (in agorot)
    gross_sales BIGINT DEFAULT 0,
    net_sales BIGINT DEFAULT 0,
    total_vat BIGINT DEFAULT 0,
    
    -- Payment breakdown (in agorot)
    cash_total BIGINT DEFAULT 0,
    card_total BIGINT DEFAULT 0,
    
    -- Document counts since last Z
    receipts_count INTEGER DEFAULT 0,
    invoices_count INTEGER DEFAULT 0,
    
    -- Generated by
    generated_by uuid REFERENCES auth.users(id),
    generated_by_name TEXT,
    
    -- Note: X-Reports are NOT signed (they don't reset counters)
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 4. SHIFT TRANSACTIONS TABLE (All transactions within a shift)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.shift_transactions (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    shift_id uuid REFERENCES public.cash_shifts(id) ON DELETE CASCADE NOT NULL,
    
    -- Transaction details
    transaction_type TEXT CHECK (transaction_type IN (
        'sale', 'refund', 'void', 'cash_in', 'cash_out', 'no_sale'
    )) NOT NULL,
    
    -- Linked document
    fiscal_document_id uuid REFERENCES public.fiscal_documents(id),
    order_id uuid,
    
    -- Amount (in agorot)
    amount BIGINT NOT NULL,
    
    -- Payment method
    payment_method TEXT CHECK (payment_method IN (
        'cash', 'credit_card', 'debit_card', 'check', 'other', 'multi'
    )),
    
    -- Card details (if applicable)
    card_last_four TEXT,
    card_type TEXT,
    auth_code TEXT,
    terminal_transaction_id TEXT,
    
    -- Staff
    performed_by uuid REFERENCES auth.users(id),
    performed_by_name TEXT,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 5. Z-NUMBER COUNTER TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.z_report_counters (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    current_z_number BIGINT NOT NULL DEFAULT 0,
    last_z_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 6. RLS POLICIES
-- =====================================================================
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own cash shifts"
    ON cash_shifts FOR ALL
    USING (auth.uid() = business_id);

CREATE POLICY "Users can read their own Z-reports"
    ON z_reports FOR SELECT
    USING (auth.uid() = business_id);

CREATE POLICY "Users can create their own Z-reports"
    ON z_reports FOR INSERT
    WITH CHECK (auth.uid() = business_id);

-- Z-reports cannot be updated or deleted once created
-- This is enforced by NOT having UPDATE/DELETE policies

CREATE POLICY "Users can manage their own X-reports"
    ON x_reports FOR ALL
    USING (auth.uid() = business_id);

CREATE POLICY "Users can manage their own shift transactions"
    ON shift_transactions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM cash_shifts s
            WHERE s.id = shift_transactions.shift_id
            AND s.business_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own Z-counters"
    ON z_report_counters FOR ALL
    USING (auth.uid() = business_id);

-- =====================================================================
-- 7. FUNCTIONS
-- =====================================================================

-- Function: Get next Z-report number (atomic, no gaps)
CREATE OR REPLACE FUNCTION get_next_z_number(p_business_id uuid)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_number BIGINT;
BEGIN
    INSERT INTO z_report_counters (business_id, current_z_number, last_z_at)
    VALUES (p_business_id, 1, now())
    ON CONFLICT (business_id)
    DO UPDATE SET 
        current_z_number = z_report_counters.current_z_number + 1,
        last_z_at = now(),
        updated_at = now()
    RETURNING current_z_number INTO v_next_number;
    
    RETURN v_next_number;
END;
$$;

-- Function: Get previous Z-report hash for chain
CREATE OR REPLACE FUNCTION get_previous_z_hash(p_business_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    SELECT report_hash INTO v_hash
    FROM z_reports
    WHERE business_id = p_business_id
    ORDER BY z_number DESC
    LIMIT 1;
    
    RETURN COALESCE(v_hash, 'Z-GENESIS');
END;
$$;

-- Function: Open a new cash shift
CREATE OR REPLACE FUNCTION open_cash_shift(
    p_business_id uuid,
    p_opening_cash BIGINT,
    p_opened_by uuid,
    p_opened_by_name TEXT,
    p_terminal_id TEXT DEFAULT 'POS-1',
    p_notes TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_id uuid;
    v_shift_number BIGINT;
BEGIN
    -- Check for open shifts
    IF EXISTS (
        SELECT 1 FROM cash_shifts 
        WHERE business_id = p_business_id 
        AND terminal_id = p_terminal_id 
        AND status = 'open'
    ) THEN
        RAISE EXCEPTION 'There is already an open shift for this terminal';
    END IF;
    
    -- Get next shift number
    SELECT COALESCE(MAX(shift_number), 0) + 1 INTO v_shift_number
    FROM cash_shifts
    WHERE business_id = p_business_id;
    
    -- Create the shift
    INSERT INTO cash_shifts (
        business_id, shift_number, terminal_id,
        opened_by, opened_by_name, opening_cash, opening_notes, status
    )
    VALUES (
        p_business_id, v_shift_number, p_terminal_id,
        p_opened_by, p_opened_by_name, p_opening_cash, p_notes, 'open'
    )
    RETURNING id INTO v_shift_id;
    
    RETURN v_shift_id;
END;
$$;

-- Function: Update shift totals (called after each transaction)
CREATE OR REPLACE FUNCTION update_shift_totals(p_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE cash_shifts cs
    SET
        total_sales = COALESCE((
            SELECT SUM(amount) FROM shift_transactions
            WHERE shift_id = p_shift_id AND transaction_type = 'sale'
        ), 0),
        total_refunds = COALESCE((
            SELECT SUM(amount) FROM shift_transactions
            WHERE shift_id = p_shift_id AND transaction_type = 'refund'
        ), 0),
        total_voids = COALESCE((
            SELECT SUM(amount) FROM shift_transactions
            WHERE shift_id = p_shift_id AND transaction_type = 'void'
        ), 0),
        cash_sales = COALESCE((
            SELECT SUM(amount) FROM shift_transactions
            WHERE shift_id = p_shift_id 
            AND transaction_type = 'sale' 
            AND payment_method = 'cash'
        ), 0),
        card_sales = COALESCE((
            SELECT SUM(amount) FROM shift_transactions
            WHERE shift_id = p_shift_id 
            AND transaction_type IN ('sale')
            AND payment_method IN ('credit_card', 'debit_card')
        ), 0),
        expected_cash = opening_cash + COALESCE((
            SELECT SUM(
                CASE 
                    WHEN transaction_type = 'sale' AND payment_method = 'cash' THEN amount
                    WHEN transaction_type = 'refund' AND payment_method = 'cash' THEN -amount
                    WHEN transaction_type = 'cash_in' THEN amount
                    WHEN transaction_type = 'cash_out' THEN -amount
                    ELSE 0
                END
            ) FROM shift_transactions WHERE shift_id = p_shift_id
        ), 0),
        net_sales = total_sales - total_refunds,
        updated_at = now()
    WHERE id = p_shift_id;
END;
$$;

-- Function: Close shift and generate Z-report
CREATE OR REPLACE FUNCTION close_shift_with_z_report(
    p_shift_id uuid,
    p_actual_cash BIGINT,
    p_closed_by uuid,
    p_closed_by_name TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_z_id uuid;
    v_z_number BIGINT;
    v_prev_hash TEXT;
    v_hash_input TEXT;
    v_hash TEXT;
BEGIN
    -- Get and lock the shift
    SELECT * INTO v_shift
    FROM cash_shifts
    WHERE id = p_shift_id
    FOR UPDATE;
    
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;
    
    IF v_shift.status != 'open' THEN
        RAISE EXCEPTION 'Shift is not open';
    END IF;
    
    -- Update shift totals first
    PERFORM update_shift_totals(p_shift_id);
    
    -- Refresh shift data
    SELECT * INTO v_shift FROM cash_shifts WHERE id = p_shift_id;
    
    -- Close the shift
    UPDATE cash_shifts
    SET 
        status = 'closed',
        closed_at = now(),
        closed_by = p_closed_by,
        closed_by_name = p_closed_by_name,
        actual_cash = p_actual_cash,
        variance = p_actual_cash - expected_cash,
        closing_notes = p_notes,
        updated_at = now()
    WHERE id = p_shift_id;
    
    -- Get next Z-number
    v_z_number := get_next_z_number(v_shift.business_id);
    
    -- Get previous Z hash
    v_prev_hash := get_previous_z_hash(v_shift.business_id);
    
    -- Create hash input
    v_hash_input := v_prev_hash || '|' ||
                    v_z_number::TEXT || '|' ||
                    v_shift.business_id::TEXT || '|' ||
                    v_shift.net_sales::TEXT || '|' ||
                    now()::TEXT;
    
    v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');
    
    -- Create Z-report
    INSERT INTO z_reports (
        business_id, z_number, shift_id,
        period_start, period_end,
        gross_sales, net_sales, returns_refunds, discounts,
        cash_total, credit_card_total,
        opening_cash, expected_cash, actual_cash, cash_variance,
        total_receipts, total_invoices,
        generated_by, generated_by_name,
        report_hash, previous_z_hash
    )
    VALUES (
        v_shift.business_id, v_z_number, p_shift_id,
        v_shift.opened_at, now(),
        v_shift.total_sales, v_shift.net_sales, v_shift.total_refunds, 0,
        v_shift.cash_sales, v_shift.card_sales,
        v_shift.opening_cash, v_shift.expected_cash, p_actual_cash, p_actual_cash - v_shift.expected_cash,
        v_shift.receipts_issued, v_shift.invoices_issued,
        p_closed_by, p_closed_by_name,
        v_hash, v_prev_hash
    )
    RETURNING id INTO v_z_id;
    
    RETURN v_z_id;
END;
$$;

-- =====================================================================
-- 8. INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_cash_shifts_business ON cash_shifts(business_id);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_open ON cash_shifts(business_id, terminal_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_z_reports_business ON z_reports(business_id);
CREATE INDEX IF NOT EXISTS idx_z_reports_number ON z_reports(z_number);
CREATE INDEX IF NOT EXISTS idx_z_reports_period ON z_reports(business_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_x_reports_shift ON x_reports(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_transactions_shift ON shift_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_transactions_type ON shift_transactions(transaction_type);

-- =====================================================================
-- 9. TRIGGERS
-- =====================================================================

-- Trigger to update shift totals after transaction insert
CREATE OR REPLACE FUNCTION trigger_update_shift_totals()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_shift_totals(NEW.shift_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_shift_after_transaction
    AFTER INSERT ON shift_transactions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_shift_totals();

-- Update timestamp trigger
CREATE TRIGGER trigger_cash_shifts_updated
    BEFORE UPDATE ON cash_shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_fiscal_updated_at();

-- =====================================================================
-- 10. COMMENTS
-- =====================================================================
COMMENT ON TABLE cash_shifts IS 'Cash drawer sessions with opening/closing amounts and transaction totals';
COMMENT ON TABLE z_reports IS 'End-of-day Z-reports with immutable hash chain - required by Israeli tax law';
COMMENT ON TABLE x_reports IS 'Mid-day snapshot reports (no counter reset)';
COMMENT ON TABLE shift_transactions IS 'All transactions within a cash shift for audit trail';
COMMENT ON FUNCTION get_next_z_number IS 'Atomic function to get next Z-report number - never gaps';
COMMENT ON FUNCTION close_shift_with_z_report IS 'Closes shift and generates Z-report atomically';
