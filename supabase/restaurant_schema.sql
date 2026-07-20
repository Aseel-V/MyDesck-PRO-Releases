-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- 1. Restaurant Tables
create table public.restaurant_tables (
  id uuid default uuid_generate_v4() primary key,
  business_id uuid references auth.users(id) not null,
  name text not null, -- e.g. "T-1"
  status text not null check (status in ('free', 'occupied', 'billed', 'reserved')) default 'free',
  seats int default 4,
  position_x float default 0,
  position_y float default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Menu Categories
create table public.restaurant_menu_categories (
  id uuid default uuid_generate_v4() primary key,
  business_id uuid references auth.users(id) not null,
  name text not null, -- "Starters", "Mains"
  sort_order int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Menu Items
create table public.restaurant_menu_items (
  id uuid default uuid_generate_v4() primary key,
  category_id uuid references public.restaurant_menu_categories(id) on delete cascade not null,
  name text not null,
  description text,
  price numeric not null default 0,
  is_available boolean default true,
  tax_rate numeric default 17, -- Percentage
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Restaurant Staff
create table public.restaurant_staff (
  id uuid default uuid_generate_v4() primary key,
  business_id uuid references auth.users(id) not null,
  full_name text not null,
  role text not null check (role in ('Waiter', 'Chef', 'Manager', 'Other')) default 'Waiter',
  hourly_rate numeric default 0,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Orders
create table public.restaurant_orders (
  id uuid default uuid_generate_v4() primary key,
  business_id uuid references auth.users(id) not null,
  table_id uuid references public.restaurant_tables(id), -- Can be null for takeaway? For now assuming table linked.
  status text not null check (status in ('open', 'closed', 'cancelled')) default 'open',
  total_amount numeric default 0,
  tax_amount numeric default 0,
  tip_amount numeric default 0,
  payment_method text check (payment_method in ('cash', 'card', 'split')), 
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  closed_at timestamp with time zone
);

-- 6. Order Items
create table public.restaurant_order_items (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.restaurant_orders(id) on delete cascade not null,
  item_id uuid references public.restaurant_menu_items(id), -- Nullable if item deleted, but better to keep reference
  quantity int default 1,
  price_at_time numeric not null, -- Snapshotted price
  notes text, -- "No onions"
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Daily Reports (Z Reports)
create table public.restaurant_daily_reports (
  id uuid default uuid_generate_v4() primary key,
  business_id uuid references auth.users(id) not null,
  date date not null default CURRENT_DATE,
  z_report_number serial, -- Auto-incrementing for the business ideally, but global serial is simpler. For per-business likely needs function or client logic. Keeping scalar for now.
  total_sales_cash numeric default 0,
  total_sales_card numeric default 0,
  total_tax numeric default 0,
  total_tips numeric default 0,
  total_expenses numeric default 0,
  total_labor_cost numeric default 0,
  net_profit numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Staff Shifts (for Payroll in Z-Report)
create table public.staff_shifts (
  id uuid default uuid_generate_v4() primary key,
  report_id uuid references public.restaurant_daily_reports(id) on delete cascade not null,
  staff_id uuid references public.restaurant_staff(id) not null,
  hours_worked numeric default 0,
  total_pay numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table restaurant_tables enable row level security;
alter table restaurant_menu_categories enable row level security;
alter table restaurant_menu_items enable row level security;
alter table restaurant_staff enable row level security;
alter table restaurant_orders enable row level security;
alter table restaurant_order_items enable row level security;
alter table restaurant_daily_reports enable row level security;
alter table staff_shifts enable row level security;

-- Policies (Scanning user table for business_id match typically involves matching auth.uid())
-- Assuming 'users' table id matches auth.uid() or there is a linkage. 
-- Common pattern: business_id = auth.uid()

create policy "Users can manage their own tables" on restaurant_tables
  for all using (auth.uid() = business_id);

create policy "Users can manage their own categories" on restaurant_menu_categories
  for all using (auth.uid() = business_id);

create policy "Users can manage their own menu items" on restaurant_menu_items
  for all using (
    exists (
      select 1 from restaurant_menu_categories c
      where c.id = restaurant_menu_items.category_id
      and c.business_id = auth.uid()
    )
  );

create policy "Users can manage their own staff" on restaurant_staff
  for all using (auth.uid() = business_id);

create policy "Users can manage their own orders" on restaurant_orders
  for all using (auth.uid() = business_id);

create policy "Users can manage their own order items" on restaurant_order_items
  for all using (
    exists (
      select 1 from restaurant_orders o
      where o.id = restaurant_order_items.order_id
      and o.business_id = auth.uid()
    )
  );

create policy "Users can manage their own daily reports" on restaurant_daily_reports
  for all using (auth.uid() = business_id);

create policy "Users can manage their own shifts" on staff_shifts
  for all using (
    exists (
      select 1 from restaurant_daily_reports r
      where r.id = staff_shifts.report_id
      and r.business_id = auth.uid()
    )
  );

-- 11. Add Currency Column (Migration)
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'restaurant_orders' and column_name = 'currency') then
    alter table restaurant_orders add column currency text default 'ILS';
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'restaurant_daily_reports' and column_name = 'currency') then
    alter table restaurant_daily_reports add column currency text default 'ILS';
  end if;
end $$;

-- 12. Add Trip Original Currency Columns (Migration)
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'trips' and column_name = 'wholesale_original_amount') then
    alter table trips add column wholesale_original_amount numeric;
    alter table trips add column wholesale_currency text;
    alter table trips add column sale_original_amount numeric;
    alter table trips add column sale_currency text;
  end if;
end $$;

-- Re-create get_trips_by_year RPC to include new columns
DROP FUNCTION IF EXISTS get_trips_by_year(text);

CREATE OR REPLACE FUNCTION get_trips_by_year(year_input text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  destination text,
  client_name text,
  travelers_count integer,
  start_date date,
  end_date date,
  wholesale_cost numeric,
  sale_price numeric,
  profit numeric,
  profit_percentage numeric,
  payment_status text,
  amount_paid numeric,
  amount_due numeric,
  notes text,
  status text,
  export_to_pdf boolean,
  created_at timestamptz,
  updated_at timestamptz,
  currency text,
  exchange_rate numeric,
  payments jsonb,
  attachments jsonb,
  payment_date date,
  room_type text,
  board_basis text,
  itinerary jsonb,
  travelers jsonb,
  wholesale_original_amount numeric,
  wholesale_currency text,
  sale_original_amount numeric,
  sale_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.user_id,
    t.destination,
    t.client_name,
    t.travelers_count,
    t.start_date,
    t.end_date,
    t.wholesale_cost,
    t.sale_price,
    t.profit,
    t.profit_percentage,
    t.payment_status,
    t.amount_paid,
    t.amount_due,
    t.notes,
    t.status,
    t.export_to_pdf,
    t.created_at,
    t.updated_at,
    t.currency,
    t.exchange_rate,
    t.payments,
    t.attachments,
    t.payment_date,
    t.room_type,
    t.board_basis,
    t.itinerary,
    t.travelers,
    t.wholesale_original_amount,
    t.wholesale_currency,
    t.sale_original_amount,
    t.sale_currency
  FROM trips t
  WHERE 
    t.user_id = auth.uid() AND
    TO_CHAR(COALESCE(t.payment_date, t.start_date), 'YYYY') = year_input
  ORDER BY t.start_date DESC;
END;
$$;

