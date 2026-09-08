-- Migration: 20260908120000_reconcile_application_rpcs.sql
-- Purpose: Reconcile unmigrated active application RPCs into canonical migration chain
-- All functions enforce SECURITY DEFINER, search_path = '', and caller/tenant verification.

-- 1. Server time RPC
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT clock_timestamp();
$$;

REVOKE ALL ON FUNCTION public.get_server_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated, service_role;

-- 2. Secure menu item deletion RPC
CREATE OR REPLACE FUNCTION public.delete_menu_item_secure(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT business_id INTO v_business_id
  FROM public.restaurant_menu_items
  WHERE id = p_item_id;

  IF v_business_id IS NULL THEN
    RETURN;
  END IF;

  IF v_business_id <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.restaurant_menu_items WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_menu_item_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_menu_item_secure(uuid) TO authenticated, service_role;

-- 3. Secure staff deletion RPC
CREATE OR REPLACE FUNCTION public.delete_staff_secure(p_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT business_id INTO v_business_id
  FROM public.restaurant_staff
  WHERE id = p_staff_id;

  IF v_business_id IS NULL THEN
    RETURN;
  END IF;

  IF v_business_id <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.restaurant_staff WHERE id = p_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_staff_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_staff_secure(uuid) TO authenticated, service_role;

-- 4. Activity log RPC
CREATE OR REPLACE FUNCTION public.log_business_activity_v2(
  p_activity_type text,
  p_details jsonb,
  p_business_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_effective_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_effective_business_id := COALESCE(p_business_id, auth.uid());
  IF v_effective_business_id <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.restaurant_audit_logs (
    business_id,
    actor_id,
    staff_id,
    action_type,
    entity_id,
    details
  ) VALUES (
    v_effective_business_id,
    auth.uid(),
    p_staff_id,
    p_activity_type,
    p_entity_id,
    p_details
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_business_activity_v2(text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_business_activity_v2(text, jsonb, uuid, text, uuid, uuid) TO authenticated, service_role;
