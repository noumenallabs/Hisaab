# Phase 5–7 Gate Evidence — Audit (read-only)

**Date:** 2026-08-19 16:30 UTC+5:30  
**Scope:** Spec §§7.9–7.11, 8, 9, 13, 14 — `plans/tripsplit-production-readiness-luna-spec.md`  
**Mode:** Read-only audit. No code edits.  
**Inspected commit/state:** Live workspace `SplitPurse` — see file citations below.

---

## 0. Executive verdict

| Phase | Spec deliverable | Verdict |
|-------|------------------|---------|
| **Phase 5 — Settings / Activity / Lifecycle / Profile** | §7.9 Activity human-readable + stable pagination · §7.10 Capability-gated settings with explicit roles, stale-membership guard, dialog-stays-open · §7.11 Validated profile with refresh | **FAIL — P1×4 open** (cursor pagination bug, invite-gate leak, dialog-closes-early, profile stale) |
| **Phase 6 — A11y / Resilience / Privacy / Perf** | §8 WCAG 2.2 AA · §9.1 Offline blocks mutations · §9.2 Stable error codes · §9.3 Lazy + 250kB budget + font self-host · §9.4 Metadata noindex · §9.5 Redaction | **FAIL — P1×5 open** (contrast tokens, 44px targets, global dialog trap, offline non-blocking, remote fonts, site.json description) — budget itself PASS |
| **Phase 7 — Release rehearsal** | §11 Phase 7 + §13 External config + §10.5–10.7 Quality gate | **BLOCKED / UNVERIFIED** — `phase7-rehearsal.md` asserts Green but external config matrix entirely unverified; E2E quality gate fails (catch/skip/heading-only) |

**No P0 crashers found**, but **9 P1 defects** block production readiness per §14. Phases 5–6 cannot exit.

---

## 1. Defect matrix — Phases 5–7

Severity: **P0** breaks money/security/data-loss · **P1** violates production readiness gate · **P2** polish/debt.

### Phase 5 — §7.9 Activity

| ID | Spec ref | Location | Defect | Sev | Evidence |
|----|----------|----------|--------|-----|----------|
| **A-01** | §7.9 — cursor `(created_at,id)` | `src/features/activity/api.ts:17` | Pagination drops `id` from cursor: `q.lt("created_at", cursor.created_at)`. Equal timestamps skip/dupe rows; not stable per spec. | **P1** | `api.ts` L17 reads `lt("created_at", ...)` only; `hooks.ts:11-15` correctly builds `{created_at,id}` but caller ignores `id`. |
| **A-02** | §7.9 — human-readable + redact | `src/features/activity/ActivityPage.tsx:8-22,53-60` | Partial: `humanSummary` maps actions but entity handling is ad-hoc (`member` only), raw `entity_id.slice(0,8)` still shown, `previous_values` JSON sliced to 120 chars not redacted (invite codes / receipt paths could leak). No group-by-day, no entity/action filters. | **P1** | Page renders `entity_id.slice(0,8)` and `JSON.stringify(previous_values).slice(0,120)` — violates redact requirement §7.9. |
| **A-03** | §7.9 — required states | `src/features/activity/ActivityPage.tsx:45-63` | Loading skeleton, error+retry, empty, load-more exist. **End-of-list** not explicit (button just disappears). | P2 | Has `q.isLoading`, `q.error`, `pages.length===0`, `hasNextPage` — missing "no more" status. |

### Phase 5 — §7.10 Settings & members

| ID | Spec ref | Location | Defect | Sev | Evidence |
|----|----------|----------|--------|-----|----------|
| **S-01** | §7.10 owner-only rendering | `src/features/settings/TripSettingsPage.tsx:53`, `src/features/trips/InviteManager.tsx:5-63` | `InviteManager` rendered for **all** members when `!isArchived` (line 53). Inside `InviteManager` the Generate/Revoke/Create controls have **no** owner gate — both write paths open to any trip member. Spec: "Owner-only sections are rendered only for owners." | **P1** | `TripSettingsPage.tsx:53` condition ignores `isOwner`; `InviteManager.tsx:62-96` has no `role` check. |
| **S-02** | §7.10 `user_id` not `id` | `src/features/settings/TripSettingsPage.tsx:61,72-76,104` | **Fixed** — now derives `uid = m.user_id ?? m.id` and passes `uid` to `changeMemberRole`/`removeMember`. Demo fallback retained. No remaining `m.id` in real path. | ✅ PASS | L61 `const uid = m.user_id ?? m.id`; L72-76 `changeMemberRole(tripId!, uid, …)`; `src/features/settings/api.ts:5-28` RPCs take `p_user_id: userId`. |
| **S-03** | §7.10 explicit role labels | `src/features/settings/TripSettingsPage.tsx:80-84` | **Fixed** — labels are now explicit `Promote to owner` / `Change to member` with matching `aria-label`. | ✅ PASS | L81 `aria-label={role==="owner" ? "Change to member" : "Promote to owner"}` |
| **S-04** | §7.10 prevent stale membership | `TripSettingsPage.tsx:28-37,66-93` | No stale guard. `act()` toasts `e.message` but does **not** refetch members nor invalidate `trip_members`. While `currentRole` is unresolved (`undefined`) the UI shows "Only owners can change roles…" to everyone (L98) and hides buttons — correct to hide but no explicit `role loading` disabled state per spec "Do not show mutation controls while role is unresolved." Message flickers on load for members. Server errors `LAST_OWNER`/`MEMBER_HAS_BALANCE` would be toasted but form not preserved with refetch. | **P1** | `act()` L30-37 no `qc.invalidateQueries`; L98 `!isOwner && …` true during load. Compare spec: "Prevent the owner acting on stale membership via server errors and refetch." |
| **S-05** | §7.10 dialog stays open on error | `src/components/feedback/ConfirmDialog.tsx:56-60` + `TripSettingsPage.tsx:99-110,153-171` | **FAIL** — `ConfirmDialog` does `onConfirm(); onClose()` synchronously. Async `removeMember` can fail after dialog already closed; inline error never shown. `InviteManager` revoke correctly uses mutation `onSuccess`/`onError` but still calls `onConfirm` via same dialog primitive so same race inside the dialog component. Spec: "Confirmation dialogs stay open while submitting and show inline errors." | **P1** | `ConfirmDialog.tsx:57-60` unconditional `onClose()`; Settings page L103 `act(() => removeMember(tripId!, confirm), …)` cannot keep dialog open. |
| **S-06** | §7.10 invite management | `InviteManager.tsx:65-96,129` | Generate/Revoke reachable by members (S-01) and copy succeeds, but post-revoke `ConfirmDialog` will close before `revoke.isPending` (same S-05 primitive). | P2 (inherits S-01/S-05) | — |

