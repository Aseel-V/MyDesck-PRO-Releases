-- =====================================================================
-- Migration: Convert room_type from TEXT to JSONB
-- Parses existing format "Single x1, Double x2" into {"Single": 1, "Double": 2}
-- =====================================================================

-- Step 1: Add new JSONB column
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS room_type_jsonb jsonb DEFAULT '{}'::jsonb;

-- Step 2: Migrate existing data with parsing logic
-- Pattern: "Single x1, Double x2" -> {"Single": 1, "Double": 2}
UPDATE public.trips
SET room_type_jsonb = (
    SELECT COALESCE(
        jsonb_object_agg(
            TRIM(split_part(room_item, ' x', 1)),  -- Room type name (e.g., "Single")
            (split_part(room_item, ' x', 2))::int  -- Count (e.g., 1)
        ),
        '{}'::jsonb
    )
    FROM unnest(
        string_to_array(room_type, ', ')
    ) AS room_item
    WHERE room_item LIKE '% x%'
)
WHERE room_type IS NOT NULL 
  AND room_type != '' 
  AND room_type LIKE '% x%';

-- Step 3: Set empty JSONB for rows that don't match the pattern or are null
UPDATE public.trips
SET room_type_jsonb = '{}'::jsonb
WHERE room_type_jsonb IS NULL;

-- Step 4: Drop the old text column
ALTER TABLE public.trips DROP COLUMN IF EXISTS room_type;

-- Step 5: Rename the new column to room_type
ALTER TABLE public.trips RENAME COLUMN room_type_jsonb TO room_type;

-- Step 6: Add comment for documentation
COMMENT ON COLUMN public.trips.room_type IS 'Room configuration as JSON (e.g., {"Single": 1, "Double": 2})';
