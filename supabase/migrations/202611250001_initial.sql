-- Rentora initial marketplace schema. Apply with: supabase db push
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists citext;

create type public.app_role as enum ('super_admin','admin_staff','office_owner','office_manager','office_staff','customer');
create type public.office_status as enum ('draft','pending','approved','rejected','suspended');
create type public.booking_status as enum ('pending','confirmed','active','completed','cancelled','rejected');
create type public.vehicle_status as enum ('draft','available','rented','maintenance','archived');
create type public.ticket_status as enum ('open','in_progress','waiting','resolved','closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text, phone text, avatar_path text,
  preferred_language text not null default 'en' check (preferred_language in ('en','ar')),
  preferred_currency text not null default 'USD' check (preferred_currency in ('USD','SYP')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.permissions (id text primary key, description text not null);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null, scope_office_id uuid, created_at timestamptz not null default now(), unique(user_id,role,scope_office_id)
);
create table public.role_permissions (
  role public.app_role not null, permission_id text not null references public.permissions(id) on delete cascade,
  primary key(role,permission_id)
);
create table public.cities (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, name_ar text not null default '',
  governorate text, country_code char(2) not null default 'SY', timezone text not null default 'Asia/Damascus',
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.locations (
  id uuid primary key default gen_random_uuid(), city_id uuid not null references public.cities(id), name text not null,
  name_ar text, address text, latitude numeric(10,7), longitude numeric(10,7), location_type text not null default 'office',
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, description text,
  monthly_price numeric(12,2) not null default 0 check(monthly_price >= 0), annual_price numeric(12,2) not null default 0 check(annual_price >= 0),
  vehicle_limit integer, staff_limit integer, trial_days integer not null default 0, features jsonb not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.rental_offices (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), city_id uuid references public.cities(id),
  name text not null, slug text unique not null, description text, address text not null default '', phone text, email text,
  logo_path text, cover_path text, status public.office_status not null default 'pending', verified_at timestamptz,
  commission_rate numeric(5,4) not null default 0.1000 check(commission_rate between 0 and 1),
  payment_instructions jsonb not null default '{"cash":"Contact the office to arrange cash payment.","bank_transfer":"Contact the office for bank transfer details."}'::jsonb,
  average_rating numeric(3,2) not null default 0, review_count integer not null default 0,
  cancellation_policy jsonb not null default '{}', delivery_options jsonb not null default '[]', working_hours jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.user_roles add constraint user_roles_scope_office_fkey foreign key(scope_office_id) references public.rental_offices(id) on delete cascade;
create table public.office_members (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.rental_offices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role public.app_role not null check(role in ('office_owner','office_manager','office_staff')),
  permissions jsonb not null default '{}', invited_by uuid references public.profiles(id), joined_at timestamptz,
  status text not null default 'invited' check(status in ('invited','active','suspended')), created_at timestamptz not null default now(), unique(office_id,user_id)
);
create table public.office_documents (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.rental_offices(id) on delete cascade,
  document_type text not null, storage_path text not null, status text not null default 'pending', reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz, notes text, created_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.rental_offices(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id), status text not null default 'trialing' check(status in ('trialing','active','past_due','cancelled','expired')),
  billing_period text not null default 'monthly' check(billing_period in ('monthly','annual')), started_at timestamptz not null default now(),
  trial_ends_at timestamptz, current_period_start timestamptz, current_period_end timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.vehicle_categories (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, name_ar text, description text,
  icon text, sort_order integer not null default 0, is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.vehicles (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.rental_offices(id) on delete cascade,
  category_id uuid references public.vehicle_categories(id), make text not null, model text not null, model_year integer not null check(model_year between 1950 and 2100),
  slug text not null, description text, transmission text not null check(transmission in ('automatic','manual')),
  fuel_type text not null check(fuel_type in ('petrol','diesel','hybrid','electric','other')), seating_capacity integer not null check(seating_capacity between 1 and 20),
  color text, daily_rate numeric(12,2) not null check(daily_rate >= 0), weekly_rate numeric(12,2), monthly_rate numeric(12,2),
  deposit_amount numeric(12,2) not null default 0 check(deposit_amount >= 0), currency char(3) not null default 'USD',
  mileage_limit_daily integer, extra_mileage_rate numeric(12,2), insurance_details jsonb not null default '{}',
  status public.vehicle_status not null default 'draft', is_published boolean not null default false, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(office_id,slug)
);
create table public.vehicle_images (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  storage_path text not null, alt_text text, sort_order integer not null default 0, is_primary boolean not null default false, created_at timestamptz not null default now()
);
create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  document_type text not null, storage_path text not null, expires_at date, status text not null default 'active', created_at timestamptz not null default now()
);
create table public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_type text not null, description text, performed_at timestamptz not null, next_due_at timestamptz, cost numeric(12,2) not null default 0,
  odometer_km integer, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.vehicle_availability (
  id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, is_available boolean not null default false, reason text,
  created_at timestamptz not null default now(), check(ends_at > starts_at)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null, email text, phone text, date_of_birth date, driver_license_path text,
  license_number_encrypted text, notes text, is_blacklisted boolean not null default false, blacklist_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.coupons (
  id uuid primary key default gen_random_uuid(), code citext unique not null, discount_type text not null check(discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check(discount_value > 0), currency char(3) default 'USD', max_discount numeric(12,2),
  minimum_spend numeric(12,2) not null default 0, max_uses integer, uses_count integer not null default 0, per_customer_limit integer,
  starts_at timestamptz not null default now(), expires_at timestamptz, first_booking_only boolean not null default false,
  is_active boolean not null default true, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.promotions (
  id uuid primary key default gen_random_uuid(), office_id uuid references public.rental_offices(id) on delete cascade,
  coupon_id uuid references public.coupons(id) on delete set null, title text not null, description text, starts_at timestamptz not null,
  ends_at timestamptz not null, usage_limit integer, is_active boolean not null default true, created_at timestamptz not null default now(), check(ends_at > starts_at)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(), booking_number text unique not null default ('RN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  customer_id uuid not null references public.profiles(id), office_id uuid not null references public.rental_offices(id),
  vehicle_id uuid not null references public.vehicles(id), pickup_location_id uuid references public.locations(id), return_location_id uuid references public.locations(id),
  pickup_address text not null default '', return_address text not null default '', pickup_at timestamptz not null, return_at timestamptz not null,
  status public.booking_status not null default 'pending', currency char(3) not null default 'USD',
  rental_days integer not null check(rental_days > 0), daily_rate numeric(12,2) not null check(daily_rate >= 0),
  rental_subtotal numeric(12,2) not null check(rental_subtotal >= 0), delivery_fee numeric(12,2) not null default 0,
  insurance_fee numeric(12,2) not null default 0, extra_driver_fee numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0, service_fee numeric(12,2) not null default 0, tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null check(total_amount >= 0), deposit_amount numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0, coupon_id uuid references public.coupons(id), coupon_code text,
  driver_details jsonb not null default '{}', customer_note text, cancellation_reason text, confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(return_at > pickup_at),
  constraint bookings_vehicle_no_overlap exclude using gist (vehicle_id with =, tstzrange(pickup_at,return_at,'[)') with &&)
    where (status in ('pending','confirmed','active'))
);
create index bookings_customer_date_idx on public.bookings(customer_id,pickup_at desc);
create index bookings_office_status_idx on public.bookings(office_id,status,pickup_at);
create index vehicles_office_status_idx on public.vehicles(office_id,status);
create index vehicles_search_idx on public.vehicles(make,model,model_year);
create index vehicle_availability_period_idx on public.vehicle_availability using gist(vehicle_id, tstzrange(starts_at,ends_at,'[)'));
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupons(id), user_id uuid not null references public.profiles(id),
  booking_id uuid not null unique references public.bookings(id), redeemed_at timestamptz not null default now(), unique(coupon_id,user_id,booking_id)
);
create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
  old_status public.booking_status, new_status public.booking_status not null, changed_by uuid references public.profiles(id), note text,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.booking_pickups (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null unique references public.bookings(id) on delete cascade,
  recorded_by uuid references public.profiles(id), picked_up_at timestamptz not null default now(), odometer_km integer,
  fuel_level text, customer_signature_path text, notes text, created_at timestamptz not null default now()
);
create table public.booking_returns (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null unique references public.bookings(id) on delete cascade,
  recorded_by uuid references public.profiles(id), returned_at timestamptz not null default now(), odometer_km integer,
  fuel_level text, late_minutes integer not null default 0, notes text, created_at timestamptz not null default now()
);
create table public.inspection_records (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
  inspection_type text not null check(inspection_type in ('pickup','return','maintenance')), condition_summary text,
  damage_report jsonb not null default '[]', created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(), inspection_id uuid not null references public.inspection_records(id) on delete cascade,
  storage_path text not null, caption text, created_at timestamptz not null default now()
);
create table public.booking_charges (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
  charge_type text not null, description text not null, amount numeric(12,2) not null, currency char(3) not null default 'USD',
  approved_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), booking_id uuid references public.bookings(id), office_id uuid references public.rental_offices(id),
  customer_id uuid references public.profiles(id),
  payment_method text not null default 'cash' check(payment_method in ('cash','bank_transfer')), payment_type text not null default 'rental' check(payment_type in ('rental','security_deposit')),
  payment_source text not null default 'customer' check(payment_source in ('customer','office')), amount numeric(12,2) not null check(amount > 0), currency char(3) not null default 'USD',
  status text not null default 'pending_verification' check(status in ('unpaid','partially_paid','pending_verification','paid','refunded','partially_refunded','rejected')),
  verified_by uuid references public.profiles(id), verified_at timestamptz, recorded_by uuid references public.profiles(id), reference text, notes text,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.deposits (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null unique references public.bookings(id), amount numeric(12,2) not null check(amount >= 0),
  currency char(3) not null default 'USD', status text not null default 'pending' check(status in ('pending','partially_funded','held','partially_refunded','refunded','deducted')),
  collected_amount numeric(12,2) not null default 0 check(collected_amount >= 0 and collected_amount <= amount),
  deduction_amount numeric(12,2) not null default 0, reason text, released_by uuid references public.profiles(id), released_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), booking_id uuid not null references public.bookings(id),
  amount numeric(12,2) not null check(amount > 0), currency char(3) not null default 'USD', reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','processing','completed','rejected')),
  requested_by uuid references public.profiles(id), approved_by uuid references public.profiles(id), manual_reference text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id), invoice_number text unique not null,
  issued_at timestamptz not null default now(), due_at timestamptz, subtotal numeric(12,2) not null, tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null, currency char(3) not null default 'USD', storage_path text, created_at timestamptz not null default now()
);
create table public.rental_agreements (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id), version integer not null default 1,
  agreement_data jsonb not null default '{}', storage_path text, signed_at timestamptz, created_at timestamptz not null default now(), unique(booking_id,version)
);
create table public.commissions (
  id uuid primary key default gen_random_uuid(), booking_id uuid unique not null references public.bookings(id), office_id uuid not null references public.rental_offices(id),
  gross_amount numeric(12,2) not null, rate numeric(5,4) not null, commission_amount numeric(12,2) not null, status text not null default 'pending',
  settled_at timestamptz, created_at timestamptz not null default now()
);
create table public.payouts (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.rental_offices(id), amount numeric(12,2) not null check(amount > 0),
  currency char(3) not null default 'USD', status text not null default 'requested' check(status in ('requested','approved','processing','paid','rejected')),
  payout_method jsonb not null default '{}', reference text, requested_at timestamptz not null default now(), processed_at timestamptz,
  processed_by uuid references public.profiles(id), notes text
);
create table public.office_expenses (
  id uuid primary key default gen_random_uuid(), office_id uuid not null references public.rental_offices(id), category text not null,
  description text, amount numeric(12,2) not null check(amount >= 0), currency char(3) not null default 'USD', expense_date date not null default current_date,
  receipt_path text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), booking_id uuid unique not null references public.bookings(id), customer_id uuid not null references public.profiles(id),
  office_id uuid not null references public.rental_offices(id), vehicle_id uuid not null references public.vehicles(id), rating integer not null check(rating between 1 and 5),
  title text, body text, status text not null default 'pending' check(status in ('pending','published','hidden','reported','removed')),
  moderation_note text, moderated_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade, vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,vehicle_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid references public.profiles(id) on delete cascade,
  audience text check(audience in ('customer','office','platform','all')), office_id uuid references public.rental_offices(id) on delete cascade,
  title text not null, body text not null, channel text not null default 'in_app', template_key text,
  read_at timestamptz, scheduled_at timestamptz, sent_at timestamptz, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(), ticket_number text unique not null default ('SUP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  requester_id uuid not null references public.profiles(id), office_id uuid references public.rental_offices(id), booking_id uuid references public.bookings(id),
  subject text not null, category text not null default 'general', priority text not null default 'normal', status public.ticket_status not null default 'open',
  assigned_to uuid references public.profiles(id), resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id), body text not null, is_internal boolean not null default false, attachment_path text,
  created_at timestamptz not null default now()
);
create table public.disputes (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id), opened_by uuid not null references public.profiles(id),
  category text not null, description text not null, status text not null default 'open' check(status in ('open','investigating','resolved','rejected')),
  resolution text, resolved_by uuid references public.profiles(id), resolved_at timestamptz, created_at timestamptz not null default now()
);
create table public.cms_pages (
  id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null, title_ar text, body text not null default '', body_ar text,
  status text not null default 'draft' check(status in ('draft','published')), seo jsonb not null default '{}', updated_by uuid references public.profiles(id),
  published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.banners (
  id uuid primary key default gen_random_uuid(), title text not null, title_ar text, image_path text, target_url text, placement text not null default 'home',
  starts_at timestamptz, ends_at timestamptz, sort_order integer not null default 0, is_active boolean not null default false, created_at timestamptz not null default now()
);
create table public.platform_settings (
  key text primary key, value jsonb not null, is_public boolean not null default false, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null, entity_type text not null,
  entity_id uuid, office_id uuid references public.rental_offices(id), ip_address inet, user_agent text, before_data jsonb, after_data jsonb,
  created_at timestamptz not null default now()
);
create table public.login_history (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), ip_address inet, user_agent text,
  success boolean not null, failure_reason text, created_at timestamptz not null default now()
);

insert into public.permissions(id,description) values
 ('office.read','Read office workspace'),('office.manage','Manage office profile'),('fleet.manage','Create and manage vehicles'),
 ('bookings.manage','Manage booking lifecycle'),('finance.read','Read office finances'),('staff.manage','Manage office staff'),
 ('customers.read','Read customer directory'),('promotions.manage','Manage office promotions'),('deposits.manage','Resolve held deposits'),
 ('platform.read','Read platform administration'),('platform.manage','Manage platform settings'),('payments.verify','Verify manual payments'),('refunds.approve','Approve refunds')
on conflict do nothing;
insert into public.platform_settings(key,value,is_public) values
 ('platform_name','"Rentora"',true),('default_currency','"USD"',true),('syp_per_usd','null',true),
 ('platform_commission_rate','0.10',false),('booking_service_fee_rate','0.04',false),('tax_rate','0',false),
 ('supported_languages','["en","ar"]',true),
 ('booking_rules','{"minimum_hours":4,"maximum_days":60,"delivery_fee":18,"insurance_per_day":8,"extra_driver_per_day":5,"late_fee_per_hour":10}',true),('maintenance_mode','false',true)
on conflict(key) do nothing;
insert into public.subscription_plans(code,name,description,monthly_price,annual_price,vehicle_limit,staff_limit,trial_days,features) values
 ('starter','Starter','For a growing local fleet',0,0,5,2,14,'{"calendar":true,"reports":true}'),
 ('growth','Growth','For busy rental teams',39,390,25,10,14,'{"calendar":true,"reports":true,"promotions":true}'),
 ('scale','Scale','For established operators',89,890,null,null,14,'{"calendar":true,"reports":true,"promotions":true,"priority_support":true}')
on conflict(code) do nothing;
insert into public.vehicle_categories(slug,name,name_ar,sort_order) values
 ('economy','Economy','اقتصادية',1),('comfort','Comfort','مريحة',2),('suv','SUV','دفع رباعي',3),('premium','Premium','فاخرة',4),('van','Van','فان',5)
on conflict(slug) do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.user_roles where user_id=auth.uid() and role='super_admin')
  or exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role=ur.role
    where ur.user_id=auth.uid() and ur.role='admin_staff' and rp.permission_id='platform.manage') $$;

