-- Add original currency columns to trips if they don't exist
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS wholesale_original_amount numeric,
ADD COLUMN IF NOT EXISTS wholesale_currency text,
ADD COLUMN IF NOT EXISTS sale_original_amount numeric,
ADD COLUMN IF NOT EXISTS sale_currency text;

-- Drop and recreate the RPC to include new columns
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
  travelers jsonb,
  wholesale_original_amount numeric,
  wholesale_currency text,
  sale_original_amount numeric,
  sale_currency text
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
    t.travelers,
    t.wholesale_original_amount,
    t.wholesale_currency,
    t.sale_original_amount,
    t.sale_currency
  FROM trips t
  WHERE 
    t.user_id = auth.uid() AND
    TO_CHAR(COALESCE(t.payment_date, t.start_date), 'YYYY') = year_input
  ORDER BY t.start_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_trips_by_year(text) TO authenticated;
