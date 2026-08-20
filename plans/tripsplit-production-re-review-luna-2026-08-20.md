# TripSplit Production Re-Review and Luna Implementation Plan

> **For Luna:** REQUIRED WORKFLOW: implement this plan gate-by-gate. Start at Gate A, run every named test, attach raw evidence, and stop at the end of each gate for review. Do not mark a gate complete from static inspection, test discovery, skipped tests, conditional assertions, or earlier status documents.

**Goal:** Make the current TripSplit implementation releasable by closing the remaining security, data-integrity, usability, accessibility, and verification defects.

**Architecture:** Keep React 19, Vite 8, Tailwind CSS v4, React Router, TanStack Query, React Hook Form, Zod, Supabase Auth/Postgres/Storage, Vitest, and Playwright. Client writes remain RPC-only. PostgreSQL, RLS, and Storage policies are authoritative; client validation is only an additional usability layer.

**Tech Stack:** Node 22, pnpm 9, TypeScript 5.9, Supabase CLI 2.115, PostgreSQL, Vitest 3, Playwright 1.52, axe-core.

**Base specifications:** `plans/tripsplit-production-readiness-luna-spec.md` followed by `plans/tripsplit-production-review-luna-2026-08-19.md`, then this document. This document controls where they conflict.

## 1. Verdict

**Current release verdict: NOT RELEASABLE.**

The implementation has improved substantially, but the release verdict cannot change because:

1. The required test suite is red.
2. CI permits database and accessibility checks to pass without executing them.
3. The SQL suite contains false-positive exception tests.
4. The locked normal-user account model is still replaced by an obsolete admin-only UI and route model.
5. Receipt authorization and server-side file restrictions are bypassable.
6. Expense receipt paths can be orphaned or attached to the wrong expense.
7. Hard deletion destroys the audit and idempotency evidence it claims to preserve.
8. Important dialogs remain inaccessible.
9. Historical release evidence says GREEN when current executable evidence is red.

No production deployment, public beta, payment collection, or real receipt upload is permitted until every gate in section 8 is green.

## 2. Evidence Snapshot, 2026-08-20

### 2.1 Fresh commands

| Command | Result | Release meaning |
|---|---:|---|
| `pnpm typecheck` | PASS | TypeScript compiles. |
| `pnpm build` | PASS | Vite build completes; main app chunk is 73.66 kB gzip and Supabase chunk is 70.71 kB gzip. |
| `pnpm test` | **FAIL: 178 passed, 1 failed** | The live RLS test reached the configured remote endpoint and returned `TypeError: fetch failed`. This is connectivity failure, not RLS proof. |
| `pnpm exec playwright test --list` | 78 tests discovered | Discovery proves only that tests parse. |
| `pnpm test:e2e` | **FAIL: 48 passed, 30 failed** | Core auth, trip creation, invite, expense, archive, and 200% accessibility flows are not release evidence. |
| `pnpm exec supabase db reset` | PASS; migrations `00001` through `00015` applied | A reset proves migration applicability, not authorization behavior. |
| `psql ... -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql` | Exit 0; prints `RLS 15 proofs: PASS` | The suite is not trusted until its false-positive patterns are replaced. |

### 2.2 Direct database probes already performed during this re-review

- A nonmember returned zero rows for trips and expenses.
- The current `authenticated` role cannot directly update `profiles`; the earlier self-promotion route is therefore not executable in the current local grants.
- The `receipts` bucket is private.
- The `receipts` bucket has `file_size_limit = null` and `allowed_mime_types = null`.
- A rolled-back authenticated Storage insert accepted a 20 MB `.exe` under an arbitrary second path segment.
- Policies from migrations `00009` and `00011` coexist and are OR-combined; the weaker `00009` insert policy defeats the stronger path-extension condition in `00011`.

These observations narrow the current risk but do not replace permanent regression tests.

### 2.3 Evidence integrity rules

