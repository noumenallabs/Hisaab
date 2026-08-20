-- 20260820000021_fix_handle_new_user.sql
-- Fixes "Database error granting user" by making handle_new_user completely robust and safe

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing_id uuid;
  v_user_name text;
  v_email text;
begin
  v_email := coalesce(new.email, '');
  v_user_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(split_part(v_email, '@', 1)), ''),
    'Traveler'
  );

  -- Only look for shadow profile if email is present
  if v_email <> '' then
    select id into v_existing_id from public.profiles where lower(email) = lower(v_email) and id <> new.id limit 1;
  end if;

  if v_existing_id is not null then
    -- Merge shadow member records safely handling potential duplicates
    -- 1. trip_members: delete any conflicts first, then update
    delete from public.trip_members tm_old
    where tm_old.user_id = v_existing_id
      and exists (
        select 1 from public.trip_members tm_new
        where tm_new.trip_id = tm_old.trip_id and tm_new.user_id = new.id
      );
    update public.trip_members set user_id = new.id where user_id = v_existing_id;

    -- 2. expense_payers
    delete from public.expense_payers ep_old
    where ep_old.user_id = v_existing_id
      and exists (
        select 1 from public.expense_payers ep_new
        where ep_new.expense_id = ep_old.expense_id and ep_new.user_id = new.id
      );
    update public.expense_payers set user_id = new.id where user_id = v_existing_id;

    -- 3. expense_splits
    delete from public.expense_splits es_old
    where es_old.user_id = v_existing_id
      and exists (
        select 1 from public.expense_splits es_new
        where es_new.expense_id = es_old.expense_id and es_new.user_id = new.id
      );
    update public.expense_splits set user_id = new.id where user_id = v_existing_id;

    -- 4. settlements
    update public.settlements set from_user_id = new.id where from_user_id = v_existing_id;
    update public.settlements set to_user_id = new.id where to_user_id = v_existing_id;

    -- 5. audit_logs
    update public.audit_logs set actor_user_id = new.id where actor_user_id = v_existing_id;
    update public.audit_logs set entity_id = new.id where entity_type = 'member' and entity_id = v_existing_id;

    -- 6. delete old shadow profile
    delete from public.profiles where id = v_existing_id;
  end if;

  -- Upsert the profile for new.id WITHOUT overwriting is_platform_admin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    v_user_name,
    v_email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    name = case when profiles.name is null or profiles.name = '' or profiles.name = split_part(excluded.email, '@', 1) then excluded.name else profiles.name end,
    avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);

  return new;
exception
  when others then
    -- Log warning and never crash GoTrue / auth.users trigger
    raise warning 'handle_new_user failed: %', SQLERRM;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();
