-- Travel Mode Visa installments become collected automatically on their saved due date.
-- Receipt columns remain intact for audit purposes and are not rewritten by this migration.

CREATE TABLE IF NOT EXISTS public.travel_payment_feature_rollouts (
  feature_key text PRIMARY KEY,
  installed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.travel_payment_feature_rollouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.travel_payment_feature_rollouts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.travel_payment_feature_rollouts TO service_role;

INSERT INTO public.travel_payment_feature_rollouts (feature_key, installed_at)
VALUES ('visa-date-collection-v1', now())
ON CONFLICT (feature_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_owned_trip_payment_summary(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH business_clock AS (
    SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date AS today
  ), owned_trip AS (
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
      coalesce(sum(i.expected_amount_minor) FILTER (WHERE i.status <> 'cancelled'), 0)::bigint AS actual_schedule_total_minor,
      coalesce(sum(CASE WHEN i.paid_at IS NOT NULL THEN i.paid_amount_minor ELSE 0 END)
        FILTER (WHERE i.status <> 'cancelled'), 0)::bigint AS manual_visa_received_minor,
      count(*) FILTER (WHERE i.status <> 'cancelled' AND i.paid_at IS NOT NULL
        AND i.paid_amount_minor = i.expected_amount_minor)::integer AS manual_confirmed_installments,
      count(*) FILTER (WHERE i.status <> 'cancelled' AND i.paid_at IS NOT NULL
        AND i.paid_amount_minor > 0 AND i.paid_amount_minor < i.expected_amount_minor)::integer AS manual_partial_installments,
      coalesce(sum(i.expected_amount_minor) FILTER (
        WHERE i.status <> 'cancelled' AND i.due_date <= b.today), 0)::bigint AS effective_visa_paid_minor,
      count(*) FILTER (WHERE i.status <> 'cancelled' AND i.due_date <= b.today)::integer AS effective_paid_installments,
      coalesce(sum(i.expected_amount_minor) FILTER (
        WHERE i.status <> 'cancelled' AND i.due_date > b.today), 0)::bigint AS future_scheduled_minor,
      max(i.due_date) FILTER (WHERE i.status <> 'cancelled') AS final_installment_date
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
    CROSS JOIN business_clock AS b
  ), next_installment AS (
    SELECT i.due_date, i.expected_amount_minor
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
    CROSS JOIN business_clock AS b
    WHERE i.status <> 'cancelled' AND i.due_date > b.today
    ORDER BY i.due_date, i.installment_number
    LIMIT 1
  ), last_scheduled_collection AS (
    SELECT i.due_date, i.expected_amount_minor
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
    CROSS JOIN business_clock AS b
    WHERE i.status <> 'cancelled' AND i.due_date <= b.today
    ORDER BY i.due_date DESC, i.installment_number DESC
    LIMIT 1
  ), last_manual_receipt AS (
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
      CASE WHEN p.source = 'native' THEN greatest(coalesce(s.effective_visa_paid_minor, 0), 0)
        WHEN t.payment_method = 'card' THEN greatest(round(coalesce(t.amount_paid, 0) * 100)::bigint, 0)
        WHEN t.payment_method = 'mixed' THEN greatest(round((coalesce(t.amount_paid, 0) - coalesce(t.cash_paid_amount, 0)) * 100)::bigint, 0)
        ELSE 0 END AS raw_effective_visa_paid_minor,
      CASE WHEN p.source = 'native' THEN coalesce(s.effective_paid_installments, 0)
        ELSE coalesce(s.manual_confirmed_installments, 0) END AS effective_paid_installments,
      coalesce(s.actual_schedule_total_minor, 0) AS actual_schedule_total_minor,
      coalesce(s.manual_visa_received_minor, 0) AS manual_visa_received_minor,
      coalesce(s.manual_confirmed_installments, 0) AS manual_confirmed_installments,
      coalesce(s.manual_partial_installments, 0) AS manual_partial_installments,
      coalesce(s.effective_visa_paid_minor, 0) AS scheduled_through_today_minor,
      coalesce(s.future_scheduled_minor, 0) AS future_scheduled_minor,
      s.final_installment_date, n.due_date AS next_due_date, n.expected_amount_minor AS next_expected_minor,
      l.due_date AS last_scheduled_visa_date, l.expected_amount_minor AS last_scheduled_visa_minor,
      r.paid_at AS last_manual_visa_received_at, r.paid_amount_minor AS last_manual_visa_received_minor,
      coalesce(p.card_paid_minor, 0) AS stored_card_paid_minor, coalesce(p.cash_paid_minor, 0) AS stored_cash_paid_minor
    FROM owned_trip AS t
    LEFT JOIN selected_plan AS p ON true
    LEFT JOIN schedule AS s ON true
    LEFT JOIN next_installment AS n ON true
    LEFT JOIN last_scheduled_collection AS l ON true
    LEFT JOIN last_manual_receipt AS r ON true
  ), normalized AS (
    SELECT raw.*, greatest(round(coalesce(sale_price, 0) * 100)::bigint, 0) AS sale_total_minor,
      least(greatest(cash_total_minor, 0), greatest(raw_cash_confirmed_minor, 0)) AS cash_confirmed_minor,
      least(greatest(visa_schedule_total_minor, 0), greatest(raw_effective_visa_paid_minor, 0)) AS effective_visa_paid_minor
    FROM raw
  ), totals AS (
    SELECT normalized.*,
      least(sale_total_minor, cash_confirmed_minor + effective_visa_paid_minor) AS effective_confirmed_total_minor,
      greatest(sale_total_minor - cash_confirmed_minor - effective_visa_paid_minor, 0) AS total_unpaid_minor,
      greatest(cash_total_minor - cash_confirmed_minor, 0) AS cash_remaining_minor
    FROM normalized
  )
  SELECT jsonb_build_object(
    'plan_id', plan_id, 'source', CASE WHEN plan_source = 'native' THEN 'native' ELSE 'legacy' END,
    'payment_source', CASE WHEN plan_source = 'native' THEN 'native' ELSE 'legacy_fallback' END,
    'visa_collection_basis', CASE WHEN plan_source = 'native' THEN 'schedule_date' ELSE 'legacy_receipts' END,
    'business_timezone', 'Asia/Jerusalem',
    'reconciliation_state', CASE
      WHEN plan_source IS DISTINCT FROM 'native' THEN 'legacy_fallback'
      WHEN cash_total_minor + visa_schedule_total_minor <> sale_total_minor THEN 'allocation_mismatch'
      WHEN actual_schedule_total_minor <> visa_schedule_total_minor THEN 'schedule_mismatch'
      ELSE 'aligned' END,
    'payment_method', coalesce(plan_method, payment_method, 'cash'), 'currency', coalesce(plan_currency, currency, 'ILS'),
    'sale_total_minor', sale_total_minor, 'cash_total_minor', cash_total_minor,
    'cash_confirmed_minor', cash_confirmed_minor, 'cash_remaining_minor', cash_remaining_minor,
    'visa_schedule_total_minor', visa_schedule_total_minor,
    'effective_visa_paid_minor', effective_visa_paid_minor, 'visa_confirmed_minor', effective_visa_paid_minor,
    'visa_scheduled_through_today_minor', scheduled_through_today_minor,
    'visa_overdue_unconfirmed_minor', 0, 'visa_future_scheduled_minor', future_scheduled_minor,
    'effective_confirmed_total_minor', effective_confirmed_total_minor,
    'confirmed_total_minor', effective_confirmed_total_minor, 'total_unpaid_minor', total_unpaid_minor,
    'currently_due_unconfirmed_minor', 0,
    'installment_count', installment_count, 'effective_paid_installment_count', effective_paid_installments,
    'confirmed_installments', effective_paid_installments, 'partial_installments', 0,
    'next_installment_due_date', next_due_date, 'next_installment_expected_minor', next_expected_minor,
    'next_installment_confirmed_minor', 0,
    'last_scheduled_visa_date', last_scheduled_visa_date, 'last_scheduled_visa_minor', last_scheduled_visa_minor
  ) || jsonb_build_object(
    'manual_visa_received_minor', manual_visa_received_minor,
    'manual_confirmed_installments', manual_confirmed_installments,
    'manual_partial_installments', manual_partial_installments,
    'last_manual_visa_received_at', last_manual_visa_received_at,
    'last_manual_visa_received_minor', last_manual_visa_received_minor,
    'last_confirmed_visa_at', last_manual_visa_received_at, 'last_confirmed_visa_minor', last_manual_visa_received_minor,
    'final_installment_date', final_installment_date,
    'derived_payment_status', CASE WHEN effective_confirmed_total_minor <= 0 THEN 'unpaid' WHEN total_unpaid_minor <= 0 THEN 'paid' ELSE 'partial' END,
    'card_total_minor', visa_schedule_total_minor, 'cash_paid_minor', cash_confirmed_minor,
    'stored_card_paid_minor', stored_card_paid_minor, 'stored_cash_paid_minor', stored_cash_paid_minor,
    'processed_installments', effective_paid_installments,
    'scheduled_minor_to_date', scheduled_through_today_minor, 'remaining_scheduled_minor', future_scheduled_minor,
    'next_installment_minor', next_expected_minor, 'next_installment_date', next_due_date,
    'authoritative_paid_minor', effective_confirmed_total_minor,
    'authoritative_remaining_minor', total_unpaid_minor,
    'authoritative_payment_status', CASE WHEN effective_confirmed_total_minor <= 0 THEN 'unpaid' WHEN total_unpaid_minor <= 0 THEN 'paid' ELSE 'partial' END,
    'combined_remaining_minor', total_unpaid_minor
  ) FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_owned_trip_payment_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owned_trip_payment_summary(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_owned_trip_payment_summary(uuid) IS
  'Canonical Travel payment summary v4. Native Visa collection is derived from date-only due dates in Asia/Jerusalem; receipt fields are audit-only.';

CREATE OR REPLACE FUNCTION public.materialize_due_visa_progress_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
  rollout_at timestamptz;
  business_today date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  SELECT installed_at INTO rollout_at
  FROM public.travel_payment_feature_rollouts
  WHERE feature_key = 'visa-date-collection-v1';

  IF rollout_at IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.trip_notifications
    (user_id, trip_id, notification_type, title_key, body_key, params, dedupe_key, scheduled_for)
  SELECT i.user_id, i.trip_id, 'visa_schedule_collected',
    'notifications.travel.visaScheduleProgressTitle', 'notifications.travel.visaScheduleProgressBody',
    jsonb_build_object(
      'destination', t.destination, 'currency', p.currency,
      'amountMinor', i.expected_amount_minor,
      'previousVisaConfirmedMinor', cumulative.visa_paid_minor - i.expected_amount_minor,
      'visaConfirmedMinor', cumulative.visa_paid_minor,
      'previousConfirmedTotalMinor', least(financial.sale_total_minor,
        financial.cash_confirmed_minor + cumulative.visa_paid_minor - i.expected_amount_minor),
      'confirmedTotalMinor', least(financial.sale_total_minor,
        financial.cash_confirmed_minor + cumulative.visa_paid_minor),
      'previousUnpaidMinor', greatest(financial.sale_total_minor - financial.cash_confirmed_minor
        - cumulative.visa_paid_minor + i.expected_amount_minor, 0),
      'totalUnpaidMinor', greatest(financial.sale_total_minor - financial.cash_confirmed_minor
        - cumulative.visa_paid_minor, 0),
      'previousConfirmedInstallments', cumulative.paid_installments - 1,
      'confirmedInstallments', cumulative.paid_installments,
      'partialInstallments', 0,
      'installmentCount', p.installment_count,
      'installmentId', i.id,
      'dueDate', i.due_date,
      'eventKey', 'visa-schedule:' || i.trip_id || ':' || i.id || ':' || i.due_date
    ),
    'visa-schedule:' || i.trip_id || ':' || i.id || ':' || i.due_date,
    i.due_date::timestamp AT TIME ZONE 'Asia/Jerusalem'
  FROM public.trip_installments AS i
  JOIN public.trip_payment_plans AS p ON p.id = i.payment_plan_id
    AND p.user_id = auth.uid() AND p.source = 'native' AND p.deleted_at IS NULL AND p.status <> 'cancelled'
  JOIN public.trips AS t ON t.id = i.trip_id AND t.user_id = auth.uid()
    AND t.deleted_at IS NULL AND t.status NOT IN ('cancelled', 'archived')
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(prior.expected_amount_minor), 0)::bigint AS visa_paid_minor,
      count(*)::integer AS paid_installments
    FROM public.trip_installments AS prior
    WHERE prior.payment_plan_id = i.payment_plan_id AND prior.status <> 'cancelled'
      AND (prior.due_date < i.due_date
        OR (prior.due_date = i.due_date AND prior.installment_number <= i.installment_number))
  ) AS cumulative
  CROSS JOIN LATERAL (
    SELECT greatest(round(coalesce(t.sale_price, 0) * 100)::bigint, 0) AS sale_total_minor,
      least(greatest(coalesce(p.cash_total_minor, 0), 0), greatest(coalesce(p.cash_paid_minor, 0), 0)) AS cash_confirmed_minor
  ) AS financial
  WHERE i.user_id = auth.uid() AND i.status <> 'cancelled' AND i.due_date <= business_today
    AND (i.due_date::timestamp AT TIME ZONE 'Asia/Jerusalem') > rollout_at
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_due_visa_progress_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materialize_due_visa_progress_events() TO authenticated;
COMMENT ON FUNCTION public.materialize_due_visa_progress_events() IS
  'Creates one idempotent post-rollout Visa schedule progress event per elapsed installment for the signed-in user.';

-- Keep ordinary in-app reminders, but never describe an elapsed Visa installment as
-- overdue or unconfirmed. Future and same-day installments remain eligible reminders.
CREATE OR REPLACE FUNCTION public.generate_trip_notifications(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.trip_notifications
    (user_id,trip_id,notification_type,title_key,body_key,params,dedupe_key,scheduled_for)
  SELECT source.user_id,source.trip_id,source.notification_type,source.title_key,source.body_key,
    source.params,source.dedupe_key,p_now
  FROM (
    SELECT t.user_id,t.id trip_id,'upcoming_trip'::text notification_type,
      'notifications.travel.upcomingTitle'::text title_key,'notifications.travel.upcomingBody'::text body_key,
      jsonb_build_object('destination',t.destination,'startDate',t.start_date,'days',d.days) params,
      'trip-reminder:'||t.id||':'||t.start_date||':'||d.days dedupe_key
    FROM public.trips t
    JOIN public.trip_notification_settings s ON s.user_id=t.user_id AND s.upcoming_enabled
    CROSS JOIN LATERAL unnest(s.trip_reminder_days) d(days)
    WHERE t.deleted_at IS NULL AND t.status='active'
      AND t.start_date=((p_now AT TIME ZONE s.timezone)::date+d.days)
    UNION ALL
    SELECT i.user_id,i.trip_id,'installment_due','notifications.travel.installmentTitle',
      'notifications.travel.installmentBody',
      jsonb_build_object('dueDate',i.due_date,'amountMinor',i.expected_amount_minor,'currency',p.currency,'days',d.days),
      'installment:'||i.id||':due:'||d.days
    FROM public.trip_installments i
    JOIN public.trip_payment_plans p ON p.id=i.payment_plan_id AND p.deleted_at IS NULL AND p.status='active'
    JOIN public.trips t ON t.id=i.trip_id AND t.deleted_at IS NULL AND t.status NOT IN ('cancelled','archived')
    JOIN public.trip_notification_settings s ON s.user_id=i.user_id AND s.payment_enabled
    CROSS JOIN LATERAL unnest(s.payment_reminder_days) d(days)
    WHERE i.status <> 'cancelled' AND d.days >= 0
      AND i.due_date=((p_now AT TIME ZONE s.timezone)::date+d.days)
    UNION ALL
    SELECT a.user_id,a.trip_id,'trip_changed','notifications.travel.changedTitle','notifications.travel.changedBody',
      jsonb_build_object('changeType',a.activity_type),'meaningful-change:'||a.id
    FROM public.trip_activity_log a
    JOIN public.trips t ON t.id=a.trip_id AND t.deleted_at IS NULL AND t.status<>'archived'
    WHERE a.activity_type IN ('trip_edited','trip_status_changed','payment_changed')
      AND a.created_at>p_now-interval '1 hour' AND a.created_at<=p_now
  ) source
  ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_trip_notifications(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_trip_notifications(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.reschedule_trip_installment(p_installment_id uuid, p_due_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE old_row public.trip_installments%ROWTYPE; new_row public.trip_installments%ROWTYPE;
BEGIN
  SELECT * INTO old_row FROM public.trip_installments WHERE id = p_installment_id AND user_id = auth.uid() FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Installment not found' USING ERRCODE = 'P0002'; END IF;
  IF old_row.status = 'cancelled' OR old_row.paid_amount_minor > 0
    OR old_row.due_date <= (now() AT TIME ZONE 'Asia/Jerusalem')::date
  THEN RAISE EXCEPTION 'Collected or cancelled installments cannot be rescheduled' USING ERRCODE = '22023'; END IF;
  UPDATE public.trip_installments SET due_date = p_due_date, updated_at = now()
  WHERE id = p_installment_id RETURNING * INTO new_row;
  INSERT INTO public.trip_installment_events (installment_id,trip_id,user_id,actor_user_id,event_type,previous_state,new_state)
  VALUES (new_row.id,new_row.trip_id,new_row.user_id,auth.uid(),'rescheduled',to_jsonb(old_row),to_jsonb(new_row));
  RETURN to_jsonb(new_row);
END;
$$;
REVOKE ALL ON FUNCTION public.reschedule_trip_installment(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_trip_installment(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_future_trip_installments(
  p_payment_plan_id uuid, p_new_card_total_minor bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE plan_row public.trip_payment_plans%ROWTYPE; fixed_total bigint; future_count integer; remaining bigint; base bigint; changed integer;
BEGIN
  SELECT * INTO plan_row FROM public.trip_payment_plans
  WHERE id=p_payment_plan_id AND user_id=auth.uid() AND source='native' AND deleted_at IS NULL AND status<>'cancelled' FOR UPDATE;
  IF plan_row.id IS NULL THEN RAISE EXCEPTION 'Payment plan not found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(sum(expected_amount_minor) FILTER (
      WHERE due_date <= (now() AT TIME ZONE 'Asia/Jerusalem')::date
        OR paid_amount_minor > 0 OR status <> 'scheduled'),0)::bigint,
    count(*) FILTER (WHERE due_date > (now() AT TIME ZONE 'Asia/Jerusalem')::date
      AND paid_amount_minor = 0 AND status = 'scheduled')::integer
  INTO fixed_total,future_count FROM public.trip_installments
  WHERE payment_plan_id=plan_row.id AND status<>'cancelled';
  IF p_new_card_total_minor<fixed_total OR future_count=0
  THEN RAISE EXCEPTION 'New total cannot alter collected installments' USING ERRCODE='22023'; END IF;
  remaining:=p_new_card_total_minor-fixed_total; base:=remaining/future_count;
  IF base<=0 THEN RAISE EXCEPTION 'Future installments must be positive' USING ERRCODE='22023'; END IF;
  WITH targets AS (
    SELECT id,row_number() OVER (ORDER BY installment_number) position
    FROM public.trip_installments WHERE payment_plan_id=plan_row.id AND status='scheduled'
      AND paid_amount_minor=0 AND due_date > (now() AT TIME ZONE 'Asia/Jerusalem')::date
  )
  UPDATE public.trip_installments i SET expected_amount_minor=
    CASE WHEN targets.position=future_count THEN remaining-base*(future_count-1) ELSE base END,updated_at=now()
  FROM targets WHERE i.id=targets.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  UPDATE public.trip_payment_plans SET card_total_minor=p_new_card_total_minor,updated_at=now() WHERE id=plan_row.id;
  INSERT INTO public.trip_payment_events (payment_plan_id,trip_id,user_id,actor_user_id,event_type,previous_state,new_state)
  VALUES (plan_row.id,plan_row.trip_id,plan_row.user_id,auth.uid(),'plan_recalculated',to_jsonb(plan_row),jsonb_build_object('card_total_minor',p_new_card_total_minor));
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_future_trip_installments(uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_future_trip_installments(uuid,bigint) TO authenticated;

-- Manual Visa receipt entry remains available for audit and correction, but no longer
-- changes effective Visa progress or creates a product collection notification.
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
    to_jsonb(old_row), to_jsonb(new_row));

  UPDATE public.trip_payment_plans AS p SET card_paid_minor = totals.receipted, updated_at = now()
  FROM (SELECT payment_plan_id,
    coalesce(sum(CASE WHEN paid_at IS NOT NULL THEN paid_amount_minor ELSE 0 END), 0)::bigint AS receipted
    FROM public.trip_installments WHERE payment_plan_id = new_row.payment_plan_id GROUP BY payment_plan_id) AS totals
  WHERE p.id = totals.payment_plan_id;

  RETURN to_jsonb(new_row);
END;
$$;

REVOKE ALL ON FUNCTION public.record_trip_installment_payment(uuid,bigint,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trip_installment_payment(uuid,bigint,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_travel_payment_contract_version()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT 4; $$;
REVOKE ALL ON FUNCTION public.get_travel_payment_contract_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_payment_contract_version() TO authenticated;

NOTIFY pgrst, 'reload schema';
