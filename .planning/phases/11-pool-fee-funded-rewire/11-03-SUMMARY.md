---
phase: "11"
plan: "03"
subsystem: price-service
tags: [solana, pyth, coingecko, price-oracle, refactor]
dependency_graph:
  requires: [11-00]
  provides: [getSolUsdRate, usdToLamports, lamportsToUsd, usdToUsdcUnits, usdcUnitsToUsd]
  affects: [api/price/sol, api/users/sol-price]
tech_stack:
  added: []
  patterns: [service-extraction, in-memory-cache, pyth-hermes, coingecko-fallback]
key_files:
  created:
    - src/lib/services/solPriceService.ts
    - src/lib/services/solPriceService.test.ts
  modified:
    - src/pages/api/price/sol.ts
    - src/pages/api/users/sol-price.ts
decisions:
  - Also refactored duplicate sol-price.ts proxy endpoint to use shared service (DRY)
metrics:
  duration: 145s
  completed: "2026-04-12"
  tasks_completed: 4
  tasks_total: 4
  files_created: 2
  files_modified: 2
---

# Phase 11 Plan 03: SOL Price Service Extraction Summary

Extracted Pyth Hermes + CoinGecko fallback price logic into a server-side importable service with conversion helpers and 15-second in-memory cache.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 3.1 | Create `src/lib/services/solPriceService.ts` | Done |
| 3.2 | Refactor `src/pages/api/price/sol.ts` to use service | Done |
| 3.3 | Unit tests (13 tests, all passing) | Done |
| 3.4 | Verify no regressions in UI consumers | Done |

## Commits

| Hash | Message | Files |
|------|---------|-------|
| a929fc9 | refactor(11-03): extract SOL price logic into solPriceService | 4 files (2 created, 2 modified) |

## What Was Built

**`src/lib/services/solPriceService.ts`** -- Server-side SOL/USD price service:
- `getSolUsdRate()` -- Pyth Hermes primary, CoinGecko fallback, 15s in-memory cache
- `usdToLamports(usd)` -- Convert USD to SOL lamports (9 decimals)
- `lamportsToUsd(lamports)` -- Convert SOL lamports to USD
- `usdToUsdcUnits(usd)` -- Convert USD to USDC base units (6 decimals, pure math)
- `usdcUnitsToUsd(units)` -- Convert USDC base units to USD
- `__resetCacheForTesting()` -- Test helper to clear cache

**Refactored API routes:**
- `src/pages/api/price/sol.ts` -- Now a thin wrapper, response shape `{ solana: { usd }, source, timestamp }` preserved
- `src/pages/api/users/sol-price.ts` -- Also refactored from duplicated inline logic, response shape `{ price }` preserved

**Consumers verified (no changes needed):**
- `src/components/marketplace/PriceDisplay.tsx` -- reads `data?.solana?.usd`
- `src/pages/pools/[id].tsx` -- reads `priceData?.price` (via sol-price proxy)
- `src/pages/api/offers/create.ts` -- reads `pd?.solana?.usd`
- `src/pages/api/offers/respond.ts` -- reads `pd?.solana?.usd`
- `src/pages/api/offers/buyer-respond.ts` -- reads `pd?.solana?.usd`
- `src/pages/api/admin/mint-requests/confirm-mint.ts` -- reads `pd?.solana?.usd`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - DRY] Refactored duplicate sol-price.ts proxy endpoint**
- **Found during:** Task 3.2
- **Issue:** `src/pages/api/users/sol-price.ts` contained a complete copy of the Pyth+CoinGecko fetch logic (separate cache instance, duplicated code). This creates drift risk when the service is the source of truth.
- **Fix:** Replaced inline logic with `import { getSolUsdRate } from '@/lib/services/solPriceService'`
- **Files modified:** `src/pages/api/users/sol-price.ts`
- **Commit:** a929fc9

## Verification Results

- TypeScript: 0 new errors (7 pre-existing in unrelated test files)
- Jest: 13/13 tests passing
- Pyth logic fully extracted from API routes (grep confirms zero matches)
- solPriceService import present in both API routes
- Response shapes preserved for all consumers

## Self-Check: PASSED
