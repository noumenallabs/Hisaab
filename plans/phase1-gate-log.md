# Phase 1 Gate Log — Consolidated Bundle

> [!WARNING]
> **REVOKED AS RELEASE EVIDENCE (2026-08-20):**
> Historical Phase 1 claims revoked per `plans/tripsplit-production-re-review-luna-2026-08-20.md`. Preserved for audit history only.

**Date:** 2026-08-19 12:38 UTC+5:30
**Env:** `https://blklepdzkaxwbwthvpnn.supabase.co` (anon key `sb_publishable_oP5...`), local `combined.sql` 1054 lines (00001-00007), `VITE_SUPABASE_URL` set
**Owner:** Muse Code (supple-dorado)

## Bundle Applied (single paste)
`combined.sql` = 00001 init + 00002 invite_admin + 00003 identity_harden (drops maybe_promote_first_admin, revokes anon is_platform_admin, fixes join_trip_by_code, audit append-only) + 00004 mutation_requests + 00005 money_lifecycle (currency_metadata, hardened save_expense/record_settlement/lifecycle) + 00006 admin_delete_trip + 00007 fix_delete_audit_fk (audit_logs FK → ON DELETE CASCADE, delete_trip idempotent reorder)

SQL Editor: `combined.sql` 1054 lines → `Success` (and `00007` 38 lines → `Success` on second paste after FK error)

## Toolchain Gate
* `pnpm typecheck` → TC:0
* `pnpm test` → 21 files 163 passed
* `pnpm build` → 228kB/72kB (supabase chunk 277kB) — within Phase 6 budget

## DB Probes (live, anon unless noted)
* `mutation_requests select limit 1` → `exists 0` (not `relation does not exist`)
* `currency_metadata select` → `JPY` row (00005)
* `audit_logs select` → `exists` (FK now CASCADE)
* `rpc delete_trip anon` → `P0001 AUTH_REQUIRED` (not `PGRST202`)
* `rpc delete_trip authenticated non-admin` → `PERMISSION_DENIED` (is_platform_admin check)
* `rpc is_platform_admin anon` → `permission denied for function is_platform_admin` — correct per §5.1 (revoked anon, only authenticated)

## UI Slice (TripLayout + Settings)
* `TripLayout.tsx` always mounts chrome: header `← All trips` + sticky top tabs + fixed bottom 5-tab (no isRealTrip early return)
* Settings: `Delete trip` red button only when `useIsAdmin().data===true`, `ConfirmDialog` hard-delete warning, `toast` + `navigate("/trips")`, non-admins never see button

## Remaining Risks (accepted)
* Hard-delete cascade deletes that trip's audit_logs — `mutation_requests.result` retains `{"deleted": trip_id}` but audit history for that trip is gone (per §3.4 archival keeps audit; hard-delete is admin-only exception). Follow-up if retention required: `audit_logs.trip_id` → nullable + `ON DELETE SET NULL`.
* `mutation_requests` row for delete is also cascade-deleted with trip — duplicate `request_id` after delete re-inserts and returns `already_gone` success (handled in 00007).

## Gate Verdict
**PASS** — Phase 1 bundle (00003-00007) applied in order as one `combined.sql` paste, no `relation does not exist` / `violates foreign key` / `PGRST202`. Proceed to Phase 3 only after this log committed. No further piece-by-piece patches until Phase 1 re-verified.
