-- Production catalog facts that supabase/migrations does not express, for the local tourism write oracle.
--
-- Captured 2026-09-16 from the production catalog through migration/tools/lib/staging-source.mjs
-- (REPEATABLE READ READ ONLY; a write was proven to fail with 25006). Only schema and the application's own
-- function code; no customer rows. Applied after the platform fixture and every migration, so the oracle's trip
-- tables, triggers and functions are the ones production runs.
--
-- Function drift measured with md5 of the whitespace-normalised pg_get_functiondef over 47 tourism functions:
-- 44 identical, 2 production-only (below), 1 differing (the 8-argument get_trips_page overload, which the product
-- never calls: it calls the 9-argument function, identical to the migrations; not overlaid).

-- trips: checklist columns exist in production (ordinal 34-36).
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS checklist_flight boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_hotel boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_payment boolean DEFAULT false;

-- trips: the template linkage migration was never applied in production.
DROP INDEX IF EXISTS public.trips_source_template_idx;
ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_source_template_id_fkey,
  DROP CONSTRAINT IF EXISTS trips_source_template_name_check,
  DROP COLUMN IF EXISTS source_template_id,
  DROP COLUMN IF EXISTS source_template_name;

-- trips: production currency defaults.
ALTER TABLE public.trips
  ALTER COLUMN wholesale_currency SET DEFAULT 'USD'::text,
  ALTER COLUMN sale_currency SET DEFAULT 'USD'::text;

-- trips.search_document as production generates it (without traveler names).
ALTER TABLE public.trips DROP COLUMN IF EXISTS search_document;
ALTER TABLE public.trips ADD COLUMN search_document text GENERATED ALWAYS AS (
  lower(((((((((COALESCE(destination, ''::text) || ' '::text) || COALESCE(client_name, ''::text)) || ' '::text)
    || COALESCE(hotel_name, ''::text)) || ' '::text) || COALESCE(status, ''::text)) || ' '::text) || COALESCE(payment_status, ''::text)))
) STORED;
CREATE INDEX IF NOT EXISTS trips_search_document_trgm_idx ON public.trips USING gin (search_document gin_trgm_ops) WHERE (deleted_at IS NULL);

-- trip_whatsapp_templates: the composer migration was never applied in production (7 columns).
DROP INDEX IF EXISTS public.trip_whatsapp_templates_user_active_idx;
ALTER TABLE public.trip_whatsapp_templates
  DROP CONSTRAINT IF EXISTS trip_whatsapp_templates_usage_count_check,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS is_favorite,
  DROP COLUMN IF EXISTS is_archived,
  DROP COLUMN IF EXISTS usage_count,
  DROP COLUMN IF EXISTS last_used_at;

-- trip_financial_audit: production cascades audit rows with their trip.
ALTER TABLE public.trip_financial_audit
  ADD CONSTRAINT trip_financial_audit_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

-- Production-only functions (pg_get_functiondef, verbatim).
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.normalize_trip_client_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS normalize_trip_client_phone_trigger ON public.trips;
CREATE TRIGGER normalize_trip_client_phone_trigger BEFORE INSERT OR UPDATE OF client_phone ON public.trips
  FOR EACH ROW EXECUTE FUNCTION normalize_trip_client_phone();