### Phase 5 — §7.11 Profile

| ID | Spec ref | Location | Defect | Sev | Evidence |
|----|----------|----------|--------|-----|----------|
| **P-01** | §7.11 validated name | `src/features/profile/ProfilePage.tsx:9-24,34-38` | No validation. `useForm` has **no resolver**; input `register("name")` accepts empty/over-long. No `zod` schema, no `maxLength`, no `aria-invalid`. | **P1** | L9 `useForm({ defaultValues: … })` no resolver; L34 `<input {...register("name")}>` bare. |
| **P-02** | §7.11 pending/success/error | `ProfilePage.tsx:8,22-24,50-51` | Single `msg` string, no `isPending` disabled state, no severity, no manual dismiss. "Saved." is not announced as live region. | **P1** | L8 `useState("")`, L48 bare button never disabled. |
| **P-03** | §7.11 auth/profile refresh | `ProfilePage.tsx:18-22` | After `profiles.update` the auth context and `profiles` query are **not** refreshed. `useAuth().user` stays stale until reload. Spec: "Auth context/profile queries refresh after a successful update." | **P1** | L18-22 direct supabase update; no `queryClient.invalidateQueries`, no `supabase.auth.refreshSession`/`getUser`. |
| **P-04** | §7.11 `any` / demo copy | `ProfilePage.tsx:12,17` | Uses `any` in `onSubmit(v: any)` and `(supabase as any)`. Demo branch says "Demo mode — profile is local." — spec says "Demo copy is absent in production" (acceptable as offline fallback but should be gated behind `isSupabaseConfigured`). | P2 | L12 `onSubmit(v: any)`; L14 demo string. |

---

## 2. Accessibility audit — §8.1–8.4

### 2.1 Global (§8.1)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **Skip link visible-on-focus** | **PASS** | `src/layouts/AppLayout.tsx:7` + `src/layouts/TripLayout.tsx:88` render `<a class="skip-link" href="#main-content">`; `src/index.css:45-46` defines `.skip-link` top -1000 → `top:8px` on `:focus`. `vite.config.ts` plugin also injects `.figma-bypass-link` when `site.json.accessibility.addBypassLinks` true — currently **false** (intentional, local skip-link covers). |
| **Scrollbars kept** | **PASS (recent fix)** | `src/index.css:41-43` now uses thin visible scrollbars `scrollbar-width: thin; scrollbar-color: var(--color-hair) transparent` + WebKit 8px thumb. Previous global `* { scrollbar-width:none }` hiding is gone. `dist/assets/index-8ZT-oX0l.css` confirms `scrollbar` present. |
| **`:focus-visible` rings** | **PASS** | `src/index.css:44` `:focus-visible { outline:2px solid var(--color-brand); outline-offset:2px }`. `TripLayout` back link also has `focus-visible:ring-2`. |
| **44×44 touch target** | **FAIL — P1** | Primary actions use `min-h-11` (44px) ✅ (`ConfirmDialog`, `TripSettings` lifecycle, `AppHeader`, `ExpenseForm`). **Small controls** use `min-h-8` (32px) ❌: `TripSettingsPage` role/remove buttons (`min-h-8`), `InviteManager` Copy/Copy-link/Revoke (`min-h-8`), `Balances SettlementDialog` chips. Spec: "Minimum 44×44 for primary interactive controls." At least 5 surfaces violate. |
| **Heading hierarchy** | **PASS with note** | `routes.tsx` NotFound `h1`, `TripsPage` `h1`, `ExpenseFormPage` `h1#expense-form-title`, `Settings` `h2`→`h3`, `Activity` `h2`, `Balances` `h2`, `Profile` `h1`. One `h2` per route, logical. Note: `TripLayout` trip title is `h1.text-xl` — valid but two `h1`s on nested layout are debatable; axe will flag duplicate `h1` if layout + page both emit `h1`. |
| **Icon-only button names** | **PASS** | `TripSettings remove` has `aria-label="Remove ${m.name}"`; `InviteManager` Copy has `aria-label="Copy code ${code}"`; `TripLayout` back link has `aria-label="Back to all trips"`. Conditionally PASS — audit one control missing: header Sign out icon needs verify. |
| **`prefers-reduced-motion`** | **PASS** | `src/index.css:47` `@media (prefers-reduced-motion: reduce) { * { animation-duration:0.01ms; transition-duration:0.01ms } }` |
| **200% zoom / no horizontal scroll** | **UNVERIFIED (P2)** | No automated 200% check in repo; manual responsive screenshot matrix §8.4 not exercised in CI (no axe playwright project for 320/1440). Code uses `max-w-5xl`, flex-wrap, safe-area clearance — likely OK but not proven. |

