-- Migration 20260820000019: Support Shadow Members & Auto-Claiming on Sign-Up

-- 1. Drop the foreign key constraint from profiles to auth.users to allow shadow/placeholder profiles
do $$
declare
  v_con text;
begin
  for v_con in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_type = 'FOREIGN KEY'
  loop
    execute 'alter table public.profiles drop constraint if exists ' || quote_ident(v_con);
  end loop;
end $$;

-- 2. Enhanced handle_new_user() trigger: Automatically claims shadow profile and merges memberships/expenses
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing_id uuid;
  v_user_name text;
begin
  v_user_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  -- Check if a shadow profile with this email already exists
  select id into v_existing_id from public.profiles where lower(email) = lower(new.email) limit 1;

  if v_existing_id is not null and v_existing_id <> new.id then
    -- Reassign all references from shadow profile to actual auth user ID
    -- Temporarily disable foreign key triggers if necessary or update children
    update public.trip_members set user_id = new.id where user_id = v_existing_id;
    update public.expense_payers set user_id = new.id where user_id = v_existing_id;
    update public.expense_splits set user_id = new.id where user_id = v_existing_id;
    update public.settlements set from_user_id = new.id where from_user_id = v_existing_id;
    update public.settlements set to_user_id = new.id where to_user_id = v_existing_id;
    update public.audit_logs set actor_user_id = new.id where actor_user_id = v_existing_id;
    update public.audit_logs set entity_id = new.id where entity_type = 'member' and entity_id = v_existing_id;

    -- Delete the placeholder shadow profile
    delete from public.profiles where id = v_existing_id;

    -- Insert new authoritative profile
    insert into public.profiles (id, name, email, avatar_url, is_platform_admin)
    values (
      new.id,
      v_user_name,
      new.email,
      new.raw_user_meta_data->>'avatar_url',
      false
    )
    on conflict (id) do update set
      email = excluded.email,
      name = case when profiles.name is null or profiles.name = '' then excluded.name else profiles.name end,
      avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);
  else
    insert into public.profiles (id, name, email, avatar_url, is_platform_admin)
    values (
      new.id,
      v_user_name,
      new.email,
      new.raw_user_meta_data->>'avatar_url',
      false
    )
    on conflict (id) do update set
      email = excluded.email,
      name = case when profiles.name is null or profiles.name = '' then excluded.name else profiles.name end,
      avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);
  end if;

  return new;
end $$;

-- 3. Update add_trip_member to create a shadow profile if user has not registered yet
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
  select id, name into v_user_id, v_user_name from public.profiles where lower(email) = v_clean_email limit 1;

  -- If not registered yet, create a shadow profile!
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    v_user_name := split_part(v_clean_email, '@', 1);
    insert into public.profiles (id, name, email, is_platform_admin)
    values (v_user_id, v_user_name, v_clean_email, false);
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

-- 4. Update create_trip to also support shadow profiles for invited emails
create or replace function public.create_trip(
  p_name text,
  p_destination text,
  p_start_date date,
  p_end_date date,
  p_base_currency char(3),
  p_invitee_emails text[] default '{}'
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip_id uuid;
  v_email text;
  v_clean_email text;
  v_member_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'VALIDATION_FAILED name'; end if;
  if length(p_destination) > 120 then raise exception 'VALIDATION_FAILED destination'; end if;
  if p_end_date < p_start_date then raise exception 'VALIDATION_FAILED dates'; end if;
  if not exists (select 1 from public.currency_metadata where code = upper(p_base_currency)) then
    raise exception 'VALIDATION_FAILED currency';
  end if;

  insert into public.trips (name, destination, start_date, end_date, base_currency, status, created_by, updated_by)
  values (trim(p_name), trim(p_destination), p_start_date, p_end_date, upper(p_base_currency), 'active', auth.uid(), auth.uid())
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'owner');

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_trip_id, auth.uid(), 'trip', v_trip_id, 'create', jsonb_build_object('name', p_name, 'currency', p_base_currency), array['name','base_currency'], gen_random_uuid());

  if p_invitee_emails is not null then
    foreach v_email in array p_invitee_emails loop
      v_clean_email := lower(trim(v_email));
      if v_clean_email <> '' and v_clean_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
        select id into v_member_id from public.profiles where lower(email) = v_clean_email;
        if v_member_id is null then
          v_member_id := gen_random_uuid();
          insert into public.profiles (id, name, email, is_platform_admin)
          values (v_member_id, split_part(v_clean_email, '@', 1), v_clean_email, false);
        end if;
        if v_member_id <> auth.uid() then
          insert into public.trip_members (trip_id, user_id, role)
          values (v_trip_id, v_member_id, 'member')
          on conflict do nothing;
        end if;
      end if;
    end loop;
  end if;

  return v_trip_id;
end $$;

revoke all on function public.create_trip(text, text, date, date, char, text[]) from public;
grant execute on function public.create_trip(text, text, date, date, char, text[]) to authenticated;

revoke all on function public.add_trip_member(uuid, text, public.trip_role, uuid) from public;
grant execute on function public.add_trip_member(uuid, text, public.trip_role, uuid) to authenticated;
