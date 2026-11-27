-- Ensure signed-in office owners have the SQL privilege required to submit
-- an office application. Row-level security remains the authority that
-- restricts which office records they may create.
grant insert on table public.rental_offices to authenticated;
grant select on table public.rental_offices to authenticated;

-- Recreate the owner policy consistently with the configurable platform
-- commission default used by the BEFORE INSERT trigger.
drop policy if exists offices_owner_insert on public.rental_offices;
create policy offices_owner_insert on public.rental_offices
for insert to authenticated
with check (
  public.has_platform_permission('offices.manage')
  or (
    owner_id = auth.uid()
    and status in ('draft', 'pending')
    and verified_at is null
    and commission_rate = public.platform_commission_default()
  )
);
