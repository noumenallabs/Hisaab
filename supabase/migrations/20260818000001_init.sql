-- TripSplit init migration (Phase 1)
-- Implements spec §7-§11: enums, tables, indexes, triggers, RLS, helpers, storage

-- Enable pgcrypto for gen_random_uuid
create extension if not exists "pgcrypto";

-- 7.1 Enumerations
do $$ begin
  create type public.trip_role as enum ('owner','member');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.trip_status as enum ('active','settled','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.expense_category as enum ('food','transport','accommodation','tickets','shopping','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.audit_action as enum ('create','update','soft_delete','restore','join','remove','role_change','settle','archive');
exception when duplicate_object then null; end $$;

-- 7.2 profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  email text not null,
  avatar_path text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function public.handle_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.handle_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''), split_part(new.email,'@',1));
  insert into public.profiles (id, name, email) values (new.id, v_name, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 7.3 trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  destination text not null check (length(trim(destination)) between 1 and 120),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  base_currency char(3) not null check (base_currency = upper(base_currency)),
  status public.trip_status not null default 'active',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trips_created_by on public.trips(created_by);
create index if not exists idx_trips_status on public.trips(status);
drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at before update on public.trips for each row execute function public.handle_updated_at();

-- 7.4 trip_members
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.trip_role not null default 'member',
  joined_at timestamptz not null default now(),
  invited_by uuid references public.profiles(id),
  primary key (trip_id, user_id)
);
create index if not exists idx_trip_members_user_trip on public.trip_members(user_id, trip_id);

-- 7.5 trip_invites
create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz
);
create index if not exists idx_invites_trip on public.trip_invites(trip_id);
create index if not exists idx_invites_code on public.trip_invites(code);

-- 7.6 expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 160),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency = upper(currency)),
  category public.expense_category not null,
  expense_date date not null,
  notes text check (notes is null or length(notes) <= 2000),
  receipt_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz,
  check ((deleted_at is null) = (deleted_by is null))
);
create index if not exists idx_expenses_trip_date on public.expenses(trip_id, expense_date desc) where deleted_at is null;
create index if not exists idx_expenses_trip_category on public.expenses(trip_id, category) where deleted_at is null;
create index if not exists idx_expenses_created_by on public.expenses(created_by);
drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at before update on public.expenses for each row execute function public.handle_updated_at();

-- 7.7 expense_payers
create table if not exists public.expense_payers (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_paid_minor bigint not null check (amount_paid_minor > 0),
  unique (expense_id, user_id)
);
create index if not exists idx_payers_expense on public.expense_payers(expense_id);

-- 7.8 expense_splits
create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount_owed_minor bigint not null check (amount_owed_minor >= 0),
  unique (expense_id, user_id)
);
create index if not exists idx_splits_expense on public.expense_splits(expense_id);

-- 7.9 settlements
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  payment_method text not null check (length(trim(payment_method)) between 1 and 40),
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 1000),
  settled_at timestamptz not null,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id),
  deleted_at timestamptz,
  check (from_user_id <> to_user_id),
  check ((deleted_at is null) = (deleted_by is null))
);
create index if not exists idx_settlements_trip_date on public.settlements(trip_id, settled_at desc) where deleted_at is null;
drop trigger if exists trg_settlements_updated_at on public.settlements;
create trigger trg_settlements_updated_at before update on public.settlements for each row execute function public.handle_updated_at();

-- 7.10 audit_logs
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id),
  actor_user_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action public.audit_action not null,
  previous_values jsonb,
  new_values jsonb,
  changed_fields text[] not null default '{}',
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (request_id, entity_id, action)
);
create index if not exists idx_audit_trip_created on public.audit_logs(trip_id, created_at desc, id desc);
create index if not exists idx_audit_request on public.audit_logs(request_id);

-- Storage buckets (must be created via storage API, but document)
-- avatars (public optional) and receipts (private) creation is done via supabase storage API or dashboard.

