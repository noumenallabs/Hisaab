# Phase 3-4 Gate Evidence — Expense / Balance / Money Read-Only Audit

> **Scope:** Spec sections 3.3 (Money), 7.5-7.8, 10.2-10.4.  
> **Files inspected:** `src/features/expenses/ExpenseFormPage.tsx`, `ExpenseDetailPage.tsx`, `money.ts`, `ExpensesPage.tsx`, `schemas.ts`, `hooks.ts`, `api.ts`, `src/features/balances/BalancesPage.tsx`, `SettlementDialog.tsx`, `balanceMath.ts`, `hooks.ts`, `src/lib/currency.ts` (missing), `src/types/database.ts`, `src/data.ts`, `supabase/migrations/00005`, `tests/unit/money.*`, `tests/component/ExpenseForm.test.tsx`, `src/app/routes.tsx`.  
> **Directive:** Read-only audit. No form rewrites in this gate.  
> **Verdict: NOT READY for Phase 3-4 exit.** Money is still INR-hard-coded at the UI boundary; edit preload is timing-brittle; receipt is path-text; balances expose single net not the required quad breakdown; audit/deleted-restore and concurrency are absent. DB `currency_metadata` and idempotent RPCs are forward-ready but the frontend does not honour them.

---

## 1. Spec anchor (what Phase 3-4 must prove)

### 3.3 Money (Locked)
- Persist `amount_minor` (bigint) + `currency` (ISO 4217, upper).
- Never persist float; UI shows **major** units only; never ask for “minor”.
- Trip `base_currency` immutable after first expense/settlement.
- Release-1: single currency = trip base; FX out of scope.
- Precision from shared `currency_metadata` (JPY 0; INR/USD/EUR/GBP/AED/SGD 2).
- Inputs display major; conversion `toMinor/fromMinor` only at domain boundary.

### 7.5 Expense list
- Search description+notes; filter category/date/payer/deleted(filter-for-owners); sort date new/old, amount, updated; group by date; row shows member names, localized date, category, amount, user-share; distinct empty-search vs empty-trip; hide Add when settled/archived.

### 7.6 Expense form (authoritative interaction)
- Typed draft model; fields: description, major amount, read-only base currency, date, category, notes (with remaining), receipt, 1+ payers with major contributions, participants, segmented Equal/Exact/Percent/Shares.
- Equal: deterministic remainder in **selected-member order**.
- Exact: per-user major amounts; live remaining → 0.
- Percent: per-user %; total exactly 100.00%.
- Shares: integer >=0, ≥1 positive; preview derived amounts.
- Always show **total paid vs total**, **total allocated vs total**, **remaining/over**, per-person preview.
- Edit: fetch before init; skeleton; **single reset** with server values; preserve unsaved edits across background refetch; warn on leave when dirty; conflict requires `updated_at` optimistic concurrency sent to RPC.
- Never show raw user IDs or “Minor 1000” copy.
- Receipt: path `trip_id/<expense_id-or-request>/…`, no `..`, private `receipts` bucket, 10 MB, JPEG/PNG/WebP/PDF, signed 10 m, no persisted signed URL, upload progress/cancel/retry/preview/replace/remove.

### 7.7 Expense detail
- Fetch by `(trip_id, expense_id)`.
- Render: description, formatted amount, category, date, **payers+splits with names/avatars**, notes, receipt preview/download, created_by/at, updated_by/at, **expense-specific audit entries**, edit/delete gated by author-or-owner + trip status (active only). Deleted is owner-readable with Restore; normal list excludes deleted.

### 7.8 Balances & settlements
- Cards: formatted **paid / share(owed) / settlements sent+received / net**.
- Suggested transfers: debtor/creditor **names**, exact outstanding, Settle command only when caller is `from_user` or owner; opens `SettlementDialog` with real IDs+names; method is **select/menu** not free text; preserves ref/note after `BALANCE_CHANGED`; refetches + announces after success; settled empty State + owner lifecycle action; conservation invariant (sum nets = 0) holds; `simplifyDebts` deterministic.

### 10.2-10.4 Verification contract (relevant to 3-4)
- **10.2 Unit:** currency metadata/parse/format/bounds (0 vs 2-dec), Equal/Exact/Percent/Shares with deterministic remainder, conservation sum-zero, debt determinism, error-code mapping, returnTo validation, capability, audit redaction/diff. Use property/boundary tests on the production helper, not a copy.
- **10.3 Component:** expense create/edit init + dirty conflict, 4 split modes through interaction, multiple payers, receipt states, role-gated settings, offline blocking, dialog focus/first-invalid focus, loading/empty/error/forbidden/settled/archived.
- **10.4 DB executable (15 checks):** real local Supabase with owner A, member B, nonmember C, active/settled/archived trips, expenses+balances involving A/B — prove RLS isolation, owner-only mutations, no direct child/audit writes, idempotent join, invalid payer/split rollback, duplicate `request_id` single-row, concurrent settlement overpay blocked, settlement wrong-creditor blocked, last-owner protection, archived rejects every mutation RPC, audit immutable, receipt trip isolation, removed-member loses read, state-machine transitions.

---

## 2. Money handling — current evidence vs 3.3

### 2.1 Where 3.3 lives in the repo today

| Concern | DB truth | Frontend truth |
|---|---|---|
| `amount_minor` + `currency` | `expenses`/`expense_payers|_splits`/`settlements` store `bigint` + `char(3)`; `currency_metadata` table (JPY 0, others 2) seeded in `00005` | `money.ts:1-13` + `schemas.ts` handle minor; `currency.ts` **does not exist** — required path `src/lib/currency.ts` in spec 6.1/plan §8 is missing; helpers living in `src/features/expenses/money.ts` instead |
| Decimal precision | `00005` selects `decimals` from `currency_metadata` and rejects unknown currency; `save_expense` validates `amount >0` and payer/split sums equal `amount_minor` | `money.ts:16-35` implements `toMinor(amount, decimals)` / `fromMinor` / `parseCurrencyInput(input, decimals=2)` / `formatMinor(minor)` — default is silently 2 even for JPY/unknown |
| Immutable base currency | `save_expense` checks `currency = base_currency`; `init` has `base_currency` on trips; lifecycle migrations do not yet lock base currency after first write (separate gap) | `ExpenseFormPage.tsx:28-29,85` syncs `baseCurrency = trip.base_currency ?? "INR"` and writes `setValue(currency, baseCurrency)` — correct shape, but `parseCurrencyInput` calls elsewhere ignore it |
| Major-only inputs | RPC expects minor; UI should present major | `ExpenseFormPage.tsx:182-185` shows major input `amountStr` plus live `money()` hint plus hidden `amountMinor`; payer inputs however are `type=number` bound directly to `amountMinor` integers — **violates “never ask minor”** for payers |

### 2.2 The `money.ts` minor-unit formatting bug (still open, P0-06)

`src/features/expenses/money.ts:1-13`:

```ts
export const CURRENCY = "₹"
export function money(n: number): string {
  return (n<0 ? "-" : "") + CURRENCY +
    Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
export function formatMinor(minor: number): string { return money(minor) }
```

