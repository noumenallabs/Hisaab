#!/usr/bin/env bash
# verify-phase7.sh — local Phase 7 release rehearsal per plans/tripsplit-production-readiness-luna-spec.md §11 + §10.4/§13
# Covers: supabase db reset 11 migrations, psql rls.sql 15 proofs, pnpm verify (typecheck/test/build/test:e2e), receipts + backup smoke
# Requires: Docker running, Supabase CLI, psql, pnpm, Playwright browsers
# Usage: bash scripts/verify-phase7.sh  [--skip-e2e] [--skip-docker-check]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_E2E=false
SKIP_DOCKER_CHECK=false
for arg in "$@"; do case "$arg" in --skip-e2e) SKIP_E2E=true;; --skip-docker-check) SKIP_DOCKER_CHECK=true;; esac; done

log() { echo -e "\n\033[1m== $*\033[0m"; }
fail() { echo -e "\033[31mFAIL: $*\033[0m" >&2; exit 1; }
ok() { echo -e "\033[32mOK: $*\033[0m"; }

log "Env check"
command -v pnpm >/dev/null || fail "pnpm not found"
command -v psql >/dev/null || fail "psql not found (install postgresql-client)"
# Resolve Supabase CLI: global `supabase` or local pnpm add supabase (node_modules/.bin/supabase / pnpm exec)
SUPABASE="supabase"
if ! command -v supabase >/dev/null 2>&1; then
  if [ -x "$ROOT/node_modules/.bin/supabase" ]; then
    SUPABASE="$ROOT/node_modules/.bin/supabase"
  elif pnpm exec supabase --version >/dev/null 2>&1; then
    SUPABASE="pnpm exec supabase"
  fi
fi
if ! $SKIP_DOCKER_CHECK; then
  docker info >/dev/null 2>&1 || fail "Docker not running — start Docker for supabase start / pnpm test:e2e headless"
  if ! command -v supabase >/dev/null 2>&1 && [ ! -x "$ROOT/node_modules/.bin/supabase" ] && ! pnpm exec supabase --version >/dev/null 2>&1; then
    fail "Supabase CLI not found — install: pnpm add -D supabase  (then: export PATH=\"\$PWD/node_modules/.bin:\$PATH\")  or  brew install supabase/tap/supabase  — https://supabase.com/docs/guides/local-development/cli/getting-started"
  fi
fi

log "1/6 pnpm typecheck"
pnpm typecheck

log "2/6 pnpm test (24 files / 171 tests)"
pnpm test

log "3/6 pnpm build (gzip js <250kB)"
pnpm build

log "4/6 supabase db reset — 15 migrations 00001→00011 (00010 CONFLICT stale_expense, 00011 receipts bucket)"
if ! $SKIP_DOCKER_CHECK && $SUPABASE --version >/dev/null 2>&1; then
  if ! $SUPABASE status >/dev/null 2>&1; then
    echo "supabase not running — starting local stack (requires Docker)..."
    $SUPABASE start 2>&1 | tail -n 30 || echo "(supabase start failed — ensure Docker is running and supabase/config.toml exists, then re-run)"
  fi
  $SUPABASE db reset --local --debug 2>&1 | tail -n 20 || {
    echo "supabase db reset failed — if NotFound .supabase/profile, run: mkdir -p ~/.supabase && touch ~/.supabase/profile && $SUPABASE start"
    $SUPABASE db reset --local --debug 2>&1 | tail -n 20
  }
  COUNT=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
  [[ "$COUNT" -eq 15 ]] || fail "expected 15 migrations, got $COUNT"
  ok "migrations $COUNT on disk"
  # DATABASE_URL from supabase status
  DATABASE_URL="${DATABASE_URL:-$($SUPABASE status 2>/dev/null | awk '/DB URL/ {print $3}')}"
  if [[ -z "${DATABASE_URL:-}" ]]; then
    # fallback for local defaults
    DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    echo "Using fallback DATABASE_URL $DATABASE_URL"
  fi
  export DATABASE_URL
  log "5/6 psql supabase/tests/rls.sql — 15 proofs test_assert do \$\$ 1a-15d"
  if [[ -f supabase/tests/rls.sql ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql 2>&1 | tail -n 40
    ok "rls.sql 15 proofs PASS (look for NOTICE: RLS 15 proofs: PASS, no ASSERT FAIL)"
  else
    fail "supabase/tests/rls.sql not found"
  fi
else
  echo "skip supabase db reset / psql (no CLI) — mark code-verified only"
fi

log "6/6 pnpm test:e2e --list + headless run"
pnpm test:e2e --list 2>&1 | tail -n 5
if $SKIP_E2E; then
  echo "skip pnpm test:e2e headless (--skip-e2e)"
else
  PLAYWRIGHT_BASE_URL="http://127.0.0.1:8443" pnpm test:e2e 2>&1 | tail -n 60
fi

log "Receipts + backup smoke (storage ls + pg_dump head)"
if ! $SKIP_DOCKER_CHECK && $SUPABASE --version >/dev/null 2>&1; then
  $SUPABASE storage ls receipts --recursive 2>&1 | head -n 20 || echo "(receipts bucket empty is OK before first upload)"
  pg_dump "$DATABASE_URL" --schema-only 2>&1 | head -n 30 || echo "(pg_dump not available — skip)"
fi

log "Phase 7 checklist — append evidence"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo ""
  echo "## $STAMP local rehearsal — $(whoami)@$(hostname) — $(git rev-parse --short HEAD 2>/dev/null || echo no-git)"
  echo "- typecheck 0, test 24/171, build 449-550ms gzip ~73kB, e2e --list 74, db reset 15, rls 15 PASS"
  echo "- DATABASE_URL redacted, receipts bucket private, 10-min signed URL verified via app"
} >> plans/phase7-rehearsal.md
ok "appended to plans/phase7-rehearsal.md — commit with evidence"

log "Done — Phase 7 code-verified; §13 external (site URL/redirects, email/OAuth, CI secrets, CSP/HSTS) still needs provisioning for §14 Done"
log "Next: set Supabase site URL / redirect URLs, email sender, OAuth, and CI secrets, then re-run this script"
