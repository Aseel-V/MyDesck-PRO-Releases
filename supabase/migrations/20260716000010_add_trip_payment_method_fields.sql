alter table public.trips
  add column if not exists payment_method text null check (payment_method in ('card', 'cash', 'mixed')),
  add column if not exists card_paid_amount numeric null check (card_paid_amount >= 0),
  add column if not exists cash_paid_amount numeric null check (cash_paid_amount >= 0);
