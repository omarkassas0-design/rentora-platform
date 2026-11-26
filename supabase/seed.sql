-- Public development reference data. Private demo users are created by scripts/seed.ts.
insert into public.cities(id,slug,name,name_ar,governorate,country_code,timezone) values
 (md5('rentora-city-damascus')::uuid,'damascus','Damascus','دمشق','Damascus Governorate','SY','Asia/Damascus'),
 (md5('rentora-city-aleppo')::uuid,'aleppo','Aleppo','حلب','Aleppo Governorate','SY','Asia/Damascus'),
 (md5('rentora-city-latakia')::uuid,'latakia','Latakia','اللاذقية','Latakia Governorate','SY','Asia/Damascus'),
 (md5('rentora-city-homs')::uuid,'homs','Homs','حمص','Homs Governorate','SY','Asia/Damascus'),
 (md5('rentora-city-tartus')::uuid,'tartus','Tartus','طرطوس','Tartus Governorate','SY','Asia/Damascus'),
 (md5('rentora-city-hama')::uuid,'hama','Hama','حماة','Hama Governorate','SY','Asia/Damascus'),
 (md5('rentora-city-idlib')::uuid,'idlib','Idlib','إدلب','Idlib Governorate','SY','Asia/Damascus')
on conflict(slug) do update set name=excluded.name,name_ar=excluded.name_ar,governorate=excluded.governorate;
