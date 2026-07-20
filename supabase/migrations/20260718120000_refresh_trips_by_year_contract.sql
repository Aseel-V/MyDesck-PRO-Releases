-- Keep the yearly Trips-page query aligned with every column on public.trips.
-- Returning the composite row prevents future additive trip columns from being
-- silently omitted when an existing trip is reopened for editing.

DROP FUNCTION IF EXISTS public.get_trips_by_year(text);

CREATE FUNCTION public.get_trips_by_year(year_input text)
RETURNS SETOF public.trips
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT trip.*
  FROM public.trips AS trip
  WHERE trip.user_id = auth.uid()
    AND TO_CHAR(COALESCE(trip.payment_date, trip.start_date), 'YYYY') = year_input
  ORDER BY trip.start_date DESC;
$$;

REVOKE ALL ON FUNCTION public.get_trips_by_year(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trips_by_year(text) TO authenticated;
