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
  notes text,
  settled_by uuid not null references public.profiles(id),
  settled_at timestamptz not null default now()
);

create index if not exists payments_booking_status_idx on public.payments(booking_id,status,payment_type);
create index if not exists refunds_payment_status_idx on public.refunds(payment_id,status);
create index if not exists payment_proofs_payment_idx on public.payment_proofs(payment_id,created_at desc);
create index if not exists deposit_transactions_deposit_idx on public.deposit_transactions(deposit_id,created_at);
create index if not exists payout_settlements_payout_idx on public.payout_settlements(payout_id,settled_at);

alter table public.payment_proofs enable row level security;
alter table public.deposit_transactions enable row level security;
alter table public.payout_settlements enable row level security;

drop policy if exists payments_verified_admin_update on public.payments;
drop policy if exists payments_server_insert on public.payments;
drop policy if exists deposits_office_admin_insert on public.deposits;
drop policy if exists deposits_admin_update on public.deposits;
drop policy if exists deposits_admin_delete on public.deposits;
drop policy if exists refunds_request_owner on public.refunds;
drop policy if exists refunds_admin_update on public.refunds;
drop policy if exists payouts_office_request on public.payouts;
drop policy if exists payouts_admin_update on public.payouts;
drop policy if exists payments_participant_read on public.payments;

create policy payments_participant_read on public.payments for select using (
  customer_id=auth.uid() or (office_id is not null and
    (public.has_office_permission(office_id,'finance.read') or public.has_office_permission(office_id,'payments.verify') or public.has_office_permission(office_id,'payments.record')))
  or public.is_platform_admin()
);

drop policy if exists bookings_customer_request on public.bookings;
create policy bookings_customer_request on public.bookings for insert with check (false);

create policy payment_proofs_participant_read on public.payment_proofs for select using (
  exists(select 1 from public.payments p where p.id=payment_id and
    (p.customer_id=auth.uid() or public.has_office_permission(p.office_id,'finance.read') or public.has_office_permission(p.office_id,'payments.verify') or public.is_platform_admin()))
);

create policy payment_proofs_owner_insert on public.payment_proofs for insert with check (
  uploaded_by=auth.uid() and exists(select 1 from public.payments p join public.bookings b on b.id=p.booking_id
    where p.id=payment_id and p.status='pending_verification' and
      p.customer_id=auth.uid() and p.payment_source='customer')
);

create policy deposit_transactions_participant_read on public.deposit_transactions for select using (
  exists(select 1 from public.deposits d join public.bookings b on b.id=d.booking_id
    where d.id=deposit_id and (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'finance.read') or public.has_office_permission(b.office_id,'deposits.manage') or public.is_platform_admin()))
);

create policy payout_settlements_scoped_read on public.payout_settlements for select using (
  exists(select 1 from public.payouts p where p.id=payout_id and
    (public.has_office_permission(p.office_id,'finance.read') or public.is_platform_admin()))
);

-- Financial mutations are only performed by locked SQL functions below.
revoke insert,update,delete on public.payments,public.refunds,public.deposits,
  public.deposit_transactions,public.invoices,public.payouts,public.payout_settlements,
  public.booking_charges,public.commissions from authenticated;
revoke update on public.bookings from authenticated;
grant select on public.payment_proofs,public.deposit_transactions,public.payout_settlements to authenticated;
grant insert on public.payment_proofs to authenticated;
revoke insert on public.payment_proofs from authenticated;

