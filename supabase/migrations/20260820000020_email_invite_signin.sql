-- 20260820000020_email_invite_signin.sql
-- Allows joining a trip seamlessly using an email and active invite code

create or replace function public.join_trip_with_email_and_code(
  p_email text,
  p_code text,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.trip_invites%rowtype;
  v_trip public.trips%rowtype;
  v_user_id uuid;
  v_email text;
  v_name text;
  v_caller_id uuid := auth.uid();
begin
  v_email := lower(trim(p_email));
  if v_email is null or v_email = '' or v_email not like '%@%.%' then
    raise exception 'INVALID_EMAIL';
  end if;

  select * into v_invite from public.trip_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_invite.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  if v_invite.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;

  select * into v_trip from public.trips where id = v_invite.trip_id;
  if v_trip.status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;

  -- Check if a profile exists for this email
  select id into v_user_id from public.profiles where lower(email) = v_email;

  if v_user_id is null then
    if v_caller_id is not null then
      v_user_id := v_caller_id;
    else
      v_user_id := gen_random_uuid();
    end if;

    v_name := coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1), 'Traveler');

    insert into public.profiles (id, email, name)
    values (v_user_id, v_email, v_name)
    on conflict (id) do update set
      name = coalesce(public.profiles.name, excluded.name),
      email = coalesce(public.profiles.email, excluded.email);
  else
    -- If p_name was provided and existing name is default, update name
    if p_name is not null and trim(p_name) <> '' then
      update public.profiles set name = trim(p_name) where id = v_user_id and (name is null or name = split_part(v_email, '@', 1));
    end if;
  end if;

  -- Add to trip members if not already added
  insert into public.trip_members (trip_id, user_id, role)
  values (v_invite.trip_id, v_user_id, 'member')
  on conflict (trip_id, user_id) do nothing;

  -- Increment invite use count
  update public.trip_invites set use_count = use_count + 1 where id = v_invite.id;

  -- Audit log
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_invite.trip_id, v_user_id, 'member', v_user_id, 'join', jsonb_build_object('code', p_code, 'email', v_email), array['user_id'], gen_random_uuid());

  return jsonb_build_object(
    'trip_id', v_trip.id,
    'user_id', v_user_id,
    'email', v_email,
    'name', (select name from public.profiles where id = v_user_id),
    'trip_name', v_trip.name,
    'destination', v_trip.destination,
    'base_currency', v_trip.base_currency
  );
end $$;

revoke all on function public.join_trip_with_email_and_code(text, text, text) from public;
grant execute on function public.join_trip_with_email_and_code(text, text, text) to anon, authenticated;
