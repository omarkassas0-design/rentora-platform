-- Add bilingual ad headlines while preserving existing campaign headlines.
alter table public.advertisement_campaigns
  add column if not exists headline_en text,
  add column if not exists headline_ar text;

update public.advertisement_campaigns
set headline_en = coalesce(headline_en, headline),
    headline_ar = coalesce(headline_ar, headline)
where headline_en is null or headline_ar is null;

alter table public.advertisement_campaigns
  alter column headline_en set not null,
  alter column headline_ar set not null;
