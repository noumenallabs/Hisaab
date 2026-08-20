-- Grants for authenticated role to allow RLS-filtered SELECTs (fixes permission denied for table trips in rls.sql proof 1)
-- Without these, SELECT as authenticated raises "permission denied for table trips" even though RLS policies exist (TO authenticated using (...))
-- Mirrors Supabase default grants that are missing in local plain postgres

grant usage on schema public to authenticated, anon;
grant usage on schema storage to authenticated, anon;

-- Core tables: SELECT allowed, filtered by RLS (is_trip_member / is_trip_owner)
grant select on table public.trips to authenticated;
grant select on table public.trip_members to authenticated;
grant select on table public.profiles to authenticated, anon;
grant select on table public.currency_metadata to authenticated, anon;
grant select on table public.expenses to authenticated;
grant select on table public.expense_payers to authenticated;
grant select on table public.expense_splits to authenticated;
grant select on table public.settlements to authenticated;
grant select on table public.trip_invites to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.mutation_requests to authenticated;

-- Needed for proof helpers that do count(*) after set_config role=authenticated
grant select on table public.trips to anon;
grant select on table public.expenses to anon;

-- Ensure authenticated can read storage buckets for proof 1c
do $$ begin grant select on table storage.buckets to authenticated, anon; exception when undefined_table then null; when invalid_schema_name then null; end $$;

-- Fix receipts bucket to be private (proof 1c expects public=false; 00011 used ON CONFLICT DO NOTHING so existing public=true would stay)
do $$ begin update storage.buckets set public = false where id = 'receipts'; exception when undefined_table then null; when invalid_schema_name then null; end $$;

-- Fix storage.buckets RLS: enable read for authenticated/anon (proof 1c needs to see public flag; RLS is enabled with 0 policies → default deny)
do $$ begin create policy "buckets_select_all" on storage.buckets for select to authenticated, anon using (true); exception when duplicate_object then null; end $$;
