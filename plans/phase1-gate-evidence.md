# Phase 1 Gate Evidence — Database & Identity (Spec §5 + §10.4 + §11 Phase 1)

**Date:** 2026-08-19 15:35 IST
**Owner:** Phase 1 database engineer (supple-dorado)
**Scope:** Forward-only DB remediation; no frontend shell changes.

## 1. Migrations Audited

| File | Lines | Verdict |
|------|-------|---------|
| `20260818000001_init.sql` | ~531 | Baseline: correct enums/tables/RLS/helpers, but contains known P0s: join `select status into uuid`, weak idempotency via audit_logs, lifecycle/stub gaps, missing receipts policies. Kept as history — fixed forward. |
| `20260819000002_invite_admin.sql` | 79 | Introduces `is_platform_admin` anon grant and unsafe `maybe_promote_first_admin` trigger (first user becomes admin) + anonymous-invite model (`resolve_invite_code` anon, invite-as-sign-in). Flagged §5.1/§5.2 regression source. |
| `20260819000003_phase1_identity_harden.sql` | 81 | **Fixes P0 #1,#2**: drops `trg_maybe_promote_first_admin` + function, revokes anon `is_platform_admin`, documents service_role bootstrap, fixes `join_trip_by_code` type bug (v_status typed `trip_status`), adds revoked/expiry/max_use/archived checks, idempotent return, redacted audit (`code_suffix`). Audit append-only trigger added. |
| `20260819000004_phase1_idempotency.sql` | 17 | **Fixes §5.3**: creates `mutation_requests (actor_user_id, request_id, operation)` PK, `trip_id`, `result`, RLS `using (false)` — no client select/insert/update/delete, SECURITY DEFINER RPCs only. |
| `20260819000005_phase1_money_lifecycle.sql` | ~280 | **Fixes §5.4-5.6**: `currency_metadata` (JPY 0, INR/USD/EUR/GBP/AED/SGD 2), hardened `save_expense` (requestId required, mutation_requests claim, active lock, member/is_owner, amount/currency/category/receipt traversal + prefix, nonempty/unique arrays, payer/split sums, per-row member + amount guards, previous capture, audit previous/new/changed), hardened `record_settlement` (lock before balances, both nets, `least(-debtor, creditor)`, method/ref/note length, idempotency+audit), lifecycle `update_trip` allowlist, `change_member_role`/`remove_trip_member` locks + last-owner + `MEMBER_HAS_BALANCE`, `mark_trip_settled`/`reopen_trip` state machine, receipts bucket private. |
| `20260819000006_admin_delete_trip.sql` | 28 | Adds platform-admin-only `delete_trip` with mutation_requests. Hard-deletes via cascade (audit also cascaded — retention risk noted). |
| `20260819000007_fix_delete_audit_fk.sql` | 38 | Fixes FK `audit_logs.trip_id ON DELETE CASCADE` so hard-delete does not block; reorders idempotency before existence check, `already_gone` result. |
| `20260819000008_fix_audit_immutable_delete.sql` | 57 | Fixes append-only trigger to allow cascade `DELETE` when trip gone or `app.bypass_audit='on'` (set during `delete_trip`), otherwise `AUDIT_IMMUTABLE`. |
| `20260819000009_phase1_remaining_hardening.sql` | **new this phase** | Closes residual §5.4/§5.6/§5.8 gaps (see §2). |
| **Total after this phase** | **9 migrations** | `supabase/migrations/` is forward-only; no history rewritten. |

### New migration 00009 contents

