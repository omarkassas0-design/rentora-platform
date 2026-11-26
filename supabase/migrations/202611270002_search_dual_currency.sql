-- Extend public vehicle search with office-entered SYP prices.
-- Prices are stored independently; no exchange-rate conversion is performed.
drop function if exists public.search_available_vehicles(timestamptz,timestamptz,text,text,text,text,integer,numeric);

create function public.search_available_vehicles(
  p_pickup_at timestamptz default null,
  p_return_at timestamptz default null,
  p_city text default null,
  p_category text default null,
  p_transmission text default null,
  p_fuel text default null,
  p_seats integer default null,
  p_max_price numeric default null
) returns table(
  id uuid, slug text, office_id uuid, office_slug text, office_name text, city text,
  category text, category_slug text, make text, model text, model_year integer,
  transmission text, fuel_type text, seating_capacity integer,
  daily_rate numeric, weekly_rate numeric, monthly_rate numeric, deposit_amount numeric,
  currency char(3), daily_rate_syp numeric, weekly_rate_syp numeric,
  monthly_rate_syp numeric, deposit_amount_syp numeric,
  mileage_limit_daily integer, extra_mileage_rate numeric, color text,
  primary_image_path text, average_rating numeric, review_count integer
) language plpgsql stable security definer set search_path=public as $$
begin
  if (p_pickup_at is null) <> (p_return_at is null) then raise exception 'Both rental dates are required'; end if;
  if p_pickup_at is not null and p_return_at <= p_pickup_at then raise exception 'Return must be after pickup'; end if;
  return query
  select v.id, v.slug, o.id, o.slug, o.name, c.name,
    coalesce(cat.name,'Other'), cat.slug, v.make, v.model, v.model_year,
    v.transmission, v.fuel_type, v.seating_capacity,
    v.daily_rate, v.weekly_rate, v.monthly_rate, v.deposit_amount, v.currency,
    v.daily_rate_syp, v.weekly_rate_syp, v.monthly_rate_syp, v.deposit_amount_syp,
    v.mileage_limit_daily, v.extra_mileage_rate, v.color,
    (select vi.storage_path from public.vehicle_images vi where vi.vehicle_id=v.id order by vi.is_primary desc, vi.sort_order asc limit 1),
    coalesce((select round(avg(r.rating),2) from public.reviews r where r.vehicle_id=v.id and r.status='published'),0),
    (select count(*)::integer from public.reviews r where r.vehicle_id=v.id and r.status='published')
  from public.vehicles v
  join public.rental_offices o on o.id=v.office_id
  left join public.cities c on c.id=o.city_id
  left join public.vehicle_categories cat on cat.id=v.category_id
  where v.status='available' and v.is_published and o.status='approved'
    and (cat.is_active is distinct from false)
    and (p_city is null or lower(c.name)=lower(p_city) or c.slug=lower(p_city))
    and (p_category is null or cat.slug=lower(p_category))
    and (p_transmission is null or v.transmission=lower(p_transmission))
    and (p_fuel is null or v.fuel_type=lower(p_fuel))
    and (p_seats is null or v.seating_capacity>=p_seats)
    and (p_max_price is null or v.daily_rate<=p_max_price)
    and (p_pickup_at is null or not exists(
      select 1 from public.bookings b where b.vehicle_id=v.id
      and b.status in ('pending','confirmed','active')
      and b.pickup_at<p_return_at and b.return_at>p_pickup_at))
    and (p_pickup_at is null or not exists(
      select 1 from public.vehicle_availability a where a.vehicle_id=v.id
      and not a.is_available and a.starts_at<p_return_at and a.ends_at>p_pickup_at))
  order by v.daily_rate asc, v.created_at desc limit 200;
end $$;

grant execute on function public.search_available_vehicles(timestamptz,timestamptz,text,text,text,text,integer,numeric) to anon, authenticated;
