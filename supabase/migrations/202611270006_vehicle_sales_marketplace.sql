insert into public.permissions(id,description) values ('cars.manage','Review and manage vehicle sale listings') on conflict(id) do nothing;
insert into public.role_permissions(role,permission_id) values ('admin_staff','cars.manage') on conflict do nothing;

-- Separate peer-to-peer / dealer vehicle sales inventory. Rental inventory remains in public.vehicles.
create table if not exists public.vehicle_sale_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  make text not null check (length(trim(make)) between 1 and 80),
  model text not null check (length(trim(model)) between 1 and 100),
  year integer not null check (year between 1980 and extract(year from now())::integer + 1),
  price numeric(14,2) not null check (price > 0),
  currency text not null default 'USD' check (currency in ('USD','SYP')),
  mileage_km integer check (mileage_km is null or mileage_km >= 0),
  transmission text not null default 'Automatic' check (transmission in ('Automatic','Manual')),
  fuel text not null default 'Petrol' check (fuel in ('Petrol','Diesel','Hybrid','Electric')),
  city text not null,
  description text,
  contact_phone text,
  image_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','sold','archived')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vehicle_sale_listings_public_idx on public.vehicle_sale_listings(status, created_at desc) where status='approved';
create index if not exists vehicle_sale_listings_seller_idx on public.vehicle_sale_listings(seller_id, created_at desc);
alter table public.vehicle_sale_listings enable row level security;
drop policy if exists vehicle_sales_public_read on public.vehicle_sale_listings;
create policy vehicle_sales_public_read on public.vehicle_sale_listings for select using (status='approved' or seller_id=auth.uid() or public.has_platform_permission('cars.manage'));
drop policy if exists vehicle_sales_seller_insert on public.vehicle_sale_listings;
create policy vehicle_sales_seller_insert on public.vehicle_sale_listings for insert with check (seller_id=auth.uid() and status='pending');
drop policy if exists vehicle_sales_seller_update on public.vehicle_sale_listings;
create policy vehicle_sales_seller_update on public.vehicle_sale_listings for update using (seller_id=auth.uid() and status in ('pending','rejected')) with check (seller_id=auth.uid() and status in ('pending','rejected'));
drop policy if exists vehicle_sales_admin_update on public.vehicle_sale_listings;
create policy vehicle_sales_admin_update on public.vehicle_sale_listings for update using (public.has_platform_permission('cars.manage')) with check (public.has_platform_permission('cars.manage'));
drop policy if exists vehicle_sales_seller_delete on public.vehicle_sale_listings;
create policy vehicle_sales_seller_delete on public.vehicle_sale_listings for delete using ((seller_id=auth.uid() and status in ('pending','rejected')) or public.has_platform_permission('cars.manage'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('vehicle-sale-images','vehicle-sale-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists vehicle_sale_images_public_read on storage.objects;
create policy vehicle_sale_images_public_read on storage.objects for select using (bucket_id='vehicle-sale-images');
drop policy if exists vehicle_sale_images_owner_upload on storage.objects;
create policy vehicle_sale_images_owner_upload on storage.objects for insert to authenticated with check (bucket_id='vehicle-sale-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists vehicle_sale_images_owner_delete on storage.objects;
create policy vehicle_sale_images_owner_delete on storage.objects for delete to authenticated using (bucket_id='vehicle-sale-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.has_platform_permission('cars.manage')));
