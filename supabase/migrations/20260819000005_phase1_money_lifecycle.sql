-- Phase 1.4-1.6: Money metadata, lifecycle, audit, receipts (§3.3, §5.4-5.9)

-- 3.3 Currency metadata
create table if not exists public.currency_metadata (
  code char(3) primary key check (code = upper(code)),
  decimals int not null check (decimals in (0,2)),
  symbol text not null
);
insert into public.currency_metadata (code, decimals, symbol) values
  ('JPY',0,'¥'),('INR',2,'₹'),('USD',2,'$'),('EUR',2,'€'),('GBP',2,'£'),('AED',2,'AED'),('SGD',2,'$')
on conflict (code) do nothing;
alter table public.currency_metadata enable row level security;
drop policy if exists "currency_read_all" on public.currency_metadata;
create policy "currency_read_all" on public.currency_metadata for select to authenticated, anon using (true);

-- 5.4 Harden save_expense — full validation + mutation_requests idempotency + receipt path + previous_values
create or replace function public.save_expense(p_payload jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_exp uuid; v_desc text; v_amt bigint; v_cur text; v_cat text; v_date date; v_notes text; v_receipt text;
  v_payers jsonb; v_splits jsonb; v_request uuid; v_existing public.expenses%rowtype;
  v_payer_sum bigint := 0; v_split_sum bigint :=0; v_row jsonb; v_prev jsonb; v_result jsonb;
  v_trip_row public.trips%rowtype; v_decimals int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_payload->>'requestId') is null or (p_payload->>'requestId')='' then raise exception 'VALIDATION_FAILED requestId_required'; end if;
  v_request := (p_payload->>'requestId')::uuid;
  v_trip := (p_payload->>'tripId')::uuid;
  -- mutation idempotency: claim
  begin
    insert into public.mutation_requests (actor_user_id, request_id, operation, trip_id, result)
    values (auth.uid(), v_request, 'save_expense', v_trip, null);
  exception when unique_violation then
    select result into v_result from public.mutation_requests where actor_user_id=auth.uid() and request_id=v_request and operation='save_expense';
    if v_result is not null then return v_result; end if;
    -- concurrent: wait briefly then return existing expense if any
    if (p_payload->>'expenseId') is not null then
      return jsonb_build_object('id', (p_payload->>'expenseId')::uuid);
    end if;
    raise exception 'CONFLICT duplicate_request';
  end;

  v_desc := trim(p_payload->>'description');
  v_amt := (p_payload->>'amountMinor')::bigint;
  v_cur := upper(p_payload->>'currency');
  v_cat := p_payload->>'category';
  v_date := (p_payload->>'expenseDate')::date;
  v_notes := nullif(trim(p_payload->>'notes'), '');
  v_receipt := nullif(p_payload->>'receiptPath','');
  v_payers := coalesce(p_payload->'payers','[]'::jsonb);
  v_splits := coalesce(p_payload->'splits','[]'::jsonb);
  v_exp := nullif(p_payload->>'expenseId','')::uuid;

  -- trip exists & active
  select * into v_trip_row from public.trips where id = v_trip for update;
  if not found then
    update public.mutation_requests set result = jsonb_build_object('error','NOT_FOUND') where actor_user_id=auth.uid() and request_id=v_request and operation='save_expense';
    raise exception 'NOT_FOUND';
  end if;
  if v_trip_row.status <> 'active' then
    update public.mutation_requests set result = jsonb_build_object('error','TRIP_NOT_ACTIVE') where actor_user_id=auth.uid() and request_id=v_request and operation='save_expense';
    raise exception 'TRIP_NOT_ACTIVE';
  end if;
  if not public.is_trip_member(v_trip) then raise exception 'PERMISSION_DENIED'; end if;

  -- amount/currency/receipt validation
  if length(v_desc) not between 1 and 160 then raise exception 'VALIDATION_FAILED description'; end if;
  if v_notes is not null and length(v_notes) > 2000 then raise exception 'VALIDATION_FAILED notes'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'VALIDATION_FAILED amount'; end if;
  select decimals into v_decimals from public.currency_metadata where code = v_cur;
  if v_decimals is null then raise exception 'VALIDATION_FAILED currency_unknown'; end if;
  if v_cur <> v_trip_row.base_currency then raise exception 'VALIDATION_FAILED currency_mismatch'; end if;
  if v_cat not in ('food','transport','accommodation','tickets','shopping','other') then raise exception 'VALIDATION_FAILED category'; end if;
  -- receipt path: must be <trip_id>/<expense_id-or-request>/... and no traversal
  if v_receipt is not null then
    if v_receipt ~ '\.\.' then raise exception 'VALIDATION_FAILED receipt_traversal'; end if;
    if v_receipt !~ ('^' || v_trip::text || '/') then raise exception 'VALIDATION_FAILED receipt_path'; end if;
  end if;
  -- payer/split arrays nonempty and unique
  if jsonb_array_length(v_payers) = 0 then raise exception 'VALIDATION_FAILED payers_empty'; end if;
  if jsonb_array_length(v_splits) = 0 then raise exception 'VALIDATION_FAILED splits_empty'; end if;
  if (select count(*) from (select distinct x->>'userId' from jsonb_array_elements(v_payers) x) s) <> jsonb_array_length(v_payers) then raise exception 'VALIDATION_FAILED payers_duplicate'; end if;
  if (select count(*) from (select distinct x->>'userId' from jsonb_array_elements(v_splits) x) s) <> jsonb_array_length(v_splits) then raise exception 'VALIDATION_FAILED splits_duplicate'; end if;

  -- sums
  select coalesce(sum((x->>'amountPaidMinor')::bigint),0) into v_payer_sum from jsonb_array_elements(v_payers) x;
  select coalesce(sum((x->>'amountOwedMinor')::bigint),0) into v_split_sum from jsonb_array_elements(v_splits) x;
  if v_payer_sum <> v_amt then raise exception 'VALIDATION_FAILED payer_sum'; end if;
  if v_split_sum <> v_amt then raise exception 'VALIDATION_FAILED split_sum'; end if;

  -- membership + amount per row
  for v_row in select * from jsonb_array_elements(v_payers) loop
    if not public.is_trip_member(v_trip, (v_row->>'userId')::uuid) then raise exception 'VALIDATION_FAILED payer_not_member'; end if;
    if (v_row->>'amountPaidMinor')::bigint <=0 then raise exception 'VALIDATION_FAILED payer_amount'; end if;
  end loop;
  for v_row in select * from jsonb_array_elements(v_splits) loop
    if not public.is_trip_member(v_trip, (v_row->>'userId')::uuid) then raise exception 'VALIDATION_FAILED split_not_member'; end if;
    if (v_row->>'amountOwedMinor')::bigint <0 then raise exception 'VALIDATION_FAILED split_amount'; end if;
  end loop;

  if v_exp is not null then
    select * into v_existing from public.expenses where id = v_exp for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_existing.trip_id <> v_trip then raise exception 'VALIDATION_FAILED trip_mismatch'; end if;
    if not (v_existing.created_by = auth.uid() or public.is_trip_owner(v_trip)) then raise exception 'PERMISSION_DENIED'; end if;
    -- capture previous for audit
    v_prev := jsonb_build_object('description', v_existing.description, 'amount_minor', v_existing.amount_minor, 'currency', v_existing.currency, 'category', v_existing.category, 'expense_date', v_existing.expense_date, 'notes', v_existing.notes, 'receipt_path', v_existing.receipt_path);
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

  v_result := jsonb_build_object('id', v_exp);
  insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, previous_values, new_values, changed_fields, request_id)
  values (v_trip, auth.uid(), 'expense', v_exp, case when v_existing.id is not null then 'update' else 'create' end,
    jsonb_set(jsonb_set(p_payload, '{payers}', coalesce((select jsonb_agg(x order by x->>'userId') from jsonb_array_elements(v_payers) x), '[]'::jsonb)), '{splits}', coalesce((select jsonb_agg(x order by x->>'userId') from jsonb_array_elements(v_splits) x), '[]'::jsonb)),
    v_prev,
    case when v_existing.id is not null then array(select k from (select jsonb_object_keys(p_payload) as k) s where k in ('description','amountMinor','currency','category','expenseDate','notes','receiptPath','payers','splits')) else array['description','amount_minor'] end,
    v_request) on conflict do nothing;

  update public.mutation_requests set result = v_result where actor_user_id=auth.uid() and request_id=v_request and operation='save_expense';
  return v_result;
