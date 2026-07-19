-- Forward-only metadata for the manual Travel Mode WhatsApp composer.
-- Message bodies remain user-owned templates; activity logs never store them.

DO $$
BEGIN
  IF to_regclass('public.trip_whatsapp_templates') IS NULL THEN
    RAISE EXCEPTION 'Missing public.trip_whatsapp_templates. Apply 20260719140000_travel_mode_product_features.sql first.';
  END IF;
END;
$$;

ALTER TABLE public.trip_whatsapp_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

CREATE INDEX IF NOT EXISTS trip_whatsapp_templates_user_active_idx
  ON public.trip_whatsapp_templates (user_id, is_archived, is_favorite DESC, updated_at DESC);

COMMENT ON COLUMN public.trip_whatsapp_templates.last_used_at IS
  'Timestamp when a user last opened WhatsApp with this template; does not imply sending or delivery.';

NOTIFY pgrst, 'reload schema';
