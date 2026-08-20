-- Phase 1.10: Optimistic concurrency on save_expense — expectedUpdatedAt (§5.4 / §7.6)
-- Forward-only. Client sends expectedUpdatedAt (expense.updated_at at load); server raises CONFLICT stale if changed.
-- Does not touch idempotency semantics — stale check runs after idempotency claim and before validation/mutation.

create or replace function public.save_expense(p_payload jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip uuid; v_exp uuid; v_desc text; v_amt bigint; v_cur text; v_cat text; v_date date; v_notes text; v_receipt text;
  v_payers jsonb; v_splits jsonb; v_request uuid; v_existing public.expenses%rowtype;
  v_payer_sum bigint := 0; v_split_sum bigint :=0; v_row jsonb; v_prev jsonb; v_result jsonb;
  v_trip_row public.trips%rowtype; v_decimals int; v_expected text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if (p_payload->>'requestId') is null or (p_payload->>'requestId')='' then raise exception 'VALIDATION_FAILED requestId_required'; end if;
  v_request := (p_payload->>'requestId')::uuid;
  v_trip := (p_payload->>'tripId')::uuid;
  begin
    insert into public.mutation_requests (actor_user_id, request_id, operation, trip_id, result)
    values (auth.uid(), v_request, 'save_expense', v_trip, null);
  exception when unique_violation then
    select result into v_result from public.mutation_requests where actor_user_id=auth.uid() and request_id=v_request and operation='save_expense';
    if v_result is not null then return v_result; end if;
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
  v_expected := p_payload->>'expectedUpdatedAt';

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

  if length(v_desc) not between 1 and 160 then raise exception 'VALIDATION_FAILED description'; end if;
  if v_notes is not null and length(v_notes) > 2000 then raise exception 'VALIDATION_FAILED notes'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'VALIDATION_FAILED amount'; end if;
  select decimals into v_decimals from public.currency_metadata where code = v_cur;
  if v_decimals is null then raise exception 'VALIDATION_FAILED currency_unknown'; end if;
  if v_cur <> v_trip_row.base_currency then raise exception 'VALIDATION_FAILED currency_mismatch'; end if;
  if v_cat not in ('food','transport','accommodation','tickets','shopping','other') then raise exception 'VALIDATION_FAILED category'; end if;
  if v_receipt is not null then
    if v_receipt ~ '\.\.' then raise exception 'VALIDATION_FAILED receipt_traversal'; end if;
    if v_receipt !~ ('^' || v_trip::text || '/') then raise exception 'VALIDATION_FAILED receipt_path'; end if;
  end if;
  if jsonb_array_length(v_payers) = 0 then raise exception 'VALIDATION_FAILED payers_empty'; end if;
  if jsonb_array_length(v_splits) = 0 then raise exception 'VALIDATION_FAILED splits_empty'; end if;
  if (select count(*) from (select distinct x->>'userId' from jsonb_array_elements(v_payers) x) s) <> jsonb_array_length(v_payers) then raise exception 'VALIDATION_FAILED payers_duplicate'; end if;
  if (select count(*) from (select distinct x->>'userId' from jsonb_array_elements(v_splits) x) s) <> jsonb_array_length(v_splits) then raise exception 'VALIDATION_FAILED splits_duplicate'; end if;

  select coalesce(sum((x->>'amountPaidMinor')::bigint),0) into v_payer_sum from jsonb_array_elements(v_payers) x;
  select coalesce(sum((x->>'amountOwedMinor')::bigint),0) into v_split_sum from jsonb_array_elements(v_splits) x;
  if v_payer_sum <> v_amt then raise exception 'VALIDATION_FAILED payer_sum'; end if;
  if v_split_sum <> v_amt then raise exception 'VALIDATION_FAILED split_sum'; end if;

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
    -- optimistic concurrency: if client supplied expectedUpdatedAt and it differs, raise CONFLICT (client must refresh, preserve input)
    if v_expected is not null and v_expected <> '' then
      if v_existing.updated_at::text <> v_expected and date_trunc('milliseconds', v_existing.updated_at)::text <> v_expected then
        -- compare ISO timestamps leniently: refresh semantics — any mismatch is stale
        raise exception 'CONFLICT stale_expense';
      end if;
    end if;
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
    v_prev,
    jsonb_set(jsonb_set(p_payload, '{payers}', coalesce((select jsonb_agg(x order by x->>'userId') from jsonb_array_elements(v_payers) x), '[]'::jsonb)), '{splits}', coalesce((select jsonb_agg(x order by x->>'userId') from jsonb_array_elements(v_splits) x), '[]'::jsonb)),
    case when v_existing.id is not null then array(select k from (select jsonb_object_keys(p_payload) as k) s where k in ('description','amountMinor','currency','category','expenseDate','notes','receiptPath','payers','splits')) else array['description','amount_minor'] end,
    v_request) on conflict do nothing;

  update public.mutation_requests set result = v_result where actor_user_id=auth.uid() and request_id=v_request and operation='save_expense';
  return v_result;
end $$;
revoke all on function public.save_expense(jsonb) from public;
grant execute on function public.save_expense(jsonb) to authenticated;
