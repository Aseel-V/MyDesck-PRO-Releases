-- Forward-only correction for payment summaries returned by Travel Mode read RPCs.
-- Cash uses the persisted trip payment state, Visa uses its deterministic schedule,
-- and Mixed exposes both components while retaining the trip's authoritative balance.

CREATE OR REPLACE FUNCTION public.get_owned_trip_payment_summary(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH owned_trip AS (
    SELECT t.id, t.user_id, t.sale_price, t.amount_paid, t.payment_status,
      t.payment_method, t.cash_paid_amount, t.currency
    FROM public.trips AS t
    WHERE t.id = p_trip_id
      AND t.user_id = auth.uid()
      AND t.deleted_at IS NULL
  )
  SELECT CASE WHEN plan.id IS NULL THEN NULL ELSE jsonb_build_object(
    'plan_id', plan.id,
    'source', plan.source,
    'payment_method', plan.payment_method,
    'currency', plan.currency,
    'card_total_minor', plan.card_total_minor,
    'cash_total_minor', CASE
      WHEN plan.payment_method = 'cash' THEN financial.sale_minor
      ELSE plan.cash_total_minor
    END,
    'stored_cash_paid_minor', plan.cash_paid_minor,
    'cash_paid_minor', CASE
      WHEN plan.payment_method = 'cash'
        THEN least(financial.sale_minor, greatest(plan.cash_paid_minor, financial.paid_minor))
      WHEN plan.payment_method = 'mixed'
        THEN least(plan.cash_total_minor, greatest(plan.cash_paid_minor, financial.mixed_cash_paid_minor))
      ELSE 0
    END,
    'installment_count', plan.installment_count,
    'processed_installments', coalesce(schedule.processed_installments, 0),
    'scheduled_minor_to_date', coalesce(schedule.scheduled_minor_to_date, 0),
    'remaining_scheduled_minor', greatest(plan.card_total_minor - coalesce(schedule.scheduled_minor_to_date, 0), 0),
    'next_installment_minor', schedule.next_installment_minor,
    'next_installment_date', schedule.next_installment_date,
    'final_installment_date', schedule.final_installment_date,
    'authoritative_paid_minor', financial.paid_minor,
    'authoritative_remaining_minor', financial.remaining_minor,
    'authoritative_payment_status', financial.effective_payment_status,
    'combined_remaining_minor', CASE
      WHEN plan.payment_method = 'card' AND plan.installment_count > 0
        THEN greatest(plan.card_total_minor - coalesce(schedule.scheduled_minor_to_date, 0), 0)
      ELSE financial.remaining_minor
    END
  ) END
  FROM owned_trip AS trip
  CROSS JOIN LATERAL (
    SELECT
      greatest(round(coalesce(trip.sale_price, 0) * 100)::bigint, 0) AS sale_minor,
      least(
        greatest(round(coalesce(trip.sale_price, 0) * 100)::bigint, 0),
        greatest(round(coalesce(trip.amount_paid, 0) * 100)::bigint, 0)
      ) AS paid_minor,
      greatest(round((coalesce(trip.sale_price, 0) - coalesce(trip.amount_paid, 0)) * 100)::bigint, 0) AS remaining_minor,
      greatest(round(coalesce(trip.cash_paid_amount, 0) * 100)::bigint, 0) AS mixed_cash_paid_minor,
      CASE
        WHEN coalesce(trip.amount_paid, 0) <= 0 THEN 'unpaid'
        WHEN coalesce(trip.amount_paid, 0) < coalesce(trip.sale_price, 0) THEN 'partial'
        ELSE 'paid'
      END AS effective_payment_status
  ) AS financial
  LEFT JOIN LATERAL (
    SELECT pp.*
    FROM public.trip_payment_plans AS pp
    WHERE pp.trip_id = trip.id
      AND pp.user_id = trip.user_id
      AND pp.deleted_at IS NULL
      AND pp.status <> 'cancelled'
    ORDER BY pp.updated_at DESC
    LIMIT 1
  ) AS plan ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (
        WHERE installment.status <> 'cancelled' AND installment.due_date <= current_date
      )::integer AS processed_installments,
      coalesce(sum(installment.expected_amount_minor) FILTER (
        WHERE installment.status <> 'cancelled' AND installment.due_date <= current_date
      ), 0)::bigint AS scheduled_minor_to_date,
      min(installment.due_date) FILTER (
        WHERE installment.status <> 'cancelled' AND installment.due_date > current_date
      ) AS next_installment_date,
      (array_agg(installment.expected_amount_minor ORDER BY installment.due_date, installment.installment_number)
        FILTER (WHERE installment.status <> 'cancelled' AND installment.due_date > current_date))[1] AS next_installment_minor,
      max(installment.due_date) FILTER (WHERE installment.status <> 'cancelled') AS final_installment_date
    FROM public.trip_installments AS installment
    WHERE installment.payment_plan_id = plan.id
  ) AS schedule ON true;
$$;

