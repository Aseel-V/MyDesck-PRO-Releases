-- ============================================================================
-- RESTAURANT MODE - RESERVATION DATE VALIDATION (FIXED)
-- Version: 1.0.1 | Apply via Supabase SQL Editor
-- Description: Server-side validation to prevent past-date/time reservations
-- FIXED: Uses correct column names (reservation_date, reservation_time)
-- ============================================================================

-- ============================================================================
-- 1. ADD CHECK CONSTRAINT FOR FUTURE DATES
-- Prevents inserting reservations for dates in the past
-- ============================================================================

-- First, ensure the table exists and add the constraint
DO $$ 
BEGIN
  -- Add constraint only if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_reservation_future_date'
  ) THEN
    ALTER TABLE restaurant_reservations
    ADD CONSTRAINT chk_reservation_future_date
    CHECK (reservation_date >= CURRENT_DATE);
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE VALIDATION TRIGGER FOR SAME-DAY TIME CHECK
-- For same-day reservations, ensures the time has not passed
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_reservation_datetime()
RETURNS TRIGGER AS $$
DECLARE
  v_reservation_datetime TIMESTAMP;
BEGIN
  -- Combine date and time into a timestamp
  v_reservation_datetime := (NEW.reservation_date || ' ' || NEW.reservation_time)::TIMESTAMP;
  
  -- Check if the reservation datetime is in the past
  IF v_reservation_datetime < NOW() THEN
    RAISE EXCEPTION 'Cannot create reservation for a past date/time. Requested: %, Current: %', 
      v_reservation_datetime, NOW();
  END IF;
  
  -- Validate party size is reasonable
  IF NEW.party_size < 1 THEN
    RAISE EXCEPTION 'Party size must be at least 1';
  END IF;
  
  IF NEW.party_size > 50 THEN
    RAISE EXCEPTION 'Party size exceeds maximum (50). For larger groups, contact management.';
  END IF;
  
  -- Validate duration
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes < 15 THEN
    RAISE EXCEPTION 'Reservation duration must be at least 15 minutes';
  END IF;
  
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 480 THEN
    RAISE EXCEPTION 'Reservation duration cannot exceed 8 hours (480 minutes)';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS trg_validate_reservation_datetime ON restaurant_reservations;

CREATE TRIGGER trg_validate_reservation_datetime
  BEFORE INSERT OR UPDATE ON restaurant_reservations
  FOR EACH ROW
  EXECUTE FUNCTION validate_reservation_datetime();

-- ============================================================================
-- 3. CREATE RPC FUNCTION FOR SAFE RESERVATION CREATION
-- Provides additional business logic validation
-- ============================================================================

CREATE OR REPLACE FUNCTION create_reservation_safe(
  p_business_id UUID,
  p_guest_name TEXT,
  p_guest_phone TEXT,
  p_party_size INTEGER,
  p_reservation_date DATE,
  p_reservation_time TIME,
  p_guest_email TEXT DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 90,
  p_table_ids UUID[] DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_special_requests TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'phone'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID;
  v_datetime TIMESTAMP;
BEGIN
  -- Combine date and time for validation
  v_datetime := (p_reservation_date || ' ' || p_reservation_time)::TIMESTAMP;
  
  -- Validate future datetime
  IF v_datetime < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot book for a past date/time',
      'error_code', 'PAST_DATETIME'
    );
  END IF;
  
  -- Validate reasonable advance booking (not more than 6 months ahead)
  IF p_reservation_date > CURRENT_DATE + INTERVAL '6 months' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot book more than 6 months in advance',
      'error_code', 'TOO_FAR_AHEAD'
    );
  END IF;
  
  -- Validate guest information
  IF p_guest_name IS NULL OR LENGTH(TRIM(p_guest_name)) < 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Guest name is required (minimum 2 characters)',
      'error_code', 'INVALID_NAME'
    );
  END IF;
  
  IF p_guest_phone IS NULL OR LENGTH(REGEXP_REPLACE(p_guest_phone, '[^0-9]', '', 'g')) < 7 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Valid phone number is required',
      'error_code', 'INVALID_PHONE'
    );
  END IF;
  
  -- Insert the reservation
  INSERT INTO restaurant_reservations (
    business_id,
    guest_name,
    guest_phone,
    guest_email,
    party_size,
    reservation_date,
    reservation_time,
    duration_minutes,
    table_ids,
    notes,
    special_requests,
    source,
    status,
    reminder_sent,
    confirmation_sent
  ) VALUES (
    p_business_id,
    TRIM(p_guest_name),
    p_guest_phone,
    p_guest_email,
    p_party_size,
    p_reservation_date,
    p_reservation_time,
    COALESCE(p_duration_minutes, 90),
    COALESCE(p_table_ids, ARRAY[]::UUID[]),
    p_notes,
    p_special_requests,
    p_source,
    'pending',
    false,
    false
  )
  RETURNING id INTO v_reservation_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'message', 'Reservation created successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', 'DATABASE_ERROR'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_reservation_safe TO authenticated;

-- ============================================================================
-- DONE! Apply this SQL in your Supabase SQL Editor
-- ============================================================================
