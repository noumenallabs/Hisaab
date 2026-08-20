-- Phase 1: Identity + DB integrity hardening (forward migration)
-- Covers §5.1, §5.2, §5.7, §3.1-3.2, P0 #1, #2, #4

-- 5.1 Remove unsafe admin bootstrap
drop trigger if exists trg_maybe_promote_first_admin on public.profiles;
drop function if exists public.maybe_promote_first_admin();
-- Keep existing admins, but ensure future inserts are not auto-promoted (default false remains)
-- Revoke anon access to is_platform_admin — authenticated may query own status only via RLS, not direct anon call
revoke all on function public.is_platform_admin(uuid) from public;
revoke all on function public.is_platform_admin(uuid) from anon;
grant execute on function public.is_platform_admin(uuid) to authenticated;
-- Document manual bootstrap (outside client, service_role):
-- psql "service_role" -c "update public.profiles set is_platform_admin=true where email='admin@example.com';"
-- No VITE_ADMIN_EMAILS client authority — app must not read it (removed in app code separately)

-- 5.2 Fix invite joining — type bug + redaction + idempotency
-- Fix v_trip type: was uuid but selected status (trip_status enum). Correct to proper flow.
create or replace function public.join_trip_by_code(p_code text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_invite public.trip_invites%rowtype; v_status public.trip_status; v_request uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_invite from public.trip_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if v_invite.revoked_at is not null then raise exception 'INVITE_INVALID'; end if;
  if v_invite.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;
  select status into v_status from public.trips where id = v_invite.trip_id;
  if v_status = 'archived' then raise exception 'TRIP_ARCHIVED'; end if;
  if exists (select 1 from public.trip_members where trip_id = v_invite.trip_id and user_id = auth.uid()) then return v_invite.trip_id; end if;
  insert into public.trip_members (trip_id, user_id, invited_by) values (v_invite.trip_id, auth.uid(), v_invite.created_by);
  update public.trip_invites set use_count = use_count + 1 where id = v_invite.id;
  -- Redacted audit: store invite ID + suffix, not raw code
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_invite.trip_id, auth.uid(), 'member', auth.uid(), 'join', jsonb_build_object('invite_id', v_invite.id, 'code_suffix', right(v_invite.code,4)), array['user_id'], v_request) on conflict do nothing;
  return v_invite.trip_id;
end $$;
revoke all on function public.join_trip_by_code(text) from public;
grant execute on function public.join_trip_by_code(text) to authenticated;

-- Harden anon invite preview: only expose limited metadata, not raw membership
-- resolve_invite_code already limited to anon; keep but ensure it does not leak use_count
create or replace function public.resolve_invite_code(p_code text)
returns table (trip_id uuid, trip_name text, destination text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.name, t.destination from public.trip_invites i join public.trips t on t.id = i.trip_id
  where i.code = upper(trim(p_code)) and i.revoked_at is null and i.expires_at > now() and (i.max_uses is null or i.use_count < i.max_uses) and t.status <> 'archived'
  limit 1;
$$;
revoke all on function public.resolve_invite_code(text) from public;
grant execute on function public.resolve_invite_code(text) to anon, authenticated;

-- 5.7 Make audit append-only — reject UPDATE/DELETE on audit_logs for all roles including owners
create or replace function public.reject_audit_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'AUDIT_IMMUTABLE: audit_logs is append-only';
  return null;
end $$;
drop trigger if exists trg_audit_no_update on public.audit_logs;
create trigger trg_audit_no_update before update on public.audit_logs for each row execute function public.reject_audit_mutation();
drop trigger if exists trg_audit_no_delete on public.audit_logs;
create trigger trg_audit_no_delete before delete on public.audit_logs for each row execute function public.reject_audit_mutation();
-- Revoke direct mutation grants (RLS already restricts, but DB owner still could via trigger bypass; trigger covers it)
revoke update, delete on public.audit_logs from public, authenticated, anon;

-- Fix create_trip_invite audit redaction (was storing raw invite_code)
create or replace function public.create_trip_invite(p_trip_id uuid, p_expires_in_days int default 30, p_max_uses int default null)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text; v_id uuid; v_exp timestamptz;
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  if (select status from public.trips where id = p_trip_id) = 'archived' then raise exception 'TRIP_ARCHIVED'; end if;
  v_code := public.generate_invite_code();
  v_exp := now() + (p_expires_in_days || ' days')::interval;
  insert into public.trip_invites (trip_id, code, created_by, expires_at, max_uses) values (p_trip_id, v_code, auth.uid(), v_exp, p_max_uses) returning id, code, expires_at into v_id, v_code, v_exp;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'create', jsonb_build_object('invite_id', v_id, 'code_suffix', right(v_code,4)), array['invite_code'], gen_random_uuid()) on conflict do nothing;
  return query select v_id, v_code, v_exp;
end $$;
revoke all on function public.create_trip_invite(uuid, int, int) from public;
grant execute on function public.create_trip_invite(uuid, int, int) to authenticated;