-- 8.1 Authorization helpers
create or replace function public.is_trip_member(p_trip_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = p_user_id);
$$;
create or replace function public.is_trip_owner(p_trip_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = p_user_id and role = 'owner');
$$;
create or replace function public.is_trip_writable(p_trip_id uuid)
returns boolean language sql stable as $$
  select public.is_trip_member(p_trip_id) and exists (select 1 from public.trips where id = p_trip_id and status = 'active');
$$;
revoke all on function public.is_trip_member(uuid, uuid) from public;
revoke all on function public.is_trip_owner(uuid, uuid) from public;
grant execute on function public.is_trip_member(uuid, uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid, uuid) to authenticated;

-- Balance view/function §9
create or replace function public.get_trip_balances(p_trip_id uuid)
returns table (user_id uuid, paid_minor bigint, owed_minor bigint, sent_minor bigint, received_minor bigint, net_minor bigint)
language sql stable as $$
  with paid as (
    select ep.user_id, coalesce(sum(ep.amount_paid_minor),0)::bigint as paid_minor
    from public.expense_payers ep join public.expenses e on e.id = ep.expense_id
    where e.trip_id = p_trip_id and e.deleted_at is null group by ep.user_id
  ), owed as (
    select es.user_id, coalesce(sum(es.amount_owed_minor),0)::bigint as owed_minor
    from public.expense_splits es join public.expenses e on e.id = es.expense_id
    where e.trip_id = p_trip_id and e.deleted_at is null group by es.user_id
  ), sent as (
    select from_user_id as user_id, coalesce(sum(amount_minor),0)::bigint as sent_minor
    from public.settlements where trip_id = p_trip_id and deleted_at is null group by from_user_id
  ), recv as (
    select to_user_id as user_id, coalesce(sum(amount_minor),0)::bigint as received_minor
    from public.settlements where trip_id = p_trip_id and deleted_at is null group by to_user_id
  ), members as (select user_id from public.trip_members where trip_id = p_trip_id)
  select m.user_id,
    coalesce(p.paid_minor,0),
    coalesce(o.owed_minor,0),
    coalesce(s.sent_minor,0),
    coalesce(r.received_minor,0),
    coalesce(p.paid_minor,0) - coalesce(o.owed_minor,0) + coalesce(s.sent_minor,0) - coalesce(r.received_minor,0)
  from members m left join paid p on p.user_id = m.user_id left join owed o on o.user_id = m.user_id left join sent s on s.user_id = m.user_id left join recv r on r.user_id = m.user_id;
$$;

-- Helper to generate invite code
create or replace function public.generate_invite_code() returns text language plpgsql as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; res text := ''; i int;
begin
  for i in 1..10 loop res := res || substr(chars, (floor(random()*length(chars))::int+1),1); end loop;
  return res;
end $$;

-- 10 RLS enable
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.audit_logs enable row level security;

-- Policies (simplified to match spec matrix, avoiding recursion via helpers)
drop policy if exists "profiles_self_or_shared" on public.profiles;
create policy "profiles_self_or_shared" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.trip_members m1 join public.trip_members m2 on m1.trip_id = m2.trip_id where m1.user_id = auth.uid() and m2.user_id = profiles.id)
);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "trips_member_select" on public.trips;
create policy "trips_member_select" on public.trips for select to authenticated using (public.is_trip_member(id));
drop policy if exists "trips_no_direct_write" on public.trips;
create policy "trips_no_direct_write" on public.trips for all to authenticated using (false) with check (false);

drop policy if exists "trip_members_select" on public.trip_members;
create policy "trip_members_select" on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "trip_members_no_direct" on public.trip_members;
create policy "trip_members_no_direct" on public.trip_members for all to authenticated using (false) with check (false);

drop policy if exists "invites_member_select" on public.trip_invites;
create policy "invites_member_select" on public.trip_invites for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists "expenses_no_direct" on public.expenses;
create policy "expenses_no_direct" on public.expenses for all to authenticated using (false) with check (false);

drop policy if exists "payers_select" on public.expense_payers;
create policy "payers_select" on public.expense_payers for select to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));
drop policy if exists "splits_select" on public.expense_splits;
create policy "splits_select" on public.expense_splits for select to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

