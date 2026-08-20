# Phase 2 Gate Evidence — Frontend Architecture & Shell Audit

> **Scope:** Spec §6.1–6.4, §8, §10.3 (Phase 2) — read-only audit. No deletions or rewrites yet.
> **Date:** 2026-08-19
> **Author:** Phase 2 frontend architect (delegated)
> **Workspace:** `SplitPurse` @ `src/app/routes.tsx`, `src/lib/auth.tsx`, `src/lib/useAdmin.ts`, `src/layouts/TripLayout.tsx`, `src/screens/*`, `src/features/**`, `src/components/**`, `src/types/database.ts`

---

## 1. Structure: Current vs Target (§6.1)

### 1.1 Required target (§6.1 block)

```
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
    auth/ trips/ expenses/ balances/ settlements/ activity/ settings/ profile/
  lib/
    currency.ts  errors.ts  network.ts  queryClient.ts  supabase.ts
  types/
    database.ts
```

### 1.2 Actual layout (observed `ls -R src` + file reads)

```
src/
  app/
    App.tsx
    providers.tsx          ← exists but incomplete (see §5)
    routes.tsx             ← eager-legacy partially fixed; still has TripDashboard legacy
    guards/
      AuthGuard.tsx        ← ok, but returnTo issues
      AdminGuard.tsx       ← obsolete mental model
      TripGuard.tsx        ← leaks raw infra copy
    errors/                ← MISSING (no directory)
  components/
    feedback/              ← ConfirmDialog, EmptyState, ErrorState, OfflineBanner, Skeleton, ToastProvider
    finance/               ← BalanceRow, CurrencyAmount, ExpenseRow
    forms/                 ← CurrencyInput, FormField
    members/               ← Avatar, AvatarStack, MemberSelector
    navigation/            ← AppHeader, TripNavigation
  features/
    auth/                  ← 8 pages (SignIn, SignUp, Verify, Forgot, Reset, Callback, InviteJoin, api/schemas)
    trips/                 ← TripsPage, CreateTripPage, JoinTripPage, hooks, api, schemas, useMembers
    expenses/              ← ExpensesPage, ExpenseFormPage, ExpenseDetailPage, hooks, api, money, schemas
    balances/              ← BalancesPage, SettlementDialog, hooks, balanceMath
    activity/              ← ActivityPage, AuditEntry, hooks, api
    settings/              ← TripSettingsPage, api
    profile/               ← ProfilePage
    (settlements/)         ← MISSING as standalone feature; currently inside balances/
  lib/
    auth.tsx               ← demo branch still present
    useAdmin.ts            ← trimmed but AdminGuard still consumes it
    supabase.ts            ← ok
    queryClient.ts         ← minimal defaults only
    env.ts                 ← optional env, not hard-fail
    demo.ts                ← legacy fixture helper (must go)
    errors.ts              ← MISSING
    currency.ts            ← MISSING (money.ts lives under expenses/)
    network.ts             ← MISSING (offline is ad-hoc in OfflineBanner)
  types/
    database.ts            ← hand-maintained; has mutation_requests/currency_metadata but needs generation drift check
  screens/                 ← LEGACY (see §1.3)
  data.ts                  ← LEGACY fixtures (CURRENCY, members, trip, initialExpenses…)
  ui.tsx                   ← LEGACY duplicate shared components (Avatar, Amount, Button, Sheet…) duplicates components/*
  charts.tsx               ← LEGACY (Donut/DailyBars used only by TripDashboard demo)
  layouts/
    AppLayout.tsx          ← shell for /trips list
    TripLayout.tsx         ← trip chrome (see §4)
```

**Verdict on structure:** ~75% of target exists. Gaps are `app/errors/`, `lib/{errors,currency,network}.ts`, `features/settlements/`, and legacy deletions pending. The current tree already follows `features/*` and `components/*` separation; the remaining work is deletions, extraction of shared `lib`, and adding `app/errors`.

### 1.3 Files to delete per §6.1 (do not delete until replacements are covered)

| File | Lines | Confirmed problem | Replacement prerequisite |
|---|---|---|---|
| `src/screens/TripDashboard.tsx` | 1,551 | Local demo app mounted at `/trips/:tripId` index; imports `src/data.ts` + `src/ui.tsx` + `src/charts.tsx` + demo persistent state | Replace index route with production overview (RealTripOverview successor) covering §7.4; then delete |
| `src/screens/RealTripOverview.tsx` | 121 | `any` casts; fabricates `effectiveMembers` with current user as owner; hard-coded “Created by you” independent of `trip.created_by` | Replace with typed overview that derives owner from `trip.created_by === user.id`, shows retryable member error |
| `src/screens/AuthPage.tsx` | 202 | Legacy auth shell (used by old routes, not current `features/auth/*`) | Already superseded by `features/auth/SignInPage` etc.; safe to delete after confirming no import remains (grep shows no importers) |
| `src/screens/TripFlows.tsx` | 168 | `NewTripPage` + `JoinTripPage` demo variants using `lib/demo` | Superseded by `features/trips/CreateTripPage` + `features/trips/JoinTripPage` + `features/auth/InviteJoinPage`; delete after demo branches removed |
| `src/screens/TripsPage.tsx` | 140 | Demo `src/screens/TripsPage` (legacy) — current route uses `features/trips/TripsPage` | No importers found; deletable immediately after verification |
| `src/lib/demo.ts` | 69 | `DemoTrip`, `seededTrips` (Lisbon/Osaka), `usePersistentState`, `createTrip` local mock | Keep only until `features/trips/hooks.ts`, `CreateTripPage`, `ExpenseFormPage`, `BalancesPage`, `SettingsPage`, `InviteJoinPage` demo branches are removed; then delete |
| `src/data.ts` (fixture exports) | 269 | `CURRENCY="₹"`, `members`, `trip`, `initialExpenses`, `initialSettlements`, `initialAudit`, `money()` whole-INR formatter | After TripDashboard removal; retain only if needed as test fixtures under `tests/fixtures/` (explicitly separate) |
| `src/ui.tsx` (duplicate ui) | 190 | `Avatar`, `AvatarStack`, `Amount`, `CategoryChip`, `Button`, `Sheet` — duplicates `components/members/*`, `components/finance/*` | After TripDashboard removal (sole consumer besides data.ts) |
| `src/charts.tsx` | 131 | `Donut`, `DailyBars` — demo-only chart helpers | After TripDashboard removal |

