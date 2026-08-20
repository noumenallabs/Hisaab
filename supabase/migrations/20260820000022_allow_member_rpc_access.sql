-- 20260820000022_allow_member_rpc_access.sql
-- Provides graceful RPC access for trip members and guest visitors without throwing AUTH_REQUIRED

-- 1. get_trip_details
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
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then return null; end if;

  if v_user is not null then
    select role into v_role from public.trip_members where trip_id = p_trip_id and user_id = v_user;
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

revoke all on function public.get_trip_details(uuid, uuid) from public;
grant execute on function public.get_trip_details(uuid, uuid) to anon, authenticated;

-- 2. get_trip_members_list
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

revoke all on function public.get_trip_members_list(uuid, uuid) from public;
grant execute on function public.get_trip_members_list(uuid, uuid) to anon, authenticated;

-- 3. get_trip_expenses_list
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

revoke all on function public.get_trip_expenses_list(uuid, uuid, boolean) from public;
grant execute on function public.get_trip_expenses_list(uuid, uuid, boolean) to anon, authenticated;

-- 4. get_trip_balances
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
    where s.trip_id = p_trip_id
    group by s.from_user_id
  ),
  received as (
    select s.to_user_id as user_id, coalesce(sum(s.amount_minor), 0)::bigint as total
    from public.settlements s
    where s.trip_id = p_trip_id
    group by s.to_user_id
  )
  select
    m.user_id,
    coalesce(p.total, 0)::bigint as paid_minor,
    coalesce(o.total, 0)::bigint as owed_minor,
    coalesce(sn.total, 0)::bigint as sent_minor,
    coalesce(rc.total, 0)::bigint as received_minor,
    (coalesce(p.total, 0) - coalesce(o.total, 0) + coalesce(sn.total, 0) - coalesce(rc.total, 0))::bigint as net_minor
  from members m
  left join paid p on p.user_id = m.user_id
  left join owed o on o.user_id = m.user_id
  left join sent sn on sn.user_id = m.user_id
  left join received rc on rc.user_id = m.user_id;
end $$;

revoke all on function public.get_trip_balances(uuid, uuid) from public;
grant execute on function public.get_trip_balances(uuid, uuid) to anon, authenticated;