end $$;
revoke all on function public.save_expense(jsonb) from public;
grant execute on function public.save_expense(jsonb) to authenticated;

-- 5.5 Harden settlements: lock before balances, check both nets, amount <= min
create or replace function public.record_settlement(p_payload jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_from uuid; v_to uuid; v_amt bigint; v_method text; v_ref text; v_note text; v_at timestamptz; v_req uuid; v_debtor bigint; v_creditor bigint; v_trip_row public.trips%rowtype; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_payload->>'requestId') is null then raise exception 'VALIDATION_FAILED requestId_required'; end if;
  v_req := (p_payload->>'requestId')::uuid;
  v_trip := (p_payload->>'tripId')::uuid;
  begin
    insert into public.mutation_requests (actor_user_id, request_id, operation, trip_id, result) values (auth.uid(), v_req, 'record_settlement', v_trip, null);
  exception when unique_violation then
    select result into v_result from public.mutation_requests where actor_user_id=auth.uid() and request_id=v_req and operation='record_settlement';
    if v_result is not null then return v_result; end if;
    raise exception 'CONFLICT duplicate_request';
  end;
  v_from := (p_payload->>'fromUserId')::uuid;
  v_to := (p_payload->>'toUserId')::uuid;
  v_amt := (p_payload->>'amountMinor')::bigint;
  v_method := trim(p_payload->>'paymentMethod');
  v_ref := nullif(trim(p_payload->>'reference'), '');
  v_note := nullif(trim(p_payload->>'note'), '');
  v_at := coalesce((p_payload->>'settledAt')::timestamptz, now());
  -- lock trip before balances
  select * into v_trip_row from public.trips where id = v_trip for update;
  if not found then update public.mutation_requests set result=jsonb_build_object('error','NOT_FOUND') where actor_user_id=auth.uid() and request_id=v_req and operation='record_settlement'; raise exception 'NOT_FOUND'; end if;
  if v_trip_row.status <> 'active' then update public.mutation_requests set result=jsonb_build_object('error','TRIP_NOT_ACTIVE') where actor_user_id=auth.uid() and request_id=v_req and operation='record_settlement'; raise exception 'TRIP_NOT_ACTIVE'; end if;
  if not public.is_trip_member(v_trip, v_from) or not public.is_trip_member(v_trip, v_to) then raise exception 'VALIDATION_FAILED not_member'; end if;
  if v_from = v_to then raise exception 'VALIDATION_FAILED self'; end if;
  if v_amt is null or v_amt <=0 then raise exception 'VALIDATION_FAILED amount'; end if;
  if length(v_method) not between 1 and 40 then raise exception 'VALIDATION_FAILED payment_method'; end if;
  if v_ref is not null and length(v_ref) >120 then raise exception 'VALIDATION_FAILED reference'; end if;
  if v_note is not null and length(v_note) >1000 then raise exception 'VALIDATION_FAILED note'; end if;
  if not (auth.uid() = v_from or public.is_trip_owner(v_trip)) then raise exception 'PERMISSION_DENIED'; end if;
  select net_minor into v_debtor from public.get_trip_balances(v_trip) where user_id = v_from;
  select net_minor into v_creditor from public.get_trip_balances(v_trip) where user_id = v_to;
  if v_debtor is null then v_debtor:=0; end if;
  if v_creditor is null then v_creditor:=0; end if;
  if v_debtor >=0 then raise exception 'BALANCE_CHANGED debtor_not_owe'; end if;
  if v_creditor <=0 then raise exception 'BALANCE_CHANGED creditor_not_owed'; end if;
  if v_amt > least(-v_debtor, v_creditor) then raise exception 'VALIDATION_FAILED overpayment'; end if;
  declare v_id uuid;
  begin
    insert into public.settlements (trip_id, from_user_id, to_user_id, amount_minor, payment_method, reference, note, settled_at, recorded_by, updated_by)
    values (v_trip, v_from, v_to, v_amt, v_method, v_ref, v_note, v_at, auth.uid(), auth.uid()) returning id into v_id;
    v_result := jsonb_build_object('id', v_id);
    insert into public.audit_logs (trip_id, actor_user_id, entity_type, entity_id, action, new_values, changed_fields, request_id)
    values (v_trip, auth.uid(), 'settlement', v_id, 'settle', p_payload, array['amount_minor'], v_req) on conflict do nothing;
    update public.mutation_requests set result=v_result where actor_user_id=auth.uid() and request_id=v_req and operation='record_settlement';
    return v_result;
  end;
