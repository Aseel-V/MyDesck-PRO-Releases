-- OPTIONAL, DESTRUCTIVE ADMIN CLEANUP. Never run as part of deployment.
-- This permanently removes legacy encrypted passport keys while retaining all
-- other traveler fields. Take and verify a backup before deliberately running it.
BEGIN;
ALTER TABLE public.trips DISABLE TRIGGER encrypt_trip_travelers_trigger;
UPDATE public.trips t
SET travelers = (
  SELECT coalesce(jsonb_agg(item - 'passport_number' ORDER BY ordinality), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(t.travelers, '[]'::jsonb)) WITH ORDINALITY AS v(item, ordinality)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(coalesce(t.travelers, '[]'::jsonb)) item
  WHERE item ? 'passport_number'
);
ALTER TABLE public.trips ENABLE TRIGGER encrypt_trip_travelers_trigger;
-- Change this to COMMIT only after reviewing the affected-row count and backup.
ROLLBACK;