create or replace function public.is_office_member(target_office uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.office_members where office_id=target_office and user_id=auth.uid() and status='active')
  or exists(select 1 from public.rental_offices where id=target_office and owner_id=auth.uid()) $$;

create or replace function public.can_manage_office(target_office uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platform_admin() or exists(select 1 from public.rental_offices where id=target_office and owner_id=auth.uid())
  or exists(select 1 from public.office_members where office_id=target_office and user_id=auth.uid() and status='active' and role in ('office_owner','office_manager')) $$;

create or replace function public.has_office_permission(target_office uuid,required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() or exists(select 1 from public.rental_offices where id=target_office and owner_id=auth.uid())
    or exists(select 1 from public.office_members m where m.office_id=target_office and m.user_id=auth.uid() and m.status='active'
      and (m.role in ('office_owner','office_manager') or (m.role='office_staff' and coalesce((m.permissions->>required_permission)::boolean,false))))
$$;

create or replace function public.list_my_offices()
returns table(id uuid,slug text,name text,office_role public.app_role)
language sql stable security definer set search_path=public as $$
  select o.id,o.slug,o.name,case when o.owner_id=auth.uid() then 'office_owner'::public.app_role else m.role end
  from public.rental_offices o left join public.office_members m on m.office_id=o.id and m.user_id=auth.uid() and m.status='active'
  where o.owner_id=auth.uid() or m.user_id=auth.uid() or public.is_platform_admin()
  order by o.created_at asc
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,email,phone,preferred_language)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,new.phone,coalesce(new.raw_user_meta_data->>'preferred_language','en'))
  on conflict(id) do update set email=excluded.email;
  insert into public.user_roles(user_id,role) values(new.id,'customer') on conflict(user_id,role,scope_office_id) do nothing;
  insert into public.customers(user_id,full_name,email,phone)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,new.phone) on conflict(user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.log_booking_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then insert into public.booking_status_history(booking_id,new_status,changed_by) values(new.id,new.status,auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(new.id,old.status,new.status,auth.uid());
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,before_data,after_data)
    values(auth.uid(),'booking.status_changed','booking',new.id,new.office_id,jsonb_build_object('status',old.status),jsonb_build_object('status',new.status));
  end if;
  return new;
end $$;
create or replace function public.protect_profile_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() and new.status is distinct from old.status then
    raise exception 'Only platform administrators can change profile status';
  end if;
  return new;
end $$;
create trigger protect_profile_status before update on public.profiles for each row execute function public.protect_profile_status();
create or replace function public.protect_office_controls()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    new.owner_id:=old.owner_id; new.status:=old.status; new.verified_at:=old.verified_at; new.commission_rate:=old.commission_rate;
  end if;
  return new;
end $$;
create trigger protect_office_controls before update on public.rental_offices for each row execute function public.protect_office_controls();
create or replace function public.protect_booking_financials()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    if new.customer_id is distinct from old.customer_id or new.office_id is distinct from old.office_id or new.vehicle_id is distinct from old.vehicle_id
      or new.pickup_at is distinct from old.pickup_at or new.return_at is distinct from old.return_at or new.currency is distinct from old.currency
      or new.rental_days is distinct from old.rental_days or new.daily_rate is distinct from old.daily_rate or new.rental_subtotal is distinct from old.rental_subtotal
      or new.delivery_fee is distinct from old.delivery_fee or new.insurance_fee is distinct from old.insurance_fee or new.extra_driver_fee is distinct from old.extra_driver_fee
      or new.discount_amount is distinct from old.discount_amount or new.service_fee is distinct from old.service_fee or new.tax_amount is distinct from old.tax_amount or new.total_amount is distinct from old.total_amount
      or new.deposit_amount is distinct from old.deposit_amount or new.commission_amount is distinct from old.commission_amount then
      raise exception 'Booking dates, participants and amounts cannot be changed by office users';
    end if;
  end if;
  if new.status is distinct from old.status and auth.uid() is not null and not public.is_platform_admin() then
    if old.status in ('pending','confirmed') and new.status='cancelled' and old.customer_id=auth.uid() then return new; end if;
    if not public.has_office_permission(new.office_id,'bookings.manage') then raise exception 'Not authorized to change booking status'; end if;
    if old.status='pending' and new.status not in ('confirmed','rejected','cancelled') then raise exception 'Invalid booking status transition'; end if;
    if old.status='confirmed' and new.status not in ('active','cancelled') then raise exception 'Invalid booking status transition'; end if;
    if old.status='active' and new.status<>'completed' then raise exception 'Invalid booking status transition'; end if;
    if old.status in ('completed','cancelled','rejected') then raise exception 'A closed booking cannot be changed'; end if;
    if new.status='active' and not exists(select 1 from public.booking_pickups where booking_id=old.id) then raise exception 'Record pickup details before starting the rental'; end if;
    if new.status='completed' and not exists(select 1 from public.booking_returns where booking_id=old.id) then raise exception 'Record return details before completing the rental'; end if;
    if new.status='confirmed' then new.confirmed_at:=coalesce(new.confirmed_at,now()); end if;
  end if;
  return new;
end $$;
create trigger protect_booking_financials before update on public.bookings for each row execute function public.protect_booking_financials();
create or replace function public.protect_customer_controls()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() and new.user_id=auth.uid() then
    new.is_blacklisted:=old.is_blacklisted; new.blacklist_reason:=old.blacklist_reason; new.notes:=old.notes;
  end if;
  return new;
end $$;
create trigger protect_customer_controls before update on public.customers for each row execute function public.protect_customer_controls();
create or replace function public.protect_support_input()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    if tg_table_name='support_tickets' then
      new.status:='open'; new.priority:='normal'; new.assigned_to:=null; new.resolved_at:=null;
    elsif tg_table_name='support_messages' and new.is_internal then
      raise exception 'Only platform administrators can add internal support notes';
    elsif tg_table_name='disputes' then
      new.status:='open'; new.resolution:=null; new.resolved_by:=null; new.resolved_at:=null;
    end if;
  end if;
  return new;
end $$;
create trigger protect_support_ticket_input before insert on public.support_tickets for each row execute function public.protect_support_input();
create trigger protect_support_message_input before insert on public.support_messages for each row execute function public.protect_support_input();
create trigger protect_dispute_input before insert on public.disputes for each row execute function public.protect_support_input();
create trigger bookings_status_history after insert or update of status on public.bookings for each row execute function public.log_booking_status();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger offices_updated before update on public.rental_offices for each row execute function public.set_updated_at();
create trigger vehicles_updated before update on public.vehicles for each row execute function public.set_updated_at();
create trigger bookings_updated before update on public.bookings for each row execute function public.set_updated_at();

create or replace function public.calculate_booking_quote(
  p_vehicle_id uuid,p_pickup_at timestamptz,p_return_at timestamptz,p_delivery boolean default false,
  p_insurance boolean default false,p_extra_driver boolean default false,p_coupon text default null
) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare v public.vehicles%rowtype; n_days integer; n_months integer; n_rest integer; n_weeks integer; n_left integer; n_rental numeric(12,2); n_delivery numeric(12,2);
  n_insurance numeric(12,2); n_driver numeric(12,2); n_fee numeric(12,2); n_tax numeric(12,2); n_discount numeric(12,2):=0; n_total numeric(12,2);
  fee_rate numeric:=coalesce((select (value#>>'{}')::numeric from public.platform_settings where key='booking_service_fee_rate'),0.04);
  tax_rate numeric:=coalesce((select (value#>>'{}')::numeric from public.platform_settings where key='tax_rate'),0);
  n_coupon public.coupons%rowtype;
begin
  if p_return_at <= p_pickup_at then raise exception 'Return must be after pickup'; end if;
  if p_pickup_at < now() then raise exception 'Pickup must be in the future'; end if;
  select v.* into v from public.vehicles v join public.rental_offices o on o.id=v.office_id
  where v.id=p_vehicle_id and v.status='available' and v.is_published=true and o.status='approved';
  if not found then raise exception 'Vehicle is not available for booking'; end if;
  n_days:=greatest(1,ceil(extract(epoch from (p_return_at-p_pickup_at))/86400)::integer);
  if extract(epoch from (p_return_at-p_pickup_at))/3600 < coalesce((select (value->>'minimum_hours')::integer from public.platform_settings where key='booking_rules'),4) then raise exception 'Rental does not meet the minimum duration'; end if;
  if n_days > coalesce((select (value->>'maximum_days')::integer from public.platform_settings where key='booking_rules'),60) then raise exception 'Rental exceeds the maximum duration'; end if;
  n_months:=n_days/30; n_rest:=n_days%30; n_weeks:=n_rest/7; n_left:=n_rest%7;
  n_rental:=case when n_months>0 and v.monthly_rate is not null then n_months*v.monthly_rate + case when n_weeks>0 and v.weekly_rate is not null then n_weeks*v.weekly_rate+n_left*v.daily_rate else n_rest*v.daily_rate end
    when n_weeks>0 and v.weekly_rate is not null then n_weeks*v.weekly_rate+n_left*v.daily_rate else n_days*v.daily_rate end;
  n_delivery:=case when p_delivery then coalesce((select (value->>'delivery_fee')::numeric from public.platform_settings where key='booking_rules'),18) else 0 end;
  n_insurance:=case when p_insurance then n_days*coalesce((select (value->>'insurance_per_day')::numeric from public.platform_settings where key='booking_rules'),8) else 0 end;
  n_driver:=case when p_extra_driver then n_days*coalesce((select (value->>'extra_driver_per_day')::numeric from public.platform_settings where key='booking_rules'),5) else 0 end;
  if p_coupon is not null and length(trim(p_coupon))>0 then
    select * into n_coupon from public.coupons where code=upper(trim(p_coupon)) and is_active and starts_at<=now() and (expires_at is null or expires_at>now()) and (max_uses is null or uses_count<max_uses);
    if found and n_rental+n_delivery+n_insurance+n_driver>=n_coupon.minimum_spend then
      if n_coupon.discount_type='percent' then n_discount:=least(n_rental*(n_coupon.discount_value/100),coalesce(n_coupon.max_discount,n_rental));
      else n_discount:=least(n_coupon.discount_value,n_rental); end if;
    end if;
  end if;
  n_fee:=round(greatest(0,n_rental+n_delivery+n_insurance+n_driver-n_discount)*fee_rate,2);
  n_tax:=round(greatest(0,n_rental+n_delivery+n_insurance+n_driver+n_fee-n_discount)*tax_rate,2);
  n_total:=greatest(0,n_rental+n_delivery+n_insurance+n_driver+n_fee+n_tax-n_discount);
  return jsonb_build_object('days',n_days,'currency',v.currency,'daily_rate',v.daily_rate,'rental_subtotal',n_rental,'delivery_fee',n_delivery,'insurance_fee',n_insurance,'extra_driver_fee',n_driver,'discount_amount',n_discount,'service_fee',n_fee,'tax_amount',n_tax,'total_amount',n_total,'deposit_amount',v.deposit_amount);
end $$;

create or replace function public.search_available_vehicles(
  p_pickup_at timestamptz default null,p_return_at timestamptz default null,p_city text default null,p_category text default null,
  p_transmission text default null,p_fuel text default null,p_seats integer default null,p_max_price numeric default null
) returns table(
  id uuid,slug text,office_id uuid,office_slug text,office_name text,city text,category text,category_slug text,make text,model text,model_year integer,
  transmission text,fuel_type text,seating_capacity integer,daily_rate numeric,weekly_rate numeric,monthly_rate numeric,deposit_amount numeric,currency char(3),
  mileage_limit_daily integer,extra_mileage_rate numeric,color text,primary_image_path text,average_rating numeric,review_count integer
) language plpgsql stable security definer set search_path=public as $$
begin
  if (p_pickup_at is null) <> (p_return_at is null) then raise exception 'Both rental dates are required'; end if;
  if p_pickup_at is not null and p_return_at<=p_pickup_at then raise exception 'Return must be after pickup'; end if;
  return query
  select v.id,v.slug,o.id,o.slug,o.name,c.name,coalesce(cat.name,'Other'),cat.slug,v.make,v.model,v.model_year,v.transmission,v.fuel_type,v.seating_capacity,
    v.daily_rate,v.weekly_rate,v.monthly_rate,v.deposit_amount,v.currency,v.mileage_limit_daily,v.extra_mileage_rate,v.color,
    (select vi.storage_path from public.vehicle_images vi where vi.vehicle_id=v.id order by vi.is_primary desc,vi.sort_order asc limit 1),
    coalesce((select round(avg(r.rating),2) from public.reviews r where r.vehicle_id=v.id and r.status='published'),0),
    (select count(*)::integer from public.reviews r where r.vehicle_id=v.id and r.status='published')
  from public.vehicles v join public.rental_offices o on o.id=v.office_id left join public.cities c on c.id=o.city_id
  left join public.vehicle_categories cat on cat.id=v.category_id
  where v.status='available' and v.is_published and o.status='approved' and (cat.is_active is distinct from false)
    and (p_city is null or lower(c.name)=lower(p_city) or c.slug=lower(p_city))
    and (p_category is null or cat.slug=lower(p_category))
    and (p_transmission is null or v.transmission=lower(p_transmission))
    and (p_fuel is null or v.fuel_type=lower(p_fuel))
    and (p_seats is null or v.seating_capacity>=p_seats)
    and (p_max_price is null or v.daily_rate<=p_max_price)
    and (p_pickup_at is null or not exists(select 1 from public.bookings b where b.vehicle_id=v.id and b.status in ('pending','confirmed','active') and b.pickup_at<p_return_at and b.return_at>p_pickup_at))
    and (p_pickup_at is null or not exists(select 1 from public.vehicle_availability a where a.vehicle_id=v.id and not a.is_available and a.starts_at<p_return_at and a.ends_at>p_pickup_at))
  order by v.daily_rate asc,v.created_at desc limit 200;
end $$;

create or replace function public.request_booking(
  p_vehicle_id uuid,p_pickup_at timestamptz,p_return_at timestamptz,p_pickup_address text,p_return_address text,
  p_delivery boolean default false,p_insurance boolean default false,p_extra_driver boolean default false,p_coupon text default null,p_customer_note text default null
) returns public.bookings language plpgsql security definer set search_path=public as $$
declare q jsonb; v public.vehicles%rowtype; result public.bookings; commission_rate numeric; applied_coupon public.coupons%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select v.* into v from public.vehicles v join public.rental_offices o on o.id=v.office_id
  where v.id=p_vehicle_id and v.status='available' and v.is_published=true and o.status='approved';
  if not found then raise exception 'Vehicle is not available'; end if;
  q:=public.calculate_booking_quote(p_vehicle_id,p_pickup_at,p_return_at,p_delivery,p_insurance,p_extra_driver,p_coupon);
  select o.commission_rate into commission_rate from public.rental_offices o where o.id=v.office_id;
  if p_coupon is not null and length(trim(p_coupon))>0 then
    select * into applied_coupon from public.coupons where code=upper(trim(p_coupon)) and is_active and starts_at<=now() and (expires_at is null or expires_at>now()) for update;
    if found then
      if applied_coupon.max_uses is not null and applied_coupon.uses_count>=applied_coupon.max_uses then raise exception 'Coupon usage limit reached'; end if;
      if applied_coupon.first_booking_only and exists(select 1 from public.bookings where customer_id=auth.uid() and status<>'cancelled') then raise exception 'Coupon is for first bookings only'; end if;
      if applied_coupon.per_customer_limit is not null and (select count(*) from public.coupon_redemptions where coupon_id=applied_coupon.id and user_id=auth.uid())>=applied_coupon.per_customer_limit then raise exception 'Coupon customer limit reached'; end if;
    end if;
  end if;
  insert into public.bookings(customer_id,office_id,vehicle_id,pickup_at,return_at,pickup_address,return_address,status,currency,rental_days,daily_rate,
    rental_subtotal,delivery_fee,insurance_fee,extra_driver_fee,discount_amount,service_fee,tax_amount,total_amount,deposit_amount,commission_amount,coupon_id,coupon_code,customer_note)
  values(auth.uid(),v.office_id,v.id,p_pickup_at,p_return_at,p_pickup_address,p_return_address,'pending',(q->>'currency')::char(3),(q->>'days')::integer,
    (q->>'daily_rate')::numeric,(q->>'rental_subtotal')::numeric,(q->>'delivery_fee')::numeric,(q->>'insurance_fee')::numeric,(q->>'extra_driver_fee')::numeric,
    (q->>'discount_amount')::numeric,(q->>'service_fee')::numeric,(q->>'tax_amount')::numeric,(q->>'total_amount')::numeric,(q->>'deposit_amount')::numeric,
    round((q->>'rental_subtotal')::numeric*coalesce(commission_rate,0.10),2),applied_coupon.id,nullif(p_coupon,''),p_customer_note) returning * into result;
  if applied_coupon.id is not null then
    update public.coupons set uses_count=uses_count+1 where id=applied_coupon.id;
    insert into public.coupon_redemptions(coupon_id,user_id,booking_id) values(applied_coupon.id,auth.uid(),result.id);
  end if;
  return result;
end $$;

create or replace function public.cancel_booking(p_booking_id uuid,p_reason text default null)
returns public.bookings language plpgsql security definer set search_path=public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or (b.customer_id<>auth.uid() and not public.can_manage_office(b.office_id) and not public.is_platform_admin()) then raise exception 'Booking not found or not authorized'; end if;
  if b.status not in ('pending','confirmed') then raise exception 'This booking can no longer be cancelled'; end if;
  update public.bookings set status='cancelled',cancellation_reason=p_reason where id=b.id returning * into b;
  return b;
end $$;

create or replace function public.decide_booking_request(p_booking_id uuid,p_approve boolean,p_note text default null)
returns public.bookings language plpgsql security definer set search_path=public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or not public.has_office_permission(b.office_id,'bookings.manage') then raise exception 'Booking not found or not authorized'; end if;
  if b.status<>'pending' then raise exception 'Only pending requests can be decided'; end if;
  update public.bookings set status=case when p_approve then 'confirmed'::public.booking_status else 'rejected'::public.booking_status end,
    confirmed_at=case when p_approve then now() else null end,cancellation_reason=case when p_approve then null else p_note end
  where id=b.id returning * into b;
  return b;
end $$;

create or replace function public.verify_manual_payment(p_payment_id uuid,p_approved boolean,p_note text default null)
returns public.payments language plpgsql security definer set search_path=public as $$
declare p public.payments;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found or (not public.is_platform_admin() and (p.office_id is null or not public.has_office_permission(p.office_id,'payments.verify'))) then raise exception 'Payment not found or not authorized'; end if;
  if p.status<>'pending_verification' then raise exception 'Only pending manual payments can be verified'; end if;
  update public.payments set status=case when p_approved then 'paid' else 'rejected' end,
    verified_by=auth.uid(),verified_at=now(),metadata=metadata||jsonb_build_object('verification_note',p_note)
  where id=p.id returning * into p;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),case when p_approved then 'payment.verified' else 'payment.rejected' end,'payment',p.id,p.office_id,jsonb_build_object('status',p.status,'amount',p.amount));
  return p;
end $$;

create or replace function public.approve_refund(p_refund_id uuid,p_approved boolean,p_note text default null)
returns public.refunds language plpgsql security definer set search_path=public as $$
declare r public.refunds; already_refunded numeric;
begin
  if not public.is_platform_admin() then raise exception 'Only platform administrators can approve refunds'; end if;
  select * into r from public.refunds where id=p_refund_id for update;
  if not found or r.status<>'pending' then raise exception 'Pending refund not found'; end if;
  select coalesce(sum(amount),0) into already_refunded from public.refunds where payment_id=r.payment_id and status in ('approved','processing','completed');
  if p_approved and already_refunded+r.amount>(select amount from public.payments where id=r.payment_id) then raise exception 'Refund exceeds the remaining captured payment'; end if;
  update public.refunds set status=case when p_approved then 'approved' else 'rejected' end,approved_by=auth.uid(),updated_at=now(),reason=reason||case when p_note is null then '' else ' — '||p_note end where id=r.id returning * into r;
  return r;
end $$;

create or replace function public.record_pickup(p_booking_id uuid,p_odometer integer,p_fuel text,p_notes text default null)
returns public.booking_pickups language plpgsql security definer set search_path=public as $$
declare b public.bookings; r public.booking_pickups;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or not public.has_office_permission(b.office_id,'bookings.manage') then raise exception 'Booking not found or not authorized'; end if;
  if b.status<>'confirmed' then raise exception 'Only confirmed bookings can be picked up'; end if;
  insert into public.booking_pickups(booking_id,recorded_by,odometer_km,fuel_level,notes) values(b.id,auth.uid(),p_odometer,p_fuel,p_notes) returning * into r;
  if b.deposit_amount>0 then insert into public.deposits(booking_id,amount,currency,status) values(b.id,b.deposit_amount,b.currency,'held') on conflict(booking_id) do nothing; end if;
  update public.bookings set status='active' where id=b.id;
  return r;
end $$;

create or replace function public.record_return(p_booking_id uuid,p_odometer integer,p_fuel text,p_late_minutes integer default 0,p_damage jsonb default '[]')
returns public.booking_returns language plpgsql security definer set search_path=public as $$
declare b public.bookings; r public.booking_returns; inspection_id uuid;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or not public.has_office_permission(b.office_id,'bookings.manage') then raise exception 'Booking not found or not authorized'; end if;
  if b.status<>'active' then raise exception 'Only active rentals can be returned'; end if;
  if p_odometer < coalesce((select odometer_km from public.booking_pickups where booking_id=b.id),0) then raise exception 'Return odometer cannot be lower than pickup'; end if;
  insert into public.booking_returns(booking_id,recorded_by,odometer_km,fuel_level,late_minutes) values(b.id,auth.uid(),p_odometer,p_fuel,greatest(0,p_late_minutes)) returning * into r;
  insert into public.inspection_records(booking_id,inspection_type,damage_report,created_by) values(b.id,'return',coalesce(p_damage,'[]'),auth.uid()) returning id into inspection_id;
  if p_late_minutes>0 then
    insert into public.booking_charges(booking_id,charge_type,description,amount,currency,approved_by)
    select b.id,'late_fee','Late return ('||p_late_minutes||' minutes)',ceil(p_late_minutes/60.0)*coalesce((value->>'late_fee_per_hour')::numeric,10),b.currency,auth.uid()
    from public.platform_settings where key='booking_rules';
  end if;
  update public.bookings set status='completed' where id=b.id;
  insert into public.commissions(booking_id,office_id,gross_amount,rate,commission_amount,status)
    select b.id,b.office_id,b.rental_subtotal,o.commission_rate,b.commission_amount,'pending' from public.rental_offices o where o.id=b.office_id on conflict(booking_id) do nothing;
  return r;
end $$;

create or replace function public.release_security_deposit(p_deposit_id uuid,p_deduction numeric default 0,p_reason text default null)
returns public.deposits language plpgsql security definer set search_path=public as $$
declare d public.deposits; b public.bookings;
begin
  select * into d from public.deposits where id=p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  select * into b from public.bookings where id=d.booking_id;
  if not public.is_platform_admin() and not public.has_office_permission(b.office_id,'deposits.manage') then raise exception 'Not authorized to release this deposit'; end if;
  if b.status<>'completed' then raise exception 'Deposit can only be released after the rental is completed'; end if;
  if d.status<>'held' or p_deduction<0 or p_deduction>d.amount then raise exception 'Invalid deposit deduction'; end if;
  update public.deposits set deduction_amount=p_deduction,reason=p_reason,
    status=case when p_deduction=0 then 'refunded' when p_deduction<amount then 'partially_refunded' else 'deducted' end,
    released_by=auth.uid(),released_at=now() where id=d.id returning * into d;
  if p_deduction>0 then
    insert into public.booking_charges(booking_id,charge_type,description,amount,currency,approved_by)
      values(b.id,'deposit_deduction',coalesce(p_reason,'Security deposit deduction'),p_deduction,b.currency,auth.uid());
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'deposit.released','deposit',d.id,b.office_id,jsonb_build_object('amount',d.amount,'deduction',p_deduction,'status',d.status));
  return d;
end $$;

-- RLS: turn it on for every application table before adding narrowly scoped policies.
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' and tablename not in ('spatial_ref_sys') loop execute format('alter table public.%I enable row level security',t.tablename); end loop; end $$;

create policy profiles_read_self_admin on public.profiles for select using (id=auth.uid() or public.is_platform_admin());
create policy profiles_update_self_admin on public.profiles for update using (id=auth.uid() or public.is_platform_admin()) with check (id=auth.uid() or public.is_platform_admin());
create policy profiles_booking_participant_read on public.profiles for select using (exists(select 1 from public.bookings b where b.customer_id=profiles.id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy user_roles_read_self_admin on public.user_roles for select using (user_id=auth.uid() or public.is_platform_admin());
create policy user_roles_admin_manage on public.user_roles for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy permissions_read_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_read_authenticated on public.role_permissions for select to authenticated using (true);
create policy role_permissions_admin_manage on public.role_permissions for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy cities_public_read on public.cities for select using (is_active or public.is_platform_admin());
create policy cities_admin_manage on public.cities for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy locations_public_read on public.locations for select using (is_active or public.is_platform_admin());
create policy locations_admin_manage on public.locations for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy categories_public_read on public.vehicle_categories for select using (is_active or public.is_platform_admin());
create policy categories_admin_manage on public.vehicle_categories for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy plans_public_read on public.subscription_plans for select using (is_active or public.is_platform_admin());
create policy plans_admin_manage on public.subscription_plans for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy offices_public_read on public.rental_offices for select using (status='approved' or owner_id=auth.uid() or public.is_office_member(id) or public.is_platform_admin());
create policy offices_owner_insert on public.rental_offices for insert with check (public.is_platform_admin() or (owner_id=auth.uid() and status in ('draft','pending') and verified_at is null and commission_rate=0.1000));
create policy offices_owner_update on public.rental_offices for update using (owner_id=auth.uid() or public.is_platform_admin()) with check (owner_id=auth.uid() or public.is_platform_admin());
create policy offices_owner_delete on public.rental_offices for delete using (owner_id=auth.uid() or public.is_platform_admin());
create policy office_members_scoped_read on public.office_members for select using (user_id=auth.uid() or public.is_office_member(office_id) or public.is_platform_admin());
create policy office_members_managers_manage on public.office_members for all using (public.can_manage_office(office_id)) with check (public.can_manage_office(office_id));
create policy office_documents_scoped on public.office_documents for all using (public.can_manage_office(office_id)) with check (public.can_manage_office(office_id));
create policy subscriptions_scoped_read on public.subscriptions for select using (public.is_office_member(office_id) or public.is_platform_admin());
create policy subscriptions_admin_manage on public.subscriptions for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy vehicles_public_read on public.vehicles for select using ((is_published and status='available') or public.is_office_member(office_id) or public.is_platform_admin());
create policy vehicles_office_manage on public.vehicles for all using (public.has_office_permission(office_id,'fleet.manage')) with check (public.has_office_permission(office_id,'fleet.manage'));
create policy vehicle_images_public_read on public.vehicle_images for select using (exists(select 1 from public.vehicles v where v.id=vehicle_id and ((v.is_published and v.status='available') or public.is_office_member(v.office_id) or public.is_platform_admin())));
create policy vehicle_images_office_manage on public.vehicle_images for all using (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage'))) with check (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage')));
create policy vehicle_documents_office_scope on public.vehicle_documents for all using (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage'))) with check (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage')));
create policy vehicle_maintenance_office_scope on public.vehicle_maintenance for all using (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage'))) with check (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage')));
create policy vehicle_availability_read_scope on public.vehicle_availability for select using (exists(select 1 from public.vehicles v where v.id=vehicle_id and ((v.is_published and v.status='available') or public.is_office_member(v.office_id) or public.is_platform_admin())));
create policy vehicle_availability_office_manage on public.vehicle_availability for all using (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage'))) with check (exists(select 1 from public.vehicles v where v.id=vehicle_id and public.has_office_permission(v.office_id,'fleet.manage')));

create policy customers_self_office_admin_read on public.customers for select using (user_id=auth.uid() or public.is_platform_admin() or exists(select 1 from public.bookings b where b.customer_id=customers.user_id and public.has_office_permission(b.office_id,'customers.read')));
create policy customers_self_update on public.customers for update using (user_id=auth.uid() or public.is_platform_admin()) with check (user_id=auth.uid() or public.is_platform_admin());
create policy customers_admin_insert on public.customers for insert with check (public.is_platform_admin() or user_id=auth.uid());
create policy coupons_public_active_read on public.coupons for select using (is_active and starts_at<=now() and (expires_at is null or expires_at>now()));
create policy coupons_admin_manage on public.coupons for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy coupon_redemptions_self_admin on public.coupon_redemptions for select using (user_id=auth.uid() or public.is_platform_admin());
create policy promotions_public_read on public.promotions for select using (is_active and starts_at<=now() and ends_at>now());
create policy promotions_office_admin_manage on public.promotions for all using (public.is_platform_admin() or (office_id is not null and public.has_office_permission(office_id,'promotions.manage'))) with check (public.is_platform_admin() or (office_id is not null and public.has_office_permission(office_id,'promotions.manage')));

create policy bookings_participant_read on public.bookings for select using (customer_id=auth.uid() or public.is_office_member(office_id) or public.is_platform_admin());
create policy bookings_customer_request on public.bookings for insert with check (customer_id=auth.uid() and status='pending');
create policy bookings_office_admin_update on public.bookings for update using (public.has_office_permission(office_id,'bookings.manage')) with check (public.has_office_permission(office_id,'bookings.manage'));
create policy booking_history_participant_read on public.booking_status_history for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy pickup_office_read on public.booking_pickups for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy pickup_office_manage on public.booking_pickups for all using (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage'))) with check (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage')));
create policy returns_office_read on public.booking_returns for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy returns_office_manage on public.booking_returns for all using (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage'))) with check (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage')));
create policy inspections_participant_read on public.inspection_records for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy inspections_office_manage on public.inspection_records for all using (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage'))) with check (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage')));
create policy inspection_photos_scoped on public.inspection_photos for all using (exists(select 1 from public.inspection_records i join public.bookings b on b.id=i.booking_id where i.id=inspection_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin()))) with check (exists(select 1 from public.inspection_records i join public.bookings b on b.id=i.booking_id where i.id=inspection_id and public.can_manage_office(b.office_id)));
create policy charges_participant_read on public.booking_charges for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy charges_office_manage on public.booking_charges for all using (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage'))) with check (exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'bookings.manage')));

create policy payments_participant_read on public.payments for select using (customer_id=auth.uid() or (office_id is not null and public.has_office_permission(office_id,'finance.read')) or public.is_platform_admin());
create policy payments_verified_admin_update on public.payments for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy payments_server_insert on public.payments for insert with check (public.is_platform_admin() or (status='pending_verification' and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=payments.customer_id and b.office_id=payments.office_id and b.currency=payments.currency and payments.amount>0 and (customer_id=auth.uid() or public.can_manage_office(b.office_id)) )));
create policy deposits_participant_read on public.deposits for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy deposits_office_admin_insert on public.deposits for insert with check (status='held' and deduction_amount=0 and exists(select 1 from public.bookings b where b.id=booking_id and amount=b.deposit_amount and currency=b.currency and public.can_manage_office(b.office_id)));
create policy deposits_admin_update on public.deposits for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy deposits_admin_delete on public.deposits for delete using (public.is_platform_admin());
create policy refunds_participant_read on public.refunds for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy refunds_request_owner on public.refunds for insert with check (requested_by=auth.uid() and status='pending' and exists(select 1 from public.bookings b join public.payments p on p.id=refunds.payment_id and p.booking_id=b.id where b.id=refunds.booking_id and b.customer_id=auth.uid() and refunds.amount<=p.amount and refunds.currency=p.currency));
create policy refunds_admin_update on public.refunds for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy invoices_participant_read on public.invoices for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy agreements_participant_read on public.rental_agreements for select using (exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id) or public.is_platform_admin())));
create policy commissions_scoped_read on public.commissions for select using (public.has_office_permission(office_id,'finance.read') or public.is_platform_admin());
create policy commissions_admin_manage on public.commissions for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy payouts_scoped_read on public.payouts for select using (public.has_office_permission(office_id,'finance.read') or public.is_platform_admin());
create policy payouts_office_request on public.payouts for insert with check (public.can_manage_office(office_id));
create policy payouts_admin_update on public.payouts for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy expenses_office_read on public.office_expenses for select using (public.has_office_permission(office_id,'finance.read'));
create policy expenses_office_manage on public.office_expenses for all using (public.can_manage_office(office_id)) with check (public.can_manage_office(office_id));

