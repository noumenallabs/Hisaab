-- ===========================================================================
-- Hissaab — Consolidated Production Schema & RPCs
-- Single Source of Truth for Postgres / Supabase
-- ===========================================================================

-- 1. Extensions
create extension if not exists "pgcrypto";

-- 2. Enums
do $$ begin
  create type public.trip_role as enum ('owner', 'editor', 'viewer', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.trip_status as enum ('active', 'settled', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.expense_category as enum (
    'food', 'transport', 'accommodation', 'tickets', 'shopping', 'other'
  );
exception when duplicate_object then null; end $$;

-- 3. Utility Triggers
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 4. Tables & Indexes

-- 4.1 profiles (Supports registered users and shadow members before registration)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  email text not null,
  avatar_url text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_email on public.profiles(email);

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
    select p.id into v_existing_id from public.profiles p where lower(p.email) = lower(v_email) and p.id <> new.id limit 1;
  end if;

  if v_existing_id is not null then
    -- Merge shadow member records safely handling potential duplicates
    delete from public.trip_members tm_old
    where tm_old.user_id = v_existing_id
      and exists (
        select 1 from public.trip_members tm_new
        where tm_new.trip_id = tm_old.trip_id and tm_new.user_id = new.id
      );
    update public.trip_members set user_id = new.id where user_id = v_existing_id;

    delete from public.expense_payers ep_old
    where ep_old.user_id = v_existing_id
      and exists (
        select 1 from public.expense_payers ep_new
        where ep_new.expense_id = ep_old.expense_id and ep_new.user_id = new.id
      );
    update public.expense_payers set user_id = new.id where user_id = v_existing_id;

    delete from public.expense_splits es_old
    where es_old.user_id = v_existing_id
      and exists (
        select 1 from public.expense_splits es_new
        where es_new.expense_id = es_old.expense_id and es_new.user_id = new.id
      );
    update public.expense_splits set user_id = new.id where user_id = v_existing_id;

    update public.settlements set from_user_id = new.id where from_user_id = v_existing_id;
    update public.settlements set to_user_id = new.id where to_user_id = v_existing_id;

    update public.audit_logs set actor_user_id = new.id where actor_user_id = v_existing_id;
    update public.audit_logs set entity_id = new.id where entity_type = 'member' and entity_id = v_existing_id;

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
    raise warning 'handle_new_user failed: %', SQLERRM;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

-- 4.2 currency_metadata
create table if not exists public.currency_metadata (
  code char(3) primary key,
  decimals smallint not null check (decimals between 0 and 4),
  symbol text not null
);

insert into public.currency_metadata (code, decimals, symbol) values
  ('INR', 2, '₹'),
  ('USD', 2, '$'),
  ('EUR', 2, '€'),
  ('GBP', 2, '£'),
  ('AED', 2, 'د.إ'),
  ('SGD', 2, 'S$'),
  ('JPY', 0, '¥'),
  ('THB', 2, '฿'),
  ('AUD', 2, 'A$'),
  ('CAD', 2, 'C$')
on conflict (code) do update set decimals = excluded.decimals, symbol = excluded.symbol;

-- 4.3 trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  destination text not null default '' check (length(destination) <= 120),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  base_currency char(3) not null default 'INR' references public.currency_metadata(code),
  status public.trip_status not null default 'active',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_trips_created_by on public.trips(created_by);
create index if not exists idx_trips_status on public.trips(status);

-- 4.4 trip_members
create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.trip_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index if not exists idx_trip_members_trip on public.trip_members(trip_id);
create index if not exists idx_trip_members_user on public.trip_members(user_id);

-- 4.5 trip_invites
create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  code text not null unique check (length(code) between 6 and 32),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses int check (max_uses is null or max_uses > 0),
  use_count int not null default 0 check (use_count >= 0),
  revoked_at timestamptz
);
create index if not exists idx_trip_invites_trip on public.trip_invites(trip_id);
create index if not exists idx_trip_invites_code on public.trip_invites(code);

-- 4.6 expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 160),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null references public.currency_metadata(code),
  category public.expense_category not null,
  expense_date date not null,
  notes text check (notes is null or length(notes) <= 2000),
  receipt_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz
);
create index if not exists idx_expenses_trip on public.expenses(trip_id);
create index if not exists idx_expenses_date on public.expenses(trip_id, expense_date desc);

-- 4.7 expense_payers
create table if not exists public.expense_payers (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_paid_minor bigint not null check (amount_paid_minor > 0),
  unique (expense_id, user_id)
);
create index if not exists idx_expense_payers_expense on public.expense_payers(expense_id);
create index if not exists idx_expense_payers_user on public.expense_payers(user_id);

-- 4.8 expense_splits
create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_owed_minor bigint not null check (amount_owed_minor >= 0),
  unique (expense_id, user_id)
);
create index if not exists idx_expense_splits_expense on public.expense_splits(expense_id);
create index if not exists idx_expense_splits_user on public.expense_splits(user_id);

-- 4.9 settlements
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  payment_method text not null default 'UPI',
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 500),
  settled_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz
);
create index if not exists idx_settlements_trip on public.settlements(trip_id);

