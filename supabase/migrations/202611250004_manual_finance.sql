-- Manual-only finance: cash and bank transfer ledger, customer evidence, balances,
-- deposits, manual refunds, printable invoice snapshots, and payout settlements.

alter table public.rental_offices
  add column if not exists payment_instructions jsonb not null
  default '{"cash":"Contact the office to arrange cash payment.","bank_transfer":"Contact the office for bank transfer details."}'::jsonb;

insert into public.permissions(id,description) values
  ('payments.record','Record manual office payments'),
  ('refunds.manage','Record manual refunds'),
  ('invoices.issue','Issue booking invoices')
on conflict (id) do nothing;

delete from public.platform_settings where key='payment_provider';

-- Remove policies that depend on payments.status before changing its data type.
-- These policies are intentionally replaced/removed later in this migration.
drop policy if exists payments_server_insert on public.payments;
drop policy if exists payments_verified_admin_update on public.payments;

-- Replace the old gateway-shaped record status enum with explicit manual ledger states.
alter table public.payments alter column status drop default;
alter table public.payments alter column status type text using status::text;
update public.payments set status=case status
  when 'pending' then 'pending_verification'
  when 'verified' then 'paid'
  when 'failed' then 'rejected'
  else status end;
alter table public.payments alter column status set default 'pending_verification';
drop type if exists public.payment_status;
alter table public.payments add column if not exists payment_type text not null default 'rental';
alter table public.payments add column if not exists payment_source text not null default 'customer';
alter table public.payments add column if not exists recorded_by uuid references public.profiles(id);
alter table public.payments add column if not exists reference text;
alter table public.payments add column if not exists notes text;
alter table public.payments add constraint payments_status_manual_check
  check(status in ('unpaid','partially_paid','pending_verification','paid','refunded','partially_refunded','rejected'));
alter table public.payments add constraint payments_method_manual_check check(payment_method in ('cash','bank_transfer'));
alter table public.payments add constraint payments_type_check check(payment_type in ('rental','security_deposit'));
alter table public.payments add constraint payments_source_check check(payment_source in ('customer','office'));
alter table public.payments drop column if exists provider;
alter table public.payments drop column if exists provider_reference;
drop index if exists public.payments_one_pending_per_booking_idx;

alter table public.bookings add column if not exists payment_status text not null default 'unpaid';
alter table public.bookings add constraint bookings_payment_status_check
  check(payment_status in ('unpaid','partially_paid','pending_verification','paid','refunded','partially_refunded'));

alter table public.deposits add column if not exists collected_amount numeric(12,2) not null default 0;
alter table public.deposits drop constraint if exists deposits_status_check;
update public.deposits set status='pending' where status='held';
alter table public.deposits add constraint deposits_status_check
  check(status in ('pending','partially_funded','held','partially_refunded','refunded','deducted'));
alter table public.deposits add constraint deposits_collected_amount_check
  check(collected_amount >= 0 and collected_amount <= amount);

alter table public.refunds add column if not exists refund_method text not null default 'cash';
alter table public.refunds add column if not exists manual_reference text;
alter table public.refunds add column if not exists recorded_by uuid references public.profiles(id);
alter table public.refunds drop column if exists provider_reference;
alter table public.refunds add constraint refunds_manual_method_check check(refund_method in ('cash','bank_transfer'));
alter table public.subscriptions drop column if exists provider;
alter table public.subscriptions drop column if exists provider_reference;

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size bigint not null check(byte_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.deposits(id) on delete cascade,
  transaction_type text not null check(transaction_type in ('collected','deduction','refund')),
  amount numeric(12,2) not null check(amount > 0),
  currency char(3) not null,
  method text check(method in ('cash','bank_transfer')),
  reference text,
  reason text,
  payment_id uuid references public.payments(id),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payout_settlements (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  amount numeric(12,2) not null check(amount > 0),
  currency char(3) not null,
  payment_method text not null check(payment_method in ('cash','bank_transfer')),
  reference text,
