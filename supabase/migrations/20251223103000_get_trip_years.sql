CREATE OR REPLACE FUNCTION get_trip_years()
RETURNS TABLE (
  year text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT TO_CHAR(COALESCE(payment_date, start_date), 'YYYY') as year
  FROM trips
  WHERE user_id = auth.uid()
  ORDER BY year DESC;
END;
$$;
