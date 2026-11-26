-- Store office-entered USD and Syrian-pound prices independently.
-- Existing USD columns remain the booking/pricing source until a booking currency
-- selector is explicitly implemented; SYP values are never inferred from FX.
alter table public.vehicles
  add column if not exists daily_rate_syp numeric(14,0) check (daily_rate_syp is null or daily_rate_syp >= 0),
  add column if not exists weekly_rate_syp numeric(14,0) check (weekly_rate_syp is null or weekly_rate_syp >= 0),
  add column if not exists monthly_rate_syp numeric(14,0) check (monthly_rate_syp is null or monthly_rate_syp >= 0),
  add column if not exists deposit_amount_syp numeric(14,0) not null default 0 check (deposit_amount_syp >= 0);

comment on column public.vehicles.daily_rate_syp is 'Daily rental price entered directly by the office in Syrian pounds; not FX-converted.';
comment on column public.vehicles.weekly_rate_syp is 'Weekly rental price entered directly by the office in Syrian pounds; not FX-converted.';
comment on column public.vehicles.monthly_rate_syp is 'Monthly rental price entered directly by the office in Syrian pounds; not FX-converted.';
comment on column public.vehicles.deposit_amount_syp is 'Refundable deposit entered directly by the office in Syrian pounds; not FX-converted.';
