-- Motara: fixed Syrian governorate catalogue (14 governorates).
-- This project uses the legacy `cities` table as the selectable top-level location list.
-- Smaller cities/towns belong in a separate future locations table, never as user-created governorates.

update public.cities set is_active = false;

insert into public.cities (slug, name, name_ar, governorate, country_code, timezone, is_active)
values
  ('damascus', 'Damascus', 'دمشق', 'Damascus', 'SY', 'Asia/Damascus', true),
  ('rif-dimashq', 'Rif Dimashq', 'ريف دمشق', 'Rif Dimashq', 'SY', 'Asia/Damascus', true),
  ('aleppo', 'Aleppo', 'حلب', 'Aleppo', 'SY', 'Asia/Damascus', true),
  ('homs', 'Homs', 'حمص', 'Homs', 'SY', 'Asia/Damascus', true),
  ('hama', 'Hama', 'حماة', 'Hama', 'SY', 'Asia/Damascus', true),
  ('latakia', 'Latakia', 'اللاذقية', 'Latakia', 'SY', 'Asia/Damascus', true),
  ('tartus', 'Tartus', 'طرطوس', 'Tartus', 'SY', 'Asia/Damascus', true),
  ('idlib', 'Idlib', 'إدلب', 'Idlib', 'SY', 'Asia/Damascus', true),
  ('daraa', 'Daraa', 'درعا', 'Daraa', 'SY', 'Asia/Damascus', true),
  ('as-suweida', 'As-Suwayda', 'السويداء', 'As-Suwayda', 'SY', 'Asia/Damascus', true),
  ('quneitra', 'Quneitra', 'القنيطرة', 'Quneitra', 'SY', 'Asia/Damascus', true),
  ('raqqa', 'Raqqa', 'الرقة', 'Raqqa', 'SY', 'Asia/Damascus', true),
  ('deir-ez-zor', 'Deir ez-Zor', 'دير الزور', 'Deir ez-Zor', 'SY', 'Asia/Damascus', true),
  ('al-hasakah', 'Al-Hasakah', 'الحسكة', 'Al-Hasakah', 'SY', 'Asia/Damascus', true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  governorate = excluded.governorate,
  country_code = 'SY',
  timezone = 'Asia/Damascus',
  is_active = true;

-- Nobody may create or delete catalogue rows. Existing IDs are retained for FK integrity.
-- Only platform admins may edit display fields or activate/deactivate a governorate.
create or replace function public.guard_governorate_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'The Syrian governorate catalogue is fixed; rows cannot be added.';
  elsif tg_op = 'DELETE' then
    raise exception 'The Syrian governorate catalogue is fixed; rows cannot be deleted.';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator may edit governorate details.';
  end if;

  if new.id <> old.id
     or new.slug <> old.slug
     or new.country_code <> old.country_code then
    raise exception 'Governorate identity fields are immutable.';
  end if;

  return new;
end;
$$;

drop trigger if exists cities_fixed_catalog_guard on public.cities;
create trigger cities_fixed_catalog_guard
before insert or update or delete on public.cities
for each row execute function public.guard_governorate_catalog();

revoke insert, delete on public.cities from anon, authenticated;
grant select on public.cities to anon, authenticated;
grant update(name, name_ar, governorate, is_active) on public.cities to authenticated;
