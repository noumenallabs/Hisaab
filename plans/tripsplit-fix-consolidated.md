# TripSplit Consolidated Fix Plan — No More Piece-by-Piece Patches

> **Purpose:** Replace the last 3 reactive patches (00006 not found → mutation_requests does not exist → audit_logs FK) with one ordered, verifiable bundle. After this doc is approved, no further forward migrations or Settings/ TripLayout patches until the bundle's gate logs PASS with env/timestamp. This satisfies `plans/tripsplit-production-readiness-luna-spec.md` §11-§12 (one phase at a time, forward migrations only, fail-open stays open).

## 1. Current Truth (2026-08-19, 12:32)

* **Code:** `src/layouts/TripLayout.tsx` now always mounts chrome (header `← All trips` + sticky top tabs + fixed bottom 5-tab) — demo `isRealTrip` guard removed. `src/features/settings/TripSettingsPage.tsx` admin-gated `Delete trip` (hard-delete) via `useIsAdmin()` + `delete_trip` RPC. `src/types/database.ts` includes `delete_trip`.
* **Local DB bundle:** `combined.sql` 1054 lines = `00001 init` + `00002 invite_admin` + `00003 identity_harden` + `00004 idempotency` + `00005 money_lifecycle` + `00006 admin_delete_trip` + `00007 fix_delete_audit_fk`. `pnpm typecheck` TC:0, `pnpm test` 21/163 PASS, `pnpm build` ~230kB/73kB.
* **Live DB (`blklepdzkaxwbwthvpnn`):** Anon `select mutation_requests` → `[]` after last paste, `rpc delete_trip` anon → `AUTH_REQUIRED` (was `PGRST202`), `currency_metadata JPY` visible. Last error before fix: `update or delete on table "trips" violates foreign key constraint "audit_logs_trip_id_fkey"` — because `00001` audit FK had no `ON DELETE CASCADE`, `00007` now fixes it locally but was not yet pasted when error was reported. `00004` was missing until user pasted `combined.sql` the second time.

## 2. Why Piece-by-Piece Happened

* `00006` was pasted alone before `00004`/`00005` were live → `mutation_requests does not exist`.
* `00007` was created after `00006` to fix the FK, but `combined.sql` was extended locally without re-pasting to live — live still had old `audit_logs` FK without cascade.
* Each patch was verified with `typecheck` only, not the full §10 gate (DB probe + E2E slice). Next bundle must pass the full gate before being called done.

## 3. Scope Freeze for This Bundle

