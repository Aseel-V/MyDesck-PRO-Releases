-- Forward-only repair for Travel Mode clients deployed before the RPC migration reached
-- the target project. Apply all earlier pending migrations before this contract refresh.
-- Rollback: these CREATE OR REPLACE statements are compatible with the preceding API;
-- reverting the client does not require dropping them.

CREATE OR REPLACE FUNCTION public.get_trip_details(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT to_jsonb(t) - 'search_document' || jsonb_build_object(
    'travelers', public.trip_decrypt_travelers(t.travelers)
  )
  FROM public.trips AS t
  WHERE t.id = p_trip_id
    AND t.user_id = auth.uid()
    AND t.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.get_trip_details(uuid) IS
  'Returns one owned, non-deleted trip and decrypts traveler passports only for explicit detail access.';
REVOKE ALL ON FUNCTION public.get_trip_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_dashboard_items(p_year text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id, 'user_id', t.user_id, 'destination', t.destination,
      'client_name', t.client_name, 'travelers_count', t.travelers_count,
      'start_date', t.start_date, 'end_date', t.end_date,
      'currency', t.currency, 'exchange_rate', t.exchange_rate,
      'wholesale_cost', t.wholesale_cost, 'sale_price', t.sale_price,
      'profit', t.profit, 'profit_percentage', t.profit_percentage,
      'payment_date', t.payment_date, 'payment_status', t.payment_status,
      'amount_paid', t.amount_paid,
      'amount_due', greatest(t.sale_price - t.amount_paid, 0),
      'status', t.status, 'export_to_pdf', t.export_to_pdf,
      'service_type', t.service_type, 'created_at', t.created_at,
      'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC
  ), '[]'::jsonb)
  FROM public.trips AS t
  WHERE t.user_id = auth.uid()
    AND t.deleted_at IS NULL
    AND extract(year FROM coalesce(t.payment_date, t.start_date))::text = p_year;
$$;

COMMENT ON FUNCTION public.get_trip_dashboard_items(text) IS
  'Returns owned dashboard scalar fields only; traveler, note, payment, and attachment JSON are excluded.';
REVOKE ALL ON FUNCTION public.get_trip_dashboard_items(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_dashboard_items(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trips_page(
  p_year text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24,
  p_search text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_trip_status text DEFAULT NULL,
  p_month integer DEFAULT NULL,
  p_destination text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH filtered AS MATERIALIZED (
    SELECT t.*
    FROM public.trips AS t
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
      AND extract(year FROM coalesce(t.payment_date, t.start_date))::text = p_year
      AND (
        NULLIF(trim(p_search), '') IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM regexp_split_to_table(lower(trim(p_search)), '\s+') AS search_token(token)
          WHERE token <> '' AND t.search_document NOT LIKE '%' || token || '%'
        )
      )
      AND (NULLIF(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (
        CASE
          WHEN NULLIF(p_trip_status, '') IS NULL THEN t.status <> 'archived'
          ELSE t.status = p_trip_status
        END
      )
      AND (p_month IS NULL OR extract(month FROM coalesce(t.payment_date, t.start_date))::integer = p_month)
      AND (NULLIF(p_destination, '') IS NULL OR t.destination = p_destination)
  ),
  paged AS (
    SELECT * FROM filtered
    ORDER BY start_date DESC NULLS LAST, created_at DESC, id DESC
    LIMIT LEAST(GREATEST(p_page_size, 1), 100)
    OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100)
  ),
  currency_summary AS (
    SELECT coalesce(currency, 'ILS') AS currency, count(*) AS trip_count,
      coalesce(sum(sale_price), 0) AS revenue,
      coalesce(sum(profit), 0) AS profit,
      coalesce(sum(greatest(sale_price - amount_paid, 0)), 0) AS amount_due
    FROM filtered
    WHERE status NOT IN ('archived', 'cancelled')
    GROUP BY coalesce(currency, 'ILS')
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(
        to_jsonb(p) - ARRAY['travelers', 'itinerary', 'payments', 'notes', 'attachments', 'search_document']
        ORDER BY p.start_date DESC NULLS LAST, p.created_at DESC, p.id DESC
      ) FROM paged AS p
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM filtered),
    'summary', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM currency_summary AS s), '[]'::jsonb),
    'upcoming_count', (
      SELECT count(*) FROM filtered
      WHERE status NOT IN ('archived', 'cancelled') AND start_date >= current_date
    ),
    'destinations', coalesce((
      SELECT jsonb_agg(destination ORDER BY destination)
      FROM (
        SELECT DISTINCT t.destination
        FROM public.trips AS t
        WHERE t.user_id = auth.uid()
          AND t.deleted_at IS NULL
          AND extract(year FROM coalesce(t.payment_date, t.start_date))::text = p_year
      ) AS available_destinations
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text) IS
  'Returns a stable page of owned non-deleted lightweight trip rows and filtered aggregate metadata.';
REVOKE ALL ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_years()
RETURNS TABLE (year text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT extract(year FROM coalesce(payment_date, start_date))::text AS year
  FROM public.trips
  WHERE user_id = auth.uid() AND deleted_at IS NULL
  ORDER BY year DESC;
$$;

REVOKE ALL ON FUNCTION public.get_trip_years() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_years() TO authenticated;

-- Supabase PostgREST listens for this notification and refreshes function signatures.
NOTIFY pgrst, 'reload schema';
