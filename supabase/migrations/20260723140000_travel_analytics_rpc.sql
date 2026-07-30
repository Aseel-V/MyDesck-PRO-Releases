-- Forward-only migration: Add travel analytics RPC with three explicit date domains:
-- 1. Financial Performance -> coalesce(trips.payment_date, trips.start_date)
-- 2. Travel Operations -> trips.start_date
-- 3. Payment Schedule & Aging -> trip_installments.due_date
-- Authoritative 0.0.59 payment summaries, strict NULL financial redaction, and self-escalation trigger.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_view_financials boolean NOT NULL DEFAULT false;

-- Ensure business owners default to can_view_financials = true
UPDATE public.user_profiles up
SET can_view_financials = true
FROM public.business_profiles bp
WHERE bp.user_id = up.user_id;

-- Prevent non-owners from self-escalating their financial permission
CREATE OR REPLACE FUNCTION public.prevent_user_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.can_view_financials IS DISTINCT FROM OLD.can_view_financials THEN
    IF NOT EXISTS (SELECT 1 FROM public.business_profiles WHERE user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Non-owner users cannot modify financial permissions' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_profile_self_escalation ON public.user_profiles;
CREATE TRIGGER trg_prevent_user_profile_self_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_profile_self_escalation();

CREATE INDEX IF NOT EXISTS trips_analytics_start_idx
  ON public.trips (user_id, status, deleted_at, start_date);

CREATE INDEX IF NOT EXISTS trips_analytics_payment_date_idx
  ON public.trips (user_id, status, deleted_at, payment_date);

CREATE INDEX IF NOT EXISTS trips_analytics_dest_idx
  ON public.trips (user_id, destination) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_travel_analytics_summary(
  p_year text DEFAULT NULL,
  p_month integer DEFAULT NULL,
  p_trip_status text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_can_view_financials boolean;
  v_current_year integer;
  v_effective_year integer;
  v_curr_start date;
  v_curr_end date;
  v_prev_start date;
  v_prev_end date;
  v_period_type text;

  v_fin_current_stats jsonb;
  v_fin_previous_stats jsonb;
  v_fin_trend jsonb;
  v_destination_sales jsonb;
  v_currency_totals jsonb;

  v_ops_current_stats jsonb;
  v_ops_previous_stats jsonb;
  v_ops_trend jsonb;
  v_destination_volume jsonb;
  v_attention_items jsonb;

  v_payments_summary jsonb;
  v_aging_buckets jsonb;

  v_available_years jsonb;
  v_available_destinations jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_can_view_financials := EXISTS (
    SELECT 1 FROM public.business_profiles bp WHERE bp.user_id = v_user_id
  ) OR coalesce((
    SELECT up.can_view_financials FROM public.user_profiles up WHERE up.user_id = v_user_id
  ), false);

  v_current_year := extract(year FROM current_date)::integer;
  IF p_year IS NOT NULL AND p_year ~ '^\d{4}$' THEN
    v_effective_year := p_year::integer;
  ELSE
    v_effective_year := v_current_year;
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_curr_start := p_start_date;
    v_curr_end := p_end_date;
    v_prev_start := p_start_date - (p_end_date - p_start_date + 1);
    v_prev_end := p_start_date - 1;
    v_period_type := 'custom_range';
  ELSIF p_month IS NOT NULL AND p_month BETWEEN 1 AND 12 THEN
    v_curr_start := make_date(v_effective_year, p_month, 1);
    v_curr_end := (make_date(v_effective_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
    v_prev_start := make_date(v_effective_year - 1, p_month, 1);
    v_prev_end := (make_date(v_effective_year - 1, p_month, 1) + interval '1 month' - interval '1 day')::date;
    v_period_type := 'same_month_previous_year';
  ELSE
    v_curr_start := make_date(v_effective_year, 1, 1);
    v_curr_end := make_date(v_effective_year, 12, 31);
    v_prev_start := make_date(v_effective_year - 1, 1, 1);
    v_prev_end := make_date(v_effective_year - 1, 12, 31);
    v_period_type := 'full_year';
  END IF;

  -- 0. Available Years & Destinations
  SELECT coalesce(jsonb_agg(y ORDER BY y DESC), '[]'::jsonb)
  INTO v_available_years
  FROM (
    SELECT DISTINCT extract(year FROM coalesce(start_date, created_at::date))::text AS y
    FROM public.trips
    WHERE user_id = v_user_id AND deleted_at IS NULL
  ) y_sub;

  SELECT coalesce(jsonb_agg(d ORDER BY d), '[]'::jsonb)
  INTO v_available_destinations
  FROM (
    SELECT DISTINCT destination AS d
    FROM public.trips
    WHERE user_id = v_user_id AND deleted_at IS NULL AND nullif(trim(destination), '') IS NOT NULL
  ) d_sub;

  -- =========================================================================
  -- DOMAIN 1: FINANCIAL PERFORMANCE (Based on coalesce(payment_date, start_date))
  -- =========================================================================
  WITH fin_curr_filtered AS (
    SELECT
      t.id, t.destination, t.currency,
      greatest(round(coalesce(t.sale_price, 0) * 100)::bigint, 0) AS sale_minor,
      greatest(round(coalesce(t.wholesale_cost, 0) * 100)::bigint, 0) AS cost_minor,
      CASE
        WHEN t.profit IS NOT NULL THEN round(t.profit * 100)::bigint
        WHEN t.wholesale_cost IS NOT NULL THEN round((t.sale_price - t.wholesale_cost) * 100)::bigint
        ELSE NULL
      END AS calc_profit_minor,
      coalesce((ps.summary->>'authoritative_paid_minor')::bigint, greatest(round(coalesce(t.amount_paid, 0) * 100)::bigint, 0)) AS paid_minor,
      coalesce((ps.summary->>'authoritative_remaining_minor')::bigint, greatest(round((coalesce(t.sale_price, 0) - coalesce(t.amount_paid, 0)) * 100)::bigint, 0)) AS remaining_minor
    FROM public.trips t
    LEFT JOIN LATERAL (
      SELECT public.get_owned_trip_payment_summary(t.id) AS summary
    ) ps ON true
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.payment_date, t.start_date) BETWEEN v_curr_start AND v_curr_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
  ),
  fin_curr_agg AS (
    SELECT
      count(*)::integer AS trips_sold,
      count(*) FILTER (WHERE calc_profit_minor IS NULL)::integer AS unknown_profit_count,
      coalesce(sum(sale_minor), 0)::bigint AS raw_revenue_minor,
      coalesce(sum(cost_minor), 0)::bigint AS raw_cost_minor,
      coalesce(sum(calc_profit_minor), 0)::bigint AS raw_profit_minor,
      coalesce(sum(sale_minor) FILTER (WHERE calc_profit_minor IS NOT NULL), 0)::bigint AS profit_eligible_revenue_minor,
      coalesce(sum(paid_minor), 0)::bigint AS raw_paid_minor,
      coalesce(sum(remaining_minor), 0)::bigint AS raw_remaining_minor
    FROM fin_curr_filtered
  )
  SELECT jsonb_build_object(
    'trips_sold', trips_sold,
    'unknown_profit_count', unknown_profit_count,
    'total_revenue', CASE WHEN v_can_view_financials THEN raw_revenue_minor / 100.0 ELSE NULL END,
    'total_cost', CASE WHEN v_can_view_financials THEN raw_cost_minor / 100.0 ELSE NULL END,
    'total_profit', CASE WHEN v_can_view_financials THEN raw_profit_minor / 100.0 ELSE NULL END,
    'total_collected', CASE WHEN v_can_view_financials THEN raw_paid_minor / 100.0 ELSE NULL END,
    'total_outstanding', CASE WHEN v_can_view_financials THEN raw_remaining_minor / 100.0 ELSE NULL END,
    'profit_margin_pct', CASE
      WHEN v_can_view_financials AND profit_eligible_revenue_minor > 0
        THEN round((raw_profit_minor::numeric / profit_eligible_revenue_minor::numeric) * 1000) / 10.0
      ELSE NULL
    END,
    'markup_pct', CASE
      WHEN v_can_view_financials AND (raw_revenue_minor - raw_profit_minor) > 0
        THEN round((raw_profit_minor::numeric / (raw_revenue_minor - raw_profit_minor)::numeric) * 1000) / 10.0
      ELSE NULL
    END,
    'average_sale_value', CASE
      WHEN v_can_view_financials AND trips_sold > 0 THEN (raw_revenue_minor / trips_sold) / 100.0 ELSE NULL
    END,
    'average_profit', CASE
      WHEN v_can_view_financials AND (trips_sold - unknown_profit_count) > 0
        THEN (raw_profit_minor / (trips_sold - unknown_profit_count)) / 100.0
      ELSE NULL
    END
  ) INTO v_fin_current_stats
  FROM fin_curr_agg;

  -- Previous period financial stats by coalesce(payment_date, start_date)
  WITH fin_prev_filtered AS (
    SELECT
      t.id,
      greatest(round(coalesce(t.sale_price, 0) * 100)::bigint, 0) AS sale_minor,
      greatest(round(coalesce(t.wholesale_cost, 0) * 100)::bigint, 0) AS cost_minor,
      CASE
        WHEN t.profit IS NOT NULL THEN round(t.profit * 100)::bigint
        WHEN t.wholesale_cost IS NOT NULL THEN round((t.sale_price - t.wholesale_cost) * 100)::bigint
        ELSE NULL
      END AS calc_profit_minor,
      coalesce((ps.summary->>'authoritative_paid_minor')::bigint, greatest(round(coalesce(t.amount_paid, 0) * 100)::bigint, 0)) AS paid_minor,
      coalesce((ps.summary->>'authoritative_remaining_minor')::bigint, greatest(round((coalesce(t.sale_price, 0) - coalesce(t.amount_paid, 0)) * 100)::bigint, 0)) AS remaining_minor
    FROM public.trips t
    LEFT JOIN LATERAL (
      SELECT public.get_owned_trip_payment_summary(t.id) AS summary
    ) ps ON true
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.payment_date, t.start_date) BETWEEN v_prev_start AND v_prev_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
  ),
  fin_prev_agg AS (
    SELECT
      count(*)::integer AS trips_sold,
      count(*) FILTER (WHERE calc_profit_minor IS NULL)::integer AS unknown_profit_count,
      coalesce(sum(sale_minor), 0)::bigint AS raw_revenue_minor,
      coalesce(sum(cost_minor), 0)::bigint AS raw_cost_minor,
      coalesce(sum(calc_profit_minor), 0)::bigint AS raw_profit_minor,
      coalesce(sum(sale_minor) FILTER (WHERE calc_profit_minor IS NOT NULL), 0)::bigint AS profit_eligible_revenue_minor,
      coalesce(sum(paid_minor), 0)::bigint AS raw_paid_minor,
      coalesce(sum(remaining_minor), 0)::bigint AS raw_remaining_minor
    FROM fin_prev_filtered
  )
  SELECT jsonb_build_object(
    'trips_sold', trips_sold,
    'unknown_profit_count', unknown_profit_count,
    'total_revenue', CASE WHEN v_can_view_financials THEN raw_revenue_minor / 100.0 ELSE NULL END,
    'total_cost', CASE WHEN v_can_view_financials THEN raw_cost_minor / 100.0 ELSE NULL END,
    'total_profit', CASE WHEN v_can_view_financials THEN raw_profit_minor / 100.0 ELSE NULL END,
    'total_collected', CASE WHEN v_can_view_financials THEN raw_paid_minor / 100.0 ELSE NULL END,
    'total_outstanding', CASE WHEN v_can_view_financials THEN raw_remaining_minor / 100.0 ELSE NULL END,
    'profit_margin_pct', CASE
      WHEN v_can_view_financials AND profit_eligible_revenue_minor > 0
        THEN round((raw_profit_minor::numeric / profit_eligible_revenue_minor::numeric) * 1000) / 10.0
      ELSE NULL
    END,
    'markup_pct', CASE
      WHEN v_can_view_financials AND (raw_revenue_minor - raw_profit_minor) > 0
        THEN round((raw_profit_minor::numeric / (raw_revenue_minor - raw_profit_minor)::numeric) * 1000) / 10.0
      ELSE NULL
    END,
    'average_sale_value', CASE
      WHEN v_can_view_financials AND trips_sold > 0 THEN (raw_revenue_minor / trips_sold) / 100.0 ELSE NULL
    END,
    'average_profit', CASE
      WHEN v_can_view_financials AND (trips_sold - unknown_profit_count) > 0
        THEN (raw_profit_minor / (trips_sold - unknown_profit_count)) / 100.0
      ELSE NULL
    END
  ) INTO v_fin_previous_stats
  FROM fin_prev_agg;

  -- Financial Trend (by coalesce(payment_date, start_date))
  IF p_month IS NOT NULL AND p_month BETWEEN 1 AND 12 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', day_num::text,
      'trips_sold', coalesce(d_agg.trips_sold, 0),
      'revenue', CASE WHEN v_can_view_financials THEN coalesce(d_agg.revenue_minor, 0) / 100.0 ELSE NULL END,
      'profit', CASE WHEN v_can_view_financials THEN coalesce(d_agg.profit_minor, 0) / 100.0 ELSE NULL END
    ) ORDER BY day_num), '[]'::jsonb)
    INTO v_fin_trend
    FROM generate_series(1, extract(day FROM (make_date(v_effective_year, p_month, 1) + interval '1 month' - interval '1 day'))::integer) AS day_num
    LEFT JOIN (
      SELECT extract(day FROM coalesce(t.payment_date, t.start_date))::integer AS d_num,
        count(*)::integer AS trips_sold,
        sum(round(coalesce(t.sale_price, 0) * 100)::bigint) AS revenue_minor,
        sum(CASE WHEN t.profit IS NOT NULL THEN round(t.profit * 100)::bigint ELSE round((coalesce(t.sale_price,0)-coalesce(t.wholesale_cost,0))*100)::bigint END) AS profit_minor
      FROM public.trips t
      WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
        AND coalesce(t.payment_date, t.start_date) BETWEEN v_curr_start AND v_curr_end
        AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
        AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
        AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
      GROUP BY 1
    ) d_agg ON d_agg.d_num = day_num;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', m_num::text,
      'month_index', m_num - 1,
      'trips_sold', coalesce(m_agg.trips_sold, 0),
      'revenue', CASE WHEN v_can_view_financials THEN coalesce(m_agg.revenue_minor, 0) / 100.0 ELSE NULL END,
      'profit', CASE WHEN v_can_view_financials THEN coalesce(m_agg.profit_minor, 0) / 100.0 ELSE NULL END
    ) ORDER BY m_num), '[]'::jsonb)
    INTO v_fin_trend
    FROM generate_series(1, 12) AS m_num
    LEFT JOIN (
      SELECT extract(month FROM coalesce(t.payment_date, t.start_date))::integer AS m_idx,
        count(*)::integer AS trips_sold,
        sum(round(coalesce(t.sale_price, 0) * 100)::bigint) AS revenue_minor,
        sum(CASE WHEN t.profit IS NOT NULL THEN round(t.profit * 100)::bigint ELSE round((coalesce(t.sale_price,0)-coalesce(t.wholesale_cost,0))*100)::bigint END) AS profit_minor
      FROM public.trips t
      WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
        AND coalesce(t.payment_date, t.start_date) BETWEEN v_curr_start AND v_curr_end
        AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
        AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
        AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
      GROUP BY 1
    ) m_agg ON m_agg.m_idx = m_num;
  END IF;

  -- Sales by Destination (by coalesce(payment_date, start_date))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', d.destination,
    'trips_sold', d.trips_sold,
    'revenue', CASE WHEN v_can_view_financials THEN d.revenue_minor / 100.0 ELSE NULL END,
    'profit', CASE WHEN v_can_view_financials THEN d.profit_minor / 100.0 ELSE NULL END,
    'profit_margin', CASE WHEN v_can_view_financials AND d.revenue_minor > 0 THEN round((d.profit_minor::numeric / d.revenue_minor::numeric) * 1000) / 10.0 ELSE NULL END,
    'markup_pct', CASE WHEN v_can_view_financials AND (d.revenue_minor - d.profit_minor) > 0 THEN round((d.profit_minor::numeric / (d.revenue_minor - d.profit_minor)::numeric) * 1000) / 10.0 ELSE NULL END
  ) ORDER BY d.revenue_minor DESC), '[]'::jsonb)
  INTO v_destination_sales
  FROM (
    SELECT
      t.destination,
      count(*)::integer AS trips_sold,
      sum(round(coalesce(t.sale_price, 0) * 100)::bigint) AS revenue_minor,
      sum(CASE WHEN t.profit IS NOT NULL THEN round(t.profit * 100)::bigint ELSE round((coalesce(t.sale_price,0)-coalesce(t.wholesale_cost,0))*100)::bigint END) AS profit_minor
    FROM public.trips t
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.payment_date, t.start_date) BETWEEN v_curr_start AND v_curr_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
    GROUP BY t.destination
  ) d;

  -- Currency Totals (by coalesce(payment_date, start_date))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency', c.currency,
    'trips_sold', c.trips_sold,
    'sales', CASE WHEN v_can_view_financials THEN c.sales_minor / 100.0 ELSE NULL END,
    'profit', CASE WHEN v_can_view_financials THEN c.profit_minor / 100.0 ELSE NULL END
  ) ORDER BY c.currency), '[]'::jsonb)
  INTO v_currency_totals
  FROM (
    SELECT
      coalesce(t.currency, 'ILS') AS currency,
      count(*)::integer AS trips_sold,
      sum(round(coalesce(t.sale_price, 0) * 100)::bigint) AS sales_minor,
      sum(CASE WHEN t.profit IS NOT NULL THEN round(t.profit * 100)::bigint ELSE round((coalesce(t.sale_price,0)-coalesce(t.wholesale_cost,0))*100)::bigint END) AS profit_minor
    FROM public.trips t
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.payment_date, t.start_date) BETWEEN v_curr_start AND v_curr_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
    GROUP BY coalesce(t.currency, 'ILS')
  ) c;

  -- =========================================================================
  -- DOMAIN 2: TRAVEL OPERATIONS (Based on trips.start_date)
  -- =========================================================================
  WITH ops_curr_filtered AS (
    SELECT
      t.id, t.destination, t.status,
      coalesce(t.travelers_count, jsonb_array_length(coalesce(t.travelers, '[]'::jsonb)), 0) AS pax
    FROM public.trips t
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.start_date, t.created_at::date) BETWEEN v_curr_start AND v_curr_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
  ),
  ops_curr_agg AS (
    SELECT
      count(*)::integer AS trips_departing,
      coalesce(sum(pax), 0)::integer AS total_travelers,
      count(*) FILTER (WHERE status = 'active')::integer AS upcoming_trips,
      count(*) FILTER (WHERE status = 'completed')::integer AS completed_trips
    FROM ops_curr_filtered
  )
  SELECT jsonb_build_object(
    'trips_departing', trips_departing,
    'total_travelers', total_travelers,
    'upcoming_trips', upcoming_trips,
    'completed_trips', completed_trips
  ) INTO v_ops_current_stats
  FROM ops_curr_agg;

  -- Previous period operations stats by start_date
  WITH ops_prev_filtered AS (
    SELECT
      t.id,
      coalesce(t.travelers_count, jsonb_array_length(coalesce(t.travelers, '[]'::jsonb)), 0) AS pax
    FROM public.trips t
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.start_date, t.created_at::date) BETWEEN v_prev_start AND v_prev_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
  ),
  ops_prev_agg AS (
    SELECT
      count(*)::integer AS trips_departing,
      coalesce(sum(pax), 0)::integer AS total_travelers
    FROM ops_prev_filtered
  )
  SELECT jsonb_build_object(
    'trips_departing', trips_departing,
    'total_travelers', total_travelers
  ) INTO v_ops_previous_stats
  FROM ops_prev_agg;

  -- Travel Trend (by start_date)
  IF p_month IS NOT NULL AND p_month BETWEEN 1 AND 12 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', day_num::text,
      'trips_departing', coalesce(d_agg.trips_departing, 0),
      'travelers', coalesce(d_agg.travelers, 0)
    ) ORDER BY day_num), '[]'::jsonb)
    INTO v_ops_trend
    FROM generate_series(1, extract(day FROM (make_date(v_effective_year, p_month, 1) + interval '1 month' - interval '1 day'))::integer) AS day_num
    LEFT JOIN (
      SELECT extract(day FROM coalesce(t.start_date, t.created_at::date))::integer AS d_num,
        count(*)::integer AS trips_departing,
        sum(coalesce(t.travelers_count, jsonb_array_length(coalesce(t.travelers, '[]'::jsonb)), 0))::integer AS travelers
      FROM public.trips t
      WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
        AND coalesce(t.start_date, t.created_at::date) BETWEEN v_curr_start AND v_curr_end
        AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
        AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
        AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
      GROUP BY 1
    ) d_agg ON d_agg.d_num = day_num;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', m_num::text,
      'month_index', m_num - 1,
      'trips_departing', coalesce(m_agg.trips_departing, 0),
      'travelers', coalesce(m_agg.travelers, 0)
    ) ORDER BY m_num), '[]'::jsonb)
    INTO v_ops_trend
    FROM generate_series(1, 12) AS m_num
    LEFT JOIN (
      SELECT extract(month FROM coalesce(t.start_date, t.created_at::date))::integer AS m_idx,
        count(*)::integer AS trips_departing,
        sum(coalesce(t.travelers_count, jsonb_array_length(coalesce(t.travelers, '[]'::jsonb)), 0))::integer AS travelers
      FROM public.trips t
      WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
        AND coalesce(t.start_date, t.created_at::date) BETWEEN v_curr_start AND v_curr_end
        AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
        AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
        AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
      GROUP BY 1
    ) m_agg ON m_agg.m_idx = m_num;
  END IF;

  -- Destination Travel Volume (by start_date)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', d.destination,
    'trips_departing', d.trips_departing,
    'passengers', d.passengers
  ) ORDER BY d.passengers DESC), '[]'::jsonb)
  INTO v_destination_volume
  FROM (
    SELECT
      t.destination,
      count(*)::integer AS trips_departing,
      sum(coalesce(t.travelers_count, jsonb_array_length(coalesce(t.travelers, '[]'::jsonb)), 0))::integer AS passengers
    FROM public.trips t
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND coalesce(t.start_date, t.created_at::date) BETWEEN v_curr_start AND v_curr_end
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
    GROUP BY t.destination
  ) d;

  -- Attention Required Items (Operational)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'trip', jsonb_build_object(
      'id', t.id,
      'client_name', t.client_name,
      'destination', t.destination,
      'start_date', t.start_date,
      'payment_status', t.payment_status,
      'status', t.status,
      'currency', t.currency
    ),
    'outstanding_balance', CASE WHEN v_can_view_financials THEN greatest(t.sale_price - t.amount_paid, 0) ELSE NULL END,
    'reasons', att.reasons
  ) ORDER BY t.start_date), '[]'::jsonb)
  INTO v_attention_items
  FROM public.trips t
  CROSS JOIN LATERAL (
    SELECT array_remove(ARRAY[
      CASE WHEN (t.profit IS NULL AND t.wholesale_cost IS NULL) THEN 'missing_cost' ELSE NULL END,
      CASE WHEN (t.payment_status IN ('unpaid','partial') AND t.start_date <= current_date) THEN 'unpaid_past_departure' ELSE NULL END,
      CASE WHEN (t.payment_status IN ('unpaid','partial') AND t.start_date > current_date AND t.start_date <= current_date + 14) THEN 'unpaid_near_departure' ELSE NULL END,
      CASE WHEN (t.amount_paid > t.sale_price) THEN 'overpaid' ELSE NULL END
    ], NULL) AS reasons
  ) att
  WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
    AND t.status <> 'archived' AND t.status <> 'cancelled'
    AND cardinality(att.reasons) > 0
    AND coalesce(t.start_date, t.created_at::date) BETWEEN v_curr_start AND v_curr_end
  LIMIT 25;

  -- =========================================================================
  -- DOMAIN 3: PAYMENT SCHEDULE & AGING (Based on trip_installments.due_date)
  -- =========================================================================
  WITH active_trips AS (
    SELECT t.*,
      coalesce((ps.summary->>'authoritative_paid_minor')::bigint, greatest(round(coalesce(t.amount_paid, 0) * 100)::bigint, 0)) AS paid_minor,
      coalesce((ps.summary->>'authoritative_remaining_minor')::bigint, greatest(round((coalesce(t.sale_price, 0) - coalesce(t.amount_paid, 0)) * 100)::bigint, 0)) AS remaining_minor,
      coalesce((ps.summary->>'cash_paid_minor')::bigint, 0) AS cash_paid_minor,
      coalesce((ps.summary->>'scheduled_minor_to_date')::bigint, 0) AS visa_scheduled_today_minor,
      coalesce((ps.summary->>'remaining_scheduled_minor')::bigint, 0) AS visa_future_scheduled_minor
    FROM public.trips t
    LEFT JOIN LATERAL (
      SELECT public.get_owned_trip_payment_summary(t.id) AS summary
    ) ps ON true
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND coalesce(t.start_date, t.created_at::date) BETWEEN v_curr_start AND v_curr_end
      AND (nullif(p_payment_status, '') IS NULL OR t.payment_status = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
  )
  SELECT jsonb_build_object(
    'confirmed_cash', CASE WHEN v_can_view_financials THEN coalesce(sum(cash_paid_minor), 0) / 100.0 ELSE NULL END,
    'remaining_cash', CASE WHEN v_can_view_financials THEN coalesce(sum(remaining_minor) FILTER (WHERE payment_method = 'cash'), 0) / 100.0 ELSE NULL END,
    'scheduled_visa_today', CASE WHEN v_can_view_financials THEN coalesce(sum(visa_scheduled_today_minor), 0) / 100.0 ELSE NULL END,
    'future_scheduled_visa', CASE WHEN v_can_view_financials THEN coalesce(sum(visa_future_scheduled_minor), 0) / 100.0 ELSE NULL END,
    'unscheduled_outstanding', CASE WHEN v_can_view_financials THEN coalesce(sum(remaining_minor) FILTER (WHERE payment_method = 'cash' OR NOT EXISTS (SELECT 1 FROM public.trip_installments i WHERE i.trip_id = id)), 0) / 100.0 ELSE NULL END
  ) INTO v_payments_summary
  FROM active_trips;

  -- Aging buckets by installment due_date
  WITH installment_aging AS (
    SELECT
      i.id AS installment_id,
      i.trip_id,
      (i.expected_amount_minor - i.paid_amount_minor) AS remaining_inst_minor,
      (current_date - i.due_date) AS days_overdue
    FROM public.trip_installments i
    JOIN public.trips t ON t.id = i.trip_id
    WHERE i.user_id = v_user_id AND t.deleted_at IS NULL
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND i.status IN ('scheduled', 'partially_paid')
      AND i.paid_amount_minor < i.expected_amount_minor
  ),
  unscheduled_cash_aging AS (
    SELECT
      t.id AS trip_id,
      greatest(round((coalesce(t.sale_price, 0) - coalesce(t.amount_paid, 0)) * 100)::bigint, 0) AS remaining_minor
    FROM public.trips t
    WHERE t.user_id = v_user_id AND t.deleted_at IS NULL
      AND (CASE WHEN nullif(p_trip_status, '') IS NULL THEN t.status <> 'archived' AND t.status <> 'cancelled' ELSE t.status = p_trip_status END)
      AND t.amount_due > 0
      AND NOT EXISTS (SELECT 1 FROM public.trip_installments i WHERE i.trip_id = t.id)
  )
  SELECT jsonb_build_object(
    'current', CASE WHEN v_can_view_financials THEN coalesce((SELECT sum(remaining_inst_minor) FROM installment_aging WHERE days_overdue <= 0), 0) / 100.0 ELSE NULL END,
    'overdue_1_30', CASE WHEN v_can_view_financials THEN coalesce((SELECT sum(remaining_inst_minor) FROM installment_aging WHERE days_overdue BETWEEN 1 AND 30), 0) / 100.0 ELSE NULL END,
    'overdue_31_60', CASE WHEN v_can_view_financials THEN coalesce((SELECT sum(remaining_inst_minor) FROM installment_aging WHERE days_overdue BETWEEN 31 AND 60), 0) / 100.0 ELSE NULL END,
    'overdue_61_plus', CASE WHEN v_can_view_financials THEN coalesce((SELECT sum(remaining_inst_minor) FROM installment_aging WHERE days_overdue > 60), 0) / 100.0 ELSE NULL END,
    'future_scheduled', CASE WHEN v_can_view_financials THEN coalesce((SELECT sum(remaining_inst_minor) FROM installment_aging WHERE days_overdue < 0), 0) / 100.0 ELSE NULL END,
    'unscheduled_outstanding', CASE WHEN v_can_view_financials THEN coalesce((SELECT sum(remaining_minor) FROM unscheduled_cash_aging), 0) / 100.0 ELSE NULL END
  ) INTO v_aging_buckets;

  RETURN jsonb_build_object(
    'financials_visible', v_can_view_financials,
    'can_view_financials', v_can_view_financials,
    'period_type', v_period_type,
    'current_period', jsonb_build_object('start_date', v_curr_start, 'end_date', v_curr_end),
    'previous_period', jsonb_build_object('start_date', v_prev_start, 'end_date', v_prev_end),
    'financial', jsonb_build_object(
      'current_stats', v_fin_current_stats,
      'previous_stats', v_fin_previous_stats,
      'trend', v_fin_trend,
      'destination_sales', v_destination_sales,
      'currency_totals', v_currency_totals
    ),
    'travel', jsonb_build_object(
      'current_stats', v_ops_current_stats,
      'previous_stats', v_ops_previous_stats,
      'trend', v_ops_trend,
      'destination_volume', v_destination_volume,
      'attention_items', v_attention_items
    ),
    'payments', jsonb_build_object(
      'summary', v_payments_summary,
      'aging', v_aging_buckets
    ),
    -- Backwards-compatible convenience mirrors
    'current_stats', jsonb_build_object(
      'total_trips', (v_fin_current_stats->>'trips_sold')::integer,
      'total_passengers', (v_ops_current_stats->>'total_travelers')::integer,
      'unknown_profit_count', (v_fin_current_stats->>'unknown_profit_count')::integer,
      'total_revenue', (v_fin_current_stats->>'total_revenue')::numeric,
      'total_profit', (v_fin_current_stats->>'total_profit')::numeric,
      'total_collected', (v_fin_current_stats->>'total_collected')::numeric,
      'total_outstanding', (v_fin_current_stats->>'total_outstanding')::numeric,
      'profit_margin_pct', (v_fin_current_stats->>'profit_margin_pct')::numeric,
      'markup_pct', (v_fin_current_stats->>'markup_pct')::numeric,
      'collection_rate', 100.0,
      'average_profit', (v_fin_current_stats->>'average_profit')::numeric
    ),
    'previous_stats', jsonb_build_object(
      'total_trips', (v_fin_previous_stats->>'trips_sold')::integer,
      'total_passengers', (v_ops_previous_stats->>'total_travelers')::integer,
      'unknown_profit_count', (v_fin_previous_stats->>'unknown_profit_count')::integer,
      'total_revenue', (v_fin_previous_stats->>'total_revenue')::numeric,
      'total_profit', (v_fin_previous_stats->>'total_profit')::numeric,
      'total_collected', (v_fin_previous_stats->>'total_collected')::numeric,
      'total_outstanding', (v_fin_previous_stats->>'total_outstanding')::numeric,
      'profit_margin_pct', (v_fin_previous_stats->>'profit_margin_pct')::numeric,
      'markup_pct', (v_fin_previous_stats->>'markup_pct')::numeric,
      'collection_rate', 100.0,
      'average_profit', (v_fin_previous_stats->>'average_profit')::numeric
    ),
    'available_years', v_available_years,
    'available_destinations', v_available_destinations,
    'monthly_trend', v_fin_trend,
    'destination_stats', v_destination_sales,
    'payment_health', v_payments_summary,
    'aging_buckets', v_aging_buckets,
    'attention_items', v_attention_items,
    'currency_totals', v_currency_totals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_travel_analytics_summary(text, integer, text, text, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_analytics_summary(text, integer, text, text, text, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_travel_analytics_summary(text, integer, text, text, text, date, date) IS
  'Returns authoritative tenant-scoped analytics summary with three explicit date domains (Financial = coalesce(payment_date, start_date), Operations = start_date, Payments = installment due_date).';

NOTIFY pgrst, 'reload schema';