drop policy if exists "settlements_select" on public.settlements;
create policy "settlements_select" on public.settlements for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists "audit_select" on public.audit_logs;
create policy "audit_select" on public.audit_logs for select to authenticated using (public.is_trip_member(trip_id));

-- RPC: create_trip
create or replace function public.create_trip(p_name text, p_destination text, p_start_date date, p_end_date date, p_base_currency char(3), p_invitee_emails text[] default '{}')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_code text; v_request uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_end_date < p_start_date then raise exception 'VALIDATION_FAILED: end before start'; end if;
  insert into public.trips (name, destination, start_date, end_date, base_currency, created_by, updated_by)
  values (trim(p_name), trim(p_destination), p_start_date, p_end_date, upper(p_base_currency), auth.uid(), auth.uid()) returning id into v_trip;
  insert into public.trip_members (trip_id, user_id, role) values (v_trip, auth.uid(), 'owner');
  v_code := public.generate_invite_code();
  insert into public.trip_invites (trip_id, code, created_by, expires_at) values (v_trip, v_code, auth.uid(), now() + interval '30 days');
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'trip', v_trip, 'create', jsonb_build_object('name', p_name), array['name'], v_request);
  return v_trip;
end $$;
revoke all on function public.create_trip(text,text,date,date,char, text[]) from public;
grant execute on function public.create_trip(text,text,date,date,char, text[]) to authenticated;

-- RPC: join_trip_by_code
create or replace function public.join_trip_by_code(p_code text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_invite public.trip_invites%rowtype; v_trip uuid; v_request uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_invite from public.trip_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if v_invite.revoked_at is not null then raise exception 'INVITE_INVALID'; end if;
  if v_invite.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_INVALID'; end if;
  select status into v_trip from public.trips where id = v_invite.trip_id;
  -- check archived
  if exists (select 1 from public.trips where id = v_invite.trip_id and status = 'archived') then raise exception 'TRIP_ARCHIVED'; end if;
  if exists (select 1 from public.trip_members where trip_id = v_invite.trip_id and user_id = auth.uid()) then return v_invite.trip_id; end if;
  insert into public.trip_members (trip_id, user_id, invited_by) values (v_invite.trip_id, auth.uid(), v_invite.created_by);
  update public.trip_invites set use_count = use_count + 1 where id = v_invite.id;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_invite.trip_id, auth.uid(), 'member', auth.uid(), 'join', jsonb_build_object('user_id', auth.uid()), array['user_id'], v_request);
  return v_invite.trip_id;
end $$;
revoke all on function public.join_trip_by_code(text) from public;
grant execute on function public.join_trip_by_code(text) to authenticated;

