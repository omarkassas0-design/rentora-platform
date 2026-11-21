-- Rentora initial schema. Run in Supabase SQL Editor or with Supabase CLI.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.app_role as enum ('customer','office_admin','office_staff','super_admin');
create type public.booking_status as enum ('pending','confirmed','rejected','cancelled','completed');
create type public.car_status as enum ('available','maintenance','inactive');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'customer',
  preferred_language text not null default 'ar' check (preferred_language in ('ar','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  city text not null,
  address text,
  phone text,
  whatsapp text,
  logo_url text,
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.office_members (
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'staff' check (member_role in ('manager','staff')),
  created_at timestamptz not null default now(),
  primary key (office_id,user_id)
);

create table public.cars (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  title text not null,
  brand text not null,
  model text not null,
  year integer not null check (year between 1980 and 2100),
  city text not null,
  daily_price numeric(12,2) not null check (daily_price > 0),
  currency text not null default 'USD' check (currency in ('USD','SYP','TRY','EUR')),
  transmission text not null default 'أوتوماتيك',
  fuel text not null default 'بنزين',
  seats smallint not null default 5 check (seats between 1 and 20),
  image_url text,
  description text,
  plate_number text,
  status public.car_status not null default 'available',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.car_images (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete restrict,
  office_id uuid not null references public.offices(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  total_days integer not null check (total_days > 0),
  daily_price_snapshot numeric(12,2) not null check (daily_price_snapshot > 0),
  total_price numeric(14,2) not null check (total_price > 0),
  currency text not null,
  status public.booking_status not null default 'pending',
  customer_note text,
  office_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  constraint bookings_no_overlapping_active_car_reservations
    exclude using gist (car_id with =, tstzrange(start_at,end_at,'[)') with &&)
    where (status in ('pending','confirmed'))
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  method text not null check (method in ('cash','bank_transfer','manual')),
  status text not null default 'recorded' check (status in ('pending','recorded','refunded','failed')),
  reference text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  office_id uuid references public.offices(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cars_public_search_idx on public.cars(city,is_published,status,daily_price);
create index cars_office_idx on public.cars(office_id,created_at desc);
create index bookings_customer_idx on public.bookings(customer_id,created_at desc);
create index bookings_office_idx on public.bookings(office_id,status,start_at);
create index bookings_car_period_idx on public.bookings(car_id,start_at,end_at);
create index payments_booking_idx on public.payments(booking_id,created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger offices_updated_at before update on public.offices for each row execute function public.set_updated_at();
create trigger cars_updated_at before update on public.cars for each row execute function public.set_updated_at();
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict(id) do nothing;
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_office_member(target_office uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.offices o where o.id=target_office and o.owner_id=auth.uid())
 or exists(select 1 from public.office_members m where m.office_id=target_office and m.user_id=auth.uid());
$$;

-- Booking is created atomically. The exclusion constraint is the final guard against race conditions.
create or replace function public.create_booking(p_car_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_customer_note text default null)
returns public.bookings language plpgsql security definer set search_path=public as $$
declare v_car public.cars%rowtype; v_days integer; v_booking public.bookings%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then raise exception 'INVALID_DATES'; end if;
 if p_start_at < now() - interval '2 minutes' then raise exception 'START_DATE_IN_PAST'; end if;
 select * into v_car from public.cars where id=p_car_id and is_published=true and status='available' for share;
 if not found then raise exception 'CAR_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.offices where id=v_car.office_id and active=true) then raise exception 'OFFICE_NOT_ACTIVE'; end if;
 v_days := greatest(1,ceil(extract(epoch from (p_end_at-p_start_at))/86400.0)::integer);
 insert into public.bookings(car_id,office_id,customer_id,start_at,end_at,total_days,daily_price_snapshot,total_price,currency,customer_note)
 values(v_car.id,v_car.office_id,auth.uid(),p_start_at,p_end_at,v_days,v_car.daily_price,v_car.daily_price*v_days,v_car.currency,left(coalesce(p_customer_note,''),1000))
 returning * into v_booking;
 return v_booking;
exception when exclusion_violation then raise exception 'CAR_ALREADY_BOOKED';
end; $$;

alter table public.profiles enable row level security;
alter table public.offices enable row level security;
alter table public.office_members enable row level security;
alter table public.cars enable row level security;
alter table public.car_images enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read self" on public.profiles for select to authenticated using(id=auth.uid());
create policy "profiles update self safe fields" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role='customer');
create policy "public read active offices" on public.offices for select to anon,authenticated using(active=true);
create policy "office owners update office" on public.offices for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "office owner create office" on public.offices for insert to authenticated with check(owner_id=auth.uid());
create policy "members read own memberships" on public.office_members for select to authenticated using(user_id=auth.uid() or public.is_office_member(office_id));
create policy "public read published cars" on public.cars for select to anon,authenticated using(is_published=true and status='available');
create policy "office members read all own cars" on public.cars for select to authenticated using(public.is_office_member(office_id));
create policy "office managers insert cars" on public.cars for insert to authenticated with check(public.is_office_member(office_id));
create policy "office managers update cars" on public.cars for update to authenticated using(public.is_office_member(office_id)) with check(public.is_office_member(office_id));
create policy "office managers delete cars" on public.cars for delete to authenticated using(public.is_office_member(office_id));
create policy "public read car images for published cars" on public.car_images for select to anon,authenticated using(exists(select 1 from public.cars c where c.id=car_id and c.is_published=true));
create policy "office members manage car images" on public.car_images for all to authenticated using(exists(select 1 from public.cars c where c.id=car_id and public.is_office_member(c.office_id))) with check(exists(select 1 from public.cars c where c.id=car_id and public.is_office_member(c.office_id)));
create policy "customers read own bookings" on public.bookings for select to authenticated using(customer_id=auth.uid());
create policy "office reads bookings" on public.bookings for select to authenticated using(public.is_office_member(office_id));
create policy "office updates bookings" on public.bookings for update to authenticated using(public.is_office_member(office_id)) with check(public.is_office_member(office_id));
create policy "customer reads own payments" on public.payments for select to authenticated using(exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid()));
create policy "office reads and records payments" on public.payments for all to authenticated using(exists(select 1 from public.bookings b where b.id=booking_id and public.is_office_member(b.office_id))) with check(exists(select 1 from public.bookings b where b.id=booking_id and public.is_office_member(b.office_id)));
create policy "public read reviews" on public.reviews for select to anon,authenticated using(true);
create policy "customer create review for own booking" on public.reviews for insert to authenticated with check(customer_id=auth.uid() and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid() and b.status='completed'));
create policy "office read audit logs" on public.audit_logs for select to authenticated using(office_id is not null and public.is_office_member(office_id));

-- Do not grant client users direct role escalation. Super-admin provisioning is a trusted server/database-operator task.
grant usage on schema public to anon,authenticated;
grant select on public.offices,public.cars,public.car_images,public.reviews to anon,authenticated;
grant select,update on public.profiles to authenticated;
grant insert,update,delete,select on public.cars to authenticated;
grant insert,select on public.offices to authenticated;
grant select on public.office_members to authenticated;
grant select,update on public.bookings to authenticated;
grant select,insert on public.reviews to authenticated;
grant select,insert,update on public.payments to authenticated;
grant select on public.audit_logs to authenticated;
grant execute on function public.create_booking(uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.is_office_member(uuid) to authenticated;


-- Public car image bucket. Upload object names as: <office_uuid>/<car_uuid>/<filename>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('car-images','car-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "public read car images bucket" on storage.objects for select to anon,authenticated using(bucket_id='car-images');
create policy "office members upload car images" on storage.objects for insert to authenticated with check(
 bucket_id='car-images' and array_length(storage.foldername(name),1)>=2
 and public.is_office_member((storage.foldername(name))[1]::uuid)
 and exists(select 1 from public.cars c where c.id=((storage.foldername(name))[2])::uuid and c.office_id=((storage.foldername(name))[1])::uuid)
);
create policy "office members update car images" on storage.objects for update to authenticated using(
 bucket_id='car-images' and public.is_office_member((storage.foldername(name))[1]::uuid)
) with check(bucket_id='car-images' and public.is_office_member((storage.foldername(name))[1]::uuid));
create policy "office members delete car images" on storage.objects for delete to authenticated using(
 bucket_id='car-images' and public.is_office_member((storage.foldername(name))[1]::uuid)
);

-- Office owners must be able to read their own office even while it is inactive.
create policy "office owners read own office" on public.offices for select to authenticated using(owner_id=auth.uid());

-- Office users may only change booking status and office note, never the customer, dates or price snapshot.
create or replace function public.guard_office_booking_update() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if old.car_id is distinct from new.car_id
 or old.office_id is distinct from new.office_id
 or old.customer_id is distinct from new.customer_id
 or old.start_at is distinct from new.start_at
 or old.end_at is distinct from new.end_at
 or old.total_days is distinct from new.total_days
 or old.daily_price_snapshot is distinct from new.daily_price_snapshot
 or old.total_price is distinct from new.total_price
 or old.currency is distinct from new.currency
 or old.customer_note is distinct from new.customer_note
 then raise exception 'BOOKING_FIELDS_LOCKED'; end if;
 if old.status is distinct from new.status and not (
   (old.status='pending' and new.status in ('confirmed','rejected','cancelled')) or
   (old.status='confirmed' and new.status in ('completed','cancelled'))
 ) then raise exception 'INVALID_BOOKING_STATUS_TRANSITION'; end if;
 if length(coalesce(new.office_note,''))>2000 then raise exception 'OFFICE_NOTE_TOO_LONG'; end if;
 return new;
end; $$;
create trigger guard_office_booking_update before update on public.bookings for each row execute function public.guard_office_booking_update();


-- Prevent self-verification of newly registered rental offices.
revoke insert on public.offices from authenticated;
grant insert (owner_id,name,slug,description,city,address,phone,whatsapp,logo_url) on public.offices to authenticated;

-- A car can only be published by a member of an already verified office.
drop policy if exists "office managers insert cars" on public.cars;
drop policy if exists "office managers update cars" on public.cars;
create policy "verified office members insert cars" on public.cars for insert to authenticated with check(
 public.is_office_member(office_id) and exists(select 1 from public.offices o where o.id=office_id and o.verified=true and o.active=true)
);
create policy "verified office members update cars" on public.cars for update to authenticated using(public.is_office_member(office_id)) with check(
 public.is_office_member(office_id) and exists(select 1 from public.offices o where o.id=office_id and o.verified=true and o.active=true)
);

-- A customer can still see the vehicle attached to their own booking if its listing is later unpublished.
create policy "customers read cars from own bookings" on public.cars for select to authenticated using(
 exists(select 1 from public.bookings b where b.car_id=cars.id and b.customer_id=auth.uid())
);
grant update (name,description,city,address,phone,whatsapp,logo_url) on public.offices to authenticated;
