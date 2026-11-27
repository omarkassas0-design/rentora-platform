-- Require platform review before any newly submitted rental vehicle is public.
alter table public.vehicles add column if not exists moderation_status text not null default 'approved' check (moderation_status in ('pending','approved','rejected'));
-- Existing published vehicles remain approved; existing drafts are not exposed.
update public.vehicles set moderation_status='approved' where is_published=true and moderation_status<>'approved';
create index if not exists vehicles_moderation_queue_idx on public.vehicles(moderation_status,created_at desc);
insert into public.permissions(id,description) values ('fleet.review','Review rental vehicle listing submissions') on conflict(id) do nothing;
insert into public.role_permissions(role,permission_id) values ('admin_staff','fleet.review') on conflict do nothing;
drop policy if exists vehicles_platform_review on public.vehicles;
create policy vehicles_platform_review on public.vehicles for update using (public.has_platform_permission('fleet.review')) with check (public.has_platform_permission('fleet.review'));
-- Public users only see approved and published inventory. Office members retain scoped access to their own fleet.
drop policy if exists vehicles_public_read on public.vehicles;
create policy vehicles_public_read on public.vehicles for select using ((is_published and status='available' and moderation_status='approved') or public.is_office_member(office_id) or public.is_platform_admin());
create or replace function public.enforce_rental_vehicle_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then
    new.moderation_status := 'pending';
    new.is_published := false;
    if new.status='available' then new.status := 'draft'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_rental_vehicle_review_trigger on public.vehicles;
create trigger enforce_rental_vehicle_review_trigger before insert or update on public.vehicles
for each row execute function public.enforce_rental_vehicle_review();
