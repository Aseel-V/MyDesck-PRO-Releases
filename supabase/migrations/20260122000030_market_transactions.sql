-- ============================================================================
-- MARKET MODE TRANSACTIONS
-- Migration: 20260122_market_transactions.sql
-- Purpose: Store POS receipt history linked to orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES auth.users(id),
  order_id UUID REFERENCES restaurant_orders(id), -- Link to main order table if used
  receipt_number TEXT NOT NULL,
  
  -- Snapshotted data for receipt re-printing
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  
  -- Payment details
  payment_method TEXT NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  change_amount NUMERIC NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE market_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own market transactions"
  ON market_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id);

CREATE POLICY "Users can insert own market transactions"
  ON market_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = business_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_transactions_business_date 
  ON market_transactions(business_id, created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_market_transactions_receipt 
  ON market_transactions(business_id, receipt_number);
