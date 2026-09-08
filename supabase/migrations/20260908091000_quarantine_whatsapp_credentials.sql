BEGIN;
-- Not exposed through PostgREST. Quarantine preserves credentials for rotation
-- without leaving permanent provider tokens in a tenant-readable relation.
CREATE SCHEMA IF NOT EXISTS private_security;
REVOKE ALL ON SCHEMA private_security FROM PUBLIC, anon, authenticated;
CREATE TABLE private_security.whatsapp_credentials (
  settings_id uuid PRIMARY KEY,
  access_token text NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private_security.whatsapp_credentials FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private_security.whatsapp_credentials(settings_id,access_token)
SELECT id,access_token FROM public.restaurant_whatsapp_settings WHERE access_token IS NOT NULL;
UPDATE public.restaurant_whatsapp_settings SET access_token=NULL, is_enabled=false;
ALTER TABLE public.restaurant_whatsapp_settings ADD CONSTRAINT automated_whatsapp_disabled
CHECK (access_token IS NULL AND is_enabled=false);
COMMIT;
