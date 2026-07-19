-- Lightweight Travel Mode card summaries. No detail JSON or per-card requests.

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.trip_templates') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Travel Mode prerequisite public.trip_templates is missing. Apply migration 20260719140000_travel_mode_product_features.sql before 20260719170000.';
  END IF;

  IF pg_catalog.to_regclass('public.trip_payment_plans') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Travel Mode prerequisite public.trip_payment_plans is missing. Apply migration 20260719160000_travel_mode_smart_workflows.sql before 20260719170000.';
  END IF;

  IF pg_catalog.to_regclass('public.trip_installments') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Travel Mode prerequisite public.trip_installments is missing. Apply migration 20260719160000_travel_mode_smart_workflows.sql before 20260719170000.';
  END IF;
END;
$$;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.trip_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_template_name text CHECK (source_template_name IS NULL OR char_length(source_template_name) BETWEEN 1 AND 120);
CREATE INDEX IF NOT EXISTS trips_source_template_idx ON public.trips (source_template_id) WHERE source_template_id IS NOT NULL;

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
    SELECT t.* FROM public.trips t
    WHERE t.user_id = auth.uid() AND t.deleted_at IS NULL
      AND extract(year FROM coalesce(t.payment_date,t.start_date))::text=p_year
      AND (nullif(trim(p_search),'') IS NULL OR NOT EXISTS (
        SELECT 1 FROM regexp_split_to_table(lower(trim(p_search)),'\s+') AS search_token(token)
        WHERE search_token.token<>'' AND t.search_document NOT LIKE '%'||search_token.token||'%'
      ))
      AND (nullif(p_payment_status,'') IS NULL OR t.payment_status=p_payment_status)
      AND (CASE WHEN nullif(p_trip_status,'') IS NULL THEN t.status<>'archived' ELSE t.status=p_trip_status END)
      AND (p_month IS NULL OR extract(month FROM coalesce(t.payment_date,t.start_date))::integer=p_month)
      AND (nullif(p_destination,'') IS NULL OR t.destination=p_destination)
  ), paged AS (
    SELECT * FROM filtered
    ORDER BY start_date DESC NULLS LAST,created_at DESC,id DESC
    LIMIT least(greatest(p_page_size,1),100)
    OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),100)
  ), currency_summary AS (
    SELECT coalesce(currency,'ILS') currency,count(*) trip_count,coalesce(sum(sale_price),0) revenue,
      coalesce(sum(profit),0) profit,coalesce(sum(greatest(sale_price-amount_paid,0)),0) amount_due
    FROM filtered WHERE status NOT IN ('archived','cancelled') GROUP BY coalesce(currency,'ILS')
  )
  SELECT jsonb_build_object(
    'items',coalesce((
      SELECT jsonb_agg(
        (to_jsonb(p)-ARRAY['travelers','itinerary','payments','notes','attachments','search_document'])
        ||jsonb_build_object(
          'has_itinerary',jsonb_array_length(coalesce(p.itinerary,'[]'::jsonb))>0,
          'payment_plan_summary',plan_summary.summary
        ) ORDER BY p.start_date DESC NULLS LAST,p.created_at DESC,p.id DESC
      )
      FROM paged p
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'plan_id',pp.id,'source',pp.source,'payment_method',pp.payment_method,'currency',pp.currency,
          'card_total_minor',pp.card_total_minor,'cash_total_minor',pp.cash_total_minor,'cash_paid_minor',pp.cash_paid_minor,
          'installment_count',pp.installment_count,
          'processed_installments',coalesce(stats.processed_installments,0),
          'scheduled_minor_to_date',coalesce(stats.scheduled_minor_to_date,0),
          'remaining_scheduled_minor',greatest(pp.card_total_minor-coalesce(stats.scheduled_minor_to_date,0),0),
          'next_installment_minor',stats.next_installment_minor,
          'next_installment_date',stats.next_installment_date,
          'final_installment_date',stats.final_installment_date
        ) summary
        FROM public.trip_payment_plans pp
        LEFT JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE i.status<>'cancelled' AND i.due_date<=current_date)::integer processed_installments,
            coalesce(sum(i.expected_amount_minor) FILTER (WHERE i.status<>'cancelled' AND i.due_date<=current_date),0)::bigint scheduled_minor_to_date,
            min(i.due_date) FILTER (WHERE i.status<>'cancelled' AND i.due_date>current_date) next_installment_date,
            (array_agg(i.expected_amount_minor ORDER BY i.due_date,i.installment_number)
              FILTER (WHERE i.status<>'cancelled' AND i.due_date>current_date))[1] next_installment_minor,
            max(i.due_date) FILTER (WHERE i.status<>'cancelled') final_installment_date
          FROM public.trip_installments i WHERE i.payment_plan_id=pp.id
        ) stats ON true
        WHERE pp.trip_id=p.id AND pp.user_id=auth.uid() AND pp.deleted_at IS NULL AND pp.status<>'cancelled'
        ORDER BY pp.updated_at DESC LIMIT 1
      ) plan_summary ON true
    ),'[]'::jsonb),
    'total_count',(SELECT count(*) FROM filtered),
    'summary',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM currency_summary s),'[]'::jsonb),
    'upcoming_count',(SELECT count(*) FROM filtered WHERE status NOT IN ('archived','cancelled') AND start_date>=current_date),
    'destinations',coalesce((SELECT jsonb_agg(destination ORDER BY destination) FROM (
      SELECT DISTINCT t.destination FROM public.trips t WHERE t.user_id=auth.uid() AND t.deleted_at IS NULL
        AND extract(year FROM coalesce(t.payment_date,t.start_date))::text=p_year
    ) destinations),'[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_trips_page(text,integer,integer,text,text,text,integer,text) IS
  'Owned paginated lightweight trips with one compact schedule-based card payment summary; no detail JSON or N+1 reads.';
REVOKE ALL ON FUNCTION public.get_trips_page(text,integer,integer,text,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_trips_page(text,integer,integer,text,text,text,integer,text) TO authenticated;

NOTIFY pgrst,'reload schema';
