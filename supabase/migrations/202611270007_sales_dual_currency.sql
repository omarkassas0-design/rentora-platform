-- Allow car-sale listings to store and display both USD and SYP prices.
alter table public.vehicle_sale_listings
  add column if not exists price_usd numeric(14,2),
  add column if not exists price_syp numeric(18,0);

-- Backfill existing single-currency listings without changing their legacy fields.
update public.vehicle_sale_listings
set price_usd = case when currency = 'USD' then price else price_usd end,
    price_syp = case when currency = 'SYP' then price else price_syp end
where price_usd is null and price_syp is null;

alter table public.vehicle_sale_listings
  drop constraint if exists vehicle_sale_listings_dual_price_check;
alter table public.vehicle_sale_listings
  add constraint vehicle_sale_listings_dual_price_check
  check ((price_usd is null or price_usd > 0) and (price_syp is null or price_syp > 0)
    and (price_usd is not null or price_syp is not null));
