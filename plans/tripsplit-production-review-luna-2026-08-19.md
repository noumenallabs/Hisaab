# TripSplit Production Review and Luna Remediation Addendum

> **Review date:** 2026-08-19
>
> **Implementation owner:** Luna
>
> **Scope:** Current workspace after migrations `00003` through `00008` and the
> Phase 3-7 UI edits were added.
>
> **Authority:** This addendum supplements
> `plans/tripsplit-production-readiness-luna-spec.md`. Where current gate logs
> conflict with verified evidence below, this addendum controls.
>
> **Release verdict:** **NOT RELEASABLE.**
>
> **Execution rule:** Reopen Phase 0 and Phase 1. Do not continue feature work
> or describe Phase 7 as green until every P0 below has an executable,
> deterministic test and the full gate passes.

## 1. Evidence Collected

### 1.1 Commands run

| Check | Current result | Meaning |
|---|---|---|
| `pnpm typecheck` | PASS | TypeScript 5.9.3 now parses the project |
| `pnpm test` | FAIL: 20 files passed, 1 failed; 162/163 tests passed | The live RLS test received `TypeError: fetch failed`, not an RLS result |
| `pnpm build` | PASS | Build works; entry chunk 228.75 kB raw / 72.68 kB gzip; Supabase chunk 277.10 kB raw / 70.70 kB gzip |
| Initial Playwright run | FAIL: 40/40 did not start | Chromium and WebKit executables were absent |
| Browser installation | PASS | Playwright Chromium 1234 and WebKit 2336 installed |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8443 pnpm test:e2e` after installation | FAIL: 12 passed, 28 failed | Suite starts, but auth fixtures, stale selectors/copy, demo routes, and workflow assertions are broken |
| Local preview | Reachable outside the restricted shell | Existing Figma/Vite process owned port 8443 and served the browser suite |
| Contrast calculation | FAIL | Several core text/status tokens are below WCAG 2.2 AA |

### 1.2 Evidence integrity

The following checked-in claims are not valid release evidence:

- `plans/phase1-gate-log.md` declares PASS before migration `00008` was created.
  Migration `00008` explicitly says the prior delete still failed because the
  immutable-audit trigger blocked the cascade.
- `plans/phase7-rehearsal.md` claims receipt upload, a 10 MB limit, signed
  preview, staging E2E, backup/restore rehearsal, and a green baseline. The
  corresponding implementation or command output is absent.
- `supabase/tests/rls.sql` is primarily a list of commented manual scenarios.
  Its only executable block does not establish the owner/member/nonmember
  authorization matrix.
- `.github/workflows/ci.yml` permits DB checks to skip when secrets are absent,
  has an axe job that only echoes a placeholder, and turns the bundle budget
  into a warning.
- Current E2E cases contain catches, conditional assertions, runtime skips,
  stale copy, demo routes, and tests whose names claim behavior they do not
  exercise.

Treat the existing Phase 1 and Phase 7 verdicts as **REVOKED**. Preserve the
files as historical evidence, but add a visible revoked banner to each when
implementation resumes.

## 2. P0 Release Blockers

### P0-01: Any user can promote their own profile to platform admin

**Evidence**

- `supabase/migrations/20260818000001_init.sql:255-256` allows an authenticated
  user to update their own `profiles` row without restricting writable columns.
- `profiles.is_platform_admin` is on that same row.
- `src/lib/useAdmin.ts:13-15` trusts the profile value.
- `delete_trip` trusts `is_platform_admin(auth.uid())`.

An authenticated client can attempt:

```ts
supabase
  .from("profiles")
  .update({ is_platform_admin: true })
  .eq("id", user.id)
