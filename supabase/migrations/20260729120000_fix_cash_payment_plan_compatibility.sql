-- Forward-only Cash payment-plan compatibility correction.
-- Older save_trip_transaction definitions can retain card_paid_minor while
-- changing card_total_minor to zero, violating trip_payment_plans_check.

CREATE OR REPLACE FUNCTION public.enforce_cash_payment_plan_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF new.payment_method <> 'cash' THEN
    RETURN new;
  END IF;

  IF new.card_total_minor <> 0 OR new.installment_count <> 0 THEN
    RAISE EXCEPTION 'INVALID_CASH_PAYMENT_PLAN' USING ERRCODE = '22023';
  END IF;

  IF tg_op = 'UPDATE'
    AND old.payment_method IN ('card', 'mixed')
    AND EXISTS (
      SELECT 1
      FROM public.trip_installments AS receipt
      WHERE receipt.payment_plan_id = old.id
        AND receipt.paid_amount_minor > 0
    )
  THEN
    RAISE EXCEPTION 'PAYMENT_PLAN_CONFIRMED_SCHEDULE_CONFLICT' USING ERRCODE = '22023';
  END IF;

  -- card_paid_minor is a compatibility aggregate, not a confirmed receipt.
  -- A Cash plan has no Card allocation, so the compatibility value must be zero.
  new.card_paid_minor := 0;
  new.first_installment_date := NULL;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS enforce_cash_payment_plan_row_trigger ON public.trip_payment_plans;
CREATE TRIGGER enforce_cash_payment_plan_row_trigger
BEFORE INSERT OR UPDATE ON public.trip_payment_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_cash_payment_plan_row();

REVOKE ALL ON FUNCTION public.enforce_cash_payment_plan_row() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_travel_payment_contract_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 2;
$$;

REVOKE ALL ON FUNCTION public.get_travel_payment_contract_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_travel_payment_contract_version() TO authenticated;

COMMENT ON FUNCTION public.get_travel_payment_contract_version() IS
  'Payment write contract version 2: canonical receipts and Cash-row compatibility guard.';

NOTIFY pgrst, 'reload schema';
