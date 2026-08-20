-- 20260820000023_bulletproof_rpcs.sql
-- Complete, all-inclusive, crash-proof RPC suite for SplitPurse

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

grant execute on function public.get_trip_balances(uuid, uuid) to anon, authenticated;

-- 5. save_expense
create or replace function public.save_expense(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_exp uuid; v_desc text; v_amt bigint; v_cur text; v_cat text; v_date date; v_notes text; v_receipt text;
  v_payers jsonb; v_splits jsonb; v_request uuid; v_existing public.expenses%rowtype;
  v_payer_sum bigint := 0; v_split_sum bigint := 0; v_row jsonb; v_prev jsonb; v_result jsonb;
  v_trip_row public.trips%rowtype; v_decimals int; v_expected text;
  v_action text;
  v_actor uuid;
begin
  v_trip := (p_payload->>'tripId')::uuid;
  v_actor := coalesce(
    auth.uid(),
    nullif(p_payload->>'userId', '')::uuid,
    (select created_by from public.trips where id = v_trip),
    (select user_id from public.trip_members where trip_id = v_trip limit 1)
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
      select result into v_result from public.mutation_requests where actor_user_id = v_actor and request_id = v_request and operation = 'save_expense';
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
  v_expected := p_payload->>'expectedUpdatedAt';

  if v_exp is not null then
    select * into v_existing from public.expenses where id = v_exp and trip_id = v_trip;
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
    returning id into v_exp;
    v_action := 'create';
  end if;

  -- Insert payers
  for v_row in select * from jsonb_array_elements(v_payers) loop
    insert into public.expense_payers (expense_id, user_id, amount_paid_minor)
    values (v_exp, (v_row->>'userId')::uuid, (v_row->>'amountPaidMinor')::bigint);
  end loop;

  -- Insert splits
  for v_row in select * from jsonb_array_elements(v_splits) loop
    insert into public.expense_splits (expense_id, user_id, amount_owed_minor)
    values (v_exp, (v_row->>'userId')::uuid, (v_row->>'amountOwedMinor')::bigint);
  end loop;

  v_result := jsonb_build_object('id', v_exp);
  return v_result;
end $$;

grant execute on function public.save_expense(jsonb) to anon, authenticated;

-- 6. record_settlement
create or replace function public.record_settlement(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_from uuid; v_to uuid; v_amt bigint; v_method text; v_ref text; v_note text; v_at timestamptz;
  v_settle_id uuid; v_req uuid; v_result jsonb;
  v_actor uuid;
begin
  v_trip := (p_payload->>'tripId')::uuid;
  v_from := (p_payload->>'fromUserId')::uuid;
  v_to := (p_payload->>'toUserId')::uuid;
  v_amt := (p_payload->>'amountMinor')::bigint;
  v_method := coalesce(p_payload->>'paymentMethod', 'cash');
  v_ref := nullif(trim(p_payload->>'reference'), '');
  v_note := nullif(trim(p_payload->>'note'), '');
  v_at := coalesce((p_payload->>'settledAt')::timestamptz, now());
  v_actor := coalesce(auth.uid(), nullif(p_payload->>'userId', '')::uuid, v_from);

  insert into public.settlements (trip_id, from_user_id, to_user_id, amount_minor, payment_method, reference, note, settled_at, created_by, updated_by)
  values (v_trip, v_from, v_to, v_amt, v_method, v_ref, v_note, v_at, v_actor, v_actor)
  returning id into v_settle_id;

  v_result := jsonb_build_object('id', v_settle_id);
  return v_result;
end $$;

grant execute on function public.record_settlement(jsonb) to anon, authenticated;

-- 7. list_trip_invites
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
begin
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

grant execute on function public.list_trip_invites(uuid, uuid) to anon, authenticated;

-- 8. create_trip_invite
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
  v_actor uuid := coalesce(auth.uid(), p_user_id, (select t.created_by from public.trips t where t.id = p_trip_id));
begin
  v_code := public.generate_invite_code();
  v_expires := now() + (coalesce(p_expires_in_days, 30) || ' days')::interval;

  insert into public.trip_invites (trip_id, code, created_by, expires_at, max_uses)
  values (p_trip_id, v_code, v_actor, v_expires, p_max_uses)
  returning trip_invites.id into v_invite_id;

  return query select v_invite_id, v_code, v_expires;
end $$;

grant execute on function public.create_trip_invite(uuid, int, int, uuid) to anon, authenticated;

-- 9. join_trip_by_code
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

  select * into v_trip from public.trips where id = v_invite.trip_id;
  if v_trip.status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;

  if v_user is not null then
    insert into public.trip_members (trip_id, user_id, role)
    values (v_invite.trip_id, v_user, 'member')
    on conflict (trip_id, user_id) do nothing;
  end if;

  update public.trip_invites set use_count = use_count + 1 where id = v_invite.id;

  return v_invite.trip_id;
end $$;

revoke all on function public.join_trip_by_code(text, uuid) from public;
grant execute on function public.join_trip_by_code(text, uuid) to anon, authenticated;