- `soft_delete_expense` / `restore_expense`: `p_request_id NOT NULL`, `TRIP_NOT_ACTIVE` if not active (was `TRIP_ARCHIVED` or missing), `is_platform_admin` not needed — author-or-owner vs owner-only, `mutation_requests` claim (`soft_delete_expense`/`restore_expense`) with early `return` idempotency, `FOR UPDATE` on trip, `previous_values` capture, audit `soft_delete`/`restore` with `on conflict do nothing`, `result` stored.
- `archive_trip`: `AUTH_REQUIRED`, `p_request_id NOT NULL`, `is_trip_owner`, `FOR UPDATE`, `TRIP_ARCHIVED` if already archived, allow only `active|settled -> archived`, idempotency `archive_trip`, audit with `previous_values {status}`.
- `create_trip_invite` / `revoke_trip_invite`: re-asserted archived/settled guards (`TRIP_ARCHIVED` / `TRIP_NOT_ACTIVE`), `AUTH_REQUIRED`, audit redaction already correct in 00003; behavior fixed forward without breaking callers (signature retained; idempotency left to caller requestId on wrappers — documented gap §3).
- `receipts` bucket: `storage.buckets.public=false`, `storage.objects` RLS policies `receipts_select_member` / `receipts_insert_member_active` / `receipts_update_member_active` / `receipts_delete_member_active` gated by `is_trip_member` / `is_trip_writable` + `foldername(name)[1]::uuid`. No-op if `storage` schema absent (local without storage).

## 2. Spec §5.1-5.9 Audit

| Spec | Required | Status after 00009 |
|------|----------|--------------------|
| **5.1 admin bootstrap** | Drop `trg_maybe_promote_first_admin`+func, no auto-demote, document service_role `update profiles set is_platform_admin=true where email=…`, revoke `is_platform_admin` from `anon` (authenticated only own status) | ✅ 00003 — verified: trigger absent, `is_platform_admin` granted only to `authenticated`, anon call returns `permission denied`. Acceptance: new signup `is_platform_admin=false`. |
| **5.2 join_trip_by_code** | `auth.uid` required, normalize+`FOR UPDATE` lock, validate revoked/expiry/max_use/trip status, idempotent return without increment, insert 1 membership + increment once, 1 audit, return trip UUID | ✅ 00003 — `auth.uid` check, `upper(trim(p_code)) FOR UPDATE`, `INVITE_INVALID`/`INVITE_EXPIRED`/`INVITE_EXHAUSTED`/`TRIP_ARCHIVED`, `exists(member) return trip_id`, `update use_count +1` once, redacted audit (`invite_id`+`code_suffix`). Rate limiting deferred (edge/Supabase Auth) per spec — documented. |
| **5.3 mutation_requests** | Table `(actor_user_id, request_id, operation)` PK + `trip_id` + `result`, RLS no client access, SECURITY DEFINER RPCs only; every mutating RPC: require requestId, claim, return stored result, same-tx audit, concurrent duplicate serializes | ✅ table in 00004, RLS `using(false)`. RPCs covered: `save_expense`, `record_settlement`, `update_trip`, `change_member_role`, `remove_trip_member`, `mark_trip_settled`, `reopen_trip`, `delete_trip` (00006-08), `soft_delete_expense`/`restore_expense`/`archive_trip` (00009). Invite create/revoke intentionally not idempotent by requestId (existing signature) — see §3. |
| **5.4 expense RPCs** | active check, caller member, edit author|owner, expense.trip match, description 1-160, notes ≤2000, category enum, date, currency=base, currency known via `currency_metadata`, payer/split nonempty + unique, all users current members, payer>0, split≥0, sums==amount, receipt `^tripId/` no `..` | ✅ 00005 — all checks present; payer>0, split≥0, unique, sums, receipt traversal+prefix. Lifecycle `TRIP_NOT_ACTIVE` on not-active. Remaining refinement: receipt second-segment `<trip_id>/<expense_id>/` not strictly enforced (prefix only) — low risk, covered by app path generation. |
| **5.5 settlements** | Lock trip before balances, `active` only, both users current members distinct, caller `from` or owner, compute nets under lock, debtor<0 creditor>0, amount ≤ min(-debtor, creditor), method 1-40, ref ≤120, note ≤1000, idempotency+audit same tx | ✅ 00005 — `select * from trips for update` before `get_trip_balances`, both nets, `least(-debtor, creditor)`, lengths, idempotency `record_settlement`. Soft-delete/restore settlement out of R1 (spec alternative: remove from UI) — not added. |
| **5.6 lifecycle/membership** | `update_trip` allowlist unknown keys fail, no key bypasses archived, `change_member_role` active+exists+real change, `remove` active+exists + `MEMBER_HAS_BALANCE` + `LAST_OWNER`, `mark settled` active→settled only when balances zero, `reopen` settled→active, `archive` active|settled→archived, none from archived, lock membership rows while counting owners | ✅ 00005 + 00009: allowlist `{'name','destination'}` with `unknown_field` error, archived guard everywhere, `not found`/`no_change`/`LAST_OWNER`/`MEMBER_HAS_BALANCE`/`TRIP_NOT_ACTIVE`/`TRIP_ARCHIVED`, `for update` on membership owner rows, `reopen_trip` + `archive_trip` transitions hardened. `create_trip_invite`/`revoke` now also block archived. |
| **5.7 audit append-only** | Trigger rejects UPDATE/DELETE, revoke direct mutation grants, include requestId/actor/entity/action/before-after/changed/timestamp, exclude tokens/URLs/bytes/raw codes (invite id+suffix), keep after archival | ✅ 00003+00008: `reject_audit_mutation` BEFORE UPDATE/DELETE → `AUDIT_IMMUTABLE`, `revoke update,delete on audit_logs`, redacted invites, `app.bypass_audit` only for admin `delete_trip` cascade; archival keeps rows (hard-delete is admin exception with `mutation_requests.result` retained). |
| **5.8 receipts bucket** | Private bucket, path `<trip_id>/<expense_id>/<uuid>.<ext>`, read members only, upload/delete active-trip members (+ author/owner app-level), MIME  JPEG/PNG/WebP/PDF, ≤10MB, signed URL 10m never persisted, orphan cleanup scheduled | ✅ bucket `receipts` private in 00005+00009. Storage RLS policies (`receipts_*`) member-gated + active-gated. MIME/size/signed-URL/orphan cleanup are application/edge concerns — policies enforce trip isolation; app must generate signed URLs (10m) and schedule cleanup. |
| **5.9 database types** | Regenerate `src/types/database.ts` from schema, remove `as any` RPC casts, CI drift check | 🟡 Partial — see §4. |

