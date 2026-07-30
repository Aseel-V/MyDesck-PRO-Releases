-- Forward-only Travel Mode card clarity and one-time Visa receipt events.
-- Historical receipts are intentionally not backfilled, establishing a safe rollout baseline.

CREATE OR REPLACE FUNCTION public.get_owned_trip_payment_summary(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH owned_trip AS (
    SELECT t.id, t.sale_price, t.amount_paid, t.payment_status, t.payment_method,
      t.cash_paid_amount, t.card_paid_amount, t.currency
    FROM public.trips AS t
    WHERE t.id = p_trip_id AND t.user_id = auth.uid() AND t.deleted_at IS NULL
  ), selected_plan AS (
    SELECT p.*
    FROM public.trip_payment_plans AS p
    JOIN owned_trip AS t ON t.id = p.trip_id
    WHERE p.user_id = auth.uid() AND p.deleted_at IS NULL AND p.status <> 'cancelled'
    ORDER BY (p.source = 'native') DESC, p.updated_at DESC, p.id DESC
    LIMIT 1
  ), schedule AS (
    SELECT
      coalesce(sum(CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END)
        FILTER (WHERE i.status <> 'cancelled'), 0)::bigint AS visa_confirmed_minor,
      count(*) FILTER (WHERE i.status <> 'cancelled' AND i.paid_at IS NOT NULL
        AND i.paid_amount_minor = i.expected_amount_minor)::integer AS confirmed_installments,
      count(*) FILTER (WHERE i.status <> 'cancelled' AND i.paid_at IS NOT NULL
        AND i.paid_amount_minor > 0 AND i.paid_amount_minor < i.expected_amount_minor)::integer AS partial_installments,
      coalesce(sum(i.expected_amount_minor) FILTER (
        WHERE i.status <> 'cancelled' AND i.due_date <= current_date), 0)::bigint AS scheduled_through_today_minor,
      coalesce(sum(greatest(i.expected_amount_minor - CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END, 0))
        FILTER (WHERE i.status <> 'cancelled' AND i.due_date < current_date), 0)::bigint AS overdue_unconfirmed_minor,
      coalesce(sum(greatest(i.expected_amount_minor - CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END, 0))
        FILTER (WHERE i.status <> 'cancelled' AND i.due_date <= current_date), 0)::bigint AS currently_due_unconfirmed_minor,
      coalesce(sum(greatest(i.expected_amount_minor - CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END, 0))
        FILTER (WHERE i.status <> 'cancelled' AND i.due_date > current_date), 0)::bigint AS future_scheduled_minor,
      max(i.due_date) FILTER (WHERE i.status <> 'cancelled') AS final_installment_date
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
  ), next_installment AS (
    SELECT i.due_date, i.expected_amount_minor,
      CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END AS confirmed_minor
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
    WHERE i.status <> 'cancelled'
      AND CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END < i.expected_amount_minor
    ORDER BY i.due_date, i.installment_number
    LIMIT 1
  ), last_receipt AS (
    SELECT i.paid_at, i.paid_amount_minor
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
    WHERE i.status <> 'cancelled' AND i.paid_at IS NOT NULL AND i.paid_amount_minor > 0
    ORDER BY i.paid_at DESC, i.updated_at DESC, i.id DESC
    LIMIT 1
  ), raw AS (
    SELECT t.*, p.id AS plan_id, p.source AS plan_source, p.payment_method AS plan_method,
      p.currency AS plan_currency, coalesce(p.installment_count, 0) AS installment_count,
      coalesce(p.card_total_minor, CASE WHEN t.payment_method = 'card' THEN round(coalesce(t.sale_price, 0) * 100)::bigint
        WHEN t.payment_method = 'mixed' THEN greatest(round(coalesce(t.card_paid_amount, 0) * 100)::bigint, 0) ELSE 0 END, 0) AS visa_schedule_total_minor,
      coalesce(p.cash_total_minor, CASE WHEN t.payment_method = 'card' THEN 0
        WHEN t.payment_method = 'mixed' THEN greatest(round((coalesce(t.sale_price, 0) - coalesce(t.card_paid_amount, 0)) * 100)::bigint, 0)
        ELSE round(coalesce(t.sale_price, 0) * 100)::bigint END, 0) AS cash_total_minor,
      CASE WHEN p.source = 'native' THEN greatest(coalesce(p.cash_paid_minor, 0), 0)
        WHEN coalesce(t.payment_method, 'cash') IN ('cash', 'mixed') THEN greatest(round(coalesce(
          CASE WHEN t.payment_method = 'mixed' THEN t.cash_paid_amount ELSE t.amount_paid END, 0) * 100)::bigint, 0)
        ELSE 0 END AS raw_cash_confirmed_minor,
      CASE WHEN p.source = 'native' THEN greatest(coalesce(s.visa_confirmed_minor, 0), 0)
        WHEN t.payment_method = 'card' THEN greatest(round(coalesce(t.amount_paid, 0) * 100)::bigint, 0)
        WHEN t.payment_method = 'mixed' THEN greatest(round((coalesce(t.amount_paid, 0) - coalesce(t.cash_paid_amount, 0)) * 100)::bigint, 0)
        ELSE 0 END AS raw_visa_confirmed_minor,
      coalesce(s.confirmed_installments, 0) AS confirmed_installments,
      coalesce(s.partial_installments, 0) AS partial_installments,
      coalesce(s.scheduled_through_today_minor, 0) AS scheduled_through_today_minor,
      coalesce(s.overdue_unconfirmed_minor, 0) AS overdue_unconfirmed_minor,
      coalesce(s.currently_due_unconfirmed_minor, 0) AS currently_due_unconfirmed_minor,
      coalesce(s.future_scheduled_minor, 0) AS future_scheduled_minor,
      s.final_installment_date, n.due_date AS next_due_date, n.expected_amount_minor AS next_expected_minor,
      n.confirmed_minor AS next_confirmed_minor, r.paid_at AS last_confirmed_visa_at,
      r.paid_amount_minor AS last_confirmed_visa_minor,
      coalesce(p.card_paid_minor, 0) AS stored_card_paid_minor, coalesce(p.cash_paid_minor, 0) AS stored_cash_paid_minor
    FROM owned_trip AS t
    LEFT JOIN selected_plan AS p ON true
    LEFT JOIN schedule AS s ON true
    LEFT JOIN next_installment AS n ON true
    LEFT JOIN last_receipt AS r ON true
  ), normalized AS (
    SELECT raw.*, greatest(round(coalesce(sale_price, 0) * 100)::bigint, 0) AS sale_total_minor,
      least(greatest(cash_total_minor, 0), greatest(raw_cash_confirmed_minor, 0)) AS cash_confirmed_minor,
      least(greatest(visa_schedule_total_minor, 0), greatest(raw_visa_confirmed_minor, 0)) AS visa_confirmed_minor
    FROM raw
  ), totals AS (
    SELECT normalized.*,
      least(sale_total_minor, cash_confirmed_minor + visa_confirmed_minor) AS confirmed_total_minor,
      greatest(sale_total_minor - cash_confirmed_minor - visa_confirmed_minor, 0) AS total_unpaid_minor,
      greatest(cash_total_minor - cash_confirmed_minor, 0) AS cash_remaining_minor
    FROM normalized
  )
  SELECT jsonb_build_object(
    'plan_id', plan_id, 'source', CASE WHEN plan_source = 'native' THEN 'native' ELSE 'legacy' END,
    'payment_source', CASE WHEN plan_source = 'native' THEN 'native' ELSE 'legacy_fallback' END,
    'reconciliation_state', CASE
      WHEN plan_source IS DISTINCT FROM 'native' THEN 'legacy_fallback'
      WHEN cash_total_minor + visa_schedule_total_minor <> sale_total_minor THEN 'allocation_mismatch'
      WHEN stored_card_paid_minor <> visa_confirmed_minor THEN 'ledger_mismatch'
      WHEN round(coalesce(amount_paid, 0) * 100)::bigint <> confirmed_total_minor THEN 'legacy_mismatch'
      ELSE 'aligned' END,
    'payment_method', coalesce(plan_method, payment_method, 'cash'), 'currency', coalesce(plan_currency, currency, 'ILS'),
    'sale_total_minor', sale_total_minor, 'cash_total_minor', cash_total_minor,
    'cash_confirmed_minor', cash_confirmed_minor, 'cash_remaining_minor', cash_remaining_minor,
    'visa_schedule_total_minor', visa_schedule_total_minor, 'visa_confirmed_minor', visa_confirmed_minor,
    'visa_scheduled_through_today_minor', scheduled_through_today_minor,
    'visa_overdue_unconfirmed_minor', overdue_unconfirmed_minor, 'visa_future_scheduled_minor', future_scheduled_minor,
    'confirmed_total_minor', confirmed_total_minor, 'total_unpaid_minor', total_unpaid_minor,
    'currently_due_unconfirmed_minor', currently_due_unconfirmed_minor,
    'installment_count', installment_count, 'confirmed_installments', confirmed_installments,
    'partial_installments', partial_installments, 'next_installment_due_date', next_due_date,
    'next_installment_expected_minor', next_expected_minor, 'next_installment_confirmed_minor', next_confirmed_minor,
    'last_confirmed_visa_at', last_confirmed_visa_at, 'last_confirmed_visa_minor', last_confirmed_visa_minor,
    'final_installment_date', final_installment_date,
    'derived_payment_status', CASE WHEN confirmed_total_minor <= 0 THEN 'unpaid' WHEN total_unpaid_minor <= 0 THEN 'paid' ELSE 'partial' END,
    'card_total_minor', visa_schedule_total_minor, 'cash_paid_minor', cash_confirmed_minor,
    'stored_cash_paid_minor', stored_cash_paid_minor, 'processed_installments', confirmed_installments,
    'scheduled_minor_to_date', scheduled_through_today_minor, 'remaining_scheduled_minor', future_scheduled_minor,
    'next_installment_minor', CASE WHEN next_expected_minor IS NULL THEN NULL ELSE greatest(next_expected_minor - coalesce(next_confirmed_minor, 0), 0) END,
    'next_installment_date', next_due_date, 'authoritative_paid_minor', confirmed_total_minor,
    'authoritative_remaining_minor', total_unpaid_minor,
    'authoritative_payment_status', CASE WHEN confirmed_total_minor <= 0 THEN 'unpaid' WHEN total_unpaid_minor <= 0 THEN 'paid' ELSE 'partial' END,
    'combined_remaining_minor', total_unpaid_minor
  ) FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_owned_trip_payment_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owned_trip_payment_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_trip_installment_payment(
  p_installment_id uuid, p_paid_amount_minor bigint, p_paid_at timestamptz, p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_row public.trip_installments%ROWTYPE;
  new_row public.trip_installments%ROWTYPE;
  v_event_id bigint;
  v_receipt_delta bigint;
  v_summary jsonb;
  v_destination text;
BEGIN
  SELECT * INTO old_row FROM public.trip_installments
  WHERE id = p_installment_id AND user_id = auth.uid() FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Installment not found' USING ERRCODE = 'P0002'; END IF;
  IF old_row.status = 'cancelled' OR p_paid_amount_minor < 0 OR p_paid_amount_minor > old_row.expected_amount_minor
  THEN RAISE EXCEPTION 'Invalid installment payment' USING ERRCODE = '22023'; END IF;

  UPDATE public.trip_installments SET
    paid_amount_minor = p_paid_amount_minor,
    paid_at = CASE WHEN p_paid_amount_minor > 0 THEN p_paid_at ELSE NULL END,
    status = CASE WHEN p_paid_amount_minor = 0 THEN 'scheduled'
      WHEN p_paid_amount_minor = expected_amount_minor THEN 'paid' ELSE 'partially_paid' END,
    notes = nullif(trim(p_notes), ''), updated_at = now()
  WHERE id = p_installment_id RETURNING * INTO new_row;

  INSERT INTO public.trip_installment_events
    (installment_id, trip_id, user_id, actor_user_id, event_type, previous_state, new_state)
  VALUES (new_row.id, new_row.trip_id, new_row.user_id, auth.uid(),
    CASE WHEN p_paid_amount_minor = 0 THEN 'payment_undone' WHEN old_row.paid_amount_minor = 0 THEN 'paid' ELSE 'corrected' END,
    to_jsonb(old_row), to_jsonb(new_row))
  RETURNING id INTO v_event_id;

  UPDATE public.trip_payment_plans AS p SET card_paid_minor = totals.paid, updated_at = now(),
    status = CASE WHEN totals.paid >= p.card_total_minor AND p.cash_paid_minor >= p.cash_total_minor THEN 'completed' ELSE 'active' END
  FROM (SELECT payment_plan_id,
    coalesce(sum(CASE WHEN paid_at IS NOT NULL THEN paid_amount_minor ELSE 0 END), 0)::bigint AS paid
    FROM public.trip_installments WHERE payment_plan_id = new_row.payment_plan_id GROUP BY payment_plan_id) AS totals
  WHERE p.id = totals.payment_plan_id;

  v_receipt_delta := new_row.paid_amount_minor - old_row.paid_amount_minor;
  IF v_receipt_delta > 0 AND new_row.paid_at IS NOT NULL THEN
    v_summary := public.get_owned_trip_payment_summary(new_row.trip_id);
    SELECT destination INTO v_destination FROM public.trips
    WHERE id = new_row.trip_id AND user_id = auth.uid();
    INSERT INTO public.trip_notifications
      (user_id, trip_id, notification_type, title_key, body_key, params, dedupe_key, scheduled_for)
    VALUES (
      new_row.user_id, new_row.trip_id, 'visa_payment_confirmed',
      'notifications.travel.visaPaymentTitle', 'notifications.travel.visaPaymentBody',
      jsonb_build_object(
        'destination', v_destination, 'currency', v_summary->>'currency',
        'amountMinor', v_receipt_delta,
        'previousVisaConfirmedMinor', greatest((v_summary->>'visa_confirmed_minor')::bigint - v_receipt_delta, 0),
        'visaConfirmedMinor', (v_summary->>'visa_confirmed_minor')::bigint,
        'previousConfirmedTotalMinor', greatest((v_summary->>'confirmed_total_minor')::bigint - v_receipt_delta, 0),
        'confirmedTotalMinor', (v_summary->>'confirmed_total_minor')::bigint,
        'previousUnpaidMinor', (v_summary->>'total_unpaid_minor')::bigint + v_receipt_delta,
        'totalUnpaidMinor', (v_summary->>'total_unpaid_minor')::bigint,
        'previousConfirmedInstallments', greatest((v_summary->>'confirmed_installments')::integer -
          CASE WHEN new_row.paid_amount_minor = new_row.expected_amount_minor THEN 1 ELSE 0 END, 0),
        'confirmedInstallments', (v_summary->>'confirmed_installments')::integer,
        'partialInstallments', (v_summary->>'partial_installments')::integer,
        'installmentCount', (v_summary->>'installment_count')::integer,
        'installmentId', new_row.id
      ),
      'visa-receipt:' || v_event_id::text, now())
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN to_jsonb(new_row);
END;
$$;

REVOKE ALL ON FUNCTION public.record_trip_installment_payment(uuid,bigint,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trip_installment_payment(uuid,bigint,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_travel_payment_contract_version()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT 3; $$;
REVOKE ALL ON FUNCTION public.get_travel_payment_contract_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_payment_contract_version() TO authenticated;

NOTIFY pgrst, 'reload schema';
