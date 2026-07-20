-- ============================================================================
-- MARKET MODE SETTINGS TABLE
-- Migration: 20260117200000_market_mode_settings.sql
-- Purpose: Store operation mode and market-specific settings per business
-- ============================================================================

-- Create business_settings table
CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_mode TEXT NOT NULL DEFAULT 'restaurant' CHECK (operation_mode IN ('restaurant', 'market')),
  market_scale_prefix TEXT NOT NULL DEFAULT '20',
  market_scale_port TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id)
);

-- Enable RLS
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own business settings
CREATE POLICY "Users can read own business settings"
  ON business_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id);

CREATE POLICY "Users can insert own business settings"
  ON business_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = business_id);

CREATE POLICY "Users can update own business settings"
  ON business_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

CREATE POLICY "Users can delete own business settings"
  ON business_settings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = business_id);

-- Index for fast lookup by business_id
CREATE INDEX IF NOT EXISTS idx_business_settings_business_id ON business_settings(business_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_business_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_business_settings_updated_at
  BEFORE UPDATE ON business_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_business_settings_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE business_settings IS 'Stores per-business configuration including operation mode (restaurant/market)';
COMMENT ON COLUMN business_settings.operation_mode IS 'Primary operation mode: restaurant (table-based) or market (barcode-based POS)';
COMMENT ON COLUMN business_settings.market_scale_prefix IS 'Prefix for price-embedded barcodes from scales (e.g., 20, 21, 22)';
COMMENT ON COLUMN business_settings.market_scale_port IS 'Serial port for connected scale (e.g., COM3 on Windows)';