create or replace function public.create_booking_deposit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.deposit_amount>0 then
    insert into public.deposits(booking_id,amount,currency,status,collected_amount)
      values(new.id,new.deposit_amount,new.currency,'pending',0)
      on conflict(booking_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists bookings_create_deposit on public.bookings;
create trigger bookings_create_deposit after insert on public.bookings
  for each row execute function public.create_booking_deposit();

create or replace function public.refresh_booking_payment_status(p_booking_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare b public.bookings; paid_total numeric(12,2); refund_total numeric(12,2); pending_total numeric(12,2); net_paid numeric(12,2); next_status text;
begin
  select * into b from public.bookings where id=p_booking_id;
  if not found then return 'unpaid'; end if;
  select coalesce(sum(p.amount),0) into paid_total from public.payments p
    where p.booking_id=b.id and p.payment_type='rental'
      and p.status in ('paid','partially_paid','partially_refunded','refunded');
  select coalesce(sum(r.amount),0) into refund_total from public.refunds r
    where r.booking_id=b.id and r.status='completed';
  select coalesce(sum(p.amount),0) into pending_total from public.payments p
    where p.booking_id=b.id and p.payment_type='rental' and p.status='pending_verification';
  net_paid:=greatest(0,paid_total-refund_total);
  next_status:=case
    when refund_total>0 and net_paid=0 then 'refunded'
    when refund_total>0 then 'partially_refunded'
    when pending_total>0 then 'pending_verification'
    when net_paid>=b.total_amount and b.total_amount>0 then 'paid'
    when net_paid>0 then 'partially_paid'
    else 'unpaid' end;
  perform set_config('rentora.financial_write','on',true);
  update public.bookings set payment_status=next_status where id=b.id and payment_status is distinct from next_status;
  perform set_config('rentora.financial_write','off',true);
  return next_status;
end $$;

create or replace function public.guard_booking_payment_status()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_status is distinct from old.payment_status and coalesce(current_setting('rentora.financial_write',true),'off')<>'on' then
    raise exception 'Booking payment status is maintained by the financial ledger';
  end if;
  return new;
end $$;

drop trigger if exists bookings_payment_status_guard on public.bookings;
create trigger bookings_payment_status_guard before update of payment_status on public.bookings
  for each row execute function public.guard_booking_payment_status();

create or replace function public.sync_booking_payment_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    perform public.refresh_booking_payment_status(old.booking_id);
    return old;
  end if;
  perform public.refresh_booking_payment_status(new.booking_id);
  return new;
end $$;

drop trigger if exists payments_refresh_booking_status on public.payments;
create trigger payments_refresh_booking_status after insert or update or delete on public.payments
  for each row execute function public.sync_booking_payment_status();

drop trigger if exists refunds_refresh_booking_status on public.refunds;
create trigger refunds_refresh_booking_status after insert or update or delete on public.refunds
  for each row execute function public.sync_booking_payment_status();

select public.refresh_booking_payment_status(id) from public.bookings;

create or replace function public.record_manual_payment(
  p_booking_id uuid,p_amount numeric,p_method text,p_payment_type text default 'rental',
  p_reference text default null,p_notes text default null
)
returns public.payments language plpgsql security definer set search_path=public as $$
declare b public.bookings; p public.payments; paid_total numeric(12,2); refund_total numeric(12,2); pending_total numeric(12,2); collected numeric(12,2); pending_deposit numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>999999999 then raise exception 'Payment amount must be positive and use at most two decimal places'; end if;
  if p_method not in ('cash','bank_transfer') then raise exception 'Only cash and bank transfer payments are supported'; end if;
  if p_payment_type not in ('rental','security_deposit') then raise exception 'Invalid payment type'; end if;
  if length(coalesce(p_reference,''))>160 or length(coalesce(p_notes,''))>1000 then raise exception 'Payment reference or notes are too long'; end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or (b.customer_id<>auth.uid() and not public.has_office_permission(b.office_id,'payments.record') and not public.is_platform_admin()) then raise exception 'Booking not found or not authorized'; end if;
  if b.status in ('cancelled','rejected') then raise exception 'Cancelled bookings cannot receive payments'; end if;
  if p_payment_type='security_deposit' and b.status not in ('confirmed','active') then raise exception 'Security deposits can only be collected before the booking is completed'; end if;
  if b.customer_id=auth.uid() then
    if b.status='pending' then raise exception 'Wait for the rental office to confirm this booking before paying'; end if;
    if p_payment_type='security_deposit' and not exists(select 1 from public.deposits where booking_id=b.id) then raise exception 'No security deposit is due'; end if;
  elsif not public.is_platform_admin() and not public.has_office_permission(b.office_id,'payments.record') then
    raise exception 'Not authorized to record office payments';
  end if;
  if p_payment_type='rental' then
    select coalesce(sum(amount),0) into paid_total from public.payments where booking_id=b.id and payment_type='rental' and status in ('paid','partially_paid','partially_refunded','refunded');
    select coalesce(sum(amount),0) into refund_total from public.refunds where booking_id=b.id and status in ('completed','pending','approved','processing');
    select coalesce(sum(amount),0) into pending_total from public.payments where booking_id=b.id and payment_type='rental' and status='pending_verification';
    if p_amount>greatest(0,b.total_amount-paid_total+refund_total-pending_total) then raise exception 'Payment exceeds the outstanding balance'; end if;
  end if;
  if p_payment_type='security_deposit' then
    select coalesce(collected_amount,0) into collected from public.deposits where booking_id=b.id for update;
    select coalesce(sum(amount),0) into pending_deposit from public.payments where booking_id=b.id and payment_type='security_deposit' and status='pending_verification';
    if p_amount>greatest(0,b.deposit_amount-collected-pending_deposit) then raise exception 'Payment exceeds the remaining security deposit'; end if;
  end if;
  insert into public.payments(booking_id,office_id,customer_id,payment_method,amount,currency,status,payment_type,payment_source,recorded_by,verified_by,verified_at,reference,notes)
  values(b.id,b.office_id,b.customer_id,p_method,p_amount,b.currency,'pending_verification',p_payment_type,
    case when b.customer_id=auth.uid() then 'customer' else 'office' end,auth.uid(),null,null,nullif(trim(p_reference),''),nullif(trim(p_notes),''))
  returning * into p;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'payment.manual_recorded','payment',p.id,b.office_id,jsonb_build_object('amount',p.amount,'currency',p.currency,'method',p.payment_method,'type',p.payment_type,'status',p.status));
  return p;
end $$;

create or replace function public.verify_manual_payment(p_payment_id uuid,p_approved boolean,p_note text default null)
returns public.payments language plpgsql security definer set search_path=public as $$
declare p public.payments; b public.bookings; paid_total numeric(12,2); refund_total numeric(12,2); next_status text; dep public.deposits;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  select * into b from public.bookings where id=p.booking_id for update;
  if not public.is_platform_admin() and not public.has_office_permission(p.office_id,'payments.verify') then raise exception 'Not authorized to verify payments'; end if;
  if p.status<>'pending_verification' then raise exception 'Only pending manual payments can be verified'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Verification note is too long'; end if;
  if p_approved and p.payment_method='bank_transfer' and p.payment_source='customer'
    and not exists(select 1 from public.payment_proofs where payment_id=p.id) then raise exception 'Upload transfer proof before verification'; end if;
  if p_approved and (b.status in ('cancelled','rejected') or (p.payment_type='security_deposit' and b.status not in ('confirmed','active'))) then raise exception 'This booking can no longer accept this payment'; end if;
  if p_approved and p.payment_type='rental' then
    select coalesce(sum(amount),0) into paid_total from public.payments where booking_id=b.id and payment_type='rental' and id<>p.id and status in ('paid','partially_paid','partially_refunded','refunded');
    select coalesce(sum(amount),0) into refund_total from public.refunds where booking_id=b.id and status in ('completed','pending','approved','processing');
    if p.amount>greatest(0,b.total_amount-paid_total+refund_total) then raise exception 'Payment now exceeds the outstanding balance'; end if;
    next_status:=case when paid_total-refund_total+p.amount>=b.total_amount then 'paid' else 'partially_paid' end;
  elsif p_approved then
    select * into dep from public.deposits where booking_id=b.id for update;
    if not found or dep.collected_amount+p.amount>dep.amount then raise exception 'Payment exceeds remaining security deposit'; end if;
    next_status:=case when dep.collected_amount+p.amount>=dep.amount then 'paid' else 'partially_paid' end;
  else next_status:='rejected'; end if;
  update public.payments set status=next_status,verified_by=auth.uid(),verified_at=now(),metadata=metadata||jsonb_build_object('verification_note',nullif(trim(p_note),''))
    where id=p.id returning * into p;
  if p_approved and p.payment_type='security_deposit' then
    update public.deposits set collected_amount=collected_amount+p.amount,
      status=case when collected_amount+p.amount>=amount then 'held' else 'partially_funded' end where id=dep.id returning * into dep;
    insert into public.deposit_transactions(deposit_id,transaction_type,amount,currency,method,reference,payment_id,recorded_by)
      values(dep.id,'collected',p.amount,p.currency,p.payment_method,p.reference,p.id,auth.uid());
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,before_data,after_data)
    values(auth.uid(),case when p_approved then 'payment.verified' else 'payment.rejected' end,'payment',p.id,p.office_id,
      jsonb_build_object('status','pending_verification'),jsonb_build_object('status',p.status,'amount',p.amount,'currency',p.currency,'note',nullif(trim(p_note),'')));
  return p;
