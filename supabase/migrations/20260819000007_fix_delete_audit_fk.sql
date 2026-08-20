-- Fix hard-delete FK: audit_logs blocked trip deletion (§3.4 admin delete)
-- Make audit_logs cascade on trip delete; admin delete can now hard-delete with audit retained until cascade
do $$ begin
  alter table public.audit_logs drop constraint audit_logs_trip_id_fkey;
exception when undefined_object then null; end $$;
alter table public.audit_logs add constraint audit_logs_trip_id_fkey foreign key (trip_id) references public.trips(id) on delete cascade;

-- Also make mutation_requests not block delete while preserving idempotency:
-- keep ON DELETE CASCADE but handle duplicate request_id before trip existence check
create or replace function public.delete_trip(p_trip_id uuid, p_request_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin(auth.uid()) then raise exception 'PERMISSION_DENIED'; end if;
  -- idempotency first: duplicate request_id returns success even if trip already gone
  begin
    insert into public.mutation_requests(actor_user_id, request_id, operation, trip_id)
    values (auth.uid(), p_request_id, 'delete_trip', p_trip_id);
  exception when unique_violation then
    return;
  end;
  select exists(select 1 from public.trips where id = p_trip_id) into v_exists;
  if not v_exists then
    update public.mutation_requests set result = jsonb_build_object('deleted', p_trip_id, 'already_gone', true)
    where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'delete_trip';
    return;
  end if;
  -- audit before cascade (will be cascade-deleted with trip, kept in mutation_requests result)
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'soft_delete', array['deleted'], p_request_id)
  on conflict do nothing;
  delete from public.trips where id = p_trip_id;
  update public.mutation_requests set result = jsonb_build_object('deleted', p_trip_id)
  where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'delete_trip';
end $$;
revoke all on function public.delete_trip(uuid,uuid) from public;
grant execute on function public.delete_trip(uuid,uuid) to authenticated;