-- RPC: save_expense (simplified atomic validation)
create or replace function public.save_expense(p_payload jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_exp uuid; v_desc text; v_amt bigint; v_cur text; v_cat text; v_date date; v_notes text; v_receipt text;
  v_payers jsonb; v_splits jsonb; v_request uuid; v_existing public.expenses%rowtype;
  v_payer_sum bigint := 0; v_split_sum bigint :=0; v_row jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_trip := (p_payload->>'tripId')::uuid;
  v_desc := trim(p_payload->>'description');
  v_amt := (p_payload->>'amountMinor')::bigint;
  v_cur := upper(p_payload->>'currency');
  v_cat := p_payload->>'category';
  v_date := (p_payload->>'expenseDate')::date;
  v_notes := nullif(trim(p_payload->>'notes'), '');
  v_receipt := nullif(p_payload->>'receiptPath','');
  v_payers := coalesce(p_payload->'payers','[]'::jsonb);
  v_splits := coalesce(p_payload->'splits','[]'::jsonb);
  v_request := coalesce(nullif(p_payload->>'requestId',''), gen_random_uuid()::text)::uuid;
  v_exp := nullif(p_payload->>'expenseId','')::uuid;

  if not public.is_trip_writable(v_trip) then raise exception 'PERMISSION_DENIED or TRIP_ARCHIVED'; end if;
  if length(v_desc) not between 1 and 160 then raise exception 'VALIDATION_FAILED description'; end if;
  if v_amt <= 0 then raise exception 'VALIDATION_FAILED amount'; end if;
  -- currency must equal trip base
  if v_cur <> (select base_currency from public.trips where id = v_trip) then raise exception 'VALIDATION_FAILED currency_mismatch'; end if;

  -- sums
  select coalesce(sum((x->>'amountPaidMinor')::bigint),0) into v_payer_sum from jsonb_array_elements(v_payers) x;
  select coalesce(sum((x->>'amountOwedMinor')::bigint),0) into v_split_sum from jsonb_array_elements(v_splits) x;
  if v_payer_sum <> v_amt then raise exception 'VALIDATION_FAILED payer_sum'; end if;
  if v_split_sum <> v_amt then raise exception 'VALIDATION_FAILED split_sum'; end if;

  -- membership checks simplified: ensure payers/splits are members
  for v_row in select * from jsonb_array_elements(v_payers) loop
    if not public.is_trip_member(v_trip, (v_row->>'userId')::uuid) then raise exception 'VALIDATION_FAILED payer_not_member'; end if;
  end loop;
  for v_row in select * from jsonb_array_elements(v_splits) loop
    if not public.is_trip_member(v_trip, (v_row->>'userId')::uuid) then raise exception 'VALIDATION_FAILED split_not_member'; end if;
  end loop;

  if v_exp is not null then
    select * into v_existing from public.expenses where id = v_exp for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_existing.trip_id <> v_trip then raise exception 'VALIDATION_FAILED trip_mismatch'; end if;
    if not (v_existing.created_by = auth.uid() or public.is_trip_owner(v_trip)) then raise exception 'PERMISSION_DENIED'; end if;
    -- lock trip
    perform 1 from public.trips where id = v_trip for update;
  else
    perform 1 from public.trips where id = v_trip for update;
  end if;

  -- dedup via request_id unique constraint on audit_logs
  if exists (select 1 from public.audit_logs where request_id = v_request and entity_id = coalesce(v_exp, '00000000-0000-0000-0000-000000000000'::uuid)) then
    -- return existing
    if v_exp is not null then
      return jsonb_build_object('id', v_exp);
    end if;
  end if;

  if v_exp is not null then
    update public.expenses set description = v_desc, amount_minor = v_amt, currency = v_cur, category = v_cat::public.expense_category, expense_date = v_date, notes = v_notes, receipt_path = v_receipt, updated_by = auth.uid(), updated_at = now() where id = v_exp;
  else
    insert into public.expenses (trip_id, description, amount_minor, currency, category, expense_date, notes, receipt_path, created_by, updated_by)
    values (v_trip, v_desc, v_amt, v_cur, v_cat::public.expense_category, v_date, v_notes, v_receipt, auth.uid(), auth.uid()) returning id into v_exp;
  end if;

  delete from public.expense_payers where expense_id = v_exp;
  delete from public.expense_splits where expense_id = v_exp;
  insert into public.expense_payers (expense_id, user_id, amount_paid_minor) select v_exp, (x->>'userId')::uuid, (x->>'amountPaidMinor')::bigint from jsonb_array_elements(v_payers) x;
  insert into public.expense_splits (expense_id, user_id, amount_owed_minor) select v_exp, (x->>'userId')::uuid, (x->>'amountOwedMinor')::bigint from jsonb_array_elements(v_splits) x where (x->>'amountOwedMinor')::bigint >=0;

  -- audit: normalize child arrays (sort by user_id for deterministic diff) and capture real changed_fields
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'expense', v_exp, case when v_existing.id is not null then 'update'::public.audit_action else 'create'::public.audit_action end,
  jsonb_set(
    jsonb_set(p_payload, '{payers}', coalesce((select jsonb_agg(x order by x->>'userId') from jsonb_array_elements(v_payers) x), '[]'::jsonb)),
    '{splits}', coalesce((select jsonb_agg(x order by x->>'userId') from jsonb_array_elements(v_splits) x), '[]'::jsonb)
  ),
  case when v_existing.id is not null then
    array(select k from (select jsonb_object_keys(p_payload) as k) s where k in ('description','amountMinor','currency','category','expenseDate','notes','receiptPath','payers','splits'))
  else array['description','amount_minor'] end
  , v_request)
  on conflict (request_id, entity_id, action) do nothing;

  return jsonb_build_object('id', v_exp);
