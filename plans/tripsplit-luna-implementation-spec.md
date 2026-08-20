# TripSplit Production Implementation Specification

> **Implementation target:** Luna or another coding agent working in this repository.
>
> **Source of truth:** This document supersedes `plans/good-for-poc-lets-sharded-fern.md`
> where the two differ. The original product brief remains at
> `src/imports/pasted_text/trip-split-app-design.md`.

## 1. Objective

Turn the current local-only TripSplit prototype into a production-pattern,
multi-user travel expense application backed by Supabase.

Authenticated users must be able to:

1. Create or join trips.
2. Record, edit, and soft-delete shared expenses.
3. Split expenses equally, by exact amount, percentage, or shares.
4. See live per-member balances and simplified transfers.
5. Record full or partial settlements.
6. Review an immutable audit trail.
7. Manage trip membership and lifecycle according to their role.
8. Use the app across phones with changes appearing without a manual refresh.

This is an implementation specification, not permission to weaken security for a
demo. Authorization must be enforced by PostgreSQL Row-Level Security (RLS), not
only by hidden client controls.

## 2. Current Repository State

The repository is a React 19, Vite 8, TypeScript 5.7, and Tailwind CSS 4 Figma
Make app.

Existing relevant files:

| File | Current responsibility | Required disposition |
|---|---|---|
| `src/main.tsx` | Mounts `src/app/App.tsx` | Keep |
| `src/app/App.tsx` | Auth provider and router root | Refactor to production providers |
| `src/app/routes.tsx` | Browser route table | Expand and harden |
| `src/lib/auth.tsx` | Local-storage demo auth | Replace with Supabase auth |
| `src/lib/demo.ts` | Local trip persistence | Remove after Supabase cutover |
| `src/data.ts` | Demo types, fixtures, and financial helpers | Split fixtures from pure money helpers |
| `src/ui.tsx` | Shared primitives | Preserve and extend |
| `src/charts.tsx` | Donut and daily bars | Preserve |
| `src/screens/AuthPage.tsx` | Combined demo auth screen | Split by auth workflow |
| `src/screens/TripsPage.tsx` | Demo trip list | Replace data source and add statuses |
| `src/screens/TripFlows.tsx` | Demo create/join forms | Split and connect to RPCs |
| `src/screens/TripDashboard.tsx` | 1,478-line single-trip UI | Decompose by feature |
| `src/index.css` | Tailwind import and design tokens | Preserve visual language |

The current UI has useful interaction and styling work but is not a secure data
architecture. Do not preserve local-storage financial data after Supabase is
connected. Do not treat hard-coded `YOU`, `members`, `trip`, or fixture arrays as
production entities.

## 3. Locked Product Decisions

These decisions resolve conflicts between the original design prompt and the
earlier plan:

- Authentication: email and password with email confirmation and password
  reset, plus optional Google OAuth. Do not implement magic-link-only auth.
- Backend: Supabase Auth, PostgreSQL, RLS, Realtime, and Storage.
- Currency storage: ISO 4217 uppercase code plus integer minor units. Never use
  floating-point database columns for money.
- Base-currency accounting: phase 1 supports only expenses in the trip's base
  currency. The UI may show a currency field, but it is read-only and equal to
  the trip base currency. FX conversion is out of scope.
- Roles: `owner` and `member`. A trip must always retain at least one owner.
- Financial deletion: soft-delete expenses and settlements. Audit rows are
  never deleted.
- Admin: reserve `profiles.is_platform_admin` and `/admin`; do not build a
  platform administration dashboard.
- Backend mutations that span multiple tables must use PostgreSQL functions
  invoked through `supabase.rpc()`. Do not perform multi-table financial writes
  as unrelated client requests.
- Receipt objects are private. Store only object paths in tables and generate
  signed URLs on demand.

## 4. Non-Goals

Do not implement these in the first production release:

- Foreign-exchange conversion or historical exchange rates.
- Card, bank, or UPI payment initiation.
- Offline mutation queues or conflict-free replication.
- Comments, chat, reactions, or social feeds.
- Recurring expenses.
- Platform-admin operations.
- Hard deletion of trips or financial records.
- Public trip discovery.

The app must detect loss of connectivity and block writes with a useful message.
Read-only cached UI may remain visible, but do not claim offline write support.

## 5. User Roles and Authorization

| Capability | Guest | Member | Owner | Platform admin |
|---|---:|---:|---:|---:|
| Sign up/sign in/reset | Yes | Yes | Yes | Yes |
| Read joined trip | No | Yes | Yes | Future |
| Add expense | No | Yes | Yes | Future |
| Edit own expense | No | Yes | Yes | Future |
| Edit another user's expense | No | No | Yes | Future |
| Soft-delete own expense | No | Yes | Yes | Future |
| Record own outgoing settlement | No | Yes | Yes | Future |
| Edit trip details | No | No | Yes | Future |
| Invite members | No | Yes | Yes | Future |
| Change roles/remove members | No | No | Yes | Future |
| Settle/archive trip | No | No | Yes | Future |
| Read audit log | No | Yes | Yes | Future |
| Mutate audit log | No | No | No | No |