end $$;

create or replace function public.record_manual_refund(
  p_payment_id uuid,p_amount numeric,p_method text,p_reason text,p_reference text default null
)
returns public.refunds language plpgsql security definer set search_path=public as $$
declare p public.payments; b public.bookings; refunded numeric(12,2); r public.refunds;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) or p_method not in ('cash','bank_transfer') or length(trim(coalesce(p_reason,''))) not between 1 and 1000 or length(coalesce(p_reference,''))>160 then raise exception 'Enter a valid refund amount, method, reason, and reference'; end if;
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.payment_type<>'rental' or p.status not in ('paid','partially_paid','partially_refunded') then raise exception 'Paid rental payment not found'; end if;
  select * into b from public.bookings where id=p.booking_id for update;
  if not public.is_platform_admin() and not public.has_office_permission(p.office_id,'refunds.manage') then raise exception 'Not authorized to record a refund'; end if;
  select coalesce(sum(amount),0) into refunded from public.refunds where payment_id=p.id and status='completed';
  if p_amount>p.amount-refunded then raise exception 'Refund exceeds remaining paid amount'; end if;
  insert into public.refunds(payment_id,booking_id,amount,currency,reason,status,requested_by,approved_by,refund_method,manual_reference,recorded_by)
  values(p.id,b.id,p_amount,p.currency,trim(p_reason),'completed',auth.uid(),auth.uid(),p_method,nullif(trim(p_reference),''),auth.uid()) returning * into r;
  update public.payments set status=case when refunded+p_amount>=p.amount then 'refunded' else 'partially_refunded' end,updated_at=now() where id=p.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'refund.manual_recorded','refund',r.id,p.office_id,jsonb_build_object('payment_id',p.id,'amount',r.amount,'currency',r.currency,'method',p_method,'reason',r.reason,'reference',r.manual_reference));
  return r;
