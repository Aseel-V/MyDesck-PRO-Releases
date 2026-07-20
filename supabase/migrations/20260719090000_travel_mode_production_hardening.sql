-- Travel Mode production hardening for the existing single-user ownership model.
-- Rollback note: application code can stop using these RPCs without data loss. Do not
-- drop the private key or encrypted traveler values until passports have been decrypted
-- through trip_decrypt_travelers during a controlled rollback.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.travel_mode_secrets (
  secret_name text PRIMARY KEY,
  secret_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.travel_mode_secrets FROM PUBLIC, anon, authenticated;

INSERT INTO private.travel_mode_secrets (secret_name, secret_value)
VALUES ('passport_encryption_v1', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (secret_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trip_encrypt_travelers(input_travelers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  encryption_key text;
  result jsonb;
BEGIN
  IF input_travelers IS NULL OR jsonb_typeof(input_travelers) <> 'array' THEN
    RETURN COALESCE(input_travelers, '[]'::jsonb);
  END IF;

  SELECT secret_value INTO encryption_key
  FROM private.travel_mode_secrets
  WHERE secret_name = 'passport_encryption_v1';

  IF encryption_key IS NULL THEN
    RAISE EXCEPTION 'Travel PII encryption key is unavailable';
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN jsonb_typeof(item) = 'object'
        AND NULLIF(item->>'passport_number', '') IS NOT NULL
        AND item->>'passport_number' NOT LIKE 'enc:v1:%'
      THEN jsonb_set(
        item,
        '{passport_number}',
        to_jsonb('enc:v1:' || encode(
          pgp_sym_encrypt(item->>'passport_number', encryption_key, 'cipher-algo=aes256,compress-algo=0'),
          'base64'
        ))
      )
      ELSE item
    END
  ), '[]'::jsonb) INTO result
  FROM jsonb_array_elements(input_travelers) AS item;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.trip_decrypt_travelers(input_travelers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  encryption_key text;
  result jsonb;
BEGIN
  IF input_travelers IS NULL OR jsonb_typeof(input_travelers) <> 'array' THEN
    RETURN COALESCE(input_travelers, '[]'::jsonb);
  END IF;

  SELECT secret_value INTO encryption_key
  FROM private.travel_mode_secrets
  WHERE secret_name = 'passport_encryption_v1';

  IF encryption_key IS NULL THEN
    RAISE EXCEPTION 'Travel PII encryption key is unavailable';
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN jsonb_typeof(item) = 'object' AND item->>'passport_number' LIKE 'enc:v1:%'
      THEN jsonb_set(
        item,
        '{passport_number}',
        to_jsonb(pgp_sym_decrypt(
          decode(substr(item->>'passport_number', 8), 'base64'),
          encryption_key
        ))
      )
      ELSE item
    END
  ), '[]'::jsonb) INTO result
  FROM jsonb_array_elements(input_travelers) AS item;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.trip_encrypt_travelers(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trip_decrypt_travelers(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.encrypt_trip_travelers_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  NEW.travelers := public.trip_encrypt_travelers(NEW.travelers);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_trip_travelers_trigger ON public.trips;
CREATE TRIGGER encrypt_trip_travelers_trigger
BEFORE INSERT OR UPDATE OF travelers ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.encrypt_trip_travelers_before_write();

-- Safe, idempotent conversion of existing plaintext passport values.
UPDATE public.trips
SET travelers = public.trip_encrypt_travelers(travelers)
WHERE travelers IS NOT NULL
  AND jsonb_typeof(travelers) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(travelers) AS traveler
    WHERE NULLIF(traveler->>'passport_number', '') IS NOT NULL
      AND traveler->>'passport_number' NOT LIKE 'enc:v1:%'
  );

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Permanent deletion is reserved for the retention purge function below.
REVOKE DELETE ON public.trips FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trip_traveler_names(input_travelers jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(string_agg(item->>'full_name', ' '), '')
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(input_travelers) = 'array' THEN input_travelers ELSE '[]'::jsonb END
  ) AS item;
$$;

REVOKE ALL ON FUNCTION public.trip_traveler_names(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_traveler_names(jsonb) TO authenticated;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS search_document text GENERATED ALWAYS AS (
    lower(
      coalesce(destination, '') || ' ' ||
      coalesce(client_name, '') || ' ' ||
      public.trip_traveler_names(travelers) || ' ' ||
      coalesce(hotel_name, '') || ' ' ||
      coalesce(status, '') || ' ' ||
      coalesce(payment_status, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS trips_active_page_idx
  ON public.trips (user_id, start_date DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS trips_deleted_idx
  ON public.trips (user_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS trips_active_status_idx
  ON public.trips (user_id, status, payment_status, start_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS trips_search_document_trgm_idx
  ON public.trips USING gin (search_document gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.trip_financial_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_field text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  operation_type text NOT NULL CHECK (operation_type IN ('insert', 'update'))
);

CREATE INDEX IF NOT EXISTS trip_financial_audit_trip_idx
  ON public.trip_financial_audit (trip_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS trip_financial_audit_user_idx
  ON public.trip_financial_audit (user_id, changed_at DESC);

ALTER TABLE public.trip_financial_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own trip financial audit" ON public.trip_financial_audit;
CREATE POLICY "Users can view own trip financial audit"
ON public.trip_financial_audit FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.trip_financial_audit FROM anon, authenticated;
GRANT SELECT ON public.trip_financial_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_trip_financial_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  field_name text;
  old_data jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  new_data jsonb := to_jsonb(NEW);
  audited_fields constant text[] := ARRAY[
    'sale_price', 'wholesale_cost', 'amount_paid', 'payments',
    'payment_status', 'currency', 'exchange_rate',
    'card_paid_amount', 'cash_paid_amount'
  ];
BEGIN
  FOREACH field_name IN ARRAY audited_fields LOOP
    IF TG_OP = 'INSERT' OR old_data->field_name IS DISTINCT FROM new_data->field_name THEN
      INSERT INTO public.trip_financial_audit (
        trip_id, user_id, changed_field, previous_value, new_value, operation_type
      ) VALUES (
        NEW.id,
        NEW.user_id,
        field_name,
        CASE WHEN TG_OP = 'UPDATE' THEN old_data->field_name ELSE NULL END,
        new_data->field_name,
        lower(TG_OP)
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_financial_audit_trigger ON public.trips;
CREATE TRIGGER trip_financial_audit_trigger
AFTER INSERT OR UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.audit_trip_financial_changes();

CREATE TABLE IF NOT EXISTS public.trip_attachment_cleanup_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS trip_attachment_cleanup_pending_idx
  ON public.trip_attachment_cleanup_queue (status, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.trip_attachment_cleanup_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own attachment cleanup status" ON public.trip_attachment_cleanup_queue;
CREATE POLICY "Users can view own attachment cleanup status"
ON public.trip_attachment_cleanup_queue FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.trip_attachment_cleanup_queue FROM anon, authenticated;
GRANT SELECT ON public.trip_attachment_cleanup_queue TO authenticated;

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

REVOKE ALL ON FUNCTION public.get_trip_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated;

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
    SELECT *
    FROM filtered
    ORDER BY start_date DESC NULLS LAST, created_at DESC, id DESC
    LIMIT LEAST(GREATEST(p_page_size, 1), 100)
    OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100)
  ),
  currency_summary AS (
    SELECT
      coalesce(currency, 'ILS') AS currency,
      count(*) AS trip_count,
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
      )
      FROM paged AS p
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

REVOKE ALL ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_page(text, integer, integer, text, text, text, integer, text) TO authenticated;

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

REVOKE ALL ON FUNCTION public.get_trip_dashboard_items(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_dashboard_items(text) TO authenticated;

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

-- Retention/purge entry point. Only service_role may hard-delete and queue storage cleanup.
CREATE OR REPLACE FUNCTION public.purge_deleted_trips(p_retention_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  purged_count integer;
BEGIN
  WITH queued AS (
    INSERT INTO public.trip_attachment_cleanup_queue (trip_id, user_id, attachments)
    SELECT id, user_id, attachments
    FROM public.trips
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - make_interval(days => GREATEST(p_retention_days, 1))
    RETURNING trip_id
  ), deleted AS (
    DELETE FROM public.trips
    WHERE id IN (SELECT trip_id FROM queued)
    RETURNING id
  )
  SELECT count(*) INTO purged_count FROM deleted;

  RETURN purged_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_deleted_trips(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_trips(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_trip_attachment_cleanup(p_limit integer DEFAULT 20)
RETURNS SETOF public.trip_attachment_cleanup_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM public.trip_attachment_cleanup_queue AS q
    WHERE q.status IN ('pending', 'failed')
      AND q.attempts < 10
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.trip_attachment_cleanup_queue AS q
  SET status = 'processing', attempts = q.attempts + 1, last_error = NULL
  FROM candidates
  WHERE q.id = candidates.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_trip_attachment_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trip_attachment_cleanup(integer) TO service_role;