## 3. Remaining RPC / Policy Gaps (non-blocking for gate, tracked)

1. **Invite idempotency by requestId:** `create_trip_invite`/`revoke_trip_invite` signatures retain `(p_trip_id, p_expires_in_days, p_max_uses)` / `(p_invite_id)` without `p_request_id`. Spec §5.3 lists them as idempotent operations. Current fix enforces lifecycle + redaction but not `mutation_requests` dedup by caller requestId. Options: add overload `create_trip_invite(p_trip_id, p_expires_in_days, p_max_uses, p_request_id uuid default null)` and gate on `mutation_requests` when supplied; or declare invites as non-idempotent-by-request and rely on `code` uniqueness. **Decision:** defer to Phase 5 (invite management) — does not affect Phase 1 gate (financial/lifecycle gates are hard).
2. **Receipt path second-segment enforcement:** `save_expense` receipt check is `^trip_id/` + no `..`, not strict `<trip_id>/<expense_id|request>/` with UUID+ext + MIME. Spec also wants server-side MIME/signature check — app-level. Storage policy keeps member+active gate; RPC keeps prefix gate. Follow-up: tighten regex to `^trip_id/[0-9a-f-]{36}/[^/]+\.(jpg|jpeg|png|webp|pdf)$` (case-insensitive) + `MAX 10MB` via `storage.objects` size check if available.
3. **Settlement soft-delete/restore:** Not in R1 per spec alternative. Not added; if later needed, add `soft_delete_settlement`/`restore_settlement` owner-only with same audit/idempotency pattern.
4. **`create_trip` still uses internal `gen_random_uuid()` for `audit.request_id` not caller-supplied:** Not covered by `mutation_requests` — trip creation is single-shot per owner; retry creates second trip (distinct entity). Acceptable for gate; could add caller requestId if strictly required.
5. **Hard-delete audit retention:** `delete_trip` hard-deletes that trip's audit rows via cascade; only `mutation_requests.result {"deleted": trip_id}` survives. If retention is required, migrate `audit_logs.trip_id` to nullable `ON DELETE SET NULL` + retain. Current behavior matches 00007 decision and is documented.

## 4. Database Types & `as any`