- Formats the **raw integer minor** as though it were already major. Persisted `1000` (INR = 10.00) renders `₹1,000`, a **100× overstatement**. Spec + review require `₹10.00`. `formatMinor` drops both `currency` and `decimals` parameters, reintroduces the single-symbol bug in `src/data.ts:25-37` (`CURRENCY = "₹"` with 0 decimals) duplicating the same defect in two modules.
- `money()` is imported by `ExpenseFormPage`, `ExpenseDetailPage`, `ExpensesPage`, `BalancesPage`, `SettlementDialog` and used for every amount shown. Single bug fans out to trip totals, expense detail, balances, splits, settlements.
- Locale fixed `en-IN` + symbol fixed `₹` contradicts ISO-4217 multi-currency contract. `formatMinor(1000)` should be `₹10.00`, `¥1,000`, `$10.00`, `€10.00`, `£10.00`, `AED 10.00`, `SGD 10.00` depending on trip currency and decimals.

**Required fix:** Delete `CURRENCY` constant and `money(n)` as a minor formatter; add `formatMinor(minor, currency, locale?)` that looks up `decimals` via `currency_metadata` (JPY 0, others 2), divides by `10^decimals` (or `fromMinor`), and formats with `Intl.NumberFormat` + `currency`/`currencyDisplay`, honouring 0 vs 2. Keep `money.ts` or promote it to `src/lib/currency.ts` — but the project must own exactly one canonical path (`src/lib/currency.ts` per spec 5.8/6.1) and re-export from the other if kept for imports, or codemod imports to the canonical path.

### 2.3 Minor vs major boundary audit

| Field | Current widget | Unit asked | Spec expectation |
|---|---|---|---|
| Expense amount | `ExpenseFormPage.tsx:182` text `amountStr` + `parseCurrencyInput(amountStr) ?? 0` | **Major ✓** (correct) — hint still prints `money(amountMinor) minor preview` which is the bug + leaks “minor” term |
| Payer contributions | `ExpenseFormPage.tsx:221` `type=number` bound to `p.amountMinor` | **Minor ✗** — user must type `1000` to mean `10.00`; schema `amountPaidMinor .positive()` then requires minor; never uses `parseCurrencyInput` with currency decimals |
| Exact split per-user | `register(splits.${i}.amountOwedMinor)` with `valueAsNumber` | **Minor ✗** |
| Equal split read-only preview | `register(... amountOwedMinor readOnly)` | **Minor ✗** (readOnly but still minor; preview elsewhere also uses `money()` with 0 decimals) |
| Settlement amount | `SettlementDialog.tsx:7-14` `amountStr = String(fromMinor(outstandingMinor))` but `parseCurrencyInput(amountStr)` without decimals; copy says “rup ees with up to 2 decimals”, always `₹` | **Major but currency-blind** — `fromMinor` assumes 2 decimals even for JPY outstanding; dialog hard-codes `₹` in label `AMOUNT — ₹` |

**Required fix:** Every user-editable monetary field becomes a major-string with `parseCurrencyInput(str, decimalsFor(baseCurrency))` → `minor` only at submit boundary; preview helpers call `formatMinor(minor, currency)`; payer and split inputs share the same helper; settlement dialog resolves decimals from the trip’s `baseCurrency` and preserves `trip.currency` equality check (already enforced server-side).

### 2.4 ISO 4217 & precision table gaps

- Missing file `src/lib/currency.ts` — plan fix #8 names it as the target of `parseCurrencyInput`/`formatMinor` major-unit helpers bound to `trip.base_currency` (immutable after first expense). Two modules (`src/data.ts:money` + `src/features/expenses/money.ts:money`) keep independent fixed-`₹` formatters — one should be deleted when the canonical file lands.
- `ExpenseFormPage.tsx:182-183` handles JPY with ternaries `baseCurrency === "JPY" ? "¥" : "₹"` and placeholder branching — covers only 2 of 7 required codes, drops USD/EUR/GBP/AED/SGD, and drops `currency_metadata.symbol` (`AED` is not `₹`). Same hard-code in `SettlementDialog.tsx:53-56`.
- `parseCurrencyInput` in `money.ts:22-31` correctly rejects `parts[1].length > decimals`, but callers pass bare `2` (or omit); a JPY amount `1200` must be parsed as `1200` minor, not `120000`; a JPY input `12.34` must be rejected, not rounded to `1234`.
- Tests in `tests/unit/money.test.ts`/`money.extended.test.ts` exercise `toMinor/fromMinor/parseCurrencyInput` with explicit `decimals` args and do exercise 0-dec edge, but no test asserts JPY 0-dec round-trip through `formatMinor(..., "JPY")` or `AED` symbol or rejection of excessive fraction for JPY, nor that `formatMinor(1000, "INR") === "₹10.00"`.

### 2.5 Currency-aware parse/format — what must exist (spec 3.3 + P0-06 remedy)

```ts
// src/lib/currency.ts (canonical — single source, re-exported by money.ts if kept)
export const CURRENCY_DECIMALS: Record<string, number> = { JPY:0, INR:2, USD:2, EUR:2, GBP:2, AED:2, SGD:2 }
export function decimalsFor(code: string): number
export function parseCurrencyInput(input: string, code: string): number | null // trims, strips commas, validates fraction ≤ decimalsFor(code), toMinor
export function formatMinor(minor: number, code: string, locale?: string): string // Intl.NumberFormat with style:'currency' where appropriate, fallback to symbol+decimals for AED
```

- UI never asks minor; labels use `formatMinor(minor, trip.base_currency)`; error copy must not expose “minor”.
- DB trigger/metadata is truth; UI metadata table must be queryable (already RLS `currency_read_all` to `anon, authenticated`) and cached via a `useCurrencyMetadata` query so formatting stays consistent even after a delay; offline uses last-cached decimals with a stale flag.

---

## 3. Defect matrix — required vs current (the gate table)

> Rows mirror the spec table in `plans/tripsplit-production-readiness-luna-spec.md §2.4` plus the money row; each is an **exit-blocking** row for Phase 3-4. `Phase` = which phase must own the fix (3 = expense/receipt, 4 = balance/settlement, 0/1 = already-closed but still leaking). Status uses: OPEN (must fix before gate), PARTIAL (wired but still leaks), BLOCKED (waiting on Phase 1-2 truth).

