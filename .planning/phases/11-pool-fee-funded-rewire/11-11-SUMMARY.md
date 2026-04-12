---
phase: 11-pool-fee-funded-rewire
plan: 11
subsystem: api
tags: [helius-das, pool-distribution, resale, snapshot, escrow]

# Dependency graph
requires:
  - phase: 11-02
    provides: PoolDistribution schema with distributionKind, snapshotTakenAt, claimDeadlineAt, compound index
  - phase: 11-04
    provides: poolStateTransition service with resale_listed -> resold transition
  - phase: 11-10
    provides: list-resale endpoint creating resale escrows with poolBacked tracking
provides:
  - POST /api/pool/confirm-resale endpoint with DAS holder snapshot and PoolDistribution creation
  - confirm-delivery auto-triggers confirm-resale for pool-backed escrows
affects: [11-12, 11-13, 11-14, 11-15, 11-16]

# Tech tracking
tech-stack:
  added: []
  patterns: [helius-das-snapshot-for-distribution, idempotent-distribution-via-compound-index, internal-cron-secret-auth]

key-files:
  created:
    - src/pages/api/pool/confirm-resale.ts
    - src/pages/api/pool/confirm-resale.test.ts
  modified:
    - src/pages/api/escrow/confirm-delivery.ts

key-decisions:
  - "Route at /api/pool/confirm-resale (singular) with poolId query param, matching existing convention"
  - "Schema field mapping: payoutWallet+shares (not wallet+tokenBalance) to match PoolDistribution sub-doc"
  - "triggerPoolDistribution rewired to HTTP call to confirm-resale endpoint (replaces old inline getTopTokenHolders logic)"

patterns-established:
  - "DAS snapshot pattern: getAllTokenHolders -> proportional payout calc -> PoolDistribution.create"
  - "Retry-once pattern: catch DAS failure, retry, create snapshot_failed record on double failure"

requirements-completed: [POOL-11-09]

# Metrics
duration: 3min
completed: 2026-04-12
---

# Phase 11 Plan 11: Confirm Resale Hook + Distribution Snapshot Summary

**Helius DAS holder snapshot endpoint that creates PoolDistribution records with proportional USD payouts on pool-backed resale completion**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T16:22:35Z
- **Completed:** 2026-04-12T16:25:43Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Built confirm-resale endpoint taking full Helius DAS snapshot of ALL token holders via getAllTokenHolders
- Computes proportional USD payouts (97% of resale price) and creates PoolDistribution with distributionKind: 'resale'
- Transitions pool state resale_listed -> resold via poolStateTransition with memo audit trail
- Rewired confirm-delivery.ts triggerPoolDistribution to delegate to the new endpoint (replaces old inline logic using capped getTopTokenHolders)
- 16 unit tests covering happy path, idempotency, snapshot failure, retry, auth, edge cases

## Task Commits

Each task was committed atomically:

1. **Tasks 11.1 + 11.2 + 11.3: Endpoint + wiring + tests** - `12ddcbf` (feat)

## Files Created/Modified
- `src/pages/api/pool/confirm-resale.ts` - Main endpoint: DAS snapshot, payout calc, distribution creation, state transition
- `src/pages/api/pool/confirm-resale.test.ts` - 16 unit tests covering all paths
- `src/pages/api/escrow/confirm-delivery.ts` - triggerPoolDistribution rewired to call confirm-resale endpoint

## Decisions Made
- Route follows `/api/pool/` singular convention with `poolId` as query param (plan specified `/api/pools/[id]/` which contradicts project convention)
- Used `payoutWallet` and `shares` fields to match actual PoolDistribution schema (plan used `wallet` and `tokenBalance` which don't exist in the model)
- Pre-save hook auto-computes `totalDistributedUSD` and `claimDeadlineAt`, so endpoint provides `salePriceUSD` and `snapshotTakenAt` as inputs
- triggerPoolDistribution uses HTTP call with CRON_SECRET auth (cleaner separation vs direct import)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Route convention mismatch**
- **Found during:** Task 11.1
- **Issue:** Plan specified `src/pages/api/pools/[id]/confirm-resale.ts` but project convention is `/api/pool/` (singular) with poolId as query param
- **Fix:** Created at `src/pages/api/pool/confirm-resale.ts` matching confirm-custody, graduate, list-resale patterns
- **Files modified:** src/pages/api/pool/confirm-resale.ts
- **Verification:** Matches all other pool endpoints in the codebase

**2. [Rule 1 - Bug] Schema field name mismatch**
- **Found during:** Task 11.1
- **Issue:** Plan used `poolId` field but PoolDistribution model uses `pool` (ObjectId ref). Plan used `wallet`/`tokenBalance` in distributions sub-doc but schema has `payoutWallet`/`shares`.
- **Fix:** Used correct field names from actual PoolDistribution schema
- **Files modified:** src/pages/api/pool/confirm-resale.ts
- **Verification:** Tests pass with correct field mapping

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PoolDistribution records now created automatically on pool-backed resale completion
- Ready for 11-12 (holder claim endpoint) which reads these distribution records
- Ready for 11-13/11-14 (crons) which process pending/expired distributions

## Self-Check: PASSED

- [x] `src/pages/api/pool/confirm-resale.ts` exists
- [x] `src/pages/api/pool/confirm-resale.test.ts` exists
- [x] Commit `12ddcbf` exists in git log
- [x] 16/16 tests pass
- [x] TypeScript typecheck passes (no new errors)

---
*Phase: 11-pool-fee-funded-rewire*
*Completed: 2026-04-12*