Archived trips are read-only for all trip members. Owners may not add or edit
expenses, settlements, or membership after archive.

## 6. Information Architecture and Routes

Use `react-router` because it is already installed. Keep route modules lazy where
practical, but correctness is more important than premature bundle splitting.

| Route | Access | Screen behavior |
|---|---|---|
| `/sign-in` | Guest | Email/password and Google sign-in |
| `/sign-up` | Guest | Name, email, password, confirmation state |
| `/verify-email` | Guest | Waiting, resend, confirmed, expired/error |
| `/forgot-password` | Guest | Request reset email |
| `/reset-password` | Recovery session | Set and confirm new password |
| `/auth/callback` | Guest | Complete OAuth/recovery exchange and redirect |
| `/` | Authenticated | Redirect to `/trips` |
| `/trips` | Authenticated | Active/settled/archived trip list |
| `/trips/new` | Authenticated | Create trip |
| `/join/:code?` | Authenticated | Join by URL or entered code |
| `/trips/:tripId` | Trip member | Overview tab |
| `/trips/:tripId/expenses` | Trip member | Expense list |
| `/trips/:tripId/expenses/new` | Trip member | Add expense |
| `/trips/:tripId/expenses/:expenseId` | Trip member | Expense detail |
| `/trips/:tripId/expenses/:expenseId/edit` | Author or owner | Edit expense |
| `/trips/:tripId/balances` | Trip member | Balances and transfers |
| `/trips/:tripId/activity` | Trip member | Audit feed |
| `/trips/:tripId/settings` | Trip member | Read settings; owner controls gated |
| `/profile` | Authenticated | Name and avatar |
| `/admin` | Platform admin | Explicit "not implemented" stub |

Route guards must distinguish:

1. Auth state still loading: render a full-page skeleton, never redirect.
2. No session: redirect to `/sign-in?returnTo=<encoded-path>`.
3. Session exists but user is not a trip member: render permission denied.
4. Resource does not exist or is invisible under RLS: render not found.
5. Archived trip: render normally in read-only mode.

## 7. Database Model

Create ordered SQL migrations under `supabase/migrations/`. Use `uuid` primary
keys generated with `gen_random_uuid()`, `timestamptz`, and `bigint` minor units.

### 7.1 Enumerations

```sql
create type public.trip_role as enum ('owner', 'member');
create type public.trip_status as enum ('active', 'settled', 'archived');
create type public.expense_category as enum (
  'food', 'transport', 'accommodation', 'tickets', 'shopping', 'other'
);
create type public.audit_action as enum (
  'create', 'update', 'soft_delete', 'restore', 'join', 'remove',
  'role_change', 'settle', 'archive'
);
```

### 7.2 `profiles`