- A passing build is not a passing product test.
- A private bucket is not a secure receipt implementation.
- A policy-name assertion is not an authorization proof.
- An exception block must fail if the target statement unexpectedly succeeds.
- A browser test that catches an assertion, conditionally avoids it, or calls `test.skip()` at runtime is not release evidence.
- Demo-mode browser behavior is not evidence for Supabase production behavior.
- A remote Supabase failure is not interchangeable with deterministic local database testing.

## 3. P0 Release Blockers

### P0-01: CI and local verification are fail-open

**Evidence**

- `.github/workflows/ci.yml:12,21,30,45,62,74` uses Node 20 while `.mise.toml` and the project contract require Node 22.
- `.github/workflows/ci.yml:52` still succeeds without local Supabase.
- `.github/workflows/ci.yml:55` skips SQL tests when `DATABASE_URL` is absent.
- `.github/workflows/ci.yml:64` installs Chromium only, while `playwright.config.ts:20` uses iPhone 12 WebKit for the mobile project.
- `.github/workflows/ci.yml:79` is a literal axe placeholder.
- `.github/workflows/ci.yml:37` emits only a warning when the JavaScript budget is exceeded.
- `tests/integration/db.test.ts:8-10` reads only migrations `00001` and `00002`, so its static checks ignore migrations `00003` through `00015`.
- `tests/integration/db.test.ts:55` skips the only live case when environment variables are absent.
- `e2e/a11y.spec.ts:25` uses `{ width: 390, h: 844 }`; both 200% tests fail before navigation.
- `e2e/admin.spec.ts`, `e2e/flows.spec.ts`, `e2e/invite.spec.ts`, and `e2e/expenses.spec.ts` contain runtime skips, swallowed waits, and conditional assertions.

**Required implementation**

- [ ] Set every CI job to Node 22 and use the lockfile package manager.
- [ ] Add one required `verify` job that starts local Supabase, runs `supabase db reset`, seeds deterministic users/trips, runs SQL tests, runs Vitest without remote credentials, builds, installs all configured Playwright browsers, and runs Playwright.
- [ ] Remove secret-dependent skip branches from required checks.
- [ ] Make the bundle budget exit non-zero above the documented threshold.
- [ ] Replace the axe echo with the real Playwright axe suite.
- [ ] Install Chromium and WebKit in CI, or change the mobile project to an explicitly supported Chromium device. The project name must match the engine actually used.
- [ ] Fix `height: 844`, remove the `as any`, and assert both no axe serious/critical violations and no horizontal overflow at 200%.
- [ ] Add `tests/helpers/supabase.ts` or equivalent deterministic fixture utilities. They must create users through the local Auth API, return sessions, and clean all test-owned rows.
- [ ] Ensure Vitest deletes or overrides inherited `VITE_SUPABASE_*` values unless a specifically named local integration script supplies local values.
- [ ] Split static migration lint from executable database tests. Static tests must enumerate all migration files in timestamp order.
- [ ] Ban `test.skip()` inside test bodies, `.catch(() => {})` around required actions/assertions, and `if (isVisible) expect(...)` patterns with an automated source scan.

**Mandatory tests**

- CI with all Supabase secrets unset must still execute local DB and browser gates.
- Deliberately replacing one RLS policy with `using (true)` must make the DB job fail.
- Deliberately adding one serious axe violation must make the axe job fail.
- Deliberately exceeding the bundle threshold must make the build job fail.
- `rg` over `e2e/` must find zero runtime skips and zero swallowed required assertions.

### P0-02: The identity and route model contradicts the locked product decision

**Evidence**

- `src/app/routes.tsx:97-101` puts `/trips/new` behind `AdminGuard`.
- `src/features/auth/SignInPage.tsx:37-38,91-92` says only admins sign in.
- `src/features/auth/SignUpPage.tsx:33,41-42` says only admins can create accounts.
- `src/app/guards/AdminGuard.tsx:14-24` embeds the obsolete account model.
- `e2e/admin.spec.ts:40-43`, `e2e/flows.spec.ts:14-31`, and `e2e/invite.spec.ts:56-61` enforce that obsolete behavior.

