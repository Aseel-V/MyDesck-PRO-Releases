BEGIN;
-- Canonical contract comes from actual signup, App access checks, Settings
-- trial display and EditUserModal writes (see docs/PHASE1_SCHEMA_DRIFT.md).
-- Existing values are preserved; do not backfill or reset customer trials.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.business_profiles
 ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial',
 ADD COLUMN IF NOT EXISTS trial_start_date timestamptz;

CREATE OR REPLACE FUNCTION public.guard_business_account_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.is_suspended OR NEW.subscription_status<>'trial' OR NEW.trial_start_date IS NOT NULL THEN
   RAISE EXCEPTION 'Account status is server managed' USING ERRCODE='42501';
  END IF;
 ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
   OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date THEN
  IF NOT public.is_platform_admin() OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
   RAISE EXCEPTION 'Account status is server managed' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_business_account_fields() FROM PUBLIC;
CREATE TRIGGER guard_business_account_fields BEFORE INSERT OR UPDATE ON public.business_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_business_account_fields();
-- Admin editing is explicit; users still cannot self-assign admin or business.
CREATE POLICY "Platform admin account updates" ON public.business_profiles FOR UPDATE TO authenticated
USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admin suspension updates" ON public.user_profiles FOR UPDATE TO authenticated
USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
COMMIT;