**In:** Identity hardening (§5.1-5.2, P0 #1-4), idempotency (§5.3 P0 #13), money/lifecycle/receipts (§5.4-5.9, P0 #8-15), admin hard-delete (§3.2, Settings), shell fix (TripLayout proper navigation).  
**Out:** No new expense split-mode logic, no balance concurrency rework, no a11y token rework, no observability — those belong to Phases 3-6 and stay closed until this bundle gates PASS.

## 4. Single Ordered Migration Bundle (Forward-Only)

Apply as **one paste of `combined.sql` 1054 lines** in SQL Editor (idempotent via `IF NOT EXISTS` / `duplicate_object`). Order matters — do not paste `00006`/`00007` alone:

| # | File | Covers | Why order matters |
|---|------|--------|-------------------|
| 1 | `20260818000001_init.sql` | enums, tables, RLS, helpers, `handle_new_user` | base |
| 2 | `20260819000002_invite_admin.sql` | `is_platform_admin`, `list/create/revoke_trip_invite`, `resolve_invite_code`, `maybe_promote_first_admin` trigger | admin gate |
| 3 | `20260819000003_phase1_identity_harden.sql` | drops `trg_maybe_promote_first_admin`, revokes anon `is_platform_admin`, fixes `join_trip_by_code` `trip_status` var, hardens `resolve_invite_code`, audit `REJECT UPDATE/DELETE`, redacts `create_trip_invite` | must precede idempotency |
| 4 | `20260819000004_phase1_idempotency.sql` | `mutation_requests` table + RLS `using(false)` + index | required by all mutating RPCs |
| 5 | `20260819000005_phase1_money_lifecycle.sql` | `currency_metadata` (JPY 0, others 2), hardened `save_expense` (currency/amount/payer-split sums, receipt path `<trip_id>/...`, audit `previous_values`), `record_settlement` (lock before balances, debtor/creditor nets, `min` cap), `update_trip`/`change_member_role`/`remove_trip_member`/`mark_trip_settled`/`reopen_trip` + `receipts` bucket | depends on `mutation_requests` |
| 6 | `20260819000006_admin_delete_trip.sql` | `delete_trip(p_trip_id, p_request_id)` — `AUTH_REQUIRED` + `is_platform_admin` + `NOT_FOUND` + `mutation_requests` claim | depends on `mutation_requests` |
| 7 | `20260819000007_fix_delete_audit_fk.sql` | `audit_logs` FK → `ON DELETE CASCADE`; re-orders `delete_trip` to claim `mutation_requests` first (duplicate `request_id` returns success even if trip already gone), then `INSERT audit_logs soft_delete`, then `DELETE FROM trips` | fixes FK that blocked `00006` |

No destructive `db reset`; `supabase db push` is equivalent but CLI is not installed, so SQL Editor paste is the path.

## 5. One Verification Gate (Must Log Before Closing Phase)

Run in order, record env + timestamp + owner in `plans/phase1-gate-log.md`:

1. **Toolchain:** `pnpm typecheck` → TC:0, `pnpm test` → 21 files 163 passed, `pnpm build` → initial JS ≤250kB gzip (exception documented if 230kB).
2. **DB existence (anon):**
   * `select * from mutation_requests limit 1` → `[]` (not `relation does not exist`)
   * `select * from currency_metadata limit 1` → `JPY` row
   * `select proname from pg_proc where proname='delete_trip'` → 1 row
3. **RPC auth matrix (anon, non-admin auth, admin auth):**
   * Anon `rpc('delete_trip', {p_trip_id: uuid, p_request_id: uuid})` → `P0001 AUTH_REQUIRED`
   * Authenticated non-admin → `PERMISSION_DENIED`
   * Authenticated admin on real trip → trip row gone, `select * from trips where id=?` → 0 rows, second call same `p_request_id` → stored `{"deleted": trip_id}` (idempotent), different `p_request_id` on already-deleted trip → `already_gone` + success (not `violates foreign key`)
4. **UI slice:**
   * Non-admin trip Settings → `Delete trip` button **not** rendered; admin → red `Delete trip` / `Delete trip (admin)` visible in both `active` and `archived` states, `ConfirmDialog` says hard-delete.
   * After admin delete → `toast("Trip deleted")` + `navigate("/trips")`, list no longer shows trip, direct `/trips/<id>` → 404 (real 404 from `routes.tsx`, not redirect).
   * Mobile 390x844 + desktop 1440x900: header `← All trips` + top sticky tabs + bottom fixed 5-tab all visible (TripLayout never returns early skeleton).

**Gate fails if** any probe returns `PGRST202`, `relation does not exist`, `violates foreign key`, or UI shows demo `isRealTrip` guard. Keep phase open and do not start Phase 3.

## 6. Risks If Gate Passes

* `audit_logs` for a hard-deleted trip is cascade-deleted — `mutation_requests.result` retains `deleted` id but audit history for that trip is gone. Acceptable for admin hard-delete (distinct from archival which keeps audit). If you need audit retention after hard-delete, follow-up is `audit_logs.trip_id` → nullable + `ON DELETE SET NULL` (separate migration, out of this bundle).
* `mutation_requests` row for `delete_trip` is also cascade-deleted with the trip — duplicate `request_id` after delete currently re-inserts; the `already_gone` branch handles it, but concurrent duplicate deletes serialize via `unique_violation` → `return` (one wins).
* Bundle gzip 230kB is near 250kB budget; Phase 6 will need lazy-route audit.

## 7. What Happens After Gate

Only then open Phase 3 (`ExpenseForm` 4 split modes, receipt path validation, dirty conflict) with its own DB + E2E slice — not interleaved with this bundle. No further `TripLayout`/`Settings` changes until Phase 1 gate log is committed.

## 8. External Inputs Still Required (§13)

* Confirm `blklepdzkaxwbwthvpnn` is disposable for `combined.sql` re-apply (re-paste is safe, but `db reset` is not).
* Service-role bootstrap command for `is_platform_admin` remains manual: `update profiles set is_platform_admin=true where email='...'` (outside client).
* `VITE_SUPABASE_URL`/`ANON_KEY` already in `.env`; no `service_role` in client bundle.

## 9. Approval

If you approve this doc, the next step is **one** action: paste `combined.sql` 1054 lines in SQL Editor → Run → run the 7 probes above → commit `phase1-gate-log.md`. No additional patches until that log is green.
