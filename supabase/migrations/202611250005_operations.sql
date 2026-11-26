-- Management modules: CMS, operational support, subscriptions, invitations, and audited settings.

insert into public.permissions(id,description) values
  ('support.manage','Manage office support tickets and booking disputes'),
  ('reviews.manage','Moderate reviews for this office'),
  ('cms.manage','Manage public website content'),
  ('subscriptions.manage','Manage rental office subscriptions'),
  ('settings.manage','Manage platform settings'),
  ('notifications.manage','Manage platform notifications'),
  ('customers.manage','Manage platform customer directory'),
  ('offices.manage','Manage rental office onboarding')
on conflict(id) do nothing;

create or replace function public.has_platform_permission(required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role='super_admin')
    or exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role=ur.role
      where ur.user_id=auth.uid() and ur.role='admin_staff' and ur.scope_office_id is null
        and rp.permission_id in (required_permission,'platform.manage'))
$$;

create or replace function public.has_office_permission(target_office uuid,required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() or public.has_platform_permission(required_permission)
    or exists(select 1 from public.rental_offices where id=target_office and owner_id=auth.uid())
    or exists(select 1 from public.office_members m where m.office_id=target_office and m.user_id=auth.uid() and m.status='active'
      and (m.role in ('office_owner','office_manager') or (m.role='office_staff' and coalesce((m.permissions->>required_permission)::boolean,false))))
$$;

create table if not exists public.cms_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check(length(trim(question)) between 3 and 500),
  answer text not null check(length(trim(answer)) between 3 and 5000),
  question_ar text,
  answer_ar text,
  category text not null default 'general' check(length(trim(category)) between 1 and 80),
  sort_order integer not null default 0,
  status text not null default 'draft' check(status in ('draft','published')),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.featured_content (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 2 and 160),
  description text,
  image_path text,
  target_url text,
  placement text not null default 'home' check(placement in ('home','cars','offices')),
  content_type text not null default 'editorial' check(content_type in ('editorial','vehicle','office','promotion','page')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at is null or starts_at is null or ends_at>starts_at)
);