```text
id uuid primary key references auth.users(id) on delete cascade
name text not null check length(trim(name)) between 1 and 80
email text not null
avatar_path text null
is_platform_admin boolean not null default false
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Create a `handle_new_user()` trigger on `auth.users` that inserts a profile using
`raw_user_meta_data->>'name'`, falling back to the email prefix.

### 7.3 `trips`

```text
id uuid primary key
name text not null check length(trim(name)) between 1 and 100
destination text not null check length(trim(destination)) between 1 and 120
start_date date not null
end_date date not null check end_date >= start_date
base_currency char(3) not null check base_currency = upper(base_currency)
status trip_status not null default 'active'
created_by uuid not null references profiles(id)
created_at timestamptz not null default now()
updated_by uuid not null references profiles(id)
updated_at timestamptz not null default now()
```

Indexes: `trips(created_by)`, `trips(status)`.

### 7.4 `trip_members`

```text
trip_id uuid references trips(id) on delete cascade
user_id uuid references profiles(id) on delete cascade
role trip_role not null default 'member'
joined_at timestamptz not null default now()
invited_by uuid null references profiles(id)
primary key (trip_id, user_id)
```

Indexes: `trip_members(user_id, trip_id)`.

### 7.5 `trip_invites`

```text
id uuid primary key
trip_id uuid not null references trips(id) on delete cascade
code text not null unique
created_by uuid not null references profiles(id)
created_at timestamptz not null default now()
expires_at timestamptz not null
max_uses integer null check max_uses is null or max_uses > 0
use_count integer not null default 0 check use_count >= 0
revoked_at timestamptz null
```

Invite codes contain unambiguous uppercase characters and are at least 10
characters. Store a generated code, not a user-selected secret.

### 7.6 `expenses`

```text
id uuid primary key
trip_id uuid not null references trips(id)
description text not null check length(trim(description)) between 1 and 160
amount_minor bigint not null check amount_minor > 0
currency char(3) not null
category expense_category not null
expense_date date not null
notes text null check length(notes) <= 2000
receipt_path text null
created_by uuid not null references profiles(id)
created_at timestamptz not null default now()
updated_by uuid not null references profiles(id)
updated_at timestamptz not null default now()
deleted_by uuid null references profiles(id)
deleted_at timestamptz null
check ((deleted_at is null) = (deleted_by is null))
```

Indexes:

- `expenses(trip_id, expense_date desc) where deleted_at is null`
- `expenses(trip_id, category) where deleted_at is null`
- `expenses(created_by)`

### 7.7 `expense_payers`

```text
id uuid primary key
expense_id uuid not null references expenses(id) on delete cascade
user_id uuid not null references profiles(id)
amount_paid_minor bigint not null check amount_paid_minor > 0
unique (expense_id, user_id)
```

### 7.8 `expense_splits`

```text
id uuid primary key
expense_id uuid not null references expenses(id) on delete cascade
user_id uuid not null references profiles(id)
amount_owed_minor bigint not null check amount_owed_minor >= 0
unique (expense_id, user_id)
```

At least one split must be greater than zero.

### 7.9 `settlements`

```text
id uuid primary key
trip_id uuid not null references trips(id)
from_user_id uuid not null references profiles(id)
to_user_id uuid not null references profiles(id)
amount_minor bigint not null check amount_minor > 0
payment_method text not null check length(trim(payment_method)) between 1 and 40
reference text null check length(reference) <= 120
note text null check length(note) <= 1000
settled_at timestamptz not null
recorded_by uuid not null references profiles(id)
created_at timestamptz not null default now()
updated_by uuid not null references profiles(id)
updated_at timestamptz not null default now()
deleted_by uuid null references profiles(id)
deleted_at timestamptz null
check (from_user_id <> to_user_id)
check ((deleted_at is null) = (deleted_by is null))
```

Indexes: `settlements(trip_id, settled_at desc) where deleted_at is null`.

### 7.10 `audit_logs`

```text
id bigint generated always as identity primary key
trip_id uuid not null references trips(id)
actor_user_id uuid not null references profiles(id)
entity_type text not null
entity_id uuid not null
action audit_action not null
previous_values jsonb null
new_values jsonb null
changed_fields text[] not null default '{}'
request_id uuid not null
created_at timestamptz not null default now()
```

Index: `audit_logs(trip_id, created_at desc, id desc)`.

No foreign key should cascade-delete audit rows. Trips are never hard-deleted in
normal product behavior.

## 8. Database Functions and Atomic Invariants

All functions below use `security invoker` unless a narrowly justified
`security definer` function sets a fixed `search_path` and performs its own
authorization.

### 8.1 Authorization helpers

```sql
public.is_trip_member(p_trip_id uuid, p_user_id uuid default auth.uid())
  returns boolean stable

public.is_trip_owner(p_trip_id uuid, p_user_id uuid default auth.uid())
  returns boolean stable

public.is_trip_writable(p_trip_id uuid)
  returns boolean stable