**Locked target behavior**

- Any authenticated, email-verified user may create a trip.
- Any authenticated user may join a valid invite.
- Trip ownership is scoped to the trip; platform admin is an operational role, not a prerequisite for normal use.
- `/admin` remains platform-admin-only.
- `/trips/new` is authenticated-user-only, not platform-admin-only.
- Sign-in and sign-up are normal account flows.

**Required implementation**

- [ ] Move `/trips/new` out of `AdminGuard`; keep only `/admin` behind it.
- [ ] Replace admin-only auth copy with plain account copy.
- [ ] Remove “no password needed” and route-path instructions from customer-facing UI.
- [ ] Keep platform-admin controls out of normal settings unless `useIsAdmin()` returns true.
- [ ] Replace obsolete admin E2E suites with owner/member/platform-admin authorization suites using real local accounts.
- [ ] Delete `isAdminEmail()` if it remains unused after the route correction.

**Mandatory browser proofs**

- Verified user A signs up, signs in, creates a trip, and becomes owner.
- Verified user B cannot access `/admin` but can create a different trip.
- Anonymous access to `/trips/new` redirects to sign-in and preserves `returnTo`.
- A normal authenticated user can navigate to `/trips/new` without an admin query or “Not an admin” screen.

### P0-03: Invite intent is lost across authentication

**Evidence**

- `src/features/auth/InviteJoinPage.tsx:65-66,101` creates a `returnTo`.
- `src/features/auth/SignInPage.tsx:16-29` preserves it only for password sign-in.
- `src/features/auth/SignUpPage.tsx:5,24-25,111,118` neither reads nor forwards it.
- `src/lib/auth.tsx:118-133` starts OAuth with a fixed callback.
- `src/features/auth/AuthCallbackPage.tsx:13` always navigates to `/trips`.
- `src/app/guards/AuthGuard.tsx:23-27` sends an already-authenticated visitor away from guest routes without honoring `returnTo`.

**Required implementation**

- [ ] Create one `safeReturnTo()` utility and remove duplicated implementations.
- [ ] Preserve same-origin `returnTo` through sign-in, sign-up, email verification, Google OAuth, callback, and already-authenticated guest-route redirects.
- [ ] Persist OAuth intent in session storage using a namespaced key and clear it after one successful use.
- [ ] Reject protocol-relative, cross-origin, malformed, and non-path values.
- [ ] After auth, return to `/join/:code`; joining must happen only after an explicit confirmation.
- [ ] Preserve expired/revoked/exhausted invite errors without losing the signed-in session.

**Mandatory browser proofs**

- Anonymous invite link -> sign-up -> verification/callback -> same invite confirmation -> joined trip.
- Anonymous invite link -> password sign-in -> same invite confirmation.
- Anonymous invite link -> Google OAuth callback -> same invite confirmation.
- Already-authenticated user opening `/sign-in?returnTo=/join/CODE` lands on that invite.
- `returnTo=https://evil.example` and `returnTo=//evil.example` land on `/trips`.

### P0-04: Receipt storage authorization and ownership are unsafe

**Evidence**

- `supabase/migrations/20260819000009_phase1_remaining_hardening.sql:205-223` allows any active-trip member to insert, update, and delete under any second path segment.
- `supabase/migrations/20260819000011_receipts_bucket.sql:18-21` adds a stricter insert policy without dropping the `00009` policy; PostgreSQL ORs permissive policies.
- `supabase/migrations/20260819000011_receipts_bucket.sql:3` does not set size or MIME limits.
- `supabase/tests/rls.sql:371-378` checks bucket privacy and policy names only.
- `src/features/expenses/ExpenseFormPage.tsx:245-250` uploads before the expense exists and invents a random `expId`.
- `src/lib/receipts.ts:15-17` trusts client extension and MIME metadata.
- Clearing `receiptPath` only changes form state; it does not delete the uploaded object.

**Required data contract**

