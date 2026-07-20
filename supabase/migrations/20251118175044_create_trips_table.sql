/*
  # Create Trips Management Table

  ## New Tables
    - `trips`
      - `id` (uuid, primary key) - Unique trip identifier
      - `user_id` (uuid, foreign key) - References auth.users
      - `destination` (text) - Trip destination name
      - `client_name` (text) - Client name
      - `travelers_count` (integer) - Number of travelers
      - `start_date` (date) - Trip start date
      - `end_date` (date) - Trip end date
      - `wholesale_cost` (numeric) - Wholesale cost amount
      - `sale_price` (numeric) - Sale price amount
      - `profit` (numeric, generated) - Calculated profit (sale_price - wholesale_cost)
      - `profit_percentage` (numeric, generated) - Calculated profit percentage
      - `payment_status` (text) - Payment status: 'paid', 'partial', 'unpaid'
      - `amount_paid` (numeric) - Amount paid so far
      - `amount_due` (numeric, generated) - Calculated amount due
      - `notes` (text) - Free text notes
      - `status` (text) - Trip status: 'active', 'completed', 'cancelled'
      - `export_to_pdf` (boolean) - Flag for PDF export
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  ## Security
    - Enable RLS on `trips` table
    - Add policies for authenticated users to:
      - Read their own trips
      - Create their own trips
      - Update their own trips
      - Delete their own trips
*/

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  destination text NOT NULL,
  client_name text NOT NULL,
  travelers_count integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date NOT NULL,
  wholesale_cost numeric(12, 2) NOT NULL DEFAULT 0,
  sale_price numeric(12, 2) NOT NULL DEFAULT 0,
  profit numeric(12, 2) GENERATED ALWAYS AS (sale_price - wholesale_cost) STORED,
  profit_percentage numeric(6, 2) GENERATED ALWAYS AS (
    CASE 
      WHEN wholesale_cost > 0 THEN ((sale_price - wholesale_cost) / wholesale_cost * 100)
      ELSE 0
    END
  ) STORED,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  amount_due numeric(12, 2) GENERATED ALWAYS AS (sale_price - amount_paid) STORED,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  export_to_pdf boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trips"
  ON trips FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own trips"
  ON trips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips"
  ON trips FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips"
  ON trips FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips(user_id);
CREATE INDEX IF NOT EXISTS trips_start_date_idx ON trips(start_date);
CREATE INDEX IF NOT EXISTS trips_payment_status_idx ON trips(payment_status);
CREATE INDEX IF NOT EXISTS trips_status_idx ON trips(status);