```

`is_trip_writable` returns true only when the caller is a member and trip status
is `active`.

### 8.2 Create trip

```text
create_trip(
  p_name text,
  p_destination text,
  p_start_date date,
  p_end_date date,
  p_base_currency char(3),
  p_invitee_emails text[]
) returns uuid
```

In one transaction:

1. Insert trip.
2. Insert caller as owner.
3. Create an invite.
4. Audit trip creation and membership creation.
5. Return trip ID.

Invitee emails do not grant membership by themselves. If an email already has a
profile, the function may add that user as a member. Unknown emails receive an
invite through a later delivery integration and do not create fake profiles.

### 8.3 Join trip

```text
join_trip_by_code(p_code text) returns uuid
```

Validate not revoked, not expired, below `max_uses`, trip not archived, and caller
not already a member. Insert membership, increment use count, audit join, and
return trip ID atomically. Rejoining an existing trip returns the trip ID without
duplicating membership or incrementing use count.

### 8.4 Save expense

Client payload:

```ts
export type SaveExpenseInput = {
  expenseId?: string;
  tripId: string;
  description: string;
  amountMinor: number;
  currency: string;
  category: ExpenseCategory;
  expenseDate: string;
  notes: string | null;
  receiptPath: string | null;
  payers: Array<{ userId: string; amountPaidMinor: number }>;
  splits: Array<{ userId: string; amountOwedMinor: number }>;
  requestId: string;
};
```

Expose one `save_expense(p_payload jsonb)` RPC. It must:

1. Lock the trip and existing expense row when editing.
2. Require active-trip membership.
3. Require author or owner for edits.
4. Require every payer and participant to be an active trip member.
5. Require payer sum equals `amount_minor`.
6. Require split sum equals `amount_minor`.
7. Require payload currency equals trip base currency.
8. Insert or update the expense and replace payer/split rows atomically.
9. Write one audit record with a field-level diff and the supplied `request_id`.
10. Return the complete saved expense projection.

Repeated submission with the same `request_id` must not duplicate the mutation.
Implement a unique audit or command-deduplication constraint sufficient to
provide this guarantee.

### 8.5 Soft-delete and restore expense

```text
soft_delete_expense(p_expense_id uuid, p_request_id uuid) returns void
restore_expense(p_expense_id uuid, p_request_id uuid) returns void
```

Author or owner may soft-delete. Only an owner may restore. Both operations audit
the change. Receipt objects remain stored until a separate retention job exists.

### 8.6 Record settlement

```ts
export type RecordSettlementInput = {
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  paymentMethod: string;
  reference: string | null;
  note: string | null;
  settledAt: string;
  requestId: string;
};
```

Expose `record_settlement(p_payload jsonb)`. It must:

1. Lock relevant trip financial rows for the duration of validation and insert.
2. Require caller to equal `fromUserId` or be a trip owner.
3. Require both parties to be trip members.
4. Require active trip status.
5. Recompute the current simplified outstanding relationship.
6. Reject zero, negative, self, reversed, and over-outstanding payments.
7. Insert the settlement and audit row atomically.
8. Return the saved settlement.

Do not trust a client-supplied outstanding amount.

### 8.7 Trip lifecycle and membership

Required RPCs:

```text
update_trip(p_trip_id uuid, p_patch jsonb, p_request_id uuid)
change_member_role(p_trip_id uuid, p_user_id uuid, p_role trip_role, p_request_id uuid)
remove_trip_member(p_trip_id uuid, p_user_id uuid, p_request_id uuid)
mark_trip_settled(p_trip_id uuid, p_request_id uuid)
archive_trip(p_trip_id uuid, p_request_id uuid)
```

Rules:

- Owner-only.
- Reject removal/demotion of the last owner.
- Reject member removal when that member has a non-zero balance.
- Mark settled only when every member net balance is exactly zero minor units.
- Archive from active or settled status.
- Every mutation produces one audit event.

## 9. Balance Computation

Use this sign convention:

```text
net = total paid - total owed + settlements sent - settlements received
```

- Positive net: member should receive money.
- Negative net: member owes money.
- Sum of all member nets must equal zero.

Keep a pure TypeScript implementation for immediate UI projection and tests.
Create a PostgreSQL view or stable function as the authoritative server
projection:

```text
get_trip_balances(p_trip_id uuid)
  -> user_id, paid_minor, owed_minor, sent_minor, received_minor, net_minor
