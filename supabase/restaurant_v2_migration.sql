-- ============================================================================
-- RESTAURANT MODE - COMPLETE PRODUCTION MIGRATION
-- Version: 2.0.0 | Date: 2026-01-11
-- Description: Full schema for enterprise Restaurant Management System
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SECTION 1: ENHANCED TABLES TABLE
-- ============================================================================

-- Add new columns to restaurant_tables if they don't exist
DO $$
BEGIN
  -- Shape column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'shape') THEN
    ALTER TABLE public.restaurant_tables 
      ADD COLUMN shape text DEFAULT 'round' CHECK (shape IN ('round', 'square', 'rectangle', 'booth', 'bar'));
  END IF;
  
  -- Zone column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'zone') THEN
    ALTER TABLE public.restaurant_tables 
      ADD COLUMN zone text DEFAULT 'indoor' CHECK (zone IN ('indoor', 'outdoor', 'patio', 'private', 'bar_area'));
  END IF;
  
  -- Dimensions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'width') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN width float DEFAULT 100;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'height') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN height float DEFAULT 100;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'rotation') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN rotation float DEFAULT 0;
  END IF;
  
  -- Min party size
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'min_party_size') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN min_party_size int DEFAULT 1;
  END IF;
  
  -- Merge capability
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'is_mergeable') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN is_mergeable boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'merged_with') THEN
    ALTER TABLE public.restaurant_tables ADD COLUMN merged_with uuid[] DEFAULT '{}';
  END IF;
  
  -- Update status constraint to include new statuses
  ALTER TABLE public.restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_status_check;
  ALTER TABLE public.restaurant_tables 
    ADD CONSTRAINT restaurant_tables_status_check 
    CHECK (status IN ('free', 'occupied', 'billed', 'reserved', 'dirty', 'blocked'));
END $$;

-- ============================================================================
-- SECTION 2: ENHANCED MENU SYSTEM
-- ============================================================================