-- 4.10 audit_logs
create table if not exists public.audit_logs (
  id bigserial primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create','update','soft_delete','restore','join','remove','role_change','settle','archive')),
  previous_values jsonb,
  new_values jsonb,
  changed_fields text[] not null default '{}',
  request_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_trip_created on public.audit_logs(trip_id, created_at desc, id desc);
create index if not exists idx_audit_request on public.audit_logs(request_id);

create or replace function public.reject_audit_mutation()
returns trigger language plpgsql as $$
begin
  if current_setting('app.bypass_audit', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'AUDIT_IMMUTABLE: audit_logs is append-only';
end $$;

drop trigger if exists trg_audit_no_update on public.audit_logs;
create trigger trg_audit_no_update before update on public.audit_logs
for each row execute function public.reject_audit_mutation();

drop trigger if exists trg_audit_no_delete on public.audit_logs;
create trigger trg_audit_no_delete before delete on public.audit_logs
for each row execute function public.reject_audit_mutation();

-- 4.11 mutation_requests (Idempotency Table)
create table if not exists public.mutation_requests (
  id bigserial primary key,
  actor_user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  operation text not null,
  trip_id uuid references public.trips(id) on delete cascade,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (actor_user_id, request_id, operation)
);
create index if not exists idx_mutation_requests_lookup on public.mutation_requests(actor_user_id, request_id, operation);

-- 5. Row Level Security (RLS) Policies
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.mutation_requests enable row level security;
alter table public.currency_metadata enable row level security;

-- 6. Helper Authorization Functions
create or replace function public.is_trip_member(p_trip_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id and tm.user_id = p_user_id
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id and tm.user_id = p_user_id and tm.role = 'owner'
  );
$$;

create or replace function public.is_trip_writable(p_trip_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.status = 'active'
  );
$$;

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select coalesce((
    select p.is_platform_admin from public.profiles p where p.id = p_user_id
  ), false);
$$;

-- RLS Policies
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated, anon using (true);

drop policy if exists "trips_select" on public.trips;
create policy "trips_select" on public.trips for select to authenticated using (public.is_trip_member(id));

drop policy if exists "trip_members_select" on public.trip_members;
create policy "trip_members_select" on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "trip_invites_select" on public.trip_invites;
create policy "trip_invites_select" on public.trip_invites for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "expense_payers_select" on public.expense_payers;
create policy "expense_payers_select" on public.expense_payers for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id))
);

drop policy if exists "expense_splits_select" on public.expense_splits;
create policy "expense_splits_select" on public.expense_splits for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id))
);

drop policy if exists "settlements_select" on public.settlements;
create policy "settlements_select" on public.settlements for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "audit_select" on public.audit_logs;
create policy "audit_select" on public.audit_logs for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "mutation_requests_select_own" on public.mutation_requests;
create policy "mutation_requests_select_own" on public.mutation_requests for select to authenticated using (actor_user_id = auth.uid());

drop policy if exists "currency_select_public" on public.currency_metadata;
create policy "currency_select_public" on public.currency_metadata for select to public using (true);

-- 7. Storage Bucket & Policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

create or replace function public.can_read_receipt(obj_name text)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select true;
$$;

create or replace function public.can_write_receipt(obj_name text)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select true;
$$;

drop policy if exists "receipts_select_members" on storage.objects;
create policy "receipts_select_members" on storage.objects for select to anon, authenticated
using (bucket_id = 'receipts');

drop policy if exists "receipts_insert_members" on storage.objects;
create policy "receipts_insert_members" on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'receipts'
  and name !~ '\.\.'
  and name ~ '^[^/]+/[^/]+/[^/]+\.(jpg|jpeg|png|webp|pdf)$'
);

drop policy if exists "receipts_delete_members" on storage.objects;
create policy "receipts_delete_members" on storage.objects for delete to anon, authenticated
using (bucket_id = 'receipts');

-- ===========================================================================
-- 8. Master Drop Block — Cleans all legacy/conflicting overloads
-- ===========================================================================
drop function if exists public.create_trip(text, text, date, date, char, text[]);
drop function if exists public.create_trip(text, text, date, date, char, text[], uuid);
drop function if exists public.create_trip_invite(uuid);
drop function if exists public.create_trip_invite(uuid, integer);
drop function if exists public.create_trip_invite(uuid, integer, integer);
drop function if exists public.create_trip_invite(uuid, integer, integer, uuid);
drop function if exists public.list_trip_invites(uuid);
drop function if exists public.list_trip_invites(uuid, uuid);
drop function if exists public.revoke_trip_invite(uuid);
drop function if exists public.revoke_trip_invite(uuid, uuid);
drop function if exists public.resolve_invite_code(text);
drop function if exists public.join_trip_by_code(text);
drop function if exists public.join_trip_by_code(text, uuid);
drop function if exists public.join_trip_with_email_and_code(text, text);
drop function if exists public.join_trip_with_email_and_code(text, text, text);
drop function if exists public.save_expense(jsonb);
drop function if exists public.save_expense(jsonb, uuid);
drop function if exists public.soft_delete_expense(uuid, uuid);
drop function if exists public.soft_delete_expense(uuid, uuid, uuid);
drop function if exists public.restore_expense(uuid, uuid);
drop function if exists public.restore_expense(uuid, uuid, uuid);
drop function if exists public.get_trip_balances(uuid);
drop function if exists public.get_trip_balances(uuid, uuid);
drop function if exists public.record_settlement(jsonb);
drop function if exists public.record_settlement(jsonb, uuid);
drop function if exists public.update_trip(uuid, jsonb, uuid);
drop function if exists public.update_trip(uuid, jsonb, uuid, uuid);
drop function if exists public.change_member_role(uuid, uuid, public.trip_role, uuid);
drop function if exists public.change_member_role(uuid, uuid, public.trip_role, uuid, uuid);
drop function if exists public.remove_trip_member(uuid, uuid, uuid);
drop function if exists public.remove_trip_member(uuid, uuid, uuid, uuid);
drop function if exists public.mark_trip_settled(uuid, uuid);
drop function if exists public.mark_trip_settled(uuid, uuid, uuid);
drop function if exists public.reopen_trip(uuid, uuid);
drop function if exists public.reopen_trip(uuid, uuid, uuid);
drop function if exists public.archive_trip(uuid, uuid);
drop function if exists public.archive_trip(uuid, uuid, uuid);
drop function if exists public.delete_trip(uuid, uuid);
drop function if exists public.delete_trip(uuid, uuid, uuid);
drop function if exists public.update_profile(text);
drop function if exists public.update_profile(text, uuid);
drop function if exists public.add_trip_member(uuid, text, public.trip_role, uuid);
drop function if exists public.add_trip_member(uuid, text, public.trip_role, uuid, uuid);
drop function if exists public.get_trip_details(uuid);
drop function if exists public.get_trip_details(uuid, uuid);
drop function if exists public.get_trip_members_list(uuid);
drop function if exists public.get_trip_members_list(uuid, uuid);
drop function if exists public.get_trip_expenses_list(uuid);
drop function if exists public.get_trip_expenses_list(uuid, uuid);
drop function if exists public.get_trip_expenses_list(uuid, uuid, boolean);
drop function if exists public.get_user_trips(uuid);
drop function if exists public.get_trip_audit_logs(uuid, uuid, integer);
drop function if exists public.get_trip_audit_logs(uuid, uuid, integer, timestamptz, bigint);
drop function if exists public.is_platform_admin(uuid);

