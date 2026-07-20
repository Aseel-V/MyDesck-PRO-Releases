-- ============================================================================
-- FIX KDS TICKET CREATION
-- Date: 2026-01-24
-- Description: Smarter ticket creation to prevent duplicates and handle incremental orders
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_kitchen_ticket(
  p_order_id uuid,
  p_station text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_business_id uuid;
  v_table_name text;
  v_new_items_count int;
BEGIN
  -- Get order details and verify ownership
  SELECT o.business_id, COALESCE(t.name, 'Counter')
  INTO v_business_id, v_table_name
  FROM public.restaurant_orders o
  LEFT JOIN public.restaurant_tables t ON o.table_id = t.id
  WHERE o.id = p_order_id
    AND o.business_id = auth.uid();

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Order not found or unauthorized';
  END IF;

  -- Check if there are any items that need to be ticketed
  -- Criteria:
  -- 1. Belong to this order
  -- 2. Are marked as is_fired = true
  -- 3. Are NOT already linked to a ticket item
  SELECT count(*)
  INTO v_new_items_count
  FROM public.restaurant_order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.is_fired = true
    AND NOT EXISTS (
      SELECT 1 FROM public.restaurant_ticket_items ti
      WHERE ti.order_item_id = oi.id
    );

  -- If no new items to ticket, return null (but don't error)
  IF v_new_items_count = 0 THEN
    RETURN NULL;
  END IF;

  -- Create the new ticket
  INSERT INTO public.restaurant_kitchen_tickets (
    business_id, order_id, table_name, station, status
  ) VALUES (
    v_business_id, p_order_id, v_table_name, p_station, 'new'
  )
  RETURNING id INTO v_ticket_id;

  -- Populate ticket items ONLY for the new, unticketed items
  INSERT INTO public.restaurant_ticket_items (
    ticket_id, order_item_id, item_name, quantity, notes, modifiers_text
  )
  SELECT 
    v_ticket_id,
    oi.id,
    mi.name,
    oi.quantity,
    oi.notes,
    (
      SELECT string_agg(oim.modifier_name, ', ')
      FROM public.restaurant_order_item_modifiers oim
      WHERE oim.order_item_id = oi.id
    )
  FROM public.restaurant_order_items oi
  JOIN public.restaurant_menu_items mi ON oi.item_id = mi.id
  WHERE oi.order_id = p_order_id
    AND oi.is_fired = true
    AND NOT EXISTS (
      SELECT 1 FROM public.restaurant_ticket_items ti
      WHERE ti.order_item_id = oi.id
    );

  RETURN v_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_kitchen_ticket(uuid, text) TO authenticated;
