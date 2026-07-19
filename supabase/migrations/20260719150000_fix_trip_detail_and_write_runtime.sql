-- Repair the deployed Travel Mode detail RPC and pgcrypto trigger lookup.
-- Additive and forward-only: no user or trip rows are updated or deleted.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trip_encrypt_travelers(input_travelers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions
AS $$
DECLARE
  encryption_key text;
  result jsonb;
BEGIN
  IF input_travelers IS NULL OR jsonb_typeof(input_travelers) <> 'array' THEN
    RETURN coalesce(input_travelers, '[]'::jsonb);
  END IF;

  SELECT secret_value INTO encryption_key
  FROM private.travel_mode_secrets
  WHERE secret_name = 'passport_encryption_v1';

  IF encryption_key IS NULL THEN
    RAISE EXCEPTION 'Travel PII encryption key is unavailable';
  END IF;

  SELECT coalesce(jsonb_agg(
    CASE
      WHEN jsonb_typeof(item) = 'object'
        AND nullif(item->>'passport_number', '') IS NOT NULL
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
SET search_path = pg_catalog, public, private, extensions
AS $$
DECLARE
  encryption_key text;
  result jsonb;
BEGIN
  IF input_travelers IS NULL OR jsonb_typeof(input_travelers) <> 'array' THEN
    RETURN coalesce(input_travelers, '[]'::jsonb);
  END IF;

  SELECT secret_value INTO encryption_key
  FROM private.travel_mode_secrets
  WHERE secret_name = 'passport_encryption_v1';

  IF encryption_key IS NULL THEN
    RAISE EXCEPTION 'Travel PII encryption key is unavailable';
  END IF;

  SELECT coalesce(jsonb_agg(
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
SET search_path = pg_catalog, public, private, extensions
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

CREATE OR REPLACE FUNCTION public.get_trip_details(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions
AS $$
  SELECT (to_jsonb(t) - 'search_document') || jsonb_build_object(
    'travelers', public.trip_decrypt_travelers(t.travelers)
  )
  FROM public.trips AS t
  WHERE t.id = p_trip_id
    AND t.user_id = auth.uid()
    AND t.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.get_trip_details(uuid) IS
  'Returns one active trip owned by auth.uid(); traveler passports are decrypted only for this explicit detail request.';
REVOKE ALL ON FUNCTION public.get_trip_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
