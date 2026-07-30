-- Forward-only canonical Travel Mode payment contract.
-- Native plans and recorded installment receipts are authoritative. Legacy trip
-- aggregates remain available only as an explicit fallback and compatibility mirror.

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
    WHERE t.id = p_trip_id
      AND t.user_id = auth.uid()
      AND t.deleted_at IS NULL
  ), selected_plan AS (
    SELECT p.*
    FROM public.trip_payment_plans AS p
    JOIN owned_trip AS t ON t.id = p.trip_id
    WHERE p.user_id = auth.uid()
      AND p.deleted_at IS NULL
      AND p.status <> 'cancelled'
    ORDER BY (p.source = 'native') DESC, p.updated_at DESC, p.id DESC
    LIMIT 1
  ), schedule AS (
    SELECT
      coalesce(sum(i.paid_amount_minor) FILTER (WHERE i.status <> 'cancelled'), 0)::bigint AS visa_confirmed_minor,
      count(*) FILTER (WHERE i.status <> 'cancelled' AND i.paid_amount_minor > 0)::integer AS confirmed_installments,
      coalesce(sum(i.expected_amount_minor) FILTER (WHERE i.status <> 'cancelled' AND i.due_date <= current_date), 0)::bigint AS scheduled_through_today_minor,
      coalesce(sum(greatest(i.expected_amount_minor - i.paid_amount_minor, 0)) FILTER (WHERE i.status <> 'cancelled' AND i.due_date < current_date), 0)::bigint AS overdue_unconfirmed_minor,
      coalesce(sum(greatest(i.expected_amount_minor - i.paid_amount_minor, 0)) FILTER (WHERE i.status <> 'cancelled' AND i.due_date <= current_date), 0)::bigint AS currently_due_unconfirmed_minor,
      coalesce(sum(greatest(i.expected_amount_minor - i.paid_amount_minor, 0)) FILTER (WHERE i.status <> 'cancelled' AND i.due_date > current_date), 0)::bigint AS future_scheduled_minor,
      max(i.due_date) FILTER (WHERE i.status <> 'cancelled') AS final_installment_date
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
  ), next_installment AS (
    SELECT i.due_date, i.expected_amount_minor, i.paid_amount_minor
    FROM public.trip_installments AS i
    JOIN selected_plan AS p ON p.id = i.payment_plan_id
    WHERE i.status <> 'cancelled'
      AND i.paid_amount_minor < i.expected_amount_minor
    ORDER BY i.due_date, i.installment_number
    LIMIT 1
  ), raw AS (
    SELECT
      t.*,
      p.id AS plan_id,
      p.source AS plan_source,
      p.payment_method AS plan_method,
      p.currency AS plan_currency,
      coalesce(p.installment_count, 0) AS installment_count,
      coalesce(p.card_total_minor,
        CASE WHEN t.payment_method = 'card' THEN round(coalesce(t.sale_price, 0) * 100)::bigint
             WHEN t.payment_method = 'mixed' THEN greatest(round(coalesce(t.card_paid_amount, 0) * 100)::bigint, 0)
             ELSE 0 END, 0) AS visa_schedule_total_minor,
      coalesce(p.cash_total_minor,
        CASE WHEN t.payment_method = 'card' THEN 0
             WHEN t.payment_method = 'mixed' THEN greatest(round((coalesce(t.sale_price, 0) - coalesce(t.card_paid_amount, 0)) * 100)::bigint, 0)
             ELSE round(coalesce(t.sale_price, 0) * 100)::bigint END, 0) AS cash_total_minor,
      CASE WHEN p.source = 'native' THEN greatest(coalesce(p.cash_paid_minor, 0), 0)
           WHEN coalesce(t.payment_method, 'cash') IN ('cash', 'mixed')
             THEN greatest(round(coalesce(CASE WHEN t.payment_method = 'mixed' THEN t.cash_paid_amount ELSE t.amount_paid END, 0) * 100)::bigint, 0)
           ELSE 0 END AS raw_cash_confirmed_minor,
      CASE WHEN p.source = 'native' THEN greatest(coalesce(s.visa_confirmed_minor, 0), 0)
           WHEN t.payment_method = 'card' THEN greatest(round(coalesce(t.amount_paid, 0) * 100)::bigint, 0)
           WHEN t.payment_method = 'mixed' THEN greatest(round((coalesce(t.amount_paid, 0) - coalesce(t.cash_paid_amount, 0)) * 100)::bigint, 0)
           ELSE 0 END AS raw_visa_confirmed_minor,
      coalesce(s.confirmed_installments, 0) AS confirmed_installments,
      coalesce(s.scheduled_through_today_minor, 0) AS scheduled_through_today_minor,
      coalesce(s.overdue_unconfirmed_minor, 0) AS overdue_unconfirmed_minor,
      coalesce(s.currently_due_unconfirmed_minor, 0) AS currently_due_unconfirmed_minor,
      coalesce(s.future_scheduled_minor, 0) AS future_scheduled_minor,
      s.final_installment_date,
      n.due_date AS next_due_date,
      n.expected_amount_minor AS next_expected_minor,
      n.paid_amount_minor AS next_confirmed_minor,
      coalesce(p.card_paid_minor, 0) AS stored_card_paid_minor,
      coalesce(p.cash_paid_minor, 0) AS stored_cash_paid_minor
    FROM owned_trip AS t
    LEFT JOIN selected_plan AS p ON true
    LEFT JOIN schedule AS s ON true
    LEFT JOIN next_installment AS n ON true
  ), normalized AS (
    SELECT raw.*,
      greatest(round(coalesce(sale_price, 0) * 100)::bigint, 0) AS sale_total_minor,
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
    'plan_id', plan_id,
    'source', CASE WHEN plan_source = 'native' THEN 'native' ELSE 'legacy' END,
    'payment_source', CASE WHEN plan_source = 'native' THEN 'native' ELSE 'legacy_fallback' END,
    'reconciliation_state', CASE
      WHEN plan_source IS DISTINCT FROM 'native' THEN 'legacy_fallback'
      WHEN cash_total_minor + visa_schedule_total_minor <> sale_total_minor THEN 'allocation_mismatch'
      WHEN stored_card_paid_minor <> visa_confirmed_minor THEN 'ledger_mismatch'
      WHEN round(coalesce(amount_paid, 0) * 100)::bigint <> confirmed_total_minor THEN 'legacy_mismatch'
      ELSE 'aligned'
    END,
    'payment_method', coalesce(plan_method, payment_method, 'cash'),
    'currency', coalesce(plan_currency, currency, 'ILS'),
    'sale_total_minor', sale_total_minor,
    'cash_total_minor', cash_total_minor,
    'cash_confirmed_minor', cash_confirmed_minor,
    'cash_remaining_minor', cash_remaining_minor,
    'visa_schedule_total_minor', visa_schedule_total_minor,
    'visa_confirmed_minor', visa_confirmed_minor,
    'visa_scheduled_through_today_minor', scheduled_through_today_minor,
    'visa_overdue_unconfirmed_minor', overdue_unconfirmed_minor,
    'visa_future_scheduled_minor', future_scheduled_minor,
    'confirmed_total_minor', confirmed_total_minor,
    'total_unpaid_minor', total_unpaid_minor,
    'currently_due_unconfirmed_minor', currently_due_unconfirmed_minor,
    'installment_count', installment_count,
    'confirmed_installments', confirmed_installments,
    'next_installment_due_date', next_due_date,
    'next_installment_expected_minor', next_expected_minor,
    'next_installment_confirmed_minor', next_confirmed_minor,
    'final_installment_date', final_installment_date,
    'derived_payment_status', CASE WHEN confirmed_total_minor <= 0 THEN 'unpaid' WHEN total_unpaid_minor <= 0 THEN 'paid' ELSE 'partial' END,
    -- Compatibility aliases retained for existing clients during rollout.
    'card_total_minor', visa_schedule_total_minor,
    'cash_paid_minor', cash_confirmed_minor,
    'stored_cash_paid_minor', stored_cash_paid_minor,
    'processed_installments', confirmed_installments,
    'scheduled_minor_to_date', scheduled_through_today_minor,
    'remaining_scheduled_minor', future_scheduled_minor,
    'next_installment_minor', CASE WHEN next_expected_minor IS NULL THEN NULL ELSE greatest(next_expected_minor - coalesce(next_confirmed_minor, 0), 0) END,
    'next_installment_date', next_due_date,
    'authoritative_paid_minor', confirmed_total_minor,
    'authoritative_remaining_minor', total_unpaid_minor,
    'authoritative_payment_status', CASE WHEN confirmed_total_minor <= 0 THEN 'unpaid' WHEN total_unpaid_minor <= 0 THEN 'paid' ELSE 'partial' END,
    'combined_remaining_minor', total_unpaid_minor
  )
  FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_owned_trip_payment_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owned_trip_payment_summary(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_owned_trip_payment_summary(uuid) IS
  'Returns native-ledger confirmed Cash and Visa receipts separately from scheduled amounts, with an explicit legacy fallback.';

CREATE OR REPLACE FUNCTION public.save_trip_transaction(
  p_trip_data jsonb,
  p_payment_plan jsonb DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_trip_id uuid;
  v_is_edit boolean := false;
  v_saved_trip record;
  v_payment_method text;
  v_card_total_minor bigint;
  v_cash_total_minor bigint;
  v_confirmed_cash_minor bigint;
  v_currency text;
  v_installment_count int;
  v_first_date date;
  v_plan_id uuid;
  v_installment_amount bigint;
  v_last_installment_amount bigint;
  v_curr_date date;
  v_idx int;
  v_response jsonb;
  v_payment_summary jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_AUTHENTICATED';
  END IF;

  -- 1. Check Idempotency if client_request_id provided
  IF p_client_request_id IS NOT NULL THEN
    SELECT response_payload INTO v_response
    FROM public.trip_write_requests
    WHERE user_id = v_user_id AND client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN v_response;
    END IF;
  END IF;

  -- 2. Determine if Edit or Create
  v_trip_id := NULLIF(p_trip_data->>'id', '')::uuid;
  IF v_trip_id IS NOT NULL THEN
    -- Verify ownership and active status for edit
    SELECT id INTO v_trip_id
    FROM public.trips
    WHERE id = v_trip_id AND user_id = v_user_id AND deleted_at IS NULL;

    IF v_trip_id IS NULL THEN
      RAISE EXCEPTION 'TRIP_NOT_FOUND_OR_ACCESS_DENIED';
    END IF;
    v_is_edit := true;
  END IF;

  -- 3. Perform Trip Upsert (explicitly handling currency, exchange_rate, and original financial fields)
  IF v_is_edit THEN
    UPDATE public.trips SET
      client_name = coalesce(p_trip_data->>'client_name', client_name),
      destination = coalesce(p_trip_data->>'destination', destination),
      start_date = coalesce((p_trip_data->>'start_date')::date, start_date),
      end_date = coalesce((p_trip_data->>'end_date')::date, end_date),
      currency = coalesce(p_trip_data->>'currency', currency, 'ILS'),
      exchange_rate = coalesce((p_trip_data->>'exchange_rate')::numeric, exchange_rate, 1),
      sale_price = coalesce((p_trip_data->>'sale_price')::numeric, sale_price),
      wholesale_cost = coalesce((p_trip_data->>'wholesale_cost')::numeric, wholesale_cost),
      status = coalesce(p_trip_data->>'status', status),
      payment_status = coalesce(p_trip_data->>'payment_status', payment_status),
      amount_paid = coalesce((p_trip_data->>'amount_paid')::numeric, amount_paid),
      payment_date = CASE WHEN p_trip_data ? 'payment_date' THEN nullif(p_trip_data->>'payment_date', '')::date ELSE payment_date END,
      travelers_count = coalesce((p_trip_data->>'travelers_count')::int, travelers_count),
      client_phone = p_trip_data->>'client_phone',
      booking_reference = p_trip_data->>'booking_reference',
      notes = p_trip_data->>'notes',
      service_type = coalesce(p_trip_data->>'service_type', service_type),
      hotel_name = p_trip_data->>'hotel_name',
      payment_method = p_trip_data->>'payment_method',
      cash_paid_amount = (p_trip_data->>'cash_paid_amount')::numeric,
      card_paid_amount = (p_trip_data->>'card_paid_amount')::numeric,
      trip_type = p_trip_data->>'trip_type',
      airline_name = p_trip_data->>'airline_name',
      flight_number = p_trip_data->>'flight_number',
      ticket_class = p_trip_data->>'ticket_class',
      departure_airport = p_trip_data->>'departure_airport',
      arrival_airport = p_trip_data->>'arrival_airport',
      departure_datetime = (p_trip_data->>'departure_datetime')::timestamptz,
      arrival_datetime = (p_trip_data->>'arrival_datetime')::timestamptz,
      return_flight_number = p_trip_data->>'return_flight_number',
      return_departure_airport = p_trip_data->>'return_departure_airport',
      return_arrival_airport = p_trip_data->>'return_arrival_airport',
      return_departure_datetime = (p_trip_data->>'return_departure_datetime')::timestamptz,
      return_arrival_datetime = (p_trip_data->>'return_arrival_datetime')::timestamptz,
      ticket_cost_ils = (p_trip_data->>'ticket_cost_ils')::numeric,
      ticket_notes = p_trip_data->>'ticket_notes',
      wholesale_original_amount = (p_trip_data->>'wholesale_original_amount')::numeric,
      wholesale_currency = coalesce(p_trip_data->>'wholesale_currency', p_trip_data->>'currency', 'ILS'),
      sale_original_amount = (p_trip_data->>'sale_original_amount')::numeric,
      sale_currency = coalesce(p_trip_data->>'sale_currency', p_trip_data->>'currency', 'ILS'),
      room_type = coalesce(p_trip_data->'room_type', room_type),
      board_basis = p_trip_data->>'board_basis',
      travelers = coalesce(p_trip_data->'travelers', travelers),
      itinerary = coalesce(p_trip_data->'itinerary', itinerary),
      payments = coalesce(p_trip_data->'payments', payments),
      updated_at = now()
    WHERE id = v_trip_id AND user_id = v_user_id
    RETURNING * INTO v_saved_trip;
  ELSE
    INSERT INTO public.trips (
      user_id,
      client_name,
      destination,
      start_date,
      end_date,
      currency,
      exchange_rate,
      sale_price,
      wholesale_cost,
      status,
      payment_status,
      amount_paid,
      payment_date,
      travelers_count,
      client_phone,
      booking_reference,
      notes,
      service_type,
      hotel_name,
      payment_method,
      cash_paid_amount,
      card_paid_amount,
      trip_type,
      airline_name,
      flight_number,
      ticket_class,
      departure_airport,
      arrival_airport,
      departure_datetime,
      arrival_datetime,
      return_flight_number,
      return_departure_airport,
      return_arrival_airport,
      return_departure_datetime,
      return_arrival_datetime,
      ticket_cost_ils,
      ticket_notes,
      wholesale_original_amount,
      wholesale_currency,
      sale_original_amount,
      sale_currency,
      room_type,
      board_basis,
      travelers,
      itinerary,
      payments
    ) VALUES (
      v_user_id,
      p_trip_data->>'client_name',
      p_trip_data->>'destination',
      (p_trip_data->>'start_date')::date,
      (p_trip_data->>'end_date')::date,
      coalesce(p_trip_data->>'currency', 'ILS'),
      coalesce((p_trip_data->>'exchange_rate')::numeric, 1),
      coalesce((p_trip_data->>'sale_price')::numeric, 0),
      coalesce((p_trip_data->>'wholesale_cost')::numeric, 0),
      coalesce(p_trip_data->>'status', 'active'),
      coalesce(p_trip_data->>'payment_status', 'unpaid'),
      coalesce((p_trip_data->>'amount_paid')::numeric, 0),
      nullif(p_trip_data->>'payment_date', '')::date,
      coalesce((p_trip_data->>'travelers_count')::int, 1),
      p_trip_data->>'client_phone',
      p_trip_data->>'booking_reference',
      p_trip_data->>'notes',
      coalesce(p_trip_data->>'service_type', 'both'),
      p_trip_data->>'hotel_name',
      p_trip_data->>'payment_method',
      (p_trip_data->>'cash_paid_amount')::numeric,
      (p_trip_data->>'card_paid_amount')::numeric,
      p_trip_data->>'trip_type',
      p_trip_data->>'airline_name',
      p_trip_data->>'flight_number',
      p_trip_data->>'ticket_class',
      p_trip_data->>'departure_airport',
      p_trip_data->>'arrival_airport',
      (p_trip_data->>'departure_datetime')::timestamptz,
      (p_trip_data->>'arrival_datetime')::timestamptz,
      p_trip_data->>'return_flight_number',
      p_trip_data->>'return_departure_airport',
      p_trip_data->>'return_arrival_airport',
      (p_trip_data->>'return_departure_datetime')::timestamptz,
      (p_trip_data->>'return_arrival_datetime')::timestamptz,
      (p_trip_data->>'ticket_cost_ils')::numeric,
      p_trip_data->>'ticket_notes',
      coalesce((p_trip_data->>'wholesale_original_amount')::numeric, (p_trip_data->>'wholesale_cost')::numeric, 0),
      coalesce(p_trip_data->>'wholesale_currency', p_trip_data->>'currency', 'ILS'),
      coalesce((p_trip_data->>'sale_original_amount')::numeric, (p_trip_data->>'sale_price')::numeric, 0),
      coalesce(p_trip_data->>'sale_currency', p_trip_data->>'currency', 'ILS'),
      coalesce(p_trip_data->'room_type', '{}'::jsonb),
      p_trip_data->>'board_basis',
      coalesce(p_trip_data->'travelers', '[]'::jsonb),
      coalesce(p_trip_data->'itinerary', '[]'::jsonb),
      coalesce(p_trip_data->'payments', '[]'::jsonb)
    ) RETURNING * INTO v_saved_trip;

    v_trip_id := v_saved_trip.id;
  END IF;

  -- 4. Process Payment Plan if provided
  IF p_payment_plan IS NOT NULL AND (p_payment_plan->>'method') IS NOT NULL THEN
    v_payment_method := p_payment_plan->>'method';
    v_currency := coalesce(p_payment_plan->>'currency', v_saved_trip.currency, 'ILS');
    v_card_total_minor := coalesce((p_payment_plan->>'cardTotalMinor')::bigint, 0);
    v_cash_total_minor := coalesce((p_payment_plan->>'cashTotalMinor')::bigint, 0);
    v_confirmed_cash_minor := coalesce((p_payment_plan->>'confirmedCashMinor')::bigint, 0);
    v_installment_count := coalesce((p_payment_plan->>'installmentCount')::int, 1);
    v_first_date := coalesce((p_payment_plan->>'firstDate')::date, CURRENT_DATE);

    IF v_confirmed_cash_minor < 0 OR v_confirmed_cash_minor > v_cash_total_minor THEN
      RAISE EXCEPTION 'INVALID_CONFIRMED_CASH_AMOUNT' USING ERRCODE = '22023';
    END IF;
    IF v_payment_method NOT IN ('card', 'cash', 'mixed')
      OR (v_payment_method = 'card' AND v_cash_total_minor <> 0)
      OR (v_payment_method = 'cash' AND v_card_total_minor <> 0)
      OR (v_payment_method = 'mixed' AND (v_card_total_minor <= 0 OR v_cash_total_minor <= 0))
      OR v_card_total_minor + v_cash_total_minor <> round(v_saved_trip.sale_price * 100)::bigint
    THEN
      RAISE EXCEPTION 'PAYMENT_PLAN_SPLIT_MISMATCH' USING ERRCODE = '22023';
    END IF;

    -- Check if payment plan already exists for this trip
    SELECT id INTO v_plan_id
    FROM public.trip_payment_plans
    WHERE trip_id = v_trip_id
      AND user_id = v_user_id
      AND deleted_at IS NULL
      AND status <> 'cancelled'
    ORDER BY updated_at DESC
    LIMIT 1
    FOR UPDATE;

    -- A saved Visa receipt is an immutable collection event. Structural plan
    -- changes must use the dedicated future-installment workflow so an edit
    -- cannot silently cancel or redistribute confirmed history.
    IF v_plan_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.trip_installments AS paid_installment
        WHERE paid_installment.payment_plan_id = v_plan_id
          AND paid_installment.status <> 'cancelled'
          AND paid_installment.paid_amount_minor > 0
      )
      AND EXISTS (
        SELECT 1 FROM public.trip_payment_plans AS existing_plan
        WHERE existing_plan.id = v_plan_id
          AND (
            v_payment_method = 'cash'
            OR existing_plan.payment_method IS DISTINCT FROM v_payment_method
            OR existing_plan.currency IS DISTINCT FROM v_currency
            OR existing_plan.card_total_minor IS DISTINCT FROM v_card_total_minor
            OR existing_plan.installment_count IS DISTINCT FROM v_installment_count
            OR existing_plan.first_installment_date IS DISTINCT FROM v_first_date
          )
      )
    THEN
      RAISE EXCEPTION 'PAYMENT_PLAN_CONFIRMED_SCHEDULE_CONFLICT' USING ERRCODE = '22023';
    END IF;

    IF v_payment_method IN ('card', 'mixed') THEN
      IF v_card_total_minor <= 0
        OR v_installment_count <= 0
        OR v_installment_count > 120
        OR v_installment_count > v_card_total_minor
      THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_PLAN_CARD_PARAMETERS' USING ERRCODE = '22023';
      END IF;

      -- Upsert Payment Plan using source = 'native'
      IF v_plan_id IS NOT NULL THEN
        UPDATE public.trip_payment_plans SET
          payment_method = v_payment_method,
          currency = v_currency,
          card_total_minor = v_card_total_minor,
          cash_total_minor = v_cash_total_minor,
          cash_paid_minor = v_confirmed_cash_minor,
          installment_count = v_installment_count,
          first_installment_date = v_first_date,
          status = 'active',
          source = 'native',
          updated_at = now()
        WHERE id = v_plan_id;
      ELSE
        INSERT INTO public.trip_payment_plans (
          trip_id,
          user_id,
          payment_method,
          currency,
          card_total_minor,
          cash_total_minor,
          cash_paid_minor,
          installment_count,
          first_installment_date,
          status,
          source
        ) VALUES (
          v_trip_id,
          v_user_id,
          v_payment_method,
          v_currency,
          v_card_total_minor,
          v_cash_total_minor,
          v_confirmed_cash_minor,
          v_installment_count,
          v_first_date,
          'active',
          'native'
        )
        RETURNING id INTO v_plan_id;
      END IF;

      -- Replace only untouched schedule rows. Confirmed payment history is preserved.
      DELETE FROM public.trip_installments
      WHERE payment_plan_id = v_plan_id
        AND paid_amount_minor = 0
        AND status = 'scheduled';

      -- Calculate Installment Schedule
      v_installment_amount := v_card_total_minor / v_installment_count;
      v_last_installment_amount := v_card_total_minor - (v_installment_amount * (v_installment_count - 1));

      FOR v_idx IN 1..v_installment_count LOOP
        v_curr_date := v_first_date + ((v_idx - 1) || ' month')::interval;

        INSERT INTO public.trip_installments (
          payment_plan_id,
          trip_id,
          user_id,
          installment_number,
          due_date,
          expected_amount_minor,
          status
        ) VALUES (
          v_plan_id,
          v_trip_id,
          v_user_id,
          v_idx,
          v_curr_date,
          CASE WHEN v_idx = v_installment_count THEN v_last_installment_amount ELSE v_installment_amount END,
          'scheduled'
        )
        ON CONFLICT (payment_plan_id, installment_number) DO UPDATE SET
          due_date = excluded.due_date,
          expected_amount_minor = excluded.expected_amount_minor,
          status = 'scheduled',
          updated_at = now()
        WHERE public.trip_installments.paid_amount_minor = 0;
      END LOOP;

    ELSIF v_payment_method = 'cash' THEN
      UPDATE public.trip_installments SET status = 'cancelled', updated_at = now()
      WHERE payment_plan_id = v_plan_id AND status <> 'cancelled';

      -- Cash plan using source = 'native'
      IF v_plan_id IS NOT NULL THEN
        UPDATE public.trip_payment_plans SET
          payment_method = 'cash',
          currency = v_currency,
          cash_total_minor = v_cash_total_minor,
          cash_paid_minor = v_confirmed_cash_minor,
          card_total_minor = 0,
          installment_count = 0,
          status = 'active',
          source = 'native',
          updated_at = now()
        WHERE id = v_plan_id;
      ELSE
        INSERT INTO public.trip_payment_plans (
          trip_id,
          user_id,
          payment_method,
          currency,
          card_total_minor,
          cash_total_minor,
          cash_paid_minor,
          installment_count,
          status,
          source
        ) VALUES (
          v_trip_id,
          v_user_id,
          'cash',
          v_currency,
          0,
          v_cash_total_minor,
          v_confirmed_cash_minor,
          0,
          'active',
          'native'
        )
        RETURNING id INTO v_plan_id;
      END IF;
    END IF;
  END IF;

  -- 5. Synchronize legacy trip aggregates from the native ledger for compatibility.
  -- Native plans always win over client-provided or previously stored aggregate values.
  v_payment_summary := public.get_owned_trip_payment_summary(v_trip_id);
  IF v_payment_summary->>'payment_source' = 'native' THEN
    UPDATE public.trips SET
      amount_paid = ((v_payment_summary->>'confirmed_total_minor')::numeric / 100),
      payment_status = v_payment_summary->>'derived_payment_status',
      cash_paid_amount = ((v_payment_summary->>'cash_confirmed_minor')::numeric / 100),
      card_paid_amount = ((v_payment_summary->>'visa_confirmed_minor')::numeric / 100),
      updated_at = now()
    WHERE id = v_trip_id AND user_id = v_user_id
    RETURNING * INTO v_saved_trip;
    v_payment_summary := public.get_owned_trip_payment_summary(v_trip_id);
  END IF;

  -- 6. Activity Log
  INSERT INTO public.trip_activity_log (
    trip_id,
    user_id,
    activity_type,
    metadata
  ) VALUES (
    v_trip_id,
    v_user_id,
    CASE WHEN v_is_edit THEN 'trip_updated' ELSE 'trip_created' END,
    jsonb_build_object('client_name', v_saved_trip.client_name, 'destination', v_saved_trip.destination)
  );

  -- 7. Response Payload (includes database-computed profit)
  v_response := jsonb_build_object(
    'id', v_saved_trip.id,
    'client_name', v_saved_trip.client_name,
    'destination', v_saved_trip.destination,
    'currency', v_saved_trip.currency,
    'exchange_rate', v_saved_trip.exchange_rate,
    'sale_price', v_saved_trip.sale_price,
    'amount_paid', v_saved_trip.amount_paid,
    'amount_due', v_saved_trip.amount_due,
    'payment_date', v_saved_trip.payment_date,
    'payment_status', v_saved_trip.payment_status,
    'payment_plan_summary', v_payment_summary,
    'profit', v_saved_trip.profit,
    'profit_percentage', v_saved_trip.profit_percentage,
    'updated_at', v_saved_trip.updated_at
  );

  -- 8. Store Idempotency Request Record
  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.trip_write_requests (user_id, client_request_id, trip_id, response_payload)
    VALUES (v_user_id, p_client_request_id, v_saved_trip.id, v_response)
    ON CONFLICT (user_id, client_request_id) DO NOTHING;
  END IF;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) IS
  'Atomically saves an owned trip, persists compatibility payment fields, and synchronizes them from native Cash and Visa receipt ledgers.';

