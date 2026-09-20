-- Read-only owner-scoped report. This does not rewrite legacy trip phones.
SELECT
  id AS trip_id,
  right(regexp_replace(client_phone, '[^0-9]', '', 'g'), 4) AS phone_suffix,
  CASE
    WHEN public.normalize_phone_e164(client_phone) IS NULL THEN 'invalid'
    WHEN client_phone <> public.normalize_phone_e164(client_phone) THEN 'not_canonical'
    ELSE 'canonical'
  END AS normalization_status
FROM public.trips
WHERE user_id = auth.uid()
  AND client_phone IS NOT NULL
  AND (public.normalize_phone_e164(client_phone) IS NULL OR client_phone <> public.normalize_phone_e164(client_phone))
ORDER BY created_at DESC;