-- ===========================================================================
-- 9. Authoritative RPCs (Single Definitive Signatures)
-- ===========================================================================

-- 9.1 is_platform_admin
create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select coalesce((
    select p.is_platform_admin from public.profiles p where p.id = p_user_id
  ), false);
$$;

-- 9.2 create_trip
create or replace function public.create_trip(
  p_name text,
  p_destination text,
  p_start_date date,
  p_end_date date,
  p_base_currency char(3),
  p_invitee_emails text[] default '{}',
  p_user_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip_id uuid;
  v_email text;
  v_clean_email text;
  v_member_id uuid;
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'VALIDATION_FAILED name'; end if;
  if length(p_destination) > 120 then raise exception 'VALIDATION_FAILED destination'; end if;
  if p_end_date < p_start_date then raise exception 'VALIDATION_FAILED dates'; end if;
  if not exists (select 1 from public.currency_metadata cm where cm.code = upper(p_base_currency)) then
    raise exception 'VALIDATION_FAILED currency';
  end if;

  insert into public.trips (name, destination, start_date, end_date, base_currency, status, created_by, updated_by)
  values (trim(p_name), trim(p_destination), p_start_date, p_end_date, upper(p_base_currency), 'active', v_actor, v_actor)
  returning trips.id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, v_actor, 'owner');

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_trip_id, v_actor, 'trip', v_trip_id, 'create', jsonb_build_object('name', p_name, 'currency', p_base_currency), array['name','base_currency'], gen_random_uuid());

  if p_invitee_emails is not null then
    foreach v_email in array p_invitee_emails loop
      v_clean_email := lower(trim(v_email));
      if v_clean_email <> '' and v_clean_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
        select p.id into v_member_id from public.profiles p where lower(p.email) = v_clean_email limit 1;
        if v_member_id is null then
          v_member_id := gen_random_uuid();
          insert into public.profiles (id, name, email, is_platform_admin)
          values (v_member_id, split_part(v_clean_email, '@', 1), v_clean_email, false);
        end if;
        if v_member_id <> v_actor then
          insert into public.trip_members (trip_id, user_id, role)
          values (v_trip_id, v_member_id, 'member')
          on conflict do nothing;
        end if;
      end if;
    end loop;
  end if;

  return v_trip_id;
end $$;

-- 9.3 generate_invite_code
create or replace function public.generate_invite_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end $$;

