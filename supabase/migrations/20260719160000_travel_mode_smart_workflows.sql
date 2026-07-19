-- Forward-only Travel Mode workflows. Existing trip rows and legacy encrypted
-- traveler data are preserved; no fictional installment history is generated.

CREATE OR REPLACE FUNCTION public.encrypt_trip_travelers_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions
AS $$
DECLARE
  merged jsonb;
BEGIN
  merged := coalesce(NEW.travelers, '[]'::jsonb);

  -- The active application no longer reads or writes passport data. Carry an
  -- existing encrypted legacy key forward by array position during ordinary edits.
  IF TG_OP = 'UPDATE' AND jsonb_typeof(merged) = 'array' THEN
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN jsonb_typeof(n.item) = 'object'
          AND NOT (n.item ? 'passport_number')
          AND jsonb_typeof(o.item) = 'object'
          AND o.item ? 'passport_number'
        THEN n.item || jsonb_build_object('passport_number', o.item->'passport_number')
        ELSE n.item
      END ORDER BY n.ordinality
    ), '[]'::jsonb)
    INTO merged
    FROM jsonb_array_elements(merged) WITH ORDINALITY AS n(item, ordinality)
    LEFT JOIN jsonb_array_elements(coalesce(OLD.travelers, '[]'::jsonb)) WITH ORDINALITY AS o(item, ordinality)
      ON o.ordinality = n.ordinality;
  END IF;

  NEW.travelers := private.trip_encrypt_travelers(merged);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.encrypt_trip_travelers_before_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_trip_details(p_trip_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT to_jsonb(t) || jsonb_build_object(
    'travelers', coalesce((
      SELECT jsonb_agg(item - 'passport_number' ORDER BY ordinality)
      FROM jsonb_array_elements(coalesce(t.travelers, '[]'::jsonb)) WITH ORDINALITY AS v(item, ordinality)
    ), '[]'::jsonb)
  )
  FROM public.trips t
  WHERE t.id = p_trip_id
    AND t.user_id = auth.uid()
    AND t.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_trip_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_details(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_trip_details(uuid) IS
  'Returns one owned active trip. Legacy passport keys are omitted and never decrypted.';

ALTER TABLE public.trip_templates
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'full_trip',
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE public.trip_templates DROP CONSTRAINT IF EXISTS trip_templates_template_type_check;
ALTER TABLE public.trip_templates ADD CONSTRAINT trip_templates_template_type_check
  CHECK (template_type IN ('full_trip','itinerary','hotel','transportation','pricing','checklist','message'));
ALTER TABLE public.trip_templates DROP CONSTRAINT IF EXISTS trip_templates_usage_count_check;
ALTER TABLE public.trip_templates ADD CONSTRAINT trip_templates_usage_count_check CHECK (usage_count >= 0);
CREATE INDEX IF NOT EXISTS trip_templates_favorite_idx
  ON public.trip_templates (user_id, is_favorite DESC, last_used_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND status = 'active';

CREATE OR REPLACE FUNCTION public.use_trip_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE payload jsonb;
BEGIN
  UPDATE public.trip_templates
  SET usage_count = usage_count + 1, last_used_at = now(), updated_at = now()
  WHERE id = p_template_id AND user_id = auth.uid() AND status = 'active' AND deleted_at IS NULL
  RETURNING template_data INTO payload;
  IF payload IS NULL THEN RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002'; END IF;
  RETURN payload;
END;
$$;
REVOKE ALL ON FUNCTION public.use_trip_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_trip_template(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('card','cash','mixed')),
  currency text NOT NULL CHECK (char_length(currency) BETWEEN 3 AND 8),
  card_total_minor bigint NOT NULL DEFAULT 0 CHECK (card_total_minor >= 0),
  cash_total_minor bigint NOT NULL DEFAULT 0 CHECK (cash_total_minor >= 0),
  card_paid_minor bigint NOT NULL DEFAULT 0 CHECK (card_paid_minor >= 0),
  cash_paid_minor bigint NOT NULL DEFAULT 0 CHECK (cash_paid_minor >= 0),
  installment_count integer NOT NULL DEFAULT 0 CHECK (installment_count BETWEEN 0 AND 120),
  first_installment_date date,
  source text NOT NULL DEFAULT 'native' CHECK (source IN ('native','legacy')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (card_paid_minor <= card_total_minor),
  CHECK (cash_paid_minor <= cash_total_minor),
  CHECK ((source = 'legacy') OR (card_total_minor + cash_total_minor > 0)),
  CHECK (source = 'legacy' OR (card_total_minor = 0 AND installment_count = 0) OR (card_total_minor > 0 AND installment_count >= 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS trip_payment_plans_one_active_idx
  ON public.trip_payment_plans (trip_id) WHERE deleted_at IS NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS trip_payment_plans_user_idx ON public.trip_payment_plans (user_id, updated_at DESC);
ALTER TABLE public.trip_payment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own trip payment plans" ON public.trip_payment_plans;
CREATE POLICY "Users manage own trip payment plans" ON public.trip_payment_plans FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.trip_payment_plans FROM anon, authenticated;
GRANT SELECT ON public.trip_payment_plans TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id uuid NOT NULL REFERENCES public.trip_payment_plans(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number BETWEEN 1 AND 120),
  due_date date NOT NULL,
  expected_amount_minor bigint NOT NULL CHECK (expected_amount_minor > 0),
  paid_amount_minor bigint NOT NULL DEFAULT 0 CHECK (paid_amount_minor >= 0),
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid','partially_paid','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_plan_id, installment_number),
  CHECK (paid_amount_minor <= expected_amount_minor),
  CHECK ((paid_amount_minor = 0 AND paid_at IS NULL) OR paid_amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS trip_installments_due_idx ON public.trip_installments (user_id, due_date, status);
ALTER TABLE public.trip_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own trip installments" ON public.trip_installments;
CREATE POLICY "Users manage own trip installments" ON public.trip_installments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.trip_payment_plans p
      WHERE p.id = payment_plan_id AND p.trip_id = trip_id AND p.user_id = auth.uid()
    )
  );
GRANT SELECT ON public.trip_installments TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_installment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  installment_id uuid NOT NULL REFERENCES public.trip_installments(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('created','paid','corrected','payment_undone','rescheduled','recalculated','cancelled')),
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_installment_events_idx ON public.trip_installment_events (installment_id, created_at DESC);
ALTER TABLE public.trip_installment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own installment events" ON public.trip_installment_events;
CREATE POLICY "Users read own installment events" ON public.trip_installment_events FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.trip_installment_events FROM anon, authenticated;
GRANT SELECT ON public.trip_installment_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_plan_id uuid NOT NULL REFERENCES public.trip_payment_plans(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('cash_paid','cash_corrected','cash_undone','plan_recalculated')),
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_payment_events_idx ON public.trip_payment_events (payment_plan_id, created_at DESC);
ALTER TABLE public.trip_payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own payment events" ON public.trip_payment_events;
CREATE POLICY "Users read own payment events" ON public.trip_payment_events FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.trip_payment_events FROM anon, authenticated;
GRANT SELECT ON public.trip_payment_events TO authenticated;

CREATE OR REPLACE FUNCTION public.create_trip_payment_plan(
  p_trip_id uuid, p_payment_method text, p_currency text,
  p_card_total_minor bigint, p_cash_total_minor bigint,
  p_installment_count integer, p_first_installment_date date, p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan_id uuid;
  total_minor bigint;
  base_minor bigint;
  i integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id AND user_id = auth.uid() AND deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Trip not found' USING ERRCODE = 'P0002'; END IF;
  IF p_payment_method NOT IN ('card','cash','mixed') OR p_card_total_minor < 0 OR p_cash_total_minor < 0
  THEN RAISE EXCEPTION 'Invalid payment plan' USING ERRCODE = '22023'; END IF;
  IF (p_payment_method = 'card' AND p_cash_total_minor <> 0)
    OR (p_payment_method = 'cash' AND p_card_total_minor <> 0)
    OR (p_payment_method = 'mixed' AND (p_card_total_minor = 0 OR p_cash_total_minor = 0))
  THEN RAISE EXCEPTION 'Payment method totals do not match' USING ERRCODE = '22023'; END IF;
  IF p_card_total_minor > 0 AND (p_installment_count < 1 OR p_installment_count > 120 OR p_first_installment_date IS NULL)
  THEN RAISE EXCEPTION 'Card installment schedule is incomplete' USING ERRCODE = '22023'; END IF;
  IF p_card_total_minor > 0 AND p_installment_count > p_card_total_minor
  THEN RAISE EXCEPTION 'Installment amount must be at least one minor unit' USING ERRCODE = '22023'; END IF;

  UPDATE public.trip_payment_plans SET status = 'cancelled', deleted_at = now(), updated_at = now()
  WHERE trip_id = p_trip_id AND user_id = auth.uid() AND deleted_at IS NULL AND status <> 'cancelled';

  INSERT INTO public.trip_payment_plans
    (trip_id, user_id, payment_method, currency, card_total_minor, cash_total_minor,
     installment_count, first_installment_date, notes)
  VALUES
    (p_trip_id, auth.uid(), p_payment_method, upper(p_currency), p_card_total_minor, p_cash_total_minor,
     CASE WHEN p_card_total_minor > 0 THEN p_installment_count ELSE 0 END,
     CASE WHEN p_card_total_minor > 0 THEN p_first_installment_date ELSE NULL END, nullif(trim(p_notes), ''))
  RETURNING id INTO plan_id;

  IF p_card_total_minor > 0 THEN
    total_minor := p_card_total_minor;
    base_minor := total_minor / p_installment_count;
    FOR i IN 1..p_installment_count LOOP
      INSERT INTO public.trip_installments
        (payment_plan_id, trip_id, user_id, installment_number, due_date, expected_amount_minor)
      VALUES (
        plan_id, p_trip_id, auth.uid(), i,
        (p_first_installment_date + make_interval(months => i - 1))::date,
        CASE WHEN i = p_installment_count THEN total_minor - base_minor * (p_installment_count - 1) ELSE base_minor END
      );
    END LOOP;
    INSERT INTO public.trip_installment_events (installment_id, trip_id, user_id, actor_user_id, event_type, new_state)
    SELECT id, trip_id, user_id, auth.uid(), 'created', to_jsonb(i) FROM public.trip_installments i WHERE payment_plan_id = plan_id;
  END IF;
  RETURN plan_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_trip_payment_plan(uuid,text,text,bigint,bigint,integer,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip_payment_plan(uuid,text,text,bigint,bigint,integer,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_trip_installment_payment(
  p_installment_id uuid, p_paid_amount_minor bigint, p_paid_at timestamptz, p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE old_row public.trip_installments%ROWTYPE; new_row public.trip_installments%ROWTYPE;
BEGIN
  SELECT * INTO old_row FROM public.trip_installments WHERE id = p_installment_id AND user_id = auth.uid() FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Installment not found' USING ERRCODE = 'P0002'; END IF;
  IF old_row.status = 'cancelled' OR p_paid_amount_minor < 0 OR p_paid_amount_minor > old_row.expected_amount_minor
  THEN RAISE EXCEPTION 'Invalid installment payment' USING ERRCODE = '22023'; END IF;
  UPDATE public.trip_installments SET
    paid_amount_minor = p_paid_amount_minor,
    paid_at = CASE WHEN p_paid_amount_minor > 0 THEN p_paid_at ELSE NULL END,
    status = CASE WHEN p_paid_amount_minor = 0 THEN 'scheduled'
                  WHEN p_paid_amount_minor = expected_amount_minor THEN 'paid' ELSE 'partially_paid' END,
    notes = nullif(trim(p_notes), ''), updated_at = now()
  WHERE id = p_installment_id RETURNING * INTO new_row;
  INSERT INTO public.trip_installment_events
    (installment_id, trip_id, user_id, actor_user_id, event_type, previous_state, new_state)
  VALUES (new_row.id, new_row.trip_id, new_row.user_id, auth.uid(),
    CASE WHEN p_paid_amount_minor = 0 THEN 'payment_undone' WHEN old_row.paid_amount_minor = 0 THEN 'paid' ELSE 'corrected' END,
    to_jsonb(old_row), to_jsonb(new_row));
  UPDATE public.trip_payment_plans p SET card_paid_minor = totals.paid, updated_at = now(),
    status = CASE WHEN totals.paid >= p.card_total_minor AND p.cash_paid_minor >= p.cash_total_minor THEN 'completed' ELSE 'active' END
  FROM (SELECT payment_plan_id, coalesce(sum(paid_amount_minor),0)::bigint AS paid FROM public.trip_installments WHERE payment_plan_id = new_row.payment_plan_id GROUP BY payment_plan_id) totals
  WHERE p.id = totals.payment_plan_id;
  RETURN to_jsonb(new_row);
END;
$$;
REVOKE ALL ON FUNCTION public.record_trip_installment_payment(uuid,bigint,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trip_installment_payment(uuid,bigint,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_trip_installment(p_installment_id uuid, p_due_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE old_row public.trip_installments%ROWTYPE; new_row public.trip_installments%ROWTYPE;
BEGIN
  SELECT * INTO old_row FROM public.trip_installments WHERE id = p_installment_id AND user_id = auth.uid() FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Installment not found' USING ERRCODE = 'P0002'; END IF;
  IF old_row.paid_amount_minor > 0 OR old_row.status = 'cancelled' THEN RAISE EXCEPTION 'Paid or cancelled installments cannot be rescheduled' USING ERRCODE = '22023'; END IF;
  UPDATE public.trip_installments SET due_date = p_due_date, updated_at = now() WHERE id = p_installment_id RETURNING * INTO new_row;
  INSERT INTO public.trip_installment_events (installment_id,trip_id,user_id,actor_user_id,event_type,previous_state,new_state)
  VALUES (new_row.id,new_row.trip_id,new_row.user_id,auth.uid(),'rescheduled',to_jsonb(old_row),to_jsonb(new_row));
  RETURN to_jsonb(new_row);
END;
$$;
REVOKE ALL ON FUNCTION public.reschedule_trip_installment(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_trip_installment(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_trip_cash_payment(
  p_payment_plan_id uuid, p_paid_amount_minor bigint, p_paid_at timestamptz, p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE old_row public.trip_payment_plans%ROWTYPE; new_row public.trip_payment_plans%ROWTYPE;
BEGIN
  SELECT * INTO old_row FROM public.trip_payment_plans
  WHERE id=p_payment_plan_id AND user_id=auth.uid() AND deleted_at IS NULL AND status<>'cancelled' FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'Payment plan not found' USING ERRCODE='P0002'; END IF;
  IF old_row.cash_total_minor=0 OR p_paid_amount_minor<0 OR p_paid_amount_minor>old_row.cash_total_minor
  THEN RAISE EXCEPTION 'Invalid cash payment' USING ERRCODE='22023'; END IF;
  UPDATE public.trip_payment_plans SET cash_paid_minor=p_paid_amount_minor,notes=nullif(trim(p_notes),''),updated_at=now(),
    status=CASE WHEN card_paid_minor>=card_total_minor AND p_paid_amount_minor>=cash_total_minor THEN 'completed' ELSE 'active' END
  WHERE id=p_payment_plan_id RETURNING * INTO new_row;
  INSERT INTO public.trip_payment_events
    (payment_plan_id,trip_id,user_id,actor_user_id,event_type,previous_state,new_state)
  VALUES (new_row.id,new_row.trip_id,new_row.user_id,auth.uid(),
    CASE WHEN p_paid_amount_minor=0 THEN 'cash_undone' WHEN old_row.cash_paid_minor=0 THEN 'cash_paid' ELSE 'cash_corrected' END,
    to_jsonb(old_row),to_jsonb(new_row)||jsonb_build_object('recorded_at',p_paid_at));
  RETURN to_jsonb(new_row);
END;
$$;
REVOKE ALL ON FUNCTION public.record_trip_cash_payment(uuid,bigint,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trip_cash_payment(uuid,bigint,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_future_trip_installments(
  p_payment_plan_id uuid, p_new_card_total_minor bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE plan_row public.trip_payment_plans%ROWTYPE; fixed_total bigint; unpaid_count integer; remaining bigint; base bigint; changed integer;
BEGIN
  SELECT * INTO plan_row FROM public.trip_payment_plans
  WHERE id=p_payment_plan_id AND user_id=auth.uid() AND source='native' AND deleted_at IS NULL AND status='active' FOR UPDATE;
  IF plan_row.id IS NULL THEN RAISE EXCEPTION 'Payment plan not found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(sum(expected_amount_minor) FILTER (WHERE paid_amount_minor>0 OR status<>'scheduled'),0)::bigint,
    count(*) FILTER (WHERE paid_amount_minor=0 AND status='scheduled')::integer
  INTO fixed_total,unpaid_count FROM public.trip_installments WHERE payment_plan_id=plan_row.id AND status<>'cancelled';
  IF p_new_card_total_minor<fixed_total OR unpaid_count=0
  THEN RAISE EXCEPTION 'New total cannot alter paid installments' USING ERRCODE='22023'; END IF;
  remaining:=p_new_card_total_minor-fixed_total; base:=remaining/unpaid_count;
  IF base<=0 THEN RAISE EXCEPTION 'Remaining installments must be positive' USING ERRCODE='22023'; END IF;
  WITH targets AS (
    SELECT id,row_number() OVER (ORDER BY installment_number) position
    FROM public.trip_installments WHERE payment_plan_id=plan_row.id AND paid_amount_minor=0 AND status='scheduled'
  )
  UPDATE public.trip_installments i SET expected_amount_minor=
    CASE WHEN targets.position=unpaid_count THEN remaining-base*(unpaid_count-1) ELSE base END,updated_at=now()
  FROM targets WHERE i.id=targets.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  UPDATE public.trip_payment_plans SET card_total_minor=p_new_card_total_minor,updated_at=now() WHERE id=plan_row.id;
  INSERT INTO public.trip_payment_events (payment_plan_id,trip_id,user_id,actor_user_id,event_type,previous_state,new_state)
  VALUES (plan_row.id,plan_row.trip_id,plan_row.user_id,auth.uid(),'plan_recalculated',to_jsonb(plan_row),jsonb_build_object('card_total_minor',p_new_card_total_minor));
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_future_trip_installments(uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_future_trip_installments(uuid,bigint) TO authenticated;

-- Preserve existing totals as legacy summaries. No installments are created.
INSERT INTO public.trip_payment_plans
  (trip_id,user_id,payment_method,currency,card_total_minor,cash_total_minor,card_paid_minor,cash_paid_minor,
   installment_count,source,status,created_at,updated_at)
SELECT t.id,t.user_id,coalesce(t.payment_method,'cash'),upper(coalesce(t.currency,'ILS')),
  CASE WHEN t.payment_method='card' THEN greatest(round(coalesce(t.sale_price,0)*100)::bigint,round(coalesce(t.amount_paid,0)*100)::bigint) WHEN t.payment_method='mixed' THEN greatest(0,round(coalesce(t.card_paid_amount,0)*100)::bigint) ELSE 0 END,
  CASE WHEN t.payment_method='cash' OR t.payment_method IS NULL THEN greatest(round(coalesce(t.sale_price,0)*100)::bigint,round(coalesce(t.amount_paid,0)*100)::bigint) WHEN t.payment_method='mixed' THEN greatest(0,round((coalesce(t.sale_price,0)-coalesce(t.card_paid_amount,0))*100)::bigint,round(coalesce(t.cash_paid_amount,0)*100)::bigint) ELSE 0 END,
  CASE WHEN t.payment_method='card' THEN round(coalesce(t.amount_paid,0)*100)::bigint WHEN t.payment_method='mixed' THEN round(coalesce(t.card_paid_amount,0)*100)::bigint ELSE 0 END,
  CASE WHEN t.payment_method='cash' OR t.payment_method IS NULL THEN round(coalesce(t.amount_paid,0)*100)::bigint WHEN t.payment_method='mixed' THEN round(coalesce(t.cash_paid_amount,0)*100)::bigint ELSE 0 END,
  0,'legacy',CASE WHEN coalesce(t.amount_due,0) <= 0 THEN 'completed' ELSE 'active' END,t.created_at,now()
FROM public.trips t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.trip_payment_plans p WHERE p.trip_id = t.id AND p.deleted_at IS NULL)
ON CONFLICT DO NOTHING;

ALTER TABLE public.trip_notification_settings
  ADD COLUMN IF NOT EXISTS trip_reminder_days integer[] NOT NULL DEFAULT ARRAY[30,14,7,1,0],
  ADD COLUMN IF NOT EXISTS payment_reminder_days integer[] NOT NULL DEFAULT ARRAY[7,3,1,0];
CREATE OR REPLACE FUNCTION public.trip_reminder_days_are_safe(value integer[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT cardinality(value) BETWEEN 1 AND 20 AND coalesce((SELECT bool_and(day BETWEEN 0 AND 365) FROM unnest(value) day),false);
$$;
REVOKE ALL ON FUNCTION public.trip_reminder_days_are_safe(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_reminder_days_are_safe(integer[]) TO authenticated, service_role;
ALTER TABLE public.trip_notification_settings DROP CONSTRAINT IF EXISTS trip_notification_settings_trip_days_check;
ALTER TABLE public.trip_notification_settings ADD CONSTRAINT trip_notification_settings_trip_days_check CHECK (public.trip_reminder_days_are_safe(trip_reminder_days));
ALTER TABLE public.trip_notification_settings DROP CONSTRAINT IF EXISTS trip_notification_settings_payment_days_check;
ALTER TABLE public.trip_notification_settings ADD CONSTRAINT trip_notification_settings_payment_days_check CHECK (public.trip_reminder_days_are_safe(payment_reminder_days));
ALTER TABLE public.trip_notifications
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_all_trip_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.trip_notifications SET read_at = coalesce(read_at, now())
  WHERE user_id = auth.uid() AND read_at IS NULL AND dismissed_at IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.mark_all_trip_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_trip_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_trip_notifications(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.trip_notifications
    (user_id,trip_id,notification_type,title_key,body_key,params,dedupe_key,scheduled_for)
  SELECT source.user_id,source.trip_id,source.notification_type,source.title_key,source.body_key,
    source.params,source.dedupe_key,p_now
  FROM (
    SELECT t.user_id,t.id trip_id,'upcoming_trip'::text notification_type,
      'notifications.travel.upcomingTitle'::text title_key,'notifications.travel.upcomingBody'::text body_key,
      jsonb_build_object('destination',t.destination,'startDate',t.start_date,'days',d.days) params,
      'trip-reminder:'||t.id||':'||t.start_date||':'||d.days dedupe_key
    FROM public.trips t
    JOIN public.trip_notification_settings s ON s.user_id=t.user_id AND s.upcoming_enabled
    CROSS JOIN LATERAL unnest(s.trip_reminder_days) d(days)
    WHERE t.deleted_at IS NULL AND t.status='active'
      AND t.start_date=((p_now AT TIME ZONE s.timezone)::date+d.days)
    UNION ALL
    SELECT i.user_id,i.trip_id,
      CASE WHEN i.due_date < (p_now AT TIME ZONE s.timezone)::date THEN 'installment_overdue' ELSE 'installment_due' END,
      CASE WHEN i.due_date < (p_now AT TIME ZONE s.timezone)::date THEN 'notifications.travel.overdueTitle' ELSE 'notifications.travel.installmentTitle' END,
      CASE WHEN i.due_date < (p_now AT TIME ZONE s.timezone)::date THEN 'notifications.travel.overdueBody' ELSE 'notifications.travel.installmentBody' END,
      jsonb_build_object('dueDate',i.due_date,'amountMinor',i.expected_amount_minor-i.paid_amount_minor,'currency',p.currency,'days',d.days),
      'installment:'||i.id||':'||CASE WHEN i.due_date < (p_now AT TIME ZONE s.timezone)::date THEN 'overdue:'||p_now::date ELSE d.days::text END
    FROM public.trip_installments i
    JOIN public.trip_payment_plans p ON p.id=i.payment_plan_id AND p.deleted_at IS NULL AND p.status='active'
    JOIN public.trips t ON t.id=i.trip_id AND t.deleted_at IS NULL AND t.status NOT IN ('cancelled','archived')
    JOIN public.trip_notification_settings s ON s.user_id=i.user_id AND s.payment_enabled
    CROSS JOIN LATERAL unnest(s.payment_reminder_days) d(days)
    WHERE i.status IN ('scheduled','partially_paid') AND i.paid_amount_minor<i.expected_amount_minor
      AND (i.due_date=((p_now AT TIME ZONE s.timezone)::date+d.days)
        OR (i.due_date<(p_now AT TIME ZONE s.timezone)::date AND d.days=0))
    UNION ALL
    SELECT t.user_id,t.id,'outstanding_before_travel','notifications.travel.paymentTitle','notifications.travel.paymentBody',
      jsonb_build_object('destination',t.destination,'amountDue',t.amount_due,'currency',t.currency),
      'outstanding-before-trip:'||t.id||':'||t.start_date
    FROM public.trips t JOIN public.trip_notification_settings s ON s.user_id=t.user_id AND s.payment_enabled
    WHERE t.deleted_at IS NULL AND t.status='active' AND t.amount_due>0
      AND t.start_date BETWEEN (p_now AT TIME ZONE s.timezone)::date AND (p_now AT TIME ZONE s.timezone)::date+7
    UNION ALL
    SELECT a.user_id,a.trip_id,'trip_changed','notifications.travel.changedTitle','notifications.travel.changedBody',
      jsonb_build_object('changeType',a.activity_type),'meaningful-change:'||a.id
    FROM public.trip_activity_log a
    JOIN public.trips t ON t.id=a.trip_id AND t.deleted_at IS NULL AND t.status<>'archived'
    WHERE a.activity_type IN ('trip_edited','trip_status_changed','payment_changed')
      AND a.created_at>p_now-interval '1 hour' AND a.created_at<=p_now
  ) source
  ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_trip_notifications(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_trip_notifications(timestamptz) TO service_role;

CREATE TABLE IF NOT EXISTS public.trip_packing_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120), is_template boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array' AND items::text !~* 'passport'),
  deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_packing_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own packing lists" ON public.trip_packing_lists;
CREATE POLICY "Users manage own packing lists" ON public.trip_packing_lists FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.trip_packing_lists TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_pricing_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_target_markup numeric(8,4) NOT NULL DEFAULT 20 CHECK (default_target_markup BETWEEN 0 AND 10000),
  minimum_profit_minor bigint NOT NULL DEFAULT 0 CHECK (minimum_profit_minor >= 0),
  currency text NOT NULL DEFAULT 'ILS', updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_pricing_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own pricing preferences" ON public.trip_pricing_preferences;
CREATE POLICY "Users manage own pricing preferences" ON public.trip_pricing_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.trip_pricing_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.get_travel_reports(
  p_start_date date, p_end_date date, p_currency text DEFAULT NULL,
  p_destination text DEFAULT NULL, p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH owned AS (
  SELECT t.* FROM public.trips t
  WHERE t.user_id = auth.uid() AND t.deleted_at IS NULL AND t.start_date BETWEEN p_start_date AND p_end_date
    AND t.status <> 'cancelled' AND (p_include_archived OR t.status <> 'archived')
    AND (nullif(p_currency,'') IS NULL OR t.currency = p_currency)
    AND (nullif(p_destination,'') IS NULL OR t.destination = p_destination)
), monthly AS (
  SELECT date_trunc('month', start_date)::date AS "month", currency, count(*) AS trip_count,
    sum(sale_price) sales,sum(wholesale_cost) cost,sum(profit) profit,sum(amount_paid) paid,sum(amount_due) outstanding,
    avg(CASE WHEN wholesale_cost > 0 THEN profit / wholesale_cost * 100 ELSE 0 END) average_markup
  FROM owned GROUP BY 1,2
), destinations AS (
  SELECT destination,currency,count(*) trip_count,sum(sale_price) sales,sum(profit) profit,sum(amount_due) outstanding,
    avg(CASE WHEN wholesale_cost > 0 THEN profit / wholesale_cost * 100 ELSE 0 END) average_markup,
    count(DISTINCT lower(trim(client_name))) FILTER (WHERE lower(trim(client_name)) IN (SELECT lower(trim(client_name)) FROM owned GROUP BY lower(trim(client_name)) HAVING count(*) > 1)) repeat_clients
  FROM owned GROUP BY 1,2
), clients AS (
  SELECT lower(trim(client_name)) client_key,max(client_name) client_name,max(client_phone) client_phone,currency,count(*) trip_count,
    max(start_date) last_trip_date,sum(sale_price) sales,sum(amount_due) outstanding,avg(sale_price) average_trip_value,
    mode() WITHIN GROUP (ORDER BY destination) common_destination
  FROM owned GROUP BY 1,4 HAVING count(*) > 1
), currencies AS (
  SELECT currency,count(*) trip_count,sum(sale_price) sales,sum(wholesale_cost) cost,sum(profit) profit,sum(amount_paid) paid,sum(amount_due) outstanding
  FROM owned GROUP BY currency
), markups AS (
  SELECT 'overall'::text dimension,'all'::text label,currency,
    avg(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END) average_markup,
    min(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END) minimum_markup,
    max(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END) maximum_markup,count(*) trip_count
  FROM owned GROUP BY currency
  UNION ALL
  SELECT 'destination',destination,currency,avg(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),
    min(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),max(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),count(*)
  FROM owned GROUP BY destination,currency
  UNION ALL
  SELECT 'trip_type',coalesce(trip_type,'unspecified'),currency,avg(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),
    min(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),max(CASE WHEN wholesale_cost>0 THEN profit/wholesale_cost*100 ELSE 0 END),count(*)
  FROM owned GROUP BY trip_type,currency
)
SELECT jsonb_build_object(
  'monthly',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m."month", m.currency) FROM monthly m),'[]'::jsonb),
  'destinations',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY profit DESC) FROM destinations d),'[]'::jsonb),
  'repeat_clients',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY trip_count DESC) FROM clients c),'[]'::jsonb),
  'unpaid',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY start_date) FROM (
    SELECT o.id,o.client_name,o.destination,o.start_date,o.currency,o.sale_price,o.amount_paid,o.amount_due,o.payment_method,o.payment_status,
      next_i.due_date next_installment_date,next_i.remaining_minor next_installment_minor,coalesce(overdue.overdue_minor,0) overdue_minor
    FROM owned o
    LEFT JOIN LATERAL (
      SELECT i.due_date,i.expected_amount_minor-i.paid_amount_minor remaining_minor
      FROM public.trip_installments i WHERE i.trip_id=o.id AND i.status IN ('scheduled','partially_paid') AND i.paid_amount_minor<i.expected_amount_minor
      ORDER BY i.due_date LIMIT 1
    ) next_i ON true
    LEFT JOIN LATERAL (
      SELECT sum(i.expected_amount_minor-i.paid_amount_minor)::bigint overdue_minor
      FROM public.trip_installments i WHERE i.trip_id=o.id AND i.status IN ('scheduled','partially_paid') AND i.due_date<current_date
    ) overdue ON true WHERE o.amount_due>0
  ) u),'[]'::jsonb),
  'currencies',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY currency) FROM currencies c),'[]'::jsonb),
  'markups',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY dimension,label,currency) FROM markups m),'[]'::jsonb)
); $$;
REVOKE ALL ON FUNCTION public.get_travel_reports(date,date,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_reports(date,date,text,text,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
