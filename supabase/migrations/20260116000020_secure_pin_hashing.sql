-- ==========================================
-- SECURE PIN HASHING MIGRATION
-- Date: 2026-01-16
-- Description: Implements secure PIN verification using pgcrypto hash functions
-- ==========================================

-- 1. Enable pgcrypto for secure hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add pin_hash column to restaurant_staff (for gradual migration)
ALTER TABLE public.restaurant_staff 
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- 3. Create index for faster PIN lookups
CREATE INDEX IF NOT EXISTS idx_restaurant_staff_pin_hash 
ON public.restaurant_staff(pin_hash) 
WHERE pin_hash IS NOT NULL;

-- 4. Create secure PIN verification function
-- This function verifies PINs server-side without exposing them to the client
CREATE OR REPLACE FUNCTION public.verify_staff_pin_secure(
  p_staff_id UUID,
  p_pin TEXT,
  p_business_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff restaurant_staff;
  v_is_valid BOOLEAN := FALSE;
BEGIN
  -- Fetch the staff member
  SELECT * INTO v_staff
  FROM restaurant_staff
  WHERE id = p_staff_id
    AND business_id = p_business_id
    AND is_active = true;
  
  -- Staff not found
  IF v_staff.id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'error', 'Staff not found or inactive'
    );
  END IF;
  
  -- Check hashed PIN first (for migrated accounts)
  IF v_staff.pin_hash IS NOT NULL THEN
    IF v_staff.pin_hash = crypt(p_pin, v_staff.pin_hash) THEN
      v_is_valid := TRUE;
    END IF;
  -- Fallback to plaintext comparison for non-migrated accounts
  ELSIF v_staff.pin_code IS NOT NULL AND v_staff.pin_code = p_pin THEN
    v_is_valid := TRUE;
    
    -- Auto-migrate: Hash the PIN on successful plaintext login
    UPDATE restaurant_staff 
    SET pin_hash = crypt(p_pin, gen_salt('bf', 8)),
        pin_code = NULL  -- Clear plaintext PIN after migration
    WHERE id = p_staff_id;
  END IF;
  
  -- Return result
  IF v_is_valid THEN
    RETURN jsonb_build_object(
      'valid', true,
      'staff_id', v_staff.id,
      'full_name', v_staff.full_name,
      'role', v_staff.role,
      'restaurant_role', v_staff.restaurant_role,
      'is_clocked_in', v_staff.is_clocked_in,
      'assigned_tables', v_staff.assigned_tables,
      'assigned_station', v_staff.assigned_station,
      'hourly_rate', v_staff.hourly_rate
    );
  ELSE
    RETURN jsonb_build_object(
      'valid', false, 
      'error', 'Invalid PIN'
    );
  END IF;
END;
$$;

-- 5. Create function to securely set/update a PIN
CREATE OR REPLACE FUNCTION public.set_staff_pin_secure(
  p_staff_id UUID,
  p_new_pin TEXT,
  p_business_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff restaurant_staff;
BEGIN
  -- Validate PIN format (4-6 digits)
  IF p_new_pin !~ '^\d{4,6}$' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'PIN must be 4-6 digits'
    );
  END IF;
  
  -- Verify staff exists and belongs to business
  SELECT * INTO v_staff
  FROM restaurant_staff
  WHERE id = p_staff_id
    AND business_id = p_business_id;
  
  IF v_staff.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Staff not found'
    );
  END IF;
  
  -- Update PIN hash (clear plaintext)
  UPDATE restaurant_staff 
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 8)),
        pin_code = NULL
  WHERE id = p_staff_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'PIN updated securely'
  );
END;
$$;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.verify_staff_pin_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_pin_secure TO authenticated;

-- 7. Enable the order item protection trigger (previously disabled)
-- This prevents direct status changes to cancelled/voided without using secure RPC
DROP TRIGGER IF EXISTS prevent_unauthorized_order_item_updates_trigger ON public.restaurant_order_items;

CREATE TRIGGER prevent_unauthorized_order_item_updates_trigger
  BEFORE UPDATE ON public.restaurant_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_order_item_updates();

-- 8. Add audit log entry for this migration
INSERT INTO public.restaurant_audit_logs (
  business_id, 
  action_type, 
  details
) 
SELECT 
  id,
  'SECURITY_MIGRATION',
  jsonb_build_object(
    'migration', '20260116_secure_pin_hashing',
    'description', 'Enabled secure PIN hashing with auto-migration',
    'timestamp', NOW()
  )
FROM auth.users
WHERE id IN (SELECT DISTINCT business_id FROM public.restaurant_staff)
ON CONFLICT DO NOTHING;

-- 9. UPDATE authorize_staff_action to support hashed PINs (Iterative check)
CREATE OR REPLACE FUNCTION public.authorize_staff_action(
  p_pin_code TEXT,
  p_required_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_staff RECORD;
  v_is_authorized BOOLEAN;
  v_is_valid_pin BOOLEAN;
BEGIN
  -- 1. Get current business_id from logged in user
  SELECT id INTO v_business_id
  FROM business_profiles
  WHERE user_id = auth.uid();

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'error', 'Business not found');
  END IF;

  -- 2. Find staff by PIN (Iterative search because of hashing)
  -- We assume staff count is small (<100) per business. 
  -- We iterate through valid active staff and check hashes.
  FOR v_staff IN 
    SELECT * FROM restaurant_staff 
    WHERE business_id = v_business_id AND is_active = true
  LOOP
    v_is_valid_pin := FALSE;

    -- Check Hash
    IF v_staff.pin_hash IS NOT NULL THEN
      IF v_staff.pin_hash = crypt(p_pin_code, v_staff.pin_hash) THEN
         v_is_valid_pin := TRUE;
      END IF;
    -- Check Plaintext (Legacy) and Auto-Migrate
    ELSIF v_staff.pin_code IS NOT NULL AND v_staff.pin_code = p_pin_code THEN
       v_is_valid_pin := TRUE;
       -- Migration
       UPDATE restaurant_staff
       SET pin_hash = crypt(p_pin_code, gen_salt('bf', 8)),
           pin_code = NULL
       WHERE id = v_staff.id;
    END IF;

    IF v_is_valid_pin THEN
       -- Found the staff member! Check Role.
       IF p_required_role IS NOT NULL THEN
          -- Assuming 'manager' requirement is satisfied by 'super_admin' or 'branch_manager'
          IF p_required_role = 'manager' THEN
             v_is_authorized := v_staff.restaurant_role IN ('super_admin', 'branch_manager', 'manager');
          ELSE
             v_is_authorized := v_staff.restaurant_role = p_required_role;
          END IF;

          IF NOT v_is_authorized THEN
             RETURN jsonb_build_object('authorized', false, 'error', 'Insufficient permissions');
          END IF;
       END IF;

       RETURN jsonb_build_object(
         'authorized', true,
         'staff_id', v_staff.id,
         'role', v_staff.restaurant_role,
         'name', v_staff.full_name
       );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('authorized', false, 'error', 'Invalid PIN');
END;
$$;