**Deletion order (replacement order):**

1. Confirm `src/screens/AuthPage.tsx` + `src/screens/TripsPage.tsx` have zero importers → delete first (no replacement needed).
2. Build production trip overview (`features/trips/TripOverviewPage.tsx` or `features/overview/`) with typed balances/expenses/members; wire to `GET /trips/:tripId` index route; then delete `RealTripOverview.tsx`.
3. Remove demo branches from `features/trips/hooks.ts` (`useTripsQuery`, `useTrip` demo fallbacks), `features/trips/CreateTripPage.tsx` (demo `createDemoTrip` branch), `features/expenses/ExpenseFormPage.tsx` (demo `members` fallback, `demoMembers[0]` payer init), `features/balances/BalancesPage.tsx` (`demoMembers`/`demoNetBalances`), `features/settings/TripSettingsPage.tsx` (`demoMembers`), `features/auth/InviteJoinPage.tsx` (`LISBON24` demo lookup), `features/auth/VerifyEmailPage`/`AuthCallbackPage` demo early-returns if any. Then delete `lib/demo.ts`, `data.ts` fixtures, `ui.tsx`, `charts.tsx`.
4. Finally delete `TripDashboard.tsx` and remove its lazy import from `routes.tsx` (replace with new overview). `TripFlows.tsx` can go with step 1 or 3 (already unused).
5. Add `lib/currency.ts` (extract from `features/expenses/money.ts`), `lib/errors.ts`, `lib/network.ts` before or alongside step 3 so feature files have a place to import from.

> Spec §6.1 says “Do this only after replacement routes are covered.” The order above respects that — screens go last, shared libs go first.

---

## 2. Routing Audit (§6.3)

### 2.1 Lazy loading — FIXED (was P0, now done)

`src/app/routes.tsx:10-27` now lazy-imports every route feature:

```ts
const SignInPage = lazy(() => import("@/features/auth/SignInPage").then(m => ({ default: m.SignInPage })))
// … 16 more lazy() bindings including TripDashboard
```

Wrapped via `SuspenseOutlet` with `FullPageSkeleton` fallback. No eager page imports remain (only `AuthGuard`, `AdminGuard`, `TripGuard`, `AppLayout`, `TripLayout`, `FullPageSkeleton` are eager — correct).

**Remaining gap:** `TripDashboard` is still lazy-loaded as the index child of `/trips/:tripId` — this re-introduces the demo bundle on the most common trip route. Replace with lazy production overview before closing Phase 2. Bundle budget (§9.3: initial route JS ≤250 kB gzip) should be measured after that swap.

### 2.2 Wildcard / 404 — FIXED (was silent redirect, now real 404)

Previous spec flagged `path: "*"` → `<Navigate to="/trips" />`. Current `src/app/routes.tsx:128` is:

```ts
{ path: "*", element: <NotFound /> }
```

with `NotFound` rendering `404 — Not found` + link to `/trips` (lines 50-60). Complies with “Unknown routes render a real 404, not a silent redirect”.

### 2.3 `returnTo` validation — PARTIALLY FIXED

* `src/app/routes.tsx:62-72` exports `validateReturnTo` (same-origin check via `new URL(to, origin)`, pathname prefix `/`).
* `src/app/guards/AuthGuard.tsx:5-12` has a local `safeReturnTo` with identical logic, used to build `/sign-in?returnTo=…` (line 18-19).
* `src/features/auth/SignInPage.tsx:17-18` has its own `safeReturnTo` copy.

**Gap — duplication + incomplete coverage (§P0-03 from review addendum):**

- Three copies of the same validator (routes, AuthGuard, SignInPage) — should be one shared `lib/returnTo.ts` or `lib/auth.ts#validateReturnTo`.
- `SignUpPage` ignores `returnTo` entirely (always `navigate("/verify-email")` after signup) — breaks invite return-through-auth.
- `signInWithGoogle` (`lib/auth.tsx:129-133`) always redirects to `/auth/callback` without preserving `returnTo`/invite intent.
- `AuthCallbackPage` (`features/auth/AuthCallbackPage.tsx:13`) always `navigate("/trips")` — discards `returnTo` and pending invite.
- `GuestGuard` (`AuthGuard.tsx:23-28`) redirects authed users to `/trips` without checking if they arrived via `/join/:code` — should preserve and consume invite.

**Required fix:** Single `validateReturnTo` in `lib/`, thread `returnTo` through signup confirmation, OAuth `redirectTo` state, callback, and GuestGuard; consume via `join_trip_by_code` once after auth, then clear.

### 2.4 Guards — MOSTLY FIXED, one lingering defect

