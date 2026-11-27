-- Motara advertising is sold and published only by the platform owner/admin.
-- Offices must contact the platform owner on WhatsApp; they cannot submit, upload, or delete ads.
drop policy if exists advertisement_office_submit on public.advertisement_campaigns;
drop policy if exists advertisement_office_delete_pending on public.advertisement_campaigns;
drop policy if exists advertisement_images_office_upload on storage.objects;
drop policy if exists advertisement_images_owner_delete on storage.objects;

-- Only platform admins may delete campaign records or remove their images.
create policy advertisement_platform_delete on public.advertisement_campaigns
  for delete to authenticated using (public.is_platform_admin());
create policy advertisement_images_platform_delete on storage.objects
  for delete to authenticated using (bucket_id='advertisement-images' and public.is_platform_admin());

-- Uploads are restricted to platform admins.
create policy advertisement_images_platform_upload on storage.objects
  for insert to authenticated with check (bucket_id='advertisement-images' and public.is_platform_admin());