- Bucket: private.
- Limit: 10 MiB at the bucket/database level.
- Allowed MIME: JPEG, PNG, WebP, PDF at the bucket/database level.
- Path: `<trip_id>/<expense_id>/<object_uuid>.<canonical_extension>`.
- The second segment must reference an existing expense in that trip.
- Read: current trip members.
- Insert/replace/delete: expense creator or trip owner while trip is active.
- Signed URL expiry: at most 600 seconds; never persisted.
- File signature must agree with canonical MIME before final attachment.

**Required implementation**

- [ ] Add a new forward-only migration that drops every old receipt policy by exact name before creating one policy per operation.
- [ ] Update `storage.buckets.file_size_limit` and `allowed_mime_types`.
- [ ] Replace direct pre-save upload with a two-phase RPC/Storage contract: reserve or create the expense ID first, upload to that ID, then finalize `receipt_path` atomically.
- [ ] On finalization failure, delete the uploaded object; on cancel, replace, soft-delete, hard-delete, and abandoned reservation expiry, clean up according to a documented rule.
- [ ] Validate extension, content type, size, path segments, existing expense, trip match, actor ownership, and active trip at the server boundary.
- [ ] Do not permit arbitrary object update. Prefer immutable object names plus replace-by-new-object.
- [ ] Show upload progress, retry, cancel, replace, remove, preview/download, and safe errors. Never show a raw storage path to the user.

**Mandatory adversarial tests**

- Nonmember cannot list, download, sign, upload, update, or delete.
- Member cannot use another trip ID, another expense ID, a missing expense ID, too few/many segments, traversal, uppercase/double extension bypass, or mismatched trip/expense.
- Member cannot delete another member’s receipt unless owner.
- `.exe`, spoofed MIME, and files over 10 MiB fail through the Storage API.
- Archived-trip upload, replace, and delete fail.
- New expense upload path contains the actual persisted expense ID.
- Failed/cancelled form leaves no object after cleanup.

### P0-05: Hard delete destroys audit and idempotency evidence

**Evidence**

- `supabase/migrations/20260819000007_fix_delete_audit_fk.sql:6` changes `audit_logs.trip_id` to `ON DELETE CASCADE`.
- `supabase/migrations/20260819000008_fix_audit_immutable_delete.sql:7-15,49-52` explicitly bypasses append-only deletion.
- `supabase/migrations/20260819000006_admin_delete_trip.sql:22` acknowledges cascading financial deletion and orphaned receipts.
- `mutation_requests.trip_id` also cascades from the trip.
- `plans/phase1-gate-log.md:30` admits the audit is gone while other status files call the phase green.

**Required implementation**

- [ ] Choose and document one production retention contract. Default: soft-delete trips and preserve financial, audit, idempotency, and receipt metadata for the retention period.
- [ ] If legal hard deletion is required, copy immutable tombstone/audit/idempotency metadata to a retention table not FK-dependent on `trips`, delete Storage objects through a privileged server process, then delete relational data.
- [ ] Restore append-only audit behavior; no session variable may allow ordinary application paths to delete audit rows.
- [ ] Record a distinct `hard_delete` or `purge` action constrained by the audit action domain.
- [ ] Make retrying the same delete request return the same stored result after deletion.

**Mandatory tests**

- Direct audit update/delete fails for member, owner, authenticated platform admin, and anonymous roles.
- Purge retains the required tombstone and request result.
- Duplicate purge request returns the original result without another side effect.
- All receipt objects belonging to the purged trip are removed.

### P0-06: Idempotent retries validate mutable state before duplicate lookup

**Evidence**

- `supabase/migrations/20260819000009_phase1_remaining_hardening.sql:17-31`, `56-68`, and `95-106` check entity/state before claiming a duplicate.
- An identical retry after soft delete, restore, or archive can therefore return `NOT_FOUND`, `TRIP_NOT_ACTIVE`, or `TRIP_ARCHIVED` instead of the original result.
- `src/features/settings/api.ts` creates a new request ID inside every API call, so UI retry cannot intentionally reuse an operation ID.

