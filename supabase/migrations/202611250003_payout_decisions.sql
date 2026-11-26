-- Only platform admins can decide payout requests. Office members may submit requests.
create unique index if not exists payments_one_pending_per_booking_idx
  on public.payments(booking_id) where booking_id is not null and status='pending';

create policy payouts_admin_manage on public.payouts
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.decide_payout(p_payout_id uuid,p_approved boolean,p_note text default null)
returns public.payouts language plpgsql security definer set search_path=public as $$
declare p public.payouts;
begin
  if not public.is_platform_admin() then raise exception 'Only platform administrators can decide payouts'; end if;
  select * into p from public.payouts where id=p_payout_id for update;
  if not found or p.status<>'requested' then raise exception 'Requested payout not found'; end if;
  update public.payouts set status=case when p_approved then 'approved' else 'rejected' end,
    processed_by=auth.uid(),processed_at=now(),notes=coalesce(p_note,notes)
    where id=p.id returning * into p;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,office_id,after_data)
    values(auth.uid(),case when p_approved then 'payout.approved' else 'payout.rejected' end,'payout',p.id,p.office_id,
      jsonb_build_object('status',p.status,'amount',p.amount,'currency',p.currency));
  return p;
end $$;

grant execute on function public.decide_payout(uuid,boolean,text) to authenticated;
