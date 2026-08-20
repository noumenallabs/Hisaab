## Goal
Fix fundamentals before scaling tests: make the trip navigation chrome (tab bar) reliably visible and correct the core trip shell so that every trip type (demo vs Supabase, empty vs populated) renders a coherent layout with members. Replace shotgun test growth with a lean, fundamental QA gate.

## Success Criteria
- On `/trips` (list): exactly one `TripSplit` app header (no duplicate), trips grid or empty state renders, no layout overflow.
- On `/trips/:tripId` for **any** trip (demo `demo` and real UUID): header + navigation chrome is always visible on scroll and on both 390×844 and 1440×900, without double headers or nested `min-h-screen` shells. Content is not hidden behind a fixed bar.
- `RealTripOverview` shows correct member state: at least the current user as `owner` via fallback, no blank Members card, no missing avatars, even when `trip_members` join initially fails.
- `TripDashboard` demo bottom 4-tab bar and `TripLayout` real 5-tab bar do not compete; there is exactly one navigation system per route, with a single source of truth for active state.
- Manual QA script (7 journeys, 2 viewports) passes; `pnpm build` and existing 163 unit/component tests stay green; no new E2E added until gate passes.

## Context And Current Facts
- **Route structure** (`src/app/routes.tsx:81-100`): `AuthGuard -> TripGuard -> TripLayout -> Outlet` with `index: TripDashboard`, `expenses`, `balances`, `activity`, `settings`. `AppLayout` wraps `/trips` list. `TripGuard` (`src/app/guards/TripGuard.tsx:6-33`) gates on `useTrip(tripId)` which for Supabase does `fetchTrip` UUID check + `maybeSingle()`. Demo ids (`demo`) return `null` when Supabase is enabled → TripGuard shows “Trip not found” (intentional but confusing for QA).
- **Two shells competing**: `TripDashboard` (`src/screens/TripDashboard.tsx:61-326`) is a self-contained demo shell: `max-w-[480px]`, `fixed bottom-0 z-30 grid-cols-4` bottom bar + internal `tab` state (`overview/expenses/balances/activity`). For real UUID it early-returns `RealTripOverview` (`isRealTrip` check line 64). `RealTripOverview` (`src/screens/RealTripOverview.tsx:9-120`) previously had its own `min-h-screen max-w-[480px]` wrapper + header, nested inside `TripLayout`’s `max-w-5xl p-4` Outlet — causing double padding, double header, and layout overflow. Recently refactored to content-only but still has inner `space-y-4` nesting.
- **TripLayout** (`src/layouts/TripLayout.tsx`): had `if (!trip) return null` (now skeleton), and had `sticky top-0` on both header and `TripNavigation` at same `top-0` (overlap). Just refactored to add a `fixed` 5-tab bottom bar in addition to the top `TripNavigation` — now there are *two* navs on real trips (top horizontal + bottom fixed). Bottom bar uses `NavLink` with `end` for Overview, but was not present in earlier screenshots (user says still missing → suggests it is hidden by overflow, z-index, or not mounted because `trip` is null).
- **Members empty**: `useTripMembers` (`src/features/trips/useMembers.ts`) used `profiles:profiles!inner(...)`; inner join drops the row if `profiles` RLS blocks. Fixed now to two-step fetch (members then profiles `in (ids)`), plus `effectiveMembers` fallback to `useAuth().user`. User screenshot for `node / Kashi` still showed 0 members, suggesting either the fix not yet reloaded in dev server, or `user` was null at render time, or `trip.created_by` fallback not used.
- **Duplicate header on list**: `TripsPage.tsx:15-17` previously wrapped its own `<main><AppHeader /></main>` inside `AppLayout` which also renders `AppHeader` → two compass headers stacked (user’s second screenshot). Just fixed to `<>` fragment.
- **Build/test**: `pnpm build` 2084 modules, 163 tests green. `playwright.config.ts` webServer is `pnpm build && pnpm preview --port 4173` but `pnpm preview` uses `process.env.PORT || 8443` from `vite.config.ts:36-44` — port mismatch. `listen EPERM 127.0.0.1:4173` in sandbox.
- **Spec**: `plans/tripsplit-luna-implementation-spec.md` defines trip lifecycle, RLS, RPCs; not directly about chrome but sets expectation that trip detail chrome is consistent.