-- Add new columns to menu categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_categories' AND column_name = 'name_he') THEN
    ALTER TABLE public.restaurant_menu_categories ADD COLUMN name_he text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_categories' AND column_name = 'name_ar') THEN
    ALTER TABLE public.restaurant_menu_categories ADD COLUMN name_ar text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_categories' AND column_name = 'parent_id') THEN
    ALTER TABLE public.restaurant_menu_categories ADD COLUMN parent_id uuid REFERENCES public.restaurant_menu_categories(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_categories' AND column_name = 'is_active') THEN
    ALTER TABLE public.restaurant_menu_categories ADD COLUMN is_active boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_categories' AND column_name = 'icon') THEN
    ALTER TABLE public.restaurant_menu_categories ADD COLUMN icon text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_categories' AND column_name = 'color') THEN
    ALTER TABLE public.restaurant_menu_categories ADD COLUMN color text;
  END IF;
END $$;

-- Add new columns to menu items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'name_he') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN name_he text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'name_ar') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN name_ar text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'cost_price') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN cost_price numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'prep_time_minutes') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN prep_time_minutes int DEFAULT 15;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'station') THEN
    ALTER TABLE public.restaurant_menu_items 
      ADD COLUMN station text DEFAULT 'general' 
      CHECK (station IN ('grill', 'fry', 'salad', 'bar', 'expo', 'dessert', 'general'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'allergens') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN allergens text[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'calories') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN calories int;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'image_url') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN image_url text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'sort_order') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN sort_order int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'is_popular') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN is_popular boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'is_new') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN is_new boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'available_from') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN available_from time;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'available_until') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN available_until time;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'available_days') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN available_days int[] DEFAULT '{0,1,2,3,4,5,6}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'spicy_level') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN spicy_level int DEFAULT 0 CHECK (spicy_level >= 0 AND spicy_level <= 3);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_menu_items' AND column_name = 'dietary_tags') THEN
    ALTER TABLE public.restaurant_menu_items ADD COLUMN dietary_tags text[] DEFAULT '{}';
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: ENHANCED STAFF TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'user_id') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'restaurant_role') THEN
    ALTER TABLE public.restaurant_staff 
      ADD COLUMN restaurant_role text DEFAULT 'waiter'
      CHECK (restaurant_role IN ('super_admin', 'branch_manager', 'head_chef', 'waiter', 'kitchen_staff', 'cashier', 'host'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'pin_code') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN pin_code text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'email') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN email text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'phone') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN phone text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'is_clocked_in') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN is_clocked_in boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'clocked_in_at') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN clocked_in_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'assigned_tables') THEN
    ALTER TABLE public.restaurant_staff ADD COLUMN assigned_tables uuid[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_staff' AND column_name = 'assigned_station') THEN
    ALTER TABLE public.restaurant_staff 
      ADD COLUMN assigned_station text 
      CHECK (assigned_station IS NULL OR assigned_station IN ('grill', 'fry', 'salad', 'bar', 'expo', 'dessert', 'general'));
  END IF;
  
  -- Update role constraint
  ALTER TABLE public.restaurant_staff DROP CONSTRAINT IF EXISTS restaurant_staff_role_check;
  ALTER TABLE public.restaurant_staff 
    ADD CONSTRAINT restaurant_staff_role_check 
    CHECK (role IN ('Waiter', 'Chef', 'Manager', 'Other', 'Host', 'Cashier', 'Kitchen'));
END $$;

-- ============================================================================
-- SECTION 4: ENHANCED ORDERS TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'order_number') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN order_number serial;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'order_type') THEN
    ALTER TABLE public.restaurant_orders 
      ADD COLUMN order_type text DEFAULT 'dine_in'
      CHECK (order_type IN ('dine_in', 'takeaway', 'delivery'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'server_id') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN server_id uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'guest_id') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN guest_id uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'subtotal_amount') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN subtotal_amount numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'discount_amount') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN discount_amount numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'discount_percentage') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN discount_percentage numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'discount_reason') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN discount_reason text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'payment_status') THEN
    ALTER TABLE public.restaurant_orders 
      ADD COLUMN payment_status text DEFAULT 'pending'
      CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'is_rush') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN is_rush boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'is_vip') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN is_vip boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'course_number') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN course_number int DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_orders' AND column_name = 'notes') THEN
    ALTER TABLE public.restaurant_orders ADD COLUMN notes text;
  END IF;
  
  -- Update status constraint
  ALTER TABLE public.restaurant_orders DROP CONSTRAINT IF EXISTS restaurant_orders_status_check;
  ALTER TABLE public.restaurant_orders 
    ADD CONSTRAINT restaurant_orders_status_check 
    CHECK (status IN ('draft', 'pending', 'in_progress', 'ready', 'served', 'billed', 'open', 'closed', 'cancelled'));
END $$;

