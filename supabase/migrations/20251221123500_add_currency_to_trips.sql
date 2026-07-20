-- Add currency column with default 'USD' and restricted values
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'ILS'));

-- Add exchange_rate column
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL DEFAULT 1.0;
