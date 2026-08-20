# TripSplit — POC → Production Plan

## Context

The current app is a single-trip, front-end-only POC (`src/App.tsx`, `src/data.ts`,
`src/ui.tsx`, `src/charts.tsx`) with all data hard-coded in memory and no auth,
routing, or persistence. The goal is to make it a real, multi-user product: people
sign in on their own phones, create/join trips, record shared expenses, settle
debts, and rely on a permanent audit trail — with data secured per-trip and synced
live across devices.

**Decisions locked with the user:**
- **Backend:** Full Supabase — Auth + Postgres + Row-Level Security + Realtime + Storage.
- **Admin:** Trip-owner management now; a lightweight platform super-admin later (design for it, don't build the dashboard yet).
- **Auth:** Email + password (with reset) **and** optional Google OAuth.

> Make is not intended for collecting real PII or securing genuinely sensitive
> data; this build treats Supabase as the production pattern for the exercise.

---

## Part A — Use-Case Catalog (BA / PO view)

### Actors & roles
- **Guest** — unauthenticated visitor.
- **User** — authenticated person with a profile.
- **Trip Owner** — user who created a trip (role `owner`); full management rights.
- **Trip Member** — user who joined a trip (role `member`).
- **Platform Admin** — (future) staff overseeing all users/trips.
- **System** — DB triggers & scheduled jobs (writes audit rows, recalculates balances).

### Epic 1 — Authentication & Account
| ID | Use case | Actor | Acceptance criteria |
|----|----------|-------|---------------------|
| UC-1.1 | Sign up with email + password | Guest | Validates email format & password strength; creates `auth.users` + `profiles` row; sends confirmation email; shows verify-email state. |
| UC-1.2 | Sign in with email + password | Guest | Correct creds → session; wrong creds → inline error; rate-limit lockout message. |
| UC-1.3 | Sign in with Google (OAuth) | Guest | Redirect flow; first login provisions a `profiles` row from Google name/avatar. |
| UC-1.4 | Forgot / reset password | Guest | Email reset link; new-password screen validates & confirms; expired-link state. |
| UC-1.5 | Sign out | User | Session cleared, redirected to sign-in, protected routes blocked. |
| UC-1.6 | Session persistence & guard | User | Refresh keeps session; unauthenticated hitting a protected route → redirect to sign-in with return path. |
| UC-1.7 | Edit profile (name, avatar) | User | Update name; upload avatar to Storage; changes reflected everywhere via realtime/refetch. |
| Exceptions | Invalid/expired link, network error, email already registered, OAuth cancelled — each has an explicit state. |

### Epic 2 — Trips (multi-trip home)
| ID | Use case | Actor | Acceptance criteria |
|----|----------|-------|---------------------|
| UC-2.1 | View my trips, tabbed Active / Settled / Archived | User | Each card: destination, dates, member avatars, total spend, your net position, status. |
| UC-2.2 | Create a trip | User | Name, destination, dates, base currency, initial participants (by email); creator becomes `owner`; generates invite code/link. |
| UC-2.3 | Join a trip via invite link/code | User | Valid code → added as `member`, audit logged; invalid/expired/already-member states. |
| UC-2.4 | Open a trip | Member | Lands on Trip Overview; only members can open (RLS-enforced). |
| UC-2.5 | Empty state | User | No trips → guided empty state with Create / Join actions. |

### Epic 3 — Trip Overview
| ID | Use case | Acceptance criteria |
|----|----------|-------|
| UC-3.1 | Show trip header, members, total spend | Owner/Member | Avatars, dates, status badge. |
| UC-3.2 | Show "you are owed / you owe" | Member | Live figure from balances. |
| UC-3.3 | Spending-by-category + daily-spend charts | Member | Reuse `Donut` & `DailyBars` (`src/charts.tsx`). |
| UC-3.4 | Recent expenses + primary Add-expense CTA | Member | Tap row → detail. |

### Epic 4 — Expenses
| ID | Use case | Acceptance criteria |
|----|----------|-------|
| UC-4.1 | Add expense | Member | Description, amount, currency, date, category, notes, receipt; one or many payers; participant selection; split equal/exact/percent/shares; live validation that paid total == amount == split total; per-person preview before save. |
| UC-4.2 | Edit expense | Author or Owner | Same form; produces audit diff of changed fields. |
| UC-4.3 | Soft-delete expense | Author or Owner | Confirm dialog; `deleted_at`/`deleted_by` set; hidden from lists but retained; balances recalc. |
| UC-4.4 | Browse & search expenses | Member | Group by date; search text; filter by date/category/payer/participant. |
| UC-4.5 | Expense detail | Member | Payers, split breakdown, receipt, notes, per-expense history. |
| UC-4.6 | Upload / view receipt | Member | Image to Storage; signed URL; only trip members can view. |
| Exceptions | Split doesn't balance → save disabled; permission-denied on edit by non-author/non-owner; offline → queued/blocked with message. |

### Epic 5 — Balances & Settlements
| ID | Use case | Acceptance criteria |
|----|----------|-------|
| UC-5.1 | Per-member position | Member | Paid, share, net (owed/owes). |
| UC-5.2 | Simplified transfers | Member | Fewest transfers via `simplifyDebts` (`src/data.ts`); "Arun pays Priya ₹1,250". |
| UC-5.3 | Record settlement | Member | From/to, amount, date, method, reference, note; **cannot exceed outstanding**; confirm step; balances recalc immediately. |
| UC-5.4 | Full & partial settlements | Member | Partial reduces balance; pending vs completed clearly distinguished. |
| UC-5.5 | Settlement history | Member | Completed payments list. |

### Epic 6 — Activity & Audit Log
| ID | Use case | Acceptance criteria |
|----|----------|-------|
| UC-6.1 | Chronological immutable feed | Member | Actor, action, entity, timestamp; human-readable summaries. |
| UC-6.2 | Change diff detail | Member | previous → new values for updates. |
| UC-6.3 | Filter | Member | By member, action, entity type, date. |
| UC-6.4 | Append-only guarantee | System | Audit rows cannot be edited/deleted (RLS + trigger); survive archive. |

### Epic 7 — Trip Settings & Membership (Owner admin)
| ID | Use case | Acceptance criteria |
|----|----------|-------|
| UC-7.1 | Edit trip details & currency | Owner | Persisted; audited. |
| UC-7.2 | Manage participants & roles | Owner | Invite/remove members; promote/demote owner; last-owner guard. |
| UC-7.3 | Copy invite link/code | Owner/Member | Clipboard + toast. |
| UC-7.4 | Mark trip settled | Owner | Allowed only when every balance == 0; sets status `settled`. |
| UC-7.5 | Archive trip | Owner | Status `archived`; data retained; read-only. |
| Exceptions | Member attempting owner action → permission-denied state; cannot settle with open balances. |

### Epic 8 — Platform Admin (future, design-only now)
| ID | Use case | Notes |
|----|----------|-------|
| UC-8.1 | List all users / trips | Gated by `profiles.is_platform_admin`; separate `/admin` route stub. |
| UC-8.2 | Suspend account / view audit | Deferred; DB flag + RLS carve-out planned, UI later. |

### Cross-cutting / Non-functional
- **States everywhere:** empty, loading (skeletons), saving, offline banner, validation, permission-denied, error/retry.
- **Realtime:** expenses, splits, settlements, members, audit update live across devices (Supabase Realtime channels per trip).
- **Responsive:** one-handed mobile first → tablet/desktop; amounts & names never overflow (tabular nums, truncation).
- **Money integrity:** amounts stored as integer minor units; rounding handled server/client consistently.
- **Security:** RLS so only trip members read/write trip data; owners manage membership; audit append-only; no secrets/receipts-bytes in audit JSON.
- **A11y:** AA contrast, focus states, state signalled beyond color.

---

## Part B — Data Model

Use the brief's schema as the baseline (already reflected in `src/data.ts` types) plus
production additions. All financial amounts as **integer minor units** (paise/cents).

Tables: `profiles` (+ `is_platform_admin bool default false`), `trips`,
`trip_members`, `trip_invites` (code, expires_at, created_by), `expenses`,
`expense_payers`, `expense_splits`, `settlements`, `audit_logs`.
Storage buckets: `avatars` (public-read own), `receipts` (member-only via signed URLs).

---

## Part C — Security & Audit

- **RLS** on every table. Core predicate: a row is visible/writable only if
  `auth.uid()` is a member of the row's `trip_id` (helper SQL function
  `is_trip_member(trip_id)` / `is_trip_owner(trip_id)`).
