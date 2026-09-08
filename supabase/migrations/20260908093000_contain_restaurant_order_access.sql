BEGIN;
-- Historical permissive DELETE policies granted access solely by status.
-- Keep the state restrictions, but require tenant ownership as well.
DROP POLICY IF EXISTS orders_no_delete_after_sent ON public.restaurant_orders;
CREATE POLICY orders_no_delete_after_sent ON public.restaurant_orders AS RESTRICTIVE
FOR DELETE TO authenticated USING (status='draft' AND business_id=auth.uid());
DROP POLICY IF EXISTS items_no_delete_after_cooking ON public.restaurant_order_items;
CREATE POLICY items_no_delete_after_cooking ON public.restaurant_order_items AS RESTRICTIVE
FOR DELETE TO authenticated USING (status IN ('pending','cancelled') AND EXISTS (
 SELECT 1 FROM public.restaurant_orders o WHERE o.id=order_id AND o.business_id=auth.uid()
));
CREATE POLICY "Restaurant orders mandatory tenant boundary" ON public.restaurant_orders AS RESTRICTIVE
FOR ALL TO PUBLIC USING (business_id=auth.uid()) WITH CHECK (business_id=auth.uid());
CREATE POLICY "Restaurant order items mandatory tenant boundary" ON public.restaurant_order_items AS RESTRICTIVE
FOR ALL TO PUBLIC USING (EXISTS (
 SELECT 1 FROM public.restaurant_orders o WHERE o.id=order_id AND o.business_id=auth.uid()
)) WITH CHECK (EXISTS (
 SELECT 1 FROM public.restaurant_orders o WHERE o.id=order_id AND o.business_id=auth.uid()
));
COMMIT;