end $$;

drop function if exists public.release_security_deposit(uuid,numeric,text);

create or replace function public.release_security_deposit(p_deposit_id uuid,p_deduction numeric default 0,p_reason text default null,p_method text default 'bank_transfer',p_reference text default null)
returns public.deposits language plpgsql security definer set search_path=public as $$
declare d public.deposits; b public.bookings; refund_amount numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into d from public.deposits where id=p_deposit_id;
  if not found then raise exception 'Deposit not found'; end if;
  select * into b from public.bookings where id=d.booking_id for update;
  select * into d from public.deposits where id=d.id for update;
  if not public.is_platform_admin() and not public.has_office_permission(b.office_id,'deposits.manage') then raise exception 'Not authorized to release this deposit'; end if;
  if b.status<>'completed' then raise exception 'Deposit can only be released after the rental is completed'; end if;
  if d.status not in ('held','partially_funded') or p_deduction is null or p_deduction::text in ('NaN','Infinity','-Infinity') or p_deduction<0 or p_deduction<>round(p_deduction,2) or p_deduction>d.collected_amount then raise exception 'Invalid deposit deduction'; end if;
  if exists(select 1 from public.payments where booking_id=b.id and payment_type='security_deposit' and status='pending_verification') then raise exception 'Resolve pending security deposit payments before settlement'; end if;
  if p_deduction>0 and length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'A reason is required for a deposit deduction'; end if;
  if p_method not in ('cash','bank_transfer') or length(coalesce(p_reference,''))>160 then raise exception 'Enter a valid manual refund method and reference'; end if;
  refund_amount:=d.collected_amount-p_deduction;
  update public.deposits set deduction_amount=p_deduction,reason=nullif(trim(p_reason),''),
    status=case when p_deduction=0 then 'refunded' when p_deduction>=collected_amount then 'deducted' else 'partially_refunded' end,
    released_by=auth.uid(),released_at=now() where id=d.id returning * into d;
  if p_deduction>0 then
    insert into public.deposit_transactions(deposit_id,transaction_type,amount,currency,method,reference,reason,recorded_by)
      values(d.id,'deduction',p_deduction,d.currency,null,nullif(trim(p_reference),''),trim(p_reason),auth.uid());
    insert into public.booking_charges(booking_id,charge_type,description,amount,currency,approved_by)
      values(b.id,'deposit_deduction',trim(p_reason),p_deduction,b.currency,auth.uid());
  end if;
  if refund_amount>0 then
    insert into public.deposit_transactions(deposit_id,transaction_type,amount,currency,method,reference,reason,recorded_by)
      values(d.id,'refund',refund_amount,d.currency,p_method,nullif(trim(p_reference),''),'Security deposit refund',auth.uid());
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'deposit.manually_settled','deposit',d.id,b.office_id,jsonb_build_object('collected',d.collected_amount,'deduction',p_deduction,'refund',refund_amount,'currency',d.currency,'method',p_method,'status',d.status));
  return d;
end $$;

create or replace function public.set_office_payment_instructions(p_office_id uuid,p_instructions jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cleaned jsonb;
begin
  if not public.has_office_permission(p_office_id,'office.manage') then raise exception 'Not authorized to update payment instructions'; end if;
  if jsonb_typeof(p_instructions)<>'object' then raise exception 'Payment instructions must be an object'; end if;
  if length(coalesce(p_instructions->>'cash',''))>1500 or length(coalesce(p_instructions->>'bank_transfer',''))>1500 then raise exception 'Instructions must be under 1,500 characters'; end if;
  cleaned:=jsonb_build_object('cash',trim(coalesce(p_instructions->>'cash','')),'bank_transfer',trim(coalesce(p_instructions->>'bank_transfer','')));
  update public.rental_offices set payment_instructions=cleaned,updated_at=now() where id=p_office_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'office.payment_instructions_updated','rental_office',p_office_id,p_office_id,cleaned);
  return cleaned;
