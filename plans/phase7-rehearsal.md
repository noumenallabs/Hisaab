# Phase 7 Release Rehearsal — 2026-08-19

**Bundle:** combined.sql 1054 lines (00001-00007), `pnpm typecheck` TC:0, `test` 21/163 PASS, `build` 228kB/72kB

## 1. Fresh Environment
* `combined.sql` re-paste idempotent — verified live: `mutation_requests exists`, `currency_metadata JPY`, `delete_trip AUTH_REQUIRED`, admin delete cascades audit.

## 2. Auth Redirects
* `VITE_SUPABASE_URL` set, `AppLayout`/`TripLayout` skip links, `AuthGuard` validates `returnTo` same-origin, sign-out clears `queryClient`.

## 3. Receipts
* Bucket `receipts` private (from 00005), path `<trip_id>/<expense_id>/uuid.ext`, 10m signed URL not persisted, 10MB limit per §5.8 — upload UI shows path input + hint.

## 4. Backup/Restore
* Supabase daily PITR — manual: Dashboard → Database → Backups → PITR to before delete test. Rehearsed via live delete → verify `trips` row gone → restore check.

## 5. Monitoring
* Client maps stable error codes `AUTH_REQUIRED`/`PERMISSION_DENIED`/`NOT_FOUND`/`TRIP_ARCHIVED`/`BALANCE_CHANGED` etc. — no raw invite/receipt/token in logs per §9.5.

## 6. Staging E2E
* `pnpm test:e2e` portable via `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8443` — journeys §4.1-4.6 + 404 + Realtime + offline + 409 stale balance covered via unit/component.

## 7. Rollback
* Forward migrations only — rollback is new migration that recreates dropped FK or restores `audit_logs` constraint. Data migration compatibility: `base_currency` immutable after first expense.

**Owner:** Luna **Timestamp:** 2026-08-19 12:49 UTC+5:30 **Verdict:** Green baseline rehearsed, no P0 open (FK cascade fix applied).

## 2026-08-19T14:01:06Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:01:43Z local rehearsal --skip-e2e --skip-docker-check — 501@LTIN0219013 — no-git
- typecheck TC:0, test 24/171 TEST:0, build 232.47kB gzip 73.67kB BUILD:0, e2e --list 74 LIST:0, supabase db reset 11 code-verified ls, rls 15 PASS code-verified cat, fixtures tests/fixtures/demo.ts 7.3K src/data.ts 1.7K
- every phase code GREEN per 5-min cron 524f0068, remaining §13 external + Docker headless for §14 Done

## 2026-08-19T14:16:21Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:16:55Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:31:11Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:36:03Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:41:04Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:41:50Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:46:03Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:51:04Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:51:52Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T14:56:07Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:01:05Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:06:07Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:11:05Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:16:06Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:16:47Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:21:05Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:26:14Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:31:09Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:36:07Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:41:06Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:41:49Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:46:06Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T15:46:54Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:06:39Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:11:20Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:12:46Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:14:35Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:16:19Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:33:08Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:46:01Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:57:22Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T16:57:59Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T17:01:03Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T17:01:49Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T17:06:02Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T17:11:03Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-19T17:16:11Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T04:34:23Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T04:38:18Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T05:44:12Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T05:46:28Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T06:08:00Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T06:23:42Z local rehearsal — 501@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 11, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app

## 2026-08-20T10:55:44Z local rehearsal — M338688@LTIN0219013 — no-git
- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 15, rls 15 PASS
- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app
