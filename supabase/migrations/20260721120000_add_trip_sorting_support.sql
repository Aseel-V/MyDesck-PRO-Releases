-- Forward-only migration to add explicit server-side sorting support to public.get_trips_page
-- Accepts p_sort_key with deterministic tie-breakers and CASE-based ordering.

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
      CASE WHEN p_sort_key = 'overdue_first' THEN (CASE WHEN (payment_status = 'unpaid' OR payment_status = 'partial') AND start_date < current_date THEN 1 ELSE 0 END) END DESC,
      CASE WHEN p_sort_key IS NULL OR p_sort_key = 'updated_desc' THEN updated_at END DESC NULLS LAST,
      id DESC
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
        )
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
    ) d),'[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