end $$;

create or replace function public.issue_booking_invoice(p_booking_id uuid)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare b public.bookings; r public.invoices; revision integer;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or (b.customer_id<>auth.uid() and not public.has_office_permission(b.office_id,'invoices.issue') and not public.is_platform_admin()) then raise exception 'Booking not found or not authorized'; end if;
  select coalesce(max(substring(invoice_number from '-I([0-9]+)$')::integer),0)+1 into revision from public.invoices where booking_id=b.id;
  insert into public.invoices(booking_id,invoice_number,issued_at,due_at,subtotal,tax_amount,total,currency)
    values(b.id,b.booking_number||'-I'||lpad(revision::text,2,'0'),now(),null,b.total_amount-b.tax_amount,b.tax_amount,b.total_amount,b.currency)
    returning * into r;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'invoice.issued','invoice',r.id,b.office_id,jsonb_build_object('invoice_number',r.invoice_number,'total',r.total,'currency',r.currency));
  return r;
end $$;

create or replace function public.request_office_payout(p_office_id uuid,p_amount numeric,p_currency text,p_method text,p_destination text,p_notes text default null)
returns public.payouts language plpgsql security definer set search_path=public as $$
declare collected numeric(12,2); refunded numeric(12,2); commission_due numeric(12,2); reserved numeric(12,2); p public.payouts;
begin
  if not public.has_office_permission(p_office_id,'finance.read') then raise exception 'Not authorized to request this payout'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) or p_method is distinct from 'bank_transfer' or p_currency !~ '^[A-Z]{3}$' or length(coalesce(p_destination,'')) not between 4 and 500 or length(coalesce(p_notes,''))>1000 then raise exception 'Enter valid payout details'; end if;
  perform id from public.rental_offices where id=p_office_id for update;
  select coalesce(sum(pm.amount),0) into collected from public.payments pm where pm.office_id=p_office_id and pm.currency=p_currency and pm.payment_type='rental' and pm.status in ('paid','partially_paid','partially_refunded','refunded');
  select coalesce(sum(r.amount),0) into refunded from public.refunds r join public.payments pm on pm.id=r.payment_id where pm.office_id=p_office_id and pm.currency=p_currency and r.status='completed';
  -- Reserve the platform commission proportionally as rental money is collected,
  -- including bookings that have not reached the return workflow yet.
  select coalesce(sum(least(b.commission_amount,round(b.commission_amount*greatest(0,
    coalesce((select sum(pm.amount) from public.payments pm where pm.booking_id=b.id and pm.payment_type='rental' and pm.status in ('paid','partially_paid','partially_refunded','refunded')),0)
    -coalesce((select sum(r.amount) from public.refunds r where r.booking_id=b.id and r.status='completed'),0)
  )/nullif(b.total_amount,0),2))),0)
    into commission_due from public.bookings b where b.office_id=p_office_id and b.currency=p_currency and b.total_amount>0;
  select coalesce(sum(amount),0) into reserved from public.payouts where office_id=p_office_id and currency=p_currency and status in ('requested','approved','processing','paid');
  if p_amount>greatest(0,collected-refunded-commission_due-reserved) then raise exception 'Payout exceeds the available collected balance after refunds and platform commission'; end if;
  insert into public.payouts(office_id,amount,currency,status,payout_method,notes)
    values(p_office_id,p_amount,p_currency,'requested',jsonb_build_object('type',p_method,'destination',trim(p_destination)),nullif(trim(p_notes),'')) returning * into p;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'payout.requested','payout',p.id,p_office_id,jsonb_build_object('amount',p.amount,'currency',p.currency));
  return p;
end $$;

create or replace function public.decide_payout(p_payout_id uuid,p_approved boolean,p_note text default null)
returns public.payouts language plpgsql security definer set search_path=public as $$
declare p public.payouts;
begin
  if not public.is_platform_admin() then raise exception 'Only platform administrators can decide payouts'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Payout notes are too long'; end if;
  select * into p from public.payouts where id=p_payout_id for update;
  if not found or p.status<>'requested' then raise exception 'Requested payout not found'; end if;
  update public.payouts set status=case when p_approved then 'approved' else 'rejected' end,
    processed_by=auth.uid(),processed_at=now(),notes=coalesce(nullif(trim(p_note),''),notes)
    where id=p.id returning * into p;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),case when p_approved then 'payout.approved' else 'payout.rejected' end,'payout',p.id,p.office_id,jsonb_build_object('status',p.status,'amount',p.amount,'currency',p.currency,'note',p_note));
  return p;