```

Debt simplification uses a deterministic greedy algorithm:

1. Sort creditors by amount descending, then user ID ascending.
2. Sort debtors by absolute amount descending, then user ID ascending.
3. Transfer the smaller of the first debtor and creditor balances.
4. Continue until all balances are zero.

The deterministic tie-break avoids transfer order changing between clients.

All split modes must allocate integer minor units. Remainders go one unit at a
time to selected participants in stable participant order. Percentage inputs
must total exactly `100.00`; exact inputs must total the expense amount; share
inputs must contain at least one positive share.

## 10. RLS and Storage Security

Enable RLS on every public table.

### 10.1 Table policy matrix

| Table | Select | Insert/update/delete |
|---|---|---|
| `profiles` | Authenticated users may read profiles sharing a trip; user reads self | User updates self through restricted fields |
| `trips` | Members only | RPCs; owners for settings |
| `trip_members` | Members of same trip | RPCs; owner-only except join RPC |
| `trip_invites` | Trip members; code lookup only through RPC | RPCs |
| `expenses` | Trip members | RPCs; direct writes denied |
| `expense_payers` | Members through parent trip | RPCs; direct writes denied |
| `expense_splits` | Members through parent trip | RPCs; direct writes denied |
| `settlements` | Trip members | RPCs; direct writes denied |
| `audit_logs` | Trip members | No client insert/update/delete |

Avoid recursive RLS policies on `trip_members`. Authorization helper functions
may be `security definer` only when they set `search_path = public, pg_temp`,
qualify referenced objects, and grant execute only to authenticated users.

### 10.2 Storage buckets

`avatars`:

- User writes only under `<auth.uid()>/`.
- Avatar read may be public if product policy accepts public profile images.
- Maximum 5 MB; JPEG, PNG, or WebP.

`receipts`:

- Private bucket.
- Object path: `<trip_id>/<expense_id>/<uuid>.<ext>`.
- Upload allowed only for active-trip members.
- Read allowed only for current trip members.
- Client requests a short-lived signed URL; never persist the signed URL.
- Maximum 10 MB; JPEG, PNG, WebP, or PDF.

## 11. Audit Design

Audit creation is database-owned. Client code supplies a `request_id` and user
intent but never inserts directly into `audit_logs`.

For each event:

- `actor_user_id` comes from `auth.uid()`.
- `previous_values` and `new_values` contain only approved business fields.
- Exclude email credentials, tokens, signed URLs, binary data, and receipt
  contents.
- `changed_fields` contains sorted field names whose normalized values differ.
- Child payer/split changes are represented as normalized arrays sorted by user
  ID.
- Human-readable text is generated in the client from structured data. Do not
  store English-only prose as the sole audit representation.
- Update and delete on `audit_logs` are denied to every client role.

The activity UI must paginate by `(created_at, id)` cursor, not by offset.

## 12. Realtime Synchronization

Create one Realtime channel per open trip:

```text
trip:<tripId>
```

Subscribe to changes for expenses, payers, splits, settlements, members, trips,
and audit logs filtered by `trip_id` where supported. For child tables without a
direct `trip_id`, prefer a server projection or refetch the affected aggregate.

Realtime events are invalidation signals, not trusted complete state:

1. Receive event.
2. Invalidate the relevant query key.
3. Refetch through RLS-protected queries.
4. Preserve current tab, filters, and form state.

On reconnect, refetch all active-trip query keys. Do not merge unverified event
payloads directly into financial totals.

## 13. Client Architecture

Add TanStack Query because the product requires cache invalidation, mutation
state, retry policy, and Realtime-triggered refetches.

Required dependencies:

```text
@supabase/supabase-js
@tanstack/react-query
react-hook-form
zod
@hookform/resolvers
```

Do not add a second component library. Continue using Tailwind utilities,
Lucide icons, and repository primitives.

Target source structure:

```text
src/
  app/
    App.tsx
    routes.tsx
    providers.tsx
    guards/
      AuthGuard.tsx
      TripGuard.tsx
  components/
    feedback/
      ConfirmDialog.tsx
      EmptyState.tsx
      ErrorState.tsx
      OfflineBanner.tsx
      Skeleton.tsx
      ToastProvider.tsx
    finance/
      CurrencyAmount.tsx
      ExpenseRow.tsx
      BalanceRow.tsx
    members/
      Avatar.tsx
      AvatarStack.tsx
      MemberSelector.tsx
    navigation/
      AppHeader.tsx
      TripNavigation.tsx
    forms/
      FormField.tsx
      CurrencyInput.tsx
  features/
    auth/
      api.ts
      schemas.ts
      AuthCallbackPage.tsx
      SignInPage.tsx
      SignUpPage.tsx
      ForgotPasswordPage.tsx
      ResetPasswordPage.tsx
      VerifyEmailPage.tsx
    profile/
      api.ts
      ProfilePage.tsx
    trips/
      api.ts
      hooks.ts
      schemas.ts
      TripsPage.tsx
      CreateTripPage.tsx
      JoinTripPage.tsx
    expenses/
      api.ts
      hooks.ts
      money.ts
      schemas.ts
      ExpenseFormPage.tsx
      ExpenseDetailPage.tsx
      ExpensesPage.tsx
    balances/
      balanceMath.ts
      hooks.ts
      BalancesPage.tsx
      SettlementDialog.tsx
    activity/
      api.ts
      hooks.ts
      ActivityPage.tsx
      AuditEntry.tsx
    settings/
      api.ts
      TripSettingsPage.tsx
  layouts/
    AppLayout.tsx
    TripLayout.tsx
  lib/
    env.ts
    queryClient.ts
    realtime.ts
    supabase.ts
  types/
    database.ts
    domain.ts
  index.css
  main.tsx
```

Keep files focused. No replacement screen should approach the current
`TripDashboard.tsx` size.

## 14. Core TypeScript Contracts

Use generated Supabase database types as transport types and explicit domain
types in UI code.

```ts
export type Money = {
  minor: number;
  currency: string;
};

export type TripStatus = "active" | "settled" | "archived";
export type TripRole = "owner" | "member";
export type ExpenseCategory =
  | "food"
  | "transport"
  | "accommodation"
  | "tickets"
  | "shopping"
  | "other";

export type TripSummary = {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  baseCurrency: string;
  status: TripStatus;
  role: TripRole;
  memberCount: number;
  totalSpendMinor: number;
  currentUserNetMinor: number;
  memberAvatars: Array<{
    userId: string;
    name: string;
    avatarPath: string | null;
  }>;
};

export type TripMember = {
  userId: string;
  name: string;
  avatarPath: string | null;
  role: TripRole;
  joinedAt: string;
};