```

If table grants allow the update, RLS accepts it because the row ID remains the
current user's ID. The user can then reach platform-admin operations.

**Required remediation**

1. Revoke direct `UPDATE` on security-sensitive profile columns.
2. Prefer revoking direct profile updates entirely and exposing
   `update_my_profile(p_name, p_avatar_path, p_request_id)`.
3. Ensure `is_platform_admin` is writable only by a service-role/server
   provisioning procedure.
4. Add a DB test proving an authenticated non-admin cannot update
   `is_platform_admin`, `id`, or `email`.
5. Add a DB test proving the approved profile RPC can update only the permitted
   fields.

**Exit condition:** A non-admin cannot become admin through REST, RPC argument
substitution, profile update, metadata update, or client configuration.

### P0-02: Account and role model still contradicts the locked product decision

**Evidence**

- `src/app/routes.tsx:97-101` places `/trips/new` behind `AdminGuard`.
- `src/features/auth/SignInPage.tsx:37-38` says only admins sign in and members
  need no password.
- `src/features/auth/SignUpPage.tsx:33-42` calls signup admin-only even though
  Supabase signup creates an ordinary profile.
- `src/app/guards/AdminGuard.tsx:14-24` retains the obsolete first-user/admin
  mental model.

The authoritative specification requires durable identities and allows every
verified user to create a trip. Platform admin is unrelated to normal trip
creation.

**Required remediation**

1. Put `/trips/new` under `AuthGuard`, not `AdminGuard`.
2. Make sign-in and signup neutral user flows.
3. Remove “no password needed,” “admin sign in,” “create admin account,” and
   “ask your admin” copy.
4. Keep `/admin` separately platform-admin gated or remove the placeholder
   route until it has a real function.
5. Replace all admin terminology in trip membership UI with owner/member.

**Exit condition:** A verified non-admin user can sign up, sign in, create a
trip, become its owner, and never acquire platform-admin capability.

### P0-03: Invite return-through-auth is incomplete

**Evidence**

- `InviteJoinPage` sends guests to sign-in/signup with `returnTo`.
- `SignInPage` preserves password-sign-in return paths.
- `SignUpPage` ignores `returnTo` and always navigates to `/verify-email`.
- `signInWithGoogle` always redirects to `/auth/callback`.
- `AuthCallbackPage` always navigates to `/trips`.
- `GuestGuard` redirects an already authenticated user away from auth routes
  without considering an invite return path.

**Required remediation**

Implement one validated invite-intent state machine:

1. Store only a validated same-origin relative `returnTo`.
2. Preserve it through signup confirmation, password sign-in, OAuth, callback,
   and refresh.
3. After authentication, consume the invite once through
   `join_trip_by_code`.
4. Clear the intent after success or explicit cancellation.
5. Never place access tokens or raw auth errors in URLs or logs.

**Exit condition:** Password and OAuth users can start at `/join/:code`,
authenticate, join exactly once, and land on the trip.

### P0-04: Hard-delete idempotency and audit claims are false

**Evidence**

- `mutation_requests.trip_id` has `ON DELETE CASCADE`.
- `delete_trip` inserts the idempotency row before checking whether the trip
  exists.
- A retry after deletion cannot insert that row because its trip FK no longer
  exists; the `already_gone` branch is therefore unreachable.
- Deleting the trip cascades away both the audit record and the mutation row.
- The function then updates a mutation row that has already been deleted.
- Migration `00008` adds a bypass so the supposedly immutable audit rows can be
  deleted.

**Required remediation**

Choose and implement one coherent contract:

- Preferred: production trip removal is archive-only. No client hard-delete.
  Retention deletion is a separately authorized server job with a tombstone
  ledger outside the trip FK graph.
- If platform hard-delete is mandatory, store idempotency/tombstone data in a
  table whose key does not cascade with the trip and retain the minimum
  compliant audit event with `trip_id` nullable or copied into immutable text.

Do not call a cascade-deleted audit “retained.”

**Exit condition:** Same-request retries, different-request retries,
concurrent deletes, missing trips, and audit retention all have executable DB
tests and one documented result contract.

### P0-05: Archived trips are not fully immutable

**Evidence**

- The original `restore_expense` RPC checks owner role but does not check trip
  status.
- Migration `00005` does not replace `restore_expense`.
- An owner can therefore restore an expense after archival.
- `revoke_trip_invite` also lacks a trip lifecycle check.
- Several idempotency checks happen after status/no-change checks, so retries
  can fail instead of returning the prior result.

**Required remediation**

1. Inventory every mutating RPC and table write.
2. Lock the trip row first.
3. Apply the same lifecycle predicate before mutation.
4. Define whether `settled` permits invite/member/profile-independent writes.
5. Claim/check idempotency before state-dependent validation where a completed
   retry must succeed.
6. Test every RPC against active, settled, and archived trips.

**Exit condition:** Archived trips are readable and no financial, membership,
invite, metadata, receipt, restore, role, or settlement mutation succeeds.

### P0-06: Money is displayed and entered with incorrect units

**Evidence**

- `money(1000)` renders `₹1,000`; persisted `1000` minor INR should display
  `₹10.00`.
- The same helper is used by trip totals, expense detail, balances, splits,
  and settlements.
- Payer and exact-split inputs expose raw minor-unit numbers.
- Expense parsing always assumes two decimals even for JPY.
- Settlement parsing and copy are hard-coded to rupees and two decimals.
- Currency symbols support only INR in the shared formatter.

**Required remediation**

1. Replace `money(number)` with `formatMinor(minor, currency, locale?)`.
2. Obtain decimals from shared currency metadata.
3. Use major-unit strings in every user-editable field.
4. Convert to integer minor units only at the form/domain boundary.
5. Support at least the locked currency set, including zero-decimal JPY.
6. Include currency in every monetary component contract.
7. Add property tests for parse/format round trips, limits, negative display,
   rounding, equal remainder, percentages, and shares.

**Exit condition:** INR 1000 minor displays as ₹10.00, JPY 1000 displays as
¥1,000, and no UI asks a user to enter or interpret minor units.

### P0-07: Real expense creation can submit demo member identities

**Evidence**

- `ExpenseFormPage` uses demo members whenever the real member query is empty
  or still loading.
- Initial selected participants and payer state are derived during the first
  render and are not reinitialized when real members arrive.
- The fallback can therefore preserve demo IDs in a real Supabase form.
- `BalancesPage` similarly shows demo members if the real member list is empty.

**Required remediation**

1. Remove demo imports from all production feature modules.
2. Do not render an enabled financial form until trip and member data are
   loaded successfully.
3. Treat a genuinely empty member response as an integrity/error state, not a
   fixture trigger.
4. Initialize form state once from typed real data.
5. Add tests with delayed member responses and one-member trips.

**Exit condition:** No production bundle path can reference `src/data.ts`,
`src/lib/demo.ts`, demo IDs, or localStorage business state.

### P0-08: Receipt storage is not implemented

**Evidence**

- Migration `00005` creates a private bucket but explicitly creates no storage
  policies.
- The form exposes a raw `RECEIPT PATH` text field and tells users to upload via
  a storage bucket.
- There is no file picker, upload mutation, MIME/size verification, signed URL
  query, delete cleanup, orphan cleanup, or receipt authorization test.
- The claimed 10 MB limit is absent.

**Required remediation**

Implement the full private receipt workflow from the authoritative spec:

1. File picker with accepted types and accessible validation.
2. Server-generated object path scoped to trip and expense/request.
3. Storage policies for member read and authorized writer create/delete.
4. Server-side MIME and size enforcement.
5. Short-lived signed retrieval without persisting signed URLs.
6. Replacement, soft-delete, restore, hard-retention cleanup, and orphan
   cleanup behavior.
7. DB/storage tests for member and nonmember access.

**Exit condition:** Users never see or edit storage paths; unauthorized users
cannot upload, list, sign, or retrieve receipt objects.

### P0-09: Audit before/after values are reversed

**Evidence**

In migration `00005`, the `audit_logs` column list is:

```sql
previous_values, new_values
```

but the inserted values put the normalized current payload first and
`v_prev` second. Create events consequently place the new payload under
`previous_values` and leave `new_values` null.

**Required remediation**

1. Correct the insert order.
2. Store a normalized previous snapshot for updates and a normalized new
   snapshot for creates/updates.
3. Compute changed fields by comparing persisted normalized values, not merely
   by listing keys present in the request.
4. Redact invite codes, receipt paths if sensitive, auth data, and tokens.
5. Add exact DB assertions for create, update, delete, restore, settlement,
   membership, and lifecycle events.

**Exit condition:** Activity can render trustworthy human-readable diffs
without dumping raw JSON.

### P0-10: Autonomous verification and CI are not truthful

**Evidence**

- Unit test run is currently red.
- Browser suites require an explicit matching browser installation; after the
  browsers were installed, the current run still failed 28 of 40 cases.
- The mobile project uses the WebKit-backed iPhone device while CI installs
  only Chromium.
- DB CI explicitly skips when secrets are absent.
- Axe CI is an echo statement.
- E2E tests use hard-coded credentials, demo routes, catches, runtime skips,
  stale UI copy, and shallow assertions.
- Static migration tests read only migrations `00001` and `00002`, not the
  migrations that currently define production behavior.

**Required remediation**

Rebuild Phase 0 around a local disposable Supabase stack:

1. Install/pin Supabase CLI and Playwright browsers in CI.
2. Start local Supabase, apply all migrations from a clean database, and seed
   deterministic owner/member/nonmember/platform-admin identities.
3. Generate auth state or authenticate through supported test helpers; do not
   commit reusable passwords for a remote project.
4. Make every required job fail if its dependency or fixture is absent.
5. Add real pgTAP/SQL assertions for RLS, RPC authorization, lifecycle,
   idempotency, audit, and financial conservation.
6. Replace E2E catches/skips with explicit prerequisites and assertions.
7. Install and execute `@axe-core/playwright`.
8. Store screenshots, traces, videos-on-failure, DB logs, and gate metadata as
   CI artifacts.

**Exit condition:** A clean CI runner can execute all gates without remote
manual setup and cannot report green when a required check was skipped.

## 3. P1 Functional and Usability Defects

### P1-01: Expense form state is fragile and incomplete

- Async edit hydration uses broad `any` casts and omits dependencies.
- Selecting percent or shares resets inputs but does not immediately recompute
  a valid split.
- Negative percent/share values are not rejected at the input boundary.
- Duplicate payer selection is possible.
- Removing a payer can restore a payer without synchronizing the form value.
- There is no actual route-leave blocker despite “you will be warned” copy.
- Missing/forbidden edit records are not distinguished from a new form.
- Save errors expose raw backend messages.

**Acceptance:** Component tests cover async load, all four modes, member
changes, duplicate payers, invalid/negative inputs, dirty navigation, stale
edit conflict, retry with one request ID, and friendly errors.

### P1-02: Settlement dialog is not an accessible dialog

- It has no focus trap, initial focus, focus restoration, or body scroll lock.
- Currency is hard-coded to INR.
- It maps backend errors directly to users.
- It has no stale-balance refresh/retry flow.

Use the existing `ConfirmDialog` behavior as a baseline or extract one shared
dialog primitive.

### P1-03: Trip state and role mutations leave stale UI

- Settings mutations do not invalidate trip/member/invite queries.
- Realtime subscribes to expenses, settlements, audit, members, and invites,
  but not the `trips` table.
- Mark-settled/archive status can remain visually active until reload.
- Role and removal actions lack per-row pending state.
- Reopen exists in SQL but has no UI.

**Acceptance:** Two browser contexts converge after expense, settlement,
member, invite, and trip-status changes without manual refresh.

### P1-04: Desktop renders two competing navigation systems

`TripLayout` renders the sticky top navigation and fixed bottom five-tab bar at
all viewport widths. The bottom bar must be mobile-only; desktop should use one
stable navigation system.

**Acceptance:** Exactly one primary trip navigation is visible at each target
viewport, with no content hidden behind fixed chrome.

### P1-05: Error and empty states expose implementation details

Examples include:

- `.env`, `pnpm dev`, RLS, migration, and SQL Editor instructions.
- Raw UUID prefixes in expense/activity UI.
- Raw receipt paths and JSON audit snapshots.
- Raw Supabase error strings.
- “Coming later” admin route.

Replace these with user-safe messages and log redacted diagnostics through the
chosen observability adapter.

### P1-06: Profile behavior is incomplete

- No schema validation, pending state, error association, or live region.
- Auth context remains stale after the profile name changes.
- The component nests a `<main>` inside `AppLayout`'s `<main>`.
- Direct table update should be replaced by the safe profile RPC required by
  P0-01.

### P1-07: Activity remains developer-facing

The activity feed shows action/entity internals, UUID fragments, raw field
names, and serialized `previous_values`. Define typed event presenters with
actor names, entity labels, localized timestamps, meaningful diffs, stable
cursor pagination, and deleted-member fallbacks.

### P1-08: Offline behavior is misleading

The banner says writes are paused, but mutations do not consume a shared online
capability and remain enabled. Either actually block writes with queued/retry
semantics or change the claim and provide explicit failure/retry behavior.

## 4. P1 Accessibility and Visual Defects

### 4.1 Confirmed contrast failures

Calculated against current tokens:

| Pair | Ratio | Requirement |
|---|---:|---:|
| `ink-faint` on white | 3.07:1 | 4.5:1 for normal text |
| `ink-faint` on canvas | 2.84:1 | 4.5:1 |
| `owe` on white | 3.34:1 | 4.5:1 |
| `owe` on `owe-soft` | 2.92:1 | 4.5:1 |
| `owed` on white | 3.39:1 | 4.5:1 |
| `owed` on `owed-soft` | 3.03:1 | 4.5:1 |
| `hair` against white | 1.22:1 | 3:1 for meaningful boundaries |

Do not solve this by increasing font weight alone. Replace tokens and verify
computed styles with axe plus targeted contrast assertions.

### 4.2 Additional accessibility defects

- Toasts have no `role`, `aria-live`, severity, persistence policy, or close
  control.
- Several form errors are not associated with inputs through
  `aria-describedby`.
- Loading placeholders use `aria-label` on non-semantic `div` elements without
  a suitable status role.
- Status is communicated heavily through red/green color.
- Remote Google Fonts add a render/privacy dependency and need a production
  decision.
- Dialog accessibility is inconsistent across components.
- The site metadata disables Figma's bypass links while the app adds its own;
  verify only one working skip link per shell and a focusable destination.
- Nested `<main>` elements occur under `AppLayout`.

### 4.3 Responsive verification matrix

Luna must verify:

- 320x568, 360x800, 390x844, 768x1024, 1024x768, 1440x900.
- 200% browser zoom and 400% text zoom where applicable.
- Portrait and landscape.
- Long names, emails, destinations, currency values, and translated-like copy.
- Keyboard-only flow, visible focus, Escape/Tab in dialogs, reduced motion,
  online/offline/reconnecting, loading, empty, forbidden, and error states.
- No horizontal document overflow and no content obscured by fixed navigation.

### 4.4 Visual observations from the executed browser run

- At the 390x844 mobile viewport, the dark invite account prompt forces
  “Sign in” and “create one” into separate two-line fragments. Replace the
  sentence-like control strip with two full-width, clearly labeled actions or
  one primary action plus a normal text link.
- The mobile invite card is copy-heavy and exposes route syntax such as
  `/join/XXXX`. Remove implementation-shaped guidance and keep the first
  viewport focused on code entry, validation, and one next action.
- The desktop sign-in layout is visually stable and readable, but its strongest
  hierarchy is devoted to the incorrect “Admin sign in” model. Correct the
  product model before polishing spacing or decoration.
- Disabled and helper text appears visibly faint, matching the measured token
  contrast failures. Rework the tokens before screenshot approval.

## 5. P2 Maintainability and Performance Risks

1. `src/screens/TripDashboard.tsx` remains a 1,551-line demo application and is
   still the production overview route.
2. Production feature code still imports `src/data.ts` and `src/lib/demo.ts`.
3. Hand-maintained database types are bypassed with widespread `as any`.
4. Query keys are duplicated as string literals instead of one typed factory.
5. Error mapping is duplicated and inconsistent.
6. Direct feature imports of the global `queryClient` make behavior harder to
   isolate than `useQueryClient`.
7. Site metadata still describes a task-tracking product.
8. Bundle budgeting measures all emitted chunks together and only warns; it
   does not define or enforce initial route cost.
9. Build output still includes the 45.27 kB raw legacy dashboard chunk and demo
   data chunk.
10. No CSP/security-header deployment contract is implemented or tested.

## 6. Luna Repair Order

### Gate A: Reopen Phase 0

Deliver:

1. Deterministic local Supabase startup, migrations, fixtures, and teardown.
2. Real SQL/pgTAP security and financial tests.
3. Portable Playwright configuration with installed matching browsers.
4. No catches, conditional passes, runtime skips, or stale demo journeys.
5. Real axe execution.
6. CI required jobs that fail closed.
7. Revoked banners on the old Phase 1 and Phase 7 logs.

Stop and report evidence. Do not edit product behavior in this gate except what
is required to make the harness truthful.

### Gate B: Security emergency fixes

Deliver:

1. Close profile-admin privilege escalation.
2. Replace unsafe profile writes with a narrow RPC.
3. Decide archive-only versus platform retention delete.
4. Repair idempotency/tombstone design.
5. Enforce lifecycle across every mutating RPC.
6. Correct audit previous/new semantics.

Run the full DB matrix and stop.

### Gate C: Identity and route model

Deliver:

1. Normal user sign-in/signup.
2. Any verified user can create a trip.
3. Complete invite return-through-auth, including OAuth.
4. Remove demo identity and admin terminology.
5. User-safe error boundaries and 404/forbidden behavior.

Run auth/invite E2E on mobile and desktop and stop.

### Gate D: Money, expenses, receipts, and settlements

Deliver:

1. Currency-aware domain API.
2. Major-unit inputs and minor-unit persistence.
3. Real typed member initialization.
4. Complete create/edit/detail/delete/restore.
5. Four correct split modes and multiple payers.
6. Private receipt upload/retrieval/cleanup.
7. Accessible settlement workflow and concurrency recovery.

Run unit, property, component, DB, two-context E2E, axe, and responsive checks.

### Gate E: Product usability and release evidence

Deliver:

1. One responsive shell/navigation model.
2. Human-readable activity and profile completion.
3. Complete loading/empty/error/offline/reconnecting behavior.
4. WCAG token and interaction fixes.
5. Remove legacy demo production code.
6. Correct metadata, font, observability, security headers, and bundle gates.
7. Fresh staging release rehearsal with timestamped artifacts.

## 7. Mandatory Test Matrix

At minimum, prove:

### Database

- Non-admin cannot change platform-admin state.
- Nonmember cannot read or mutate trip-owned records or storage.
- Member and owner capabilities match the role matrix.
- Last owner cannot be removed or demoted under concurrency.
- Every archived-trip mutation is rejected.
- Expense and settlement writes conserve money.
- Retry and concurrent request IDs produce one committed result.
- Audit is correctly ordered, redacted, immutable, and retained per policy.
- Invite expiry, revoke, exhaustion, replay, and concurrent final-use behavior.
- Receipt read/write/delete/sign authorization.

### Browser

- Signup, email confirmation simulation, password sign-in, OAuth callback
  contract, sign-out, and recovery.
- Invite intent survives every auth route.
- Non-admin creates a trip and becomes owner.
- Second durable user joins.
- Four split modes, multiple payers, edit, receipt, delete, restore.
- Partial and full settlement, stale-balance recovery.
- Role change, member removal guard, settle, reopen, archive.
- Two contexts receive updates without refresh.
- Keyboard, dialogs, focus restoration, axe, contrast, zoom, reduced motion.
- All required viewports and long-content overflow.

### CI truthfulness

- A missing browser, local DB, fixture, axe dependency, or required secret must
  fail the required job.
- A skipped required test must fail the gate.
- Release evidence records command, environment, commit/artifact identity,
  timestamp, result counts, and unresolved external checks.

## 8. Definition of Done for This Addendum

This review is resolved only when:

- All P0 findings have fixes and executable regression tests.
- `pnpm typecheck`, unit/component/property tests, local DB tests, E2E, axe, and
  build/bundle gates pass from a clean checkout.
- No required CI job skips its work.
- No production feature imports demo data or localStorage business state.
- All money is correctly formatted for the trip currency.
- The invite/account/owner/admin model is coherent in DB, routes, and copy.
- Archived trips are fully immutable.
- Receipts are private and usable without exposing storage internals.
- WCAG 2.2 AA checks pass at the required viewports.
- A new release rehearsal contains reproducible evidence rather than
  assertions.

Until then, keep the release verdict **NOT RELEASABLE**.