end $$;

create or replace function public.record_payout_settlement(p_payout_id uuid,p_amount numeric,p_method text,p_reference text,p_notes text default null)
returns public.payout_settlements language plpgsql security definer set search_path=public as $$
declare p public.payouts; settled numeric(12,2); available numeric(12,2); collected numeric(12,2); refunded numeric(12,2); commission_due numeric(12,2); other_reserved numeric(12,2); result public.payout_settlements;
begin
  if not public.is_platform_admin() then raise exception 'Only platform administrators can record payout settlements'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) or p_method not in ('cash','bank_transfer') or length(coalesce(p_reference,''))>160 or length(coalesce(p_notes,''))>1000 then raise exception 'Enter valid settlement details'; end if;
  select * into p from public.payouts where id=p_payout_id for update;
  if not found or p.status not in ('approved','processing') then raise exception 'Only approved payouts can be settled'; end if;
  perform id from public.rental_offices where id=p.office_id for update;
  select coalesce(sum(amount),0) into settled from public.payout_settlements where payout_id=p.id;
  if p_amount>p.amount-settled then raise exception 'Settlement exceeds the remaining payout balance'; end if;
  select coalesce(sum(pm.amount),0) into collected from public.payments pm where pm.office_id=p.office_id and pm.currency=p.currency and pm.payment_type='rental' and pm.status in ('paid','partially_paid','partially_refunded','refunded');
  select coalesce(sum(r.amount),0) into refunded from public.refunds r join public.payments pm on pm.id=r.payment_id where pm.office_id=p.office_id and pm.currency=p.currency and r.status='completed';
  select coalesce(sum(least(b.commission_amount,round(b.commission_amount*greatest(0,
    coalesce((select sum(pm.amount) from public.payments pm where pm.booking_id=b.id and pm.payment_type='rental' and pm.status in ('paid','partially_paid','partially_refunded','refunded')),0)
    -coalesce((select sum(r.amount) from public.refunds r where r.booking_id=b.id and r.status='completed'),0)
  )/nullif(b.total_amount,0),2))),0)
    into commission_due from public.bookings b where b.office_id=p.office_id and b.currency=p.currency and b.total_amount>0;
  select coalesce(sum(amount),0) into other_reserved from public.payouts where office_id=p.office_id and currency=p.currency and id<>p.id and status in ('requested','approved','processing','paid');
  available:=greatest(0,collected-refunded-commission_due-other_reserved-settled);
  if p_amount>available then raise exception 'Settlement exceeds the available office balance after refunds and platform commission'; end if;
  insert into public.payout_settlements(payout_id,amount,currency,payment_method,reference,notes,settled_by)
    values(p.id,p_amount,p.currency,p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid()) returning * into result;
  settled:=settled+p_amount;
  update public.payouts set status=case when settled>=p.amount then 'paid' else 'processing' end,processed_by=auth.uid(),processed_at=now(),reference=coalesce(nullif(trim(p_reference),''),reference) where id=p.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'payout.manual_settlement','payout',p.id,p.office_id,jsonb_build_object('settlement_id',result.id,'amount',p_amount,'currency',p.currency,'method',p_method,'reference',p_reference,'status',case when settled>=p.amount then 'paid' else 'processing' end));
  return result;
end $$;