**Required implementation**

- [ ] For every mutating RPC, validate `auth.uid()` and request ID, then fetch an existing `(actor, request_id, operation)` result before mutable-state checks.
- [ ] Store completed success or stable failure results; define whether failures are replayed.
- [ ] Lock or insert the claim safely under concurrency and return one canonical result.
- [ ] Generate request IDs at the user-intent boundary and retain them across network retries; generate a new ID only after the user changes the operation.

**Mandatory tests**

- Sequential duplicate and two-session concurrent duplicate calls produce one mutation and one audit row.
- Retry after the first call changed status or deleted the target returns the original result.
- Reusing a request ID for another operation does not collide.

### P0-07: The SQL “PASS” suite can pass when forbidden operations succeed

**Evidence**

- `supabase/tests/rls.sql:127-133` does not assert the queried nonmember row count.
- `supabase/tests/rls.sql:146-149` tests `is_trip_owner()` instead of invoking denied RPCs.
- `supabase/tests/rls.sql:300-303` raises a sentinel containing `overpayment`, catches it, and accepts it as the expected error.
- `supabase/tests/rls.sql:365-366` raises sentinels containing `AUDIT_IMMUTABLE`, catches them, and accepts them.
- `supabase/tests/rls.sql:381-394` does not remove a member.
- Receipt checks assert policy names, not operations.
- “Concurrent” checks run sequentially in one session.

**Required implementation**

- [ ] Replace hand-rolled self-catching blocks with pgTAP `throws_ok`, `lives_ok`, `results_eq`, and transaction-isolated fixtures, or use a helper whose sentinel can never match the expected SQLSTATE/message.
- [ ] Assert query results as the impersonated role, not helper predicates.
- [ ] Exercise the actual RPC and Storage API operation for every authorization claim.
- [ ] Run concurrency cases from separate database connections synchronized by a barrier.
- [ ] Roll back each test or reseed deterministically.
- [ ] Fail on zero planned assertions, unexpected skips, missing fixtures, or missing Storage service.

### P0-08: Audit action integrity was weakened

**Evidence**

- `supabase/migrations/20260819000015_fix_audit_action_type.sql:4-10` changes `audit_logs.action` from `audit_action` to unconstrained text to avoid fixing callers.

**Required implementation**

- [ ] Add a forward migration restoring a constrained domain: enum or a `CHECK` constraint with the complete action set.
- [ ] Fix every RPC insert to use explicit casts or correctly typed variables.
- [ ] Add required actions for receipt attach/replace/remove and purge only if the product needs them.
- [ ] Regenerate `src/types/database.ts` from the reset database; do not hand-edit generated shapes.

### P0-09: Accessible dialog behavior is incomplete

**Evidence**

- `src/components/feedback/ConfirmDialog.tsx:41-46` sets `aria-hidden="true"` on `#root`, which contains the dialog itself. Removing `aria-hidden` from a descendant cannot override an aria-hidden ancestor.
- `src/components/feedback/ConfirmDialog.tsx:25` focuses Cancel while `:75` also requests `autoFocus`.
- `src/features/balances/SettlementDialog.tsx:29-34,56-80` has no focus trap, initial focus, restoration, background inerting, scroll lock, or pending Escape guard.

**Required implementation**

- [ ] Render modal dialogs through a portal adjacent to `#root`, or use a proven accessible dialog primitive already approved for the project.
- [ ] Apply `inert` and `aria-hidden` only to non-dialog application content.
- [ ] Trap focus, focus one deterministic initial control, close on Escape only when allowed, restore trigger focus, lock background scroll, and label errors.
- [ ] Use unique IDs when more than one dialog can exist.
- [ ] Remove conflicting `autoFocus`.

**WCAG target:** 2.4.3 Focus Order, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured, 4.1.2 Name/Role/Value.

## 4. P1 Product and Usability Work

### P1-01: Expense form state and receipt lifecycle