| # | Current file(s) | Confirmed problem (evidence) | Required disposition (spec) | Phase | Gate |
|---|---|---|---|---|---|
| 3.3-1 | `src/features/expenses/money.ts:1-13`, `src/data.ts:25-37`, `src/features/expenses/ExpenseFormPage.tsx:182-185`, `ExpenseDetailPage.tsx:69`, `BalancesPage.tsx:66`, `SettlementDialog.tsx:34-56`, `src/lib/currency.ts` **missing** | `money(n)` / `formatMinor(minor)` renders minor as major with 0 decimals and fixed `₹`/`en-IN`; `CURRENCY` duplicated; `formatMinor` takes no `currency`; payer/exact inputs expose minor; settlement dialog hard-codes `₹`; no `src/lib/currency.ts` | Canonical `src/lib/currency.ts` with `decimalsFor` / `parseCurrencyInput(input, currency)` / `formatMinor(minor, currency, locale?)` backed by `currency_metadata` (JPY 0, others 2); replace every `money(minor)` call; all editable fields are major; single source of truth, delete duplicate `src/data.ts:money` in prod imports | 3 | Unit §10.2: parse/format round-trip per currency, bounds, negative/zero, JPY vs INR, symbols; DB: metadata `decimals` |
| 3.3-2 | `src/features/expenses/ExpenseFormPage.tsx:182-183`, `BalancesPage.tsx:66`, `SettlementDialog.tsx:53` | JPY carve-out `baseCurrency==="JPY" ? "¥" : "₹"` — USD/EUR/GBP/AED/SGD all render `₹` | `Intl.NumberFormat` currency-aware or metadata `symbol` map; `AED` must show `AED 10.00` not `₹10.00`; tests cover each locked code | 3 | — |
| 7.5-1 | `src/features/expenses/ExpensesPage.tsx:17-27` | Search only `description` (not notes); no category/date/payer/deleted filter UI; no sort (newest/oldest/amount/updated); no date-grouped mobile section; rows show `category · date · money()` but missing share/payer context; Add expense always enabled | §7.5 complete list: search desc+notes, filters (category, date range, payer, deleted-for-owners), sort, group-by-date, row with name/date/category/amount/share, empty-search vs empty-trip distinct, hide Add when `settled/archived`, skeleton/error/offline/stale states; respect §10.3 | 3 | Component + DB filter proof |
| 7.5-2 | `src/features/expenses/api.ts:29-40`, `hooks.ts:15-22` | `fetchExpenses` filters `is(deleted_at,null)` always — owner cannot see deleted; no pagination/selection; no stale indicator | §7.7 owner-readable deleted with `?deleted=1` filter; §7.5 deleted-state filter for owners; query selection/pagination to avoid unbounded fetch (spec §9.3) | 3 | DB #11 archived immutability + deleted read |
| 7.6-1 | `src/features/expenses/ExpenseFormPage.tsx:26-35,42-56` | **Typed draft** exists (`expenseSchema` + `SaveExpenseInput`) but initializer is seeded from stale `members` on first render: `selectedIds = members.slice(0,2)`, `payerInputs = [{userId:members[0].id, amountMinor:1000}]`; when `useTripMembers` resolves late, init is not re-run; demo fallback `demoMembers` can leak into a real trip when `tripMembers` empty/loading | Remove `src/data.ts` / `src/lib/demo.ts` from prod bundle path; gate form render on `trip`+`members` loaded; initialise **once** from typed real data; treat genuinely empty member list as error not fixture trigger (P0-07). Single draft type derives 6-field model + payers + participants + mode. | 3 | Component §10.3 with delayed members + 1-member trip |
| 7.6-2 | `src/features/expenses/ExpenseFormPage.tsx:30-34,88-138` | Payer UX is raw minor `type=number`; Exact/Eq split inputs register `amountOwedMinor` directly — violates 3.3. Participants toggle resets `percentInputs/shareInputs` but not `amountStr`; mode switch preserves `amountStr` correctly but not payer allocations | Payer + all split modes use **major inputs** through `parseCurrencyInput(str, decimalsFor(baseCurrency))`; preview shows `formatMinor`; totalPaid computed in minor after conversion; `remaining` shown in `formatMinor` with sign colour | 3 | Unit allocation + component |
| 7.6-3 | `src/features/expenses/ExpenseFormPage.tsx:30-96,102-132` | Equal correctly calls `allocateEqual(amountMinor, ids.length)` and deterministic remainder in member order ✓. Percent/Shares incorrectly compute `totalAllocated` as raw percent/shares sum instead of derived minor: `totalAllocated` is `percentInputs.sum`/`shareInputs.sum` not `watch(splits).sum` once allocated — preview condition disagrees with what validator checks. Allocation uses floor+fraction sort, not spec’s Equal “in selectedMember order” (but Percent/Shares correctly use fraction sort — Equal should stay index-order, others by fraction is reasonable; needs explicit spec choice documented). | Equal remainder in **selected-member order** (index) ✓ — verify; Percent/Shares likewise derive minors and preview uses `formatMinor`; live totals always compare **derived minor sums** vs `amountMinor`; add property test that every allocation sums to `amountMinor` and remainder goes to earliest index (Equal) or largest fraction (Percent/Shares) deterministically | 3 | §10.2 |
| 7.6-4 | `src/features/expenses/ExpenseFormPage.tsx:91-96` | `totalAllocated` for Percent/Shares returns raw unit sum, not minor; submit guard `Math.abs(percentInputs.sum - 100) > 0.001` inside `onSubmit` — schema does not reject split-sum mismatch for those modes, so validation is late and message generic | Move 100.00% check into `expenseSchema` refinement keyed by `splitMode` (derive minors then compare sum), or into a mode-aware validator that previews same value the guard checks; Shares also needs changed-fields-free integer check | 3 | — |
| 7.6-5 | `src/features/expenses/ExpenseFormPage.tsx:58-86` | Edit preload exists but is **effect-driven double-init**: initial `defaultValues` seeded from empty/placeholder members, then `useEffect([existing, expenseId])` calls `setAmountStr`, `setSelectedIds`, `setPayerInputs`, `reset(server)` with `as any` casts; no `updated_at` stored; no concurrency token; background refetch can overwrite unsaved edits (effect runs again on `existing` change) | §7.6 Edit contract: fetch before init; show **skeleton** until loaded (partial ✓ `existingLoading` line 165); **reset once** with server; **preserve unsaved edits** across background refetch (gate on first-reset flag); dirty warning is text only — add `beforeunload` + router `unstable_usePrompt`/`useBlocker` when `isDirty`; capture `updated_at` from `existing` and send as `p_expected_updated_at` to `save_expense` for optimistic concurrency; on `CONFLICT`/409 re-fetch, keep user input, show stale banner, require re-confirm | 3 | Component §10.3 dirty/conflict |
| 7.6-6 | `src/features/expenses/schemas.ts:4-48` | `expenseSchema` enforces description 1-160, `amountMinor>0`, `payers>=1` + sum==total, `splits>=1` + sum==total, but missing: expenseDate constrained by product rule, notes length already 2000 ✓, `receiptPath` not validated against `<trip_id>/<expense_id-or-requestId>/` + no `..` (DB does, but schema should mirror for inline error), missing `updatedAt` concurrency field, missing mode-specific refinements | Add `receiptPath` refinement mirroring `00005` path/traversal rules (without duplicating DB as truth — inline error only); add `expectedUpdatedAt?: string` ISO passthrough; if schema owns mode, add `splitMode` enum and mode-specific `splits` refinements; ensure schema and `onSubmit` guard agree on the same derived total | 3 | — |
| 7.6-7 | `src/features/expenses/api.ts:4-12` | `saveExpense(input)` forwards raw payload to `save_expense` RPC as `{ p_payload: input }` with `as any`; `tripId`/`expenseId`/`requestId` overlap between top-level and payload; no `updated_at` passthrough; error mapping is raw Supabase error (UUIDs/stack) | Pass stable `requestId` from `requestIdRef` (already ✓) but ensure **one** contract: callers always pass `requestId`, `tripId`, optional `expenseId`, optional `expectedUpdatedAt`; map DB codes (`TRIP_NOT_ACTIVE`, `CONFLICT`, `BALANCE_CHANGED`, `VALIDATION_FAILED …`) via centralized `src/lib/errors.ts` mapper — never surface raw `PostgREST`/`UUID` to end users | 3 | §10.2 error-code mapping |
| 7.6-8 | `src/features/expenses/ExpenseFormPage.tsx:184,209-212,214-226` | Receipt is a raw **path text input** with helper text “private, tripId/expense/uuid.ext” and placeholder `${tripId}/<expenseId>/receipt.jpg`; no file picker, no upload via `receipts` bucket, no MIME/size check, no progress/cancel/retry, no signed-URL preview/download, no replace/remove | §5.8 private receipt workflow: file picker (JPEG/PNG/WebP/PDF, ≤10 MB), server-generated object path `<trip_id>/<expense_id>/<uuid>.<ext>`, storage policies (members read, active-trip writers create/delete as uploader/author/owner), server MIME+signature check, signed 10 m retrieval without persisted signed URL, preview/download + replace/remove + orphan cleanup; form must not expose or let users edit raw storage paths | 3 | DB #13 receipt isolation + E2E receipt journey |
| 7.7-1 | `src/features/expenses/ExpenseDetailPage.tsx:18-43` | Production fetch exists (`useExpense(tripId, expenseId)` → `fetchExpense` eq `trip_id`+`id`) — **no longer “null in prod”** after recent wiring; `if (supabase && isLoading) skeleton` then `let exp = supabase ? realExp : demo…` then `if (!exp) “Expense not found”`; **null-while-loading then null-after-error both collapse to same message** — leaked in original spec triage as “always null”, now only shows null on not-found / RLS deny / deleted-excluded fetch | Keep `(trip_id, id)` fetch ✓ but distinguish states: loading skeleton, **404** (not found or not in this trip), **403** (member → no access), **deleted** (owner-readable). DB detail should allow owner to fetch deleted (`maybeSingle` + include `deleted_at`) with restore; normal list excludes deleted. Add typed `exp` guards (`as any` × 9) | 3 | DB #1 nonmember deny, #11 archived, owner restore |
| 7.7-2 | `src/features/expenses/ExpenseDetailPage.tsx:29-35,72-88` | Shows names via `memberMap` (built from `useTripMembers` two-step `trip_members → profiles`) but IDs fallback `id.slice(0,8)` shown as text; no avatars; notes displayed; amount via bug `money(amountMinor)`; payers/splits use names but fallback to raw UUID prefix; `Created by` shows `created_by.slice(0,8)` not name | §7.7 requires **member names with avatars**, formatted amount via `formatMinor(minor, currency)`, localized dates, redacted audit. Resolve `created_by`/`updated_by` through same member map or `profiles` join; show `Created by Arun · 17 Aug 2026, 21:40 · Updated by …`; never render raw UUIDs | 3 | A11y table row semantics |
| 7.7-3 | `src/features/expenses/ExpenseDetailPage.tsx:69-71` | Receipt renders as `Receipt: ${exp.receipt_path} (signed preview 10m window — not persisted)` — leaks storage path, no preview/download via signed URL, no auth-gated fetch | Replace with signed-URL preview: `useSignedReceiptUrl(tripId, receipt_path)` → `storage.from('receipts').createSignedUrl(path, 600)`; show thumbnail (image) or PDF icon + Download; owner/author delete-replace; hide path text; redact in audit | 3 | Storage policy test |
| 7.7-4 | `src/features/expenses/ExpenseDetailPage.tsx:49-57,92-106` | Audit history absent; soft-delete exists (`softDeleteExpense(expenseId, uuid)`) with `ConfirmDialog`, no restore; no re-fetch after delete; `deleted` filter absent from list | Add expense-specific audit feed (who/when/what changed, diff of normalized before/after, redacted); owner sees **Restore** for deleted detail; list query respects `?includeDeleted` for owners only; delete/restore are idempotent via `mutation_requests`; audit immutable (§5.7 trigger) | 3 | DB #7 duplicate requestId, #12 audit immutable |
| 7.7-5 | `src/features/expenses/ExpenseFormPage.tsx:22,165`, `ExpenseDetailPage.tsx:24-27` | Skeleton for edit/form is a `div` pulse — no labeled skeleton; `useExpense(enabled: !!supabase && !!tripId && !!expenseId)` means visiting `/expenses/new` still triggers `useExpense(tripId,"")` with `enabled:false` — ok, but header still mounts ExpenseFormPage shell without trip context | Use shared `ExpenseFormSkeleton` + `ExpenseDetailSkeleton` with `aria-busy` and headings; ensure `expenseId` route param absence disables the query and does not create a 404 flash | 3 | Component loading state |
| 7.8-1 | `src/features/balances/BalancesPage.tsx:20-73` | Balance cards render **only `net`** (`money(v)`) with label should receive/owes/settled; missing breakdown paid/owed/sent/received. Data comes from `get_trip_balances` RPC which already returns `{user_id, paid_minor, owed_minor, sent_minor, received_minor, net_minor}` — first four are fetched but **ignored** (`net = Object.fromEntries(map r.net_minor)`) | §7.8 + §4.4: cards must show formatted **paid (from payers), share/owed (from splits), settlements sent/received, net**; re-map RPC rows to `Record<id, {paid,owed,sent,recv,net}>` and render quad with `formatMinor(..., trip.base_currency)` | 4 | Unit conservation holds if RPC truth is shown |
| 7.8-2 | `src/features/balances/BalancesPage.tsx:28-42` | Demo fallback `demoMembers`/`demoNetBalances` triggers whenever `isRealTrip && membersData.length` is falsy — leaked to real trip with empty member response or still-loading members; `isRealTrip` uses regex for UUID but prod trip IDs are always UUID so demo should not appear on real trip at all | Delete `src/data.ts` demo path from `BalancesPage`; treat `isRealTrip` branch as prod-only; empty member list is error state with Retry, not fixture trigger (same P0-07 as expense); add `get_trip_balances` stale indicator if cached | 4 | DB #14 removed member loses read |
| 7.8-3 | `src/features/balances/BalancesPage.tsx:76-93` | Simplified transfers derived via `simplifyDebts(net)` and rendered with names + `money(t.amount)` + Settle button gated correctly (`canSettle = !archived && !settled && supabase && (user.id===fromId || owner)`). **SettlementDialog is now rendered** (`{settle && <SettlementDialog …}` line 93) — original spec “not rendered” row is closed; but dialog is always freshly constructed with `outstandingMinor = t.amount` which is stale after first mount | Dialog now rendered ✓ — remaining defect is stale `outstandingMinor` vs fresh `get_trip_balances` on submit, and no propagation of `paid/owed` context | 4 | — |
| 7.8-4 | `src/features/balances/SettlementDialog.tsx:1-72` | **Method is now a `select`** with `UPI/Cash/Bank Transfer/Card/Other` ✓ — “free-text method” row closed; raw IDs fallback `fromId.slice(0,8)` still present in `aria-labelledby` subtitle `fromName ?? slice`; Escape handled via global `keydown`, backdrop closes; no focus trap, no `aria-describedby` for errors, background scroll not locked correctly (form case). Amount label hard-codes `₹`; `parseCurrencyInput` without currency; `fromMinor(outstandingMinor)` assumes 2 decimals | §7.8 remaining: preserve **names** (`fromName/toName` now threaded correctly from `BalancesPage:93`) but eliminate every `slice(0,8)` fallback in copy; render method `select` already ✓; make dialog an accessible primitive (focus trap inside dialog node not global `document.querySelectorAll`, restore focus to invoker, `aria-modal` + `inert` background, Escape only when not submitting); currency via `decimalsFor(trip.base_currency)` | 4 | A11y §10.6 |
| 7.8-5 | `src/features/balances/SettlementDialog.tsx:31-45`, `src/features/balances/hooks.ts` | Stale/concurrent recovery gap: dialog validates `minor > outstandingMinor` locally but RPC’s real checks are `debtor net <0`, `creditor net >0`, `amount <= min(-debtor, creditor)` under trip lock. On `BALANCE_CHANGED`/`VALIDATION_FAILED overpayment`, dialog shows raw `e.message` (potentially UUID/stack) and **discards user input**? Actually it preserves `amountStr/reference/note` via state but replaces `amountStr` only on open; however it does not refetch balances or keep input after error — spec requires **refresh balances, preserve ref/note, show “balances changed — retry”** with updated `outstanding` | Add `onStale` branch: catch `BALANCE_CHANGED` → `queryClient.invalidateQueries(["balances", tripId])`, re-render `outstandingMinor` from fresh net, keep `reference`/`note`, move focus to amount, show mapped copy; do not close dialog; wire `onSuccess` to both `balances` + `expenses` invalidation and live announce | 4 | DB #8 concurrent overpay, #9 wrong creditor |
| 7.8-6 | `src/features/balances/balanceMath.ts:11-53`, `src/data.ts:217-265` | `netBalances` uses `Math.round(net[id])` on floats (helpers demo-only) — prod nets are integers so harmless but legacy float path remains in `src/data.ts` copy. `simplifyDebts` is greedy largest-first, id-sorted tie-break — deterministic ✓ but not tested for conservation or for minimal-transfer-count property; both files duplicate the same algorithm | Keep integer-only `balanceMath.ts` as canonical; add conservation assertion `Object.values(net).sum === 0` in production derivation and in tests; `simplifyDebts` spec gap: document algorithm as deterministic largest-first with `localeCompare` tie-break, and test that it is deterministic (sorted inputs) and that reconstructed balances from transfers preserve `sum==0` | 4 | §10.2 conservation + debt determinism |
| 7.8-7 | `src/features/balances/hooks.ts:4-16` | `useBalances(tripId)` calls `get_trip_balances(p_trip_id)` — correct; but `BalancesPage.tsx` invalidation after settlement only revalidates `["balances",tripId]` and `["expenses",tripId]` — ok; Realtime subscription missing, so two-context convergence requires manual refresh | Wire `src/lib/realtime.ts` or `useQuery` Realtime invalidation for `balances`/`expenses`/`settlements`; exit gate §4.4–4.6 requires two browser contexts converge without manual refresh | 4 | E2E 10.5 Realtime |
| 10.2-1 | `tests/unit/money.test.ts`, `money.extended.test.ts` | Existing unit tests exercise `toMinor/fromMinor/parseCurrencyInput/allocate*` but none assert **currency metadata** property (JPY 0 vs others 2), nor `formatMinor(1000, "INR") === "₹10.00"` vs `formatMinor(1000,"JPY")==="¥1,000"` vs `AED` symbol | Add parametric tests (below) | 3-4 | — |
| 10.3-1 | `tests/component/ExpenseForm.test.tsx` | Only two shallow assertions (heading exists, `input[readonly]` not null); no interaction, no 4 modes, no multiple payers, no dirty, no archived, no offline | Add component suite §10.3 (below) — must fail when target behaviour broken, not heading-only (spec §10.7) | 3 | — |
| 10.4-1 | `supabase/tests/rls.sql` | Comments-only per spec §2.2; no executable assertions; `tests/integration/api.test.ts` checks rejected promises, not RLS, not conservation, not idempotency | Add 15 DB checks (below) against local Supabase stack with seeded owner A, member B, nonmember C, active/settled/archived trips | 1-4 | — |