- **Owner-only** policies for membership/role/settings/archive changes.
- **Audit** written by **Postgres triggers** (AFTER INSERT/UPDATE/DELETE) on
  expenses, splits, settlements, members, trips — not app code — capturing actor
  (`auth.uid()`), entity, action, changed fields, prev/new JSON (excluding
  receipt bytes / tokens). `audit_logs`: INSERT allowed to triggers, **no UPDATE/DELETE** policy for anyone.
- SQL delivered as migration files under `supabase/migrations/*.sql` to run in the
  Supabase SQL editor after connection.

---

## Part D — Architecture & Tech

- **Routing:** add `react-router-dom` (invoke `react-router` skill). Routes:
  `/signin`, `/signup`, `/reset`, `/` (trips home, guarded), `/trip/:id` (Overview/
  Expenses/Balances/Activity as nested tabs or in-page like today), `/trip/:id/settings`,
  `/join/:code`, `/profile`, `/admin` (stub). Auth guard wrapper.
- **Supabase client:** `@supabase/supabase-js` in `src/lib/supabase.ts` reading the
  autogenerated `utils/supabase/info.tsx` (projectId + anon key) created on connect.
- **Data layer:** replace the hard-coded arrays in `src/data.ts` with typed data-access
  hooks in `src/lib/` (`useTrips`, `useTrip`, `useExpenses`, `useBalances`,
  `useSettlements`, `useAudit`, `useMembers`) using supabase-js + Realtime channel
  subscriptions; keep the pure helpers (`netBalances`, `simplifyDebts`, `money`,
  `categoryMeta`) — they are reused as-is.
