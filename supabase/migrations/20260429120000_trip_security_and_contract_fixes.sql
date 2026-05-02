-- ============================================================================
-- Trip User hardening and contract alignment
-- - secure trip attachments bucket with per-user access
-- - align archived status across DB
-- - ensure room_type is jsonb
-- - refresh trip RPCs to match the frontend contract
-- ============================================================================

-- Ensure trip attachments bucket exists and is private
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-attachments', 'trip-attachments', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "Trip attachments private read" ON storage.objects;
DROP POLICY IF EXISTS "Trip attachments private upload" ON storage.objects;
DROP POLICY IF EXISTS "Trip attachments private update" ON storage.objects;
DROP POLICY IF EXISTS "Trip attachments private delete" ON storage.objects;

CREATE POLICY "Trip attachments private read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Trip attachments private upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Trip attachments private update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'trip-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Trip attachments private delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Ensure trips table has the columns used by the current frontend
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS client_phone text,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS itinerary jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS travelers jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS payment_date date,
ADD COLUMN IF NOT EXISTS board_basis text,
ADD COLUMN IF NOT EXISTS wholesale_original_amount numeric,
ADD COLUMN IF NOT EXISTS wholesale_currency text,
ADD COLUMN IF NOT EXISTS sale_original_amount numeric,
ADD COLUMN IF NOT EXISTS sale_currency text;

DO $$
DECLARE
  room_type_data_type text;
BEGIN
  SELECT data_type
  INTO room_type_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'trips'
    AND column_name = 'room_type';

  IF room_type_data_type IS NULL THEN
    ALTER TABLE public.trips
    ADD COLUMN room_type jsonb DEFAULT '{}'::jsonb;
  ELSIF room_type_data_type <> 'jsonb' THEN
    EXECUTE $sql$
      ALTER TABLE public.trips
      ALTER COLUMN room_type TYPE jsonb
      USING (
        CASE
          WHEN room_type IS NULL OR btrim(room_type) = '' THEN '{}'::jsonb
          WHEN left(ltrim(room_type), 1) = '{' THEN room_type::jsonb
          ELSE COALESCE(
            (
              SELECT jsonb_object_agg(
                trim(split_part(room_item, ' x', 1)),
                (split_part(room_item, ' x', 2))::int
              )
              FROM unnest(string_to_array(room_type, ', ')) AS room_item
              WHERE room_item LIKE '% x%'
            ),
            '{}'::jsonb
          )
        END
      )
    $sql$;
  END IF;
END $$;

ALTER TABLE public.trips
ALTER COLUMN room_type SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trips_status_check'
      AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips DROP CONSTRAINT trips_status_check;
  END IF;

  ALTER TABLE public.trips
  ADD CONSTRAINT trips_status_check
  CHECK (status IN ('active', 'completed', 'cancelled', 'archived'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.get_trips_by_year(text);

CREATE OR REPLACE FUNCTION public.get_trips_by_year(year_input text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  destination text,
  client_name text,
  client_phone text,
  travelers jsonb,
  travelers_count integer,
  itinerary jsonb,
  start_date date,
  end_date date,
  currency text,
  exchange_rate numeric,
  wholesale_cost numeric,
  sale_price numeric,
  profit numeric,
  profit_percentage numeric,
  payments jsonb,
  payment_date date,
  payment_status text,
  amount_paid numeric,
  amount_due numeric,
  room_type jsonb,
  board_basis text,
  wholesale_original_amount numeric,
  wholesale_currency text,
  sale_original_amount numeric,
  sale_currency text,
  attachments jsonb,
  notes text,
  status text,
  export_to_pdf boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.destination,
    t.client_name,
    t.client_phone,
    t.travelers,
    t.travelers_count,
    t.itinerary,
    t.start_date,
    t.end_date,
    t.currency,
    t.exchange_rate,
    t.wholesale_cost,
    t.sale_price,
    t.profit,
    t.profit_percentage,
    t.payments,
    t.payment_date,
    t.payment_status,
    t.amount_paid,
    t.amount_due,
    t.room_type,
    t.board_basis,
    t.wholesale_original_amount,
    t.wholesale_currency,
    t.sale_original_amount,
    t.sale_currency,
    t.attachments,
    t.notes,
    t.status,
    t.export_to_pdf,
    t.created_at,
    t.updated_at
  FROM public.trips t
  WHERE t.user_id = auth.uid()
    AND TO_CHAR(COALESCE(t.payment_date, t.start_date), 'YYYY') = year_input
  ORDER BY t.start_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trips_by_year(text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_trip_years();

CREATE OR REPLACE FUNCTION public.get_trip_years()
RETURNS TABLE (year text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT TO_CHAR(COALESCE(t.payment_date, t.start_date), 'YYYY') AS year
  FROM public.trips t
  WHERE t.user_id = auth.uid()
  ORDER BY year DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trip_years() TO authenticated;
