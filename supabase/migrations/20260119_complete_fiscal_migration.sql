-- =====================================================================
-- ISRAELI POS COMPLIANCE - COMPLETE MIGRATION
-- File: 20260119_complete_fiscal_migration.sql
-- Purpose: All fiscal tables in correct order for Israeli supermarket POS
-- Run this SINGLE file in Supabase SQL Editor
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- PART 1: ENUM TYPES
-- =====================================================================

DO $$ BEGIN
    CREATE TYPE fiscal_document_type AS ENUM (
        'receipt',
        'tax_invoice',
        'tax_invoice_receipt',
        'credit_note',
        'debit_note'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE vat_category AS ENUM (
        'standard',
        'zero_rated',
        'exempt',
        'eilat'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE fiscal_document_status AS ENUM (
        'draft',
        'issued',
        'cancelled',
        'voided'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- PART 2: HELPER FUNCTION
-- =====================================================================

CREATE OR REPLACE FUNCTION update_fiscal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- PART 3: FISCAL COUNTERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_counters (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    document_type fiscal_document_type NOT NULL,
    current_number BIGINT NOT NULL DEFAULT 0,
    prefix TEXT DEFAULT '',
    last_issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(business_id, document_type)
);

-- =====================================================================
-- PART 4: FISCAL DOCUMENTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_documents (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    document_type fiscal_document_type NOT NULL,
    document_number BIGINT NOT NULL,
    document_prefix TEXT DEFAULT '',
    full_document_number TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN document_prefix = '' THEN document_number::TEXT
            ELSE document_prefix || '-' || document_number::TEXT
        END
    ) STORED,
    
    status fiscal_document_status NOT NULL DEFAULT 'issued',
    
    business_name TEXT NOT NULL,
    business_registration_number TEXT,
    business_address TEXT,
    business_phone TEXT,
    business_email TEXT,
    
    customer_name TEXT,
    customer_id_number TEXT,
    customer_address TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    
    original_document_id uuid REFERENCES public.fiscal_documents(id),
    
    subtotal_before_vat BIGINT NOT NULL DEFAULT 0,
    vat_amount BIGINT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL DEFAULT 0,
    discount_amount BIGINT DEFAULT 0,
    tip_amount BIGINT DEFAULT 0,
    
    vat_17_base BIGINT DEFAULT 0,
    vat_17_amount BIGINT DEFAULT 0,
    vat_0_base BIGINT DEFAULT 0,
    exempt_base BIGINT DEFAULT 0,
    
    allocation_number TEXT,
    allocation_status TEXT DEFAULT 'not_required',
    allocation_requested_at TIMESTAMPTZ,
    allocation_received_at TIMESTAMPTZ,
    allocation_error TEXT,
    requires_allocation BOOLEAN GENERATED ALWAYS AS (total_amount >= 2500000) STORED,
    
    document_hash TEXT NOT NULL,
    previous_hash TEXT,
    signature_data TEXT,
    
    payment_method TEXT,
    payment_reference TEXT,
    
    internal_notes TEXT,
    printed_notes TEXT,
    
    cancelled_at TIMESTAMPTZ,
    cancelled_by uuid REFERENCES auth.users(id),
    cancellation_reason TEXT,
    
    created_by uuid REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    CONSTRAINT valid_totals CHECK (total_amount = subtotal_before_vat + vat_amount - discount_amount + tip_amount),
    CONSTRAINT unique_document_number UNIQUE (business_id, document_type, document_number)
);

-- =====================================================================
-- PART 5: FISCAL DOCUMENT ITEMS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_document_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id uuid REFERENCES public.fiscal_documents(id) ON DELETE CASCADE NOT NULL,
    
    item_id uuid,
    barcode TEXT,
    description TEXT NOT NULL,
    description_he TEXT,
    
    quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    unit_price BIGINT NOT NULL,
    
    discount_amount BIGINT DEFAULT 0,
    discount_percentage NUMERIC(5, 2) DEFAULT 0,
    
    line_subtotal BIGINT NOT NULL,
    
    vat_category vat_category NOT NULL DEFAULT 'standard',
    vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 17.00,
    vat_amount BIGINT NOT NULL,
    line_total BIGINT NOT NULL,
    
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- PART 6: ALLOCATION NUMBERS LOG
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.allocation_numbers_log (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    document_id uuid REFERENCES public.fiscal_documents(id) ON DELETE SET NULL,
    
    allocation_number TEXT,
    request_payload JSONB,
    response_payload JSONB,
    
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- PART 7: CASH SHIFTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cash_shifts (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    shift_number BIGINT NOT NULL,
    terminal_id TEXT DEFAULT 'POS-1',
    
    opened_by uuid REFERENCES auth.users(id),
    opened_by_name TEXT,
    closed_by uuid REFERENCES auth.users(id),
    closed_by_name TEXT,
    
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    
    opening_cash BIGINT NOT NULL DEFAULT 0,
    expected_cash BIGINT DEFAULT 0,
    actual_cash BIGINT,
    variance BIGINT,
    
    total_sales BIGINT DEFAULT 0,
    total_refunds BIGINT DEFAULT 0,
    total_voids BIGINT DEFAULT 0,
    net_sales BIGINT DEFAULT 0,
    
    cash_sales BIGINT DEFAULT 0,
    card_sales BIGINT DEFAULT 0,
    other_sales BIGINT DEFAULT 0,
    
    vat_17_sales BIGINT DEFAULT 0,
    vat_17_amount BIGINT DEFAULT 0,
    vat_0_sales BIGINT DEFAULT 0,
    exempt_sales BIGINT DEFAULT 0,
    
    receipts_issued INTEGER DEFAULT 0,
    invoices_issued INTEGER DEFAULT 0,
    credit_notes_issued INTEGER DEFAULT 0,
    
    status TEXT CHECK (status IN ('open', 'closed', 'reconciled')) DEFAULT 'open',
    
    opening_notes TEXT,
    closing_notes TEXT,
    closing_hash TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    CONSTRAINT unique_shift_number UNIQUE (business_id, shift_number)
);

-- =====================================================================
-- PART 8: Z-REPORTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.z_reports (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    z_number BIGINT NOT NULL,
    shift_id uuid REFERENCES public.cash_shifts(id),
    
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    
    gross_sales BIGINT NOT NULL DEFAULT 0,
    returns_refunds BIGINT DEFAULT 0,
    discounts BIGINT DEFAULT 0,
    net_sales BIGINT NOT NULL DEFAULT 0,
    
    vat_17_taxable BIGINT DEFAULT 0,
    vat_17_tax BIGINT DEFAULT 0,
    vat_0_taxable BIGINT DEFAULT 0,
    exempt_taxable BIGINT DEFAULT 0,
    total_vat BIGINT DEFAULT 0,
    
    cash_total BIGINT DEFAULT 0,
    credit_card_total BIGINT DEFAULT 0,
    debit_card_total BIGINT DEFAULT 0,
    checks_total BIGINT DEFAULT 0,
    other_payments_total BIGINT DEFAULT 0,
    
    first_receipt_number BIGINT,
    last_receipt_number BIGINT,
    total_receipts INTEGER DEFAULT 0,
    first_invoice_number BIGINT,
    last_invoice_number BIGINT,
    total_invoices INTEGER DEFAULT 0,
    total_credit_notes INTEGER DEFAULT 0,
    total_cancelled_docs INTEGER DEFAULT 0,
    
    opening_cash BIGINT DEFAULT 0,
    cash_in BIGINT DEFAULT 0,
    cash_out BIGINT DEFAULT 0,
    expected_cash BIGINT DEFAULT 0,
    actual_cash BIGINT,
    cash_variance BIGINT,
    
    sales_by_category JSONB DEFAULT '{}',
    
    generated_by uuid REFERENCES auth.users(id),
    generated_by_name TEXT,
    generated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    report_hash TEXT NOT NULL,
    previous_z_hash TEXT,
    signature_chain_valid BOOLEAN DEFAULT TRUE,
    
    is_final BOOLEAN DEFAULT TRUE,
    is_resend BOOLEAN DEFAULT FALSE,
    sent_to_tax_authority BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    CONSTRAINT unique_z_number UNIQUE (business_id, z_number),
    CONSTRAINT valid_period CHECK (period_end > period_start)
);

-- =====================================================================
-- PART 9: X-REPORTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.x_reports (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    shift_id uuid REFERENCES public.cash_shifts(id),
    
    report_number SERIAL,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    gross_sales BIGINT DEFAULT 0,
    net_sales BIGINT DEFAULT 0,
    total_vat BIGINT DEFAULT 0,
    
    cash_total BIGINT DEFAULT 0,
    card_total BIGINT DEFAULT 0,
    
    receipts_count INTEGER DEFAULT 0,
    invoices_count INTEGER DEFAULT 0,
    
    generated_by uuid REFERENCES auth.users(id),
    generated_by_name TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- PART 10: SHIFT TRANSACTIONS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.shift_transactions (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    shift_id uuid REFERENCES public.cash_shifts(id) ON DELETE CASCADE NOT NULL,
    
    transaction_type TEXT CHECK (transaction_type IN (
        'sale', 'refund', 'void', 'cash_in', 'cash_out', 'no_sale'
    )) NOT NULL,
    
    fiscal_document_id uuid REFERENCES public.fiscal_documents(id),
    order_id uuid,
    
    amount BIGINT NOT NULL,
    
    payment_method TEXT CHECK (payment_method IN (
        'cash', 'credit_card', 'debit_card', 'check', 'other', 'multi'
    )),
    
    card_last_four TEXT,
    card_type TEXT,
    auth_code TEXT,
    terminal_transaction_id TEXT,
    
    performed_by uuid REFERENCES auth.users(id),
    performed_by_name TEXT,
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- PART 11: Z-NUMBER COUNTER TABLE
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
-- PART 12: RLS POLICIES
-- =====================================================================

ALTER TABLE fiscal_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_numbers_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_counters ENABLE ROW LEVEL SECURITY;

-- Fiscal Counters
CREATE POLICY "Users can manage their own fiscal counters"
    ON fiscal_counters FOR ALL USING (auth.uid() = business_id);

-- Fiscal Documents
CREATE POLICY "Users can read their own fiscal documents"
    ON fiscal_documents FOR SELECT USING (auth.uid() = business_id);

CREATE POLICY "Users can insert their own fiscal documents"
    ON fiscal_documents FOR INSERT WITH CHECK (auth.uid() = business_id);

CREATE POLICY "Users can update their own fiscal documents"
    ON fiscal_documents FOR UPDATE USING (auth.uid() = business_id);

-- Fiscal Document Items
CREATE POLICY "Users can manage items of their own documents"
    ON fiscal_document_items FOR ALL
    USING (EXISTS (
        SELECT 1 FROM fiscal_documents d
        WHERE d.id = fiscal_document_items.document_id
        AND d.business_id = auth.uid()
    ));

-- Allocation Log
CREATE POLICY "Users can manage their own allocation logs"
    ON allocation_numbers_log FOR ALL USING (auth.uid() = business_id);

-- Cash Shifts
CREATE POLICY "Users can manage their own cash shifts"
    ON cash_shifts FOR ALL USING (auth.uid() = business_id);

-- Z-Reports (read and create only - no updates/deletes)
CREATE POLICY "Users can read their own Z-reports"
    ON z_reports FOR SELECT USING (auth.uid() = business_id);

CREATE POLICY "Users can create their own Z-reports"
    ON z_reports FOR INSERT WITH CHECK (auth.uid() = business_id);

-- X-Reports
CREATE POLICY "Users can manage their own X-reports"
    ON x_reports FOR ALL USING (auth.uid() = business_id);

-- Shift Transactions
CREATE POLICY "Users can manage their own shift transactions"
    ON shift_transactions FOR ALL
    USING (EXISTS (
        SELECT 1 FROM cash_shifts s
        WHERE s.id = shift_transactions.shift_id
        AND s.business_id = auth.uid()
    ));

-- Z-Report Counters
CREATE POLICY "Users can manage their own Z-counters"
    ON z_report_counters FOR ALL USING (auth.uid() = business_id);

-- =====================================================================
-- PART 13: FUNCTIONS
-- =====================================================================

-- Get next document number (atomic, no gaps)
CREATE OR REPLACE FUNCTION get_next_document_number(
    p_business_id uuid,
    p_document_type fiscal_document_type
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_number BIGINT;
BEGIN
    INSERT INTO fiscal_counters (business_id, document_type, current_number, last_issued_at)
    VALUES (p_business_id, p_document_type, 1, now())
    ON CONFLICT (business_id, document_type)
    DO UPDATE SET 
        current_number = fiscal_counters.current_number + 1,
        last_issued_at = now(),
        updated_at = now()
    RETURNING current_number INTO v_next_number;
    
    RETURN v_next_number;
END;
$$;

-- Calculate document hash
CREATE OR REPLACE FUNCTION calculate_document_hash(
    p_document_id uuid,
    p_previous_hash TEXT DEFAULT ''
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hash_input TEXT;
    v_hash TEXT;
    v_doc RECORD;
BEGIN
    SELECT business_id, document_type, document_number, total_amount, created_at
    INTO v_doc FROM fiscal_documents WHERE id = p_document_id;
    
    v_hash_input := COALESCE(p_previous_hash, '') || '|' ||
                    v_doc.business_id::TEXT || '|' ||
                    v_doc.document_type::TEXT || '|' ||
                    v_doc.document_number::TEXT || '|' ||
                    v_doc.total_amount::TEXT || '|' ||
                    v_doc.created_at::TEXT;
    
    v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');
    
    UPDATE fiscal_documents
    SET document_hash = v_hash, previous_hash = p_previous_hash
    WHERE id = p_document_id;
    
    RETURN v_hash;
END;
$$;

-- Get previous document hash
CREATE OR REPLACE FUNCTION get_previous_document_hash(
    p_business_id uuid,
    p_document_type fiscal_document_type
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    SELECT document_hash INTO v_hash
    FROM fiscal_documents
    WHERE business_id = p_business_id
      AND document_type = p_document_type
      AND status = 'issued'
    ORDER BY document_number DESC
    LIMIT 1;
    
    RETURN COALESCE(v_hash, 'GENESIS');
END;
$$;

-- Cancel fiscal document
CREATE OR REPLACE FUNCTION cancel_fiscal_document(
    p_document_id uuid,
    p_reason TEXT,
    p_cancelled_by uuid
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_doc RECORD;
BEGIN
    SELECT * INTO v_doc FROM fiscal_documents
    WHERE id = p_document_id AND business_id = auth.uid();
    
    IF v_doc IS NULL THEN
        RAISE EXCEPTION 'Document not found or access denied';
    END IF;
    
    IF v_doc.status != 'issued' THEN
        RAISE EXCEPTION 'Only issued documents can be cancelled';
    END IF;
    
    UPDATE fiscal_documents SET 
        status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = p_cancelled_by,
        cancellation_reason = p_reason,
        updated_at = now()
    WHERE id = p_document_id;
    
    RETURN TRUE;
END;
$$;

-- Get next Z-number
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

-- Get previous Z hash
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

-- Open cash shift
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
    IF EXISTS (
        SELECT 1 FROM cash_shifts 
        WHERE business_id = p_business_id 
        AND terminal_id = p_terminal_id 
        AND status = 'open'
    ) THEN
        RAISE EXCEPTION 'There is already an open shift for this terminal';
    END IF;
    
    SELECT COALESCE(MAX(shift_number), 0) + 1 INTO v_shift_number
    FROM cash_shifts WHERE business_id = p_business_id;
    
    INSERT INTO cash_shifts (
        business_id, shift_number, terminal_id,
        opened_by, opened_by_name, opening_cash, opening_notes, status
    ) VALUES (
        p_business_id, v_shift_number, p_terminal_id,
        p_opened_by, p_opened_by_name, p_opening_cash, p_notes, 'open'
    )
    RETURNING id INTO v_shift_id;
    
    RETURN v_shift_id;
END;
$$;

-- Update shift totals
CREATE OR REPLACE FUNCTION update_shift_totals(p_shift_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE cash_shifts cs SET
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
            WHERE shift_id = p_shift_id AND transaction_type = 'sale' AND payment_method = 'cash'
        ), 0),
        card_sales = COALESCE((
            SELECT SUM(amount) FROM shift_transactions
            WHERE shift_id = p_shift_id AND transaction_type = 'sale' 
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

-- Close shift with Z-report
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
    SELECT * INTO v_shift FROM cash_shifts WHERE id = p_shift_id FOR UPDATE;
    
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.status != 'open' THEN RAISE EXCEPTION 'Shift is not open'; END IF;
    
    PERFORM update_shift_totals(p_shift_id);
    SELECT * INTO v_shift FROM cash_shifts WHERE id = p_shift_id;
    
    UPDATE cash_shifts SET 
        status = 'closed',
        closed_at = now(),
        closed_by = p_closed_by,
        closed_by_name = p_closed_by_name,
        actual_cash = p_actual_cash,
        variance = p_actual_cash - expected_cash,
        closing_notes = p_notes,
        updated_at = now()
    WHERE id = p_shift_id;
    
    v_z_number := get_next_z_number(v_shift.business_id);
    v_prev_hash := get_previous_z_hash(v_shift.business_id);
    
    v_hash_input := v_prev_hash || '|' || v_z_number::TEXT || '|' ||
                    v_shift.business_id::TEXT || '|' || v_shift.net_sales::TEXT || '|' || now()::TEXT;
    v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');
    
    INSERT INTO z_reports (
        business_id, z_number, shift_id, period_start, period_end,
        gross_sales, net_sales, returns_refunds, discounts,
        cash_total, credit_card_total,
        opening_cash, expected_cash, actual_cash, cash_variance,
        total_receipts, total_invoices,
        generated_by, generated_by_name, report_hash, previous_z_hash
    ) VALUES (
        v_shift.business_id, v_z_number, p_shift_id,
        v_shift.opened_at, now(),
        v_shift.total_sales, v_shift.net_sales, v_shift.total_refunds, 0,
        v_shift.cash_sales, v_shift.card_sales,
        v_shift.opening_cash, v_shift.expected_cash, p_actual_cash, p_actual_cash - v_shift.expected_cash,
        v_shift.receipts_issued, v_shift.invoices_issued,
        p_closed_by, p_closed_by_name, v_hash, v_prev_hash
    )
    RETURNING id INTO v_z_id;
    
    RETURN v_z_id;
END;
$$;

-- =====================================================================
-- PART 14: INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_business ON fiscal_documents(business_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_type ON fiscal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_number ON fiscal_documents(document_number);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_status ON fiscal_documents(status);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_created ON fiscal_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_allocation ON fiscal_documents(allocation_number) WHERE allocation_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_document_items_doc ON fiscal_document_items(document_id);
CREATE INDEX IF NOT EXISTS idx_allocation_log_business ON allocation_numbers_log(business_id);
CREATE INDEX IF NOT EXISTS idx_allocation_log_status ON allocation_numbers_log(status) WHERE status = 'pending';
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
-- PART 15: TRIGGERS
-- =====================================================================

CREATE TRIGGER trigger_fiscal_documents_updated
    BEFORE UPDATE ON fiscal_documents
    FOR EACH ROW EXECUTE FUNCTION update_fiscal_updated_at();

CREATE TRIGGER trigger_fiscal_counters_updated
    BEFORE UPDATE ON fiscal_counters
    FOR EACH ROW EXECUTE FUNCTION update_fiscal_updated_at();

CREATE TRIGGER trigger_cash_shifts_updated
    BEFORE UPDATE ON cash_shifts
    FOR EACH ROW EXECUTE FUNCTION update_fiscal_updated_at();

CREATE OR REPLACE FUNCTION trigger_update_shift_totals()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_shift_totals(NEW.shift_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_shift_after_transaction
    AFTER INSERT ON shift_transactions
    FOR EACH ROW EXECUTE FUNCTION trigger_update_shift_totals();

-- =====================================================================
-- DONE! All fiscal tables created successfully
-- =====================================================================