---

## 4. Cross-cutting gaps the matrix above references

### 4.1 Edit preload / dirty / concurrency (§7.6 — spec line: “If the expense changed since loaded, require conflict resolution rather than silently overwriting. Add `updated_at` optimistic concurrency to the RPC.”)

- **Current:** `useEffect([...])` unwatched refetch overwrite. `isDirty` shows amber text but there is no `beforeunload`/`useBlocker`, no navigation prompt via `src/app/routes.tsx`. No `updated_at` in `SaveExpenseInput` (`schemas.ts` has none) and `save_expense(p_payload)` does not check it. Concurrent second writer’s `pay/split sums` overwrite first writer’s without conflict code.
- **Required:** Snapshot `loadedAt = existing.updated_at` on first reset (use `isInitialRef`), send as `p_expected_updated_at` or `payload.expectedUpdatedAt`, add `if exists.updated_at <> expected then raise exception 'CONFLICT'` before mutating. Client maps `CONFLICT` → stale banner (“Expense was edited by … at … — review changes”) with diff + keep input + refetch expense, do not close form. E2E induces conflict via a second context or direct `save_expense` call mid-edit.

### 4.2 Status + capability derivation (§7.7-7.11 — trip lifecycle)

- **Current:** `ExpenseFormPage.tsx:27,141-143` blocks `isArchived` only on submit with raw `throw "Archived trips are read-only."` and disables submit button; `ExpensesPage` always shows Add; `ExpenseDetailPage:22` marks archived read-only for Edit/Delete; `BalancesPage:29-30` marks archived/settled banners. But capability is not derived from a single `useTripCapability(trip, role, status)` helper, so settled/archived checks are duplicated and diverge. `remove_trip_member`/`mark_trip_settled` correctness lives DB-side; UI does not gate Settled correctly for expense creation.
- **Required:** One capability derivation (`canCreateExpense`, `canEditExpense(expense, role, status)`, `canDeleteExpense`, `canRestoreExpense`, `canSettle`) consumed by List/Detail/Form/Balances/Settings; hide or disable creation when not `active`; List adds “Add expense” hidden when settled/archived; Detail disables Edit/Delete with same predicate; Balances disables Settle. Spec §10.3 “role-gated settings” + “forbidden/settled/archived states” must have component states.