- `ExpenseFormPage.tsx:38-54` one-time initialization depends on `members.length` but not the member identities.
- `ExpenseFormPage.tsx:78-102` can reset again when `existing` changes and captures stale `payerInputs`.
- `ExpenseFormPage.tsx:109-118` protects browser unload only, not React Router navigation.
- Exact fields use `defaultValue` at `:287`, so mode/amount changes can leave stale values.
- Removing a payer at `:261` does not sync form state in all branches; duplicate payer selection is permitted.
- Error handling at `:189-195` exposes raw backend messages except one conflict case.

**Required behavior**

- Fetch edit data and members before a single `reset()`.
- Preserve dirty user input during background refetch.
- Use controlled field arrays with stable IDs.
- Prevent duplicate payers and empty participant sets.
- Recalculate equal/percent/share allocations deterministically in minor units.
- Exact, percent, and shares inputs must expose inline totals and field errors.
- Use React Router blocking for in-app navigation and `beforeunload` for browser exit.
- Disable submit during upload/save and preserve user input after recoverable errors.
- Map all server codes through `toUserMessage()`.

### P1-02: Currency is still hard-coded in shared components

**Evidence**

- `src/components/finance/CurrencyAmount.tsx:1-5` always calls the INR `money()` alias.
- `src/components/finance/ExpenseRow.tsx:16` renders `myContribution` as a raw minor integer.
- `src/components/finance/BalanceRow.tsx:12` renders paid/share as raw minor integers.
- `src/charts.tsx:77,111` hard-code `"INR"`.
- `SettlementDialog.tsx:77` formats the confirmation label with INR `money()`.

**Required implementation**

- Add a required `currency` prop to shared finance components and charts.
- Format every persisted integer through `formatMinor(minor, currency, locale)`.
- Never display a raw minor-unit integer.
- Add JPY, INR, USD, EUR, GBP, AED, and SGD component tests including zero, negative, large, and remainder values.

### P1-03: Offline messaging promises behavior the app does not enforce

- `OfflineBanner.tsx:7-8` says writes are paused and read-only remains.
- Most mutation components do not call `useOfflineBlock()` or disable controls.
- Cached data availability is not guaranteed.

**Required behavior**

- Either enforce mutation blocking from one shared mutation wrapper or change the message to a truthful connectivity warning.
- Preserve drafts locally when a write cannot be submitted.
- Distinguish offline, timeout, auth expiry, authorization, conflict, and server failure.
- Add online/offline transition tests around expense, settlement, invite, and settings actions.

### P1-04: Profile writes bypass the project RPC convention

- `ProfilePage.tsx:35-38` performs a direct table update.
- `ProfilePage.tsx:43-45` calls `getUser()` but does not update the local AuthContext name.
- The current local role lacks table-level `profiles UPDATE`, so saving can fail despite the screen claiming support.

**Required implementation**

- Add an `update_profile(p_name)` RPC that can change only the caller’s permitted fields.
- Keep `is_platform_admin`, user ID, and email immutable through that RPC.
- Refresh the profile query/AuthContext after success.
- Add tests proving self-name update succeeds and privilege-field update is impossible.

### P1-05: Activity remains implementation-facing

- `ActivityPage.tsx:48` exposes snake_case field names.
- `AuditEntry.tsx:12` exposes raw JSON.
- Unknown actors become “Someone,” losing useful retained identity context after removal.

**Required behavior**

- Render human field labels and money/date/member values.
- Show “Arun changed amount from ₹2,400.00 to ₹2,650.00,” not JSON.
- Preserve a safe actor display-name snapshot in audit metadata if retention requires removed users to remain understandable.
- Redact receipt paths, invite codes, tokens, and internal IDs.

### P1-06: Release metadata and customer copy are unfinished

- `index.html:2` contains `lang="<!-- figma:lang -->"`.
- `index.html:7` contains an empty Figma title slot.
- Auth screens refer customers to literal route `/join`.
- Product pages still expose “Supabase not configured” and raw infrastructure errors.

**Required implementation**

