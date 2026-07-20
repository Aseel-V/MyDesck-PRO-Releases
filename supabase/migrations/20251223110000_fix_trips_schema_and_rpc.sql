-- Add missing columns to trips table
ALTER TABLE "public"."trips" 
ADD COLUMN IF NOT EXISTS "payments" jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "itinerary" jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "travelers" jsonb DEFAULT '[]'::jsonb;

-- Re-create get_trips_by_year RPC
DROP FUNCTION IF EXISTS get_trips_by_year(text);

CREATE OR REPLACE FUNCTION get_trips_by_year(year_input text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  destination text,
  client_name text,
  travelers_count integer,
  start_date date,
  end_date date,
  wholesale_cost numeric,
  sale_price numeric,
  profit numeric,
  profit_percentage numeric,
  payment_status text,
  amount_paid numeric,
  amount_due numeric,
  notes text,
  status text,
  export_to_pdf boolean,
  created_at timestamptz,
  updated_at timestamptz,
  currency text,
  exchange_rate numeric,
  payments jsonb,
  attachments jsonb,
  payment_date date,
  room_type text,
  board_basis text,
  itinerary jsonb,
  travelers jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.user_id,
    t.destination,
    t.client_name,
    t.travelers_count,
    t.start_date,
    t.end_date,
    t.wholesale_cost,
    t.sale_price,
    t.profit,
    t.profit_percentage,
    t.payment_status,
    t.amount_paid,
    t.amount_due,
    t.notes,
    t.status,
    t.export_to_pdf,
    t.created_at,
    t.updated_at,
    t.currency,
    t.exchange_rate,
    t.payments,
    t.attachments,
    t.payment_date,
    t.room_type,
    t.board_basis,
    t.itinerary,
    t.travelers
  FROM trips t
  WHERE 
    t.user_id = auth.uid() AND
    TO_CHAR(COALESCE(t.payment_date, t.start_date), 'YYYY') = year_input
  ORDER BY t.start_date DESC;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_trips_by_year(text) TO authenticated;

-- Re-create get_trip_years RPC
DROP FUNCTION IF EXISTS get_trip_years();

CREATE OR REPLACE FUNCTION get_trip_years()
RETURNS TABLE (
  year text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT TO_CHAR(COALESCE(payment_date, start_date), 'YYYY') as year
  FROM trips
  WHERE user_id = auth.uid()
  ORDER BY year DESC;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_trip_years() TO authenticated;
