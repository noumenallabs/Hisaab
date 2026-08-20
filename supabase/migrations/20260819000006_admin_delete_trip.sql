-- Admin-only trip deletion (§3.2 — only platform admin, idempotent via mutation_requests)
create or replace function public.delete_trip(p_trip_id uuid, p_request_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin(auth.uid()) then raise exception 'PERMISSION_DENIED'; end if;
  select exists(select 1 from public.trips where id = p_trip_id) into v_exists;
  if not v_exists then raise exception 'NOT_FOUND'; end if;
  -- idempotency: claim (admin, request_id, delete_trip)
  begin
    insert into public.mutation_requests(actor_user_id, request_id, operation, trip_id)
    values (auth.uid(), p_request_id, 'delete_trip', p_trip_id);
  exception when unique_violation then
    -- already processed → idempotent success (trip may already be gone)
    return;
  end;
  -- audit before delete (keep after hard delete via mutation_requests)
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'soft_delete', array['deleted'], p_request_id)
  on conflict do nothing;
  -- hard delete — cascades via FKs (trip_members, expenses, settlements, invites); storage receipts orphan cleanup via scheduled job
  delete from public.trips where id = p_trip_id;
  update public.mutation_requests set result = jsonb_build_object('deleted', p_trip_id)
  where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'delete_trip';
end $$;
revoke all on function public.delete_trip(uuid,uuid) from public;
grant execute on function public.delete_trip(uuid,uuid) to authenticated;
