-- Phase 1.3: Mutation idempotency table — §5.3
-- Must be forward migration after 00003

create table if not exists public.mutation_requests (
  actor_user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  operation text not null check (length(trim(operation)) between 1 and 64),
  trip_id uuid not null references public.trips(id) on delete cascade,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id, operation)
);
create index if not exists idx_mutation_requests_trip on public.mutation_requests(trip_id);
alter table public.mutation_requests enable row level security;
-- No direct client access — only SECURITY DEFINER RPCs
drop policy if exists "mutation_requests_no_direct" on public.mutation_requests;
create policy "mutation_requests_no_direct" on public.mutation_requests for all to authenticated, anon using (false) with check (false);