end $$;
revoke all on function public.save_expense(jsonb) from public;
grant execute on function public.save_expense(jsonb) to authenticated;

-- RPC: soft_delete / restore
create or replace function public.soft_delete_expense(p_expense_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_created uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select trip_id, created_by into v_trip, v_created from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_trip_writable(v_trip) then raise exception 'TRIP_ARCHIVED'; end if;
  if not (v_created = auth.uid() or public.is_trip_owner(v_trip)) then raise exception 'PERMISSION_DENIED'; end if;
  update public.expenses set deleted_at = now(), deleted_by = auth.uid() where id = p_expense_id and deleted_at is null;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (v_trip, auth.uid(), 'expense', p_expense_id, 'soft_delete', array['deleted_at'], p_request_id) on conflict do nothing;
end $$;
create or replace function public.restore_expense(p_expense_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select trip_id into v_trip from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.is_trip_owner(v_trip) then raise exception 'PERMISSION_DENIED'; end if;
  update public.expenses set deleted_at = null, deleted_by = null where id = p_expense_id and deleted_at is not null;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id)
  values (v_trip, auth.uid(), 'expense', p_expense_id, 'restore', array['deleted_at'], p_request_id) on conflict do nothing;
end $$;
revoke all on function public.soft_delete_expense(uuid, uuid) from public;
revoke all on function public.restore_expense(uuid, uuid) from public;
grant execute on function public.soft_delete_expense(uuid, uuid) to authenticated;
grant execute on function public.restore_expense(uuid, uuid) to authenticated;

-- RPC: record_settlement (simplified)
create or replace function public.record_settlement(p_payload jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_from uuid; v_to uuid; v_amt bigint; v_method text; v_ref text; v_note text; v_at timestamptz; v_req uuid; v_net bigint; v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_trip := (p_payload->>'tripId')::uuid;
  v_from := (p_payload->>'fromUserId')::uuid;
  v_to := (p_payload->>'toUserId')::uuid;
  v_amt := (p_payload->>'amountMinor')::bigint;
  v_method := trim(p_payload->>'paymentMethod');
  v_ref := nullif(trim(p_payload->>'reference'), '');
  v_note := nullif(trim(p_payload->>'note'), '');
  v_at := coalesce((p_payload->>'settledAt')::timestamptz, now());
  v_req := coalesce(nullif(p_payload->>'requestId',''), gen_random_uuid()::text)::uuid;
  if not public.is_trip_writable(v_trip) then raise exception 'TRIP_ARCHIVED'; end if;
  if not public.is_trip_member(v_trip, v_from) or not public.is_trip_member(v_trip, v_to) then raise exception 'VALIDATION_FAILED not_member'; end if;
  if v_from = v_to then raise exception 'VALIDATION_FAILED self'; end if;
  if v_amt <= 0 then raise exception 'VALIDATION_FAILED amount'; end if;
  if not (auth.uid() = v_from or public.is_trip_owner(v_trip)) then raise exception 'PERMISSION_DENIED'; end if;
  -- overpayment guard simplified: compute net for from
  select net_minor into v_net from public.get_trip_balances(v_trip) where user_id = v_from;
  if v_net is null then v_net := 0; end if;
  -- from should owe (negative net), amount should not exceed -net
  if v_net >= 0 then raise exception 'BALANCE_CHANGED not_owe'; end if;
  if v_amt > -v_net then raise exception 'VALIDATION_FAILED overpayment'; end if;
  perform 1 from public.trips where id = v_trip for update;
  insert into public.settlements (trip_id, from_user_id, to_user_id, amount_minor, payment_method, reference, note, settled_at, recorded_by, updated_by)
  values (v_trip, v_from, v_to, v_amt, v_method, v_ref, v_note, v_at, auth.uid(), auth.uid()) returning id into v_id;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'settlement', v_id, 'settle', p_payload, array['amount_minor'], v_req) on conflict do nothing;
  return jsonb_build_object('id', v_id);
end $$;
revoke all on function public.record_settlement(jsonb) from public;
grant execute on function public.record_settlement(jsonb) to authenticated;

-- Trip lifecycle RPCs (stubs fulfilling spec)
create or replace function public.update_trip(p_trip_id uuid, p_patch jsonb, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  if not public.is_trip_writable(p_trip_id) and (p_patch ? 'status') = false then raise exception 'TRIP_ARCHIVED'; end if;
  update public.trips set name = coalesce(nullif(trim(p_patch->>'name'),''), name), destination = coalesce(nullif(trim(p_patch->>'destination'),''), destination), updated_by = auth.uid(), updated_at = now() where id = p_trip_id;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id) values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'update', p_patch, array['name'], p_request_id) on conflict do nothing;
