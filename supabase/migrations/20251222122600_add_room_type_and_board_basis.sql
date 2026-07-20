-- Add room_type and board_basis columns to trips table
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS room_type text,
ADD COLUMN IF NOT EXISTS board_basis text;

-- Comment on columns
COMMENT ON COLUMN public.trips.room_type IS 'Room configuration (e.g., Double x1, Single x1)';
COMMENT ON COLUMN public.trips.board_basis IS 'Meal plan (e.g., Room Only, Bed & Breakfast)';