-- 9.4 create_trip_invite
create or replace function public.create_trip_invite(
  p_trip_id uuid,
  p_expires_in_days int default 30,
  p_max_uses int default null,
  p_user_id uuid default null
)
returns table(id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text;
  v_invite_id uuid;
  v_expires timestamptz;
  v_actor uuid;
begin
  v_actor := coalesce(auth.uid(), p_user_id, (select t.created_by from public.trips t where t.id = p_trip_id));
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_member(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip_id and t.status = 'active') then
    raise exception 'TRIP_NOT_ACTIVE';
  end if;

  v_code := public.generate_invite_code();
  v_expires := now() + make_interval(days => coalesce(p_expires_in_days, 30));

  insert into public.trip_invites (trip_id, code, created_by, expires_at, max_uses)
  values (p_trip_id, v_code, v_actor, v_expires, p_max_uses)
  returning trip_invites.id into v_invite_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (p_trip_id, v_actor, 'trip', v_invite_id, 'create', jsonb_build_object('invite_code', v_code), array['invite_code'], gen_random_uuid());

  return query select v_invite_id, v_code, v_expires;
end $$;

-- 9.5 list_trip_invites
create or replace function public.list_trip_invites(p_trip_id uuid, p_user_id uuid default null)
returns table(
  id uuid,
  code text,
  created_at timestamptz,
  expires_at timestamptz,
  max_uses int,
  use_count int,
  revoked_at timestamptz,
  is_active boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_user_id, (select t.created_by from public.trips t where t.id = p_trip_id));
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_member(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  return query
  select
    i.id,
    i.code,
    i.created_at,
    i.expires_at,
    i.max_uses,
    i.use_count,
    i.revoked_at,
    (i.revoked_at is null and i.expires_at > now() and (i.max_uses is null or i.use_count < i.max_uses)) as is_active
  from public.trip_invites i
  where i.trip_id = p_trip_id
  order by i.created_at desc;
end $$;

-- 9.6 revoke_trip_invite
create or replace function public.revoke_trip_invite(p_invite_id uuid, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip_id uuid;
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  select i.trip_id into v_trip_id from public.trip_invites i where i.id = p_invite_id;
  if v_trip_id is null then raise exception 'NOT_FOUND'; end if;
  if v_actor is null then
    v_actor := (select t.created_by from public.trips t where t.id = v_trip_id);
  end if;
  if not (public.is_trip_owner(v_trip_id, v_actor) or public.is_platform_admin(v_actor) or exists (select 1 from public.trip_invites i where i.id = p_invite_id and i.created_by = v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.trip_invites set revoked_at = now() where id = p_invite_id and revoked_at is null;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (v_trip_id, coalesce(v_actor, auth.uid()), 'trip', p_invite_id, 'update', array['revoked_at'], gen_random_uuid());
end $$;

-- 9.7 resolve_invite_code
create or replace function public.resolve_invite_code(p_code text)
returns table(trip_id uuid, trip_name text, destination text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rec record;
begin
  select t.id, t.name, t.destination, i.revoked_at, i.expires_at, i.max_uses, i.use_count
  into v_rec
  from public.trip_invites i
  join public.trips t on t.id = i.trip_id
  where i.code = upper(trim(p_code)) and t.status = 'active';

  if v_rec.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_rec.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  if v_rec.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_rec.max_uses is not null and v_rec.use_count >= v_rec.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;

  return query select v_rec.id, v_rec.name, v_rec.destination;
end $$;

-- 9.8 join_trip_by_code
create or replace function public.join_trip_by_code(p_code text, p_user_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_invite public.trip_invites%rowtype;
  v_trip public.trips%rowtype;
  v_user uuid := coalesce(auth.uid(), p_user_id);
begin
  select * into v_invite from public.trip_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_invite.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  if v_invite.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;

  select * into v_trip from public.trips t where t.id = v_invite.trip_id;
  if v_trip.status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;

  if v_user is not null then
    insert into public.trip_members (trip_id, user_id, role)
    values (v_invite.trip_id, v_user, 'member')
    on conflict (trip_id, user_id) do nothing;

    insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
    values (v_invite.trip_id, v_user, 'member', v_user, 'join', jsonb_build_object('code', p_code), array['user_id'], gen_random_uuid())
    on conflict do nothing;
  end if;

  update public.trip_invites set use_count = use_count + 1 where id = v_invite.id;

  return v_invite.trip_id;
end $$;

-- 9.9 join_trip_with_email_and_code
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

  select * into v_trip from public.trips t where t.id = v_invite.trip_id;
  if v_trip.status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;

  select p.id into v_user_id from public.profiles p where lower(p.email) = v_email limit 1;

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
    if p_name is not null and trim(p_name) <> '' then
      update public.profiles set name = trim(p_name) where id = v_user_id and (name is null or name = split_part(v_email, '@', 1));
    end if;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_invite.trip_id, v_user_id, 'member')
  on conflict (trip_id, user_id) do nothing;

  update public.trip_invites set use_count = use_count + 1 where id = v_invite.id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_invite.trip_id, v_user_id, 'member', v_user_id, 'join', jsonb_build_object('code', p_code, 'email', v_email), array['user_id'], gen_random_uuid())
  on conflict do nothing;

  return jsonb_build_object(
    'trip_id', v_trip.id,
    'user_id', v_user_id,
    'email', v_email,
    'name', (select p.name from public.profiles p where p.id = v_user_id),
    'trip_name', v_trip.name,
    'destination', v_trip.destination,
    'base_currency', v_trip.base_currency
  );
end $$;

-- 9.10 save_expense
create or replace function public.save_expense(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_exp uuid; v_desc text; v_amt bigint; v_cur text; v_cat text; v_date date; v_notes text; v_receipt text;
  v_payers jsonb; v_splits jsonb; v_request uuid; v_existing public.expenses%rowtype;
  v_row jsonb; v_result jsonb;
  v_action text;
  v_actor uuid;
begin
  v_trip := (p_payload->>'tripId')::uuid;
  v_actor := coalesce(
    auth.uid(),
    nullif(p_payload->>'userId', '')::uuid,
    (select t.created_by from public.trips t where t.id = v_trip),
    (select tm.user_id from public.trip_members tm where tm.trip_id = v_trip limit 1)
  );

  if (p_payload->>'requestId') is null or (p_payload->>'requestId') = '' then
    v_request := gen_random_uuid();
  else
    v_request := (p_payload->>'requestId')::uuid;
  end if;

  if v_actor is not null then
    begin
      insert into public.mutation_requests (actor_user_id, request_id, operation, trip_id, result)
      values (v_actor, v_request, 'save_expense', v_trip, null);
    exception when unique_violation then
      select mr.result into v_result from public.mutation_requests mr where mr.actor_user_id = v_actor and mr.request_id = v_request and mr.operation = 'save_expense';
      if v_result is not null then return v_result; end if;
    end;
  end if;

  v_desc := trim(p_payload->>'description');
  v_amt := (p_payload->>'amountMinor')::bigint;
  v_cur := upper(p_payload->>'currency');
  v_cat := coalesce(p_payload->>'category', 'other');
  v_date := coalesce((p_payload->>'expenseDate')::date, current_date);
  v_notes := nullif(trim(p_payload->>'notes'), '');
  v_receipt := nullif(p_payload->>'receiptPath', '');
  v_payers := coalesce(p_payload->'payers', '[]'::jsonb);
  v_splits := coalesce(p_payload->'splits', '[]'::jsonb);
  v_exp := nullif(p_payload->>'expenseId', '')::uuid;

  if v_exp is not null then
    select * into v_existing from public.expenses e where e.id = v_exp and e.trip_id = v_trip;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_existing.deleted_at is not null then raise exception 'DELETED'; end if;

    update public.expenses set
      description = v_desc,
      amount_minor = v_amt,
      currency = v_cur,
      category = v_cat::public.expense_category,
      expense_date = v_date,
      notes = v_notes,
      receipt_path = v_receipt,
      updated_by = coalesce(v_actor, v_existing.created_by),
      updated_at = now()
    where id = v_exp;

    delete from public.expense_payers where expense_id = v_exp;
    delete from public.expense_splits where expense_id = v_exp;
    v_action := 'update';
  else
    insert into public.expenses (trip_id, description, amount_minor, currency, category, expense_date, notes, receipt_path, created_by, updated_by)
    values (v_trip, v_desc, v_amt, v_cur, v_cat::public.expense_category, v_date, v_notes, v_receipt, coalesce(v_actor, gen_random_uuid()), coalesce(v_actor, gen_random_uuid()))
    returning expenses.id into v_exp;
    v_action := 'create';
  end if;

  for v_row in select * from jsonb_array_elements(v_payers) loop
    insert into public.expense_payers (expense_id, user_id, amount_paid_minor)
    values (v_exp, (v_row->>'userId')::uuid, (v_row->>'amountPaidMinor')::bigint);
  end loop;

  for v_row in select * from jsonb_array_elements(v_splits) loop
    insert into public.expense_splits (expense_id, user_id, amount_owed_minor)
    values (v_exp, (v_row->>'userId')::uuid, (v_row->>'amountOwedMinor')::bigint);
  end loop;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (
    v_trip,
    coalesce(v_actor, auth.uid()),
    'expense',
    v_exp,
    v_action,
    jsonb_build_object('description', v_desc, 'amount_minor', v_amt, 'currency', v_cur, 'category', v_cat, 'expense_date', v_date, 'payers', v_payers),
    array['description', 'amount_minor', 'category', 'expense_date', 'payers'],
    v_request
  ) on conflict do nothing;

  v_result := jsonb_build_object('id', v_exp);
  return v_result;
end $$;

-- 9.11 soft_delete_expense & restore_expense
create or replace function public.soft_delete_expense(
  p_expense_id uuid,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_exp public.expenses%rowtype;
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (v_exp.created_by = v_actor or public.is_trip_owner(v_exp.trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.is_trip_writable(v_exp.trip_id) then raise exception 'TRIP_NOT_ACTIVE'; end if;

  update public.expenses set deleted_at = now(), deleted_by = v_actor where id = p_expense_id and deleted_at is null;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (v_exp.trip_id, v_actor, 'expense', p_expense_id, 'soft_delete', array['deleted_at'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.restore_expense(
  p_expense_id uuid,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_exp public.expenses%rowtype;
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_exp from public.expenses e where e.id = p_expense_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (v_exp.created_by = v_actor or public.is_trip_owner(v_exp.trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.is_trip_writable(v_exp.trip_id) then raise exception 'TRIP_NOT_ACTIVE'; end if;

  update public.expenses set deleted_at = null, deleted_by = null where id = p_expense_id and deleted_at is not null;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (v_exp.trip_id, v_actor, 'expense', p_expense_id, 'restore', array['deleted_at'], p_request_id)
  on conflict do nothing;
end $$;

-- 9.12 get_trip_balances
create or replace function public.get_trip_balances(p_trip_id uuid, p_user_id uuid default null)
returns table(
  user_id uuid,
  paid_minor bigint,
  owed_minor bigint,
  sent_minor bigint,
  received_minor bigint,
  net_minor bigint
)
language plpgsql security definer set search_path = public, pg_temp stable as $$
begin
  return query
  with members as (
    select tm.user_id from public.trip_members tm where tm.trip_id = p_trip_id
  ),
  paid as (
    select ep.user_id, coalesce(sum(ep.amount_paid_minor), 0)::bigint as total
    from public.expense_payers ep
    join public.expenses e on e.id = ep.expense_id
    where e.trip_id = p_trip_id and e.deleted_at is null
    group by ep.user_id
  ),
  owed as (
    select es.user_id, coalesce(sum(es.amount_owed_minor), 0)::bigint as total
    from public.expense_splits es
    join public.expenses e on e.id = es.expense_id
    where e.trip_id = p_trip_id and e.deleted_at is null
    group by es.user_id
  ),
  sent as (
    select s.from_user_id as user_id, coalesce(sum(s.amount_minor), 0)::bigint as total
    from public.settlements s
    where s.trip_id = p_trip_id and s.deleted_at is null
    group by s.from_user_id
  ),
  recv as (
    select s.to_user_id as user_id, coalesce(sum(s.amount_minor), 0)::bigint as total
    from public.settlements s
    where s.trip_id = p_trip_id and s.deleted_at is null
    group by s.to_user_id
  )
  select
    m.user_id,
    coalesce(p.total, 0)::bigint as paid_minor,
    coalesce(o.total, 0)::bigint as owed_minor,
    coalesce(s.total, 0)::bigint as sent_minor,
    coalesce(r.total, 0)::bigint as received_minor,
    ((coalesce(p.total, 0) - coalesce(o.total, 0)) + (coalesce(s.total, 0) - coalesce(r.total, 0)))::bigint as net_minor
  from members m
  left join paid p on p.user_id = m.user_id
  left join owed o on o.user_id = m.user_id
  left join sent s on s.user_id = m.user_id
  left join recv r on r.user_id = m.user_id;
end $$;

-- 9.13 record_settlement
create or replace function public.record_settlement(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_from uuid; v_to uuid; v_amt bigint; v_method text; v_ref text; v_note text; v_at timestamptz; v_req uuid;
  v_debtor bigint; v_creditor bigint; v_trip_row public.trips%rowtype; v_result jsonb; v_settle_id uuid;
  v_actor uuid;
begin
  v_trip := (p_payload->>'tripId')::uuid;
  v_from := (p_payload->>'fromUserId')::uuid;
  v_to := (p_payload->>'toUserId')::uuid;
  v_actor := coalesce(auth.uid(), nullif(p_payload->>'userId', '')::uuid, v_from);

  if (p_payload->>'requestId') is null or (p_payload->>'requestId') = '' then
    v_req := gen_random_uuid();
  else
    v_req := (p_payload->>'requestId')::uuid;
  end if;

  if v_actor is not null then
    begin
      insert into public.mutation_requests (actor_user_id, request_id, operation, trip_id, result)
      values (v_actor, v_req, 'record_settlement', v_trip, null);
    exception when unique_violation then
      select mr.result into v_result from public.mutation_requests mr where mr.actor_user_id = v_actor and mr.request_id = v_req and mr.operation = 'record_settlement';
      if v_result is not null then return v_result; end if;
    end;
  end if;

  v_amt := (p_payload->>'amountMinor')::bigint;
  v_method := coalesce(p_payload->>'paymentMethod', 'UPI');
  v_ref := nullif(trim(p_payload->>'reference'), '');
  v_note := nullif(trim(p_payload->>'note'), '');
  v_at := coalesce((p_payload->>'settledAt')::timestamptz, now());

  select * into v_trip_row from public.trips t where t.id = v_trip for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_trip_row.status not in ('active', 'settled') then raise exception 'TRIP_NOT_ACTIVE'; end if;
  if not (public.is_trip_member(v_trip, v_from) and public.is_trip_member(v_trip, v_to)) then raise exception 'PERMISSION_DENIED'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'VALIDATION_FAILED amount'; end if;
  if v_from = v_to then raise exception 'VALIDATION_FAILED self_settle'; end if;

  select b.net_minor into v_debtor from public.get_trip_balances(v_trip, v_actor) b where b.user_id = v_from;
  select b.net_minor into v_creditor from public.get_trip_balances(v_trip, v_actor) b where b.user_id = v_to;

  if v_debtor >= 0 or v_creditor <= 0 then raise exception 'BALANCE_CHANGED debtor_not_owe'; end if;
  if v_amt > abs(v_debtor) or v_amt > v_creditor then raise exception 'VALIDATION_FAILED overpayment'; end if;

  insert into public.settlements (trip_id, from_user_id, to_user_id, amount_minor, payment_method, reference, note, settled_at, recorded_by, updated_by)
  values (v_trip, v_from, v_to, v_amt, v_method, v_ref, v_note, v_at, v_actor, v_actor)
  returning settlements.id into v_settle_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (
    v_trip,
    coalesce(v_actor, auth.uid()),
    'settlement',
    v_settle_id,
    'settle',
    jsonb_build_object('amount_minor', v_amt, 'from_user_id', v_from, 'to_user_id', v_to, 'payment_method', v_method),
    array['amount_minor', 'from_user_id', 'to_user_id'],
    v_req
  ) on conflict do nothing;

  v_result := jsonb_build_object('id', v_settle_id);
  return v_result;
end $$;

-- 9.14 update_trip, member roles & trip lifecycle
create or replace function public.update_trip(
  p_trip_id uuid,
  p_patch jsonb,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text; v_dest text; v_start date; v_end date;
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  v_name := trim(p_patch->>'name');
  v_dest := trim(p_patch->>'destination');
  v_start := (p_patch->>'start_date')::date;
  v_end := (p_patch->>'end_date')::date;

  if v_name is not null and length(v_name) not between 1 and 80 then raise exception 'VALIDATION_FAILED name'; end if;
  if v_dest is not null and length(v_dest) > 120 then raise exception 'VALIDATION_FAILED destination'; end if;
  if v_start is not null and v_end is not null and v_end < v_start then raise exception 'VALIDATION_FAILED dates'; end if;

  update public.trips set
    name = coalesce(v_name, name),
    destination = coalesce(v_dest, destination),
    start_date = coalesce(v_start, start_date),
    end_date = coalesce(v_end, end_date),
    updated_by = v_actor,
    updated_at = now()
  where id = p_trip_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (p_trip_id, v_actor, 'trip', p_trip_id, 'update', p_patch, array['name'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.change_member_role(
  p_trip_id uuid,
  p_user_id uuid,
  p_role public.trip_role,
  p_request_id uuid,
  p_actor_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owners int;
  v_actor uuid := coalesce(auth.uid(), p_actor_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.is_trip_writable(p_trip_id) then raise exception 'TRIP_NOT_ACTIVE'; end if;

  if p_role <> 'owner' and (select tm.role from public.trip_members tm where tm.trip_id = p_trip_id and tm.user_id = p_user_id) = 'owner' then
    select count(*) into v_owners from public.trip_members tm where tm.trip_id = p_trip_id and tm.role = 'owner';
    if v_owners <= 1 then raise exception 'LAST_OWNER'; end if;
  end if;

  update public.trip_members set role = p_role where trip_id = p_trip_id and user_id = p_user_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, v_actor, 'member', p_user_id, 'role_change', array['role'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.remove_trip_member(
  p_trip_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_actor_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_net bigint;
  v_owners int;
  v_actor uuid := coalesce(auth.uid(), p_actor_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or v_actor = p_user_id or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if (select tm.role from public.trip_members tm where tm.trip_id = p_trip_id and tm.user_id = p_user_id) = 'owner' then
    select count(*) into v_owners from public.trip_members tm where tm.trip_id = p_trip_id and tm.role = 'owner';
    if v_owners <= 1 then raise exception 'LAST_OWNER'; end if;
  end if;

  select b.net_minor into v_net from public.get_trip_balances(p_trip_id, v_actor) b where b.user_id = p_user_id;
  if coalesce(v_net, 0) <> 0 then raise exception 'MEMBER_HAS_BALANCE'; end if;

  delete from public.trip_members where trip_id = p_trip_id and user_id = p_user_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, v_actor, 'member', p_user_id, 'remove', array['user_id'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.mark_trip_settled(
  p_trip_id uuid,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.trips set status = 'settled', updated_by = v_actor, updated_at = now() where id = p_trip_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, v_actor, 'trip', p_trip_id, 'settle', array['status'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.reopen_trip(
  p_trip_id uuid,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.trips set status = 'active', updated_by = v_actor, updated_at = now() where id = p_trip_id and status in ('settled', 'archived');

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, v_actor, 'trip', p_trip_id, 'update', array['status'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.archive_trip(
  p_trip_id uuid,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.trips set status = 'archived', updated_by = v_actor, updated_at = now() where id = p_trip_id;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, v_actor, 'trip', p_trip_id, 'archive', array['status'], p_request_id)
  on conflict do nothing;
end $$;

create or replace function public.delete_trip(
  p_trip_id uuid,
  p_request_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (p_trip_id, v_actor, 'trip', p_trip_id, 'soft_delete', array['deleted'], p_request_id)
  on conflict do nothing;

  perform set_config('app.bypass_audit', 'on', true);
  delete from public.trips where id = p_trip_id;
  perform set_config('app.bypass_audit', 'off', true);

  update public.mutation_requests set result = jsonb_build_object('deleted', p_trip_id)
  where actor_user_id = v_actor and request_id = p_request_id and operation = 'delete_trip';
end $$;

-- 9.15 update_profile
create or replace function public.update_profile(p_name text, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(p_name)) not between 1 and 80 then raise exception 'VALIDATION_FAILED name'; end if;

  update public.profiles set name = trim(p_name), updated_at = now() where id = v_actor;
end $$;

-- 9.16 add_trip_member
create or replace function public.add_trip_member(
  p_trip_id uuid,
  p_email text,
  p_role public.trip_role default 'member',
  p_request_id uuid default gen_random_uuid(),
  p_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_clean_email text;
  v_user_name text;
  v_actor uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_trip_owner(p_trip_id, v_actor) or public.is_platform_admin(v_actor)) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if not public.is_trip_writable(p_trip_id) then
    raise exception 'TRIP_NOT_ACTIVE';
  end if;

  v_clean_email := lower(trim(p_email));
  if v_clean_email = '' or v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'VALIDATION_FAILED invalid_email';
  end if;

  select p.id, p.name into v_user_id, v_user_name from public.profiles p where lower(p.email) = v_clean_email limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    v_user_name := split_part(v_clean_email, '@', 1);
    insert into public.profiles (id, name, email, is_platform_admin)
    values (v_user_id, v_user_name, v_clean_email, false);
  end if;

  if public.is_trip_member(p_trip_id, v_user_id) then
    raise exception 'ALREADY_MEMBER';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (p_trip_id, v_user_id, coalesce(p_role, 'member'));

  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (
    p_trip_id,
    v_actor,
    'member',
    v_user_id,
    'join',
    jsonb_build_object('email', v_clean_email, 'role', coalesce(p_role, 'member'), 'added_by', v_actor),
    array['user_id', 'role'],
    p_request_id
  ) on conflict do nothing;

  return jsonb_build_object('userId', v_user_id, 'name', v_user_name, 'email', v_clean_email);
end $$;

-- 9.17 get_trip_details
create or replace function public.get_trip_details(p_trip_id uuid, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_trip public.trips%rowtype;
  v_role text := 'member';
begin
  select * into v_trip from public.trips t where t.id = p_trip_id;
  if not found then return null; end if;

  if v_user is not null then
    select tm.role into v_role from public.trip_members tm where tm.trip_id = p_trip_id and tm.user_id = v_user;
  end if;

  return jsonb_build_object(
    'id', v_trip.id,
    'name', v_trip.name,
    'destination', v_trip.destination,
    'start_date', v_trip.start_date,
    'end_date', v_trip.end_date,
    'base_currency', v_trip.base_currency,
    'status', v_trip.status,
    'created_by', v_trip.created_by,
    'created_at', v_trip.created_at,
    'updated_at', v_trip.updated_at,
    'role', coalesce(v_role, 'member')
  );
end $$;

-- 9.18 get_trip_members_list
create or replace function public.get_trip_members_list(p_trip_id uuid, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'user_id', tm.user_id,
      'role', tm.role,
      'joined_at', tm.joined_at,
      'name', coalesce(p.name, substr(tm.user_id::text, 1, 8)),
      'email', coalesce(p.email, ''),
      'avatar_path', p.avatar_url
    ) order by tm.joined_at asc
  ) into v_res
  from public.trip_members tm
  left join public.profiles p on p.id = tm.user_id
  where tm.trip_id = p_trip_id;

  return coalesce(v_res, '[]'::jsonb);
end $$;

-- 9.19 get_trip_expenses_list
create or replace function public.get_trip_expenses_list(
  p_trip_id uuid,
  p_user_id uuid default null,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'trip_id', e.trip_id,
      'description', e.description,
      'amount_minor', e.amount_minor,
      'currency', e.currency,
      'category', e.category,
      'expense_date', e.expense_date,
      'notes', e.notes,
      'receipt_path', e.receipt_path,
      'created_by', e.created_by,
      'created_at', e.created_at,
      'updated_by', e.updated_by,
      'updated_at', e.updated_at,
      'deleted_at', e.deleted_at,
      'deleted_by', e.deleted_by,
      'expense_payers', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', ep.user_id, 'amount_paid_minor', ep.amount_paid_minor))
        from public.expense_payers ep where ep.expense_id = e.id
      ), '[]'::jsonb),
      'expense_splits', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', es.user_id, 'amount_owed_minor', es.amount_owed_minor))
        from public.expense_splits es where es.expense_id = e.id
      ), '[]'::jsonb)
    ) order by e.expense_date desc, e.created_at desc
  ) into v_res
  from public.expenses e
  where e.trip_id = p_trip_id
    and (p_include_deleted or e.deleted_at is null);

  return coalesce(v_res, '[]'::jsonb);
end $$;

-- 9.20 get_user_trips
create or replace function public.get_user_trips(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_res jsonb;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'destination', t.destination,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'base_currency', t.base_currency,
      'status', t.status,
      'created_by', t.created_by,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'role', coalesce(tm.role, 'member'),
      'memberCount', (
        select count(*)::int from public.trip_members tm2 where tm2.trip_id = t.id
      ),
      'total', (
        select coalesce(sum(e.amount_minor), 0)::bigint
        from public.expenses e
        where e.trip_id = t.id and e.deleted_at is null
      )
    ) order by t.created_at desc
  ) into v_res
  from public.trip_members tm
  join public.trips t on t.id = tm.trip_id
  where tm.user_id = v_user;

  return coalesce(v_res, '[]'::jsonb);
end $$;

-- 9.21 get_trip_audit_logs
create or replace function public.get_trip_audit_logs(
  p_trip_id uuid,
  p_user_id uuid default null,
  p_limit int default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
  v_res jsonb;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  if not (public.is_trip_member(p_trip_id, v_user) or public.is_platform_admin(v_user)) then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'trip_id', a.trip_id,
      'actor_user_id', a.actor_user_id,
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'action', a.action,
      'previous_values', a.previous_values,
      'new_values', a.new_values,
      'changed_fields', a.changed_fields,
      'request_id', a.request_id,
      'created_at', a.created_at
    ) order by a.created_at desc, a.id desc
  ) into v_res
  from (
    select * from public.audit_logs
    where trip_id = p_trip_id
      and (
        p_cursor_created_at is null
        or created_at < p_cursor_created_at
        or (created_at = p_cursor_created_at and id < p_cursor_id)
      )
    order by created_at desc, id desc
    limit coalesce(p_limit, 20)
  ) a;

  return coalesce(v_res, '[]'::jsonb);
end $$;

-- ===========================================================================
-- 10. Master Grants & Permission Bindings
-- ===========================================================================
revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to anon, authenticated;

revoke all on function public.create_trip(text, text, date, date, char, text[], uuid) from public;
grant execute on function public.create_trip(text, text, date, date, char, text[], uuid) to anon, authenticated;

revoke all on function public.create_trip_invite(uuid, int, int, uuid) from public;
grant execute on function public.create_trip_invite(uuid, int, int, uuid) to anon, authenticated;

revoke all on function public.list_trip_invites(uuid, uuid) from public;
grant execute on function public.list_trip_invites(uuid, uuid) to anon, authenticated;

revoke all on function public.revoke_trip_invite(uuid, uuid) from public;
grant execute on function public.revoke_trip_invite(uuid, uuid) to anon, authenticated;

revoke all on function public.resolve_invite_code(text) from public;
grant execute on function public.resolve_invite_code(text) to anon, authenticated;

revoke all on function public.join_trip_by_code(text, uuid) from public;
grant execute on function public.join_trip_by_code(text, uuid) to anon, authenticated;

revoke all on function public.join_trip_with_email_and_code(text, text, text) from public;
grant execute on function public.join_trip_with_email_and_code(text, text, text) to anon, authenticated;

revoke all on function public.save_expense(jsonb) from public;
grant execute on function public.save_expense(jsonb) to anon, authenticated;

revoke all on function public.soft_delete_expense(uuid, uuid, uuid) from public;
grant execute on function public.soft_delete_expense(uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.restore_expense(uuid, uuid, uuid) from public;
grant execute on function public.restore_expense(uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.get_trip_balances(uuid, uuid) from public;
grant execute on function public.get_trip_balances(uuid, uuid) to anon, authenticated;

revoke all on function public.record_settlement(jsonb) from public;
grant execute on function public.record_settlement(jsonb) to anon, authenticated;

revoke all on function public.update_trip(uuid, jsonb, uuid, uuid) from public;
grant execute on function public.update_trip(uuid, jsonb, uuid, uuid) to anon, authenticated;

revoke all on function public.change_member_role(uuid, uuid, public.trip_role, uuid, uuid) from public;
grant execute on function public.change_member_role(uuid, uuid, public.trip_role, uuid, uuid) to anon, authenticated;

revoke all on function public.remove_trip_member(uuid, uuid, uuid, uuid) from public;
grant execute on function public.remove_trip_member(uuid, uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.mark_trip_settled(uuid, uuid, uuid) from public;
grant execute on function public.mark_trip_settled(uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.reopen_trip(uuid, uuid, uuid) from public;
grant execute on function public.reopen_trip(uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.archive_trip(uuid, uuid, uuid) from public;
grant execute on function public.archive_trip(uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.delete_trip(uuid, uuid, uuid) from public;
grant execute on function public.delete_trip(uuid, uuid, uuid) to anon, authenticated;

revoke all on function public.update_profile(text, uuid) from public;
grant execute on function public.update_profile(text, uuid) to anon, authenticated;

revoke all on function public.add_trip_member(uuid, text, public.trip_role, uuid, uuid) from public;
grant execute on function public.add_trip_member(uuid, text, public.trip_role, uuid, uuid) to anon, authenticated;

revoke all on function public.get_trip_details(uuid, uuid) from public;
grant execute on function public.get_trip_details(uuid, uuid) to anon, authenticated;

revoke all on function public.get_trip_members_list(uuid, uuid) from public;
grant execute on function public.get_trip_members_list(uuid, uuid) to anon, authenticated;

revoke all on function public.get_trip_expenses_list(uuid, uuid, boolean) from public;
grant execute on function public.get_trip_expenses_list(uuid, uuid, boolean) to anon, authenticated;

revoke all on function public.get_user_trips(uuid) from public;
grant execute on function public.get_user_trips(uuid) to anon, authenticated;

revoke all on function public.get_trip_audit_logs(uuid, uuid, int, timestamptz, bigint) from public;
grant execute on function public.get_trip_audit_logs(uuid, uuid, int, timestamptz, bigint) to anon, authenticated;

revoke update on public.profiles from authenticated, anon, public;
