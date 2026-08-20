-- Phase 1.11: Private receipts bucket + storage RLS (§5.8)
-- Forward-only. Bucket `receipts` private, path <trip_id>/<expense_id>/<uuid>.<ext>, 10 MB, JPEG/PNG/WebP/PDF, signed 10m.
insert into storage.buckets (id, name, public) values ('receipts','receipts', false) on conflict (id) do nothing;

-- Helper: is caller member of trip parsed from object name (first segment = trip_id)
create or replace function public.can_read_receipt(obj_name text) returns boolean language sql security definer set search_path=public, pg_temp stable as $$
  select public.is_trip_member((split_part(obj_name,'/',1))::uuid);
$$;
create or replace function public.can_write_receipt(obj_name text) returns boolean language sql security definer set search_path=public, pg_temp stable as $$
  select exists (select 1 from public.trips where id = (split_part(obj_name,'/',1))::uuid and status='active')
  and public.is_trip_member((split_part(obj_name,'/',1))::uuid);
$$;

drop policy if exists "receipts_read_members" on storage.objects;
create policy "receipts_read_members" on storage.objects for select to authenticated
using (bucket_id='receipts' and public.can_read_receipt(name));

drop policy if exists "receipts_insert_members" on storage.objects;
create policy "receipts_insert_members" on storage.objects for insert to authenticated
with check (bucket_id='receipts' and public.can_write_receipt(name)
  and name !~ '\.\.' and name ~ '^[^/]+/[^/]+/[^/]+\.(jpg|jpeg|png|webp|pdf)$');

drop policy if exists "receipts_update_members" on storage.objects;
create policy "receipts_update_members" on storage.objects for update to authenticated
using (bucket_id='receipts' and public.can_write_receipt(name))
with check (bucket_id='receipts' and public.can_write_receipt(name));

drop policy if exists "receipts_delete_members" on storage.objects;
create policy "receipts_delete_members" on storage.objects for delete to authenticated
using (bucket_id='receipts' and public.can_write_receipt(name));