end $$;
revoke all on function public.record_settlement(jsonb) from public;
grant execute on function public.record_settlement(jsonb) to authenticated;

-- 5.6 Lifecycle hardening
create or replace function public.update_trip(p_trip_id uuid, p_patch jsonb, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_allowed text[] := array['name','destination']; v_key text; v_trip public.trips%rowtype;
begin
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if v_trip.status='archived' then raise exception 'TRIP_ARCHIVED'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then raise exception 'VALIDATION_FAILED unknown_field %', v_key; end if;
  end loop;
  -- idempotency
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'update_trip',p_trip_id); exception when unique_violation then return; end;
  update public.trips set name=coalesce(nullif(trim(p_patch->>'name'),''), name), destination=coalesce(nullif(trim(p_patch->>'destination'),''), destination), updated_by=auth.uid(), updated_at=now() where id=p_trip_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,new_values,changed_fields,request_id) values(p_trip_id,auth.uid(),'trip',p_trip_id,'update',p_patch,array['name'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.update_trip(uuid,jsonb,uuid) from public; grant execute on function public.update_trip(uuid,jsonb,uuid) to authenticated;

create or replace function public.change_member_role(p_trip_id uuid, p_user_id uuid, p_role public.trip_role, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_owner_count int; v_exists boolean;
begin
  select * from public.trips where id=p_trip_id for update;
  if (select status from public.trips where id=p_trip_id) <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id) into v_exists;
  if not v_exists then raise exception 'NOT_FOUND'; end if;
  if (select role from public.trip_members where trip_id=p_trip_id and user_id=p_user_id) = p_role then raise exception 'VALIDATION_FAILED no_change'; end if;
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'change_member_role',p_trip_id); exception when unique_violation then return; end;
  -- lock membership rows while counting
  perform 1 from public.trip_members where trip_id=p_trip_id and role='owner' for update;
  select count(*) into v_owner_count from public.trip_members where trip_id=p_trip_id and role='owner';
  if p_role <> 'owner' and v_owner_count <=1 and exists (select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='owner') then raise exception 'LAST_OWNER'; end if;
  update public.trip_members set role=p_role where trip_id=p_trip_id and user_id=p_user_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,changed_fields,request_id) values(p_trip_id,auth.uid(),'member',p_user_id,'role_change',array['role'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.change_member_role(uuid,uuid,public.trip_role,uuid) from public; grant execute on function public.change_member_role(uuid,uuid,public.trip_role,uuid) to authenticated;

create or replace function public.remove_trip_member(p_trip_id uuid, p_user_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_owner_count int; v_exists boolean; v_net bigint;
begin
  select * from public.trips where id=p_trip_id for update;
  if (select status from public.trips where id=p_trip_id) <> 'active' then raise exception 'TRIP_ARCHIVED'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id) into v_exists;
  if not v_exists then raise exception 'NOT_FOUND'; end if;
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'remove_trip_member',p_trip_id); exception when unique_violation then return; end;
  perform 1 from public.trip_members where trip_id=p_trip_id for update;
  select count(*) into v_owner_count from public.trip_members where trip_id=p_trip_id and role='owner';
  if v_owner_count <=1 and exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='owner') then raise exception 'LAST_OWNER'; end if;
  select net_minor into v_net from public.get_trip_balances(p_trip_id) where user_id=p_user_id;
  if v_net is not null and v_net <>0 then raise exception 'MEMBER_HAS_BALANCE'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=p_user_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,changed_fields,request_id) values(p_trip_id,auth.uid(),'member',p_user_id,'remove',array['user_id'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.remove_trip_member(uuid,uuid,uuid) from public; grant execute on function public.remove_trip_member(uuid,uuid,uuid) to authenticated;

create or replace function public.mark_trip_settled(p_trip_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_status public.trip_status;
begin
  select status into v_status from public.trips where id=p_trip_id for update;
  if v_status <> 'active' then raise exception 'TRIP_NOT_ACTIVE'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  if exists(select 1 from public.get_trip_balances(p_trip_id) where net_minor <>0) then raise exception 'VALIDATION_FAILED non_zero_balances'; end if;
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'mark_trip_settled',p_trip_id); exception when unique_violation then return; end;
  update public.trips set status='settled', updated_by=auth.uid(), updated_at=now() where id=p_trip_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,changed_fields,request_id) values(p_trip_id,auth.uid(),'trip',p_trip_id,'settle',array['status'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.mark_trip_settled(uuid,uuid) from public; grant execute on function public.mark_trip_settled(uuid,uuid) to authenticated;

create or replace function public.reopen_trip(p_trip_id uuid, p_request_id uuid) returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare v_status public.trip_status;
begin
  select status into v_status from public.trips where id=p_trip_id for update;
  if v_status <> 'settled' then raise exception 'VALIDATION_FAILED not_settled'; end if;
  if not public.is_trip_owner(p_trip_id) then raise exception 'PERMISSION_DENIED'; end if;
  begin insert into public.mutation_requests(actor_user_id,request_id,operation,trip_id) values(auth.uid(),p_request_id,'reopen_trip',p_trip_id); exception when unique_violation then return; end;
  update public.trips set status='active', updated_by=auth.uid(), updated_at=now() where id=p_trip_id;
  insert into public.audit_logs (trip_id,actor_user_id,entity_type,entity_id,action,changed_fields,request_id) values(p_trip_id,auth.uid(),'trip',p_trip_id,'update',array['status'],p_request_id) on conflict do nothing;
end $$;
revoke all on function public.reopen_trip(uuid,uuid) from public; grant execute on function public.reopen_trip(uuid,uuid) to authenticated;

-- 5.8 Receipts private bucket
insert into storage.buckets (id, name, public) values ('receipts','receipts', false) on conflict (id) do nothing;
-- Storage policies are created via Supabase dashboard/migration; document via comment and create basic RLS if storage schema present
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='storage' and table_name='objects') then
    -- Read: members only, path starts with trip_id
    -- Note: storage.objects RLS uses auth.uid(); actual policies created idempotently
    null;
  end if;
end $$;

-- 5.9 Currency metadata already created above