- Set concrete `lang`, title, description, theme color, manifest, icons, and social metadata.
- Replace route strings and implementation names with task-oriented copy.
- Add branded 404/403/offline/error states with a recovery action.
- Add privacy, terms, receipt retention, and account deletion links before public release; legal text requires owner approval.

### P1-07: Visual and responsive quality needs scenario coverage

The current sign-in shell is visually coherent at 390 and 1440 widths, but it communicates the wrong account model. Production acceptance must cover the actual authenticated screens, not only public routes.

**Required visual matrix**

- Widths: 320, 390, 768, 1024, 1440.
- Zoom: 100%, 200%, and 400% for core forms and dialogs.
- Text: longest supported name, destination, category, currency, validation message, and translated-format date.
- States: loading, empty, populated, error, offline, submitting, conflict, archived, owner, member, platform admin.
- Screens: auth, trips, create trip, invite, overview, expenses, add/edit expense, receipt preview, balances, settlement dialog, activity, settings, profile, 403, 404.

Acceptance requires no horizontal page overflow at 320 CSS px, no obscured focused control, no clipped text, no duplicate navigation, and no bottom-tab overlap with content or safe areas.

## 5. Required File Map

Luna may add focused helpers, but the following ownership boundaries apply:

- `.github/workflows/ci.yml`: one fail-closed release gate.
- `playwright.config.ts`, `e2e/fixtures/`, `e2e/*.spec.ts`: deterministic browser projects and fixtures.
- `tests/integration/db.test.ts`, `supabase/tests/`: migration lint and executable authorization/data tests.
- New forward-only `supabase/migrations/20260820*.sql`: policy, retention, idempotency, audit-domain, profile-RPC, and receipt fixes. Do not edit applied migrations `00001`-`00015`.
- `src/app/routes.tsx`, `src/app/guards/`, `src/features/auth/`, `src/lib/auth.tsx`: normal-user identity and return intent.
- `src/lib/receipts.ts`, `src/features/expenses/`: receipt reservation/finalization and form correctness.
- `src/components/feedback/`, `src/features/balances/SettlementDialog.tsx`: accessible modal foundation.
- `src/components/finance/`, `src/charts.tsx`: currency propagation.
- `src/features/activity/`, `src/features/profile/`, `src/lib/network.ts`: customer-facing behavior.
- `src/types/database.ts`: regenerate after migrations.
- `plans/every-phase-status.md`, `plans/phase*-gate-*.md`, `plans/phase7-release-checklist.md`: evidence revocation and new factual results only.

## 6. Test Design Contract

### Database roles

Create deterministic local identities:

- A: trip owner, not platform admin.
- B: trip member, not owner.
- C: authenticated nonmember.
- D: removed former member.
- P: platform admin.
- Anonymous: no JWT.

For each public table, view, RPC, and Storage operation, test allowed and denied behavior using the actual role and operation.

### Browser fixtures

- Authenticate through local Supabase or pre-create storage state from a real local session.
- Never type credentials that have not been seeded.
- Do not use `/trips/demo` in production E2E.
- Each test owns unique data and cleans it.
- A test name must describe behavior it proves; a heading-only assertion is insufficient.
- Required actions and assertions may not be caught or conditional.

### Accessibility

- Axe is necessary but not sufficient.
- Add keyboard-only scripts for all dialogs, menus, tabs, forms, and destructive confirmations.
- Test focus order and restoration.
- Test accessible name, description, error association, live regions, and disabled/pending state.
- Test reduced motion independently from 200% zoom so one setup failure cannot erase both signals.

## 7. Historical Evidence Revocation

Before product changes, update status documents:

- `plans/every-phase-status.md` must state the 2026-08-20 verdict and remove all claims that phases 0-7 are GREEN.
- `plans/phase0-gate-evidence.md`, `plans/phase1-gate-log.md`, and `plans/phase7-release-checklist.md` must carry a top banner: **REVOKED AS RELEASE EVIDENCE** with the reason and replacement document.
- Preserve the old text for history; do not rewrite failed evidence as if it never existed.
- A new evidence log must include timestamp, commit/ref or artifact hash, environment, exact command, exit code, pass/fail/skip counts, and artifact paths.