* `AuthGuard` ([src/app/guards/AuthGuard.tsx:13-22](src/app/guards/AuthGuard.tsx:13)) correctly returns `<FullPageSkeleton />` while `loading` is true — does **not** redirect while auth is loading (spec: “Route guards must never redirect while auth is loading”).
* `GuestGuard` same pattern.
* `AdminGuard` ([src/app/guards/AdminGuard.tsx:12](src/app/guards/AdminGuard.tsx:12)) also respects `loading || adminLoading` before deciding — correct loading semantics, but its **placement** is wrong (see below).
* `TripGuard` ([src/app/guards/TripGuard.tsx:6-33](src/app/guards/TripGuard.tsx:6)) handles `isLoading` → skeleton, `error` → `ErrorState` with retry, `!trip` → “Trip not found” with copy that currently leaks infra detail (`supabase/migrations/… has been applied`, `disable confirm in Auth settings for local dev`) — violates §6.2 “Do not show migration filenames, RLS advice, Supabase dashboard instructions”.

**Gating defect — `/trips/new` behind `AdminGuard`:**

```ts
// src/app/routes.tsx:97-101
{ element: <AdminGuard />, children: [
    { path: "/trips/new", element: <CreateTripPage /> },
    { path: "/admin", element: <AdminStub /> },
]}
```

Spec §3.2/§5.2 require any verified user can create a trip; platform admin is unrelated. `AdminGuard` currently falls back to `if (!supabase) return <Outlet />` (demo bypass) and otherwise checks `is_platform_admin` — this blocks normal users from trip creation. Must move `/trips/new` under `AuthGuard` directly. Keep `/admin` under `AdminGuard` or remove until it has a real function.

Also: `/join-admin` (`routes.tsx:103`) is an extra legacy route — duplicate of invite flow, not in spec. Remove.

### 2.5 Realtime invalidation query-key mismatch — CONFIRMED

Feature hooks use these keys:

| Domain | Hook key | Realtime invalidation key (TripLayout) | Match? |
|---|---|---|---|
| trips list/detail | `tripKeys.all = ["trips"]`, `["trips","list"]`, `["trips","detail",id]` | `["trip", tripId]` / `["tripMembers", tripId]` | **NO** — prefix differs (`trips` vs `trip`) |
| trip members | `["trip_members", tripId]` (`useMembers.ts:9`) | `["tripMembers", tripId]` + `["trip", tripId]` | **NO** — underscore vs camelCase |
| expenses | `["expenses", tripId]` (`expenseKeys.list`) | `["expenses", tripId]` | YES |
| balances | `["balances", tripId]` | `["balances", tripId]` | YES |
| activity | `["activity", tripId]` | `["activity", tripId]` | YES |
| invites | `["invites", tripId]` | `["invites", tripId]` | YES |

`TripLayout.tsx:60-61` invalidates `["tripMembers",…]` and `["trip",…]` — neither matches the actual query keys, so Realtime `trip_members` changes never refetch the members list and trip detail changes may miss the cache. Same for trips list vs detail. Fix by introducing a single query-key factory (e.g. `lib/queryKeys.ts` or co-located `tripKeys` + `memberKeys` + `expenseKeys`) and importing it in both hooks and `TripLayout`.

Additional Realtime notes:
- Channel is `trip:${tripId}` with 5 `postgres_changes` listeners (expenses, settlements, audit_logs, trip_members, trip_invites) — reasonable.
- No `expenses:deleted` vs active filtering distinction yet; soft-delete will need `includeDeleted` param (Phase 3).
- No visible reconnect/visibility indicator (spec §9.1: “Realtime reconnect state is visible but nonblocking”).

---

## 3. Shell Audit — One Responsive Shell (§6.4 + §8.4)

### 3.1 Spec requirements (§6.4)

- `TripLayout` owns all trip chrome.
- Mobile <768 px: compact header + one fixed five-item bottom nav.
- Tablet/desktop ≥768 px: header + visible horizontal tabs or left nav; hide bottom nav.
- Content includes safe-area + nav clearance.
- Direct child routes retain same shell.
- No nested `min-h-screen` in route components.
- No 480 px phone simulation on desktop.
- Content max-width ~1120 px, layouts use desktop space.
- Active route in URL (not local tab state); Realtime refetch must not change route/scroll.

### 3.2 Current implementation

**`AppLayout` ([src/layouts/AppLayout.tsx](src/layouts/AppLayout.tsx)) — for `/trips`, `/trips/new`, `/join`, `/profile`:**

```tsx
<main className="min-h-screen bg-canvas">
  <a href="#main-content" className="skip-link">…</a>
  <div className="mx-auto max-w-5xl px-4 pb-12 pt-5 sm:px-8">
    <AppHeader /><div id="main-content"><Outlet /></div>
  </div>
</main>
```

- `max-w-5xl` (1024 px) — slightly under 1120 px target but acceptable; should be unified to ~1120 px (`max-w-[1120px]` or `max-w-6xl` is 1152 px; `max-w-5xl` is 1024 px — pick one and use everywhere).
- Single `min-h-screen` at shell root — correct.
- Skip link present (good, §8.1).

**`TripLayout` ([src/layouts/TripLayout.tsx](src/layouts/TripLayout.tsx)) — for `/trips/:tripId/*`:**

```tsx
<div className="mx-auto flex min-h-screen max-w-5xl flex-col bg-canvas">
  <a href="#trip-content" className="skip-link">Skip to content</a>
  <header className="border-b border-hair bg-surface px-4 py-5 sm:px-8">…All trips, h1, status…</header>
  <div className="sticky top-0 z-20 bg-surface border-b border-hair"><TripNavigation /></div>
  <div id="trip-content" className="flex-1 p-4 pb-[88px] sm:p-8 sm:pb-8"><Outlet /></div>
  <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-hair bg-surface shadow…">…5 tabs…</nav>
</div>
```

**`TripNavigation` ([src/components/navigation/TripNavigation.tsx](src/components/navigation/TripNavigation.tsx)):**