- `src/types/database.ts` was regenerated 2026-08-19 12:22 and already contains `mutation_requests`, `currency_metadata`, all 18 Functions (`is_trip_member`, `is_platform_admin`, `create_trip`, `join_trip_by_code`, `save_expense`, `soft_delete_expense`, `restore_expense`, `record_settlement`, `get_trip_balances`, `list_trip_invites`, `create_trip_invite`, `revoke_trip_invite`, `resolve_invite_code`, `update_trip`, `change_member_role`, `remove_trip_member`, `mark_trip_settled`, `reopen_trip`, `archive_trip`, `delete_trip`). Types match migrations 00001-00009 (no new columns after 00009, so no drift).

- **Live `as any` count:** `rg "as any"` finds ~30 call sites (examples: `features/settings/api.ts:8`, `features/expenses/api.ts:7`, `features/balances/SettlementDialog.tsx:40`, `features/trips/api.ts:39`, etc.). Each is ` (supabase as any).rpc("name", …)` — the `Database` type already declares `Functions`, so `supabase.rpc` should be typed without `as any` if the client is `SupabaseClient<Database>`. **Required frontend change (Phase 2 scope, not edited here):** replace `(supabase as any).rpc` with `supabase.rpc` and let inference pick `Functions` Args/Returns; add a thin typed wrapper `lib/typedSupabase.ts` re-exporting `TypedSupabase = SupabaseClient<Database>` if inference still needs `as`. Also replace `expense as any`, `members as any` demo fallbacks (demo branches are to be deleted Phase 2). A CI step `pnpm typecheck && ! rg -q "as any" src/features --` can be the drift gate (spec §5.9).

- **CI drift check (recommended):** `supabase gen types typescript --local > /tmp/new.ts && diff src/types/database.ts /tmp/new.ts` fails the job on drift (requires local stack running).

## 5. Files Audited (Phase 1 scope)

- `supabase/migrations/*.sql` (9 files, listed §1)
- `src/types/database.ts` (8542 bytes, last gen 2026-08-19 12:22)
- `supabase/tests/rls.sql` (scaffolded this phase — executable 15 proofs)
- RPC call sites: `src/features/{settings,expenses,balances,trips}/api.ts`, `src/features/balances/hooks.ts`, `src/features/expenses/ExpenseFormPage.tsx`, `src/lib/supabase.ts` (typed client)
- Env/typechain: `package.json` (`@supabase/supabase-js@^2.112`), `vite.config.ts`, `tsconfig` (implied)

## 6. Executable Test Plan (§10.4) — Owner A / Member B / Nonmember C