-- ============================================================================
-- SECTION 5: ENHANCED ORDER ITEMS TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_order_items' AND column_name = 'status') THEN
    ALTER TABLE public.restaurant_order_items 
      ADD COLUMN status text DEFAULT 'pending'
      CHECK (status IN ('pending', 'cooking', 'ready', 'cancelled'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_order_items' AND column_name = 'is_fired') THEN
    ALTER TABLE public.restaurant_order_items ADD COLUMN is_fired boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_order_items' AND column_name = 'course_number') THEN
    ALTER TABLE public.restaurant_order_items ADD COLUMN course_number int DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_order_items' AND column_name = 'seat_number') THEN
    ALTER TABLE public.restaurant_order_items ADD COLUMN seat_number int;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_order_items' AND column_name = 'voided') THEN
    ALTER TABLE public.restaurant_order_items ADD COLUMN voided boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_order_items' AND column_name = 'void_reason') THEN
    ALTER TABLE public.restaurant_order_items ADD COLUMN void_reason text;
  END IF;
END $$;

-- ============================================================================
-- SECTION 6: GUEST PROFILES TABLE (USP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_guest_profiles (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  first_name text NOT NULL,
  last_name text,
  full_name text GENERATED ALWAYS AS (first_name || COALESCE(' ' || last_name, '')) STORED,
  phone text,
  email text,
  visit_count int DEFAULT 0,
  total_lifetime_spend numeric DEFAULT 0,
  average_check numeric DEFAULT 0,
  last_visit_date date,
  favorite_items uuid[] DEFAULT '{}',
  dietary_restrictions text[] DEFAULT '{}',
  allergies text[] DEFAULT '{}',
  seating_preference text DEFAULT 'any' CHECK (seating_preference IN ('booth', 'table', 'patio', 'bar', 'any')),
  noise_preference text CHECK (noise_preference IN ('quiet', 'lively', 'any')),
  preferred_server_id uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  notes text,
  tags text[] DEFAULT '{}',
  birthdate date,
  anniversary date,
  vip_level int DEFAULT 0 CHECK (vip_level >= 0 AND vip_level <= 3),
  marketing_opt_in boolean DEFAULT false,
  whatsapp_opt_in boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 7: RESERVATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_reservations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  guest_id uuid REFERENCES public.restaurant_guest_profiles(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  guest_email text,
  party_size int NOT NULL DEFAULT 2,
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  duration_minutes int DEFAULT 90,
  table_ids uuid[] DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  notes text,
  special_requests text,
  source text DEFAULT 'phone' CHECK (source IN ('phone', 'website', 'walk_in', 'app', 'whatsapp')),
  reminder_sent boolean DEFAULT false,
  confirmation_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  seated_at timestamptz
);

-- ============================================================================
-- SECTION 8: WAITLIST TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_waitlist (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  party_size int NOT NULL DEFAULT 2,
  estimated_wait_minutes int DEFAULT 30,
  quoted_wait_minutes int DEFAULT 30,
  check_in_time timestamptz DEFAULT now() NOT NULL,
  status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'seated', 'left', 'no_show')),
  notes text,
  notification_sent_at timestamptz,
  seated_at timestamptz,
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL
);

-- ============================================================================
-- SECTION 9: PAYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_payments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES public.restaurant_orders(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'card', 'split')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  tip_amount numeric DEFAULT 0,
  reference_number text,
  card_last_four text,
  card_type text,
  processed_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  processed_at timestamptz DEFAULT now(),
  refunded_at timestamptz,
  refund_reason text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 10: CASH DRAWER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_cash_drawers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  opened_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  opened_at timestamptz DEFAULT now() NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  expected_balance numeric DEFAULT 0,
  actual_balance numeric,
  closed_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  closed_at timestamptz,
  variance numeric,
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

-- ============================================================================
-- SECTION 11: CASH TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_cash_transactions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  drawer_id uuid REFERENCES public.restaurant_cash_drawers(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('cash_in', 'cash_out', 'sale', 'refund', 'tip_out', 'expense')),
  amount numeric NOT NULL,
  reference_id uuid,
  notes text,
  performed_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 12: VOID LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_void_logs (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES public.restaurant_orders(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.restaurant_order_items(id) ON DELETE SET NULL,
  void_type text NOT NULL CHECK (void_type IN ('order', 'item')),
  original_amount numeric NOT NULL,
  reason text NOT NULL,
  approved_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  performed_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 13: WHATSAPP SETTINGS TABLE (USP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_whatsapp_settings (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_enabled boolean DEFAULT false,
  phone_number_id text,
  access_token text,
  webhook_verify_token text,
  templates jsonb DEFAULT '{
    "reservation_confirmed": "שלום {name}, ההזמנה שלך ל-{date} בשעה {time} אושרה. נתראה! 🍽️",
    "reservation_reminder": "תזכורת: יש לך הזמנה היום בשעה {time}. מחכים לראותך!",
    "table_ready": "השולחן שלך מוכן! בבקשה התקרב לכניסה. 🎉",
    "receipt": "תודה שאכלת אצלנו! הקבלה שלך: {receipt_link}",
    "feedback_request": "איך היה? נשמח לשמוע ממך! דרג אותנו 1-5 ⭐",
    "loyalty_update": "צברת {points} נקודות! עוד {remaining} נקודות ותזכה ב-{reward} 🎁",
    "birthday_offer": "יום הולדת שמח! 🎂 יש לך מתנה מיוחדת שמחכה לך אצלנו",
    "marketing_promo": ""
  }'::jsonb,
  automation_rules jsonb DEFAULT '{
    "send_reservation_confirmation": true,
    "send_reminder_hours_before": 3,
    "send_table_ready_notification": true,
    "send_receipt_after_payment": true,
    "send_feedback_hours_after": 24,
    "send_birthday_days_before": 3
  }'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 14: WHATSAPP MESSAGES LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_whatsapp_messages (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  guest_id uuid REFERENCES public.restaurant_guest_profiles(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  template_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  message_content text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 15: AI DEMAND FORECASTING TABLES (USP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_demand_forecasts (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  forecast_date date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  predicted_covers int NOT NULL,
  predicted_revenue numeric NOT NULL,
  predicted_orders int NOT NULL,
  confidence_score numeric CHECK (confidence_score >= 0 AND confidence_score <= 1),
  weather_condition text,
  temperature numeric,
  local_events text[] DEFAULT '{}',
  is_holiday boolean DEFAULT false,
  staffing_recommendation jsonb DEFAULT '{
    "servers_needed": 0,
    "kitchen_staff_needed": 0,
    "hosts_needed": 0,
    "peak_hours": []
  }'::jsonb,
  prep_recommendations jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(business_id, forecast_date)
);

-- Historical data for ML training
CREATE TABLE IF NOT EXISTS public.restaurant_historical_data (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  covers int NOT NULL,
  revenue numeric NOT NULL,
  orders int NOT NULL,
  weather text,
  temperature numeric,
  was_holiday boolean DEFAULT false,
  special_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(business_id, date)
);

-- ============================================================================
-- SECTION 16: FLOOR PLAN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_floor_plans (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT 'Main Floor',
  is_active boolean DEFAULT true,
  width int DEFAULT 1200,
  height int DEFAULT 800,
  background_image_url text,
  zones jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 17: RESTAURANT SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  business_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  default_tax_rate numeric DEFAULT 17,
  currency text DEFAULT 'ILS',
  timezone text DEFAULT 'Asia/Jerusalem',
  language text DEFAULT 'he',
  auto_print_kitchen_tickets boolean DEFAULT true,
  auto_print_receipts boolean DEFAULT false,
  require_table_for_dine_in boolean DEFAULT true,
  allow_negative_inventory boolean DEFAULT false,
  default_tip_percentages int[] DEFAULT '{10, 12, 15, 18, 20}',
  service_charge_percent numeric,
  auto_close_time time,
  expected_table_turnover_minutes int DEFAULT 90,
  kitchen_alert_thresholds jsonb DEFAULT '{
    "attention_minutes": 5,
    "warning_minutes": 10,
    "critical_minutes": 15
  }'::jsonb,
  whatsapp_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- SECTION 18: ENHANCED DAILY REPORTS TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'total_discounts') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN total_discounts numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'total_refunds') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN total_refunds numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'total_voids') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN total_voids numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'total_covers') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN total_covers int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'total_orders') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN total_orders int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'average_check') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN average_check numeric DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'closed_by') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN closed_by uuid REFERENCES public.restaurant_staff(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_daily_reports' AND column_name = 'category_breakdown') THEN
    ALTER TABLE public.restaurant_daily_reports ADD COLUMN category_breakdown jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- ============================================================================
-- SECTION 19: ENABLE RLS ON ALL NEW TABLES
-- ============================================================================

ALTER TABLE public.restaurant_guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_void_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_historical_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 20: RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Guest Profiles
DROP POLICY IF EXISTS "Tenant isolation for guest profiles" ON public.restaurant_guest_profiles;
CREATE POLICY "Tenant isolation for guest profiles" ON public.restaurant_guest_profiles
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Reservations
DROP POLICY IF EXISTS "Tenant isolation for reservations" ON public.restaurant_reservations;
CREATE POLICY "Tenant isolation for reservations" ON public.restaurant_reservations
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Waitlist
DROP POLICY IF EXISTS "Tenant isolation for waitlist" ON public.restaurant_waitlist;
CREATE POLICY "Tenant isolation for waitlist" ON public.restaurant_waitlist
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Payments
DROP POLICY IF EXISTS "Tenant isolation for payments" ON public.restaurant_payments;
CREATE POLICY "Tenant isolation for payments" ON public.restaurant_payments
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Cash Drawers
DROP POLICY IF EXISTS "Tenant isolation for cash drawers" ON public.restaurant_cash_drawers;
CREATE POLICY "Tenant isolation for cash drawers" ON public.restaurant_cash_drawers
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Cash Transactions (via drawer)
DROP POLICY IF EXISTS "Tenant isolation for cash transactions" ON public.restaurant_cash_transactions;
CREATE POLICY "Tenant isolation for cash transactions" ON public.restaurant_cash_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_cash_drawers d
      WHERE d.id = restaurant_cash_transactions.drawer_id
      AND d.business_id = auth.uid()
    )
  );