## Constraints And Non-goals
- Do not add new E2E or unit tests until the fundamental gate passes (user explicitly: “no point in 100’s of test case if fundamentals are missed”). Existing tests stay.
- Do not change Supabase schema/RLS in this gate; treat as read-only. Fixes must be client-side layout/query robustness.
- No new design system or visual redesign — just make the existing navigation chrome correct and visible.
- Dev server is on `$PORT` (8443) in Figma Make, preview is sandboxed (EPERM on 4173). Use `pnpm build` + manual preview URL or `PORT=8443` override for QA.
- Non-goal: feature work (receipts Storage signed URLs, 4 split modes UI, settlement overpayment edge polish) — defer to next phase after gate.

## Key Decisions
1. **One navigation source of truth per trip type** — `TripLayout` owns chrome for *all* `/trips/:tripId` routes. `TripDashboard` must become a *content* component for demo, not a shell with its own fixed bar. Keep `TripDashboard`’s internal `tab` state only for demo preview, but when mounted inside `TripLayout` render as content without bottom bar; `TripLayout` renders the single bottom bar for both demo and real. _Rejected: keep two competing fixed bars (demo bottom + TripLayout bottom) — causes double nav and confusion on which is authoritative._
2. **Sticky strategy: header static, top nav sticky, bottom bar fixed** — `TripLayout` header not sticky (scrolls away), `TripNavigation` `sticky top-0 z-20` below it, bottom 5-tab `fixed bottom-0 z-30`. Content has `pb-24` to avoid occlusion. _Rejected: both header and nav sticky at `top-0` (overlap) and `if (!trip) return null` (hides bar during load)._
3. **Members query: two-step fetch + `effectiveMembers` fallback is the correct robustness pattern** — no `!inner` join, fallback to `trip.created_by`/`user` ensures at least one row. _Rejected: revert to inner join or rely solely on `useAuth`._
4. **List page: no wrapper/header in `TripsPage`** — `AppLayout` is the sole shell for `/trips`. _Rejected: keep TripsPage outer `<main>`._
5. **QA harness: 7 manual journeys × 2 viewports, not automated E2E, as gate** — user wants fundamentals verified by real navigation, not more test files. _Rejected: add 20 new specs before fixing chrome._

## Recommended Approach
Phase the gate as debug → chrome unification → members hardening → manual QA.

1. **Live debug pass (no code)**: hard-refresh with dev server on 8443, open `/trips`, `/trips/demo` (demo mode) and a real UUID (`/trips/<uuid>`) side-by-side at 390×844 and 1440×900 in the preview panel. Inspect DOM: is `TripLayout` mounted? What does `useTrip(tripId).data` return? Is `TripLayout`’s bottom `nav[aria-label="Trip sections"]` in DOM but `display:none`/behind `overflow-hidden`? Use devtools Elements, not more tests.
2. **Unify chrome**: remove demo bottom bar from `TripDashboard` when `isRealTrip` is false but still inside `TripLayout`; instead let `TripLayout` render one bottom bar for all trips. Make `TripDashboard` render `Overview/Expenses/Balances/Activity` as *outlet-compatible* content (or keep its internal tabs only when rendered standalone at `/` root, not under `TripLayout`). Ensure `TripLayout` no longer returns `null` on `!trip` but a skeleton that still shows header+nav.
3. **Harden overview members**: keep two-step fetch, add `trip.created_by` fallback if both `members` and `user` are null, and dedupe the two “Only you” messages (top strip + Trip meta card) into one onboarding card.
4. **Validate**: `pnpm build`, manual 7-journey script, then existing `pnpm test` as regression.

## Work Plan
- **Phase 0 — Debug rehearsal (read-only, 30m)**
  - Files: `src/app/routes.tsx`, `src/layouts/TripLayout.tsx`, `src/screens/TripDashboard.tsx:61-68`, `src/screens/RealTripOverview.tsx:8-30`, `src/features/trips/useMembers.ts`, `src/layouts/AppLayout.tsx`, `src/features/trips/TripsPage.tsx`
  - Actions: capture preview URL on `$PORT`, list `isRealTrip` branches, note where `fixed` bars get clipped by parent `overflow`/`max-w`. No code change.

- **Phase 1 — Single shell for `/trips` (15m)**
  - Surface: list page
  - File: `src/features/trips/TripsPage.tsx:8-16` already fixed (`<>` fragment) — verify no residual `main`/`AppHeader`. If preview still shows double header, clear `.pnpm-store` cache and hard refresh.

