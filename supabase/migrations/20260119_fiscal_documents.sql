-- =====================================================================
-- ISRAELI FISCAL COMPLIANCE - FISCAL DOCUMENTS SCHEMA
-- Migration: 20260119_fiscal_documents.sql
-- Purpose: Complete fiscal document management for Israeli POS compliance
-- Implements: חשבונית מס, קבלה, חשבונית מס קבלה, הודעת זיכוי
-- =====================================================================

-- Enable UUID if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. ENUM TYPES
-- =====================================================================

-- Document types per Israeli regulations
DO $$ BEGIN
    CREATE TYPE fiscal_document_type AS ENUM (
        'receipt',              -- קבלה
        'tax_invoice',          -- חשבונית מס
        'tax_invoice_receipt',  -- חשבונית מס קבלה
        'credit_note',          -- הודעת זיכוי
        'debit_note'            -- הודעת חיוב
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- VAT categories per Israeli tax law
DO $$ BEGIN
    CREATE TYPE vat_category AS ENUM (
        'standard',    -- 17% standard rate
        'zero_rated',  -- 0% but VAT recoverable (exports, etc.)
        'exempt',      -- Exempt from VAT (legal distinction from 0%)
        'eilat'        -- Eilat VAT-free zone
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Document status
DO $$ BEGIN
    CREATE TYPE fiscal_document_status AS ENUM (
        'draft',
        'issued',
        'cancelled',
        'voided'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================================
-- 2. FISCAL COUNTERS TABLE (Sequential Numbering - No Gaps)
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
    
    -- Each business has one counter per document type
    UNIQUE(business_id, document_type)
);

-- =====================================================================
-- 3. FISCAL DOCUMENTS TABLE (Main Document Storage)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.fiscal_documents (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Document identification
    document_type fiscal_document_type NOT NULL,
    document_number BIGINT NOT NULL,
    document_prefix TEXT DEFAULT '',
    full_document_number TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN document_prefix = '' THEN document_number::TEXT
            ELSE document_prefix || '-' || document_number::TEXT
        END
    ) STORED,
    
    -- Status
    status fiscal_document_status NOT NULL DEFAULT 'issued',
    
    -- Business details (snapshot at time of issue)
    business_name TEXT NOT NULL,
    business_registration_number TEXT, -- ע.מ. / ח.פ.
    business_address TEXT,
    business_phone TEXT,
    business_email TEXT,
    
    -- Customer details (mandatory for invoices > 5,000 NIS)
    customer_name TEXT,
    customer_id_number TEXT,          -- ת.ז. or ח.פ.
    customer_address TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    
    -- Linked documents (for credit notes, etc.)
    original_document_id uuid REFERENCES public.fiscal_documents(id),
    
    -- Totals (all in ILS agorot for precision)
    subtotal_before_vat BIGINT NOT NULL DEFAULT 0,  -- In agorot
    vat_amount BIGINT NOT NULL DEFAULT 0,           -- In agorot
    total_amount BIGINT NOT NULL DEFAULT 0,         -- In agorot
    discount_amount BIGINT DEFAULT 0,               -- In agorot
    tip_amount BIGINT DEFAULT 0,                    -- In agorot
    
    -- VAT breakdown (in agorot)
    vat_17_base BIGINT DEFAULT 0,
    vat_17_amount BIGINT DEFAULT 0,
    vat_0_base BIGINT DEFAULT 0,    -- Zero-rated
    exempt_base BIGINT DEFAULT 0,    -- Exempt
    
    -- Israel Invoices Model (מודל חשבוניות ישראל)
    allocation_number TEXT,           -- מספר הקצאה
    allocation_status TEXT DEFAULT 'not_required',
    allocation_requested_at TIMESTAMPTZ,
    allocation_received_at TIMESTAMPTZ,
    allocation_error TEXT,
    requires_allocation BOOLEAN GENERATED ALWAYS AS (
        total_amount >= 2500000  -- 25,000 NIS in agorot
    ) STORED,
    
    -- Digital signature / Hash chain (Black Box)
    document_hash TEXT NOT NULL,
    previous_hash TEXT,
    signature_data TEXT,
    
    -- Payment information (for tax invoice receipts)
    payment_method TEXT,
    payment_reference TEXT,
    
    -- Notes
    internal_notes TEXT,
    printed_notes TEXT,  -- Appears on document
    
    -- Cancellation
    cancelled_at TIMESTAMPTZ,
    cancelled_by uuid REFERENCES auth.users(id),
    cancellation_reason TEXT,
    
    -- Audit
    created_by uuid REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_totals CHECK (total_amount = subtotal_before_vat + vat_amount - discount_amount + tip_amount),
    CONSTRAINT unique_document_number UNIQUE (business_id, document_type, document_number)
);

-- =====================================================================
-- 4. FISCAL DOCUMENT ITEMS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.fiscal_document_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id uuid REFERENCES public.fiscal_documents(id) ON DELETE CASCADE NOT NULL,
    
    -- Item details
    item_id uuid,                     -- Reference to menu_item if applicable
    barcode TEXT,
    description TEXT NOT NULL,
    description_he TEXT,              -- Hebrew description
    
    -- Quantity and price
    quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',          -- kg, pcs, portion, etc.
    unit_price BIGINT NOT NULL,       -- In agorot
    
    -- Discounts
    discount_amount BIGINT DEFAULT 0, -- In agorot
    discount_percentage NUMERIC(5, 2) DEFAULT 0,
    
    -- Line totals
    line_subtotal BIGINT NOT NULL,    -- In agorot (qty * price - discount)
    
    -- VAT
    vat_category vat_category NOT NULL DEFAULT 'standard',
    vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 17.00,
    vat_amount BIGINT NOT NULL,       -- In agorot
    line_total BIGINT NOT NULL,       -- In agorot (subtotal + vat)
    
    -- Ordering
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 5. ALLOCATION NUMBERS LOG (Israel Invoices Model Tracking)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.allocation_numbers_log (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    document_id uuid REFERENCES public.fiscal_documents(id) ON DELETE SET NULL,
    
    -- Request details
    allocation_number TEXT,
    request_payload JSONB,
    response_payload JSONB,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, success, failed, cancelled
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Timestamps
    requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =====================================================================
-- 6. RLS POLICIES
-- =====================================================================
ALTER TABLE fiscal_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_numbers_log ENABLE ROW LEVEL SECURITY;

-- Counters policies
CREATE POLICY "Users can manage their own fiscal counters"
    ON fiscal_counters FOR ALL
    USING (auth.uid() = business_id);

-- Documents policies
CREATE POLICY "Users can read their own fiscal documents"
    ON fiscal_documents FOR SELECT
    USING (auth.uid() = business_id);

CREATE POLICY "Users can insert their own fiscal documents"
    ON fiscal_documents FOR INSERT
    WITH CHECK (auth.uid() = business_id);

-- Note: Updates limited to specific fields (status, cancellation) - handled by functions
CREATE POLICY "Users can update their own fiscal documents"
    ON fiscal_documents FOR UPDATE
    USING (auth.uid() = business_id);

-- Items policies (inherit from document)
CREATE POLICY "Users can manage items of their own documents"
    ON fiscal_document_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM fiscal_documents d
            WHERE d.id = fiscal_document_items.document_id
            AND d.business_id = auth.uid()
        )
    );

