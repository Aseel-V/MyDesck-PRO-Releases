-- Forward-only migration to fix PostgreSQL 428C9: cannot insert a non-DEFAULT value into column "profit"
-- Excludes generated and database-managed columns (profit, profit_percentage, amount_due, search_document, created_at)
-- from INSERT and UPDATE operations in public.save_trip_transaction.

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
  v_currency text;
  v_installment_count int;
  v_first_date date;
  v_plan_id uuid;
  v_installment_amount bigint;
  v_last_installment_amount bigint;
  v_curr_date date;
  v_idx int;
  v_response jsonb;
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

  -- 3. Perform Trip Upsert
  -- NOTE: profit, profit_percentage, amount_due, search_document, created_at ARE EXCLUDED
  -- as they are database-managed or GENERATED ALWAYS columns.
  IF v_is_edit THEN
    UPDATE public.trips SET
      client_name = coalesce(p_trip_data->>'client_name', client_name),
      destination = coalesce(p_trip_data->>'destination', destination),
      start_date = coalesce((p_trip_data->>'start_date')::date, start_date),
      end_date = coalesce((p_trip_data->>'end_date')::date, end_date),
      sale_price = coalesce((p_trip_data->>'sale_price')::numeric, sale_price),
      wholesale_cost = coalesce((p_trip_data->>'wholesale_cost')::numeric, wholesale_cost),
      status = coalesce(p_trip_data->>'status', status),
      payment_status = coalesce(p_trip_data->>'payment_status', payment_status),
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
      wholesale_currency = p_trip_data->>'wholesale_currency',
      sale_original_amount = (p_trip_data->>'sale_original_amount')::numeric,
      sale_currency = p_trip_data->>'sale_currency',
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
      sale_price,
      wholesale_cost,
      status,
      payment_status,
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
      coalesce((p_trip_data->>'sale_price')::numeric, 0),
      coalesce((p_trip_data->>'wholesale_cost')::numeric, 0),
      coalesce(p_trip_data->>'status', 'active'),
      coalesce(p_trip_data->>'payment_status', 'unpaid'),
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
      (p_trip_data->>'wholesale_original_amount')::numeric,
      p_trip_data->>'wholesale_currency',
      (p_trip_data->>'sale_original_amount')::numeric,
      p_trip_data->>'sale_currency',
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
    v_currency := coalesce(p_payment_plan->>'currency', 'ILS');
    v_card_total_minor := coalesce((p_payment_plan->>'cardTotalMinor')::bigint, 0);
    v_cash_total_minor := coalesce((p_payment_plan->>'cashTotalMinor')::bigint, 0);
    v_installment_count := coalesce((p_payment_plan->>'installmentCount')::int, 1);
    v_first_date := coalesce((p_payment_plan->>'firstDate')::date, CURRENT_DATE);

    IF v_payment_method IN ('card', 'mixed') THEN
      IF v_card_total_minor <= 0 OR v_installment_count <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_PLAN_CARD_PARAMETERS';
      END IF;

      -- Upsert Payment Plan
      INSERT INTO public.trip_payment_plans (
        trip_id,
        user_id,
        payment_method,
        currency,
        card_total_minor,
        cash_total_minor,
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
        v_installment_count,
        v_first_date,
        'active',
        'app'
      )
      ON CONFLICT (trip_id) DO UPDATE SET
        payment_method = EXCLUDED.payment_method,
        currency = EXCLUDED.currency,
        card_total_minor = EXCLUDED.card_total_minor,
        cash_total_minor = EXCLUDED.cash_total_minor,
        installment_count = EXCLUDED.installment_count,
        first_installment_date = EXCLUDED.first_installment_date,
        updated_at = now()
      RETURNING id INTO v_plan_id;

      -- Delete existing non-paid installments for fresh schedule sync
      DELETE FROM public.trip_installments
      WHERE payment_plan_id = v_plan_id AND status = 'pending';

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
          amount_minor,
          status,
          currency
        ) VALUES (
          v_plan_id,
          v_trip_id,
          v_user_id,
          v_idx,
          v_curr_date,
          CASE WHEN v_idx = v_installment_count THEN v_last_installment_amount ELSE v_installment_amount END,
          'pending',
          v_currency
        );
      END LOOP;

    ELSIF v_payment_method = 'cash' THEN
      -- Cash plan
      INSERT INTO public.trip_payment_plans (
        trip_id,
        user_id,
        payment_method,
        currency,
        card_total_minor,
        cash_total_minor,
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
        0,
        'active',
        'app'
      )
      ON CONFLICT (trip_id) DO UPDATE SET
        payment_method = 'cash',
        cash_total_minor = EXCLUDED.cash_total_minor,
        card_total_minor = 0,
        installment_count = 0,
        updated_at = now();
    END IF;
  END IF;

  -- 5. Activity Log
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

  -- 6. Response Payload (includes database-computed profit)
  v_response := jsonb_build_object(
    'id', v_saved_trip.id,
    'client_name', v_saved_trip.client_name,
    'destination', v_saved_trip.destination,
    'profit', v_saved_trip.profit,
    'profit_percentage', v_saved_trip.profit_percentage,
    'updated_at', v_saved_trip.updated_at
  );

  -- 7. Store Idempotency Request Record
  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.trip_write_requests (user_id, client_request_id, trip_id, response_payload)
    VALUES (v_user_id, p_client_request_id, v_saved_trip.id, v_response)
    ON CONFLICT (user_id, client_request_id) DO NOTHING;
  END IF;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_trip_transaction(jsonb, jsonb, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