export type ExpenseDetail = {
  id: string;
  tripId: string;
  description: string;
  amountMinor: number;
  currency: string;
  category: ExpenseCategory;
  expenseDate: string;
  notes: string | null;
  receiptPath: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  deletedAt: string | null;
  payers: Array<{ userId: string; amountPaidMinor: number }>;
  splits: Array<{ userId: string; amountOwedMinor: number }>;
};

export type MemberBalance = {
  userId: string;
  paidMinor: number;
  owedMinor: number;
  sentMinor: number;
  receivedMinor: number;
  netMinor: number;
};

export type SuggestedTransfer = {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
};
```

Query keys:

```ts
export const tripKeys = {
  all: ["trips"] as const,
  lists: () => [...tripKeys.all, "list"] as const,
  list: (status: TripStatus) => [...tripKeys.lists(), status] as const,
  detail: (tripId: string) => [...tripKeys.all, "detail", tripId] as const,
  members: (tripId: string) => [...tripKeys.detail(tripId), "members"] as const,
  expenses: (tripId: string, filters: ExpenseFilters) =>
    [...tripKeys.detail(tripId), "expenses", filters] as const,
  expense: (tripId: string, expenseId: string) =>
    [...tripKeys.detail(tripId), "expense", expenseId] as const,
  balances: (tripId: string) =>
    [...tripKeys.detail(tripId), "balances"] as const,
  activity: (tripId: string, filters: AuditFilters) =>
    [...tripKeys.detail(tripId), "activity", filters] as const,
};
```

## 15. Form and Money Rules

- Parse currency input as a string and convert to integer minor units at the
  form boundary.
- Reject more fractional digits than the currency supports.
- Never calculate with formatted strings.
- Default expense date to today in the user's local timezone.
- Description is trimmed and required.
- At least one payer and one participant are required.
- Multiple payer amounts must sum to the total.
- The save button remains disabled until client validation passes.
- Server validation remains authoritative; map RPC field errors back to the
  relevant form field.
- Preserve entered values after recoverable server/network errors.
- Disable duplicate submission while a mutation is pending.
- Use `crypto.randomUUID()` as `requestId` per user submission and reuse it on a
  retry of that submission.

## 16. Screen Specifications

### 16.1 Authentication

Sign-in:

- Email and password fields.
- Inline validation and Supabase error mapping.
- Google OAuth button.
- Links to sign-up and forgot password.
- Redirect authenticated users to `returnTo` or `/trips`.

Sign-up:

- Name, email, password, confirm password.
- Password minimum 8 characters.
- Show verify-email state after success; do not navigate into protected routes
  without a valid session.

Recovery:

- Forgot-password always shows a neutral success message to avoid account
  enumeration.
- Reset page requires a valid recovery session.
- Expired or invalid links show a new-link action.

### 16.2 Trips Home

- Tabs: Active, Settled, Archived.
- Each row/card displays destination, dates, members, total spend, current user
  net, and role.
- Positive net: "You are owed"; negative net: "You owe"; zero: "Settled up".
- Empty state actions: Create trip and Join trip.
- Desktop uses a compact two-column list at most; mobile uses one column.

### 16.3 Create and Join

Create fields:

- Name, destination, start date, end date, base currency.
- Optional invitee emails as removable chips.
- On success, navigate to the created trip overview and show invite controls.

Join states:

- Valid and joined.
- Invalid code.
- Expired code.
- Revoked code.
- Already a member.
- Archived trip.

### 16.4 Trip Layout

- Header shows trip name, destination, dates, status, and member avatars.
- Mobile bottom navigation: Overview, Expenses, Balances, Activity.
- Desktop uses a restrained left or top tab navigation; do not stretch the
  480-pixel mobile shell across the page.
- Add-expense action is available on overview and expenses for active trips.
- Settings action remains visible to members, with owner controls gated.

### 16.5 Overview

- Current-user balance summary.
- Total group spend.
- Category breakdown and daily spend chart.
- Four most recent active expenses.
- Loading skeletons preserve layout.
- Empty trip shows Add first expense, not empty charts.

### 16.6 Expense List and Detail

Filters:

- Search description and notes.
- Date range.
- Category.
- Payer.
- Participant.
- Filter state lives in URL search parameters.

List:

- Group by expense date descending.
- Show description, category, primary payer or "multiple payers", total, and
  current user's net contribution.
- Paginate when more than 50 records.

Detail:

- Payers, splits, notes, receipt, author, timestamps, and expense audit history.
- Edit/delete controls only for author or owner and only on active trips.
- Soft-delete requires confirmation.

### 16.7 Expense Form

- Support one or many payers.
- Split tabs use a segmented control: Equal, Exact, Percent, Shares.
- Show every participant's computed minor-unit share.
- Show payer sum and split sum against total.
- Receipt upload occurs before `save_expense`; failed database save retains the
  uploaded path for retry.
- If the user abandons a newly uploaded, unreferenced receipt, attempt cleanup;
  failure is non-blocking and logged.

### 16.8 Balances and Settlements

- Show each member's paid, share, settlement totals, and net.
- Show deterministic simplified transfers.
- A Settle action is offered only for transfers involving the current user,
  unless the current user is an owner recording on behalf of members.
- Settlement form shows outstanding amount and rejects overpayment.
- Confirmation names payer, recipient, amount, date, and method.
- On success, invalidate balances, settlements, overview, and activity.

### 16.9 Activity

- Newest first with cursor pagination.
- Filters: member, action, entity type, date range.
- Human summary plus exact timestamp.
- Detail expands structured before/after values.
- No edit or delete controls.

### 16.10 Settings

All members:

- Read trip details, members, status, and invite code.
- Copy active invite link.

Owners:

- Edit details.
- Regenerate/revoke invite.
- Change roles and remove eligible members.
- Mark settled only when balance is zero.
- Archive with confirmation.

Archived screen:

- Persistent read-only banner.
- No financial or membership mutation controls.

## 17. Shared UI and Accessibility

Preserve the current palette while meeting WCAG 2.2 AA:

- Canvas `#f4f6f9`
- Surface `#ffffff`
- Ink `#1c2430`
- Primary blue `#2563eb`
- Owed emerald `#0e9f6e`
- Owe coral `#ef5b52`