-- Void Logs
DROP POLICY IF EXISTS "Tenant isolation for void logs" ON public.restaurant_void_logs;
CREATE POLICY "Tenant isolation for void logs" ON public.restaurant_void_logs
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- WhatsApp Settings
DROP POLICY IF EXISTS "Tenant isolation for whatsapp settings" ON public.restaurant_whatsapp_settings;
CREATE POLICY "Tenant isolation for whatsapp settings" ON public.restaurant_whatsapp_settings
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- WhatsApp Messages
DROP POLICY IF EXISTS "Tenant isolation for whatsapp messages" ON public.restaurant_whatsapp_messages;
CREATE POLICY "Tenant isolation for whatsapp messages" ON public.restaurant_whatsapp_messages
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Demand Forecasts
DROP POLICY IF EXISTS "Tenant isolation for demand forecasts" ON public.restaurant_demand_forecasts;
CREATE POLICY "Tenant isolation for demand forecasts" ON public.restaurant_demand_forecasts
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Historical Data
DROP POLICY IF EXISTS "Tenant isolation for historical data" ON public.restaurant_historical_data;
CREATE POLICY "Tenant isolation for historical data" ON public.restaurant_historical_data
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Floor Plans
DROP POLICY IF EXISTS "Tenant isolation for floor plans" ON public.restaurant_floor_plans;
CREATE POLICY "Tenant isolation for floor plans" ON public.restaurant_floor_plans
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- Settings
DROP POLICY IF EXISTS "Tenant isolation for settings" ON public.restaurant_settings;
CREATE POLICY "Tenant isolation for settings" ON public.restaurant_settings
  FOR ALL USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);

