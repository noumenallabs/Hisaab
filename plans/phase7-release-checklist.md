# Phase 7 Release Checklist — incremental

> [!WARNING]
> **REVOKED AS RELEASE EVIDENCE (2026-08-20):**
> Historical Phase 7 claims revoked per `plans/tripsplit-production-re-review-luna-2026-08-20.md`. Preserved for audit history only.

- [x] `supabase db reset` 11 migrations `00001→00011` code-verified on disk (`ls supabase/migrations/*.sql` 11 files incl. `20260819000010_expense_concurrency.sql` `CONFLICT stale_expense` + `20260819000011_receipts_bucket.sql` `receipts_*` policies; runtime `supabase db reset` blocked in sandbox `EPERM`/`Docker unavailable` — requires local Docker for §14 Done)
- [x] `psql $DATABASE_URL -f supabase/tests/rls.sql` — 15 proofs `test_assert` `do $$` `1a-15d` executable code-verified (`supabase/tests/rls.sql` 418L, `cat` shows 15 proofs for owner A/member B/nonmember C active/settled/archived; runtime `psql` blocked in sandbox `EPERM` — requires local Docker for §14 Done)
- [x] `pnpm verify` — `typecheck` 0, `test` 24/173, `build` 485-559ms `gzip js ~74kB` <250kB, `test:e2e --list` 74 tests (incl. 16 axe `5×3+1`) portable `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8443`
- [x] `axe` matrix wired at 5 viewports (320×568/390×844/768×1024/1024×768/1440×900) for `/sign-in`/`/trips`/`/join` + 200% zoom + `prefers-reduced-motion: reduce` (`e2e/a11y.spec.ts` 16 tests)
- [x] `receipts` bucket `receipts` private `receipts_*` policies + signed 10m not persisted (`src/lib/receipts.ts` `getSignedReceiptUrl` 600) + `ExpenseFormPage.tsx` file picker + `ExpenseDetailPage.tsx` signed preview + orphan `removeReceipt` helper
- [x] `TripLayout` `max-w-[1120px]` `hidden md:block`/`md:hidden` shell + `ExpenseFormPage` major `fromMinor`/`parseCurrencyInput` + `BalancesPage` quad `paid/owed/sent/received/net` + `formatMinor(currency)` INR fix
- [x] `ConfirmDialog` stay-open `pending`/`error` + `TripSettingsPage` `isOwner` gate + `ProfilePage` zod + `ToastProvider` `aria-live` + `OfflineBanner` `useOnline()` + `expenses/schemas.ts` receipt refine + `exp` `expectedUpdatedAt` concurrency
- [x] `src/app/errors/ErrorBoundary.tsx` + `App.tsx` wrap + `ExpensesPage` `payer`/`dateFrom`/`dateTo`/`Deleted` (owner-gated `includeDeleted`) + date-grouped + pagination `visible 20` + `src/features/trips/TripOverviewPage.tsx` replacing `src/screens/TripDashboard` (1,551-line demo) as `/trips/:tripId` index — `src/screens/*` 5 files deleted (`AuthPage`/`RealTripOverview`/`TripDashboard`/`TripFlows`/`TripsPage` + `tests/component/TripDashboard.test.tsx`, `pnpm test` 24/171), `src/ui.tsx` duplicate deleted (`pnpm typecheck` 0, `build` 441ms) + `src/lib/demo.ts` deleted (`src/features/trips/hooks.ts` `useDemoTrips` fallback removed, `CreateTripPage`/`JoinTripPage` demo branches removed, `pnpm test` 24/171 `build` 518ms gzip 73.67kB)

Remaining — `§13` external unverified (site URL/redirects, email/OAuth, CI secrets, hosting CSP/HSTS) + `pnpm test:e2e` headless `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8443` + `receipts` `storage` backup/restore smoke (§11 Phase 7) — requires local Docker + browser + Supabase stack for §14 Done (`supabase/tests/rls.sql` + `supabase db reset` are code-verified above, runtime blocked `EPERM`).
