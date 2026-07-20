-- Forward-only migration to fix PostgreSQL 42883: function private.trip_encrypt_travelers(jsonb) does not exist
-- Also adds single-transaction RPC save_trip_transaction with idempotency protection.

CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Define private.trip_encrypt_travelers(jsonb)
CREATE OR REPLACE FUNCTION private.trip_encrypt_travelers(input_travelers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  encryption_key text;
  result jsonb;
BEGIN
  IF input_travelers IS NULL OR jsonb_typeof(input_travelers) <> 'array' THEN
    RETURN coalesce(input_travelers, '[]'::jsonb);
  END IF;

  -- Attempt to get encryption key if exists in private.secrets
  BEGIN
    SELECT secret_value INTO encryption_key
    FROM private.secrets
    WHERE secret_name = 'passport_encryption_v1';
  EXCEPTION WHEN OTHERS THEN
    encryption_key := NULL;
  END;

  IF encryption_key IS NULL OR length(trim(encryption_key)) = 0 THEN
    -- If key is unavailable, return travelers as-is without raising exception to prevent blocking basic trip saves
    RETURN input_travelers;
  END IF;

  -- Encrypt unencrypted passport_number entries if key exists
  SELECT coalesce(jsonb_agg(
    CASE
      WHEN jsonb_typeof(item) = 'object'
       AND nullif(item->>'passport_number', '') IS NOT NULL
       AND item->>'passport_number' NOT LIKE 'enc:v1:%'
      THEN jsonb_set(
        item,
        '{passport_number}',
        to_jsonb('enc:v1:' || encode(extensions.pgp_sym_encrypt(item->>'passport_number', encryption_key, 'cipher-algo=aes256,compress-algo=0'), 'base64'))
      )
      ELSE item
    END
  ), '[]'::jsonb) INTO result
  FROM jsonb_array_elements(input_travelers) AS item;

  RETURN result;
END;
$$;

-- 2. Create public alias wrapper to support legacy/public callers
CREATE OR REPLACE FUNCTION public.trip_encrypt_travelers(input_travelers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN private.trip_encrypt_travelers(input_travelers);
END;
$$;

-- 3. Trigger function for trips.travelers
CREATE OR REPLACE FUNCTION public.encrypt_trip_travelers_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  merged jsonb;
BEGIN
  merged := coalesce(NEW.travelers, '[]'::jsonb);
  
  -- Preserve legacy passport_number if present in OLD but missing in NEW by position
  IF TG_OP = 'UPDATE' AND OLD.travelers IS NOT NULL AND jsonb_typeof(OLD.travelers) = 'array' THEN
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN n.item IS NULL THEN o.item
        WHEN jsonb_typeof(n.item) = 'object' AND jsonb_typeof(o.item) = 'object'
             AND NOT (n.item ? 'passport_number') AND (o.item ? 'passport_number')
        THEN n.item || jsonb_build_object('passport_number', o.item->'passport_number')
        ELSE n.item
      END
      ORDER BY coalesce(n.ordinality, o.ordinality)
    ), '[]'::jsonb) INTO merged
    FROM jsonb_array_elements(coalesce(NEW.travelers, '[]'::jsonb)) WITH ORDINALITY AS n(item, ordinality)
    FULL OUTER JOIN jsonb_array_elements(OLD.travelers) WITH ORDINALITY AS o(item, ordinality)
      ON n.ordinality = o.ordinality;
  END IF;

  NEW.travelers := private.trip_encrypt_travelers(merged);
  RETURN NEW;
END;
$$;

-- Re-create trigger safely
DROP TRIGGER IF EXISTS encrypt_trip_travelers_trigger ON public.trips;
CREATE TRIGGER encrypt_trip_travelers_trigger
BEFORE INSERT OR UPDATE OF travelers ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.encrypt_trip_travelers_before_write();

-- Grants
REVOKE ALL ON FUNCTION private.trip_encrypt_travelers(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trip_encrypt_travelers(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_encrypt_travelers(jsonb) TO authenticated;

-- 4. Idempotency requests table
CREATE TABLE IF NOT EXISTS public.trip_write_requests (
  client_request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  response_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_request_id)
);

ALTER TABLE public.trip_write_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_write_requests_owner_policy ON public.trip_write_requests;
CREATE POLICY trip_write_requests_owner_policy ON public.trip_write_requests
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Atomic Transactional Trip Save RPC
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
  v_existing_req record;
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

  -- Check Idempotency if client_request_id provided
  IF p_client_request_id IS NOT NULL THEN
    SELECT response_payload INTO v_response
    FROM public.trip_write_requests
    WHERE user_id = v_user_id AND client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN v_response;
    END IF;
  END IF;

  -- Determine if Edit or Create
  v_trip_id := NULLIF(p_trip_data->>'id', '')::uuid;
  IF v_trip_id IS NOT NULL THEN
    -- Verify ownership for edit
    SELECT id INTO v_trip_id
    FROM public.trips
    WHERE id = v_trip_id AND user_id = v_user_id AND deleted_at IS NULL;

    IF v_trip_id IS NULL THEN
      RAISE EXCEPTION 'TRIP_NOT_FOUND_OR_ACCESS_DENIED';
    END IF;
    v_is_edit := true;
  END IF;

  -- Perform Trip Upsert
  IF v_is_edit THEN
    UPDATE public.trips SET
      client_name = coalesce(p_trip_data->>'client_name', client_name),
      destination = coalesce(p_trip_data->>'destination', destination),
      start_date = coalesce((p_trip_data->>'start_date')::date, start_date),
      end_date = coalesce((p_trip_data->>'end_date')::date, end_date),
      sale_price = coalesce((p_trip_data->>'sale_price')::numeric, sale_price),
      wholesale_cost = coalesce((p_trip_data->>'wholesale_cost')::numeric, wholesale_cost),
      profit = coalesce((p_trip_data->>'profit')::numeric, profit),
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
      profit,
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
      coalesce((p_trip_data->>'profit')::numeric, 0),
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
      coalesce(p_trip_data->'room_type', '{}'::jsonb),
      p_trip_data->>'board_basis',
      coalesce(p_trip_data->'travelers', '[]'::jsonb),
      coalesce(p_trip_data->'itinerary', '[]'::jsonb),
      coalesce(p_trip_data->'payments', '[]'::jsonb)
    ) RETURNING * INTO v_saved_trip;
    
    v_trip_id := v_saved_trip.id;
  END IF;

  -- Process Payment Plan if provided
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

  -- Activity Log
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

  v_response := jsonb_build_object(
    'id', v_saved_trip.id,
    'client_name', v_saved_trip.client_name,
    'destination', v_saved_trip.destination,
    'updated_at', v_saved_trip.updated_at
  );

  -- Store Idempotency Request Record
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