- Horizontal tabs: Overview / Expenses / Balances / Activity / Settings — underline active tab with `border-brand`.
- `overflow-x-auto` with `scrollbarWidth: thin` — allows wrapping on narrow screens but spec wants wrapping segmented control, not horizontal scroll.

### 3.3 Shell checklist vs spec

| Requirement | Status | Evidence / Gap |
|---|---|---|
| One responsive shell (TripLayout) | ⚠️ Partial | `AppLayout` + `TripLayout` two shells is intentional (trip vs non-trip). Within trip, `TripLayout` is single shell — correct. But demo leakage via TripDashboard's own internal tabs still exists at index route. |
| Mobile <768 px: compact header + fixed 5-item bottom nav | ✅ Done | `TripLayout.tsx:116-136` renders fixed bottom `nav` with `grid-cols-5`, `h-[68px]`, `pb-[env(safe-area-inset-bottom)]`. Always mounted. |
| Desktop: header + horizontal tabs/left nav; hide bottom nav | ❌ Defect | Bottom nav is **always** fixed (no `md:hidden`/`lg:hidden`). Desktop shows **both** sticky top `TripNavigation` **and** fixed bottom nav — duplicate navigation (spec: “hide the bottom nav” on tablet/desktop). |
| Safe-area + nav clearance | ✅ Done | `pb-[88px]` on content (mobile) + `pb-[env(safe-area-inset-bottom)]` on bottom nav. Header has no notch handling but bottom does. |
| Direct child routes retain same shell | ✅ Done | TripLayout wraps all `/trips/:tripId/*` children via `<Outlet />`; AppLayout wraps `/trips` etc. No per-route shell duplication. |
| No nested `min-h-screen` | ❌ Defect | `AppLayout` and `TripLayout` each have `min-h-screen`; nested route components also have it: `InviteJoinPage` (`min-h-screen`), `JoinTripPage` (`min-h-screen`), `ProfilePage` (no, but `TripGuard` fallback has `min-h-screen` `grid place-items-center`). Trip children now mostly avoid it, but guard fallbacks still nest it inside TripLayout's `min-h-screen` — double viewport height. Fix: use `min-h-[60vh]` or flex centering without `min-h-screen` inside nested routes. |
| No 480 px phone sim | ✅ Done | No `max-w-[480px]` phone sim found. `max-w-5xl` is full-width responsive. (TripDashboard had internal phone sim previously; current TripLayout does not.) |
| Max-width ~1120 px | ⚠️ Slight under | `max-w-5xl` = 1024 px. Spec says “around 1120 px”. Recommend `max-w-[1120px]` or `max-w-6xl` (1152 px) consistently. Current 5xl is not a blocker but should be unified. |
| Active route in URL, not local tab state | ✅ Done | `TripNavigation` + bottom nav both use `NavLink` with `isActive` — URL-driven. No local `useState<Tab>` duplication in shell (TripDashboard's `tab` state is isolated to demo route). |
| Realtime refetch does not change route/scroll | ✅ Done | `queryClient.invalidateQueries` does not touch router state or scroll. |
| `min-h-screen` nesting inside TripLayout | ❌ Defect | `TripGuard` error/not-found fallbacks render `<main className="grid min-h-screen …">` inside TripLayout's flex-col — creates nested viewport. Should be card-level error without `min-h-screen`. |
| Bottom nav covers last focusable element | ⚠️ Risk | Content has `pb-[88px]` on mobile but only `sm:pb-8` on desktop — desktop has no bottom padding because bottom nav shouldn't be there, but since it is, desktop content can be obscured. Fix by hiding bottom nav on desktop. |

**TripLayout defects summary (for Phase 2 fix):**

1. **Duplicate nav on desktop** — add `md:hidden` (or `lg:hidden` depending on breakpoint) to bottom `nav` (`TripLayout.tsx:116`), and keep top `TripNavigation` visible on desktop. Spec breakpoint is 768 px → `md:hidden` on bottom nav (Tailwind `md` = 768 px) is correct.
2. **Content max-width** — unify to `max-w-[1120px]` (or `max-w-6xl`) in both `AppLayout` and `TripLayout`.
3. **Nested `min-h-screen`** — remove from `TripGuard` fallbacks and from `InviteJoinPage`/`JoinTripPage` when rendered inside trip shell (they aren't currently, but guard fallbacks are). Replace with `py-16` or similar.
4. **Bottom nav a11y** — tabs use 11px font, need 44×44 px touch target (currently `flex-col` with icon 20px + label — check computed height; may need `min-h-11` on each link).

---

## 4. Providers & Error Boundaries Audit (§6.2)

### 4.1 Current `Providers` ([src/app/providers.tsx](src/app/providers.tsx))

```tsx
<QueryClientProvider client={queryClient}>
  <AuthProvider>
    <ToastProvider>
      <OfflineBanner />
      {children}
    </ToastProvider>
  </AuthProvider>
</QueryClientProvider>
```

| Required (§6.2) | Current | Gap |
|---|---|---|
| Route error boundary (nontechnical message, retry, return action) | ❌ Missing | No `app/errors/` dir, no `RouteErrorBoundary`, no `errorElement` on routes. Current errors are per-page `ErrorState` or `TripGuard` inline fallbacks. Need `createBrowserRouter` `errorElement` per route + root boundary. |
| Query cache clear on sign-out + auth-user change | ⚠️ Partial | `auth.tsx:103,108` calls `queryClient.clear()` on sign-out (demo + supabase) — correct. But no cache clear on **user change** (sign-in as different user, token refresh with new `user.id`). Need `onAuthStateChange` handler that clears if `user.id` changes. |
| Session-expiry handling with preserved route | ❌ Missing | `onAuthStateChange` sets `user`/`session` but never detects expiry (e.g. `SIGNED_OUT` with expired token) nor preserves `returnTo`. Need interceptor that navigates to `/sign-in?returnTo=…` on 401/expired session. |
| Centralized domain-error mapper (stable codes → user-safe copy) | ❌ Missing | No `lib/errors.ts`. RPC errors surface as `e.message` verbatim in `InviteJoinPage`, `CreateTripPage`, `ProfilePage`, `ExpenseFormPage`. Spec §9.2 lists `AUTH_REQUIRED`, `PERMISSION_DENIED`, `INVITE_INVALID`, … — none mapped. TripGuard leaks raw Supabase/migration copy. |
| Online/offline state available to mutation controls | ⚠️ Partial | `OfflineBanner` tracks `navigator.onLine` locally but does not expose it. No shared `useOnline()` or `lib/network.ts` consumed by mutation buttons. `ConfirmDialog` and forms don't disable while offline. |
| Single toast with `aria-live`, severity, dedup, manual dismiss for errors | ❌ Defect | `ToastProvider.tsx` has no `aria-live`, no severity, no dedup, no manual dismiss — uses `setTimeout 2600ms` auto-dismiss for all toasts, centered bottom, no `role="status"`/`alert`. Also spec requires error toasts persist until dismissed; current toasts vanish. |

### 4.2 `lib/queryClient.ts` ([src/lib/queryClient.ts](src/lib/queryClient.ts))

```ts
staleTime: 30_000, retry: 2, refetchOnWindowFocus: false, mutations: { retry: 0 }
```

- Reasonable defaults. Missing: `gcTime`, `retryDelay`, and per-query `retry: false` for `useTrip` (already set there). For offline resilience, consider `networkMode: "offlineFirst"` or explicit `onlineManager` integration (TanStack Query respects `navigator.onLine` by default when `networkMode` is `online`).

### 4.3 `lib/auth.tsx` additional findings

- `isDemo = !isSupabaseEnabled()` branching remains in **every** auth method (signIn, signUp, signOut, sendReset, signInWithGoogle). Spec §3.5: “Production builds do not switch business logic based on missing env values. Missing required Supabase env is a clear startup configuration error.” Current `env.ts` makes Supabase optional instead of throwing — demo mode is still load-bearing. Phase 2 should keep it until demo deletions are ready, then make missing env a hard error (e.g. `requireEnv()` at `main.tsx` or `App.tsx` entry, with a single `EnvError` screen).
- `onAuthStateChange` sets `loading=false` on every event — correct to avoid guard redirect while loading is stuck.
- No `session` expiry edge: `getSession().then` + `onAuthStateChange` covers initial load, but no handling for `TOKEN_REFRESH_FAILED` or `SIGNED_OUT` due to expiry.

### 4.4 Providers plan (proposed — not yet implemented)

**File map to add:**

```
src/app/errors/
  RouteErrorBoundary.tsx   — React Router errorElement; uses useRouteError(); nontechnical message + Retry + Go to trips
  AppErrorFallback.tsx     — top-level React ErrorBoundary fallback (wraps RouterProvider)
src/lib/
  errors.ts                — mapPostgrestError(e) / mapRpcError(e) → { code, message, severity }
                           — codes: AUTH_REQUIRED, PERMISSION_DENIED, NOT_FOUND, TRIP_NOT_ACTIVE,
                             TRIP_ARCHIVED, INVITE_INVALID/EXPIRED/EXHAUSTED, LAST_OWNER,
                             MEMBER_HAS_BALANCE, BALANCE_CHANGED, VALIDATION_FAILED, CONFLICT, RATE_LIMITED
                           — never expose migration filenames, UUIDs, stack traces
  network.ts               — useOnline(): boolean; isOnline() helper; single source for navigator.onLine + listeners
  currency.ts              — re-export/extract from features/expenses/money.ts; currency-aware format/parse with decimals table
src/app/providers.tsx      — add: <NetworkProvider> (or just useOnline hook), <ErrorBoundary>, queryClient clear on user change,
                             session-expiry navigation with preserved returnTo
src/lib/queryClient.ts     — optional: expose clearOnUserChange helper; document cache policy
```

**Behavioral changes:**

1. **Route error boundary** — add `errorElement: <RouteErrorBoundary />` to root route and to `/trips/:tripId` branch. Boundary distinguishes `isRouteErrorResponse` (404) vs thrown `Error` vs network failure. Never renders `error.stack` or Supabase codes verbatim.
2. **Query cache on sign-out + user change** — in `AuthProvider` `onAuthStateChange`, track `prevUserId` ref; if `user?.id !== prevUserId`, call `queryClient.clear()` (or `removeQueries` with `predicate`). This covers sign-out, sign-in as different user, and session swap. Keep existing `signOut() → clear()` as well.
3. **Session-expiry with preserved route** — add a `useEffect` in `AuthProvider` or a new `SessionExpiryGuard` that listens for `supabase.auth.onAuthStateChange` event `SIGNED_OUT`/`TOKEN_REFRESH_FAILED` and navigates to `/sign-in?returnTo=${encodeURIComponent(location.pathname+search)}` (validated). Also intercept 401 from `fetch`/`rpc` via a `supabase` fetch wrapper or Query `onError` that triggers the same redirect. Must not redirect while `loading` is true.
4. **Domain-error mapper** — `lib/errors.ts` exports `toUserMessage(error): string` and `toErrorCode(error): string`. Feature pages call it instead of `e.message`. TripGuard's “check RLS / migration applied” message is replaced with `toUserMessage`. Log redacted diagnostic context via `console.warn` with code only, never raw SQL or invite code.
5. **Online state** — `lib/network.ts` provides `useOnline()` (single `online`/`offline` listener, shared via context or singleton). `OfflineBanner` consumes it. All mutation buttons (`CreateTripPage`, `ExpenseFormPage`, `SettlementDialog`, `ConfirmDialog` onConfirm) check `isOnline` and disable with `aria-disabled` + tooltip when offline. Spec: “Offline state blocks all mutations in the UI.”
6. **Toast a11y** — `ToastProvider` becomes `aria-live="polite"` (info) / `aria-live="assertive"` (error), `role="status"` vs `role="alert"` by severity, dedup by message, error toasts require manual dismiss (no auto-timeout), container `aria-atomic`. Position with `bottom-[88px]` on mobile so it doesn't overlap bottom nav (currently `bottom-4` centered — will be hidden behind nav on trip pages).

---

## 5. Route Table: Current vs Required (§6.3 — 17+ routes)

Spec §6.3 lists these production routes (18 entries in the block; “17 routes” in prose counts distinct trip-nested routes without the root redirect):

| # | Required route | Current | Status | Notes |
|---|---|---|---|---|
| 1 | `/sign-in` | ✅ | GuestGuard + lazy SignInPage | Copy defect: “Admin sign in” / “Members go to /join” — must be neutral per §7.1 |
| 2 | `/sign-up` | ✅ | GuestGuard + lazy SignUpPage | Copy defect: “Admin only — regular members join via invite” amber banner; must be neutral |
| 3 | `/verify-email` | ✅ | GuestGuard + lazy VerifyEmailPage | `resend` has no cooldown, no success/error status |
| 4 | `/forgot-password` | ✅ | GuestGuard + lazy ForgotPasswordPage | OK, but no enumeration-safe copy audit |
| 5 | `/reset-password` | ✅ | GuestGuard + lazy ResetPasswordPage | Does not validate recovery session before showing form (§6.3: “Recovery routes validate the recovery session”) |
| 6 | `/auth/callback` | ✅ | GuestGuard + lazy AuthCallbackPage | Always → `/trips`, no error handling, no returnTo/invite restore (see §2.3) |
| 7 | `/join` | ✅ | Public + lazy InviteJoinPage | Code entry state; currently supports manual input + debounced resolve |
| 8 | `/join/:code` | ✅ | Public + lazy InviteJoinPage | Same component, `useParams` code; invite state machine incomplete (see §7.2) |
| 9 | `/trips` | ✅ | AuthGuard + AppLayout + lazy TripsPage | Has `isLoading` skeleton, empty state, but shows demo/RLS technical messages (see defect below) |
| 10 | `/trips/new` | ⚠️ Mis-gated | AdminGuard + lazy CreateTripPage | **Must be AuthGuard only** — any verified user can create; currently blocked for non-admins |
| 11 | `/trips/:tripId` (overview) | ⚠️ Legacy | TripGuard + TripLayout + lazy **TripDashboard** (demo) | Must be production overview (RealTripOverview successor); TripDashboard is 1551-line demo |
| 12 | `/trips/:tripId/expenses` | ✅ | TripGuard + TripLayout + lazy ExpensesPage | Exists; needs search/filter/sort/group states (§7.5) — not audited here |
| 13 | `/trips/:tripId/expenses/new` | ✅ | + lazy ExpenseFormPage | Exists; demo fallback still present |
| 14 | `/trips/:tripId/expenses/:expenseId` | ✅ | + lazy ExpenseDetailPage | Exists; production detail query now present but was previously null branch |
| 15 | `/trips/:tripId/expenses/:expenseId/edit` | ✅ | + lazy ExpenseFormPage (same component) | Exists; hydration from `useExpense` but no dirty-conflict handling yet |
| 16 | `/trips/:tripId/balances` | ✅ | + lazy BalancesPage | Exists; SettlementDialog not rendered until Phase 4 |
| 17 | `/trips/:tripId/activity` | ✅ | + lazy ActivityPage | Exists; raw action/entity output, needs human-readable feed (§7.8) |
| 18 | `/trips/:tripId/settings` | ✅ | + lazy TripSettingsPage | Exists; capability gating incomplete (owner checks use demo fallback) |
| 19 | `/profile` | ✅ | AuthGuard + AppLayout + lazy ProfilePage | Exists; unvalidated `any`, no pending/error semantics |
| — | `*` (404) | ✅ | `<NotFound />` | Real 404, not redirect — fixed |
| — | `/` | ✅ | `<Navigate to="/trips" replace />` | Root redirect — correct |
| — | `/admin` | ➖ Extra | AuthGuard + AdminGuard + AdminStub | Platform-admin placeholder; keep gated or remove until real function |
| — | `/join-admin` | ❌ Extra | AuthGuard + lazy JoinTripPage (legacy) | Duplicate invite flow; not in spec — remove |
| — | `/trips/:tripId` with non-UUID (e.g. `demo`) | ⚠️ | `fetchTrip` returns null for non-UUID → TripGuard “Trip not found” | Expected after demo removal; ensure 404 vs “not found/forbidden without leaking existence” handling per §6.3 |

**Route coverage verdict:** All 18 required functional routes exist (plus root + 404). Two extra legacy routes (`/join-admin`, `/admin` stub) should be cleaned up in Phase 2. The critical defect is `/trips/new` gating and the index route still serving the demo bundle.

---

## 6. TripsPage & Members Audit (spot checks)

**`features/trips/TripsPage.tsx` ([src/features/trips/TripsPage.tsx](src/features/trips/TripsPage.tsx)):**

- `useTripsQuery() as any` — `any` cast hides type error.
- `!supabaseOn` demo banner (“Demo mode — `.env` not loaded”) + `Supabase error: … — check RLS / migration applied` — both violate §6.2 “Do not show migration filenames, RLS advice, Supabase dashboard instructions”. Must be replaced with user-safe copy via `lib/errors.ts`.
- Card projection uses `t.total`, `t.memberCount`, `t.role` — these are not in current `fetchTrips` `select *` from `trips` table (which has no aggregated fields); they were demo-only. Real list needs a view/RPC that returns `member_count`, `total_minor`, `user_role` per trip. Currently `as any` masks missing fields.

**`features/trips/useMembers.ts` ([src/features/trips/useMembers.ts](src/features/trips/useMembers.ts)):**

- Two-step fetch: `trip_members` → `profiles` join. Falls back to `user_id.slice(0,8)` UUID prefix when profiles RLS blocks — exposes UUID fragments in UI (violates §6.2 “Do not show … UUIDs in end-user screens”).
- Query key `["trip_members", tripId]` does not match `TripLayout` invalidations (`["tripMembers",…]` & `["trip",…]`) — mismatch noted in §2.5.
- Missing query-key factory; should be `memberKeys.list(tripId)` shared with layout.

**`features/expenses/money.ts` (not re-read but referenced):** `money()` previously formatted minor units as whole INR with fixed symbol/locale; spec requires currency-aware API with explicit minor-unit input. Belongs in `lib/currency.ts` with shared `currency_metadata` table.

---

## 7. Shell Checklist (for Phase 2 exit gate)

Use this checklist during implementation; all must be ✅ before Phase 2 is green.

- [ ] Bottom nav hidden on ≥768 px (`md:hidden` on fixed bottom `nav` in TripLayout)
- [ ] Top tabs remain visible on desktop; no duplicate nav at any breakpoint
- [ ] Safe-area handling: `pb-[env(safe-area-inset-bottom)]` on bottom nav (done) + `pt-[env(safe-area-inset-top)]` if header becomes sticky
- [ ] Content clearance: `pb-[88px] md:pb-8` (or conditional on nav visibility)
- [ ] No nested `min-h-screen` inside `TripLayout` or `AppLayout` children; guard fallbacks use `py-16` card layout
- [ ] No 480 px phone simulation (currently clean)
- [ ] Max-width unified to ~1120 px (`max-w-[1120px]` or `max-w-6xl`) in both layouts
- [ ] Active route stays in URL; Realtime refetch doesn't change route/scroll
- [ ] Sticky top nav (`sticky top-0`) retains `z-20` above content, below bottom nav `z-30`
- [ ] 44×44 px touch targets on all tab links (audit via axe + manual measure)
- [ ] Screenshots at 320×568, 390×844, 768×1024, 1024×768, 1440×900 show no horizontal overflow and no nav overlap on last focusable element
- [ ] Keyboard: all tabs reachable via Tab, activated via Enter/Space, focus ring visible (`:focus-visible`)
- [ ] Axe: no serious/critical violations on trip routes (mobile + desktop)

---

## 8. Providers Plan (detailed deliverables)

| Deliverable | File | Spec section | Priority |
|---|---|---|---|
| Route error boundary | `src/app/errors/RouteErrorBoundary.tsx` | §6.2 | P0 |
| App-level error fallback | `src/app/errors/AppErrorFallback.tsx` (or inline in `App.tsx`) | §6.2 | P1 |
| Domain error mapper | `src/lib/errors.ts` | §6.2, §9.2 | P0 |
| Online state hook | `src/lib/network.ts` | §6.2, §9.1 | P0 |
| Currency helper extraction | `src/lib/currency.ts` (from `features/expenses/money.ts`) | §6.1, §3.3 | P1 |
| Query cache clear on sign-out + user change | `src/lib/auth.tsx` (AuthProvider) | §6.2 | P0 |
| Session-expiry preserved route | `src/lib/auth.tsx` + `src/app/guards/AuthGuard.tsx` | §6.2 | P0 |
| Toast a11y (aria-live, severity, dedup, manual dismiss) | `src/components/feedback/ToastProvider.tsx` | §6.2, §8.3 | P0 |
| Dialog focus trap + restore | `src/components/feedback/ConfirmDialog.tsx` (already has basic trap; needs audit) | §8.3 | P1 |
| Offline mutation blocking | All mutation buttons consume `useOnline()` | §9.1 | P1 |

**`errors.ts` code contract (proposed):**

```ts
export type DomainCode =
  | "AUTH_REQUIRED" | "PERMISSION_DENIED" | "NOT_FOUND"
  | "TRIP_NOT_ACTIVE" | "TRIP_ARCHIVED"
  | "INVITE_INVALID" | "INVITE_EXPIRED" | "INVITE_EXHAUSTED"
  | "LAST_OWNER" | "MEMBER_HAS_BALANCE" | "BALANCE_CHANGED"
  | "VALIDATION_FAILED" | "CONFLICT" | "RATE_LIMITED"
  | "UNKNOWN";

export function toDomainCode(error: unknown): DomainCode;
export function toUserMessage(error: unknown): string; // user-safe, no UUIDs/tokens/sql
export function isDomainCode(error: unknown, code: DomainCode): boolean;
```

**`network.ts` contract:**

```ts
export function useOnline(): boolean; // subscribes to online/offline, initial navigator.onLine
export function isOnline(): boolean;  // imperative check for mutation guards
```

---

## 9. Migration Plan — Replacement Order (read-only proposal)

**Phase 2A — Shared foundations (no deletions, additive only):**

1. Create `src/lib/errors.ts`, `src/lib/network.ts`, `src/lib/currency.ts`, `src/app/errors/RouteErrorBoundary.tsx`.
2. Fix `src/lib/queryClient.ts` if needed; add `useOnline` context/provider if chosen.
3. Wire `errorElement` into `createBrowserRouter` routes.
4. Fix `AuthProvider` cache-clear on user change + session-expiry redirect; wire `validateReturnTo` single source.

**Phase 2B — Shell fixes (small edits, no deletions):**

5. `TripLayout.tsx`: add `md:hidden` to bottom nav, unify max-width to `max-w-[1120px]`, adjust content padding.
6. `TripGuard.tsx`: replace raw migration/RLS copy with `toUserMessage`; remove `min-h-screen` from fallbacks.
7. `AppLayout.tsx`: unify max-width.
8. Fix query-key factory: extract `tripKeys`/`memberKeys`/`expenseKeys`/`balanceKeys`/`activityKeys`/`inviteKeys` to `src/lib/queryKeys.ts` or keep co-located but single import in `TripLayout`.

**Phase 2C — Routing fixes (no deletions):**

9. Move `/trips/new` out of `AdminGuard` into `AuthGuard`.
10. Remove `/join-admin` route; decide on `/admin` (keep gated stub or delete).
11. Consolidate `validateReturnTo` to single `lib` export; fix `SignUpPage`, `AuthCallbackPage`, `GuestGuard`, `signInWithGoogle` returnTo threading.

**Phase 2D — Demo removal (destructive, last):**

12. Delete `src/screens/AuthPage.tsx`, `src/screens/TripsPage.tsx`, `src/screens/TripFlows.tsx` (zero importers — safe immediately, but do after 2A–2C to keep diff clean).
13. Replace index route: create `features/trips/TripOverviewPage.tsx` (or `features/overview/TripOverviewPage.tsx`) with typed production overview; swap `TripDashboard` lazy import for it.
14. Remove demo branches from `hooks.ts`, `CreateTripPage.tsx`, `ExpenseFormPage.tsx`, `BalancesPage.tsx`, `SettingsPage.tsx`, `InviteJoinPage.tsx`, `TripsPage.tsx` (demo/RLS banners).
15. Delete `TripDashboard.tsx`, `RealTripOverview.tsx`, `lib/demo.ts`, `data.ts` fixtures, `ui.tsx`, `charts.tsx`.
16. Move `money.ts` → `lib/currency.ts` (or re-export); delete old if moved.
17. Regenerate `types/database.ts` from schema (Phase 1 dependency; Phase 2 should verify drift).

**Verification after each phase:**

- `pnpm typecheck` — zero errors
- `pnpm test` — no regressions (163 tests baseline)
- `pnpm build` — measure gzip bundle; route chunks appear as separate files
- Manual: direct navigation to every route retains one shell; mobile (390×844) shows bottom nav, desktop (1440×900) shows top tabs only; no horizontal overflow; no duplicate nav.

---

## 10. Open Questions for Spec Owner

1. `/admin` route — keep as `AdminStub` under `AdminGuard` or delete until Phase 5+? Current stub is harmless but adds an extra auth branch to maintain.
2. `settlements` as standalone feature vs inside `balances` — spec target lists `features/settlements/` separately, but current `balances/SettlementDialog` + `balances/hooks` is coherent. Recommend keeping settlements inside `balances` or splitting to `features/settlements/` with `settlements/api.ts` + `settlements/hooks.ts` before Phase 4.
3. Currency metadata table — Phase 2 should add `lib/currency.ts` interface now, but the `currency_metadata` DB table + `types/database.ts` generation is Phase 1 work. Phase 2 can proceed with a hardcoded decimals map (JPY 0, others 2) and swap to table-driven later.

---

## 11. Evidence Index (files inspected)

- `src/app/routes.tsx` — eager/lazy, wildcard, returnTo, AdminGuard placement, extra routes
- `src/lib/auth.tsx` — demo branch, isDemo, sign-in/up/out, Google OAuth, session handling
- `src/lib/useAdmin.ts` — platform admin query, isAdminEmail stub
- `src/layouts/TripLayout.tsx` — demo/UUID branches, duplicate nav, Realtime invalidations, safe-area
- `src/layouts/AppLayout.tsx` — max-width, skip link
- `src/screens/TripDashboard.tsx` (head) — 1551 lines demo app, local persistent state
- `src/screens/RealTripOverview.tsx` — any, effectiveMembers fabrication, “Created by you”
- `src/features/trips/TripsPage.tsx` — demo/RLS technical messages, any, placeholder totals
- `src/features/trips/useMembers.ts` — two-step fallback, UUID prefix, key mismatch
- `src/features/trips/hooks.ts` — demo fallbacks in useTripsQuery/useTrip
- `src/app/guards/*` — loading semantics, TripGuard raw copy
- `src/app/providers.tsx`, `src/lib/queryClient.ts`, `src/lib/supabase.ts`, `src/lib/env.ts`
- `src/components/navigation/*`, `src/components/feedback/*`
- `src/index.css` — scrollbars, focus-visible, reduced-motion (recently fixed)
- `src/types/database.ts` — hand-maintained, mutation_requests present
- `src/data.ts`, `src/ui.tsx`, `src/charts.tsx`, `src/lib/demo.ts` — legacy fixtures
- `src/features/auth/*`, `src/features/expenses/*`, `src/features/balances/*` — demo branches
- `vite.config.ts`, `package.json` — build/port config
- Spec: `plans/tripsplit-production-readiness-luna-spec.md` §1–11; review: `plans/tripsplit-production-review-luna-2026-08-19.md` §P0

---

*End of Phase 2 gate evidence. No files were deleted or rewritten. Next step is Phase 2A implementation per §9 above, one phase at a time with typecheck/test/build + screenshot/axe evidence at the exit gate.*