### 2.2 Contrast (§8.2)

Computed vs **white (#ffffff)** and **canvas (#f4f6f9)** — AA normal text requires **≥4.5:1**, large text ≥3:1.

| Token | Hex | vs white | vs canvas | Use in `src/index.css:9-18` | AA verdict |
|-------|-----|----------|-----------|------------------------------|------------|
| `ink` | #1c2430 | **15.62:1** | 14.43:1 | body text | ✅ PASS |
| `ink-soft` | #5b6672 | **5.85:1** | 5.41:1 | secondary text | ✅ PASS (normal) |
| **`ink-faint`** | **#8a94a1** | **3.07:1** | **2.84:1** | hint/labels (`FormField` hint, currency prefix) — **listed in spec as 3.07** | **❌ FAIL normal text** — spec says redefine or restrict to non-text/large text. Currently used for `text-xs` hint (still normal). |
| **`owed`** | **#0e9f6e** | **3.39:1** | **3.13:1** | owed positives — **spec 3.39** | **❌ FAIL normal text** |
| **`owe`** | **#ef5b52** | **3.34:1** | **3.08:1** | owe negatives — **spec 3.34** | **❌ FAIL normal text** |
| `brand` | #2563eb | 5.17:1 | 4.77:1 | buttons/links | ✅ PASS |
| `hair` | #e6e9ee | ~1.25:1 | — | borders only | N/A (non-text) |

**Finding:** The three flagged tokens from spec §8.2 are **still failing AA for normal text** and actively used for text (`text-ink-faint`, `text-owed`, `text-owe`). `CurrencyAmount` `tone="owed"/"owe"` and `BalanceRow` net coloring rely on color alone plus text, but contrast still fails. Automated axe checks would flag `text-ink-faint` on white surface (3.07 < 4.5). Fix either: darken to ≥4.5:1, or restrict to ≥18pt / UI decoration with 3:1 allowance and document exception.

No color-alone meaning violation otherwise — positives include `+`/`owed` label and icons.

### 2.3 Dialogs, toasts, forms (§8.3)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Reusable accessible dialog primitive | **PARTIAL** | `ConfirmDialog.tsx` is reused (Settings + InviteManager) but `SettlementDialog.tsx` is a bespoke duplicate (`role="dialog"` div). Two primitives diverge — SettlementDialog has no focus trap at all, only Escape. |
| Trap focus within specific dialog (not global selector) | **FAIL — P1** | `ConfirmDialog.tsx:25` uses `document.querySelectorAll("#confirm-dialog button")` — **global document selector** per spec prohibition: "Trap focus within the specific dialog, not a global document selector." Also shared `id="confirm-dialog"` would collide if two dialogs mount. |
| Restore focus to invoker | **PASS** | `ConfirmDialog.tsx:18-37` saves `prevFocus` and restores on cleanup. |
| Prevent background pointer / screen-reader | **PARTIAL** | Overlay `bg-ink/40` with `onClick={onClose}` blocks pointer; `aria-modal="true"` present but **no** `inert`/`aria-hidden` on background. Acceptable for modal but incomplete vs spec. |
| Escape closes only when not submitting | **FAIL** | `ConfirmDialog.tsx:23` `if (e.key==="Escape") onClose()` runs even while pending (no `isSubmitting` guard). `SettlementDialog.tsx:24` same. Spec: "Escape closes only when not submitting." |
| Validation `aria-invalid`/`aria-describedby` | **PARTIAL** | `ExpenseFormPage.tsx:177` sets `aria-invalid` on description; `SettlementDialog.tsx:48` has `aria-describedby="settle-hint"`. `ProfilePage` and many inputs lack it. |
| Focus error summary / first invalid on failed submit | **UNVERIFIED** | No error-summary focus observed. `ExpenseFormPage` uses `react-hook-form` errors but no `focus()` on submit fail. |
| Toast `aria-live` + not overlapping bottom nav | **FAIL — P1** | `src/components/feedback/ToastProvider.tsx:21-30` renders `<div class="fixed bottom-4 left-1/2 -translate-x-1/2">` with **no** `role="status"`, `aria-live="polite"`, `aria-atomic`. Deduplication absent, manual dismissal absent (auto 2600 ms). At `bottom-4` (16px) it will **overlap** `TripNavigation` bottom nav (`bottom-24`/`pb-24`) on mobile — spec says "does not overlap mobile bottom navigation." |
| Toast severity / error persistence | **FAIL** | Severity prop missing (`Toast` is `{id,message}` only). Errors auto-dismiss same as success (2600 ms) — spec requires manual dismissal for errors. |

### 2.4 Responsive (§8.4)

| Viewport | Required | Evidence |
|----------|----------|----------|
| 320×568, 390×844, 768×1024, 1024×768, 1440×900 | Screenshots + no horizontal overflow + nav not covering last focusable | **UNVERIFIED** — `playwright.config.ts` runs only `390×844` (iPhone 12) + `1440×900` (Desktop). Missing **320, 768, 1024**. No `toHaveScreenshot`, no overflow assertion, no 200% zoom test. Existing e2e `flows.spec.ts:34-171` never asserts viewport matrix. |
| Mobile split selector crowding | **PASS (assumed)** | Expense form uses segmented mode — not inspected at 320 but code uses flex-wrap/responsive grid. |
| Desktop overview uses width | **PASS** | `TripLayout` `max-w-5xl` + `AppLayout` `max-w-5xl` — uses desktop space (spec suggests ~1120px; 1024 vs 1120 is P2 delta). No `min-h-screen` nested phone simulation — removed. |

---

## 3. Resilience / Privacy / Performance — §9

### 3.1 Connectivity (§9.1)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Offline state blocks all mutations in UI | **FAIL — P1** | `OfflineBanner.tsx:15-20` only renders a `<div role="status">You're offline — writes are paused.</div>`. **No** `useOnline`/`isOnline` hook, no `disabled`/`aria-disabled` on Save/Settlement/Invite/Role buttons, no form `fieldset disabled`. Grep `src` for `useIsOnline|isOnline|navigator.onLine` finds **only** `OfflineBanner` itself — zero consumers. Mutations (`useSaveExpense`, `record_settlement`, `createInvite`, `changeMemberRole`) will still fire and fail with network error; input not retained with retry per spec bullet 2 only partially via local form state. |
| Mutation started online that fails offline retains input + retry | **PARTIAL** | Form state is local (`useForm`) so input retained, but no explicit retry affordance. `SettlementDialog` preserves `reference/note` in state but would lose on unmount; no "Retry" button mapping to `BALANCE_CHANGED`. |
| No claim of offline write support | **PASS** | Banner copy correctly says "Read-only view remains." — does not claim offline writes. |
| Query cache may display stale with indicator | **FAIL** | `queryClient.ts` has `staleTime:30_000` but **no** UI stale indicator. `TripsPage` etc. do not show "potentially stale" label. Spec bullet 4 unresolved. |
| Realtime reconnect visible but nonblocking | **FAIL** | `TripLayout.tsx` subscribes to 5 channels but renders **no** reconnecting indicator. No `connectionHealth` state. |

### 3.2 Error handling (§9.2)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Stable server error codes (`AUTH_REQUIRED`, `LAST_OWNER`, `BALANCE_CHANGED`, …) | **PARTIAL** | `src/lib` has **no** `errors.ts`. Grep finds error code handling only in ad-hoc `e.message` toast. `plans/phase7-rehearsal.md:5` claims mapping exists (`AUTH_REQUIRED` etc.) but no source file was found (`src/lib/errors.ts` missing). DB layer likely raises codes, but **client mapper is absent** — violates "Client maps codes to copy and logs redacted diagnostic context." |
| Codes raised separately from internal detail; redacted logs | **UNVERIFIED** | No structured logger observed; no redaction test in `tests/`. |

### 3.3 Performance (§9.3)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **Lazy-load route features** | **PASS** | `src/app/routes.tsx:10-27` — all 11 feature routes are `lazy(() => import(...))` with `<Suspense fallback={<FullPageSkeleton/>}>`. `TripDashboard` also lazy. |
| **Bundle budget: initial route JS ≤250 kB gzip** | **PASS** | Fresh `pnpm build` (2026-08-19) per this audit:<br>**Entry** `index-FoWYZoqH.js` **72.68 kB gzip**<br>`supabase-BXl1Rfv5.js` 70.70 kB<br>`hooks-B6bMyMPP.js` 23.02 kB<br>Largest feature chunk `TripDashboard-DcgWpBvU.js` 11.62 kB (not initial). **Total initial (index + supabase + query + mutation + auth) ≈ 72.7+70.7+5.1+1.1+2.9 ≈ 152 kB gzip < 250 kB.**<br>Spec snapshot "213.89 kB gzip" was previous monolith; current code-split total `dist/assets` ≈ **228.75 kB raw (72.68 gzip)** for entry alone, **well under budget**. No documented exception needed. |
| Charts not loaded on non-chart routes | **PASS** | Only `charts.tsx` / `TripDashboard` imports Recharts; not in initial preload list (`index.html` preloads only supabase/query/mutation/auth/createLucideIcon/hooks/api). |
| Query selection/pagination | **PARTIAL** | Activity uses infinite query with limit 20; other lists (`TripsPage`, `ExpensesPage`) fetch full sets — not unbounded but audit pagination missing elsewhere is P2. |
| Waterfall avoidance | **PARTIAL** | `useTripMembers` does two-step fallback (members → profiles) sequentially — waterfall exists but bounded. |
| **Self-host fonts / no Google Fonts privacy leak** | **FAIL — P1** | `src/index.css:1-2` hard-imports `https://fonts.googleapis.com/css2?family=Inter…` + `JetBrains Mono`; built CSS `index-8ZT-oX0l.css:1` still contains `@import "https://fonts.googleapis.com/…"` — **render-blocking third-party request** per spec. System-font fallback exists but not primary. |

### 3.4 Production metadata (§9.4)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Title/description must describe TripSplit | **FAIL — P1** | `.figma/make/site.json:1-3` still: `"description": "Streamline project management with intuitive task tracking…"` (task-tracking product). `dist/index.html` `<title>Figma Make App</title>` + same task description in OG meta. |
| Favicon / social metadata | **FAIL** | `site.json` has `icons: {}` / `openGraph: {}` empty; `dist/index.html` emits no `<link rel="icon">` nor `og:image`. |
| Keep `noindex` until public | **PASS** | `site.json` `"robots":{"index":false}` + `vite.config.ts` emits `robots.txt Disallow:/` and `<meta name="robots" content="noindex, nofollow">` — correct per spec "Keep noindex until intentionally public." |
| Privacy/support links | **UNVERIFIED** | No footer links; deployment-dependent. |

### 3.5 Observability (§9.5)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Auth/invite/RPC/receipt/vitals events without PII | **UNVERIFIED** | No analytics/monitoring provider wired; `phase7-rehearsal.md:5` claims "no raw invite/receipt/token in logs" but no test proves redaction. Missing tests `supabase/tests/rls.sql` executable assertions exist but no observability redaction suite. |
| Never log notes/receipt URLs/tokens/invite codes | **PARTIAL** | Client does not `console.log` tokens, but `InviteManager.tsx:125` renders `active.map(a=>a.code).join(", ")` in UI (intended share) — logging concern is server side. No `console.log` of invite codes found in `src`. |

---

## 4. Verification contract — §10.5–10.7

### 10.5 E2E portability (tooling gate)

| Check | Status | Evidence |
|-------|--------|----------|
| `PLAYWRIGHT_BASE_URL` disables webServer | **PASS** | `playwright.config.ts:14-28` — `webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: pnpm build && preview --port ${port} … }`, `baseURL = PLAYWRIGHT_BASE_URL || http://127.0.0.1:${port}`. |
| CI isolated Supabase / does not target prod | **UNVERIFIED** | `e2e/*.spec.ts` use hardcoded `admin@tripsplit.test` / `admin@demo.local` + `LISBON24` demo codes. CI would need seeded identities; no `supabase/.env.test` checked. |
| No `.catch(()=>{})`, conditional no-op, runtime `test.skip()` to hide defects | **FAIL — P1** | **See E2E quality gate §7 below.** `flows.spec.ts:49,95,101,112,128,141,153`, `invite.spec.ts:25`, `admin.spec.ts:22,33,37` — all use `.catch(()=>{})` / `if(...isVisible().catch(()=>false)) { expect } else test.skip()`. This is explicitly forbidden in §10.5: "Do not use .catch(()=>{}), conditional no-op assertions, or runtime test.skip() to convert defects into passes." |

### 10.6 A11y/visual checks

| Check | Status | Evidence |
|-------|--------|----------|
| `@axe-core/playwright` fail on serious/critical | **FAIL** | No dependency `@axe-core/playwright` in `package.json`; no `test.describe` with `AxeBuilder`. Claim in `phase7-rehearsal.md:6` that axe passed is unsupported — **axe not installed**. |
| Screenshots at 320/390/768/1024/1440 | **FAIL** | Only 390 + 1440 configured; no screenshot assertions. |
| No horizontal overflow | **FAIL** | No `expect(page).evaluate(()=> document.documentElement.scrollWidth <= innerWidth)` check. |
| Fixed nav not covering last focusable | **FAIL** | No assertion; `ToastProvider bottom-4` overlap not tested. |
| Keyboard, reduced-motion, 200% zoom | **FAIL** | `Dialog.test.tsx` covers Escape only; no keyboard nav sweep, no `emulateMedia({ reducedMotion })`, no `page.setViewportSize` zoom test. |

### 10.7 Test quality gate (§10.7)

Each test must: fail when behavior broken · assert user-visible/DB invariant · not just heading · not reimplement prod algo · cleanup · not order-dependent · no prod credential in client.

| Suite | Result | Issues |
|-------|--------|--------|
| `tests/unit/money.test.ts` | **PASS** | Production helpers tested, not reimplemented, exhaustive boundaries (equal remainder, percent 100.00%, shares). |
| `tests/integration/db.test.ts` | **PARTIAL** | Static SQL substring checks (useful but not DB proof) + **one** real RLS test `anon cannot insert audit_logs` that runs only if `VITE_SUPABASE_URL` set — satisfies Phase 0 gate "at least one executable assertion" but not the full 15-case matrix §10.4 (missing last-owner concurrency, archived rejection, etc.). |
| `tests/component/Dialog.test.tsx` | **PARTIAL** | Asserts Escape + confirm — fails when behavior broken ✅, but does not test trap scope or isSubmitting guard, nor that dialog stays open on submit error. |
| `e2e/*.spec.ts` | **FAIL — P1** | Violates §10.7 bullets 1-3: many tests assert only `toBeVisible()` on a heading/text without proving state transition; `expenses.spec.ts:12` checks only `toHaveURL` not expense row content; `flows.spec.ts:62-67` checks `Trip not found` guard but silently skips if Supabase mode. Contains prod-like credential `password123` in client test — allowed for seeded test user but would ideally be env var. No cleanup of created trips. |

---

## 5. External configuration — §13

Spec lists 10 external items that are **not solvable by client code**; until completed, release gate is **unverified**.

| # | Required input | Status | Note |
|---|----------------|--------|------|
| 1 | Disposable vs prod Supabase data before migration reset/squash | **UNVERIFIED** | `phase7-rehearsal.md` says `combined.sql` re-paste idempotent but no confirmation of disposable flag from owner. |
| 2 | Platform admin provisioning (server-side, not client env) | **UNVERIFIED** | `useIsAdmin` hook still exists; bootstrap trigger dropped per Phase 1 but manual provisioning command not documented with audit log. |
| 3 | Prod site URL + allowed `returnTo` / auth redirects | **PARTIAL** | `validateReturnTo` in `routes.tsx:62` correctly same-origin checks; allowed URLs in Supabase Dashboard not evidenced. |
| 4 | Email sender/templates/rate limits/deliverability | **UNVERIFIED** | `VerifyEmailPage`/`ForgotPasswordPage` UI exists but no deliverability proof. |
| 5 | Google OAuth credentials if retained | **UNVERIFIED** | `signInWithGoogle` button exists but secret absent (expected). |
| 6 | Account deletion / data export / retention / privacy policy | **UNVERIFIED** | No route/docs. |
| 7 | Storage bucket limits + orphan cleanup schedule | **PARTIAL** | Bucket `receipts` private path documented; 10 MB limit enforced in RPC; **cleanup job** not evidenced (spec §5.8 scheduled cleanup). |
| 8 | Staging/CI Supabase credentials in secure secrets | **UNVERIFIED** | CI workflow missing. |
| 9 | Error monitoring/analytics provider + retention | **UNVERIFIED** | No provider chosen. |
| 10| Hosting/CDN/CSP/HSTS/headers; backup/restore owner & RTO/RPO; incident owner | **UNVERIFIED** | `vite preview host 0.0.0.0:8443` only; no hosting decision. `phase7-rehearsal.md:4` claims "PITR manual" but no timestamp/owner/evidence of restore drill. |

**Conclusion:** Phase 7 exit gate condition "No open P0/P1 defect" fails; also bullet 1 of Phase 7 deliverables "Fresh environment deployment from migrations" lacks command output / timestamp / owner.

---

## 6. Release rehearsal — §11 Phase 7 checklist

Rehearsal doc `plans/phase7-rehearsal.md` (2026-08-19 12:49, owner Luna) asserts **Green baseline rehearsed, no P0 open**. Audit finds it **optimistic**.

| Phase 7 deliverable | Claim | Audit |
|---------------------|-------|-------|
| Fresh env from migrations | "combined.sql 1054 lines re-paste idempotent" | No `supabase db reset` log, no `psql` transcript, no env name. P2: evidence insufficient. |
| Auth redirect/email/OAuth | "VITE_SUPABASE_URL set, skip links, returnTo validated" | returnTo ✅ skip links ✅ but email/OAuth not verified (no send test). |
| Receipt bucket + cleanup | "Bucket private, 10m signed URL, 10MB, upload UI" | Bucket + path + signed URL **present**, cleanup job **absent**. |
| Backup/restore rehearsal | "PITR via Dashboard" | No backup timestamp, no restore output, no RPO/RTO doc — **unverified**. |
| Monitoring alert smoke | "Client maps error codes" | No `errors.ts`, no alert test — **unverified**. |
| Staging E2E vs RC | "portable via PLAYWRIGHT_BASE_URL" | Portability ✅ but E2E quality fails — staging run would be false-green due to catch/skip. |
| Rollback + migration compat | "Forward migrations only, base_currency immutable" | Forward-only ✅, immutability claimed but not DB-proven (no test for `update_trip` after first expense). |

**Phase 7 exit gate** (spec §11): "Release checklist has command output, environment, timestamp, and owner. No open P0/P1 defect. Production secrets absent from repo/client bundle."

- Command output: ❌ only narrative, no log.
- Timestamp/owner: ✅ present but stale vs now.
- No P0/P1: ❌ 9×P1 open per this audit.
- Secrets absent: ✅ no `VITE_SUPABASE_SERVICE_ROLE` in client; `.env` not committed.

**Verdict:** Phase 7 **NOT green**. Rehearsal must be re-run after Phases 5–6 P1s closed, with log attachments.

---

## 7. Performance budget — current vs 250 kB gzip

Reference: spec Table 2.1 prior: `JS bundle 757.62 kB, 213.89 kB gzip` (pre-split). Budget per §9.3: **initial route JS ≤250 kB gzip, documented exceptions**.

Fresh build from this audit (`pnpm build`, Vite 8, mode != development):

```
dist/assets/index-FoWYZoqH.js        228.75 kB raw │ 72.68 kB gzip  ← entry (initial)
dist/assets/supabase-BXl1Rfv5.js     277.10 kB raw │ 70.70 kB gzip  ← preloaded (auth/DB)
dist/assets/hooks-B6bMyMPP.js         69.55 kB raw │ 23.02 kB gzip
dist/assets/index.esm-BzruFAMd.js     28.29 kB raw │ 10.38 kB gzip
dist/assets/query-C7WQ7Gbq.js         14.99 kB raw │  5.09 kB gzip
dist/assets/ExpenseFormPage-*.js      12.85 kB raw │  3.89 kB gzip  ← lazy (not initial)
dist/assets/TripSettingsPage-*.js     11.50 kB raw │  3.85 kB gzip  ← lazy
dist/assets/TripDashboard-*.js        45.27 kB raw │ 11.62 kB gzip  ← lazy (overview)
```

- **Initial preloads** (via `index.html` `link rel="modulepreload"`): `index` + `supabase` + `query` + `mutation` + `auth` + `useQuery` + `createLucideIcon` + `hooks` + `api` ≈ **72.7 + 70.7 + 5.1 + 1.1 + 2.9 + 3.3 + ~4 ≈ 160 kB gzip.**
- **Total entry + vendors < 250 kB** — **inside budget with 90 kB headroom**. Lazy chunks correctly excluded from initial (Expenses, Settings, Dashboard not preloaded).
- Fonts: Google Fonts CSS adds an extra render-blocking request **outside** JS budget but harms LCP.

**Conclusion:** Budget **PASS**. No exception needed. Risk is fonts (privacy + render-block), not JS size. Finishing self-host (system fonts or local `@font-face` with `font-display: swap`) removes the only perf P1.

---

## 8. E2E quality gate — catch / skip / heading-only analysis

Spec §10.5-10.7 forbids: `.catch(()=>{})` · conditional no-op assertions · runtime `test.skip()` to hide defects · heading-only assertions.

### Counts

| Pattern | Occurrences | Files |
|---------|-------------|-------|
| `.catch(() => {})` / `.catch(() => false)` / `.catch(() => null)` | **12** | `flows.spec.ts:49,95,101,110,112,128,153,158`; `invite.spec.ts:5,29,33`; `admin.spec.ts:33`; `expenses.spec.ts:34,44` |
| `test.skip()` called **inside** test body (runtime skip) | **6** | `flows.spec.ts:96,144?` (actually `test.skip()` in `flows:95-96`, `admin:22,37`, `invite:27`, `expenses:34,44`) |
| `if (await …isVisible()) { expect }` / conditional assertion → no-op when condition false | **7** | `flows.spec.ts:95-96,101,112,128,141,153`; `expenses.spec.ts:35,45` |
| `expect(page).toHaveURL(/\/trips\//)` or `toBeVisible()` on a heading without state proof | **10+** | `flows.spec.ts:17,31,79,84,113,129,143,154`; `expenses.spec.ts:24,36,38`; `invite.spec.ts:39,58`; `admin.spec.ts:42` |
| `getByText("Invite codes").waitFor().catch(()=>{})` swallowing missing invite code defect | 1 | `flows.spec.ts:49` |

### Worst offenders

1. **`flows.spec.ts:95-98`** — `if (await page.getByText("Trip not found").isVisible().catch(()=>false)) { test.skip(); return }` — if demo trip missing in Supabase mode the test silently passes instead of proving the expense journey.
2. **`expenses.spec.ts:42-50`** — "archived trip blocks expense add" only does `if (await ...Archived...isVisible().catch(...)) { expect }` — never asserts that the Add button is actually disabled/hidden; passes even if mutation controls leak.
3. **`flows.spec.ts:62-86`** — "add expense with each split mode" exercises **only equal**; title claims equal/exact/percent/shares but no Exact/Percent/Shares input — flagged in spec §2.2 as known limitation, still not fixed.
4. **`invite.spec.ts:24-27`** — `await expect(getByText("Invite codes")).toBeVisible().catch(async () => { test.skip() })` — `expect` is not awaited correctly inside `catch`; a missing Invite codes panel becomes skip not fail.

### Required remediation (§10.7)

- Replace all `.catch(()=>{})` around heading waits with `expect(...).toBeVisible({timeout})` that **fails** when absent.
- Move `test.skip()` to **suite setup** with `test.skip(!!process.env.CI || !process.env.VITE_SUPABASE_URL, "reason")` or guard at `test.describe.skipIf`.
- For archived/settled guards, assert **negative**: `await expect(page.getByRole("button",{name:"Save expense"})).toBeHidden()` / `toBeDisabled()` inside settled trip.
- "All split modes" must create 4 expenses (or 4 sub-tests) with distinct payer/split payloads and assert each preview.
- Realtime test `flows.spec.ts:119-132` copies invalidation callback — replace with two browser contexts that mutate and observe `expect(page2.getByText("Beach shack")).toBeVisible({timeout: 10_000})` via actual Realtime channel (needs local Supabase).

**Quality gate verdict:** **FAIL**. At least 5 of 10 journeys are false-green. Fix E2E layer before Phase 6 exit.

---

## 9. Consolidated Phase 5-7 gate checklist

| # | Spec | Gate | Status |
|---|------|------|--------|
| 5.1 | §7.9 | Activity human-readable with actor join, cursor `(created_at,id)`, pagination stable, redacted | ❌ A-01, A-02 |
| 5.2 | §7.10 | Settings capability-gated, `user_id` not `id`, explicit labels, stale guard, dialog stays open | ❌ S-01, S-04, S-05 (S-02/S-03 FIXED) |
| 5.3 | §7.10 | Invite management owner-only, copy/revoke proven | ❌ S-01 |
| 5.4 | §7.11 | Profile validated, pending/success/error, refresh | ❌ P-01,P-02,P-03 |
| 5.5 | §10.4 DB | Role matrix: owner/member/nonmember isolation proven for settings/activity | ⚠️ static checks only; one live RLS; full matrix missing |
| 5.6 | §10.4 | Archived trip fully readable & fully immutable (DB + browser) | ⚠️ UI read-only banner exists; DB immutability not browser-proven |
| 6.1 | §8.1-8.4 | No serious/critical axe, all viewports, zoom, reduced-motion | ❌ axe not installed; viewports incomplete; 44px fails |
| 6.2 | §8.2 | Contrast AA or documented large-text exception | ❌ 3 tokens fail normal text |
| 6.3 | §8.3 | Dialog focus trap scoped, Escape guard, live region, no nav overlap | ❌ global selector; live region missing; overlap |
| 6.4 | §9.1 | Offline blocks mutations, stale indicator, reconnect visible | ❌ no blocking |
| 6.5 | §9.2 | Stable error codes + redacted logs | ❌ mapper missing |
| 6.6 | §9.3 | Lazy routes + budget + font self-host | ✅ lazy + budget ✅ · font ❌ |
| 6.7 | §9.4 | site.json TripSplit metadata + noindex + favicon | ✅ noindex ✅ · metadata ❌ |
| 6.8 | §9.5 | Observability redaction tests | ❌ |
| 6.9 | §10.5-10.7 | E2E portability + quality gate | ❌ catch/skip/heading-only |
| 7.1 | §13 / §11 | External config + release rehearsal with logs | ❌ unverified |

---

## 10. What is already fixed (do not regress)

- `TripSettingsPage` now uses `m.user_id ?? m.id` and explicit `Promote to owner` / `Change to member` labels — **keep**.
- `src/index.css` scrollbars now visible + `focus-visible` + `prefers-reduced-motion` — **keep**.
- `playwright.config.ts` `PLAYWRIGHT_BASE_URL` gating + `src/app/routes.tsx` lazy routes + 404 `NotFound` — **keep**.
- `TripLayout` single shell, `AppLayout` skip link, `tripKeys` factory, `useTripMembers` typed projection — **keep**.
- `tests/integration/db.test.ts` live RLS anon test — **keep**, extend to full §10.4 matrix.
- `src/features/activity/api.ts` ordering by `created_at, id` — **keep**, just fix cursor filter to tuple.
- Bundle split: entry 72.68 kB gzip inside budget — **keep**, just self-host fonts.

---

## 11. Recommended fix order (smallest diffs that unblock exit)

1. **P1 quick wins (no migration):**
   - `ConfirmDialog.tsx:25` scope trap to `dialogRef.querySelectorAll("button")` + dedupe ids; add `isSubmitting` prop guard for Escape + `onClose` auto-close opt-out; wire `Settings` to `await` mutation and show inline `role="alert"` inside dialog (S-05).
   - `TripSettingsPage.tsx:53` gate `InviteManager` + `isOwner` prop into `InviteManager` so Generate/Revoke disabled for members (S-01).
   - `ProfilePage.tsx` add `zod` name schema (`min 2, max 40, regex`), `pending`/`isSubmitting` + `toast` live region, `queryClient.invalidateQueries(["profile"])` + `useAuth().refresh()` on success (P-01–P-03).
   - `ToastProvider.tsx` add `role="status" aria-live="polite" aria-atomic="true"` container, `bottom-24 md:bottom-4` to avoid nav overlap, `severity` + `autoHide=false` for errors (8.3).
   - `src/index.css` darken tokens to AA: proposal `ink-faint #6b7684` (≈4.54:1), `owed #0a7a56` (≈4.62:1), `owe #c53c34` (≈5.2:1) — verify with contrast tool (8.2).
   - `InviteManager` Generate/Revoke buttons `min-h-11` (8.1 touch).

2. **Resilience/privacy:**
   - Add `src/lib/network.ts: useIsOnline()` (window online/offline) + `OfflineBanner` already true; consume in every mutation button `disabled={!isOnline}` + `aria-disabled` + offline tooltip; add stale badge `query.isStale && <span role="status">Potentially stale</span>` (9.1).
   - Create `src/lib/errors.ts` map `BALANCE_CHANGED` → "Balances changed…", `LAST_OWNER` etc., unit test mapping; DB RPCs already emit codes (9.2).

3. **Pagination + metadata:**
   - Fix `fetchAudit` to tuple: `.or` with `(created_at.lt.X, created_at.eq.X.and(id.lt.Y))` or `WHERE (created_at,id) < (?,?)` via `.lt` + `.or` (A-01).
   - Fix `.figma/make/site.json` + `index.html` title/description/icons for TripSplit; add `favicon.svg` (9.4).

4. **Perf fonts:**
   - Remove `@import googleapis` from `src/index.css`; add local `@font-face` for Inter/JetBrains with `font-display: swap` or switch to `system-ui` stack (9.3).

5. **E2E quality:**
   - Remove `.catch(()=>{})` and runtime `test.skip()` per §8; move declares to `test.skipIf`; add negative assertions for archived guards; run `pnpm dlx axe-core/playwright` once deps added.

6. **Release rehearsal:**
   - Re-run `supabase db reset --db-url $STAGING` and capture transcript; run `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e --reporter=list` in CI; attach outputs to updated `plans/phase7-rehearsal.md` with env+owner.

---

## 12. File evidence inventory

- `src/features/settings/TripSettingsPage.tsx` — L28-110, 153-171
- `src/features/settings/api.ts` — L5-34
- `src/features/activity/ActivityPage.tsx` — L8-63
- `src/features/activity/api.ts` — L3-20
- `src/features/activity/hooks.ts` — L5-19
- `src/features/profile/ProfilePage.tsx` — L6-54
- `src/features/trips/InviteManager.tsx` — L5-129
- `src/features/trips/useMembers.ts` — L5-48
- `src/components/feedback/ConfirmDialog.tsx` — L14-71
- `src/components/feedback/OfflineBanner.tsx` — L1-20
- `src/components/feedback/ToastProvider.tsx` — L1-33
- `src/components/finance/BalanceRow.tsx`, `CurrencyAmount.tsx` — tone usage
- `src/layouts/AppLayout.tsx:7`, `TripLayout.tsx:88`
- `src/app/routes.tsx:10-129` — lazy + validateReturnTo + 404
- `src/index.css:1-47` — fonts, tokens, focus, motion
- `src/lib/auth.tsx`, `src/lib/env.ts`, `src/lib/queryClient.ts`
- `playwright.config.ts:14-28`, `e2e/*.spec.ts` (4 files), `tests/integration/db.test.ts`
- `package.json:6-16` scripts/deps, `vite.config.ts:12-130`, `dist/index.html`, `dist/assets/*.js`
- `.figma/make/site.json`, `plans/phase7-rehearsal.md`, `combined.sql`

---

## 13. Risk if released now

1. Non-owners can generate/revoke invites (S-01) — invites are capability bearer.
2. Activity pagination will lose/duplicate entries under concurrent writes (A-01).
3. Offline users can submit mutations that vanish (9.1) — data loss perception.
4. Confirm dialogs close before server confirms — user believes removal succeeded when it failed (S-05).
5. Contrast failures expose AA non-compliance; axe gate would block CI anyway.
6. E2E suite is green without proving behavior — regressions will ship undetected.

**Do not cut release** until §9 above table shows all gates green and `plans/phase7-rehearsal.md` is re-issued with attached logs.

---

*Audit completed read-only. No files edited. Next step: assignee for Phases 5–7 picks items from §11 in order and re-runs `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` before requesting re-audit.*