create or replace function public.office_financial_report(p_office_id uuid default null,p_from date default null,p_to date default null)
returns table(currency char(3),collected numeric,refunds numeric,commissions numeric,payouts numeric,expenses numeric,deposit_collected numeric,deposit_refunded numeric,deposit_deductions numeric)
language plpgsql stable security definer set search_path=public as $$
begin
  if p_office_id is null then
    if not public.is_platform_admin() and not exists(
      select 1 from public.user_roles ur join public.role_permissions rp on rp.role=ur.role
      where ur.user_id=auth.uid() and ur.role='admin_staff' and ur.scope_office_id is null
        and rp.permission_id='finance.read'
    ) then raise exception 'Platform finance permission required'; end if;
  elsif not public.is_platform_admin() and not public.has_office_permission(p_office_id,'finance.read') then
    raise exception 'Office finance permission required';
  end if;
  return query
  with currencies as (
    select p.currency c from public.payments p where (p_office_id is null or p.office_id=p_office_id)
    union select e.currency from public.office_expenses e where (p_office_id is null or e.office_id=p_office_id)
    union select po.currency from public.payouts po where (p_office_id is null or po.office_id=p_office_id)
    union select b.currency from public.commissions c join public.bookings b on b.id=c.booking_id where (p_office_id is null or c.office_id=p_office_id)
  ), pay as (
    select p.currency c,coalesce(sum(p.amount) filter(where p.payment_type='rental' and p.status in ('paid','partially_paid','partially_refunded','refunded')),0) collected,
      coalesce(sum(p.amount) filter(where p.payment_type='security_deposit' and p.status in ('paid','partially_paid')),0) deposit_collected
    from public.payments p
    where (p_office_id is null or p.office_id=p_office_id) and (p_from is null or p.created_at::date>=p_from) and (p_to is null or p.created_at::date<=p_to)
    group by p.currency
  ), cash_refunds as (
    select p.currency c,coalesce(sum(r.amount),0) refunds from public.refunds r join public.payments p on p.id=r.payment_id
    where (p_office_id is null or p.office_id=p_office_id) and r.status='completed'
      and (p_from is null or r.created_at::date>=p_from) and (p_to is null or r.created_at::date<=p_to) group by p.currency
  ), refund_cash as (
    select d.currency c,coalesce(sum(dt.amount) filter(where dt.transaction_type='refund'),0) deposit_refunded,
      coalesce(sum(dt.amount) filter(where dt.transaction_type='deduction'),0) deposit_deductions
    from public.deposit_transactions dt join public.deposits d on d.id=dt.deposit_id join public.bookings b on b.id=d.booking_id
    where (p_office_id is null or b.office_id=p_office_id) and (p_from is null or dt.created_at::date>=p_from) and (p_to is null or dt.created_at::date<=p_to)
    group by d.currency
  ), comm as (
    select b.currency x,coalesce(sum(c.commission_amount),0) total from public.commissions c join public.bookings b on b.id=c.booking_id
    where (p_office_id is null or c.office_id=p_office_id) and (p_from is null or c.created_at::date>=p_from) and (p_to is null or c.created_at::date<=p_to) group by b.currency
  ), payout as (
    select po.currency x,coalesce(sum(ps.amount),0) total from public.payout_settlements ps join public.payouts po on po.id=ps.payout_id
    where (p_office_id is null or po.office_id=p_office_id) and (p_from is null or ps.settled_at::date>=p_from) and (p_to is null or ps.settled_at::date<=p_to) group by po.currency
  ), expense as (
    select e.currency x,coalesce(sum(e.amount),0) total from public.office_expenses e
    where (p_office_id is null or e.office_id=p_office_id) and (p_from is null or e.expense_date>=p_from) and (p_to is null or e.expense_date<=p_to) group by e.currency
  )
  select c.c::char(3),coalesce(pay.collected,0),coalesce(cash_refunds.refunds,0),coalesce(comm.total,0),coalesce(payout.total,0),coalesce(expense.total,0),coalesce(pay.deposit_collected,0),coalesce(refund_cash.deposit_refunded,0),coalesce(refund_cash.deposit_deductions,0)
  from currencies c left join pay on pay.c=c.c left join cash_refunds on cash_refunds.c=c.c left join refund_cash on refund_cash.c=c.c left join comm on comm.x=c.c left join payout on payout.x=c.c left join expense on expense.x=c.c;
end $$;

create or replace function public.booking_financial_summary(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b public.bookings; d public.deposits; paid numeric(12,2); refunded numeric(12,2); pending numeric(12,2);
begin
  select * into b from public.bookings where id=p_booking_id;
  if not found or (b.customer_id<>auth.uid() and not public.has_office_permission(b.office_id,'finance.read') and not public.is_platform_admin()) then
    raise exception 'Booking not found or not authorized';
  end if;
  select coalesce(sum(amount),0) into paid from public.payments where booking_id=b.id and payment_type='rental' and status in ('paid','partially_paid','partially_refunded','refunded');
  select coalesce(sum(amount),0) into refunded from public.refunds where booking_id=b.id and status='completed';
  select coalesce(sum(amount),0) into pending from public.payments where booking_id=b.id and payment_type='rental' and status='pending_verification';
  select * into d from public.deposits where booking_id=b.id;
  return jsonb_build_object(
    'total',b.total_amount,'currency',b.currency,'payment_status',b.payment_status,
    'paid',greatest(0,paid-refunded),'refunded',refunded,'pending_verification',pending,
    'outstanding',greatest(0,b.total_amount-greatest(0,paid-refunded)-pending),
    'deposit_due',b.deposit_amount,'deposit_collected',coalesce(d.collected_amount,0),
    'deposit_outstanding',greatest(0,b.deposit_amount-coalesce(d.collected_amount,0)-coalesce((select sum(amount) from public.payments where booking_id=b.id and payment_type='security_deposit' and status='pending_verification'),0)),
    'deposit_status',coalesce(d.status,'pending')
  );
end $$;

create or replace function public.register_payment_proof(p_payment_id uuid,p_storage_path text,p_filename text,p_mime text,p_size bigint)
returns public.payment_proofs language plpgsql security definer set search_path=public as $$
declare p public.payments; result public.payment_proofs;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.payments where id=p_payment_id for update;
  if not found or p.status<>'pending_verification' or p.customer_id<>auth.uid() then raise exception 'Pending customer payment not found'; end if;
  if p_storage_path !~ ('^'||auth.uid()::text||'/'||p.id::text||'/[A-Za-z0-9._-]+$') or length(p_filename)>180 or p_size<1 or p_size>10485760 or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Invalid payment proof metadata'; end if;
  if not exists(select 1 from storage.objects where bucket_id='payment-proofs' and name=p_storage_path) then raise exception 'Uploaded proof file was not found'; end if;
  insert into public.payment_proofs(payment_id,uploaded_by,storage_path,original_filename,mime_type,byte_size)
    values(p.id,auth.uid(),p_storage_path,p_filename,p_mime,p_size) returning * into result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'payment.proof_uploaded','payment',p.id,p.office_id,jsonb_build_object('proof_id',result.id,'file',p_filename,'size',p_size,'mime_type',p_mime));
  return result;