### 4.3 Raw IDs in user copy (§7.6 last line “Never display raw user IDs”, §7.7-7.8)

Still leaks at:
- `ExpenseFormPage.tsx:246` `members.find(...)?.name ?? id.slice(0,8)` — slice fallback shows UUID prefix to users.
- `ExpenseDetailPage.tsx:31-33` `nameOf → id.slice(0,8)`, `Created by {exp.created_by?.slice(0,8)}`, `p.user_id ?? p.userId` key fallback.
- `BalancesPage.tsx:85,93` `members.find(... )?.name` with same fallback; line 82 uses `membersData?.find(role==="owner")` for settle gate but no name fallback policy.
- `SettlementDialog.tsx:52` `{fromName ?? fromId.slice(0,8)} → {toName ?? toId.slice(0,8)}` and `Outstanding {money(outstandingMinor)}` with bug.

Rule: no branch renders a minified UUID. Show “Unknown member” with a degraded-id tooltip only in dev/test; prod shows topology (e.g. “Loading member…” with retry) or suppresses action until members refetch succeeds. Pass thread-stable `trip_members` cache into detail/balance; on cache miss, show error not prefix.

### 4.4 Receipt path validation gap

`ExpenseFormPage.tsx:209` is only UI hint: `Receipt path <trip_id>/…` text + placeholder. DB (`00005 save_expense`) correctly rejects `..` and requires prefix `trip_id/` — but inline UX never shows field-level error, and there is still no storage flow. `schemas.ts` should carry a zod refinement so field error appears inline, not only as RPC `VALIDATION_FAILED receipt_path`.

### 4.5 Deployment-demo leakage (P0-07, spec 3.5)

Imports still present in prod routes:
- `src/features/expenses/ExpenseFormPage.tsx:8` `import { members as demoMembers } from "@/data"`
- `src/features/expenses/ExpenseDetailPage.tsx:3` `initialExpenses`
- `src/features/expenses/ExpensesPage.tsx:4` `initialExpenses, categoryMeta`
- `src/features/balances/BalancesPage.tsx:6-11` `initialExpenses, initialSettlements, members as demoMembers, netBalances as demoNetBalances`

