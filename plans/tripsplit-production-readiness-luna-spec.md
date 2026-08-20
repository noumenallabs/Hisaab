# TripSplit Production-Readiness Remediation Specification

> **Implementation owner:** Luna or another coding agent working in this repository.
>
> **Status:** Authoritative remediation plan for the repository as inspected on
> 2026-08-19.
>
> **Precedence:** This document supersedes the implementation phases in
> `plans/tripsplit-luna-implementation-spec.md` and
> `plans/qa-review-tabbar-2026-08-19.md`. The former remains useful for the
> intended domain model; this document controls what to change next and how to
> prove it.
>
> **Execution rule:** Implement one phase at a time, run every check in that
> phase, record evidence, and stop at the exit gate. Do not declare a phase
> complete because files or test names exist.

## 1. Mission

Turn the current partially connected prototype into a coherent, secure,
production-grade shared-expense application.

Production-grade means:

1. A user can complete every advertised workflow without encountering demo
   data, dead controls, placeholder behavior, or technical instructions.
2. Money and balances remain correct under retries, concurrent writes,
   partial settlements, soft deletion, and member lifecycle changes.
3. Authentication identifies a durable person. An invite grants trip
   membership; it is not a substitute for identity.
4. PostgreSQL and RLS remain authoritative even if a user bypasses the UI.
5. Mobile, tablet, and desktop layouts are usable with keyboard, touch, zoom,
   reduced motion, and assistive technology.
6. Automated checks prove the important behavior against a real local
   Supabase stack and a real browser.
7. Production configuration, monitoring, recovery, and deployment behavior
   are explicit rather than implied.

This is a remediation of the current app, not permission for a visual rewrite.
Preserve the restrained blue, white, green, and red visual language where it
passes accessibility requirements.

## 2. Current Evidence and Release Verdict

### 2.1 Verification performed

The following checks were run against the current workspace:

| Check | Result | Interpretation |
|---|---|---|
| `pnpm test` | 21 files, 163 tests passed | Useful unit/component baseline, but not production proof |
| `pnpm build` | Passed; JS bundle 757.62 kB, 213.89 kB gzip | Build works, but route splitting/performance work remains |
| `pnpm verify` | Failed during TypeScript parsing | Blocking toolchain incompatibility |
| `pnpm test:e2e` | Failed before tests; preview bind `EPERM` on `127.0.0.1:4173` | Checked-in E2E command is not portable to Figma Make |
| Live public UI | `/join` and `/sign-in` inspected at 390x844 and 1440x900 | No horizontal overflow; public visual baseline is usable |
| Local-only demo UI | Core routes inspected at 390x844 and 1440x900 | Shell, responsiveness, split-form, and route consistency defects confirmed |

The TypeScript failure occurs in dependency declarations because the project
pins TypeScript 5.7.3 while installed packages use syntax that parser does not
accept. The build does not replace a successful type check.

### 2.2 Test-evidence limitations

Do not report the current 163 passing tests as production coverage:

- `tests/integration/db.test.ts` checks for SQL strings, not database behavior.
- Its live RLS case is `expect(true).toBe(true)`.
- `supabase/tests/rls.sql` contains comments, not executable assertions.
- Several E2E cases catch failures, call `test.skip()`, or assert only that a
  heading exists.
- The “all split modes” E2E test exercises only the default equal mode.
- The Realtime test copies an invalidation callback instead of exercising the
  actual subscription.
- Production Supabase expense detail, edit, receipts, invite joining, and
  membership changes are not end-to-end proven.

### 2.3 Release verdict

**Not releasable.** The following P0 defects can cause broken workflows,
incorrect authorization, or incorrect financial state:

1. `join_trip_by_code` selects a `trip_status` into a UUID variable.
2. The first profile created is automatically promoted to platform admin.
3. `/sign-up` says “admin only,” but the server does not enforce that claim.
4. Anonymous invite-as-sign-in creates disposable identities without recovery
   or durable cross-device ownership.
5. Production expense detail always renders “Expense not found.”
6. Expense edit does not load the existing expense before saving.
7. Exact, percent, and shares split modes are visible but nonfunctional.
8. The real expense form can fall back to demo member IDs and hard-codes INR.
9. Settlement recording is not connected from the balances screen.
10. Real member role/removal actions pass `m.id`, but real rows expose
    `m.user_id`.
11. Settings displays owner-only controls to every trip member.
12. Receipt upload, private storage, signed retrieval, and cleanup are absent.
13. Create-expense idempotency is ineffective and can duplicate an expense on
    a retry.
14. Settlement validation checks the debtor total but not the intended
    creditor, and locks after reading balances.
15. Archived trips can still be modified through lifecycle/member RPC gaps.

### 2.4 Current defect and file map

This table is an implementation index, not an exhaustive list of tests.