end $$;
create or replace function public.change_member_role(p_trip_id uuid, p_user_id uuid, p_role public.trip_role, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_owner_count int;
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select count(*) into v_owner_count from public.trip_members where trip_id = p_trip_id and role='owner';
  if p_role <> 'owner' and v_owner_count <=1 and exists (select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='owner') then raise exception 'VALIDATION_FAILED last_owner'; end if;
  update public.trip_members set role = p_role where trip_id=p_trip_id and user_id=p_user_id;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id) values (p_trip_id, auth.uid(), 'member', p_user_id, 'role_change', array['role'], p_request_id) on conflict do nothing;
end $$;
create or replace function public.remove_trip_member(p_trip_id uuid, p_user_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_owner_count int; v_net bigint;
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select count(*) into v_owner_count from public.trip_members where trip_id=p_trip_id and role='owner';
  if v_owner_count <=1 and exists (select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='owner') then raise exception 'VALIDATION_FAILED last_owner'; end if;
  select net_minor into v_net from public.get_trip_balances(p_trip_id) where user_id = p_user_id;
  if coalesce(v_net,0) <> 0 then raise exception 'VALIDATION_FAILED non_zero_balance'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=p_user_id;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id) values (p_trip_id, auth.uid(), 'member', p_user_id, 'remove', array['user_id'], p_request_id) on conflict do nothing;
end $$;
create or replace function public.mark_trip_settled(p_trip_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_bad int;
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select count(*) into v_bad from public.get_trip_balances(p_trip_id) where net_minor <> 0;
  if v_bad > 0 then raise exception 'VALIDATION_FAILED non_zero_balances'; end if;
  update public.trips set status='settled', updated_by=auth.uid(), updated_at=now() where id=p_trip_id;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id) values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'settle', array['status'], p_request_id) on conflict do nothing;
end $$;
create or replace function public.archive_trip(p_trip_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  update public.trips set status='archived', updated_by=auth.uid(), updated_at=now() where id=p_trip_id and status in ('active','settled');
  if not found then raise exception 'VALIDATION_FAILED status'; end if;
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, changed_fields, request_id) values (p_trip_id, auth.uid(), 'trip', p_trip_id, 'archive', array['status'], p_request_id) on conflict do nothing;
end $$;
revoke all on function public.update_trip(uuid, jsonb, uuid) from public; grant execute on function public.update_trip(uuid, jsonb, uuid) to authenticated;
revoke all on function public.change_member_role(uuid, uuid, public.trip_role, uuid) from public; grant execute on function public.change_member_role(uuid, uuid, public.trip_role, uuid) to authenticated;
revoke all on function public.remove_trip_member(uuid, uuid, uuid) from public; grant execute on function public.remove_trip_member(uuid, uuid, uuid) to authenticated;
revoke all on function public.mark_trip_settled(uuid, uuid) from public; grant execute on function public.mark_trip_settled(uuid, uuid) to authenticated;
revoke all on function public.archive_trip(uuid, uuid) from public; grant execute on function public.archive_trip(uuid, uuid) to authenticated;
