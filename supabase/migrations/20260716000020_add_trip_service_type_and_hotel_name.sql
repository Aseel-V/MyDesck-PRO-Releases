alter table public.trips
  add column if not exists service_type text not null default 'both'
    check (service_type in ('ticket', 'hotel', 'both')),
  add column if not exists hotel_name text null;