| Current file | Confirmed problem | Required disposition |
|---|---|---|
| `package.json` | `verify` stops on incompatible TypeScript parser; E2E is excluded | Align versions and make all required jobs explicit |
| `playwright.config.ts` | Base URL is 4173 while Figma Make serves 8443; web server always starts | Support external base URL or one internally consistent configurable port |
| `src/app/routes.tsx` | Eager imports, wildcard redirect, admin/member concepts mixed | Lazy feature routes, real 404, production auth/join route model |
| `src/lib/auth.tsx` | Demo auth branch; auth callback/error/session handling incomplete | Production-only durable auth provider and safe redirect recovery |
| `src/lib/useAdmin.ts` | Client bootstrap allowlist exists beside DB admin flag | Remove client authority; retain server-sourced platform capability only if needed |
| `src/layouts/TripLayout.tsx` | Demo/UUID branches create different shells; duplicate top/bottom navigation on real desktop | One route-driven responsive shell |
| `src/screens/TripDashboard.tsx` | 1,551-line local demo application remains mounted in production routes | Replace by feature pages, then delete |
| `src/screens/RealTripOverview.tsx` | Extensive `any`; fabricates current user as owner; misleading “created by you” | Replace with typed production overview and real capability/error states |
| `src/features/trips/TripsPage.tsx` | Technical env/RLS messages; totals/count/role may be placeholders | Query real card projections and render user-safe states |
| `src/features/trips/useMembers.ts` | Two-step fallback returns UUID prefixes; query-key naming differs from Realtime invalidation | Typed member projection, one query-key factory, explicit errors |
| `src/features/auth/InviteJoinPage.tsx` | Anonymous auth and invite-as-identity | Auth-preserving invite acceptance state machine |
| `src/features/auth/SignUpPage.tsx` | “Admin only” is presentation, not server policy | Normal user signup or remove route if external provisioning is selected |
| `src/features/expenses/ExpenseFormPage.tsx` | Edit not loaded; hard-coded INR; demo member fallback; three dead split modes; hidden fixed payer | Rebuild complete typed create/edit workflow |
| `src/features/expenses/ExpenseDetailPage.tsx` | Production branch always sets expense to `null` | Add production detail query and full detail/actions |
| `src/features/expenses/money.ts` | `money()` formats minor units as whole INR; fixed symbol/locale | Currency-aware parse/format API with explicit minor-unit input |
| `src/features/balances/BalancesPage.tsx` | Settlement dialog is not rendered; member fallback can show demo data | Connect real balances, transfer actions, and settlement mutation |
| `src/features/balances/SettlementDialog.tsx` | Raw IDs in copy; free-text method; incomplete dialog focus/error behavior | Names, controlled method options, shared accessible dialog |
| `src/features/settings/TripSettingsPage.tsx` | All members see owner actions; real actions pass wrong member ID; “Toggle role” ambiguous | Capability-gated settings with explicit async actions |
| `src/features/activity/ActivityPage.tsx` | Raw action/entity/UUID output; no error/empty state | Human-readable typed feed and stable pagination |
| `src/features/profile/ProfilePage.tsx` | Unvalidated `any`, no pending/error semantics, auth context remains stale | Typed form, feedback, cache/auth refresh |
| `src/components/feedback/OfflineBanner.tsx` | Announces writes paused but does not actually block them | Central online capability consumed by all mutations |
| `src/components/feedback/ToastProvider.tsx` | No live-region semantics or error persistence | Accessible severity-aware notifications |
| `src/index.css` | Scrollbars globally hidden; low-contrast tokens; remote font imports | Accessible tokens/focus/scrolling and production font strategy |
| `src/types/database.ts` | Hand-maintained types lead to RPC `as any` casts | Generate from schema and enforce drift check |
| `supabase/migrations/20260818000001_init.sql` | Join type bug, weak idempotency, lifecycle/concurrency/audit gaps | Correct with forward migration(s) and executable DB tests |
| `supabase/migrations/20260819000002_invite_admin.sql` | First-user admin escalation and anonymous-invite model | Drop unsafe trigger and implement locked identity decision |
| `supabase/tests/rls.sql` | Comments only | Executable assertions against seeded identities |
| `tests/integration/db.test.ts` | SQL substring checks and `expect(true)` | Real local database integration suite |
| `e2e/*.spec.ts` | Catch/skip/no-op assertions and production-like credentials | Deterministic staging/local E2E with meaningful assertions |
| `.figma/make/site.json` | Metadata describes a task-tracking product | TripSplit title, description, icon, and indexing policy |

## 3. Locked Product Decisions

Luna must not improvise around these decisions.

### 3.1 Identity and invitations

- Every production user has a durable Supabase Auth identity.
- Supported authentication: email/password with confirmation and recovery,
  plus optional Google OAuth.
- An invite code grants an authenticated user membership in one trip.
- A guest opening `/join/:code` may preview the trip name and destination, then
  must sign in or create an account. Preserve the invite code through auth and
  consume it after authentication.
- Do not use Supabase anonymous auth for production membership.
- Do not claim “Your invite is your sign-in” or “No account needed.”
- Do not expose “admin sign in” as the normal sign-in concept.

### 3.2 Roles

- `profiles.is_platform_admin` is reserved for platform operations.
- Trip authorization uses `trip_members.role` with `owner` and `member`.
- A verified authenticated user may create a trip and becomes its owner.
- Platform-admin status is not required to create a trip.
- Only a pre-provisioned, server-side process may grant platform admin.
- Remove all “first user becomes admin” behavior.
- A trip must always retain at least one owner.

### 3.3 Money

- Store money as integer minor units plus ISO 4217 currency code.
- Never use floating point for persisted money.
- The trip base currency is immutable after the first expense or settlement.
- Release 1 allows only the trip base currency; FX conversion remains out of
  scope.
- Currency decimal precision comes from one shared metadata table. At minimum:
  JPY uses 0; INR, USD, EUR, GBP, AED, and SGD use 2.
- UI inputs and labels display major units. Never ask users to enter “minor”
  values.