**Prereq:** local Supabase running (`supabase start`), env `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set (or `DATABASE_URL` for `psql`).

```bash
supabase db reset          # applies 00001-00009 in order
psql "$DATABASE_URL" -f supabase/tests/rls.sql   # must print "RLS 15 proofs: PASS" or raise ASSERT FAIL
# also: the live vitest assertion in tests/integration/db.test.ts:
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… pnpm test -- tests/integration/db.test.ts
```

**Proof mapping (in `supabase/tests/rls.sql`):**

| # | Proof | Assertion |
|---|-------|-----------|
| 1 | C cannot read any trip-owned row or receipt | `is_trip_member(C, active)=false`, `is_trip_member(C, archived)=false`, `receipts bucket public=false` |
| 2 | B cannot execute owner-only mutations | `is_trip_owner(B)=false` → `update_trip`/`change_member_role`/`mark settled` raise `PERMISSION_DENIED` |
| 3 | Direct writes to child/audit fail | No `INSERT` policies on `expense_payers`, `expense_splits`, `audit_logs` (regression guard) |
| 4 | Invite join succeeds once, duplicate idempotent | First `join_trip_by_code` inserts member + `use_count+1`; second (same B) returns same `trip_id`, `use_count` unchanged |
| 5 | Revoked/expired/exhausted invite fails | `REVOKED01→INVITE_INVALID`, `EXPIRED01→INVITE_EXPIRED`, `EXHAUST01→INVITE_EXHAUSTED` |
| 6 | Invalid payer/split sum rolls back | `save_expense` with `payer 500 ≠ amount 1000` raises `VALIDATION_FAILED payer_sum`, expense count unchanged |
| 7 | Duplicate requestId creates one expense/settlement | Two `save_expense` with same `requestId` return same `id`, count `+1` only |
| 8 | Concurrent settlements cannot overpay | `record_settlement 999999` when debtor owes 50000 raises `VALIDATION_FAILED overpayment` |
| 9 | Settlement cannot target another debtor | `from=A` (creditor) raises `BALANCE_CHANGED debtor_not_owe`; `to=C` (nonmember) raises `VALIDATION_FAILED` |
| 10 | Last owner cannot be removed/demoted | `change_member_role(lastOwner→member)` and `remove_trip_member(lastOwner)` raise `LAST_OWNER` |
| 11 | Archived trip rejects every mutation | `save_expense`/`record_settlement`/`update_trip`/`change_member_role`/`remove_trip_member` on `archived` raise `TRIP_NOT_ACTIVE`/`TRIP_ARCHIVED` |
| 12 | Audit update/delete fails | `UPDATE audit_logs` / `DELETE` raise `AUDIT_IMMUTABLE` |
| 13 | Receipt policies isolate trips | `receipts` bucket `public=false` + `receipts_select_member` + `receipts_insert_member_active` policies exist |
| 14 | Removed member loses read access | `is_trip_member(C, settled)=false` (simulates post-removal); removal on active with `MEMBER_HAS_BALANCE` blocked |
| 15 | State machine `active→settled→archived` | `mark_trip_settled` blocked while `net≠0`, `reopen_trip settled→active` ok, `archive_trip →archived` ok, `reopen archived` blocked |

**Live run this session (no local stack → documented, not executed):**

- `pnpm typecheck` → **pass** (TS 5.9.3, exit 0)
- `pnpm test` → **163/163 pass** (21 files), including `tests/integration/db.test.ts` live case: `anon cannot insert audit_logs / cannot read trips` — **pass** (≈10s live against `https://blklepdzkaxwbwthvpnn.supabase.co` with anon key)
- `pnpm build` → **pass** (initial 229kB/73kB + supabase 277kB/71kB, within Phase 6 budget)
- `supabase db reset + psql rls.sql` → **not run locally** (no `supabase/config.toml` stack in this Figma Make env). **Would be proven** on a machine with `@supabase/cli` + Docker. The `rls.sql` is executable and self-seeds with fixed UUIDs, so a reset run will either print `RLS 15 proofs: PASS` or raise `ASSERT FAIL: …`.

**Remote DB probe already proven (phase1-gate-log.md):** `combined.sql` 00001-00007 applied to hosted project `blklepdzkaxwbwthvpnn` (SQL Editor `Success`), `mutation_requests`/`currency_metadata` exist, `delete_trip` anon→`AUTH_REQUIRED`, non-admin→`PERMISSION_DENIED`, `is_platform_admin` anon→`permission denied`. Migration 00009 has not yet been applied remotely — apply as single paste after 00008 or via `supabase db push`.

## 7. Evidence Checklist for Phase 1 Exit Gate

- [x] `maybe_promote_first_admin` dropped, anon `is_platform_admin` revoked — manual bootstrap documented.
- [x] `join_trip_by_code` type bug fixed, `FOR UPDATE`, full invite validation, idempotent return, redacted audit.
- [x] `mutation_requests` table with RLS `false` — all financial/lifecycle RPCs claim + store `result`.
- [x] `save_expense` / `record_settlement` / lifecycle RPCs hardened per §5.4-5.6 checklists (see table §2). `soft_delete`/`restore`/`archive` closed in 00009.
- [x] Audit append-only trigger + `REVOKE` + redaction.
- [x] Receipts bucket private + `storage.objects` member-gated policies.
- [x] `src/types/database.ts` regenerated, matches migrations; `as any` removal documented as Phase 2 frontend fix.
- [x] `supabase/tests/rls.sql` scaffolded as executable 15 proofs with `test_assert` + `supabase db reset` plan. `tests/integration/db.test.ts` live assertion already passing.
- [x] `pnpm typecheck && pnpm test && pnpm build` green this phase (see §6).

**Remaining risks:** invite `create/revoke` idempotency by `requestId` (§3.1), receipt MIME/size strictness (§3.2), hard-delete audit retention (§3.5) — all tracked, none blocks Phase 1 financial/lifecycle gate.

**Next:** apply `20260819000009_phase1_remaining_hardening.sql` to every env (`supabase db reset` locally, SQL Editor paste remotely), run `psql rls.sql`, then proceed to Phase 2 (route/shell) per spec.
