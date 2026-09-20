-- Official Travel Mode WhatsApp delivery, consent, reminders, and E.164 enforcement.
-- Existing trip rows are deliberately not rewritten by this migration.

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  compact text;
  subscriber text;
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN RETURN NULL; END IF;
  compact := translate(normalize(btrim(p_value), NFKC), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  IF compact ~ '[[:alpha:]]' THEN RETURN NULL; END IF;
  compact := regexp_replace(compact, '[[:space:]()./\-]', '', 'g');
  IF compact !~ '^\+?[0-9]+$' THEN RETURN NULL; END IF;

  IF compact LIKE '00972%' THEN subscriber := substr(compact, 6);
  ELSIF compact LIKE '+972%' THEN subscriber := substr(compact, 5);
  ELSIF compact LIKE '972%' THEN subscriber := substr(compact, 4);
  ELSIF compact LIKE '00%' THEN
    compact := '+' || substr(compact, 3);
    IF compact ~ '^\+[1-9][0-9]{7,14}$' THEN RETURN compact; END IF;
    RETURN NULL;
  ELSIF compact LIKE '0%' THEN subscriber := substr(compact, 2);
  ELSE
    IF compact ~ '^\+[1-9][0-9]{7,14}$' THEN RETURN compact; END IF;
    RETURN NULL;
  END IF;

  IF subscriber ~ '^(5[0-9]{8}|7[2-9][0-9]{7}|[23489][0-9]{7})$' THEN
    RETURN '+972' || subscriber;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_phone_e164(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_phone_e164(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.normalize_trip_client_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE normalized text;
BEGIN
  IF NEW.client_phone IS NULL OR btrim(NEW.client_phone) = '' THEN
    NEW.client_phone := NULL;
    RETURN NEW;
  END IF;
  normalized := public.normalize_phone_e164(NEW.client_phone);
  IF normalized IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CLIENT_PHONE';
  END IF;
  NEW.client_phone := normalized;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_trip_client_phone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_trip_client_phone_trigger ON public.trips;
CREATE TRIGGER normalize_trip_client_phone_trigger
BEFORE INSERT OR UPDATE OF client_phone ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.normalize_trip_client_phone();

CREATE TABLE IF NOT EXISTS public.whatsapp_contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL CHECK (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  whatsapp_opt_in_at timestamptz,
  whatsapp_opt_in_source text,
  whatsapp_opt_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipient_phone),
  CHECK ((whatsapp_opt_in AND whatsapp_opt_in_at IS NOT NULL AND whatsapp_opt_out_at IS NULL) OR NOT whatsapp_opt_in)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_server_templates (
  template_key text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'he', 'ar')),
  message_type text NOT NULL CHECK (message_type IN ('transactional', 'promotional')),
  provider_template_name text NOT NULL CHECK (provider_template_name ~ '^[a-z0-9_]+$'),
  provider_language_code text NOT NULL,
  required_variables text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_key, language),
  CHECK (template_key IN (
    'trip_confirmation', 'trip_departure_reminder', 'outstanding_payment_reminder',
    'visa_installment_due_soon', 'visa_installment_overdue', 'final_payment_reminder',
    'hotel_details', 'flight_details'
  ))
);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  reminder_id uuid,
  recipient_phone text NOT NULL CHECK (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  message_type text NOT NULL CHECK (message_type IN ('transactional', 'promotional')),
  template_key text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'he', 'ar')),
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'skipped')),
  idempotency_key text NOT NULL,
  scheduled_for timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_message_safe text CHECK (char_length(failure_message_safe) <= 500),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  variable_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (provider_message_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL CHECK (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'upcoming_trip', 'outstanding_cash_payment', 'upcoming_visa_installment',
    'overdue_installment', 'final_payment', 'trip_confirmation', 'hotel_details',
    'flight_details', 'pre_departure'
  )),
  scheduled_for timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  template_key text NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'he', 'ar')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped')),
  idempotency_key text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  next_attempt_at timestamptz,
  last_failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_message_log_reminder_id_fkey'
      AND conrelid = 'public.whatsapp_message_log'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_message_log
      ADD CONSTRAINT whatsapp_message_log_reminder_id_fkey
      FOREIGN KEY (reminder_id) REFERENCES public.whatsapp_reminders(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  event_id text PRIMARY KEY,
  provider_message_id text,
  status text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_consent_owner_phone_idx ON public.whatsapp_contact_consents (user_id, recipient_phone);
CREATE INDEX IF NOT EXISTS whatsapp_log_owner_created_idx ON public.whatsapp_message_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_log_provider_idx ON public.whatsapp_message_log (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_reminders_due_idx ON public.whatsapp_reminders (scheduled_for, next_attempt_at) WHERE status IN ('scheduled', 'failed');
CREATE INDEX IF NOT EXISTS whatsapp_reminders_owner_idx ON public.whatsapp_reminders (user_id, created_at DESC);

ALTER TABLE public.whatsapp_contact_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_server_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage WhatsApp consent" ON public.whatsapp_contact_consents;
CREATE POLICY "Owners manage WhatsApp consent" ON public.whatsapp_contact_consents
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read active WhatsApp templates" ON public.whatsapp_server_templates;
CREATE POLICY "Users read active WhatsApp templates" ON public.whatsapp_server_templates
FOR SELECT TO authenticated USING (active);

DROP POLICY IF EXISTS "Owners read WhatsApp delivery logs" ON public.whatsapp_message_log;
CREATE POLICY "Owners read WhatsApp delivery logs" ON public.whatsapp_message_log
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners read WhatsApp reminders" ON public.whatsapp_reminders;
CREATE POLICY "Owners read WhatsApp reminders" ON public.whatsapp_reminders
FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.whatsapp_contact_consents, public.whatsapp_server_templates,
  public.whatsapp_message_log, public.whatsapp_reminders, public.whatsapp_webhook_events
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_contact_consents TO authenticated;
GRANT SELECT ON public.whatsapp_server_templates, public.whatsapp_message_log, public.whatsapp_reminders TO authenticated;

INSERT INTO public.whatsapp_server_templates
  (template_key, language, message_type, provider_template_name, provider_language_code, required_variables)
VALUES
  ('trip_confirmation','en','transactional','trip_confirmation','en_US',ARRAY['client_name','destination','start_date','end_date']),
  ('trip_confirmation','he','transactional','trip_confirmation_he','he',ARRAY['client_name','destination','start_date','end_date']),
  ('trip_confirmation','ar','transactional','trip_confirmation_ar','ar',ARRAY['client_name','destination','start_date','end_date']),
  ('trip_departure_reminder','en','transactional','trip_departure_reminder','en_US',ARRAY['client_name','destination','start_date']),
  ('trip_departure_reminder','he','transactional','trip_departure_reminder_he','he',ARRAY['client_name','destination','start_date']),
  ('trip_departure_reminder','ar','transactional','trip_departure_reminder_ar','ar',ARRAY['client_name','destination','start_date']),
  ('outstanding_payment_reminder','en','transactional','outstanding_payment_reminder','en_US',ARRAY['client_name','cash_remaining','currency']),
  ('outstanding_payment_reminder','he','transactional','outstanding_payment_reminder_he','he',ARRAY['client_name','cash_remaining','currency']),
  ('outstanding_payment_reminder','ar','transactional','outstanding_payment_reminder_ar','ar',ARRAY['client_name','cash_remaining','currency']),
  ('visa_installment_due_soon','en','transactional','visa_installment_due_soon','en_US',ARRAY['client_name','next_installment_amount','next_installment_date']),
  ('visa_installment_due_soon','he','transactional','visa_installment_due_soon_he','he',ARRAY['client_name','next_installment_amount','next_installment_date']),
  ('visa_installment_due_soon','ar','transactional','visa_installment_due_soon_ar','ar',ARRAY['client_name','next_installment_amount','next_installment_date']),
  ('visa_installment_overdue','en','transactional','visa_installment_overdue','en_US',ARRAY['client_name','next_installment_amount','next_installment_date']),
  ('visa_installment_overdue','he','transactional','visa_installment_overdue_he','he',ARRAY['client_name','next_installment_amount','next_installment_date']),
  ('visa_installment_overdue','ar','transactional','visa_installment_overdue_ar','ar',ARRAY['client_name','next_installment_amount','next_installment_date']),
  ('final_payment_reminder','en','transactional','final_payment_reminder','en_US',ARRAY['client_name','combined_remaining','currency']),
  ('final_payment_reminder','he','transactional','final_payment_reminder_he','he',ARRAY['client_name','combined_remaining','currency']),
  ('final_payment_reminder','ar','transactional','final_payment_reminder_ar','ar',ARRAY['client_name','combined_remaining','currency']),
  ('hotel_details','en','transactional','hotel_details','en_US',ARRAY['client_name','hotel_name','hotel_dates']),
  ('hotel_details','he','transactional','hotel_details_he','he',ARRAY['client_name','hotel_name','hotel_dates']),
  ('hotel_details','ar','transactional','hotel_details_ar','ar',ARRAY['client_name','hotel_name','hotel_dates']),
  ('flight_details','en','transactional','flight_details','en_US',ARRAY['client_name','flight_information']),
  ('flight_details','he','transactional','flight_details_he','he',ARRAY['client_name','flight_information']),
  ('flight_details','ar','transactional','flight_details_ar','ar',ARRAY['client_name','flight_information'])
ON CONFLICT (template_key, language) DO UPDATE SET
  message_type = EXCLUDED.message_type,
  provider_template_name = EXCLUDED.provider_template_name,
  provider_language_code = EXCLUDED.provider_language_code,
  required_variables = EXCLUDED.required_variables,
  updated_at = now();

COMMENT ON TABLE public.whatsapp_contact_consents IS 'Explicit tenant-owned WhatsApp opt-in and opt-out state; a phone number alone never implies consent.';
COMMENT ON TABLE public.whatsapp_message_log IS 'PII-minimized official provider delivery audit. Message bodies and provider secrets are never stored.';
COMMENT ON COLUMN public.whatsapp_message_log.variable_snapshot IS 'Server-derived template variables only; excludes message body, passport, attachments, and internal financial fields.';
COMMENT ON TABLE public.whatsapp_reminders IS 'Opt-in scheduled transactional WhatsApp reminders processed by a service-role Edge Function.';

NOTIFY pgrst, 'reload schema';
