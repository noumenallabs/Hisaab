-- Migration 20260820000018: Add Direct Member Addition RPC for Trip Admins/Owners

create or replace function public.add_trip_member(
  p_trip_id uuid,
  p_email text,
  p_role public.trip_role default 'member',
  p_request_id uuid default gen_random_uuid()
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_clean_email text;
  v_user_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id) or public.is_platform_admin(auth.uid())) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.is_trip_writable(p_trip_id) then
    raise exception 'TRIP_NOT_ACTIVE';
  end if;

  v_clean_email := lower(trim(p_email));
  if v_clean_email = '' or v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'VALIDATION_FAILED invalid_email';
  end if;

  -- Lookup profile by email
  select id, name into v_user_id, v_user_name from public.profiles where lower(email) = v_clean_email;
  if v_user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- Check if already a member of the trip
  if public.is_trip_member(p_trip_id, v_user_id) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (p_trip_id, v_user_id, coalesce(p_role, 'member'));

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (
    p_trip_id,
    auth.uid(),
    'member',
    v_user_id,
    'join',
    jsonb_build_object('email', v_clean_email, 'role', coalesce(p_role, 'member'), 'added_by', auth.uid()),
    array['user_id', 'role'],
    p_request_id
  ) on conflict do nothing;

  return jsonb_build_object('userId', v_user_id, 'name', v_user_name, 'email', v_clean_email);
end $$;

revoke all on function public.add_trip_member(uuid, text, public.trip_role, uuid) from public;
grant execute on function public.add_trip_member(uuid, text, public.trip_role, uuid) to authenticated;