## 8. Mandatory Execution Order

### Gate A: Truthful local and CI baseline

Deliver only:

1. Deterministic local Supabase setup, seed, teardown.
2. Trusted DB/Storage test harness with false-positive exception patterns removed.
3. Portable Playwright projects and seeded auth fixtures.
4. Real axe execution and corrected zoom tests.
5. Node 22 fail-closed CI and hard bundle budget.
6. Revoked historical GREEN claims.

**Gate A exit**

```bash
pnpm install --frozen-lockfile
pnpm exec supabase db reset
pnpm test
pnpm build
pnpm test:e2e
pnpm verify
```

All commands exit 0. Required suites report zero skips. DB and browser suites run with repository-owned local configuration and no hosted secrets. Stop for review.

### Gate B: Database and Storage security

Implement P0-04 through P0-08: receipt policies, retention, idempotency, SQL proofs, audit action domain, and profile RPC.

**Gate B exit**

- Every role matrix case passes.
- Storage API adversarial cases pass.
- Two-connection concurrency tests pass.
- Generated database types match the reset schema.
- No applied migration was edited.

Stop for review.

### Gate C: Identity, routes, and invites

Implement P0-02 and P0-03.

**Gate C exit**

- Normal verified users can create trips.
- `/admin` remains platform-admin-only.
- Invite intent survives password, sign-up/verification, OAuth, and already-authenticated flows.
- Open-redirect tests pass.
- No customer-facing admin-only account copy remains.

Stop for review.

### Gate D: Financial workflows and accessible interaction

Implement P0-09 and P1-01 through P1-04.

**Gate D exit**

- All split modes pass unit, component, and browser tests.
- Receipt create/replace/remove/cancel has no orphaned objects.
- Every money display uses trip currency.
- Dialog keyboard and screen-reader tests pass.
- Offline and conflict recovery preserve user input.

Stop for review.

### Gate E: Product polish and release rehearsal

Implement P1-05 through P1-07 and complete external configuration.

**Gate E exit**

- Full visual matrix captured and reviewed.
- WCAG 2.2 AA automated and scripted keyboard gates pass.
- Production metadata, legal links, retention copy, monitoring, backups, rate limits, email templates, OAuth URLs, and secret ownership are documented and verified.
- A fresh clean checkout can run `pnpm verify` with no manual data preparation.
- No P0/P1 finding remains open.

Only after Gate E may the verdict be reconsidered.

## 9. Luna Completion Report Template

For each gate, return:

1. Files changed and why.
2. Migration names and forward/rollback operational plan.
3. Exact commands and exit codes.
4. Test totals including skips.
5. Security adversarial cases executed.
6. Browser engines and viewports executed.
7. Screenshots/traces/reports and paths.
8. Remaining failures or external configuration.
9. Explicit gate verdict: `GREEN`, `RED`, or `BLOCKED`.

Never use `GREEN` when a required command failed, skipped, did not start, used a hosted dependency unexpectedly, or relied on a conditional assertion.

## 10. Current Definition of Done

TripSplit is production-grade only when:

- all five gates are GREEN;
- normal identity, invite, trip, expense, receipt, balance, settlement, archive, and profile journeys pass against local Supabase;
- the complete authorization matrix passes against actual RLS/RPC/Storage operations;
- audit and idempotency evidence survives the documented retention lifecycle;
- receipt type, size, ownership, path, and cleanup rules are enforced server-side;
- no raw minor-unit value or wrong currency is rendered;
- dialogs and core flows meet WCAG 2.2 AA keyboard/focus requirements;
- CI cannot pass by omitting credentials, services, browsers, assertions, or tests;
- status documents match raw evidence;
- external production configuration is complete and owned.

Until then, the authoritative verdict remains **NOT RELEASABLE**.