create policy reviews_public_read on public.reviews for select using (status='published' or customer_id=auth.uid() or public.is_office_member(office_id) or public.is_platform_admin());
create policy reviews_customer_insert on public.reviews for insert with check (customer_id=auth.uid() and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid() and b.status='completed'));
create policy reviews_moderator_manage on public.reviews for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy favorites_self_manage on public.favorites for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy notifications_recipient_read on public.notifications for select using (recipient_id=auth.uid() or public.is_platform_admin() or (office_id is not null and public.is_office_member(office_id)));
create policy notifications_recipient_update on public.notifications for update using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
create policy notifications_admin_manage on public.notifications for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy tickets_participant_read on public.support_tickets for select using (requester_id=auth.uid() or assigned_to=auth.uid() or (office_id is not null and public.is_office_member(office_id)) or public.is_platform_admin());
create policy tickets_owner_insert on public.support_tickets for insert with check (requester_id=auth.uid());
create policy tickets_assignee_update on public.support_tickets for update using (assigned_to=auth.uid() or public.is_platform_admin()) with check (assigned_to=auth.uid() or public.is_platform_admin());
create policy messages_ticket_scope_read on public.support_messages for select using (exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=auth.uid() or t.assigned_to=auth.uid() or public.is_platform_admin())) and (not is_internal or public.is_platform_admin()));
create policy messages_ticket_scope_insert on public.support_messages for insert with check (author_id=auth.uid() and exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=auth.uid() or t.assigned_to=auth.uid() or public.is_platform_admin())));
create policy disputes_participant_read on public.disputes for select using (opened_by=auth.uid() or exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.is_office_member(b.office_id))) or public.is_platform_admin());
create policy disputes_customer_insert on public.disputes for insert with check (opened_by=auth.uid());
create policy disputes_admin_update on public.disputes for update using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy cms_public_published_read on public.cms_pages for select using (status='published' or public.is_platform_admin());
create policy cms_admin_manage on public.cms_pages for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy banners_active_public_read on public.banners for select using (is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) or public.is_platform_admin());
create policy banners_admin_manage on public.banners for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy settings_public_read on public.platform_settings for select using (is_public or public.is_platform_admin());
create policy settings_admin_manage on public.platform_settings for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy audit_admin_read on public.audit_logs for select using (public.is_platform_admin());
create policy audit_server_insert on public.audit_logs for insert with check (actor_id=auth.uid() or public.is_platform_admin());
create policy login_history_self_admin on public.login_history for select using (user_id=auth.uid() or public.is_platform_admin());
create policy login_history_server_insert on public.login_history for insert with check (user_id=auth.uid() or public.is_platform_admin());

