-- Storage buckets. Documents and inspection photos remain private and use signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('vehicle-images','vehicle-images',true,12582912,array['image/jpeg','image/png','image/webp']),
 ('office-documents','office-documents',false,12582912,array['application/pdf','image/jpeg','image/png']),
 ('vehicle-documents','vehicle-documents',false,12582912,array['application/pdf','image/jpeg','image/png']),
 ('booking-inspections','booking-inspections',false,12582912,array['image/jpeg','image/png','image/webp']),
 ('customer-documents','customer-documents',false,12582912,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy vehicle_image_public_read on storage.objects for select using (bucket_id='vehicle-images');
create policy vehicle_image_office_upload on storage.objects for insert to authenticated with check (
  bucket_id='vehicle-images' and exists(select 1 from public.vehicles v where v.id::text=(storage.foldername(name))[1] and public.has_office_permission(v.office_id,'fleet.manage'))
);
create policy vehicle_image_office_update on storage.objects for update to authenticated using (
  bucket_id='vehicle-images' and exists(select 1 from public.vehicles v where v.id::text=(storage.foldername(name))[1] and public.has_office_permission(v.office_id,'fleet.manage'))
) with check (bucket_id='vehicle-images' and exists(select 1 from public.vehicles v where v.id::text=(storage.foldername(name))[1] and public.has_office_permission(v.office_id,'fleet.manage')));
create policy office_docs_scoped_read on storage.objects for select to authenticated using (
  bucket_id='office-documents' and public.can_manage_office(((storage.foldername(name))[1])::uuid)
);
create policy office_docs_scoped_insert on storage.objects for insert to authenticated with check (
  bucket_id='office-documents' and public.can_manage_office(((storage.foldername(name))[1])::uuid)
);
create policy vehicle_docs_scoped on storage.objects for all to authenticated using (
  bucket_id='vehicle-documents' and exists(select 1 from public.vehicles v where v.id::text=(storage.foldername(name))[1] and public.has_office_permission(v.office_id,'fleet.manage'))
) with check (bucket_id='vehicle-documents' and exists(select 1 from public.vehicles v where v.id::text=(storage.foldername(name))[1] and public.has_office_permission(v.office_id,'fleet.manage')));
create policy inspection_photos_scoped on storage.objects for all to authenticated using (
  bucket_id='booking-inspections' and exists(select 1 from public.bookings b where b.id::text=(storage.foldername(name))[1] and (public.is_office_member(b.office_id) or public.is_platform_admin()))
) with check (bucket_id='booking-inspections' and exists(select 1 from public.bookings b where b.id::text=(storage.foldername(name))[1] and public.has_office_permission(b.office_id,'bookings.manage')));
create policy customer_docs_owner_read on storage.objects for select to authenticated using (bucket_id='customer-documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy customer_docs_owner_insert on storage.objects for insert to authenticated with check (bucket_id='customer-documents' and (storage.foldername(name))[1]=auth.uid()::text);