end $$;

drop function if exists public.approve_refund(uuid,boolean,text);

-- Private evidence files use {user_id}/{payment_id}/{file}. Storage policies are
-- deliberately separate from metadata policies so callers cannot read another tenant's proof.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('payment-proofs','payment-proofs',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists payment_proof_scoped_read on storage.objects;
drop policy if exists payment_proof_owner_upload on storage.objects;

create policy payment_proof_scoped_read on storage.objects for select to authenticated using (
  bucket_id='payment-proofs' and exists(select 1 from public.payments p where p.id=(storage.foldername(name))[2]::uuid and
    (p.customer_id=auth.uid() or public.has_office_permission(p.office_id,'finance.read') or public.has_office_permission(p.office_id,'payments.verify') or public.is_platform_admin()))
);

create policy payment_proof_owner_upload on storage.objects for insert to authenticated with check (
  bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text and exists(
    select 1 from public.payments p where p.id=(storage.foldername(name))[2]::uuid and p.customer_id=auth.uid() and p.status='pending_verification')
);

grant execute on function public.record_manual_payment(uuid,numeric,text,text,text,text) to authenticated;
grant execute on function public.verify_manual_payment(uuid,boolean,text) to authenticated;
grant execute on function public.record_manual_refund(uuid,numeric,text,text,text) to authenticated;
grant execute on function public.release_security_deposit(uuid,numeric,text,text,text) to authenticated;
grant execute on function public.set_office_payment_instructions(uuid,jsonb) to authenticated;
grant execute on function public.issue_booking_invoice(uuid) to authenticated;
grant execute on function public.request_office_payout(uuid,numeric,text,text,text,text) to authenticated;
grant execute on function public.decide_payout(uuid,boolean,text) to authenticated;
grant execute on function public.record_payout_settlement(uuid,numeric,text,text,text) to authenticated;
grant execute on function public.office_financial_report(uuid,date,date) to authenticated;
grant execute on function public.booking_financial_summary(uuid) to authenticated;
grant execute on function public.register_payment_proof(uuid,text,text,text,bigint) to authenticated;

revoke all on function public.create_booking_deposit() from public,anon,authenticated;
revoke all on function public.refresh_booking_payment_status(uuid) from public,anon,authenticated;
revoke all on function public.guard_booking_payment_status() from public,anon,authenticated;
revoke all on function public.sync_booking_payment_status() from public,anon,authenticated;
revoke all on function public.record_manual_payment(uuid,numeric,text,text,text,text) from public,anon;
revoke all on function public.verify_manual_payment(uuid,boolean,text) from public,anon;
revoke all on function public.record_manual_refund(uuid,numeric,text,text,text) from public,anon;
revoke all on function public.release_security_deposit(uuid,numeric,text,text,text) from public,anon;
revoke all on function public.set_office_payment_instructions(uuid,jsonb) from public,anon;
revoke all on function public.issue_booking_invoice(uuid) from public,anon;
revoke all on function public.request_office_payout(uuid,numeric,text,text,text,text) from public,anon;
revoke all on function public.decide_payout(uuid,boolean,text) from public,anon;
revoke all on function public.record_payout_settlement(uuid,numeric,text,text,text) from public,anon;
revoke all on function public.office_financial_report(uuid,date,date) from public,anon;
revoke all on function public.booking_financial_summary(uuid) from public,anon;
revoke all on function public.register_payment_proof(uuid,text,text,text,bigint) from public,anon;
