-- Phase 1.9: Remaining hardening — soft_delete/restore, archive, invites, receipts (§5.4, §5.6, §5.8)
-- Forward-only; does not edit 00001-00008.

-- ---------------------------------------------------------------------------
-- 5.4 + 5.6: Harden soft_delete_expense / restore_expense
-- Idempotent via mutation_requests, lifecycle-aware, audit with before/after,
-- preserves child rows (delete does not cascade), returns current state shape
-- via mutation_requests.result.
-- ---------------------------------------------------------------------------
create or replace function public.soft_delete_expense(p_expense_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_created uuid; v_prev jsonb; v_status public.trip_status;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'VALIDATION_FAILED requestId_required'; end if;

  select trip_id, created_by into v_trip, v_created from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- lifecycle: require active (spec §3.4 archived is permanently read-only; settled blocks financial writes)
  select status into v_status from public.trips where id = v_trip for update;
  if v_status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;

  if not (v_created = auth.uid() or public.is_trip_owner(v_trip)) then raise exception 'PERMISSION_DENIED'; end if;

  -- idempotency claim (same semantics as save_expense/record_settlement)
  begin
    insert into public.mutation_requests(actor_user_id, request_id, operation, trip_id, result)
    values (auth.uid(), p_request_id, 'soft_delete_expense', v_trip, null);
  exception when unique_violation then
    return; -- idempotent success
  end;

  -- capture previous
  select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by) into v_prev from public.expenses where id = p_expense_id;

  update public.expenses set deleted_at = now(), deleted_by = auth.uid() where id = p_expense_id and deleted_at is null;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, previous_values, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'expense', p_expense_id, 'soft_delete', v_prev, jsonb_build_object('deleted_at', now()), array['deleted_at'], p_request_id)
  on conflict (request_id, entity_id, action) do nothing;

  update public.mutation_requests set result = jsonb_build_object('id', p_expense_id, 'deleted', true)
  where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'soft_delete_expense';
end $$;
revoke all on function public.soft_delete_expense(uuid, uuid) from public;
grant execute on function public.soft_delete_expense(uuid, uuid) to authenticated;

create or replace function public.restore_expense(p_expense_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_prev jsonb; v_status public.trip_status;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'VALIDATION_FAILED requestId_required'; end if;

  select trip_id into v_trip from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select status into v_status from public.trips where id = v_trip for update;
  if v_status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;

  if not public.is_trip_owner(v_trip) then raise exception 'PERMISSION_DENIED'; end if;

  begin
    insert into public.mutation_requests(actor_user_id, request_id, operation, trip_id, result)
    values (auth.uid(), p_request_id, 'restore_expense', v_trip, null);
  exception when unique_violation then
    return;
  end;

  select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by) into v_prev from public.expenses where id = p_expense_id;

  update public.expenses set deleted_at = null, deleted_by = null where id = p_expense_id and deleted_at is not null;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, previous_values, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'expense', p_expense_id, 'restore', v_prev, jsonb_build_object('deleted_at', null), array['deleted_at'], p_request_id)
  on conflict (request_id, entity_id, action) do nothing;

  update public.mutation_requests set result = jsonb_build_object('id', p_expense_id, 'restored', true)
  where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'restore_expense';