-- Allocation log policies
CREATE POLICY "Users can manage their own allocation logs"
    ON allocation_numbers_log FOR ALL
    USING (auth.uid() = business_id);

-- =====================================================================
-- 7. FUNCTIONS
-- =====================================================================

-- Function: Get next document number (atomic, no gaps)
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
    -- Insert or update the counter, returning the new number
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

-- Function: Calculate document hash (SHA-256 of key fields)
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
    SELECT 
        business_id, document_type, document_number,
        total_amount, created_at
    INTO v_doc
    FROM fiscal_documents
    WHERE id = p_document_id;
    
    -- Concatenate key fields for hashing
    v_hash_input := COALESCE(p_previous_hash, '') || '|' ||
                    v_doc.business_id::TEXT || '|' ||
                    v_doc.document_type::TEXT || '|' ||
                    v_doc.document_number::TEXT || '|' ||
                    v_doc.total_amount::TEXT || '|' ||
                    v_doc.created_at::TEXT;
    
    -- Calculate SHA-256 hash
    v_hash := encode(digest(v_hash_input, 'sha256'), 'hex');
    
    -- Update the document with the hash
    UPDATE fiscal_documents
    SET document_hash = v_hash, previous_hash = p_previous_hash
    WHERE id = p_document_id;
    
    RETURN v_hash;
END;
$$;

-- Function: Get previous document hash for chain
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

-- Function: Cancel document (legal cancellation, not deletion)
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
    -- Get document and verify ownership
    SELECT * INTO v_doc
    FROM fiscal_documents
    WHERE id = p_document_id
      AND business_id = auth.uid();
    
    IF v_doc IS NULL THEN
        RAISE EXCEPTION 'Document not found or access denied';
    END IF;
    
    IF v_doc.status != 'issued' THEN
        RAISE EXCEPTION 'Only issued documents can be cancelled';
    END IF;
    
    -- Update document status
    UPDATE fiscal_documents
    SET 
        status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = p_cancelled_by,
        cancellation_reason = p_reason,
        updated_at = now()
    WHERE id = p_document_id;
    
    RETURN TRUE;
END;
$$;

-- =====================================================================
-- 8. INDEXES
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

-- =====================================================================
-- 9. TRIGGERS
-- =====================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_fiscal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fiscal_documents_updated
    BEFORE UPDATE ON fiscal_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_fiscal_updated_at();

CREATE TRIGGER trigger_fiscal_counters_updated
    BEFORE UPDATE ON fiscal_counters
    FOR EACH ROW
    EXECUTE FUNCTION update_fiscal_updated_at();

-- =====================================================================
-- 10. COMMENTS
-- =====================================================================
COMMENT ON TABLE fiscal_counters IS 'Sequential document numbering per business and type - ensures no gaps';
COMMENT ON TABLE fiscal_documents IS 'Main fiscal document storage - receipts, invoices, credit notes per Israeli law';
COMMENT ON TABLE fiscal_document_items IS 'Line items for fiscal documents with VAT breakdown';
COMMENT ON TABLE allocation_numbers_log IS 'Tracking for Israel Invoices Model API requests';
COMMENT ON FUNCTION get_next_document_number IS 'Atomic function to get next sequential document number with no gaps';
COMMENT ON FUNCTION calculate_document_hash IS 'Calculates SHA-256 hash chain for document integrity (black box)';