Requirements:

- Cards and panels use radius no greater than 8px unless an existing primitive
  is intentionally circular.
- Use Lucide icons; no hand-drawn SVG duplicates.
- Icon-only buttons require accessible names and tooltips where meaning is not
  universal.
- All dialogs trap focus, close on Escape, restore focus, and label title/body.
- All forms have programmatic labels and inline error associations.
- Do not use color as the only status signal.
- Amounts use tabular numerals and never wrap.
- Long names truncate visually while remaining available to assistive
  technology.
- Minimum touch target is 44 by 44 CSS pixels.
- Respect `prefers-reduced-motion`.

Global states:

- Full app auth loading.
- Route-level loading.
- Empty result.
- Recoverable error with retry.
- Permission denied.
- Not found.
- Saving.
- Offline/read-only.
- Archived/read-only.
- Realtime reconnecting.

## 18. Error Handling

Create a small domain error mapper:

```ts
export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "TRIP_ARCHIVED"
  | "INVITE_INVALID"
  | "INVITE_EXPIRED"
  | "BALANCE_CHANGED"
  | "NETWORK_UNAVAILABLE"
  | "UNKNOWN";
```

- Log technical details to the console only in development.
- Show concise user-safe messages.
- For stale settlement or balance validation, refetch and show "Balances changed;
  review the updated amount."
- Queries may retry transient failures twice with backoff.
- Mutations do not automatically retry unless they carry an idempotent
  `requestId`.
- Never expose raw SQL, policy names, tokens, or stack traces.

## 19. Migration Sequence

Implement in these reviewable phases. Each phase must leave the app runnable.

### Phase 0: Supabase connection gate