create table if not exists public.office_invitations (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.rental_offices(id) on delete cascade,
  email citext not null,
  role public.app_role not null check(role in ('office_manager','office_staff')),
  permissions jsonb not null default '{}',
  token_hash text unique not null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'invited' check(status in ('invited','accepted','revoked','expired')),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.platform_invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  token_hash text unique not null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'invited' check(status in ('invited','accepted','revoked','expired')),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.rental_offices(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  billing_period text not null check(billing_period in ('monthly','annual')),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.banners add column if not exists updated_at timestamptz not null default now();
alter table public.cms_pages add constraint cms_pages_slug_format check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=80);
alter table public.cms_pages add constraint cms_pages_content_length check(length(trim(title)) between 2 and 160 and length(body)<=50000 and coalesce(length(body_ar),0)<=50000);
alter table public.banners add constraint banners_image_https check(image_path is null or image_path ~* '^https://');
alter table public.banners add constraint banners_target_safe check(target_url is null or (target_url like '/%' and left(target_url,2)<>'//') or target_url ~* '^https://');
alter table public.banners add constraint banners_title_length check(length(trim(title)) between 2 and 160);
alter table public.featured_content add constraint featured_image_https check(image_path is null or image_path ~* '^https://');
alter table public.featured_content add constraint featured_target_safe check(target_url is null or (target_url like '/%' and left(target_url,2)<>'//') or target_url ~* '^https://');
alter table public.subscription_plans add constraint subscription_plan_code_format check(code ~ '^[a-z0-9_-]{2,60}$');
alter table public.subscription_plans add constraint subscription_plan_limits_valid check((vehicle_limit is null or vehicle_limit>0) and (staff_limit is null or staff_limit>0) and trial_days between 0 and 365);
insert into public.cms_pages(slug,title,title_ar,body,body_ar,status,published_at) values
  ('about','A better way to get there','طريقة أفضل للوصول','Rentora connects travelers with verified independent rental offices. Compare available cars, request a booking, and coordinate payment directly with the rental office.','تربط رنتورا المسافرين بمكاتب تأجير مستقلة وموثوقة. قارن السيارات المتاحة وأرسل طلب الحجز ونسق الدفع مباشرة مع مكتب التأجير.','published',now()),
  ('contact','We are here to help','نحن هنا للمساعدة','For help with a booking or account, sign in and open a support ticket. For vehicle pickup, rental terms, or payment instructions, contact the rental office shown on your booking.','للمساعدة في الحجز أو الحساب، سجل الدخول وافتح تذكرة دعم. لاستفسارات الاستلام أو شروط الإيجار أو تعليمات الدفع، تواصل مع مكتب التأجير الظاهر في حجزك.','published',now()),
  ('terms','Terms and conditions','الشروط والأحكام','A booking request is confirmed only after the rental office accepts it. Payment is arranged manually with the office by cash or bank transfer according to its instructions. Rentora does not process online payments. Security deposits, deductions, refunds, cancellations, and rental charges are recorded in the booking history.','لا يصبح طلب الحجز مؤكداً إلا بعد موافقة مكتب التأجير. يتم ترتيب الدفع يدوياً مع المكتب نقداً أو عبر تحويل مصرفي وفق تعليماته. لا تعالج رنتورا المدفوعات عبر الإنترنت. تُسجل التأمينات والخصومات والمبالغ المستردة والإلغاءات ورسوم الإيجار في سجل الحجز.','published',now()),
  ('privacy','Privacy policy','سياسة الخصوصية','Rentora stores the account, booking, support, and manually recorded payment information needed to operate the marketplace. Payment proof is retained with its booking record and can be reviewed by authorized staff. Access is limited by account role and rental office.','تحتفظ رنتورا بمعلومات الحساب والحجوزات والدعم والمدفوعات المسجلة يدوياً اللازمة لتشغيل المنصة. يُحفظ إثبات الدفع مع سجل الحجز ويمكن للموظفين المخولين مراجعته. يُقيد الوصول بحسب دور الحساب ومكتب التأجير.','published',now())
on conflict(slug) do nothing;
insert into public.cms_faqs(question,answer,question_ar,answer_ar,category,sort_order,status) values
  ('When is my booking confirmed?','Your request becomes a confirmed booking after the rental office reviews and accepts it. You will see its latest status in your account.','متى يتم تأكيد حجزي؟','يصبح طلبك حجزاً مؤكداً بعد مراجعته وموافقة مكتب التأجير. يمكنك متابعة أحدث حالة في حسابك.','bookings',10,'published'),
  ('How can I pay for a booking?','Payments are made manually to the rental office by cash or bank transfer. Follow the instructions shown in your booking and upload a receipt or transfer screenshot when requested.','كيف أدفع قيمة الحجز؟','يتم الدفع يدوياً لمكتب التأجير نقداً أو عبر تحويل مصرفي. اتبع التعليمات الظاهرة في حجزك وارفع الإيصال أو صورة التحويل عند الطلب.','payments',20,'published'),
  ('Does Rentora accept online payments?','No. Rentora does not process online card or wallet payments. Authorized office staff record and verify cash and bank-transfer payments.','هل تقبل رنتورا الدفع عبر الإنترنت؟','لا. لا تعالج رنتورا مدفوعات البطاقات أو المحافظ عبر الإنترنت. يسجل موظفو المكتب المخولون مدفوعات النقد والتحويل المصرفي ويتحققون منها.','payments',30,'published'),
  ('How does the security deposit work?','The deposit amount is shown before you request a booking. The rental office records deposit collection, any deductions, and the manual refund in your booking history.','كيف يعمل التأمين؟','يظهر مبلغ التأمين قبل إرسال طلب الحجز. يسجل مكتب التأجير استلام التأمين وأي خصومات والمبلغ المسترد يدوياً في سجل الحجز.','payments',40,'published'),
  ('How do I report a problem?','Open your booking in your account and submit a support ticket or booking dispute. Replies and status updates appear in the support history.','كيف أبلغ عن مشكلة؟','افتح حجزك في حسابك وأرسل تذكرة دعم أو نزاعاً على الحجز. تظهر الردود وتحديثات الحالة في سجل الدعم.','support',50,'published')
on conflict do nothing;
insert into public.banners(title,title_ar,target_url,placement,sort_order,is_active)
select 'Discover verified local rentals','اكتشف خيارات تأجير محلية موثوقة','/cars','home',0,true
where not exists(select 1 from public.banners where placement='home' and title='Discover verified local rentals');
create unique index if not exists office_invites_one_open_per_email
  on public.office_invitations(office_id,email) where status='invited';
create unique index if not exists platform_invites_one_open_per_email
  on public.platform_invitations(email) where status='invited';
create unique index if not exists subscription_one_pending_change_per_office
  on public.subscription_change_requests(office_id) where status='pending';
create index if not exists subscriptions_office_period_idx on public.subscriptions(office_id,current_period_end desc);
create index if not exists cms_faqs_published_sort_idx on public.cms_faqs(status,sort_order,created_at);
create index if not exists featured_content_placement_idx on public.featured_content(placement,is_active,sort_order);

alter table public.cms_faqs enable row level security;
alter table public.featured_content enable row level security;
alter table public.office_invitations enable row level security;
alter table public.platform_invitations enable row level security;
alter table public.subscription_change_requests enable row level security;

drop policy if exists messages_ticket_scope_read on public.support_messages;
create policy messages_ticket_scope_read on public.support_messages for select using (
  exists(select 1 from public.support_tickets t where t.id=ticket_id and
    (t.requester_id=auth.uid() or t.assigned_to=auth.uid() or (t.office_id is not null and public.is_office_member(t.office_id)) or public.is_platform_admin()))
  and (not is_internal or public.is_platform_admin() or exists(select 1 from public.support_tickets t where t.id=ticket_id and t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')))
);
drop policy if exists messages_ticket_scope_insert on public.support_messages;
create policy messages_ticket_scope_insert on public.support_messages for insert with check (
  author_id=auth.uid() and exists(select 1 from public.support_tickets t where t.id=ticket_id and
    (t.requester_id=auth.uid() or t.assigned_to=auth.uid() or (t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')) or public.is_platform_admin()))
  and (not is_internal or public.is_platform_admin() or exists(select 1 from public.support_tickets t where t.id=ticket_id and t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')))
);
drop policy if exists tickets_assignee_update on public.support_tickets;
create policy tickets_assignee_update on public.support_tickets for update using (
  assigned_to=auth.uid() or public.is_platform_admin() or (office_id is not null and public.has_office_permission(office_id,'support.manage'))
) with check (assigned_to=auth.uid() or public.is_platform_admin() or (office_id is not null and public.has_office_permission(office_id,'support.manage')));
drop policy if exists disputes_admin_update on public.disputes;
create policy disputes_moderator_update on public.disputes for update using (
  public.is_platform_admin() or exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'support.manage'))
) with check (
  public.is_platform_admin() or exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'support.manage'))
);
create policy reviews_office_moderate on public.reviews for update using (public.has_office_permission(office_id,'reviews.manage')) with check (public.has_office_permission(office_id,'reviews.manage'));

drop policy if exists cms_faqs_public_read on public.cms_faqs;
create policy cms_faqs_public_read on public.cms_faqs for select using (status='published' or public.has_platform_permission('cms.manage'));
create policy cms_faqs_admin_manage on public.cms_faqs for all using (public.has_platform_permission('cms.manage')) with check (public.has_platform_permission('cms.manage'));
create policy featured_content_public_read on public.featured_content for select using (
  is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) or public.has_platform_permission('cms.manage')
);
create policy featured_content_admin_manage on public.featured_content for all using (public.has_platform_permission('cms.manage')) with check (public.has_platform_permission('cms.manage'));
create policy office_invitations_manager_read on public.office_invitations for select using (public.has_office_permission(office_id,'staff.manage'));
create policy platform_invitations_admin_read on public.platform_invitations for select using (public.has_platform_permission('platform.manage'));

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role='super_admin' and scope_office_id is null)
$$;
drop policy if exists user_roles_admin_manage on public.user_roles;
create policy user_roles_platform_staff_insert on public.user_roles for insert with check (
  (role='admin_staff' and scope_office_id is null and public.has_platform_permission('platform.manage'))
  or (role='super_admin' and scope_office_id is null and public.is_super_admin())
  or (role not in ('admin_staff','super_admin') and public.is_super_admin())
);
create policy user_roles_platform_staff_delete on public.user_roles for delete using (
  (role='admin_staff' and scope_office_id is null and public.has_platform_permission('platform.manage'))
  or (role='super_admin' and scope_office_id is null and public.is_super_admin())
  or (role not in ('admin_staff','super_admin') and public.is_super_admin())
);
drop policy if exists role_permissions_admin_manage on public.role_permissions;
create policy role_permissions_super_admin_manage on public.role_permissions for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists office_invitations_manager_update on public.office_invitations;
drop policy if exists office_members_scoped_read on public.office_members;
create policy office_members_scoped_read on public.office_members for select using (
  user_id=auth.uid() or public.has_office_permission(office_id,'staff.manage') or public.has_platform_permission('offices.manage')
);
drop policy if exists office_members_managers_manage on public.office_members;
create policy subscription_change_scoped_read on public.subscription_change_requests for select using (
  public.has_platform_permission('subscriptions.manage') or exists(select 1 from public.rental_offices o where o.id=office_id and o.owner_id=auth.uid())
);

drop policy if exists offices_public_read on public.rental_offices;
create policy offices_public_read on public.rental_offices for select using (
  status='approved' or owner_id=auth.uid() or public.is_office_member(id)
  or public.has_platform_permission('offices.manage') or public.has_platform_permission('subscriptions.manage')
  or public.has_platform_permission('support.manage') or public.has_platform_permission('platform.read')
  or public.has_platform_permission('bookings.manage') or public.has_platform_permission('finance.read')
);
drop policy if exists offices_owner_update on public.rental_offices;
create policy offices_owner_update on public.rental_offices for update using (
  public.has_platform_permission('offices.manage') or public.has_office_permission(id,'office.manage')
) with check (
  public.has_platform_permission('offices.manage') or public.has_office_permission(id,'office.manage')
);
drop policy if exists offices_owner_delete on public.rental_offices;
create policy offices_admin_delete on public.rental_offices for delete using (public.has_platform_permission('offices.manage'));
drop policy if exists offices_owner_insert on public.rental_offices;
create or replace function public.platform_commission_default()
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce((select (value#>>'{}')::numeric from public.platform_settings where key='platform_commission_rate'),0.10)
$$;
create or replace function public.apply_office_commission_default()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.has_platform_permission('offices.manage') then
    new.commission_rate:=public.platform_commission_default();
  end if;
  return new;
end $$;
drop trigger if exists apply_office_commission_default_before_insert on public.rental_offices;
create trigger apply_office_commission_default_before_insert before insert on public.rental_offices for each row execute function public.apply_office_commission_default();
create policy offices_owner_insert on public.rental_offices for insert with check (
  public.has_platform_permission('offices.manage') or (owner_id=auth.uid() and status in ('draft','pending') and verified_at is null and commission_rate=public.platform_commission_default())
);

drop policy if exists plans_public_read on public.subscription_plans;
create policy plans_public_read on public.subscription_plans for select using (is_active or public.has_platform_permission('subscriptions.manage'));
drop policy if exists profiles_booking_participant_read on public.profiles;
create policy profiles_booking_participant_read on public.profiles for select using (
  exists(select 1 from public.bookings b where b.customer_id=profiles.id and (b.customer_id=auth.uid()
    or public.has_office_permission(b.office_id,'bookings.manage') or public.has_office_permission(b.office_id,'customers.read')
    or public.has_office_permission(b.office_id,'finance.read') or public.has_office_permission(b.office_id,'support.manage')
    or public.is_platform_admin() or public.has_platform_permission('platform.read') or public.has_platform_permission('bookings.manage')
    or public.has_platform_permission('customers.manage') or public.has_platform_permission('finance.read') or public.has_platform_permission('support.manage')))
);
create policy profiles_platform_module_read on public.profiles for select using (
  public.has_platform_permission('platform.manage') or public.has_platform_permission('offices.manage')
  or (public.has_platform_permission('customers.manage') and exists(select 1 from public.customers c where c.user_id=profiles.id))
  or (public.has_platform_permission('support.manage') and exists(select 1 from public.support_tickets t where t.requester_id=profiles.id))
  or ((public.has_platform_permission('platform.read') or public.has_platform_permission('bookings.manage') or public.has_platform_permission('finance.read'))
    and exists(select 1 from public.bookings b where b.customer_id=profiles.id))
);
drop policy if exists customers_self_office_admin_read on public.customers;
create policy customers_self_office_admin_read on public.customers for select using (
  user_id=auth.uid() or public.has_platform_permission('customers.manage')
  or exists(select 1 from public.bookings b where b.customer_id=customers.user_id and public.has_office_permission(b.office_id,'customers.read'))
);
drop policy if exists customers_self_update on public.customers;
create policy customers_self_update on public.customers for update using (user_id=auth.uid() or public.has_platform_permission('customers.manage'))
  with check (user_id=auth.uid() or public.has_platform_permission('customers.manage'));
drop policy if exists customers_admin_insert on public.customers;
create policy customers_admin_insert on public.customers for insert with check (public.has_platform_permission('customers.manage') or user_id=auth.uid());
create or replace function public.protect_customer_restriction_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.has_platform_permission('customers.manage') then
    if tg_op='INSERT' then new.is_blacklisted:=false; new.blacklist_reason:=null;
    else new.is_blacklisted:=old.is_blacklisted; new.blacklist_reason:=old.blacklist_reason;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_customer_restriction_fields_before_write on public.customers;
create trigger protect_customer_restriction_fields_before_write before insert or update on public.customers for each row execute function public.protect_customer_restriction_fields();
drop policy if exists promotions_office_admin_manage on public.promotions;
create policy promotions_office_admin_manage on public.promotions for all using (
  public.has_platform_permission('promotions.manage') or (office_id is not null and public.has_office_permission(office_id,'promotions.manage'))
) with check (
  public.has_platform_permission('promotions.manage') or (office_id is not null and public.has_office_permission(office_id,'promotions.manage'))
);
create policy promotions_public_active_read on public.promotions for select using (is_active and starts_at<=now() and ends_at>now());
drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews for select using (
  status='published' or customer_id=auth.uid() or public.has_office_permission(office_id,'reviews.manage') or public.has_platform_permission('reviews.manage')
);

drop policy if exists bookings_participant_read on public.bookings;
create policy bookings_participant_read on public.bookings for select using (
  customer_id=auth.uid() or public.has_office_permission(office_id,'bookings.manage')
  or public.has_office_permission(office_id,'customers.read') or public.has_office_permission(office_id,'finance.read')
  or public.has_office_permission(office_id,'support.manage') or public.has_platform_permission('platform.read')
  or public.has_platform_permission('bookings.manage') or public.has_platform_permission('customers.manage')
  or public.has_platform_permission('finance.read') or public.has_platform_permission('support.manage') or public.is_platform_admin()
);
drop policy if exists bookings_office_admin_update on public.bookings;
create policy bookings_office_admin_update on public.bookings for update using (
  public.has_office_permission(office_id,'bookings.manage') or public.has_platform_permission('bookings.manage')
) with check (
  public.has_office_permission(office_id,'bookings.manage') or public.has_platform_permission('bookings.manage')
);
drop policy if exists booking_history_participant_read on public.booking_status_history;
create policy booking_history_participant_read on public.booking_status_history for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid()
    or public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('platform.read')
    or public.has_platform_permission('bookings.manage') or public.is_platform_admin()))
);
drop policy if exists pickup_office_read on public.booking_pickups;
create policy pickup_office_read on public.booking_pickups for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid()
    or public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('platform.read')
    or public.has_platform_permission('bookings.manage') or public.is_platform_admin()))
);
drop policy if exists returns_office_read on public.booking_returns;
create policy returns_office_read on public.booking_returns for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid()
    or public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('platform.read')
    or public.has_platform_permission('bookings.manage') or public.is_platform_admin()))
);
drop policy if exists inspections_participant_read on public.inspection_records;
create policy inspections_participant_read on public.inspection_records for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid()
    or public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('platform.read')
    or public.has_platform_permission('bookings.manage') or public.is_platform_admin()))
);
drop policy if exists inspection_photos_scoped on public.inspection_photos;
create policy inspection_photos_scoped on public.inspection_photos for all using (
  exists(select 1 from public.inspection_records i join public.bookings b on b.id=i.booking_id where i.id=inspection_id and
    (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('platform.read') or public.has_platform_permission('bookings.manage')))
) with check (
  exists(select 1 from public.inspection_records i join public.bookings b on b.id=i.booking_id where i.id=inspection_id and
    (public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('bookings.manage')))
);
drop policy if exists charges_participant_read on public.booking_charges;
create policy charges_participant_read on public.booking_charges for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid()
    or public.has_office_permission(b.office_id,'bookings.manage') or public.has_platform_permission('platform.read')
    or public.has_platform_permission('bookings.manage') or public.is_platform_admin()))
);

