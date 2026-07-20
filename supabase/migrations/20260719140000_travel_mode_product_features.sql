-- Additive Travel Mode product infrastructure. No auth.users or existing trip rows are modified.
-- Apply after 20260719090000 and 20260719130000.
-- Rollback: stop clients/jobs first, then drop the new functions/tables. Added cleanup columns may remain safely.

ALTER TABLE public.trip_attachment_cleanup_queue
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS trip_cleanup_retry_idx
  ON public.trip_attachment_cleanup_queue (next_retry_at, created_at)
  WHERE status IN ('pending', 'failed') AND attempts < 10;

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
      AND q.next_retry_at <= now()
    ORDER BY q.next_retry_at, q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.trip_attachment_cleanup_queue AS q
  SET status = 'processing',
      attempts = q.attempts + 1,
      last_error = NULL,
      last_attempted_at = now(),
      next_retry_at = now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(q.attempts, 7))))
  FROM candidates
  WHERE q.id = candidates.id
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_trip_attachment_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trip_attachment_cleanup(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_trip_attachment_cleanup(p_job_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.trip_attachment_cleanup_queue
  SET status = 'pending', next_retry_at = now(), last_error = NULL
  WHERE id = p_job_id
    AND user_id = auth.uid()
    AND status = 'failed'
    AND attempts < 10;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_trip_attachment_cleanup(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_trip_attachment_cleanup(bigint) TO authenticated;

ALTER TABLE public.trip_financial_audit
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

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
    'sale_price', 'wholesale_cost', 'amount_paid', 'payments', 'payment_status',
    'currency', 'exchange_rate', 'card_paid_amount', 'cash_paid_amount'
  ];
BEGIN
  FOREACH field_name IN ARRAY audited_fields LOOP
    IF TG_OP = 'INSERT' OR old_data->field_name IS DISTINCT FROM new_data->field_name THEN
      INSERT INTO public.trip_financial_audit
        (trip_id, user_id, actor_user_id, changed_field, previous_value, new_value, operation_type)
      VALUES
        (NEW.id, NEW.user_id, auth.uid(), field_name,
         CASE WHEN TG_OP = 'UPDATE' THEN old_data->field_name ELSE NULL END,
         new_data->field_name, lower(TG_OP));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.trip_activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_activity_safe_metadata CHECK (
    metadata::text !~* 'passport|encryption|storage_path|https?://|attachment_url'
  )
);
CREATE INDEX IF NOT EXISTS trip_activity_trip_idx ON public.trip_activity_log (trip_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS trip_activity_user_idx ON public.trip_activity_log (user_id, created_at DESC);
ALTER TABLE public.trip_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own trip activity" ON public.trip_activity_log;
CREATE POLICY "Users read own trip activity" ON public.trip_activity_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.trip_activity_log FROM anon, authenticated;
GRANT SELECT ON public.trip_activity_log TO authenticated;

CREATE OR REPLACE FUNCTION public.record_trip_activity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  event_type text;
  safe_metadata jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_type := 'trip_created';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    event_type := 'trip_soft_deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    event_type := 'trip_restored';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    event_type := CASE WHEN NEW.status = 'archived' THEN 'trip_archived' ELSE 'trip_status_changed' END;
    safe_metadata := jsonb_build_object('previous_status', OLD.status, 'new_status', NEW.status);
  ELSIF OLD.payments IS DISTINCT FROM NEW.payments OR OLD.amount_paid IS DISTINCT FROM NEW.amount_paid THEN
    event_type := 'payment_changed';
  ELSE
    event_type := 'trip_edited';
  END IF;

  INSERT INTO public.trip_activity_log (trip_id, user_id, actor_user_id, activity_type, metadata)
  VALUES (NEW.id, NEW.user_id, auth.uid(), event_type, safe_metadata);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trip_activity_trigger ON public.trips;
CREATE TRIGGER trip_activity_trigger
AFTER INSERT OR UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.record_trip_activity_trigger();

CREATE OR REPLACE FUNCTION public.log_trip_activity(
  p_trip_id uuid,
  p_activity_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result_id bigint;
BEGIN
  IF p_activity_type NOT IN (
    'pdf_generated', 'export_created', 'trip_duplicated', 'created_from_template',
    'notification_sent', 'whatsapp_prepared', 'attachment_uploaded', 'cleanup_retried'
  ) THEN RAISE EXCEPTION 'Unsupported activity type'; END IF;
  IF p_metadata::text ~* 'passport|encryption|storage_path|https?://|attachment_url' THEN
    RAISE EXCEPTION 'Unsafe activity metadata';
  END IF;
  INSERT INTO public.trip_activity_log (trip_id, user_id, actor_user_id, activity_type, metadata)
  SELECT t.id, t.user_id, auth.uid(), p_activity_type, coalesce(p_metadata, '{}'::jsonb)
  FROM public.trips AS t WHERE t.id = p_trip_id AND t.user_id = auth.uid()
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_trip_activity(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_trip_activity(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_activity_page(
  p_trip_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25, p_type text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id DESC), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM public.trip_activity_log c
      WHERE c.trip_id = p_trip_id AND c.user_id = auth.uid()
        AND (NULLIF(p_type, '') IS NULL OR c.activity_type = p_type))
  )
  FROM (
    SELECT * FROM public.trip_activity_log
    WHERE trip_id = p_trip_id AND user_id = auth.uid()
      AND (NULLIF(p_type, '') IS NULL OR activity_type = p_type)
    ORDER BY created_at DESC, id DESC
    LIMIT LEAST(GREATEST(p_page_size, 1), 100)
    OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100)
  ) a;
$$;
REVOKE ALL ON FUNCTION public.get_trip_activity_page(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_activity_page(uuid, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_financial_audit_page(
  p_trip_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.changed_at DESC, a.id DESC), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM public.trip_financial_audit c
      WHERE c.trip_id = p_trip_id AND c.user_id = auth.uid())
  )
  FROM (
    SELECT id, trip_id, user_id, actor_user_id, changed_at, changed_field, previous_value, new_value, operation_type
    FROM public.trip_financial_audit
    WHERE trip_id = p_trip_id AND user_id = auth.uid()
    ORDER BY changed_at DESC, id DESC
    LIMIT LEAST(GREATEST(p_page_size, 1), 100)
    OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100)
  ) a;
$$;
REVOKE ALL ON FUNCTION public.get_trip_financial_audit_page(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_financial_audit_page(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_deleted_trips_page(
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 24, p_search text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH filtered AS MATERIALIZED (
    SELECT t.* FROM public.trips t
    WHERE t.user_id = auth.uid() AND t.deleted_at IS NOT NULL
      AND (NULLIF(trim(p_search), '') IS NULL OR t.search_document LIKE '%' || lower(trim(p_search)) || '%')
  ), paged AS (
    SELECT * FROM filtered ORDER BY deleted_at DESC, id DESC
    LIMIT LEAST(GREATEST(p_page_size, 1), 100)
    OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(
      (to_jsonb(p) - ARRAY['travelers','itinerary','payments','notes','attachments','search_document']) ||
      jsonb_build_object(
        'purge_at', p.deleted_at + interval '30 days',
        'cleanup_status', (SELECT q.status FROM public.trip_attachment_cleanup_queue q
          WHERE q.trip_id = p.id AND q.user_id = auth.uid() ORDER BY q.created_at DESC LIMIT 1)
      ) ORDER BY p.deleted_at DESC, p.id DESC
    ) FROM paged p), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM filtered)
  );
$$;
REVOKE ALL ON FUNCTION public.get_deleted_trips_page(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deleted_trips_page(integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_deleted_trips(p_trip_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.trips SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE id = ANY(p_trip_ids) AND user_id = auth.uid() AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_deleted_trips(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_trips(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.permanently_delete_trips(p_trip_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  INSERT INTO public.trip_activity_log (trip_id, user_id, actor_user_id, activity_type)
  SELECT id, user_id, auth.uid(), 'trip_permanently_deleted' FROM public.trips
  WHERE id = ANY(p_trip_ids) AND user_id = auth.uid() AND deleted_at IS NOT NULL;
  INSERT INTO public.trip_attachment_cleanup_queue (trip_id, user_id, attachments)
  SELECT id, user_id, attachments FROM public.trips
  WHERE id = ANY(p_trip_ids) AND user_id = auth.uid() AND deleted_at IS NOT NULL;
  DELETE FROM public.trips
  WHERE id = ANY(p_trip_ids) AND user_id = auth.uid() AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.permanently_delete_trips(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_trips(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.trip_template_payload_is_safe(payload jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT coalesce(payload::text !~* '"(passport_number|client_phone|payments|attachments|travelers|audit|user_id)"\s*:', true);
$$;

CREATE TABLE IF NOT EXISTS public.trip_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (public.trip_template_payload_is_safe(template_data)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_templates_user_idx ON public.trip_templates (user_id, status, updated_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE public.trip_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own trip templates" ON public.trip_templates;
CREATE POLICY "Users manage own trip templates" ON public.trip_templates FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.trip_templates TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  upcoming_enabled boolean NOT NULL DEFAULT true,
  upcoming_days integer NOT NULL DEFAULT 7 CHECK (upcoming_days BETWEEN 1 AND 90),
  payment_enabled boolean NOT NULL DEFAULT true,
  cleanup_enabled boolean NOT NULL DEFAULT true,
  retention_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own trip notification settings" ON public.trip_notification_settings;
CREATE POLICY "Users manage own trip notification settings" ON public.trip_notification_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.trip_notification_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid,
  notification_type text NOT NULL,
  title_key text NOT NULL,
  body_key text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (params::text !~* 'passport|https?://|storage_path'),
  dedupe_key text NOT NULL,
  read_at timestamptz,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS trip_notifications_unread_idx ON public.trip_notifications (user_id, created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.trip_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own trip notifications" ON public.trip_notifications;
CREATE POLICY "Users read own trip notifications" ON public.trip_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users mark own trip notifications read" ON public.trip_notifications;
CREATE POLICY "Users mark own trip notifications read" ON public.trip_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE INSERT, DELETE ON public.trip_notifications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.trip_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_trip_notifications(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.trip_notifications
    (user_id, trip_id, notification_type, title_key, body_key, params, dedupe_key, scheduled_for)
  SELECT source.user_id, source.trip_id, source.notification_type, source.title_key, source.body_key,
         source.params, source.dedupe_key, p_now
  FROM (
    SELECT t.user_id, t.id AS trip_id, 'upcoming_trip'::text AS notification_type,
      'notifications.travel.upcomingTitle'::text AS title_key,
      'notifications.travel.upcomingBody'::text AS body_key,
      jsonb_build_object('destination', t.destination, 'startDate', t.start_date) AS params,
      'upcoming:' || t.id || ':' || t.start_date::text AS dedupe_key
    FROM public.trips t
    JOIN public.trip_notification_settings s ON s.user_id = t.user_id AND s.upcoming_enabled
    WHERE t.deleted_at IS NULL AND t.status = 'active'
      AND t.start_date >= (p_now AT TIME ZONE s.timezone)::date
      AND t.start_date <= (p_now AT TIME ZONE s.timezone)::date + s.upcoming_days
    UNION ALL
    SELECT t.user_id, t.id, 'outstanding_payment', 'notifications.travel.paymentTitle',
      'notifications.travel.paymentBody',
      jsonb_build_object('destination', t.destination, 'amountDue', t.amount_due, 'currency', t.currency),
      'payment:' || t.id || ':' || p_now::date::text
    FROM public.trips t
    JOIN public.trip_notification_settings s ON s.user_id = t.user_id AND s.payment_enabled
    WHERE t.deleted_at IS NULL AND t.status NOT IN ('cancelled','archived') AND t.amount_due > 0
    UNION ALL
    SELECT t.user_id, t.id, 'payment_overdue', 'notifications.travel.overdueTitle',
      'notifications.travel.overdueBody',
      jsonb_build_object('destination', t.destination, 'amountDue', t.amount_due, 'currency', t.currency),
      'overdue:' || t.id || ':' || p_now::date::text
    FROM public.trips t
    JOIN public.trip_notification_settings s ON s.user_id = t.user_id AND s.payment_enabled
    WHERE t.deleted_at IS NULL AND t.status NOT IN ('cancelled','archived') AND t.amount_due > 0
      AND t.payment_date IS NOT NULL AND t.payment_date < p_now::date
    UNION ALL
    SELECT t.user_id, t.id, 'missing_critical_data', 'notifications.travel.missingTitle',
      'notifications.travel.missingBody', jsonb_build_object('destination', t.destination),
      'missing:' || t.id || ':' || t.updated_at::date::text
    FROM public.trips t
    WHERE t.deleted_at IS NULL AND t.status = 'active'
      AND (trim(t.destination) = '' OR trim(t.client_name) = '' OR t.start_date IS NULL OR t.end_date IS NULL
        OR (t.service_type IN ('hotel','both') AND coalesce(trim(t.hotel_name), '') = ''))
    UNION ALL
    SELECT a.user_id, a.trip_id, 'trip_changed', 'notifications.travel.changedTitle',
      'notifications.travel.changedBody', '{}'::jsonb, 'changed:' || a.id
    FROM public.trip_activity_log a
    WHERE a.activity_type IN ('trip_edited','trip_status_changed','payment_changed')
      AND a.created_at BETWEEN p_now - interval '1 hour' AND p_now
    UNION ALL
    SELECT q.user_id, q.trip_id, 'attachment_cleanup_failure', 'notifications.travel.cleanupTitle',
      'notifications.travel.cleanupBody', '{}'::jsonb,
      'cleanup:' || q.id || ':' || q.attempts
    FROM public.trip_attachment_cleanup_queue q
    JOIN public.trip_notification_settings s ON s.user_id = q.user_id AND s.cleanup_enabled
    WHERE q.status = 'failed' AND q.attempts < 10
    UNION ALL
    SELECT t.user_id, t.id, 'retention_deadline', 'notifications.travel.retentionTitle',
      'notifications.travel.retentionBody', jsonb_build_object('destination', t.destination, 'purgeDate', (t.deleted_at + interval '30 days')::date),
      'retention:' || t.id || ':' || (t.deleted_at + interval '30 days')::date::text
    FROM public.trips t
    JOIN public.trip_notification_settings s ON s.user_id = t.user_id AND s.retention_enabled
    WHERE t.deleted_at IS NOT NULL AND t.deleted_at + interval '30 days' BETWEEN p_now AND p_now + interval '3 days'
  ) source
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_trip_notifications(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_trip_notifications(timestamptz) TO service_role;
COMMENT ON FUNCTION public.generate_trip_notifications(timestamptz) IS 'Service-role scheduled notification generator; inserts deduplicated PII-safe in-app reminders.';

CREATE OR REPLACE FUNCTION public.create_trip_event_notification(p_trip_id uuid, p_event_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result_id uuid;
BEGIN
  IF p_event_type <> 'pdf_export_completion' THEN RAISE EXCEPTION 'Unsupported notification event'; END IF;
  INSERT INTO public.trip_notifications
    (user_id, trip_id, notification_type, title_key, body_key, params, dedupe_key)
  SELECT t.user_id, t.id, p_event_type, 'notifications.travel.pdfTitle', 'notifications.travel.pdfBody',
    jsonb_build_object('destination', t.destination),
    'pdf:' || t.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  FROM public.trips t WHERE t.id = p_trip_id AND t.user_id = auth.uid() AND t.deleted_at IS NULL
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_trip_event_notification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip_event_notification(uuid, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','he','ar')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own WhatsApp templates" ON public.trip_whatsapp_templates;
CREATE POLICY "Users manage own WhatsApp templates" ON public.trip_whatsapp_templates FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_whatsapp_templates TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_pdf_rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_pdf_rate_user_idx ON public.trip_pdf_rate_limits (user_id, requested_at DESC);
ALTER TABLE public.trip_pdf_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_pdf_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_trip_pdf_generation()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.trip_pdf_rate_limits
      WHERE user_id = auth.uid() AND requested_at > now() - interval '1 minute') >= 10 THEN
    RETURN false;
  END IF;
  INSERT INTO public.trip_pdf_rate_limits(user_id) VALUES (auth.uid());
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_trip_pdf_generation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_trip_pdf_generation() TO authenticated;

NOTIFY pgrst, 'reload schema';