-- ============================================================================
-- SECTION 21: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Guest Profiles
CREATE INDEX IF NOT EXISTS idx_guest_profiles_business ON public.restaurant_guest_profiles(business_id);
CREATE INDEX IF NOT EXISTS idx_guest_profiles_phone ON public.restaurant_guest_profiles(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_guest_profiles_email ON public.restaurant_guest_profiles(business_id, email);

-- Reservations
CREATE INDEX IF NOT EXISTS idx_reservations_business_date ON public.restaurant_reservations(business_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.restaurant_reservations(business_id, status);

-- Waitlist
CREATE INDEX IF NOT EXISTS idx_waitlist_business_status ON public.restaurant_waitlist(business_id, status);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.restaurant_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_business_date ON public.restaurant_payments(business_id, processed_at);

-- Forecasts
CREATE INDEX IF NOT EXISTS idx_forecasts_business_date ON public.restaurant_demand_forecasts(business_id, forecast_date);

-- Historical Data
CREATE INDEX IF NOT EXISTS idx_historical_business_date ON public.restaurant_historical_data(business_id, date);

-- ============================================================================
-- SECTION 22: REALTIME CONFIGURATION
-- ============================================================================

-- Add tables to realtime publication
DO $$
BEGIN
  -- These might already be added, so we ignore errors
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_reservations;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_waitlist;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_payments;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_guest_profiles;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