REVOKE ALL ON FUNCTION public.get_owned_trip_payment_summary(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_details(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (to_jsonb(trip) - 'search_document') || jsonb_build_object(
    'travelers', public.trip_decrypt_travelers(trip.travelers),
    'payment_plan_summary', public.get_owned_trip_payment_summary(trip.id)
  )
  FROM public.trips AS trip
  WHERE trip.id = p_trip_id
    AND trip.user_id = auth.uid()
    AND trip.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_trip_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_dashboard_items(p_year text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', trip.id, 'user_id', trip.user_id, 'destination', trip.destination,
      'client_name', trip.client_name, 'travelers_count', trip.travelers_count,
      'start_date', trip.start_date, 'end_date', trip.end_date,
      'currency', trip.currency, 'exchange_rate', trip.exchange_rate,
      'wholesale_cost', trip.wholesale_cost, 'sale_price', trip.sale_price,
      'profit', trip.profit, 'profit_percentage', trip.profit_percentage,
      'payment_date', trip.payment_date, 'payment_status', trip.payment_status,
      'amount_paid', trip.amount_paid,
      'amount_due', greatest(trip.sale_price - trip.amount_paid, 0),
      'payment_method', trip.payment_method,
      'card_paid_amount', trip.card_paid_amount,
      'cash_paid_amount', trip.cash_paid_amount,
      'payment_plan_summary', public.get_owned_trip_payment_summary(trip.id),
      'status', trip.status, 'export_to_pdf', trip.export_to_pdf,
      'service_type', trip.service_type, 'created_at', trip.created_at,
      'updated_at', trip.updated_at
    ) ORDER BY trip.created_at DESC
  ), '[]'::jsonb)
  FROM public.trips AS trip
  WHERE trip.user_id = auth.uid()
    AND trip.deleted_at IS NULL
    AND extract(year FROM coalesce(trip.payment_date, trip.start_date))::text = p_year;
$$;

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
  p_destination text DEFAULT NULL,
  p_sort_key text DEFAULT 'updated_desc'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH filtered AS MATERIALIZED (
    SELECT trip.* FROM public.trips AS trip
    WHERE trip.user_id = auth.uid() AND trip.deleted_at IS NULL
      AND extract(year FROM coalesce(trip.payment_date, trip.start_date))::text = p_year
      AND (nullif(trim(p_search), '') IS NULL OR NOT EXISTS (
        SELECT 1 FROM regexp_split_to_table(lower(trim(p_search)), '\s+') AS search_token(token)
        WHERE search_token.token <> '' AND trip.search_document NOT LIKE '%' || search_token.token || '%'
      ))
      AND (nullif(p_payment_status, '') IS NULL OR trip.payment_status = p_payment_status)
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN trip.status <> 'archived' ELSE trip.status = p_trip_status END)
      AND (p_month IS NULL OR extract(month FROM coalesce(trip.payment_date, trip.start_date))::integer = p_month)
      AND (nullif(p_destination, '') IS NULL OR trip.destination = p_destination)
  ), paged AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort_key = 'updated_asc' THEN updated_at END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'created_desc' THEN created_at END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'created_asc' THEN created_at END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'start_date_asc' THEN start_date END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'start_date_desc' THEN start_date END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'destination_asc' THEN lower(destination) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'destination_desc' THEN lower(destination) END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'client_name_asc' THEN lower(client_name) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'client_name_desc' THEN lower(client_name) END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'sale_price_desc' THEN sale_price END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'sale_price_asc' THEN sale_price END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'profit_desc' THEN profit END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'profit_asc' THEN profit END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'remaining_desc' THEN (sale_price - coalesce(amount_paid, 0)) END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'remaining_asc' THEN (sale_price - coalesce(amount_paid, 0)) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'overdue_first' THEN (CASE WHEN payment_status IN ('unpaid', 'partial') AND start_date < current_date THEN 1 ELSE 0 END) END DESC,
      CASE WHEN p_sort_key IS NULL OR p_sort_key = 'updated_desc' THEN updated_at END DESC NULLS LAST,
      id DESC
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  ), currency_summary AS (
    SELECT coalesce(currency, 'ILS') AS currency, count(*) AS trip_count,
      coalesce(sum(sale_price), 0) AS revenue, coalesce(sum(profit), 0) AS profit,
      coalesce(sum(greatest(sale_price - amount_paid, 0)), 0) AS amount_due
    FROM filtered
    WHERE status NOT IN ('archived', 'cancelled')
    GROUP BY coalesce(currency, 'ILS')
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(
        (to_jsonb(page_trip) - ARRAY['travelers','itinerary','payments','notes','attachments','search_document'])
        || jsonb_build_object(
          'has_itinerary', jsonb_array_length(coalesce(page_trip.itinerary, '[]'::jsonb)) > 0,
          'payment_plan_summary', public.get_owned_trip_payment_summary(page_trip.id)
        )
      ) FROM paged AS page_trip
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM filtered),
    'summary', coalesce((SELECT jsonb_agg(to_jsonb(summary_row)) FROM currency_summary AS summary_row), '[]'::jsonb),
    'upcoming_count', (SELECT count(*) FROM filtered WHERE status NOT IN ('archived','cancelled') AND start_date >= current_date),
    'destinations', coalesce((SELECT jsonb_agg(destination ORDER BY destination) FROM (
      SELECT DISTINCT trip.destination FROM public.trips AS trip
      WHERE trip.user_id = auth.uid() AND trip.deleted_at IS NULL
        AND extract(year FROM coalesce(trip.payment_date, trip.start_date))::text = p_year
    ) AS available_destinations), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text, text) TO authenticated;

COMMENT ON FUNCTION public.get_owned_trip_payment_summary(uuid) IS
  'Returns the canonical owned-trip payment summary shared by detail, list, and dashboard RPCs.';

NOTIFY pgrst, 'reload schema';