### 3.4 Lifecycle

- `active`: financial and membership writes are permitted according to role.
- `settled`: balances are zero; new financial writes are blocked. Owners may
  reopen to `active` through an explicit audited action.
- `archived`: permanently read-only in Release 1.
- No RPC may mutate an archived trip, including member roles, member removal,
  invites, restore, or trip metadata.

### 3.5 Demo behavior

- Production builds do not switch business logic based on missing env values.
- Missing required Supabase env is a clear startup configuration error.
- Keep sample data only in tests, Storybook-style fixtures, or an explicitly
  separate development mock adapter.
- Remove legacy `src/screens/*`, `src/lib/demo.ts`, and `src/data.ts` branches
  once equivalent production flows pass.

## 4. Target User Journeys

Each journey must work at mobile and desktop sizes and must have a dedicated
E2E test.

### 4.1 Account and invite

1. User signs up, sees a neutral confirmation state, verifies email, and lands
   on the intended route.
2. User signs in and returns only to a validated same-origin `returnTo` route.
3. User requests password recovery without account enumeration.
4. User opens `/join/:code`, sees limited trip metadata, authenticates, joins
   exactly once, and lands on the trip overview.
5. Expired, revoked, exhausted, malformed, and archived-trip invites show
   distinct user-safe messages.
6. Signing out clears protected query data and returns to sign-in.

### 4.2 Trip creation and navigation

1. Any verified user creates a trip.
2. The creator is visibly the owner and sole initial member.
3. The new trip appears immediately in the trip list.
4. Overview, Expenses, Balances, Activity, and Settings remain reachable after
   direct navigation, refresh, back/forward, and Realtime refetch.
5. The app presents one header and one navigation system, never competing demo
   and production shells.

### 4.3 Expense lifecycle

1. User records an expense with one or multiple payers.
2. User selects participants and uses equal, exact, percentage, or shares.
3. The preview proves payer total and split total equal the expense amount.
4. User optionally uploads, views, replaces, or removes a receipt.
5. Detail shows member names, amounts, notes, receipt, author, timestamps, and
   audit history.
6. Author or owner edits an expense with existing values preloaded.
7. Author or owner soft-deletes; owner can restore from activity or a deleted
   filter.
8. A retry with the same request ID returns the original mutation result and
   does not duplicate data.

### 4.4 Balance and settlement

1. Each member sees paid, owed, sent, received, and net totals.
2. Simplified transfers identify real names and exact outstanding amounts.
3. A debtor records a partial or full settlement to the specified creditor.
4. A stale or concurrent settlement is rejected with refreshed balances and
   preserved form input.
5. Owners can record on behalf of a debtor; normal members cannot.
6. A trip can be marked settled only when all balances are exactly zero.

### 4.5 Membership and lifecycle

1. Owner creates, copies, and revokes an invite.
2. Member can view trip settings but cannot see owner mutation controls.
3. Owner changes a member role with an explicit target role, not a “Toggle.”
4. Owner cannot demote/remove the last owner.
5. A member with nonzero balance cannot be removed.
6. Settled and archived transitions require confirmation and explain impact.
7. Archived state remains readable across all tabs with all writes disabled.

## 5. Database and Security Remediation

Create forward-only migrations under `supabase/migrations/`. Assume existing
migrations may already be applied; do not edit production history as the
primary fix. If the remote environment is confirmed disposable, Luna may squash
only after explicit user approval.

### 5.1 Remove unsafe admin bootstrap

Create a migration that:

1. Drops `trg_maybe_promote_first_admin`.
2. Drops `maybe_promote_first_admin()`.
3. Does not demote existing admins automatically.
4. Documents one manual, audited bootstrap command executed with a service role
   outside the client.
5. Revokes `is_platform_admin(uuid)` from `anon`; authenticated users need only
   query their own status.

Acceptance:

- A new normal signup always has `is_platform_admin = false`.
- No client environment variable can make a user an admin.
- No publishable client key can grant admin.

### 5.2 Fix invite joining

Replace the faulty status assignment in `join_trip_by_code`.

Required transaction:

1. Require `auth.uid()`.
2. Normalize and lock the invite row `FOR UPDATE`.
3. Validate revoked, expiry, max use, and trip status.
4. Return the existing membership without incrementing use count.
5. Insert one membership and increment use count once.
6. Add one audit row.
7. Return the trip UUID.

Add rate limiting outside SQL using Supabase Auth/edge protections or an edge
function if public invite resolution is abused. Never log raw invite codes in
analytics or error monitoring.

### 5.3 Add mutation idempotency

Do not use an audit row as the idempotency mechanism. Add:

```sql
create table public.mutation_requests (
  actor_user_id uuid not null references public.profiles(id),
  request_id uuid not null,
  operation text not null,
  trip_id uuid not null references public.trips(id),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id, operation)
);
```

RLS:

- No direct client select/insert/update/delete.
- Only security-definer RPCs access it.

For every mutating RPC:

1. Require a caller-supplied request ID.
2. Attempt to claim `(auth.uid(), request_id, operation)`.
3. If it exists with a result, return that result.
4. Perform the mutation and audit insert in the same transaction.
5. Store the result before returning.
6. Concurrent duplicate calls must serialize and return one entity.

Cover create expense, update expense, delete, restore, settlement, trip
lifecycle, invite create/revoke, and membership role/removal.

### 5.4 Harden expense RPCs

`save_expense` must validate:

- Trip exists and is `active`.
- Caller is a member.
- Editing caller is original author or trip owner.
- Expense belongs to the supplied trip.
- Description, notes, category, date, currency, receipt path, and amount.
- Currency equals trip base currency.
- Payer and split arrays are nonempty.
- User IDs are unique within each array.
- Every payer/split user is a current trip member.
- Every payer amount is positive.
- Split amount may be zero only for a deliberately selected participant.
- Payer and split sums each equal `amount_minor`.
- Receipt path begins with `<trip_id>/<expense_id-or-request-id>/` and contains
  no traversal segments.

Editing must capture the complete previous financial representation before
replacing child rows. Audit `previous_values`, `new_values`, and only genuinely
changed fields.

Soft delete and restore must:

- Be idempotent.
- Respect trip lifecycle.
- Preserve child rows.
- Return current state.
- Store before/after audit values.

### 5.5 Harden settlements

Inside `record_settlement`:

1. Lock the trip row before computing balances.
2. Require `active` status.
3. Confirm both users are current members and are different.
4. Confirm caller is `from_user_id` or trip owner.
5. Compute current debtor and creditor nets under the lock.
6. Require debtor net `< 0`, creditor net `> 0`.
7. Require amount `<= min(abs(debtor_net), creditor_net)`.
8. Validate payment method, reference, note, and timestamp lengths/ranges.
9. Apply idempotency and append audit in the same transaction.

Add soft-delete/restore settlement RPCs with owner-only restore and equivalent
audit behavior, or explicitly remove settlement edit/delete from Release 1 UI.

### 5.6 Harden lifecycle and membership

Replace permissive/stub logic:

- `update_trip` accepts a typed allowlist of fields. Unknown keys fail.
- No JSON key may bypass archived protection.
- `change_member_role` requires active status, existing target membership, and
  a real change.
- `remove_trip_member` requires active status, existing target membership,
  nonzero-balance rejection, and last-owner protection.
- `mark_trip_settled` accepts only `active -> settled`.
- `reopen_trip` accepts only `settled -> active`.
- `archive_trip` accepts `active|settled -> archived`.
- No transition can move away from archived.
- Lock membership rows while counting owners to avoid concurrent removal of
  the last two owners.

### 5.7 Make audit append-only

RLS alone is insufficient for database owners and future functions.

- Add a trigger that rejects `UPDATE` and `DELETE` on `audit_logs`.
- Revoke direct mutation grants.
- Include request ID, actor, entity, action, before/after values, changed
  fields, and timestamp.
- Exclude credentials, access/refresh tokens, signed URLs, receipt bytes, and
  raw invite codes.
- Store invite IDs and redacted suffixes instead of full codes.
- Keep audit rows after archival.

### 5.8 Implement private receipt storage

Create a private `receipts` bucket and executable storage policies:

- Object path: `<trip_id>/<expense_id>/<uuid>.<extension>`.
- Read: current trip members only.
- Upload/delete: active-trip members; delete also requires uploader/expense
  author or owner.
- Accepted types: JPEG, PNG, WebP, PDF.
- Maximum size: 10 MB unless product owner changes it.
- Validate MIME type and file signature server-side where possible.
- Generate signed read URLs for 10 minutes.
- Never persist a signed URL.
- Remove replaced/orphaned objects through a scheduled cleanup job.
- Receipt UI exposes upload progress, cancel, retry, preview/download, replace,
  and remove.

### 5.9 Generate and use database types

- Regenerate `src/types/database.ts` from the actual schema.
- Remove RPC `as any` casts.
- CI fails if generated types differ from the checked-in file.
- Avoid hand-maintained table/RPC contracts that drift from migrations.

## 6. Frontend Architecture Remediation

### 6.1 Required target structure

Use focused production modules:

```text
src/
  app/
    App.tsx
    providers.tsx
    routes.tsx
    guards/
    errors/
  components/
    feedback/
    finance/
    forms/
    members/
    navigation/
  features/
    auth/
    trips/
    expenses/
    balances/
    settlements/
    activity/
    settings/
    profile/
  lib/
    currency.ts
    errors.ts
    network.ts
    queryClient.ts
    supabase.ts
  types/
    database.ts
```

Delete legacy production dependencies on:

- `src/screens/TripDashboard.tsx`
- `src/screens/RealTripOverview.tsx`
- `src/screens/AuthPage.tsx`
- `src/screens/TripFlows.tsx`
- `src/screens/TripsPage.tsx`
- `src/lib/demo.ts`
- fixture exports in `src/data.ts`
- duplicate shared components in `src/ui.tsx`

Do this only after replacement routes are covered.

### 6.2 Providers and failure boundaries

Add:

- A route error boundary with a nontechnical message, retry, and return action.
- Query cache clearing on sign-out and auth-user change.
- Session-expiry handling that preserves the intended route.
- A centralized domain-error mapper from stable database error codes to
  user-safe copy.
- Online/offline state available to mutation controls.
- A single toast system with `aria-live`, severity, deduplication, and manual
  dismissal for errors.

Do not show migration filenames, RLS advice, Supabase dashboard instructions,
raw PostgREST codes, UUIDs, or stack messages in end-user screens.

### 6.3 Routing

Production routes:

```text
/sign-in
/sign-up
/verify-email
/forgot-password
/reset-password
/auth/callback
/join
/join/:code
/trips
/trips/new
/trips/:tripId
/trips/:tripId/expenses
/trips/:tripId/expenses/new
/trips/:tripId/expenses/:expenseId
/trips/:tripId/expenses/:expenseId/edit
/trips/:tripId/balances
/trips/:tripId/activity
/trips/:tripId/settings
/profile
```

Rules:

- Unknown routes render a real 404, not a silent redirect to `/trips`.
- Lazy-load route features to reduce the initial bundle.
- Validate `returnTo` as an internal path.
- Distinguish unauthenticated, forbidden, and not-found without leaking hidden
  resource existence.
- Route guards must never redirect while auth is loading.
- Recovery routes validate the recovery session before showing a password form.
- OAuth callback handles provider errors and restores pending invite/returnTo.

### 6.4 One responsive shell

`TripLayout` owns all trip chrome.

- Mobile below 768 px: compact header plus one fixed five-item bottom nav.
- Tablet/desktop: header plus visible horizontal tabs or left navigation; hide
  the bottom nav.
- Content includes safe-area and nav clearance.
- Direct child routes retain the same shell.
- No nested `min-h-screen` route components.
- No max-width 480 px phone simulation on desktop.
- Use a content max width around 1120 px and layouts that use desktop space.
- Keep the active route in the URL; do not duplicate it in local tab state.
- Realtime refetch must not change the active route or scroll unexpectedly.

## 7. Screen and Interaction Requirements

### 7.1 Authentication

- Use “Sign in,” not “Admin sign in.”
- Sign-up is available to normal users.
- Password fields support show/hide, password-manager autocomplete, and clear
  requirements.
- Disable double submit and preserve entered email after a recoverable error.
- Error copy does not reveal whether an account exists.
- Resend confirmation has cooldown and success/error status.
- Google OAuth button shows a recognizable provider mark and loading state.
- Auth pages remain usable at 320 px width and 200% zoom.

### 7.2 Join

State machine:

1. Code entry.
2. Validating with a skeleton/status.
3. Valid preview.
4. Sign in/sign up required while preserving code.
5. Joining.
6. Joined/already joined.
7. Invalid, expired, exhausted, revoked, archived, offline, or server error.

Do not resolve on every keystroke without debounce. Normalize codes and provide
a paste action on mobile where supported.

### 7.3 Trips list

Each card shows:

- Name, destination, date range, base currency, status.
- Actual member count.
- Actual tracked total in base currency.
- Current user role.
- A clear archived/settled visual state.

Required list states:

- Loading skeleton.
- No trips with Create and Join actions.
- Active/settled/archived filtering.
- Recoverable error with retry.
- Offline cached state labeled as potentially stale.

Do not expose `.env`, Supabase, RLS, or migration advice.

### 7.4 Trip overview

Overview shows:

- Current user net balance with “you owe,” “you are owed,” or “settled.”
- Total group spend.
- Member count and accessible avatar stack.
- Category breakdown only when data exists.
- Recent expenses with payer and current-user share.
- Suggested settlements when balances are nonzero.
- Empty state with Add expense and Invite members actions.

Never fabricate the current user as owner when membership loading fails.
Display a retryable member-data error. Copy such as “Created by you” must derive
from `trip.created_by === user.id`.

### 7.5 Expense list

- Search description and notes.
- Filter category, date range, payer, and deleted state for owners.
- Sort by date newest, date oldest, amount, and recently updated.
- Group by date for scanning on mobile.
- Each row uses member names, localized date, category, amount, and user share.
- Empty search and empty trip states are distinct.
- Hide Add expense when settled/archived.

### 7.6 Expense form

Build the form around one typed draft model.

Fields:

- Description.
- Major-unit amount formatted for base currency.
- Read-only base currency.
- Date constrained by an explicit product rule; do not silently force trip
  dates unless required.
- Category.
- Notes with remaining length.
- Receipt.
- One or more payers with major-unit contributions.
- Selected split participants.
- Segmented mode control: Equal, Exact, Percent, Shares.

Mode behavior:

- Equal: deterministic minor-unit remainder distribution in selected-member
  order.
- Exact: each user enters a major-unit amount; live remaining amount reaches
  zero.
- Percent: each user enters percentage; total must equal exactly 100.00%.
- Shares: nonnegative integer shares; at least one positive; preview derived
  amounts.

Always show:

- Total paid versus expense total.
- Total allocated versus expense total.
- Remaining/overallocated amount.
- Human-readable per-person preview.

Edit:

- Fetch detail before initializing the form.
- Show a skeleton until loaded.
- Reset once with server values.
- Preserve unsaved user edits across a background refetch.
- Warn before route leave when dirty.
- If the expense changed since loaded, require conflict resolution rather than
  silently overwriting. Add `updated_at` optimistic concurrency to the RPC.

Remove the current “Minor 1000” copy and never display raw user IDs.

### 7.7 Expense detail

Production detail must fetch by `(trip_id, expense_id)` and render:

- Description, formatted amount, category, and date.
- Payers and splits with member names/avatars.
- Notes.
- Receipt preview/download.
- Created by, created at, updated by, updated at.
- Expense-specific audit entries.
- Edit/delete actions based on author/owner and trip status.

Deleted expense detail is owner-readable with Restore. Normal list queries
exclude it.

### 7.8 Balances and settlements

Balance cards show formatted paid, share, settlements, and net values.

Suggested transfers:

- Render debtor and creditor names.
- Include a “Settle” command only when current user may record it.
- Open `SettlementDialog` with real IDs and names.
- Offer common payment methods as a select/menu, not unvalidated free text.
- Preserve reference/note after a stale-balance error.
- Refetch balances after success and announce the result.

When all balances are zero, show settled state and the owner lifecycle action.

### 7.9 Activity

- Join audit rows with actor profile names.
- Convert action/entity codes into plain-language summaries.
- Show exact changed fields with before/after values where authorized.
- Use cursor `(created_at, id)` for stable pagination, including equal
  timestamps.
- Group by day and provide entity/action filters.
- Redact invite codes and receipt object paths.
- Empty, loading, error, load-more pending, and end-of-list states are explicit.

### 7.10 Settings and members

All members may view trip metadata and member list. Owner-only sections are
rendered only for owners.

Owner controls:

- Edit allowed trip fields.
- Invite management.
- Promote to owner / change to member with explicit labels.
- Remove member with name in confirmation.
- Mark settled, reopen, archive.

Rules:

- Pass `user_id`, never a nonexistent `id`.
- Do not show mutation controls while role is unresolved.
- Prevent the owner acting on stale membership via server errors and refetch.
- Confirmation dialogs stay open while submitting and show inline errors.
- A dialog must not close before an async mutation succeeds.

### 7.11 Profile

- Validated name update with pending/success/error states.
- Auth email displayed as read-only.
- Optional avatar upload uses a separate safe bucket/policy.
- Auth context/profile queries refresh after a successful update.
- Demo copy is absent in production.

## 8. Accessibility and Visual Quality

Meet WCAG 2.2 AA.

### 8.1 Global

- Add a visible-on-focus skip link.
- Keep browser scrollbars; remove the global scrollbar-hiding rules.
- Add consistent `:focus-visible` rings to links, buttons, inputs, tabs, and
  custom controls.
- Minimum touch target: 44x44 CSS px for primary interactive controls.
- Semantic headings follow a logical hierarchy per route.
- Use actual buttons for commands and links for navigation.
- Every icon-only button has an accessible name and tooltip where needed.
- Respect `prefers-reduced-motion`.
- Support 200% zoom without lost controls or horizontal page scrolling.

### 8.2 Contrast

Current token checks against white:

- `ink-faint` is about 3.07:1.
- `owed` is about 3.39:1.
- `owe` is about 3.34:1.

These fail AA for normal text. Redefine text tokens or restrict them to
non-text decoration/large text. Verify every text/background pair with
automated axe checks and a contrast tool.

Do not use color alone for positive/negative/status meaning; retain labels and
icons.

### 8.3 Dialogs, toasts, and forms

- Use a reusable accessible dialog primitive for confirm and settlement.
- Trap focus within the specific dialog, not a global document selector.
- Restore focus to the invoker.
- Prevent background pointer and screen-reader interaction.
- Escape closes only when not submitting.
- Validation errors use `aria-invalid` and `aria-describedby`.
- On failed submit, focus the error summary or first invalid field.
- Toast container is an appropriate live region and does not overlap mobile
  bottom navigation.

### 8.4 Responsive design

Verify at:

- 320x568.
- 390x844.
- 768x1024.
- 1024x768.
- 1440x900.

The current mobile split selector crowds five controls into one row. Replace it
with a wrapping segmented control or responsive grid. Desktop overview must use
available width instead of rendering a tiny phone column.

## 9. Resilience, Privacy, and Performance

### 9.1 Connectivity

- Offline state blocks all mutations in the UI.
- A mutation started online that fails offline retains user input and offers
  retry.
- Do not claim offline write support.
- Query cache may display stale read data with a clear stale indicator.
- Realtime reconnect state is visible but nonblocking.

### 9.2 Error handling

Define stable server error codes, for example:

```text
AUTH_REQUIRED
PERMISSION_DENIED
NOT_FOUND
TRIP_NOT_ACTIVE
TRIP_ARCHIVED
INVITE_INVALID
INVITE_EXPIRED
INVITE_EXHAUSTED
LAST_OWNER
MEMBER_HAS_BALANCE
BALANCE_CHANGED
VALIDATION_FAILED
CONFLICT
RATE_LIMITED
```

Raise codes separately from internal detail. Client maps codes to copy and logs
redacted diagnostic context.

### 9.3 Performance

- Lazy-load route features.
- Set a bundle budget: initial route JS <= 250 kB gzip, with documented
  exceptions.
- Do not load charts on routes that do not render charts.
- Use query selection/pagination; avoid fetching unbounded audit history.
- Avoid request waterfalls for trip, role, and member data by defining a
  coherent trip-shell query strategy.
- Self-host fonts or use system fonts to avoid render-blocking third-party
  Google Fonts requests and privacy leakage.

### 9.4 Production metadata

Fix `.figma/make/site.json`:

- Title and description must describe TripSplit, not task tracking.
- Configure favicon and social metadata.
- Keep `noindex` until the product is intentionally public.
- Add privacy/support links where the deployment requires them.

### 9.5 Observability

Configure production error reporting and structured events:

- Auth failures by category, without email/token.
- Invite validation/join outcome, without raw code.
- RPC error code and operation.
- Receipt upload failure category.
- Realtime connection health.
- Web vitals and route load timing.

Never log notes, receipt content/URLs, auth tokens, full invite codes, or
financial payloads.

## 10. Autonomous Verification Contract

