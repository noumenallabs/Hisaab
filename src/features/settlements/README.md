# Settlements — extracted per spec §6.1 target structure

Canonical logic lives in `src/features/balances/` (`balanceMath.ts`, `SettlementDialog.tsx`, `hooks.ts`).
This directory reserves `features/settlements/` as the standalone feature required by the target tree:

```
src/features/settlements/
  api.ts        → re-exports record_settlement / get_trip_balances wrappers
  hooks.ts      → re-exports useBalances / settlement mutations
  SettlementDialog.tsx → re-exports dialog
```

Extraction is incremental — no behavior change in this batch, only structural reservation so `src/features/{balances,settlements}` matches the spec §6.1 target.