-- Global finance readers need select access for reports and the read-only finance
-- workspace; office permissions above remain constrained to the matching tenant.
drop policy if exists vehicles_public_read on public.vehicles;
create policy vehicles_public_read on public.vehicles for select using (
  (is_published and status='available') or public.is_office_member(office_id) or public.is_platform_admin()
  or public.has_platform_permission('platform.read') or public.has_platform_permission('bookings.manage')
  or public.has_platform_permission('finance.read')
);
drop policy if exists payments_participant_read on public.payments;
create policy payments_participant_read on public.payments for select using (
  customer_id=auth.uid() or (office_id is not null and
    (public.has_office_permission(office_id,'finance.read') or public.has_office_permission(office_id,'payments.verify') or public.has_office_permission(office_id,'payments.record')))
  or public.is_platform_admin() or public.has_platform_permission('finance.read')
);
drop policy if exists payment_proofs_participant_read on public.payment_proofs;
create policy payment_proofs_participant_read on public.payment_proofs for select using (
  exists(select 1 from public.payments p where p.id=payment_id and
    (p.customer_id=auth.uid() or public.has_office_permission(p.office_id,'finance.read') or public.has_office_permission(p.office_id,'payments.verify') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists deposits_participant_read on public.deposits;
create policy deposits_participant_read on public.deposits for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and
    (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'finance.read') or public.has_office_permission(b.office_id,'deposits.manage') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists deposit_transactions_participant_read on public.deposit_transactions;
create policy deposit_transactions_participant_read on public.deposit_transactions for select using (
  exists(select 1 from public.deposits d join public.bookings b on b.id=d.booking_id where d.id=deposit_id and
    (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'finance.read') or public.has_office_permission(b.office_id,'deposits.manage') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists refunds_participant_read on public.refunds;
create policy refunds_participant_read on public.refunds for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and
    (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'finance.read') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists invoices_participant_read on public.invoices;
create policy invoices_participant_read on public.invoices for select using (
  exists(select 1 from public.bookings b where b.id=booking_id and
    (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'finance.read') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists commissions_scoped_read on public.commissions;
create policy commissions_scoped_read on public.commissions for select using (
  public.has_office_permission(office_id,'finance.read') or public.has_platform_permission('finance.read') or public.is_platform_admin()
);
drop policy if exists payouts_scoped_read on public.payouts;
create policy payouts_scoped_read on public.payouts for select using (
  public.has_office_permission(office_id,'finance.read') or public.has_platform_permission('finance.read') or public.is_platform_admin()
);
drop policy if exists payout_settlements_scoped_read on public.payout_settlements;
create policy payout_settlements_scoped_read on public.payout_settlements for select using (
  exists(select 1 from public.payouts p where p.id=payout_id and
    (public.has_office_permission(p.office_id,'finance.read') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists expenses_office_read on public.office_expenses;
create policy expenses_office_read on public.office_expenses for select using (
  public.has_office_permission(office_id,'finance.read') or public.has_platform_permission('finance.read') or public.is_platform_admin()
);
drop policy if exists payment_proof_scoped_read on storage.objects;
create policy payment_proof_scoped_read on storage.objects for select to authenticated using (
  bucket_id='payment-proofs' and exists(select 1 from public.payments p where p.id=(storage.foldername(name))[2]::uuid and
    (p.customer_id=auth.uid() or public.has_office_permission(p.office_id,'finance.read') or public.has_office_permission(p.office_id,'payments.verify') or public.has_platform_permission('finance.read') or public.is_platform_admin()))
);
drop policy if exists audit_finance_read on public.audit_logs;
create policy audit_finance_read on public.audit_logs for select using (
  public.has_platform_permission('finance.read') and entity_type in ('payment','refund','deposit','payout','invoice','rental_office')
);

create or replace function public.protect_office_control_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.has_platform_permission('offices.manage') then
    if new.owner_id is distinct from old.owner_id or new.slug is distinct from old.slug
      or new.status is distinct from old.status or new.verified_at is distinct from old.verified_at
      or new.commission_rate is distinct from old.commission_rate
      or new.average_rating is distinct from old.average_rating or new.review_count is distinct from old.review_count then
      raise exception 'Office ownership, approval, commission, and rating fields are platform controlled';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_office_control_fields_before_write on public.rental_offices;
create trigger protect_office_control_fields_before_write before update on public.rental_offices for each row execute function public.protect_office_control_fields();

drop policy if exists plans_admin_manage on public.subscription_plans;
create policy plans_admin_manage on public.subscription_plans for all using (public.has_platform_permission('subscriptions.manage')) with check (public.has_platform_permission('subscriptions.manage'));
drop policy if exists subscriptions_admin_manage on public.subscriptions;
create policy subscriptions_staff_read on public.subscriptions for select using (public.has_platform_permission('subscriptions.manage'));
create policy subscriptions_admin_manage on public.subscriptions for all using (public.has_platform_permission('subscriptions.manage')) with check (public.has_platform_permission('subscriptions.manage'));
drop policy if exists cms_admin_manage on public.cms_pages;
create policy cms_admin_manage on public.cms_pages for all using (public.has_platform_permission('cms.manage')) with check (public.has_platform_permission('cms.manage'));
drop policy if exists cms_public_published_read on public.cms_pages;
create policy cms_public_published_read on public.cms_pages for select using (status='published' or public.has_platform_permission('cms.manage'));
drop policy if exists banners_admin_manage on public.banners;
create policy banners_admin_manage on public.banners for all using (public.has_platform_permission('cms.manage')) with check (public.has_platform_permission('cms.manage'));
drop policy if exists banners_active_public_read on public.banners;
create policy banners_active_public_read on public.banners for select using (
  (is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) or public.has_platform_permission('cms.manage')
);
drop policy if exists settings_admin_manage on public.platform_settings;
create policy settings_admin_manage on public.platform_settings for all using (public.has_platform_permission('settings.manage')) with check (public.has_platform_permission('settings.manage'));
drop policy if exists settings_public_read on public.platform_settings;
create policy settings_public_read on public.platform_settings for select using (is_public or public.has_platform_permission('settings.manage'));
drop policy if exists reviews_moderator_manage on public.reviews;
create policy reviews_moderator_manage on public.reviews for update using (public.has_platform_permission('reviews.manage')) with check (public.has_platform_permission('reviews.manage'));
drop policy if exists reviews_office_moderate on public.reviews;
create policy reviews_office_moderate on public.reviews for update using (public.has_office_permission(office_id,'reviews.manage')) with check (public.has_office_permission(office_id,'reviews.manage'));
drop policy if exists notifications_admin_manage on public.notifications;
create policy notifications_admin_manage on public.notifications for all using (public.has_platform_permission('notifications.manage')) with check (public.has_platform_permission('notifications.manage'));
drop policy if exists tickets_participant_read on public.support_tickets;
create policy tickets_participant_read on public.support_tickets for select using (requester_id=auth.uid() or assigned_to=auth.uid() or (office_id is not null and public.has_office_permission(office_id,'support.manage')) or public.has_platform_permission('support.manage'));
drop policy if exists tickets_assignee_update on public.support_tickets;
create policy tickets_assignee_update on public.support_tickets for update using (
  public.has_platform_permission('support.manage') or (office_id is not null and public.has_office_permission(office_id,'support.manage'))
) with check (
  public.has_platform_permission('support.manage') or (office_id is not null and public.has_office_permission(office_id,'support.manage'))
);
drop policy if exists messages_ticket_scope_read on public.support_messages;
create policy messages_ticket_scope_read on public.support_messages for select using (
  exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=auth.uid() or t.assigned_to=auth.uid() or (t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')) or public.has_platform_permission('support.manage')))
  and (not is_internal or public.has_platform_permission('support.manage') or exists(select 1 from public.support_tickets t where t.id=ticket_id and t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')))
);
drop policy if exists messages_ticket_scope_insert on public.support_messages;
create policy messages_ticket_scope_insert on public.support_messages for insert with check (
  author_id=auth.uid() and exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=auth.uid() or t.assigned_to=auth.uid() or (t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')) or public.has_platform_permission('support.manage')))
  and (not is_internal or public.has_platform_permission('support.manage') or exists(select 1 from public.support_tickets t where t.id=ticket_id and t.office_id is not null and public.has_office_permission(t.office_id,'support.manage')))
);
drop policy if exists disputes_moderator_update on public.disputes;
create policy disputes_moderator_update on public.disputes for update using (
  public.has_platform_permission('support.manage') or exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'support.manage'))
) with check (
  public.has_platform_permission('support.manage') or exists(select 1 from public.bookings b where b.id=booking_id and public.has_office_permission(b.office_id,'support.manage'))
);
drop policy if exists disputes_participant_read on public.disputes;
create policy disputes_participant_read on public.disputes for select using (opened_by=auth.uid() or exists(select 1 from public.bookings b where b.id=booking_id and (b.customer_id=auth.uid() or public.has_office_permission(b.office_id,'support.manage'))) or public.has_platform_permission('support.manage'));
alter table public.disputes add constraint dispute_resolved_requires_summary check(status<>'resolved' or length(trim(coalesce(resolution,'')))>=5) not valid;

grant select,insert,update,delete on public.cms_faqs,public.featured_content to authenticated;
grant select,insert,update,delete on public.cms_pages,public.banners to authenticated;
grant select,insert,update,delete on public.platform_settings to authenticated;
grant select,insert,update,delete on public.support_tickets,public.support_messages,public.disputes to authenticated;
grant select,insert,update,delete on public.reviews to authenticated;
grant select,insert,update,delete on public.subscription_plans,public.subscriptions to authenticated;
grant select on public.office_invitations to authenticated;
grant select on public.platform_invitations to authenticated;
grant select on public.subscription_change_requests to authenticated;
grant select,insert,update,delete on public.office_members to authenticated;
grant select,insert,update,delete on public.user_roles,public.role_permissions to authenticated;

create or replace function public.validate_platform_setting()
returns trigger language plpgsql set search_path=public as $$
declare n numeric; rules jsonb;
begin
  if new.key in ('platform_commission_rate','booking_service_fee_rate','tax_rate') then
    begin n:=(new.value#>>'{}')::numeric; exception when others then raise exception 'Setting % must be a number',new.key; end;
    if n<0 or n>1 then raise exception 'Setting % must be between 0 and 1',new.key; end if;
  elsif new.key='syp_per_usd' and new.value#>>'{}' is not null then
    begin n:=(new.value#>>'{}')::numeric; exception when others then raise exception 'Exchange rate must be numeric'; end;
    if n<=0 or n>100000000 then raise exception 'Exchange rate is outside the supported range'; end if;
  elsif new.key='booking_rules' then
    rules:=new.value;
    if jsonb_typeof(rules)<>'object' then raise exception 'Booking rules must be an object'; end if;
    if coalesce((rules->>'minimum_hours')::numeric,0) not between 1 and 168
      or coalesce((rules->>'maximum_days')::numeric,0) not between 1 and 365 then raise exception 'Booking duration settings are invalid'; end if;
    if coalesce((rules->>'delivery_fee')::numeric,-1)<0 or coalesce((rules->>'insurance_per_day')::numeric,-1)<0
      or coalesce((rules->>'extra_driver_per_day')::numeric,-1)<0 or coalesce((rules->>'late_fee_per_hour')::numeric,-1)<0 then raise exception 'Booking fees cannot be negative'; end if;
  elsif new.key='supported_languages' and jsonb_typeof(new.value)<>'array' then
    raise exception 'Supported languages must be an array';
  end if;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists validate_platform_setting_before_write on public.platform_settings;
create trigger validate_platform_setting_before_write before insert or update on public.platform_settings for each row execute function public.validate_platform_setting();

create or replace function public.create_platform_office(
  p_name text,p_slug text,p_city_id uuid,p_address text,p_phone text,p_email text,p_owner_id uuid
)
returns public.rental_offices language plpgsql security definer set search_path=public as $$
declare result public.rental_offices;
begin
  if auth.uid() is null or not public.has_platform_permission('offices.manage') then raise exception 'Office management permission required'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>80
    or length(trim(coalesce(p_address,'')))<3 or length(p_address)>500
    or (p_phone is not null and length(p_phone)>40)
    or (p_email is not null and p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') then
    raise exception 'Office name, slug, address, phone, or email is invalid';
  end if;
  if not exists(select 1 from public.cities where id=p_city_id and is_active) then raise exception 'Choose an active city'; end if;
  if not exists(select 1 from public.profiles where id=p_owner_id) then raise exception 'Choose an existing office owner account'; end if;
  insert into public.rental_offices(owner_id,city_id,name,slug,address,phone,email,status,commission_rate)
    values(p_owner_id,p_city_id,trim(p_name),p_slug,trim(p_address),nullif(trim(coalesce(p_phone,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),'pending',public.platform_commission_default())
    returning * into result;
  insert into public.office_members(office_id,user_id,role,permissions,invited_by,joined_at,status)
    values(result.id,p_owner_id,'office_owner','{}'::jsonb,auth.uid(),now(),'active');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'office.onboarded','rental_office',result.id,result.id,jsonb_build_object('owner_id',p_owner_id,'commission_rate',result.commission_rate,'status',result.status));
  return result;
end $$;

create or replace function public.set_office_subscription(p_office_id uuid,p_plan_id uuid,p_status text default 'trialing',p_billing_period text default 'monthly',p_period_end timestamptz default null)
returns public.subscriptions language plpgsql security definer set search_path=public as $$
declare result public.subscriptions; owner_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('trialing','active','past_due','cancelled','expired') or p_billing_period not in ('monthly','annual') then raise exception 'Invalid subscription status or billing period'; end if;
  select o.owner_id into owner_id from public.rental_offices o where o.id=p_office_id;
  if owner_id is null then raise exception 'Office not found'; end if;
  if not public.has_platform_permission('subscriptions.manage') and (owner_id<>auth.uid() or p_status<>'cancelled') then raise exception 'Only platform administrators can apply a subscription plan; office owners can cancel'; end if;
  if not exists(select 1 from public.subscription_plans where id=p_plan_id and (is_active or p_status='cancelled')) then raise exception 'Choose an active subscription plan'; end if;
  perform id from public.rental_offices where id=p_office_id for update;
  select * into result from public.subscriptions where office_id=p_office_id and status in ('trialing','active','past_due') order by created_at desc limit 1 for update;
  if found then
    update public.subscriptions set plan_id=p_plan_id,status=p_status,billing_period=p_billing_period,
      current_period_start=now(),current_period_end=p_period_end,cancelled_at=case when p_status='cancelled' then now() else null end,updated_at=now()
      where id=result.id returning * into result;
  else
    insert into public.subscriptions(office_id,plan_id,status,billing_period,started_at,current_period_start,current_period_end,cancelled_at)
      values(p_office_id,p_plan_id::uuid,p_status::text,p_billing_period::text,now(),now(),p_period_end,case when p_status='cancelled' then now() else null end)
      returning * into result;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'subscription.changed','subscription',result.id,p_office_id,jsonb_build_object('plan_id',p_plan_id,'status',p_status,'billing_period',p_billing_period,'period_end',p_period_end));
  return result;
end $$;

create or replace function public.request_subscription_change(p_office_id uuid,p_plan_id uuid,p_billing_period text default 'monthly')
returns public.subscription_change_requests language plpgsql security definer set search_path=public as $$
declare result public.subscription_change_requests; owner_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select o.owner_id into owner_id from public.rental_offices o where o.id=p_office_id;
  if owner_id is distinct from auth.uid() then raise exception 'Only the office owner can request a plan change'; end if;
  if p_billing_period not in ('monthly','annual') or not exists(select 1 from public.subscription_plans where id=p_plan_id and is_active) then raise exception 'Choose an active plan and billing period'; end if;
  insert into public.subscription_change_requests(office_id,plan_id,billing_period,requested_by)
    values(p_office_id,p_plan_id,p_billing_period,auth.uid())
  on conflict(office_id) where status='pending' do update set plan_id=excluded.plan_id,billing_period=excluded.billing_period,created_at=now()
  returning * into result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'subscription.change_requested','subscription_change_request',result.id,p_office_id,jsonb_build_object('plan_id',p_plan_id,'billing_period',p_billing_period));
  return result;
end $$;

create or replace function public.decide_subscription_change(p_request_id uuid,p_approved boolean,p_subscription_status text default 'active',p_note text default null)
returns public.subscription_change_requests language plpgsql security definer set search_path=public as $$
declare request public.subscription_change_requests; plan_interval interval;
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'Subscription management permission required'; end if;
  if p_approved is null or p_subscription_status not in ('trialing','active') or length(coalesce(p_note,''))>1000 then raise exception 'Invalid subscription decision'; end if;
  select * into request from public.subscription_change_requests where id=p_request_id for update;
  if not found or request.status<>'pending' then raise exception 'Pending subscription request not found'; end if;
  update public.subscription_change_requests set status=case when p_approved then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=request.id returning * into request;
  if p_approved then
    plan_interval:=case when request.billing_period='annual' then interval '1 year' else interval '1 month' end;
    perform public.set_office_subscription(request.office_id,request.plan_id,p_subscription_status,request.billing_period,now()+plan_interval);
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),case when p_approved then 'subscription.change_approved' else 'subscription.change_rejected' end,'subscription_change_request',request.id,request.office_id,jsonb_build_object('status',request.status,'note',request.review_note));
  return request;
end $$;

create or replace function public.create_office_invitation(p_office_id uuid,p_email text,p_role text,p_permissions jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare token text; invitation public.office_invitations; owner_id uuid; allowed text[]:=array['fleet.manage','bookings.manage','finance.read','payments.record','payments.verify','invoices.issue','staff.manage','customers.read','promotions.manage','deposits.manage','refunds.manage','refunds.approve','support.manage','disputes.manage','reviews.manage'];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_email,''))) not between 6 and 254 or p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid invitation email'; end if;
  if p_role not in ('office_manager','office_staff') or jsonb_typeof(coalesce(p_permissions,'{}'))<>'object' then raise exception 'Choose a valid office role and permissions'; end if;
  select o.owner_id into owner_id from public.rental_offices o where o.id=p_office_id;
  if owner_id is null or (not public.has_office_permission(p_office_id,'staff.manage')) then raise exception 'Not authorized to invite office staff'; end if;
  if p_role='office_manager' and owner_id<>auth.uid() and not public.is_platform_admin() then raise exception 'Only the office owner can invite another manager'; end if;
  if exists(select 1 from jsonb_each(coalesce(p_permissions,'{}')) e where e.key<>all(allowed) or jsonb_typeof(e.value)<>'boolean') then raise exception 'Invitation contains an unsupported permission'; end if;
  if p_role='office_manager' and p_permissions<>'{}' then raise exception 'Office managers have full office permissions'; end if;
  if exists(select 1 from public.office_members m join public.profiles p on p.id=m.user_id where m.office_id=p_office_id and lower(p.email)=lower(p_email) and m.status='active') then raise exception 'This person is already an active office member'; end if;
  token:=encode(gen_random_bytes(32),'hex');
  insert into public.office_invitations(office_id,email,role,permissions,token_hash,invited_by)
    values(p_office_id,lower(trim(p_email)),p_role::public.app_role,case when p_role='office_manager' then '{}'::jsonb else coalesce(p_permissions,'{}') end,encode(digest(token,'sha256'),'hex'),auth.uid())
  on conflict(office_id,email) where status='invited' do update set role=excluded.role,permissions=excluded.permissions,token_hash=excluded.token_hash,invited_by=excluded.invited_by,expires_at=now()+interval '7 days',created_at=now()
  returning * into invitation;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'staff.invited','office_invitation',invitation.id,p_office_id,jsonb_build_object('email',invitation.email,'role',invitation.role,'permissions',invitation.permissions));
  return jsonb_build_object('id',invitation.id,'email',invitation.email,'role',invitation.role,'token',token,'expires_at',invitation.expires_at);
end $$;

create or replace function public.accept_office_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invitation public.office_invitations; user_email text; office public.rental_offices;
begin
  if auth.uid() is null or length(coalesce(p_token,''))<>64 then raise exception 'Sign in with the invited email to accept this invitation'; end if;
  select lower(email) into user_email from public.profiles where id=auth.uid();
  select * into invitation from public.office_invitations where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or invitation.status<>'invited' or invitation.expires_at<=now() or lower(invitation.email::text)<>user_email then raise exception 'Invitation is invalid, expired, or belongs to another email'; end if;
  insert into public.office_members(office_id,user_id,role,permissions,invited_by,joined_at,status)
    values(invitation.office_id,auth.uid(),invitation.role,invitation.permissions,invitation.invited_by,now(),'active')
    on conflict(office_id,user_id) do update set role=excluded.role,permissions=excluded.permissions,joined_at=now(),status='active';
  insert into public.user_roles(user_id,role,scope_office_id) values(auth.uid(),invitation.role,invitation.office_id) on conflict(user_id,role,scope_office_id) do nothing;
  update public.office_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now(),token_hash='accepted:'||id::text where id=invitation.id;
  select * into office from public.rental_offices where id=invitation.office_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),'staff.invitation_accepted','office_invitation',invitation.id,invitation.office_id,jsonb_build_object('role',invitation.role));
  return jsonb_build_object('office_id',office.id,'office_slug',office.slug,'office_name',office.name,'role',invitation.role);
end $$;

create or replace function public.update_office_staff_member(p_member_id uuid,p_status text default null,p_permissions jsonb default null)
returns public.office_members language plpgsql security definer set search_path=public as $$
declare member public.office_members; owner_id uuid; allowed text[]:=array['fleet.manage','bookings.manage','finance.read','payments.record','payments.verify','invoices.issue','staff.manage','customers.read','promotions.manage','deposits.manage','refunds.manage','refunds.approve','support.manage','disputes.manage','reviews.manage'];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into member from public.office_members where id=p_member_id for update;
  if not found or not public.has_office_permission(member.office_id,'staff.manage') then raise exception 'Not authorized to manage this staff member'; end if;
  select o.owner_id into owner_id from public.rental_offices o where o.id=member.office_id;
  if member.role='office_owner' or (member.role='office_manager' and owner_id<>auth.uid() and not public.has_platform_permission('offices.manage')) then raise exception 'Only the office owner can manage office owners or managers'; end if;
  if p_status is not null and p_status not in ('active','suspended') then raise exception 'Staff status must be active or suspended'; end if;
  if p_permissions is not null and (member.role<>'office_staff' or jsonb_typeof(p_permissions)<>'object'
    or exists(select 1 from jsonb_each(p_permissions) e where e.key<>all(allowed) or jsonb_typeof(e.value)<>'boolean')) then
    raise exception 'Permissions may only be changed for office staff and must use supported boolean values';
  end if;
  update public.office_members set status=coalesce(p_status,status),permissions=coalesce(p_permissions,permissions)
    where id=member.id returning * into member;
  return member;
end $$;

create or replace function public.revoke_office_invitation(p_invitation_id uuid)
returns public.office_invitations language plpgsql security definer set search_path=public as $$
declare invitation public.office_invitations;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.office_invitations where id=p_invitation_id for update;
  if not found or not public.has_office_permission(invitation.office_id,'staff.manage') then raise exception 'Not authorized to revoke this invitation'; end if;
  if invitation.status<>'invited' then raise exception 'Only pending invitations can be revoked'; end if;
  update public.office_invitations set status='revoked',token_hash='revoked:'||id::text where id=invitation.id returning * into invitation;
  return invitation;
end $$;

create or replace function public.create_platform_invitation(p_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare token text; invitation public.platform_invitations;
begin
  if auth.uid() is null or not public.has_platform_permission('platform.manage') then raise exception 'Platform staff management permission required'; end if;
  if length(trim(coalesce(p_email,''))) not between 6 and 254 or p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid invitation email'; end if;
  if exists(select 1 from public.user_roles ur join public.profiles p on p.id=ur.user_id where lower(p.email)=lower(trim(p_email)) and ur.role in ('admin_staff','super_admin') and ur.scope_office_id is null) then raise exception 'This account already has platform staff access'; end if;
  token:=encode(gen_random_bytes(32),'hex');
  insert into public.platform_invitations(email,token_hash,invited_by) values(lower(trim(p_email)),encode(digest(token,'sha256'),'hex'),auth.uid())
  on conflict(email) where status='invited' do update set token_hash=excluded.token_hash,invited_by=excluded.invited_by,expires_at=now()+interval '7 days',created_at=now()
  returning * into invitation;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'platform_staff.invited','platform_invitation',invitation.id,jsonb_build_object('email',invitation.email));
  return jsonb_build_object('id',invitation.id,'email',invitation.email,'token',token,'expires_at',invitation.expires_at);
end $$;

create or replace function public.accept_platform_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invitation public.platform_invitations; user_email text;
begin
  if auth.uid() is null or length(coalesce(p_token,''))<>64 then raise exception 'Sign in with the invited email to accept this invitation'; end if;
  select lower(email) into user_email from public.profiles where id=auth.uid();
  select * into invitation from public.platform_invitations where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or invitation.status<>'invited' or invitation.expires_at<=now() or lower(invitation.email::text)<>user_email then raise exception 'Invitation is invalid, expired, or belongs to another email'; end if;
  insert into public.user_roles(user_id,role,scope_office_id) values(auth.uid(),'admin_staff',null) on conflict(user_id,role,scope_office_id) do nothing;
  update public.platform_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now(),token_hash='accepted:'||id::text where id=invitation.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'platform_staff.invitation_accepted','platform_invitation',invitation.id,jsonb_build_object('email',invitation.email,'role','admin_staff'));
  return jsonb_build_object('role','admin_staff');
end $$;

create or replace function public.revoke_platform_invitation(p_invitation_id uuid)
returns public.platform_invitations language plpgsql security definer set search_path=public as $$
declare invitation public.platform_invitations;
begin
  if auth.uid() is null or not public.has_platform_permission('platform.manage') then raise exception 'Platform staff management permission required'; end if;
  select * into invitation from public.platform_invitations where id=p_invitation_id for update;
  if not found or invitation.status<>'invited' then raise exception 'Pending platform invitation not found'; end if;
  update public.platform_invitations set status='revoked',token_hash='revoked:'||id::text where id=invitation.id returning * into invitation;
  return invitation;
end $$;

create or replace function public.broadcast_in_app_notification(p_title text,p_body text,p_audience text)
returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  if auth.uid() is null or not public.has_platform_permission('notifications.manage') then
    raise exception 'Notification management permission required';
  end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 160
    or length(trim(coalesce(p_body,''))) not between 3 and 4000
    or p_audience is null or p_audience not in ('all','customer','office','platform') then
    raise exception 'Notification title, message, or audience is invalid';
  end if;
  with recipients as (
    select id as recipient_id from public.profiles where p_audience='all'
    union
    select user_id from public.user_roles where p_audience='customer' and role='customer'
    union
    select owner_id from public.rental_offices where p_audience='office'
    union
    select user_id from public.office_members where p_audience='office' and status='active'
    union
    select user_id from public.user_roles where p_audience='platform' and role in ('super_admin','admin_staff')
  )
  insert into public.notifications(recipient_id,audience,title,body,channel,sent_at,metadata)
  select recipient_id,p_audience,trim(p_title),trim(p_body),'in_app',now(),jsonb_build_object('source','platform_admin') from recipients;
  get diagnostics inserted_count = row_count;
  insert into public.audit_logs(actor_id,action,entity_type,after_data)
    values(auth.uid(),'notification.broadcast','notifications',jsonb_build_object('audience',p_audience,'recipient_count',inserted_count,'title',trim(p_title)));
  return inserted_count;
end $$;

create or replace function public.protect_support_input()
returns trigger language plpgsql security definer set search_path=public as $$
declare authorized_support boolean:=false; booking_customer uuid; booking_office uuid;
begin
  if tg_table_name='support_tickets' then
    if tg_op='INSERT' then
      if new.booking_id is not null then
        select b.customer_id,b.office_id into booking_customer,booking_office from public.bookings b where b.id=new.booking_id;
        if not found then raise exception 'Booking not found'; end if;
        if new.requester_id is distinct from booking_customer then raise exception 'A support ticket must belong to the booking customer'; end if;
        if new.office_id is not null and new.office_id is distinct from booking_office then raise exception 'Ticket office must match the linked booking'; end if;
        new.office_id:=booking_office;
      elsif new.requester_id=auth.uid() then
        new.office_id:=null;
      end if;
      authorized_support:=coalesce(public.has_office_permission(new.office_id,'support.manage'),false);
    else
      if new.requester_id is distinct from old.requester_id or new.office_id is distinct from old.office_id
        or new.booking_id is distinct from old.booking_id or new.subject is distinct from old.subject
        or new.category is distinct from old.category or new.ticket_number is distinct from old.ticket_number
        or new.created_at is distinct from old.created_at then
        raise exception 'Ticket ownership and subject fields cannot be changed';
      end if;
      authorized_support:=coalesce(public.has_office_permission(old.office_id,'support.manage'),false);
      if not authorized_support and old.assigned_to is distinct from auth.uid() then raise exception 'Not authorized to update this ticket'; end if;
      if not authorized_support and (new.priority is distinct from old.priority or new.assigned_to is distinct from old.assigned_to) then
        raise exception 'Only support managers can change ticket priority or assignment';
      end if;
    end if;
  elsif tg_table_name='support_messages' then
    select coalesce(public.has_office_permission(t.office_id,'support.manage'),false) into authorized_support
      from public.support_tickets t where t.id=new.ticket_id;
  elsif tg_table_name='disputes' then
    select b.customer_id,b.office_id into booking_customer,booking_office from public.bookings b where b.id=new.booking_id;
    if not found then raise exception 'Booking not found'; end if;
    if tg_op='INSERT' then
      if new.opened_by is distinct from booking_customer then raise exception 'A booking dispute must be opened by its customer'; end if;
      if length(trim(new.description))<10 or length(new.description)>5000 then raise exception 'Complaint details must contain 10 to 5000 characters'; end if;
    else
      if new.booking_id is distinct from old.booking_id or new.opened_by is distinct from old.opened_by
        or new.category is distinct from old.category or new.description is distinct from old.description
        or new.created_at is distinct from old.created_at then
        raise exception 'Dispute ownership and complaint fields cannot be changed';
      end if;
      if new.status='resolved' then
        if length(trim(coalesce(new.resolution,'')))<5 then raise exception 'A resolution summary of at least five characters is required'; end if;
        new.resolved_by:=auth.uid(); new.resolved_at:=now();
      else
        new.resolved_by:=null; new.resolved_at:=null;
      end if;
    end if;
    authorized_support:=coalesce(public.has_office_permission(booking_office,'support.manage'),false);
    if tg_op='UPDATE' and not authorized_support and not public.has_platform_permission('support.manage') then raise exception 'Not authorized to update this dispute'; end if;
  end if;
  authorized_support:=coalesce(authorized_support,false) or public.has_platform_permission('support.manage');
  if auth.uid() is not null and not authorized_support then
    if tg_table_name='support_tickets' and tg_op='INSERT' then
      new.status:='open'; new.priority:='normal'; new.assigned_to:=null; new.resolved_at:=null;
    elsif tg_table_name='support_tickets' and tg_op='UPDATE' and new.status not in ('open','in_progress','waiting','resolved','closed') then
      raise exception 'Unsupported support ticket status';
    elsif tg_table_name='support_messages' and new.is_internal then
      raise exception 'Only support staff can add internal notes';
    elsif tg_table_name='disputes' and tg_op='INSERT' then
      new.status:='open'; new.resolution:=null; new.resolved_by:=null; new.resolved_at:=null;
    end if;
  end if;
  if tg_table_name='support_messages' and (length(trim(new.body))<1 or length(new.body)>5000) then raise exception 'Support messages must contain 1 to 5000 characters'; end if;
  return new;
end $$;

drop trigger if exists protect_support_ticket_update on public.support_tickets;
create trigger protect_support_ticket_update before update on public.support_tickets for each row execute function public.protect_support_input();
drop trigger if exists protect_dispute_update on public.disputes;
create trigger protect_dispute_update before update on public.disputes for each row execute function public.protect_support_input();

create or replace function public.audit_management_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare before_row jsonb; after_row jsonb; record_id uuid; office_id_value uuid; action_value text;
begin
  if tg_op<>'INSERT' then before_row:=to_jsonb(old)-'token_hash'; end if;
  if tg_op<>'DELETE' then after_row:=to_jsonb(new)-'token_hash'; end if;
  record_id:=coalesce((after_row->>'id')::uuid,(before_row->>'id')::uuid);
  office_id_value:=coalesce((after_row->>'office_id')::uuid,(before_row->>'office_id')::uuid);
  if office_id_value is null and tg_table_name='support_messages' then
    select t.office_id into office_id_value from public.support_tickets t where t.id=coalesce((after_row->>'ticket_id')::uuid,(before_row->>'ticket_id')::uuid);
  elsif office_id_value is null and tg_table_name='disputes' then
    select b.office_id into office_id_value from public.bookings b where b.id=coalesce((after_row->>'booking_id')::uuid,(before_row->>'booking_id')::uuid);
  end if;
  action_value:=lower(tg_table_name)||'.'||lower(tg_op);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,before_data,after_data)
    values(auth.uid(),action_value,tg_table_name,record_id,office_id_value,before_row,after_row);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists cms_pages_audit on public.cms_pages;
create trigger cms_pages_audit after insert or update or delete on public.cms_pages for each row execute function public.audit_management_change();
drop trigger if exists banners_audit on public.banners;
create trigger banners_audit after insert or update or delete on public.banners for each row execute function public.audit_management_change();
drop trigger if exists cms_faqs_audit on public.cms_faqs;
create trigger cms_faqs_audit after insert or update or delete on public.cms_faqs for each row execute function public.audit_management_change();
drop trigger if exists featured_content_audit on public.featured_content;
create trigger featured_content_audit after insert or update or delete on public.featured_content for each row execute function public.audit_management_change();
drop trigger if exists subscriptions_audit on public.subscriptions;
create trigger subscriptions_audit after insert or update or delete on public.subscriptions for each row execute function public.audit_management_change();
drop trigger if exists subscription_change_audit on public.subscription_change_requests;
create trigger subscription_change_audit after insert or update or delete on public.subscription_change_requests for each row execute function public.audit_management_change();
drop trigger if exists office_invitations_audit on public.office_invitations;
create trigger office_invitations_audit after insert or update or delete on public.office_invitations for each row execute function public.audit_management_change();
drop trigger if exists office_members_audit on public.office_members;
create trigger office_members_audit after insert or update or delete on public.office_members for each row execute function public.audit_management_change();
drop trigger if exists platform_invitations_audit on public.platform_invitations;
create trigger platform_invitations_audit after insert or update or delete on public.platform_invitations for each row execute function public.audit_management_change();
drop trigger if exists settings_audit on public.platform_settings;
create trigger settings_audit after insert or update or delete on public.platform_settings for each row execute function public.audit_management_change();
drop trigger if exists support_tickets_audit on public.support_tickets;
create trigger support_tickets_audit after insert or update or delete on public.support_tickets for each row execute function public.audit_management_change();
drop trigger if exists support_messages_audit on public.support_messages;
create trigger support_messages_audit after insert or update or delete on public.support_messages for each row execute function public.audit_management_change();
drop trigger if exists disputes_audit on public.disputes;
create trigger disputes_audit after insert or update or delete on public.disputes for each row execute function public.audit_management_change();
drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit after insert or update or delete on public.user_roles for each row execute function public.audit_management_change();
drop trigger if exists role_permissions_audit on public.role_permissions;
create trigger role_permissions_audit after insert or update or delete on public.role_permissions for each row execute function public.audit_management_change();

drop trigger if exists cms_pages_updated on public.cms_pages;
create trigger cms_pages_updated before update on public.cms_pages for each row execute function public.set_updated_at();
drop trigger if exists cms_faqs_updated on public.cms_faqs;
create trigger cms_faqs_updated before update on public.cms_faqs for each row execute function public.set_updated_at();
drop trigger if exists featured_content_updated on public.featured_content;
create trigger featured_content_updated before update on public.featured_content for each row execute function public.set_updated_at();
drop trigger if exists banners_updated on public.banners;
create trigger banners_updated before update on public.banners for each row execute function public.set_updated_at();
drop trigger if exists subscription_plans_updated on public.subscription_plans;
create trigger subscription_plans_updated before update on public.subscription_plans for each row execute function public.set_updated_at();

grant execute on function public.set_office_subscription(uuid,uuid,text,text,timestamptz) to authenticated;
grant execute on function public.request_subscription_change(uuid,uuid,text) to authenticated;
grant execute on function public.decide_subscription_change(uuid,boolean,text,text) to authenticated;
grant execute on function public.create_office_invitation(uuid,text,text,jsonb) to authenticated;
grant execute on function public.accept_office_invitation(text) to authenticated;
grant execute on function public.update_office_staff_member(uuid,text,jsonb) to authenticated;
grant execute on function public.revoke_office_invitation(uuid) to authenticated;
grant execute on function public.create_platform_invitation(text) to authenticated;
grant execute on function public.accept_platform_invitation(text) to authenticated;
grant execute on function public.revoke_platform_invitation(uuid) to authenticated;
grant execute on function public.broadcast_in_app_notification(text,text,text) to authenticated;
grant execute on function public.create_platform_office(text,text,uuid,text,text,text,uuid) to authenticated;
grant execute on function public.platform_commission_default() to authenticated;
revoke all on function public.is_super_admin() from public,anon;
grant execute on function public.is_super_admin() to authenticated;
revoke all on function public.validate_platform_setting() from public,anon,authenticated;
revoke all on function public.protect_support_input() from public,anon,authenticated;
revoke all on function public.audit_management_change() from public,anon,authenticated;
revoke all on function public.protect_office_control_fields() from public,anon,authenticated;
revoke all on function public.protect_customer_restriction_fields() from public,anon,authenticated;
revoke all on function public.apply_office_commission_default() from public,anon,authenticated;
revoke all on function public.create_platform_office(text,text,uuid,text,text,text,uuid) from public,anon;
revoke all on function public.platform_commission_default() from public,anon;
revoke all on function public.set_office_subscription(uuid,uuid,text,text,timestamptz) from public,anon;
revoke all on function public.request_subscription_change(uuid,uuid,text) from public,anon;
revoke all on function public.decide_subscription_change(uuid,boolean,text,text) from public,anon;
revoke all on function public.create_office_invitation(uuid,text,text,jsonb) from public,anon;
revoke all on function public.accept_office_invitation(text) from public,anon;
revoke all on function public.update_office_staff_member(uuid,text,jsonb) from public,anon;
revoke all on function public.revoke_office_invitation(uuid) from public,anon;
revoke all on function public.create_platform_invitation(text) from public,anon;
revoke all on function public.accept_platform_invitation(text) from public,anon;
revoke all on function public.revoke_platform_invitation(uuid) from public,anon;
revoke all on function public.broadcast_in_app_notification(text,text,text) from public,anon;