The user has explicitly authorized local automated tests, type checks, builds,
browser launches, screenshots, and accessibility checks for this production
readiness work. Luna should run them without asking again. Approval is still
required for destructive remote data changes, paid services, production
deployments, or transmitting credentials not already authorized.

### 10.1 Toolchain gate

First make this pass:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Align TypeScript and dependency versions. Do not hide declaration errors using
`skipLibCheck`; the current failure is parser-level and must be fixed by a
compatible toolchain.

Add:

```json
"verify": "pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e"
```

Keep DB checks as a separate required CI job if they need a local Supabase
service.

### 10.2 Unit tests

Required domains:

- Currency metadata, parsing, formatting, and bounds for 0- and 2-decimal
  currencies.
- Equal/exact/percent/shares allocation with deterministic remainder.
- Conservation: all balances sum to zero.
- Debt simplification determinism.
- Error-code mapping.
- Return-path validation.
- Permission/capability derivation.
- Audit redaction and diff generation.

Use property-based or exhaustive boundary tests for financial helpers where
valuable. Tests must exercise the production helper, not copied logic.

### 10.3 Component tests

Cover:

- Auth guards and recovery session states.
- Join state machine.
- One responsive trip navigation source.
- Expense create/edit initialization and dirty conflict behavior.
- All four split modes through user interaction.
- Multiple payers.
- Receipt upload states.
- Role-gated settings actions.
- Async confirmation failure keeps dialog open.
- Offline mutation blocking.
- Accessible dialog focus and error focus.
- Loading, empty, error, forbidden, settled, and archived states.

### 10.4 Executable database tests

Use a local Supabase stack reset from migrations. Tests must create at least:

- Owner A.
- Member B.
- Nonmember C.
- Active, settled, and archived trips.
- Expenses and balances involving A and B.

Prove:

1. C cannot read any trip-owned row or receipt.
2. B cannot execute owner-only mutations.
3. Direct writes to financial child/audit tables fail.
4. Invite join succeeds once and duplicate join is idempotent.
5. Revoked/expired/exhausted invite fails.
6. Invalid payer/split sum rolls back all rows.
7. Duplicate request IDs create one expense/settlement.
8. Concurrent settlements cannot overpay.
9. Settlement cannot target another debtor.
10. Last owner cannot be concurrently removed/demoted.
11. Archived trip rejects every mutation RPC.
12. Audit update/delete fails.
13. Receipt policies isolate trips.
14. Removed member loses read access.
15. Mark settled/reopen/archive transitions follow the state machine.

`supabase/tests/rls.sql` must contain executable assertions and fail the command
on a policy regression.

### 10.5 End-to-end tests

Make Playwright portable:

- If `PLAYWRIGHT_BASE_URL` is present, do not start a web server.
- Otherwise start preview on a configurable free port and use the same port in
  `baseURL`.
- Figma Make review can use `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8443`.
- CI uses an isolated local Supabase project and seeded test identities.
- Do not target production Supabase.

Do not use `.catch(() => {})`, conditional no-op assertions, or runtime
`test.skip()` to convert defects into passes. Environment-based skipping must
be declared at suite setup with a recorded reason.

Required E2E journeys are those in section 4, plus:

- Direct URL and refresh for every protected route.
- Back/forward navigation.
- Two browser contexts proving Realtime invalidation.
- Offline failed submit and recovery.
- 409/stale balance conflict.
- Unauthorized deep link.
- Receipt upload/view/replace/remove.

### 10.6 Accessibility and visual checks

Add `@axe-core/playwright` and fail on serious/critical violations.

For each primary route:

- Run axe at mobile and desktop.
- Capture screenshots at the viewport matrix in section 8.4.
- Assert no horizontal document overflow.
- Assert fixed navigation does not cover the last focusable/content element.
- Keyboard-test all commands, dialogs, tabs, and forms.
- Test reduced motion and 200% zoom.

Visual snapshots are regression aids, not a substitute for semantic assertions.

### 10.7 Test quality gate

Before accepting a test:

- It fails when the target behavior is deliberately broken.
- It asserts a user-visible or database invariant.
- It does not merely assert that a heading exists.
- It does not reimplement the production algorithm.
- It cleans up created state.
- It does not depend on test order.
- It has no production credential or service-role key in client code.

## 11. Implementation Phases

### Phase 0: Establish a truthful green baseline

Deliverables:

1. Align TypeScript/dependency versions.
2. Fix Playwright base URL/web server configuration.
3. Add local Supabase test bootstrap and deterministic fixtures.
4. Replace placeholder/static DB tests with at least one real failing security
   assertion.
5. Record baseline bundle size and current screenshot matrix.
6. Add a CI workflow for typecheck, unit/component, build, DB, E2E, and axe.

Exit gate:

- Typecheck, unit/component, build, one real DB test, and one browser smoke test
  all run from documented commands.
- No false-green placeholder test remains in required jobs.

### Phase 1: Close identity and database integrity blockers

Deliverables:

1. Durable user auth and invite-after-auth flow.
2. Unsafe admin bootstrap removed.
3. Invite join RPC fixed and tested.
4. Idempotency table/protocol.
5. Expense, settlement, lifecycle, membership, audit, and receipt policies
   hardened as section 5 specifies.
6. Generated database types.

Exit gate:

- All database tests in section 10.4 pass against a fresh reset.
- Two-user and nonmember isolation is proven.
- No client `as any` is needed for Supabase RPCs.

### Phase 2: Replace demo architecture and unify the shell

