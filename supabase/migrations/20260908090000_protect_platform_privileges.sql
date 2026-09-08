-- Server-owned privileges: browser users can edit contact data, never identity,
-- platform role or business assignment. Applies to INSERT and UPSERT as well.
BEGIN;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id=auth.uid() AND role='admin') $$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_platform_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Check the actual database role, not user-editable metadata. Definer RPCs
  -- must not be used as an alternative public profile writer.
  IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'user' OR NEW.user_id IS DISTINCT FROM auth.uid()
       OR (NEW.business_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.business_profiles WHERE id=NEW.business_id AND user_id=auth.uid()
       )) OR COALESCE((to_jsonb(NEW)->>'can_view_financials')::boolean,false)
       OR COALESCE((to_jsonb(NEW)->>'is_suspended')::boolean,false) THEN
      RAISE EXCEPTION 'Profile privileges are server managed' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id
     OR ((to_jsonb(NEW)->'is_suspended') IS DISTINCT FROM (to_jsonb(OLD)->'is_suspended') AND NOT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Profile privileges are server managed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_platform_profile_fields() FROM PUBLIC;
CREATE TRIGGER guard_platform_profile_fields BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_platform_profile_fields();

-- The historical profile admin policy selects its own table recursively.
DROP POLICY IF EXISTS "Admins can view all user profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all user profiles" ON public.user_profiles FOR SELECT TO authenticated
USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins can view all trips" ON public.trips;
CREATE POLICY "Admins can view all trips" ON public.trips FOR SELECT TO authenticated
USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Admins can view all business profiles" ON public.business_profiles;
CREATE POLICY "Admins can view all business profiles" ON public.business_profiles FOR SELECT TO authenticated
USING (public.is_platform_admin());
COMMIT;