CREATE OR REPLACE FUNCTION public.sync_trip_payment_compatibility_from_native(
  p_trip_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale_minor bigint;
  v_cash_confirmed_minor bigint;
  v_visa_confirmed_minor bigint;
  v_confirmed_minor bigint;
BEGIN
  SELECT greatest(round(coalesce(t.sale_price, 0) * 100)::bigint, 0),
    least(greatest(p.cash_total_minor, 0), greatest(p.cash_paid_minor, 0)),
    least(greatest(p.card_total_minor, 0), greatest(coalesce((
      SELECT sum(i.paid_amount_minor)
      FROM public.trip_installments AS i
      WHERE i.payment_plan_id = p.id AND i.status <> 'cancelled'
    ), 0), 0))
  INTO v_sale_minor, v_cash_confirmed_minor, v_visa_confirmed_minor
  FROM public.trips AS t
  JOIN LATERAL (
    SELECT plan.*
    FROM public.trip_payment_plans AS plan
    WHERE plan.trip_id = t.id
      AND plan.user_id = p_user_id
      AND plan.source = 'native'
      AND plan.deleted_at IS NULL
      AND plan.status <> 'cancelled'
    ORDER BY plan.updated_at DESC, plan.id DESC
    LIMIT 1
  ) AS p ON true
  WHERE t.id = p_trip_id AND t.user_id = p_user_id AND t.deleted_at IS NULL;

  IF NOT FOUND THEN RETURN; END IF;
  v_confirmed_minor := least(v_sale_minor, v_cash_confirmed_minor + v_visa_confirmed_minor);

  UPDATE public.trips
  SET amount_paid = v_confirmed_minor::numeric / 100,
      payment_status = CASE WHEN v_confirmed_minor <= 0 THEN 'unpaid'
                            WHEN v_confirmed_minor >= v_sale_minor THEN 'paid'
                            ELSE 'partial' END,
      cash_paid_amount = v_cash_confirmed_minor::numeric / 100,
      card_paid_amount = v_visa_confirmed_minor::numeric / 100,
      updated_at = now()
  WHERE id = p_trip_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_trip_payment_compatibility_from_native(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_trip_payment_plan_compatibility_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_trip_payment_compatibility_from_native(OLD.trip_id, OLD.user_id);
    RETURN OLD;
  END IF;
  PERFORM public.sync_trip_payment_compatibility_from_native(NEW.trip_id, NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_trip_installment_compatibility_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_trip_payment_compatibility_from_native(OLD.trip_id, OLD.user_id);
    RETURN OLD;
  END IF;
  PERFORM public.sync_trip_payment_compatibility_from_native(NEW.trip_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_payment_plan_compatibility_trigger ON public.trip_payment_plans;
CREATE TRIGGER trip_payment_plan_compatibility_trigger
AFTER INSERT OR UPDATE ON public.trip_payment_plans
FOR EACH ROW EXECUTE FUNCTION public.sync_trip_payment_plan_compatibility_trigger();

DROP TRIGGER IF EXISTS trip_installment_compatibility_trigger ON public.trip_installments;
CREATE TRIGGER trip_installment_compatibility_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.trip_installments
FOR EACH ROW EXECUTE FUNCTION public.sync_trip_installment_compatibility_trigger();

CREATE OR REPLACE FUNCTION public.get_travel_reports(
  p_start_date date, p_end_date date, p_currency text DEFAULT NULL,
  p_destination text DEFAULT NULL, p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH owned AS (
  SELECT t.*,
    (payment.summary->>'confirmed_total_minor')::numeric / 100 AS confirmed_received,
    (payment.summary->>'total_unpaid_minor')::numeric / 100 AS canonical_unpaid,
    (payment.summary->>'cash_confirmed_minor')::numeric / 100 AS confirmed_cash,
    (payment.summary->>'visa_confirmed_minor')::numeric / 100 AS confirmed_visa,
    (payment.summary->>'visa_overdue_unconfirmed_minor')::numeric / 100 AS overdue_unconfirmed_visa,
    (payment.summary->>'visa_future_scheduled_minor')::numeric / 100 AS future_scheduled_visa,
    payment.summary->>'derived_payment_status' AS canonical_payment_status
  FROM public.trips AS t
  CROSS JOIN LATERAL (SELECT public.get_owned_trip_payment_summary(t.id) AS summary) AS payment
  WHERE t.user_id = auth.uid() AND t.deleted_at IS NULL
    AND t.start_date BETWEEN p_start_date AND p_end_date
    AND t.status <> 'cancelled' AND (p_include_archived OR t.status <> 'archived')
    AND (nullif(p_currency,'') IS NULL OR t.currency = p_currency)
    AND (nullif(p_destination,'') IS NULL OR t.destination = p_destination)
), monthly AS (
  SELECT date_trunc('month', start_date)::date AS "month", currency, count(*) AS trip_count,
    sum(sale_price) sales, sum(wholesale_cost) cost, sum(profit) profit,
    sum(confirmed_received) paid, sum(canonical_unpaid) outstanding,
    avg(CASE WHEN wholesale_cost > 0 THEN profit / wholesale_cost * 100 ELSE 0 END) average_markup
  FROM owned GROUP BY 1,2
), destinations AS (
  SELECT destination,currency,count(*) trip_count,sum(sale_price) sales,sum(profit) profit,sum(canonical_unpaid) outstanding,
    avg(CASE WHEN wholesale_cost > 0 THEN profit / wholesale_cost * 100 ELSE 0 END) average_markup,
    count(DISTINCT lower(trim(client_name))) FILTER (WHERE lower(trim(client_name)) IN (SELECT lower(trim(client_name)) FROM owned GROUP BY lower(trim(client_name)) HAVING count(*) > 1)) repeat_clients
  FROM owned GROUP BY 1,2
), clients AS (
  SELECT lower(trim(client_name)) client_key,max(client_name) client_name,max(client_phone) client_phone,currency,count(*) trip_count,
    max(start_date) last_trip_date,sum(sale_price) sales,sum(canonical_unpaid) outstanding,avg(sale_price) average_trip_value,
    mode() WITHIN GROUP (ORDER BY destination) common_destination
  FROM owned GROUP BY 1,4 HAVING count(*) > 1
), currencies AS (
  SELECT currency,count(*) trip_count,sum(sale_price) sales,sum(wholesale_cost) cost,sum(profit) profit,
    sum(confirmed_received) paid,sum(canonical_unpaid) outstanding
  FROM owned GROUP BY currency
), markups AS (
  SELECT 'overall'::text dimension,'all'::text label,currency,
    avg(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END) average_markup,
    min(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END) minimum_markup,
    max(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END) maximum_markup,count(*) trip_count
  FROM owned GROUP BY currency
  UNION ALL
  SELECT 'destination',destination,currency,avg(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),
    min(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),max(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),count(*)
  FROM owned GROUP BY destination,currency
  UNION ALL
  SELECT 'trip_type',coalesce(trip_type,'unspecified'),currency,avg(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),
    min(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),max(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),count(*)
  FROM owned GROUP BY trip_type,currency
)
SELECT jsonb_build_object(
  'monthly',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m."month",m.currency) FROM monthly m),'[]'::jsonb),
  'destinations',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY profit DESC) FROM destinations d),'[]'::jsonb),
  'repeat_clients',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY trip_count DESC) FROM clients c),'[]'::jsonb),
  'unpaid',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY start_date) FROM (
    SELECT id,client_name,destination,start_date,currency,sale_price,
      confirmed_cash,confirmed_visa,confirmed_received,canonical_unpaid AS total_unpaid,
      overdue_unconfirmed_visa,future_scheduled_visa,payment_method,
      canonical_payment_status AS payment_status
    FROM owned WHERE canonical_unpaid > 0
  ) u),'[]'::jsonb),
  'currencies',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY currency) FROM currencies c),'[]'::jsonb),
  'markups',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY dimension,label,currency) FROM markups m),'[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.get_travel_reports(date,date,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_reports(date,date,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trips_page(
  p_year text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 24,
  p_search text DEFAULT NULL, p_payment_status text DEFAULT NULL,
  p_trip_status text DEFAULT NULL, p_month integer DEFAULT NULL,
  p_destination text DEFAULT NULL, p_sort_key text DEFAULT 'updated_desc'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH filtered AS MATERIALIZED (
    SELECT trip.*, payment.summary AS canonical_payment
    FROM public.trips AS trip
    CROSS JOIN LATERAL (SELECT public.get_owned_trip_payment_summary(trip.id) AS summary) AS payment
    WHERE trip.user_id = auth.uid() AND trip.deleted_at IS NULL
      AND extract(year FROM coalesce(trip.payment_date, trip.start_date))::text = p_year
      AND (nullif(trim(p_search), '') IS NULL OR NOT EXISTS (
        SELECT 1 FROM regexp_split_to_table(lower(trim(p_search)), '\s+') AS search_token(token)
        WHERE search_token.token <> '' AND trip.search_document NOT LIKE '%' || search_token.token || '%'
      ))
      AND (nullif(p_payment_status, '') IS NULL OR payment.summary->>'derived_payment_status' = p_payment_status)
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
      CASE WHEN p_sort_key = 'remaining_desc' THEN (canonical_payment->>'total_unpaid_minor')::bigint END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'remaining_asc' THEN (canonical_payment->>'total_unpaid_minor')::bigint END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'overdue_first' THEN (canonical_payment->>'visa_overdue_unconfirmed_minor')::bigint END DESC NULLS LAST,
      CASE WHEN p_sort_key IS NULL OR p_sort_key = 'updated_desc' THEN updated_at END DESC NULLS LAST,
      id DESC
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  ), currency_summary AS (
    SELECT coalesce(currency, 'ILS') AS currency, count(*) AS trip_count,
      coalesce(sum(sale_price), 0) AS revenue, coalesce(sum(profit), 0) AS profit,
      coalesce(sum((canonical_payment->>'total_unpaid_minor')::numeric / 100), 0) AS amount_due
    FROM filtered WHERE status NOT IN ('archived', 'cancelled')
    GROUP BY coalesce(currency, 'ILS')
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(
        (to_jsonb(page_trip) - ARRAY['travelers','itinerary','payments','notes','attachments','search_document','canonical_payment'])
        || jsonb_build_object(
          'has_itinerary', jsonb_array_length(coalesce(page_trip.itinerary, '[]'::jsonb)) > 0,
          'payment_plan_summary', page_trip.canonical_payment
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

REVOKE ALL ON FUNCTION public.get_trips_page(text,integer,integer,text,text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_page(text,integer,integer,text,text,text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_travel_payment_analytics(
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
  v_user_id uuid := auth.uid();
  v_year integer;
  v_period_start date;
  v_period_end date;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_year := CASE
    WHEN p_year IS NOT NULL AND p_year ~ '^\d{4}$' THEN p_year::integer
    ELSE extract(year FROM current_date)::integer
  END;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_period_start := p_start_date;
    v_period_end := p_end_date;
  ELSIF p_month BETWEEN 1 AND 12 THEN
    v_period_start := make_date(v_year, p_month, 1);
    v_period_end := (v_period_start + interval '1 month - 1 day')::date;
  ELSE
    v_period_start := make_date(v_year, 1, 1);
    v_period_end := make_date(v_year, 12, 31);
  END IF;

  WITH filtered AS (
    SELECT coalesce(t.currency, 'ILS') AS currency, payment.summary
    FROM public.trips AS t
    CROSS JOIN LATERAL (
      SELECT public.get_owned_trip_payment_summary(t.id) AS summary
    ) AS payment
    WHERE t.user_id = v_user_id
      AND t.deleted_at IS NULL
      AND coalesce(t.payment_date, t.start_date) BETWEEN v_period_start AND v_period_end
      AND (nullif(p_trip_status, '') IS NULL OR t.status = p_trip_status)
      AND (nullif(p_payment_status, '') IS NULL OR payment.summary->>'derived_payment_status' = p_payment_status)
      AND (nullif(p_destination, '') IS NULL OR t.destination = p_destination)
  ), currency_aggregates AS (
    SELECT currency,
      count(*)::integer AS trip_count,
      coalesce(sum((summary->>'sale_total_minor')::bigint), 0)::bigint AS sales_minor,
      coalesce(sum((summary->>'cash_confirmed_minor')::bigint), 0)::bigint AS confirmed_cash_minor,
      coalesce(sum((summary->>'cash_remaining_minor')::bigint), 0)::bigint AS remaining_cash_minor,
      coalesce(sum((summary->>'visa_confirmed_minor')::bigint), 0)::bigint AS confirmed_visa_minor,
      coalesce(sum((summary->>'visa_scheduled_through_today_minor')::bigint), 0)::bigint AS scheduled_visa_today_minor,
      coalesce(sum((summary->>'visa_overdue_unconfirmed_minor')::bigint), 0)::bigint AS overdue_unconfirmed_visa_minor,
      coalesce(sum((summary->>'visa_future_scheduled_minor')::bigint), 0)::bigint AS future_scheduled_visa_minor,
      coalesce(sum((summary->>'currently_due_unconfirmed_minor')::bigint), 0)::bigint AS currently_due_unconfirmed_minor,
      coalesce(sum((summary->>'confirmed_total_minor')::bigint), 0)::bigint AS confirmed_total_minor,
      coalesce(sum((summary->>'total_unpaid_minor')::bigint), 0)::bigint AS total_unpaid_minor,
      coalesce(sum((summary->>'total_unpaid_minor')::bigint) FILTER (WHERE summary->>'derived_payment_status' = 'partial'), 0)::bigint AS partial_unpaid_minor,
      coalesce(sum((summary->>'total_unpaid_minor')::bigint) FILTER (WHERE summary->>'derived_payment_status' = 'unpaid'), 0)::bigint AS unpaid_unpaid_minor,
      count(*) FILTER (WHERE summary->>'derived_payment_status' = 'paid')::integer AS paid_count,
      count(*) FILTER (WHERE summary->>'derived_payment_status' = 'partial')::integer AS partial_count,
      count(*) FILTER (WHERE summary->>'derived_payment_status' = 'unpaid')::integer AS unpaid_count
    FROM filtered
    GROUP BY currency
  ), totals AS (
    SELECT
      coalesce(sum(confirmed_cash_minor), 0)::bigint AS confirmed_cash_minor,
      coalesce(sum(remaining_cash_minor), 0)::bigint AS remaining_cash_minor,
      coalesce(sum(confirmed_visa_minor), 0)::bigint AS confirmed_visa_minor,
      coalesce(sum(scheduled_visa_today_minor), 0)::bigint AS scheduled_visa_today_minor,
      coalesce(sum(overdue_unconfirmed_visa_minor), 0)::bigint AS overdue_unconfirmed_visa_minor,
      coalesce(sum(future_scheduled_visa_minor), 0)::bigint AS future_scheduled_visa_minor,
      coalesce(sum(currently_due_unconfirmed_minor), 0)::bigint AS currently_due_unconfirmed_minor,
      coalesce(sum(confirmed_total_minor), 0)::bigint AS confirmed_total_minor,
      coalesce(sum(total_unpaid_minor), 0)::bigint AS total_unpaid_minor,
      coalesce(sum(partial_unpaid_minor), 0)::bigint AS partial_unpaid_minor,
      coalesce(sum(unpaid_unpaid_minor), 0)::bigint AS unpaid_unpaid_minor,
      coalesce(sum(paid_count), 0)::integer AS paid_count,
      coalesce(sum(partial_count), 0)::integer AS partial_count,
      coalesce(sum(unpaid_count), 0)::integer AS unpaid_count
    FROM currency_aggregates
  )
  SELECT jsonb_build_object(
    'currency_mode', CASE WHEN (SELECT count(*) FROM currency_aggregates) > 1 THEN 'grouped_only' ELSE 'single' END,
    'summary', jsonb_build_object(
      'counts', jsonb_build_object('paid', paid_count, 'partial', partial_count, 'unpaid', unpaid_count),
      'amounts', jsonb_build_object('paid', confirmed_total_minor / 100.0, 'partial_remaining', partial_unpaid_minor / 100.0, 'unpaid_remaining', unpaid_unpaid_minor / 100.0),
      'confirmed_cash', confirmed_cash_minor / 100.0,
      'remaining_cash', remaining_cash_minor / 100.0,
      'confirmed_visa', confirmed_visa_minor / 100.0,
      'scheduled_visa_today', scheduled_visa_today_minor / 100.0,
      'overdue_unconfirmed_visa', overdue_unconfirmed_visa_minor / 100.0,
      'future_scheduled_visa', future_scheduled_visa_minor / 100.0,
      'currently_due_unconfirmed', currently_due_unconfirmed_minor / 100.0,
      'confirmed_total', confirmed_total_minor / 100.0,
      'total_unpaid', total_unpaid_minor / 100.0
    ),
    'currency_totals', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'currency', currency,
      'trip_count', trip_count,
      'sales', sales_minor / 100.0,
      'confirmed_cash', confirmed_cash_minor / 100.0,
      'remaining_cash', remaining_cash_minor / 100.0,
      'confirmed_visa', confirmed_visa_minor / 100.0,
      'scheduled_visa_today', scheduled_visa_today_minor / 100.0,
      'overdue_unconfirmed_visa', overdue_unconfirmed_visa_minor / 100.0,
      'future_scheduled_visa', future_scheduled_visa_minor / 100.0,
      'currently_due_unconfirmed', currently_due_unconfirmed_minor / 100.0,
      'paid', confirmed_total_minor / 100.0,
      'outstanding', total_unpaid_minor / 100.0
    ) ORDER BY currency) FROM currency_aggregates), '[]'::jsonb)
  ) INTO v_result
  FROM totals;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_travel_payment_analytics(text,integer,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_payment_analytics(text,integer,text,text,text,date,date) TO authenticated;

COMMENT ON FUNCTION public.get_travel_payment_analytics(text,integer,text,text,text,date,date) IS
  'Returns canonical Cash and Visa receipt analytics, grouped by stored currency without inventing exchange-rate conversion.';

NOTIFY pgrst, 'reload schema';