Deliverables:

1. One production route tree and responsive trip shell.
2. Real trip/member/role capability queries.
3. Route error boundaries and safe error mapping.
4. Demo branches removed from production.
5. Query cache/session/Realtime lifecycle fixed.
6. Route-level lazy loading.

Exit gate:

- Direct navigation to every route retains one shell.
- Mobile and desktop navigation pass screenshot, keyboard, and overflow checks.
- Sign-out clears protected UI/cache.

### Phase 3: Complete expense workflows

Deliverables:

1. Production list and detail queries.
2. Correct create and edit form.
3. Multiple payers and all four split modes.
4. Currency precision by trip base currency.
5. Receipt workflow.
6. Delete/restore and expense audit.
7. Dirty-state and optimistic concurrency handling.

Exit gate:

- All expense journeys pass UI, RPC, DB, E2E, axe, and responsive tests.
- Retrying a request produces one expense.
- No raw IDs/minor units appear in user copy.

### Phase 4: Complete balances and settlements

Deliverables:

1. Full balance breakdown.
2. Suggested transfer UI.
3. Connected settlement dialog.
4. Partial/full settlement.
5. Stale/concurrent balance recovery.
6. Settlement audit and optional delete/restore decision.

Exit gate:

- Conservation and concurrency tests pass.
- Two browser contexts converge after settlement without manual refresh.

### Phase 5: Complete settings, activity, and lifecycle

Deliverables:

1. Owner/member capability-correct settings.
2. Member role/removal fixes.
3. Invite management.
4. Human-readable activity with stable pagination.
5. Settle/reopen/archive flows.
6. Profile completion.

Exit gate:

- Every role matrix case has a database assertion and a browser assertion.
- Archived trip is fully readable and fully immutable.

### Phase 6: Usability, accessibility, resilience, and performance

Deliverables:

1. WCAG fixes including contrast, focus, scrollbars, dialog, and live regions.
2. Full loading/empty/error/offline/reconnecting coverage.
3. Responsive layout at all required viewports.
4. Route code splitting and initial bundle budget.
5. Correct metadata, fonts, favicon, and noindex policy.
6. Observability hooks with redaction tests.

Exit gate:

- No serious/critical axe failures.
- All screenshot/overflow/zoom/reduced-motion checks pass.
- Initial JS meets budget or has an approved documented exception.
- No end-user screen contains implementation instructions.

### Phase 7: Release rehearsal

Deliverables:

1. Fresh environment deployment from migrations.
2. Auth redirect/email/OAuth configuration verified.
3. Receipt bucket and cleanup job verified.
4. Backup/restore rehearsal for database and storage metadata.
5. Monitoring alert smoke test.
6. Staging E2E run against release candidate.
7. Rollback procedure and data-migration compatibility documented.

Exit gate:

- Release checklist has command output, environment, timestamp, and owner.
- No open P0/P1 defect.
- Production secrets are absent from repository and client bundle.

## 12. Luna Working Rules

1. Read this entire document before changing code.
2. Start at Phase 0 even if later-phase code already exists.
3. Work from failing tests for each defect.
4. Use forward migrations; never silently rewrite applied production history.
5. Keep changes phase-scoped and reviewable.
6. Preserve unrelated user changes.
7. Do not add hundreds of shallow tests. Add the smallest set that proves the
   invariants and journeys above.
8. Do not use a mocked green test where a local database/browser can prove the
   behavior.
9. Do not hide failures with catches, skips, `any`, `skipLibCheck`, or raw error
   suppression.
10. Stop when an external configuration item blocks proof; report the exact
    missing input and keep the phase open.
11. At every exit gate, provide:
    - Files changed.
    - Migrations added.
    - Commands run.
    - Pass/fail counts.
    - Browser/viewports exercised.
    - Remaining risks.
    - Manual/external steps still unverified.

## 13. External Configuration Required

These are not solvable by client code alone:

- Confirm whether the current Supabase project contains disposable or
  production-like data before migration reset/squash.
- Provision platform admins through a secure server-side process.
- Configure production site URL and allowed auth redirect URLs.
- Configure email sender, templates, rate limits, and deliverability.
- Configure Google OAuth credentials if retained.
- Decide account deletion, data export, retention, and privacy policy.
- Configure storage bucket limits and orphan cleanup schedule.
- Provide staging/CI Supabase credentials and service role only to secure CI
  secrets.
- Choose error monitoring/analytics provider and retention policy.
- Choose production hosting, domain, CSP, HSTS, and security headers.
- Define backup frequency, restore objective, and incident owner.

Until these are completed and rehearsed, Luna must describe the relevant
release gate as **unverified**, not complete.

## 14. Final Definition of Done

TripSplit is production-ready only when:

- Every target journey in section 4 passes against staging.
- Typecheck, unit/component, executable DB, E2E, axe, and build jobs are green.
- RLS isolation is proven with owner, member, and nonmember identities.
- Financial writes are atomic, idempotent, currency-correct, and concurrency
  tested.
- All advertised UI controls perform their advertised function.
- Demo fixtures and implementation guidance are absent from production.
- Mobile, tablet, desktop, keyboard, zoom, and reduced-motion checks pass.
- Receipts are private and recoverable without signed-URL leakage.
- Audit is immutable and complete.
- Archived trips are immutable.
- Monitoring, backup, restore, deployment, and rollback have evidence.
- No P0/P1 issue remains open.
