-- ============================================================================
-- RESTAURANT MODE - FIX AUTHORIZE ACTION RPC
-- Version: 1.0.0 | Apply via Supabase SQL Editor
-- ============================================================================

CREATE OR REPLACE FUNCTION authorize_staff_action(
  p_pin_code TEXT,
  p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_business_id UUID;
  v_staff RECORD;
  v_is_authorized BOOLEAN;
BEGIN
  -- 1. Get current business_id from logged in user
  SELECT id INTO v_business_id
  FROM business_profiles
  WHERE user_id = auth.uid();

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'error', 'Business not found');
  END IF;

  -- 2. Find staff by PIN and Business
  SELECT * INTO v_staff
  FROM restaurant_staff
  WHERE business_id = v_business_id
    AND pin_code = p_pin_code
    AND is_active = true; -- Changed from checked 'status' to 'is_active'

  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'error', 'Invalid PIN');
  END IF;

  -- 3. Check Role if required
  IF p_required_role IS NOT NULL THEN
    -- Check if role meets requirement. Currently simple equality or admin check.
    -- Assuming 'manager' requirement is satisfied by 'super_admin' or 'branch_manager'
    
    IF p_required_role = 'manager' THEN
       v_is_authorized := v_staff.restaurant_role IN ('super_admin', 'branch_manager');
    ELSE
       v_is_authorized := v_staff.restaurant_role = p_required_role;
    END IF;

    IF NOT v_is_authorized THEN
       RETURN jsonb_build_object('authorized', false, 'error', 'Insufficient permissions');
    END IF;
  END IF;

  -- 4. Return success
  RETURN jsonb_build_object(
    'authorized', true,
    'staff_id', v_staff.id,
    'role', v_staff.restaurant_role,
    'name', v_staff.full_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
