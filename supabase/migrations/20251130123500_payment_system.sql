-- Create Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guide_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance_available NUMERIC(10, 2) DEFAULT 0.00,
  balance_pending NUMERIC(10, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  type TEXT CHECK (type IN ('booking', 'payout', 'tip', 'refund')) NOT NULL,
  status TEXT CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
  source_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  -- source_live_event_id UUID, -- Assuming live_events table exists or will be created. If not, we can add this later or make it nullable.
  payer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Payouts Table
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guide_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  method TEXT CHECK (method IN ('stripe', 'paypal')) NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processed', 'failed')) DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Wallets: Guides can view their own wallet
CREATE POLICY "Guides can view their own wallet" ON wallets
  FOR SELECT USING (auth.uid() = guide_id);

-- Transactions: Guides can view their own transactions
CREATE POLICY "Guides can view their own transactions" ON transactions
  FOR SELECT USING (wallet_id IN (SELECT id FROM wallets WHERE guide_id = auth.uid()));

-- Payouts: Guides can view their own payouts
CREATE POLICY "Guides can view their own payouts" ON payouts
  FOR SELECT USING (auth.uid() = guide_id);
CREATE POLICY "Guides can insert their own payouts" ON payouts
  FOR INSERT WITH CHECK (auth.uid() = guide_id);

-- Escrow Logic Function
CREATE OR REPLACE FUNCTION release_escrow_funds()
RETURNS VOID AS $$
DECLARE
  txn RECORD;
BEGIN
  -- Iterate over pending transactions that are ready to be released
  -- This assumes 'trips' table has 'end_date' or similar. 
  -- We'll assume 'start_date' + 1 day for simplicity if end_date isn't available, or check specific logic.
  -- For this example, we'll look for transactions older than 24h from creation if they are 'booking' type, 
  -- OR strictly follow the "24h after trip_date" rule if we join with trips.
  
  -- Let's assume we join with trips to check the date.
  FOR txn IN 
    SELECT t.id, t.wallet_id, t.amount 
    FROM transactions t
    JOIN trips tr ON t.source_trip_id = tr.id
    WHERE t.status = 'pending' 
      AND t.type = 'booking'
      AND (tr.start_date::timestamp + interval '1 day') < NOW() -- Simplified check: 24h after start_date
  LOOP
    -- Move funds
    UPDATE wallets 
    SET balance_pending = balance_pending - txn.amount,
        balance_available = balance_available + txn.amount
    WHERE id = txn.wallet_id;

    -- Update transaction status
    UPDATE transactions 
    SET status = 'completed' 
    WHERE id = txn.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update wallet timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wallets_updated_at
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