Any of these imports reaches the prod chunk and the `!supabase ? demo : real` ternary preserves business logic on demo data. `getSupabase()===null` (missing env) should be a **configuration error screen**, not a silent demo render, per spec 3.5. Member initialization fallbacks already noted are the observable leak.

---

## 5. Money precision gaps (what “JPY 0, others 2” must close)

### 5.1 The table

| Code | `currency_metadata.decimals` | `symbol` | `formatMinor(0)` | `formatMinor(1)` | `formatMinor(100)` | `formatMinor(1000)` | `parse("0.5")` | `parse("0.015")` |
|---|---|---|---|---|---|---|---|---|
| JPY | 0 | `¥` | `¥0` | `¥1` | `¥100` | `¥1,000` | → 1? `0.5` rounds .5→1 minor for JPY — **must reject** `fraction > 0` (return null), not round | null (reject >0 fraction) |
| INR | 2 | `₹` | `₹0.00` | `₹0.01` | `₹1.00` | `₹10.00` | `50` | null (reject 3 fraction) |
| USD | 2 | `$` | unchanged shape |
| EUR | 2 | `€` |
| GBP | 2 | `£` |
| AED | 2 | `AED` | `AED 0.00` / locale `AED 1.00` (no single-char) |
| SGD | 2 | `$` | Needs `locale` or `currencyDisplay` to disambiguate SGD `$` from USD `$` — spec allows ambiguity but tests must lock behaviour |

### 5.2 What current `money.ts` gets wrong per row

- `money(1)` with 0-dec formatter prints `₹1` as though `1` minor JPY were `¥1` — accidentally correct for JPY magnitude but prints wrong symbol and wrong grouping (`en-IN` groups `1,000` correctly for INR but JPY grouping should be `ja-JP`/`en` for `¥1,000` — minor difference). For INR 2-dec, `money(1)` prints `₹1` not `₹0.01` — 100× overstatement.
- `parseCurrencyInput("0.5", 2)` → `50` correct for INR; `parseCurrencyInput("0.5", 0)` → `1`? Current impl `toMinor(0.5,0)=Math.round(0.5)=1` then returns 1 minor — but JPY should reject fraction, not round. Spec says “Currency decimal precision comes from metadata. JPY uses 0” — implies `12.34` JPY minor cannot be represented; the input `12.34` must be rejected (return null), not rounded to `12`. Current `parts[1].length > decimals` correctly rejects `12.34` for `decimals=0`, but `.5` with `decimals=0` has length 1 and is rejected → `null` (correct). Good.
- `formatMinor` never receives `currency`, so after the fix no call site can decide JP vs IN.

### 5.3 Required helpers and where they live

- Keep `src/features/expenses/money.ts` only as re-export shim or delete; canonical file is `src/lib/currency.ts` per spec tree `src/lib/currency.ts`. Migrate all imports to `@/lib/currency`.
- Helpers:

```ts
// decimalsFor(code): number | null  — from currency_metadata cache, fallback to allowlist
// toMinor(amountMajor: number, code: string): number
// fromMinor(minor: number, code: string): number
// parseCurrencyInput(input: string, code: string): number | null  — uses decimalsFor(code)
// formatMinor(minor: number, code: string, locale?: string): string
// formatMinorParts(...): { integer, fraction, symbol } for card breakdown
```

- Bounds: `toMinor` should reject non-finite, `abs(minor) > Number.MAX_SAFE_INTEGER` guard, and amount bounds the product owner sets (e.g. >0 and < 10⁹ minor) surfaced as `VALIDATION_FAILED amount` copy.
- All callers pass `trip.base_currency` (or the expense’s persisted `currency` for historical detail) — list/detail/balance cards alike. Payer/split amounts also go through this path.

---

## 6. Test plan for allocation / conservation (the “money stays correct” gate)

> All tests must exercise the **production helper** (`@/lib/currency` / `@/features/expenses/money` canonical) per spec §10.2, not copied logic. Each test must fail when the invariant is deliberately broken (§10.7).

### 6.1 Unit — allocation, deterministic remainder

| ID | Suite | Assertion (production invariant) | Type |
|---|---|---|---|
| U-MONEY-01 | Currency metadata | `decimalsFor("JPY")===0`, `INR===2`, … each locked code; unknown returns null and `parseCurrencyInput("12.34","JPY")===null` | Table-driven boundary |
| U-MONEY-02 | Parse | Round-trip: `fromMinor(parseCurrencyInput(input,code),code)` ≈ `Number(input)` for valid inputs; rejects leading `+`, lone `.`, `..`, letters, comma misplace, `fractionLen > decimals` | Parametric |
| U-MONEY-03 | Parse/format round-trip | `parseCurrencyInput(formatMinor(m, code, "en-US"), code) === m` for random `m` in `[0..9_999_999]` for each code; negative `-m` formats `-"` + symbol | **Property-based** (fast-check / Vitest) — 200 iterations per code |
| U-MONEY-04 | Bounds | `toMinor(99999.99, "INR")<Number.MAX_SAFE_INTEGER`; `parseCurrencyInput("1e6",code)` null or bounded; amount 0 and negative amount rejected at schema (not parser) | Boundary |
| U-MONEY-05 | Equal | `allocateEqual(totalMinor, n)` sums to `totalMinor`; remainder 1 goes to first indices in **selected order**; `allocateEqual(0,3)===[0,0,0]`; property over `(total in 0..9_999, n 1..9)` | Exhaustive + property |
| U-MONEY-06 | Exact | `allocateExact(total, exacts)` sums==total else null; order preserved; property: random `exacts` shuffled still validates on sum | Deterministic |
| U-MONEY-07 | Percent | `allocatePercent(total, pcts)` sums==total iff `sum(pcts)==100.00%` within `1e-9`; rejects 99.99 and 100.01; deterministic: largest fraction gets remainder; test with `total 100` and `total 1` (1 minor) | Parametric |
| U-MONEY-08 | Shares | `allocateShares(total, shares)` sums==total, `totalShares<=0||negativeShare` → null; zero share gets 0; deterministic fraction tie-break | Parametric |
| U-MONEY-09 | Error mapping | `mapDbError("TRIP_NOT_ACTIVE")` → user copy “Trip is settled/archived — …”; `VALIDATION_FAILED receipt_path` → inline receipt error; no UUID/stack leak; redaction test | Unit |

Existing suites `money.test.ts`/`money.extended.test.ts` already cover many of U-MONEY-05..08 shapes but must be **rewired to call currency-aware helpers** with the new signatures and must add U-MONEY-01..04 and format tests for `₹10.00` vs `¥1,000`.

### 6.2 Unit — conservation & debt simplification (the gate’s “money never leaks” invariant)

