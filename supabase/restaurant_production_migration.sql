-- ============================================================================
-- RESTAURANT MODE PRODUCTION MIGRATION
-- Version: 1.0.0 | Date: 2026-01-11
-- Description: Production-ready schema, RLS policies, and business functions
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SECTION 1: NEW TABLES FOR PRODUCTION
-- ============================================================================

-- 1.1: Modifier Groups (e.g., "Cooking Temperature", "Toppings")
CREATE TABLE IF NOT EXISTS public.restaurant_modifier_groups (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  is_required boolean DEFAULT false,
  min_selections int DEFAULT 0,
  max_selections int DEFAULT 1,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 1.2: Individual Modifiers (e.g., "Medium Rare", "Extra Cheese +$2")
CREATE TABLE IF NOT EXISTS public.restaurant_modifiers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id uuid REFERENCES public.restaurant_modifier_groups(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  price_adjustment numeric DEFAULT 0,
  is_available boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 1.3: Link Menu Items to Modifier Groups (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.restaurant_item_modifier_groups (
  item_id uuid REFERENCES public.restaurant_menu_items(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.restaurant_modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, group_id)
);

-- 1.4: Order Item Modifiers (Selected modifiers per order line)
CREATE TABLE IF NOT EXISTS public.restaurant_order_item_modifiers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_item_id uuid REFERENCES public.restaurant_order_items(id) ON DELETE CASCADE NOT NULL,
  modifier_id uuid REFERENCES public.restaurant_modifiers(id) ON DELETE SET NULL,
  modifier_name text NOT NULL,           -- Snapshot for historical integrity
  price_adjustment numeric DEFAULT 0,    -- Snapshot
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 1.5: Kitchen Tickets (For KDS)
CREATE TABLE IF NOT EXISTS public.restaurant_kitchen_tickets (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES public.restaurant_orders(id) ON DELETE CASCADE NOT NULL,
  table_name text,                       -- Snapshot for display
  station text,                          -- "Grill", "Fry", "Salad", "Expo"
  status text CHECK (status IN ('new', 'in_progress', 'ready', 'served', 'cancelled')) DEFAULT 'new',
  priority int DEFAULT 0,                -- Higher = more urgent
  created_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  served_at timestamptz
);

-- 1.6: Ticket Items (Individual items on a ticket)
CREATE TABLE IF NOT EXISTS public.restaurant_ticket_items (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id uuid REFERENCES public.restaurant_kitchen_tickets(id) ON DELETE CASCADE NOT NULL,
  order_item_id uuid REFERENCES public.restaurant_order_items(id) ON DELETE CASCADE NOT NULL,
  item_name text NOT NULL,               -- Snapshot
  quantity int DEFAULT 1,
  notes text,
  modifiers_text text,                   -- Comma-separated modifiers for quick display
  status text CHECK (status IN ('pending', 'cooking', 'ready', 'cancelled')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 1.7: Table Sessions (Track dining sessions for covers & turnover)
CREATE TABLE IF NOT EXISTS public.restaurant_table_sessions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  guest_count int NOT NULL DEFAULT 1,
  server_id uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  status text CHECK (status IN ('active', 'billed', 'closed')) DEFAULT 'active'
);

-- Add session_id to orders for linking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'session_id') THEN
    ALTER TABLE public.restaurant_orders 
      ADD COLUMN session_id uuid REFERENCES public.restaurant_table_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SECTION 2: ENABLE ROW LEVEL SECURITY ON ALL NEW TABLES
-- ============================================================================

ALTER TABLE public.restaurant_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_table_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 3: PRODUCTION RLS POLICIES (MULTI-TENANT SECURITY)
-- ============================================================================
-- CRITICAL: These policies ensure Tenant A (Pizza Shop) CANNOT access Tenant B (Burger Joint) data

-- 3.1: Modifier Groups - Direct business_id ownership
DROP POLICY IF EXISTS "Tenant isolation for modifier groups" ON public.restaurant_modifier_groups;
CREATE POLICY "Tenant isolation for modifier groups" ON public.restaurant_modifier_groups
  FOR ALL
  USING (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- 3.2: Modifiers - Access through parent modifier group
DROP POLICY IF EXISTS "Tenant isolation for modifiers" ON public.restaurant_modifiers;
CREATE POLICY "Tenant isolation for modifiers" ON public.restaurant_modifiers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_modifier_groups mg
      WHERE mg.id = restaurant_modifiers.group_id
      AND mg.business_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_modifier_groups mg
      WHERE mg.id = restaurant_modifiers.group_id
      AND mg.business_id = auth.uid()
    )
  );

-- 3.3: Item-Modifier Links - Access through menu item ownership
DROP POLICY IF EXISTS "Tenant isolation for item modifier links" ON public.restaurant_item_modifier_groups;
CREATE POLICY "Tenant isolation for item modifier links" ON public.restaurant_item_modifier_groups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_menu_items mi
      JOIN public.restaurant_menu_categories mc ON mi.category_id = mc.id
      WHERE mi.id = restaurant_item_modifier_groups.item_id
      AND mc.business_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_menu_items mi
      JOIN public.restaurant_menu_categories mc ON mi.category_id = mc.id
      WHERE mi.id = restaurant_item_modifier_groups.item_id
      AND mc.business_id = auth.uid()
    )
  );