- **Phase 2 — Unify trip chrome (60m, highest risk)**
  - Surfaces: `TripLayout` (real), `TripDashboard` (demo)
  - Files: `src/layouts/TripLayout.tsx:85-130`, `src/screens/TripDashboard.tsx:170-262`, `src/components/navigation/TripNavigation.tsx`
  - Change: (a) `TripLayout` keeps one `sticky` top nav + one `fixed` bottom 5-tab bar (as just added) but remove header `sticky` conflict; (b) `TripDashboard` when `isRealTrip` is false and mounted under `TripLayout` must **not** render its own `fixed bottom-0` 4-tab bar — gate on `useParams` presence of `TripLayout` or split demo shell vs content. Smallest safe edit: add prop `embedded?: boolean` to `TripDashboard` and pass `embedded` when used as `index` under `TripLayout`; when `embedded`, hide its bottom `nav` and header, render only the `Overview/Expenses/Balances/Activity` content that `Outlet` would otherwise provide.
  - Dependency: Phase 0 findings on whether bottom bar is hidden by `max-w-5xl` centering.

- **Phase 3 — Overview members correctness (30m)**
  - Files: `src/features/trips/useMembers.ts:6-35`, `src/screens/RealTripOverview.tsx:26-54`
  - Change: keep two-step fetch, add `byId` fallback to `trip.created_by` when `members` empty and `user` null, collapse duplicate “No default members” copy into one card. Add `aria-busy` skeleton already present. No schema change.

- **Phase 4 — Manual QA gate (30m, must be done in preview, not in vitest)**
  - Viewports: 390×844 (iPhone 12) + 1440×900 (Desktop Chrome) per `playwright.config.ts:13`
  - Journeys: (1) `/trips` list → no double header; (2) `Create trip` → “Plan first…” form → submit → lands on `/trips/:uuid` with tabs visible; (3) new trip overview shows at least one member + “No expenses yet”; (4) navigate via bottom bar `Expenses → Balances → Activity → Settings` without page reload losing bar; (5) generate invite in Settings → copy link visible; (6) back to `/trips` → new trip card appears; (7) hard refresh on detail → tabs still visible (no `if (!trip) null` blank).
  - Record pass/fail in `plans/qa-review-tabbar-2026-08-19.md` checklist.

## Validation Plan
- **Build**: `pnpm build` (expect 2084 modules, <760kB, no type errors). Run after each phase.
- **Unit regression**: `pnpm test --reporter=verbose` (must stay 21 files 163 passed; no new files).
- **Manual chrome checks** (cannot be automated in sandbox EPERM):
  - `TripLayout` bottom `nav[aria-label="Trip sections"]` is in DOM on `/trips/:uuid` at both viewports, `position: fixed`, `bottom: 0`, `z-index: 30`, not clipped by `overflow-hidden` parent. Check via devtools Computed + visual scroll.
  - `TripNavigation` top row `position: sticky, top: 0` stays visible on scroll.
  - `TripsPage` has exactly one `header` with `TripSplit` (count `document.querySelectorAll('header').length === 1` on `/trips`).
  - `RealTripOverview` shows `Members · 1` and avatar when `trip_members` is `[]` + `user` present.
- **E2E deferred**: do not run `pnpm exec playwright test` until gate passes; when run, expect `admin.spec.ts` and `flows.spec.ts` 2. and 3. to need `tripsplit.test` admin seed (existing gap).

## Risks / Rollback
- **Risk**: unifying bottom bar may break demo standalone view at `/` (if anyone navigates to root demo without `TripLayout`). Mitigation: keep `TripDashboard` standalone mode when `!tripId` or when `embedded` false.
- **Risk**: `fixed` bottom bar + `pb-24` may add unwanted padding on desktop where top nav is primary. Acceptable for gate; can make bottom bar hidden `sm:hidden` later if design wants top-only on desktop.
- **Risk**: `useMembers` two-step `in (ids)` with empty `ids` throws. Already guarded with `if (!members?.length) return []`.
- **Rollback**: revert `src/layouts/TripLayout.tsx`, `src/screens/TripDashboard.tsx`, `src/features/trips/useMembers.ts`, `src/features/trips/TripsPage.tsx` to prior commit via `git diff` stash; no DB migration rollback needed.

## Open Questions
- None for gate — whether demo should remain reachable at `/trips/demo` when Supabase is enabled (currently TripGuard blocks it with “Trip not found”) is a product question to answer after gate, not during.