| ID | Suite | Assertion | Evidence |
|---|---|---|---|
| U-CONS-01 | Conservation (demo helpers) | `netBalances(expenses, settlements, memberIds)` satisfies `sum(net)===0` for random expenses+settlements | Current `balanceMath.ts:netBalances` already computes `+payers − splits + sent − received`; test must assert sum zero holds after round-trip via `simplifyDebts` |
| U-CONS-02 | Conservation (RPC truth) | Seeded DB with 2 expenses + 1 settlement derived from §4.4 expects `get_trip_balances(p_trip_id)` rows `sum(net_minor)===0` and `sum(paid)-sum(owed)+sum(sent)-sum(received)===0` | Executable DB test (see §7 below) mirrors the same invariant from SQL |
| U-CONS-03 | Settlement conservation | Applying any valid `record_settlement(from,to,amt)` preserves `sum(net)===0` before and after; overpay or wrong-creditor cases are rejected and also preserve sum | Determinism companion to DB #8/#9 |
| U-SIMP-01 | Simplify determinism | `simplifyDebts(net)` is deterministic: same greedy largest-first + `localeCompare` tie-break for equal `amt`; permutation of `Object.keys(net)` does not change output | Property test: shuffle keys, compare transfer list |
| U-SIMP-02 | Simplify pays exact | Transfers `sum(amount) === sum(positive nets)` and each `from` was debtor, `to` creditor, no self-transfers | Property over random nets summing to 0 |
| U-SIMP-03 | Simplify minimality note | Greedy largest-first is minimal in cash-flow sense for this spec; test documents choice (not provably minimal transfers for all graphs) but asserts no zero-amount transfers | — |

### 6.3 Component — the 4 modes through UI (spec §10.3)

- **ExpenseForm mount:** Given mocked `useTrip({base_currency:"INR"})` + `useTripMembers([u1,u2,u3])` delayed 120 ms, assert skeleton shown, then form initialized **once** with correct participant chips and payer row; changing amount from `10.00` to `10.01` reallocates Equal remainder correctly (`[334,333,333]→[334,334,333]`); snapshot the paid vs total / allocated vs total / remaining lines.
- **Exact:** Enter per-user majors `4.00`+`6.00` for total `10.00`, assert `remaining 0.00 ✓`; enter `4.00`+`5.00` → `remaining ₹1.00 (overallocated?)` in copy and `Save` disabled via zod `Split sum must equal total`.
- **Percent:** Enter `50`,`50` → derived splits equal; `50,30,19.99` → schema rejects non-100.00% with inline error; `allocatePercent` fraction tie-break deterministic visible in preview order.
- **Shares:** Enter shares `1,2,0` with total `90.00` → preview `30,60,0`; enter `0,0` → Shares error “at least one positive”.
- **Multiple payers:** Add payer `u2` with `5.00` and `u1` `5.00` vs total `10.00` → `Total paid ✓`; enter `6.00+5.00` → remaining `-1.00`.
- **Dirty & conflict:** Mount in edit mode with fetched `expense {updated_at:"2026-08-18T10:00:00Z"}`; change description (isDirty) → navigate attempt triggers blocker text; mock a background refetch arriving with `updated_at` bumped by another actor, then `saveExpense`→`CONFLICT` → assert stale banner preserved input, retry after refresh succeeds (spy `mutationRequests` idempotency).
- **Settled/archived:** Trip `settled` hides Add; form “Settled —” guard; trip `archived` disables Save and shows read-only alert; balances hide Settle when settled.
- **Settlement stale:** Open Settle with `outstanding 400`, mock `record_settlement` throwing `BALANCE_CHANGED creditor_not_owed`, assert dialog stays open, `reference`+`note` preserved, `outstanding` banner updates after `balances` refetch, submit with fresh `amountMin` succeeds.
- **Offline blocking:** `navigator.onLine=false` or `src/lib/network.ts:useOnline()` mocked false disables `Save`/`Confirm` with tooltip and `aria-disabled` + live announcement.
- **Dialog focus:** Open settlement → focus lands on Amount; `Tab` traps inside dialog, `Shift+Tab` wraps; `Escape` closes only when not submitting; failed submit focuses error summary / first invalid.

### 6.4 E2E — journeys §4 + §10.5 required for 3-4

- **Expense lifecycle (§4.3):** As owner A, create trip, add expense with Equal (4 participants), verify payer==total and split==total preview, save, see expense in list grouped by date, open detail proves member names/avatars + receipt placeholder + audit entry, edit with preload, change amount and save, assert `updated_at` bump and audit diff, soft-delete then filter `deleted` as owner, restore, retry with same `request_id` → original result, no duplicate row (DB `mutation_requests` proof alongside UI).
- **Balance/settlement (§4.4):** Member B creates a second expense flipping the net; balances show non-zero suggested transfer with real names and `₹`/`$` correct; debtor B settles partial amount via `select` method; concurrent settlement from two contexts attempts overpay → one receives `BALANCE_CHANGED`; balances converge after Realtime or poll without manual refresh; settled-zero shows settled state and owner can `mark_trip_settled`.
- **Deep-link & refresh (§10.5):** Direct visit to `/trips/:id/expenses/:expenseId` and `/expenses/:id/edit` renders correctly after refresh; back/forward retains shell; two contexts (owner + member) see Realtime expense insert.
- **Receipt (§5.8):** Upload 1 MB JPEG → progress → signed preview → replace → remove; nonmember fetch returns 403; revoked invite cannot read receipt.
- **Forbidden:** Nonmember C direct-navigating to settled/archived trip expense detail gets 403/404 not demo fallback.

### 6.5 Existing tests — disposition before gate re-run

- Keep `tests/unit/money.test.ts` / `money.extended.test.ts` but **update import** to `@/lib/currency` and add U-MONEY-01..04, U-MONEY-03 round-trip property for each currency, U-CONS-01, U-SIMP-01.
- Replace `tests/component/ExpenseForm.test.tsx` shallow 2-case suite with the interaction suite above — current cases are heading-only and will violate spec §10.7 quality gate (they do not fail when a split mode is broken).
- Add `tests/unit/currency.test.ts`, `tests/unit/balanceMath.test.ts`, `tests/component/Balances.test.tsx`, `tests/component/SettlementDialog.test.tsx`, `tests/component/ExpenseDetail.test.tsx` as enumerated.

---

## 7. Executable DB proof required before green (spec §10.4 — the 15 checks, 3-4-relevant subset highlighted)

Phase 3-4 cannot be declared green without a **fresh `supabase db reset`** run proving the 15 checks against seeded owner A / member B / nonmember C + active/settled/archived trips + expenses+balances involving A/B. File `supabase/tests/rls.sql` is still comments-only — gate is blocked.

| # | Check (spec 10.4) | 3-4 relevance | What the SQL proves |
|---|---|---|---|
| 4 | Invite join succeeds once; duplicate join idempotent | Ship (baseline) | Repeated `join_trip_by_code` same code as same user returns same `trip_id` without incrementing `use_count` |
| **6** | Invalid payer/split sum rolls back all rows | **3** | `save_expense(payer_sum!=total)` raises `VALIDATION_FAILED payer_sum` and no `expenses` + no `expense_payers/splits` committed |
| **7** | Duplicate `request_id` creates one expense/settlement | **3-4** | Two `save_expense(requestId=X)` and two `record_settlement(requestId=Y)` each return original `id` / `result` and insert once (`mutation_requests` PK) |
| **8** | Concurrent settlements cannot overpay | **4** | Two concurrent `record_settlement(from=debtor, to=creditor, min+1)` under trip lock — one succeeds, one `BALANCE_CHANGED`/`VALIDATION_FAILED overpayment` |
| **9** | Settlement cannot target another debtor | **4** | `record_settlement(from=creditor, to=other, amt)` → `BALANCE_CHANGED debtor_not_owe` (or `creditor_not_owed`) even when debtor net <0 and creditor net>0 checks are order-explicit |
| 11 | Archived rejects every mutation RPC | 3-4 | `save_expense`/`soft_delete_expense`/`restore_expense`/`record_settlement`/`update_trip`/`change_member_role`/`remove_trip_member`/`mark_trip_settled`/`reopen_trip`/`archive_trip` on `archived` trip each raise `TRIP_ARCHIVED`/`TRIP_NOT_ACTIVE` |
| 12 | Audit `UPDATE`/`DELETE` fails | 3-4 | `update audit_logs set …` and `delete from audit_logs` both raise `AUDIT_IMMUTABLE` (except the allowlisted hard-delete path) |
| **13** | Receipt policies isolate trips | **3** | Member of trip T can `select`/`insert` (`receipts` storage `objects` path `T/…`); member of trip U cannot; anon cannot; `receipt_path` without `T/` rejected by `save_expense` |
| 15 | `mark_trip_settled`/`reopen_trip`/`archive_trip` state machine | **4** | `mark_trip_settled` only `active→settled` and only when `get_trip_balances` all `net_minor==0`; `reopen` only `settled→active`; `archive` edges `active|settled→archived`; none leave `archived` |

