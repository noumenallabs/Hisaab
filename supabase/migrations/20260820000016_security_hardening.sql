-- Migration 20260820000016: Security & Storage Hardening (Gate B)
-- 1. Tighten receipts bucket configuration: 10 MiB limit, restricted MIME types
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'receipts';

-- 2. Drop all previous receipt policies by exact name to prevent permissive OR evaluation
drop policy if exists "receipts_read_members" on storage.objects;
drop policy if exists "receipts_insert_members" on storage.objects;
drop policy if exists "receipts_update_members" on storage.objects;
drop policy if exists "receipts_delete_members" on storage.objects;
drop policy if exists "receipts_member_read" on storage.objects;
drop policy if exists "receipts_member_insert" on storage.objects;
drop policy if exists "receipts_member_update" on storage.objects;
drop policy if exists "receipts_member_delete" on storage.objects;
drop policy if exists "receipts_select" on storage.objects;
drop policy if exists "receipts_insert" on storage.objects;
drop policy if exists "receipts_update" on storage.objects;
drop policy if exists "receipts_delete" on storage.objects;

-- Helper authorization functions for storage
create or replace function public.can_read_receipt(obj_name text)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select public.is_trip_member((split_part(obj_name, '/', 1))::uuid);
$$;

create or replace function public.can_write_receipt(obj_name text)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select exists (
    select 1 from public.trips
    where id = (split_part(obj_name, '/', 1))::uuid and status = 'active'
  )
  and public.is_trip_member((split_part(obj_name, '/', 1))::uuid);
$$;

-- Strict, unambiguous policies for receipts bucket
create policy "receipts_select_members" on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts'
  and public.can_read_receipt(name)
);

create policy "receipts_insert_members" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'receipts'
  and public.can_write_receipt(name)
  and name !~ '\.\.'
  and name ~ '^[^/]+/[^/]+/[^/]+\.(jpg|jpeg|png|webp|pdf)$'
);

create policy "receipts_delete_members" on storage.objects
for delete to authenticated
using (
  bucket_id = 'receipts'
  and public.can_write_receipt(name)
);

-- 3. Profile update security: RPC-only mutation
create or replace function public.update_profile(p_name text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if length(trim(p_name)) not between 1 and 80 then
    raise exception 'VALIDATION_FAILED name';
  end if;
  update public.profiles
  set name = trim(p_name),
      updated_at = now()
  where id = auth.uid();
end $$;

revoke all on function public.update_profile(text) from public;
grant execute on function public.update_profile(text) to authenticated;

-- Revoke direct update on profiles to enforce RPC usage
revoke update on public.profiles from authenticated, anon, public;

-- 4. Audit action constraint
do $$ begin
  alter table public.audit_logs drop constraint if exists chk_audit_action;
  alter table public.audit_logs add constraint chk_audit_action
    check (action in ('create','update','soft_delete','restore','join','remove','role_change','settle','archive'));
exception when others then null; end $$;
