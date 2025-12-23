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
  board_basis text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM trips
  WHERE 
    user_id = auth.uid() AND
    TO_CHAR(COALESCE(payment_date, start_date), 'YYYY') = year_input
  ORDER BY start_date DESC;
END;
$$;