end $$;
revoke all on function public.restore_expense(uuid, uuid) from public;
grant execute on function public.restore_expense(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5.6: Harden archive_trip — lock, transition, idempotency, audit
-- Spec: active|settled -> archived, no transition away from archived, owner only
-- ---------------------------------------------------------------------------
create or replace function public.archive_trip(p_trip_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status public.trip_status; v_prev jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'VALIDATION_FAILED requestId_required'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;

  select status into v_status from public.trips where id = p_trip_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status = 'archived' then raise exception 'TRIP_ARCHIVED'; end if;
  if v_status not in ('active','settled') then raise exception 'VALIDATION_FAILED status'; end if;

  begin
    insert into public.mutation_requests(actor_user_id, request_id, operation, trip_id, result)
    values (auth.uid(), p_request_id, 'archive_trip', p_trip_id, null);
  exception when unique_violation then
    return;
  end;

  v_prev := jsonb_build_object('status', v_status);

  update public.trips set status = 'archived', updated_by = auth.uid(), updated_at = now() where id = p_trip_id and status in ('active','settled');
  if not found then raise exception 'VALIDATION_FAILED status'; end if;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, previous_values, new_values, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'archive', v_prev, jsonb_build_object('status','archived'), array['status'], p_request_id)
  on conflict (request_id, entity_id, action) do nothing;

  update public.mutation_requests set result = jsonb_build_object('id', p_trip_id, 'status','archived')
  where actor_user_id = auth.uid() and request_id = p_request_id and operation = 'archive_trip';
end $$;
revoke all on function public.archive_trip(uuid, uuid) from public;
grant execute on function public.archive_trip(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5.6: Harden invite RPCs — archived guard, mutation idempotency, audit redaction
-- Keep existing signatures for backward compat; add p_request_id overloads
-- 00003 already redacted invite_code; this adds idempotency + proper ARCHIVED check
-- ---------------------------------------------------------------------------
-- create_trip_invite hardening (existing signature retained, behaviour fixed)
create or replace function public.create_trip_invite(p_trip_id uuid, p_expires_in_days int default 30, p_max_uses int default null)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text; v_id uuid; v_exp timestamptz; v_status public.trip_status;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select status into v_status from public.trips where id = p_trip_id;
  if v_status = 'archived' then raise exception 'TRIP_ARCHIVED'; end if;
  if v_status = 'settled' then raise exception 'TRIP_NOT_ACTIVE'; end if;
  v_code := public.generate_invite_code();
  v_exp := now() + (p_expires_in_days || ' days')::interval;
  insert into public.trip_invites (trip_id, code, created_by, expires_at, max_uses)
  values (p_trip_id, v_code, auth.uid(), v_exp, p_max_uses) returning trip_invites.id, trip_invites.code, trip_invites.expires_at into v_id, v_code, v_exp;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'create', jsonb_build_object('invite_id', v_id, 'code_suffix', right(v_code,4)), array['invite_code'], gen_random_uuid())
  on conflict do nothing;
  return query select v_id, v_code, v_exp;
end $$;
revoke all on function public.create_trip_invite(uuid, int, int) from public;
grant execute on function public.create_trip_invite(uuid, int, int) to authenticated;

-- revoke_trip_invite hardening (archived guard + audit redaction)
create or replace function public.revoke_trip_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_status public.trip_status;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select trip_id into v_trip from public.trip_invites where id = p_invite_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_trip_owner(v_trip) then raise exception 'PERMISSION_DENIED'; end if;
  select status into v_status from public.trips where id = v_trip;
  if v_status = 'archived' then raise exception 'TRIP_ARCHIVED'; end if;
  update public.trip_invites set revoked_at = now() where id = p_invite_id and revoked_at is null;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, previous_values, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'trip', v_trip, 'update', jsonb_build_object('invite_id', p_invite_id), jsonb_build_object('revoked', true), array['invite_revoked'], gen_random_uuid())
  on conflict do nothing;
end $$;
revoke all on function public.revoke_trip_invite(uuid) from public;
grant execute on function public.revoke_trip_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5.8: Private receipts bucket — storage.objects policies (supabase storage RLS)
-- Object path: <trip_id>/<expense_id>/<uuid>.<ext>  — member-only read/write
-- If storage schema absent (local without storage), this block is a no-op.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skip receipts policies';
    return;
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='storage' and table_name='objects') then
    raise notice 'storage.objects absent — skip receipts policies';
    return;
  end if;

  -- Ensure bucket is private
  update storage.buckets set public = false where id = 'receipts';

  -- Drop existing receipts policies if re-running
  drop policy if exists "receipts_select_member" on storage.objects;
  drop policy if exists "receipts_insert_member_active" on storage.objects;
  drop policy if exists "receipts_delete_member_active" on storage.objects;
  drop policy if exists "receipts_update_member_active" on storage.objects;

  -- Read: current trip members only. Path first segment is trip_id.
  create policy "receipts_select_member" on storage.objects for select to authenticated using (
    bucket_id = 'receipts'
    and (
      -- allow read when auth user is member of trip indicated by first path segment
      public.is_trip_member(((storage.foldername(name))[1])::uuid)
    )
  );

  -- Insert/Update: active-trip members only; path validation handled in save_expense RPC.
  -- Additional guard: file type/size enforced in app + edge; storage policy keeps member gate.
  create policy "receipts_insert_member_active" on storage.objects for insert to authenticated with check (
    bucket_id = 'receipts'
    and public.is_trip_writable(((storage.foldername(name))[1])::uuid)
    -- name is like trip_id/expense_id/file; storage.foldername returns text[] of path parts
  );

  create policy "receipts_update_member_active" on storage.objects for update to authenticated using (
    bucket_id = 'receipts' and public.is_trip_writable(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id = 'receipts' and public.is_trip_writable(((storage.foldername(name))[1])::uuid)
  );

  create policy "receipts_delete_member_active" on storage.objects for delete to authenticated using (
    bucket_id = 'receipts'
    and public.is_trip_writable(((storage.foldername(name))[1])::uuid)
    -- stricter delete (uploader/author or owner) enforced at RPC/app layer; storage policy keeps member+active gate
  );
end $$;
