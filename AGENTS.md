# Hissaab

React + Vite + Tailwind CSS v4 trip expense-sharing PWA backed by Supabase.

## Dev environment

- Node 22 + pnpm, Vite dev server on `$PORT` (default 8443 or 5173)
- Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for the real backend
- Without `.env`, the app runs in **demo mode** — localStorage-based auth, no persistence
- The dev server runs with hot reload active

## Project structure

```
src/
  main.tsx              — entrypoint (React.StrictMode, renders App)
  app/                  — router, providers, auth guards, error boundary
  features/             — feature modules: auth/, trips/, expenses/, balances/, activity/, settings/, profile/
  layouts/              — AppLayout (signed-in shell), TripLayout (per-trip shell)
  components/           — shared UI: feedback/, navigation/
  screens/              — composed page-level views (TripDashboard)
  lib/                  — auth, supabase client, queryClient, network, currency, env, demo
  types/database.ts     — full Supabase Database type (tables, views, functions, enums)
index.html             — Vite HTML shell with Figma Make comment slots
```

## Key dependencies

- **React Router v8** — `createBrowserRouter`, lazy routes, guards as layout routes
- **@tanstack/react-query v5** — server state; `queryClient` from `src/lib/queryClient`
- **react-hook-form v7 + zod** — form state + schema validation
- **@supabase/supabase-js v2** — auth + PostgREST + RPC; typed via `Database` from `src/types/database.ts`
- **lucide-react** — icons
- **MSW v2** — API mocking for tests
- **Vitest v3 + @testing-library/react v16** — unit/integration tests (jsdom)
- **Playwright v1** — e2e tests (mobile iPhone 12 + desktop Chrome)

## Build & test commands

```bash
pnpm build              # vite build (production)
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest run (unit + integration)
pnpm test:e2e           # playwright test (needs dev server or built preview)
pnpm verify             # typecheck + test + build + e2e (full CI gate)
pnpm format             # oxfmt (project formatter)
```

## Conventions

- Use ESM `import`/`export`. Use `.tsx` for React components, `.ts` for plain modules.
- Export components as **default exports**. Named exports only for hooks and utils.
- Route guards are layout routes: `<AuthGuard>`, `<GuestGuard>`, `<AdminGuard>`, `<TripGuard>`.
- Use the `@/*` path alias (resolves to `src/*`).
- All monetary values are in integer **minor units** (cents) — `amount_minor`, `net_minor`, etc.
- Supabase interaction goes through Postgres functions (RPC) — never direct table INSERT/UPDATE/DELETE from the client.
- Tailwind v4 uses `@theme` in `src/index.css` for custom design tokens — no `tailwind.config.*`.
- Use double quotes for strings containing apostrophes — an unescaped apostrophe in a single-quoted string breaks the build.

## Pitfalls

- `pnpm test:e2e` starts its own build+preview server unless `PLAYWRIGHT_BASE_URL` is set.
- The dev server uses `strictPort: true` on 8443 — it won't fallback if the port is taken.
- TypeScript `noEmit: true` — `tsc` is for typechecking only; Vite handles bundling.
- The Supabase `Database` type in `src/types/database.ts` is the source of truth for all table/function shapes. Keep it in sync with migrations.

<claude-mem-context>
# Memory Context

# [SplitPurse] recent context, 2026-08-20 9:46pm GMT+5:30

No previous sessions found.
</claude-mem-context>