-- 3.4: Order Item Modifiers - Access through order ownership
DROP POLICY IF EXISTS "Tenant isolation for order item modifiers" ON public.restaurant_order_item_modifiers;
CREATE POLICY "Tenant isolation for order item modifiers" ON public.restaurant_order_item_modifiers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_order_items oi
      JOIN public.restaurant_orders o ON oi.order_id = o.id
      WHERE oi.id = restaurant_order_item_modifiers.order_item_id
      AND o.business_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_order_items oi
      JOIN public.restaurant_orders o ON oi.order_id = o.id
      WHERE oi.id = restaurant_order_item_modifiers.order_item_id
      AND o.business_id = auth.uid()
    )
  );

-- 3.5: Kitchen Tickets - Direct business_id ownership
DROP POLICY IF EXISTS "Tenant isolation for kitchen tickets" ON public.restaurant_kitchen_tickets;
CREATE POLICY "Tenant isolation for kitchen tickets" ON public.restaurant_kitchen_tickets
  FOR ALL
  USING (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- 3.6: Ticket Items - Access through parent ticket
DROP POLICY IF EXISTS "Tenant isolation for ticket items" ON public.restaurant_ticket_items;
CREATE POLICY "Tenant isolation for ticket items" ON public.restaurant_ticket_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_kitchen_tickets kt
      WHERE kt.id = restaurant_ticket_items.ticket_id
      AND kt.business_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_kitchen_tickets kt
      WHERE kt.id = restaurant_ticket_items.ticket_id
      AND kt.business_id = auth.uid()
    )
  );