grant usage on schema public to anon, authenticated;
grant select on public.cities,public.locations,public.vehicle_categories,public.subscription_plans,public.rental_offices,public.vehicles,public.vehicle_images,public.vehicle_availability,public.reviews,public.promotions,public.coupons,public.cms_pages,public.banners,public.platform_settings to anon,authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant execute on function public.calculate_booking_quote(uuid,timestamptz,timestamptz,boolean,boolean,boolean,text) to anon,authenticated;
grant execute on function public.search_available_vehicles(timestamptz,timestamptz,text,text,text,text,integer,numeric) to anon,authenticated;
grant execute on function public.list_my_offices() to authenticated;
grant execute on function public.request_booking(uuid,timestamptz,timestamptz,text,text,boolean,boolean,boolean,text,text) to authenticated;
grant execute on function public.record_pickup(uuid,integer,text,text) to authenticated;
grant execute on function public.record_return(uuid,integer,text,integer,jsonb) to authenticated;
grant execute on function public.cancel_booking(uuid,text) to authenticated;
grant execute on function public.decide_booking_request(uuid,boolean,text) to authenticated;
grant execute on function public.verify_manual_payment(uuid,boolean,text) to authenticated;
grant execute on function public.approve_refund(uuid,boolean,text) to authenticated;
grant execute on function public.release_security_deposit(uuid,numeric,text) to authenticated;