Run profile:

```bash
supabase db reset              # apply 00001-00008
pnpm test --run                # 10.2 unit (must include U-MONEY / U-CONS suites)
pnpm test --run supabase/tests # pgTAP or sql runner executing rls.sql assertions
# optional one-command:
psql "$SUPABASE_DB_URL" -f supabase/tests/rls.sql
```

---

## 8. File-by-file fix summary for the PR (what this evidence says to change, not the change itself)

- **`src/lib/currency.ts` (new canonical)** — create with `CURRENCY_DECIMALS`, `decimalsFor`, `parseCurrencyInput(input,currency)`, `formatMinor(minor,currency)`, `formatMajor` helpers, based on `currency_metadata`; RLS-readable metadata cache.
- **`src/features/expenses/money.ts`** — delete duplicated `CURRENCY`/`money(n)` or convert to `export * from "@/lib/currency"` shim; `formatMinor(minor: number)` signature deleted; callers migrate.
- **`src/data.ts`** — delete `CURRENCY`/`money` export or stop importing it into any `src/features/**` component; demo fixtures move to `tests/fixtures/` only.
- **`src/features/expenses/ExpenseFormPage.tsx`** — major-only inputs for amount + payers + Exact splits via `parseCurrencyInput(str, baseCurrency)`; fix `totalAllocated` to derived minor; add mode refinements; guard edit preload (single reset + preserve-dirty + `updated_at` snapshot), add `beforeunload`/`useBlocker`, wire `expectedUpdatedAt` into `saveExpense` payload; replace raw path field with `<ReceiptField>` wired to private bucket; replace `slice(0,8)` fallback; inline `receiptPath` validation; use `formatMinor(..., baseCurrency)`.
- **`src/features/expenses/schemas.ts`** — add `receiptPath` prefix/traversal refinement, `expectedUpdatedAt?: string`, optional `splitMode` for mode-aware split refinements.
- **`src/features/expenses/api.ts` + `hooks.ts`** — add `expectedUpdatedAt` to `SaveExpenseInput`; no `as any`; `fetchExpense` optionally include deleted for owners (or add `fetchExpenseIncludeDeleted`); `fetchExpenses` add `includeDeleted` param.
- **`src/features/expenses/ExpensesPage.tsx`** — add search notes, filters, sorts, group, hidden-Add when `!active`, empty-search vs empty-trip, owner deleted filter, proper loading/error/offline.
- **`src/features/expenses/ExpenseDetailPage.tsx`** — typed expense+members+audit join; names+avatars; `formatMinor`; `ReceiptPreview` signed URL; audit feed; owner Restore; distinguish 404/403/deleted; no fallback demo data.
- **`src/features/balances/BalancesPage.tsx`** — map full RPC rows to quad cards (`paid/owed/sent/recv/net` via `formatMinor`); drop `src/data.ts` imports and demo fallback; handle empty-member error; keep `SettlementDialog` but propagate fresh `outstanding`; announce and refetch on success; two-context Realtime.
- **`src/features/balances/SettlementDialog.tsx`** — currency-aware `parseCurrencyInput(amountStr, trip.base_currency)` + `fromMinor(outstanding, currency)`; label `AMOUNT — {symbol}`; error mapping not raw IDs; keep `select` method; add focus trap/restore, `inert` background, preserve ref/note on `BALANCE_CHANGED` stale branch and refetch balances.
- **`src/features/balances/balanceMath.ts`** — no behavioural change required, but document as canonical vs `src/data.ts` duplicate; add conservation assert.
- **`src/types/database.ts`** — regenerate after the (optional) receipt storage policy migration; remove `as any` casts around `save_expense`/`record_settlement`/`get_trip_balances` returns (already partly typed).
- **`src/app/routes.tsx`** — no route change required for 3-4, but guard Add-expense nav from `BalancesPage` correctly.

---

## 9. Risks & what remains unverified at this gate

- `supabase/tests/rls.sql` is still comments-only — all 15 checks are **unproven** until a local `supabase db reset` + `mutation_requests` + lifecycle/receipt proofs run.
- `supabase/migrations/00005` receipt bucket exists but **no storage RLS policies** are created — member/nonmember isolation unchecked (risk: receipts readable by any authenticated user of any trip).
- `save_expense` `audit_logs` previous/new insert order was swapped in early audits and the 00005 `jsonb_set` + `v_prev` placement still needs an exact DB diff proof (`create`→`previous null`, `update`→normalized before vs after).
- `updated_at` concurrency is not yet in DB or UI — concurrent edit overwrite is unguarded.
- Demo leakage (`src/data.ts` / `src/lib/demo.ts` imports) still present in prod bundle graph — a build without `VITE_SUPABASE_URL` silently renders demo trips/balances.
- Route-level `TripDashboard` (`/trips/:tripId` index) still lazy-loads the legacy 1,551-line demo shell beside the real feature pages — not in 3-4 scope but competes for shell ownership.
- E2E §10.5 (direct/refresh/back-forward/2-context Realtime/offline/conflict/receipts) not exercised; current component and E2E suites use catches/skips and heading-only asserts per §2.2.

---

## 10. Test commands for the reviewer to close this gate

```bash
# Phase 3 unit (after currency fix):
pnpm test --run tests/unit/money.test.ts tests/unit/money.extended.test.ts
pnpm test --run tests/unit/currency.test.ts          # NEW — U-MONEY-01..09
pnpm test --run tests/unit/balanceMath.test.ts        # NEW — U-CONS-01 + U-SIMP-01..02 (property)
pnpm test --run tests/component/ExpenseForm.test.tsx  # MUST FAIL without 4-mode wiring
pnpm test --run tests/component/Balances.test.tsx     # NEW — quad cards + stale recovery

# Phase 4 DB gate (local Supabase must be up):
supabase db reset
psql "$SUPABASE_DB_URL" -f supabase/tests/rls.sql     # must contain 15 assertions, including #6,#7,#8,#9,#13
```

Gate is **closed** only when: money renders `₹10.00` not `₹1,000` for INR and `¥1,000` for JPY, no payer/split field accepts minor, every `allocate*` sum equals `amountMinor`, conservation `Σ net == 0` holds on RPC balances before and after settlement, duplicate `request_id` creates one row, concurrent overpay is rejected, archive rejects every mutation, and no user-facing string contains a raw UUID.