-- 3.7: Table Sessions - Direct business_id ownership
DROP POLICY IF EXISTS "Tenant isolation for table sessions" ON public.restaurant_table_sessions;
CREATE POLICY "Tenant isolation for table sessions" ON public.restaurant_table_sessions
  FOR ALL
  USING (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- ============================================================================
-- SECTION 4: INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_business_status 
  ON public.restaurant_kitchen_tickets(business_id, status);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_created 
  ON public.restaurant_kitchen_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_items_ticket_status 
  ON public.restaurant_ticket_items(ticket_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_business_status 
  ON public.restaurant_orders(business_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_created 
  ON public.restaurant_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_table_sessions_business_active 
  ON public.restaurant_table_sessions(business_id, status)
  WHERE status = 'active';

-- ============================================================================
-- SECTION 5: CLOSE BUSINESS DAY (Z-REPORT) FUNCTION
-- ============================================================================
-- CRITICAL: This runs in a single ATOMIC transaction to prevent data loss

DROP FUNCTION IF EXISTS public.close_business_day(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.close_business_day(
  p_business_id uuid,
  p_currency text DEFAULT 'ILS',
  p_total_labor_cost numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated permissions
SET search_path = public
AS $$
DECLARE
  v_report_date date := CURRENT_DATE;
  v_report_id uuid;
  v_z_number int;
  v_total_cash numeric := 0;
  v_total_card numeric := 0;
  v_total_tax numeric := 0;
  v_total_tips numeric := 0;
  v_total_sales numeric := 0;
  v_orders_closed int := 0;
  v_covers int := 0;
  v_result json;
BEGIN
  -- Security check: Ensure the caller owns this business
  IF auth.uid() IS NULL OR auth.uid() != p_business_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only close your own business day';
  END IF;

  -- Check if day already closed
  IF EXISTS (
    SELECT 1 FROM public.restaurant_daily_reports 
    WHERE business_id = p_business_id AND date = v_report_date
  ) THEN
    RAISE EXCEPTION 'Business day already closed for %', v_report_date;
  END IF;

  -- Calculate totals from open orders
  SELECT 
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method IN ('card', 'split') THEN total_amount ELSE 0 END), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(tip_amount), 0),
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO v_total_cash, v_total_card, v_total_tax, v_total_tips, v_total_sales, v_orders_closed
  FROM public.restaurant_orders
  WHERE business_id = p_business_id
    AND status = 'open'
    AND created_at::date = v_report_date;

  -- Calculate covers from active sessions
  SELECT COALESCE(SUM(guest_count), 0)
  INTO v_covers
  FROM public.restaurant_table_sessions
  WHERE business_id = p_business_id
    AND status IN ('active', 'billed')
    AND started_at::date = v_report_date;

  -- Get next Z-Report number for this business
  SELECT COALESCE(MAX(z_report_number), 0) + 1
  INTO v_z_number
  FROM public.restaurant_daily_reports
  WHERE business_id = p_business_id;

  -- BEGIN ATOMIC OPERATIONS --
  
  -- 1. Close all open orders
  UPDATE public.restaurant_orders
  SET 
    status = 'closed',
    closed_at = now()
  WHERE business_id = p_business_id
    AND status = 'open'
    AND created_at::date = v_report_date;

  -- 2. Close all active table sessions
  UPDATE public.restaurant_table_sessions
  SET 
    status = 'closed',
    ended_at = now()
  WHERE business_id = p_business_id
    AND status IN ('active', 'billed')
    AND started_at::date = v_report_date;

  -- 3. Mark all tables as free
  UPDATE public.restaurant_tables
  SET status = 'free'
  WHERE business_id = p_business_id
    AND status != 'free';

  -- 4. Mark all pending kitchen tickets as cancelled
  UPDATE public.restaurant_kitchen_tickets
  SET status = 'cancelled'
  WHERE business_id = p_business_id
    AND status IN ('new', 'in_progress')
    AND created_at::date = v_report_date;

  -- 5. Create the Z-Report record
  INSERT INTO public.restaurant_daily_reports (
    id,
    business_id,
    date,
    z_report_number,
    total_sales_cash,
    total_sales_card,
    total_tax,
    total_tips,
    total_expenses,
    total_labor_cost,
    net_profit,
    currency
  ) VALUES (
    uuid_generate_v4(),
    p_business_id,
    v_report_date,
    v_z_number,
    v_total_cash,
    v_total_card,
    v_total_tax,
    v_total_tips,
    0, -- total_expenses (can be added later)
    p_total_labor_cost,
    (v_total_cash + v_total_card) - p_total_labor_cost,
    p_currency
  )
  RETURNING id INTO v_report_id;

  -- END ATOMIC OPERATIONS --

  -- Build result JSON
  v_result := json_build_object(
    'success', true,
    'report_id', v_report_id,
    'z_report_number', v_z_number,
    'date', v_report_date,
    'summary', json_build_object(
      'total_sales_cash', v_total_cash,
      'total_sales_card', v_total_card,
      'total_tax', v_total_tax,
      'total_tips', v_total_tips,
      'total_sales', v_total_sales,
      'orders_closed', v_orders_closed,
      'covers', v_covers,
      'labor_cost', p_total_labor_cost,
      'net_profit', (v_total_cash + v_total_card) - p_total_labor_cost
    )
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Transaction automatically rolls back
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.close_business_day(uuid, text, numeric) TO authenticated;

-- ============================================================================
-- SECTION 6: HELPER FUNCTION - CREATE KITCHEN TICKET FROM ORDER
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_kitchen_ticket(uuid, text);

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

  -- Create the ticket
  INSERT INTO public.restaurant_kitchen_tickets (
    business_id, order_id, table_name, station, status
  ) VALUES (
    v_business_id, p_order_id, v_table_name, p_station, 'new'
  )
  RETURNING id INTO v_ticket_id;

  -- Populate ticket items from order items
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
  WHERE oi.order_id = p_order_id;

  RETURN v_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_kitchen_ticket(uuid, text) TO authenticated;

-- ============================================================================
-- SECTION 7: REALTIME CONFIGURATION
-- ============================================================================
-- Enable realtime for kitchen tickets (KDS)

ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_kitchen_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_ticket_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_orders;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