- **Auth context:** `src/lib/auth.tsx` provider exposing `session`, `profile`,
  sign-in/up/out, OAuth, reset.
- **State/data-fetching:** lightweight — React context + hooks (add `@tanstack/react-query`
  only if caching complexity warrants; default to hooks + realtime).
- **Reuse of POC UI:** `src/ui.tsx` primitives, `src/charts.tsx`, and every screen
  component in `src/App.tsx` are refactored into `src/screens/*` and `src/components/*`,
  swapping in-memory data for hooks. Visual design is preserved.

---

## Part E — Phased Implementation

**Phase 0 — Connect Supabase.** Trigger the `supabase_connect` modal; wait for the user
to connect (creates `utils/supabase/info.tsx` + server files). Nothing backend proceeds
until connected.

**Phase 1 — Schema & security.** Author `supabase/migrations` SQL: tables, indexes, RLS
policies, `is_trip_member/owner` functions, audit triggers, storage buckets & policies,
seed categories. Document how to run them.

**Phase 2 — App shell & routing.** Install `@supabase/supabase-js` + `react-router-dom`;
add `src/lib/supabase.ts`, `src/lib/auth.tsx`, route tree, auth guard, refactor `App.tsx`
into a router root. Preserve the mobile frame & bottom nav.

**Phase 3 — Auth screens.** UC-1.1–1.7: sign in/up, Google, reset, verify-email, profile
edit, all states.

**Phase 4 — Trips home & create/join.** UC-2.\*: trips list with tabs, create-trip flow,
invite generation, join-by-code, empty states.

**Phase 5 — Trip data wired live.** Refactor Overview/Expenses/Balances/Activity/Settings
screens to hooks + Realtime (UC-3–7). Add expense with receipt upload to Storage; edit/
soft-delete; settlements with outstanding-balance guard; audit feed from `audit_logs`;
owner membership/role/settle/archive controls with permission-denied states.

**Phase 6 — Cross-cutting polish.** Loading skeletons, offline banner, error/retry,
confirm dialogs, toasts unified; responsive tablet/desktop breakpoint (~1000px);
`/admin` stub gated by `is_platform_admin`.

---

## Part F — Verification

- **Typecheck/build:** `npx tsc --noEmit` and `npx vite build` after each phase.
- **Auth E2E:** sign up → verify → sign in → reset password → Google → sign out;
  guarded routes redirect when logged out.
- **RLS proof:** as User A create a trip; confirm User B cannot read it via the API
  until invited; confirm non-owner blocked from membership/settings mutations.
- **Financial flow (headless Chromium at 430px, as in the POC review):**
  create trip → invite → add expense → configure each split mode (validate balancing)
  → edit expense (see audit diff) → inspect audit history → review balances
  → record partial + full settlement (reject over-payment) → mark settled → archive.
- **Realtime:** two sessions on one trip; an expense/settlement in one appears in the
  other without refresh.
- **Audit immutability:** attempt UPDATE/DELETE on `audit_logs` via API → denied.
- **Storage:** upload receipt/avatar; confirm only members get a working signed URL.

## Notes / open items
- Multi-currency: base currency stored per trip; per-expense currency captured but
  FX conversion is out of scope unless requested (display in entered currency + trip base note).
- Platform-admin dashboard UI is deferred (UC-8); only the `is_platform_admin` flag,
  RLS carve-out, and route stub land now.
