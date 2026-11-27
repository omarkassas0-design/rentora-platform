-- Image-based marketplace advertising submitted by rental offices and approved by platform staff.
create table if not exists public.advertisement_campaigns (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.rental_offices(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  headline text not null check (char_length(headline) between 3 and 100),
  image_path text not null,
  target_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paused')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '30 days'),
  rejection_note text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists advertisement_campaigns_public_idx on public.advertisement_campaigns(status, starts_at, ends_at, created_at desc);
create index if not exists advertisement_campaigns_office_idx on public.advertisement_campaigns(office_id, created_at desc);
alter table public.advertisement_campaigns enable row level security;
create policy advertisement_public_approved_read on public.advertisement_campaigns for select using (status='approved' and starts_at<=now() and ends_at>now());
create policy advertisement_office_read on public.advertisement_campaigns for select to authenticated using (public.has_office_permission(office_id,'promotions.manage'));
create policy advertisement_office_submit on public.advertisement_campaigns for insert to authenticated with check (public.has_office_permission(office_id,'promotions.manage') and created_by=auth.uid() and status='pending');
create policy advertisement_office_delete_pending on public.advertisement_campaigns for delete to authenticated using (public.has_office_permission(office_id,'promotions.manage') and status in ('pending','rejected','paused'));
create policy advertisement_platform_manage on public.advertisement_campaigns for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('advertisement-images','advertisement-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy advertisement_images_public_read on storage.objects for select using(bucket_id='advertisement-images');
create policy advertisement_images_office_upload on storage.objects for insert to authenticated with check (
  bucket_id='advertisement-images' and exists (
    select 1 from public.rental_offices o where o.id::text=(storage.foldername(name))[1]
      and public.has_office_permission(o.id,'promotions.manage')
  )
);
create policy advertisement_images_owner_delete on storage.objects for delete to authenticated using (
  bucket_id='advertisement-images' and (
    public.is_platform_admin() or exists (
      select 1 from public.rental_offices o where o.id::text=(storage.foldername(name))[1]
        and public.has_office_permission(o.id,'promotions.manage')
    )
  )
);