- Connect the Figma Make project to Supabase.
- Confirm project URL and anon key are available through generated project
  configuration or `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Add `src/lib/env.ts` with Zod validation.
- Do not commit service-role credentials.

Exit gate: app can create a typed Supabase client without using demo fallbacks.

### Phase 1: Schema, functions, RLS, and storage

- Add enums, tables, indexes, triggers, views/functions, policies, and buckets.
- Add SQL verification scripts for unauthorized reads/writes and financial
  invariants.
- Generate `src/types/database.ts`.

Exit gate: two test users prove trip isolation, audit immutability, and atomic
expense validation.

### Phase 2: Providers, auth, profile, and guards

- Install client dependencies.
- Replace local auth with Supabase session handling.
- Implement callback, confirmation, reset, profile, and guard states.
- Keep financial demo screens temporarily behind authenticated routes only if
  necessary.

Exit gate: refresh preserves session; signed-out protected routes redirect
correctly; auth loading never causes redirect flicker.

### Phase 3: Trips, invites, and trip shell

- Implement trip summaries, tabs, create, join, and trip membership guard.
- Replace hard-coded trip header with route-selected data.
- Add active Realtime trip subscription boundary.

Exit gate: User A creates a trip; User B cannot read it before joining and can
read it after joining.

### Phase 4: Expenses

- Extract pure integer-money and split functions.
- Implement list, filters, detail, form, receipt, save RPC, delete, restore, and
  expense audit.
- Remove expense local-storage persistence.

Exit gate: all four split modes produce exact integer totals; unauthorized edits
fail at both UI and database layers.

### Phase 5: Balances and settlements

- Implement authoritative balance projection and deterministic transfer
  simplification.
- Implement settlement form/RPC and completed payment history.
- Add stale-balance handling.

Exit gate: partial settlement reduces outstanding balance; overpayment and
reversed settlement fail server-side.

### Phase 6: Activity, settings, and lifecycle

- Implement paginated audit UI and filters.
- Implement owner membership controls, settle, and archive.
- Enforce archived read-only state everywhere.

Exit gate: last-owner guard, non-zero member removal guard, settle-zero guard,
and audit persistence all pass.

### Phase 7: Hardening and demo removal

- Add unified loading/error/offline/toast/dialog primitives.
- Remove `src/lib/demo.ts` and production imports of fixture data.
- Split or delete `src/screens/TripDashboard.tsx`.
- Confirm no local-storage financial state remains.
- Complete responsive and accessibility review.

Exit gate: no route depends on hard-coded users, trips, members, expenses, or
balances.

## 20. Testing and Verification Contract

Luna must not claim a phase complete without evidence from the relevant checks.
If the execution environment or user does not authorize automated checks, Luna
must label them "not run" and leave the exact command for the user.

### 20.1 Unit tests

Use Vitest and React Testing Library.

Required pure-function cases:

- Parse/format zero-, two-, and three-decimal currencies.
- Equal split with indivisible remainder.
- Exact split valid and invalid totals.
- Percent split at exactly 100 and off by one basis point.
- Shares split with zero total shares.
- Net balance conservation.
- Deterministic debt simplification with ties.
- Current user's per-expense contribution.
- Audit diff normalization.

### 20.2 Component tests

- Auth guard loading/session/no-session branches.
- Expense form payer and split validation.
- Archived trip disables mutations.
- Settlement overpayment error mapping.
- Permission-gated edit/delete controls.
- Dialog focus and keyboard behavior.

### 20.3 Database tests

Use Supabase local development or SQL transaction scripts with two authenticated
JWT contexts.

Prove:

1. Non-member cannot select any trip-owned row.
2. Member cannot update another user's expense.
3. Owner can update another user's expense through RPC.
4. Direct child-row financial writes fail.
5. Invalid payer or split sum rolls back the entire expense.
6. Audit update/delete fails.
7. Last owner cannot be removed or demoted.
8. Settlement exceeding outstanding fails.
9. Settled status fails with non-zero balances.
10. Archived trip rejects all financial writes.

### 20.4 End-to-end flows

At mobile 390x844 and desktop 1440x900:

1. Sign up, verify, sign in, sign out, reset password.
2. Create trip and copy invite.
3. Join as second user.
4. Add expense with each split mode.
5. Edit and soft-delete expense; inspect audit diff.
6. Record partial then full settlement.
7. Confirm second session receives updates without refresh.
8. Attempt premature settle and member removal.
9. Settle and archive.
10. Confirm archived trip remains readable and immutable.

### 20.5 Standard commands

Add scripts as needed, then use:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm exec playwright test
supabase db reset
supabase test db
```

Do not run formatters across unrelated files.

## 21. Definition of Done

The implementation is complete only when:

- No production route uses demo auth or local-storage financial data.
- All money is stored and computed in integer minor units.
- RLS isolation is proven with at least two users.
- Financial multi-table writes are atomic RPCs.
- Audit rows are trigger/function generated and immutable.
- Realtime invalidates and refetches trip data across two sessions.
- Every required route has loading, empty, error, and permission behavior.
- Archived trips are read-only.
- Receipt access is private and membership-bound.
- Mobile and desktop core flows are usable without overflow or overlap.
- Typecheck, unit, database, build, and E2E results are recorded, or explicitly
  marked not run with reasons.
- No secrets, service-role keys, tokens, signed URLs, or receipt contents appear
  in source, logs, or audit JSON.

## 22. Luna Execution Instructions

Luna should implement one phase at a time and stop at each exit gate for review.

For every phase:

1. Read this specification and the current files named in that phase.
2. Inspect existing changes before editing; preserve unrelated user work.
3. State the exact file set to be created or modified.
4. Implement the smallest complete phase.
5. Report migrations, interfaces, and behavior changed.
6. Run only user-authorized verification.
7. Record observed results separately from unrun checks.
8. Do not begin the next phase until the current exit gate is accepted.

When blocked by missing Supabase connection, credentials, OAuth configuration,
or email provider configuration, stop and state the exact external action
required. Do not create insecure local bypasses and describe them as production
behavior.

## 23. Open External Configuration

These require project-owner action and cannot be completed from source alone:

- Connect/select the Supabase project.
- Configure production Site URL and redirect allowlist.
- Configure Google OAuth credentials and consent screen.
- Configure email sender/domain and templates.
- Choose avatar public-read policy.
- Choose invite expiry and optional maximum-use defaults.
- Configure production observability and error reporting.

Recommended defaults:

- Invite expiry: 30 days.
- Invite maximum uses: unlimited unless owner chooses otherwise.
- Signed receipt URL lifetime: 10 minutes.
- Audit and financial retention: indefinite until a formal retention policy is
  approved.
