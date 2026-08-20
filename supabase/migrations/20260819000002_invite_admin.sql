-- Admin-only auth + invite-code as sign-in
-- Adds invite management RPCs and tightens profile admin check

-- Ensure is_platform_admin is the gate for admin sign-in (used by client)
create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = p_user_id and is_platform_admin = true);
$$;
revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated, anon;

-- List active invites for a trip (owner only)
create or replace function public.list_trip_invites(p_trip_id uuid)
returns table (id uuid, code text, created_at timestamptz, expires_at timestamptz, max_uses int, use_count int, revoked_at timestamptz, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, code, created_at, expires_at, max_uses, use_count, revoked_at,
         (revoked_at is null and expires_at > now() and (max_uses is null or use_count < max_uses)) as is_active
  from public.trip_invites where trip_id = p_trip_id and public.is_trip_owner(p_trip_id)
  order by created_at desc;
$$;
revoke all on function public.list_trip_invites(uuid) from public;
grant execute on function public.list_trip_invites(uuid) to authenticated;

-- Create a new invite for a trip (owner only, revokes previous active if desired via param)
create or replace function public.create_trip_invite(p_trip_id uuid, p_expires_in_days int default 30, p_max_uses int default null)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text; v_id uuid; v_exp timestamptz;
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED not owner'; end if;
  if not public.is_trip_writable(p_trip_id) and (select status from public.trips where id = p_trip_id) = 'archived' then raise exception 'TRIP_ARCHIVED'; end if;
  v_code := public.generate_invite_code();
  v_exp := now() + (p_expires_in_days || ' days')::interval;
  insert into public.trip_invites (trip_id, code, created_by, expires_at, max_uses) values (p_trip_id, v_code, auth.uid(), v_exp, p_max_uses) returning id, code, expires_at into v_id, v_code, v_exp;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'create', jsonb_build_object('invite_code', v_code), array['invite_code'], gen_random_uuid()) on conflict do nothing;
  return query select v_id, v_code, v_exp;
end $$;
revoke all on function public.create_trip_invite(uuid, int, int) from public;
grant execute on function public.create_trip_invite(uuid, int, int) to authenticated;

-- Revoke an invite (owner only)
create or replace function public.revoke_trip_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.trip_invites where id = p_invite_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_trip_owner(v_trip) then raise exception 'PERMISSION_DENIED'; end if;
  update public.trip_invites set revoked_at = now() where id = p_invite_id and revoked_at is null;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (v_trip, auth.uid(), 'trip', v_trip, 'update', array['invite_revoked'], gen_random_uuid()) on conflict do nothing;
end $$;
revoke all on function public.revoke_trip_invite(uuid) from public;
grant execute on function public.revoke_trip_invite(uuid) to authenticated;

-- Allow anon to validate invite code existence without leaking trip data (for invite-as-signin flow)
-- This function is callable by anon to resolve a code to trip metadata (name only) for UI
create or replace function public.resolve_invite_code(p_code text)
returns table (trip_id uuid, trip_name text, destination text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.name, t.destination from public.trip_invites i join public.trips t on t.id = i.trip_id
  where i.code = upper(trim(p_code)) and i.revoked_at is null and i.expires_at > now() and (i.max_uses is null or i.use_count < i.max_uses)
  limit 1;
$$;
revoke all on function public.resolve_invite_code(text) from public;
grant execute on function public.resolve_invite_code(text) to anon, authenticated;

-- Tighten sign-up: optional trigger to auto-mark first user as admin if no admins exist (for bootstrap)
create or replace function public.maybe_promote_first_admin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.profiles where is_platform_admin = true) then
    new.is_platform_admin := true;
  end if;
  return new;
end $$;
drop trigger if exists trg_maybe_promote_first_admin on public.profiles;
create trigger trg_maybe_promote_first_admin before insert on public.profiles for each row execute function public.maybe_promote_first_admin();
