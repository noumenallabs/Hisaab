-- Allow admin hard-delete to cascade audit_logs despite append-only trigger
-- §5.7 was too strict: ON DELETE CASCADE from trips → audit_logs fires trg_audit_no_delete → AUDIT_IMMUTABLE
-- Keep append-only for direct UPDATE/DELETE, but allow cascade when parent trip is gone or when admin delete_trip sets bypass

create or replace function public.reject_audit_mutation() returns trigger language plpgsql as $$
begin
  -- allow cascade delete when parent trip no longer exists (trip hard-delete)
  if TG_OP = 'DELETE' then
    if not exists (select 1 from public.trips where id = OLD.trip_id) then
      return OLD;
    end if;
    -- also allow when delete_trip sets session var app.bypass_audit = 'on'
    if current_setting('app.bypass_audit', true) = 'on' then
      return OLD;
    end if;
  end if;
  raise exception 'AUDIT_IMMUTABLE: audit_logs is append-only';
  return null;
end $$;

-- Recreate triggers (keep BEFORE UPDATE/DELETE)
drop trigger if exists trg_audit_no_update on public.audit_logs;
create trigger trg_audit_no_update before update on public.audit_logs for each row execute function public.reject_audit_mutation();
drop trigger if exists trg_audit_no_delete on public.audit_logs;
create trigger trg_audit_no_delete before delete on public.audit_logs for each row execute function public.reject_audit_mutation();

-- Update delete_trip to bypass trigger explicitly during cascade
create or replace function public.delete_trip(p_trip_id uuid, p_request_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin(auth.uid()) then raise exception 'PERMISSION_DENIED'; end if;
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
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'soft_delete', array['deleted'], p_request_id)
  on conflict do nothing;
  -- allow cascade to delete audit rows
  perform set_config('app.bypass_audit', 'on', true);
  delete from public.trips where id = p_trip_id;
  perform set_config('app.bypass_audit', 'off', true);
  update public.mutation_requests set result = jsonb_build_object('deleted', p_trip_id)
  where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'delete_trip';
end $$;
revoke all on function public.delete_trip(uuid,uuid) from public;
grant execute on function public.delete_trip(uuid,uuid) to authenticated;
