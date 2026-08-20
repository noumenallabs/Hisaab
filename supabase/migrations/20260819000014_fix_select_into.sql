-- Fix PL/pgSQL SELECT without destination (comprehensive fix for change_member_role/remove_trip_member)
-- Fixes: query has no destination for result data at SELECT * FROM trips FOR UPDATE (proof 10a)
-- The SELECT was used only to lock the row, should be PERFORM

create or replace function public.change_member_role(p_trip_id uuid, p_user_id uuid, p_role public.trip_role, p_request_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_count int; v_exists boolean;
begin
  perform 1 from public.trips where id=p_trip_id for update;
  if (select status from public.trips where id=p_trip_id) <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id) into v_exists;
  if not v_exists then raise exception 'NOT_FOUND'; end if;
  if (select role from public.trip_members where trip_id=p_trip_id and user_id=p_user_id) = p_role then raise exception 'VALIDATION_FAILED no_change'; end if;
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'change_member_role',p_trip_id); exception when unique_violation then return; end;
  perform 1 from public.trip_members where trip_id=p_trip_id and role='owner' for update;
  select count(*) into v_owner_count from public.trip_members where trip_id=p_trip_id and role='owner';
  if p_role <> 'owner' and v_owner_count <=1 and exists (select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='owner') then raise exception 'LAST_OWNER'; end if;
  update public.trip_members set role=p_role where trip_id=p_trip_id and user_id=p_user_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,changed_fields,request_id) values(p_trip_id,auth.uid(),'member',p_user_id,'role_change',array['role'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.change_member_role(uuid, uuid, public.trip_role, uuid) from public; grant execute on function public.change_member_role(uuid, uuid, public.trip_role, uuid) to authenticated;

create or replace function public.remove_trip_member(p_trip_id uuid, p_user_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_owner_count int; v_exists boolean; v_net bigint;
begin
  perform 1 from public.trips where id=p_trip_id for update;
  if (select status from public.trips where id=p_trip_id) <> 'active' then raise exception 'TRIP_ARCHIVED'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id) into v_exists;
  if not v_exists then raise exception 'NOT_FOUND'; end if;
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'remove_trip_member',p_trip_id); exception when unique_violation then return; end;
  perform 1 from public.trip_members where trip_id=p_trip_id for update;
  select count(*) into v_owner_count from public.trip_members where trip_id=p_trip_id and role='owner';
  if v_owner_count <=1 and exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='owner') then raise exception 'LAST_OWNER'; end if;
  select net_minor into v_net from public.get_trip_balances(p_trip_id) where user_id=p_user_id;
  if v_net is not null and v_net <>0 then raise exception 'MEMBER_HAS_BALANCE'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=p_user_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,changed_fields,request_id) values(p_trip_id,auth.uid(),'member',p_user_id,'remove',array['user_id'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.remove_trip_member(uuid,uuid,uuid) from public; grant execute on function public.remove_trip_member(uuid,uuid,uuid) to authenticated;
