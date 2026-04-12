---
phase: 11-pool-fee-funded-rewire
plan: "06"
subsystem: infra
tags: [vercel-cron, bags-api, pool-fees, graduation, solana]

requires:
  - phase: 11-05
    provides: poolFeeClaimService (claimPoolFees, getPendingFees)
  - phase: 11-03
    provides: solPriceService (lamportsToUsd)
provides:
  - Hourly Vercel Cron endpoint for automatic pool fee claiming
  - Three-trigger claim decision logic (threshold, near-graduation, stale)
  - Graduation trigger stub (wired in 11-08)
affects: [11-08, 11-14]

tech-stack:
  added: []
  patterns: [vercel-cron-auth, per-pool-error-isolation, claim-decision-policy]

key-files:
  created:
    - src/pages/api/cron/claim-pool-fees.ts
    - src/pages/api/cron/claim-pool-fees.test.ts
  modified:
    - vercel.json

key-decisions:
  - "Graduation trigger stubbed as no-op console.log until 11-08 implements triggerGraduationCheck"
  - "Auth follows reconcile-pools pattern: Bearer CRON_SECRET, production-only enforcement"
  - "PoolDoc interface typed inline to avoid lean() unknown type issues"

patterns-established:
  - "Cron claim decision: threshold OR near-graduation OR stale (24h)"

requirements-completed: [POOL-11-01, POOL-11-03]

duration: 237s
completed: 2026-04-12
---

# Phase 11 Plan 06: Fee Claim Cron + Graduation Trigger Summary

**Hourly Vercel Cron endpoint that drives the fee accumulation flywheel -- iterates eligible pools, decides claim timing via threshold/graduation/stale triggers, and stubs graduation check for 11-08**

## Performance

- **Duration:** 237s (~4 min)
- **Started:** 2026-04-12T15:15:21Z
- **Completed:** 2026-04-12T15:19:18Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Hourly cron at `/api/cron/claim-pool-fees` with CRON_SECRET auth following existing patterns
- Three-trigger claim decision: 0.5 SOL threshold, 95% of graduation target (near-graduation), or 24h stale fallback
- Per-pool error isolation so one failing pool does not break the entire cron run
- 13 unit tests covering auth, threshold gating, near-graduation, stale claims, error isolation, multi-pool processing

## Task Commits

Each task was committed atomically:

1. **Tasks 6.1 + 6.2 + 6.3: Cron route + vercel.json + tests** - `5a0dc31` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `src/pages/api/cron/claim-pool-fees.ts` - Hourly cron endpoint with claim decision logic
- `src/pages/api/cron/claim-pool-fees.test.ts` - 13 unit tests for auth, thresholds, isolation
- `vercel.json` - Added hourly cron schedule entry for claim-pool-fees

## Decisions Made
- Graduation trigger stubbed as no-op `console.log` until 11-08 implements `triggerGraduationCheck` -- avoids import errors from non-existent module
- Auth follows `reconcile-pools.ts` pattern: Bearer CRON_SECRET in Authorization header, production-only enforcement (dev mode bypasses)
- Added explicit `PoolDoc` interface to type the `.lean()` result, avoiding `unknown` type errors without depending on Mongoose generics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors for lean() result and test env**
- **Found during:** Task 6.1 (cron route)
- **Issue:** `Pool.find().lean()` returns `unknown` type causing TS2349/TS18046 errors on `pool._id`; test `process.env.NODE_ENV` assignment is read-only
- **Fix:** Added `PoolDoc` interface with explicit typing, cast `.lean()` result; used `(process.env as any).NODE_ENV` in test; typed `lastFeeClaimAt` as `Date | null`
- **Files modified:** `src/pages/api/cron/claim-pool-fees.ts`, `src/pages/api/cron/claim-pool-fees.test.ts`
- **Verification:** `npx tsc --noEmit` returns zero errors for both files
- **Committed in:** 5a0dc31

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type safety fix, no scope creep.

## Issues Encountered
None

## User Setup Required
None - CRON_SECRET should already be configured in Vercel from the existing enforce-timeouts cron.

## Next Phase Readiness
- Cron is ready to run but graduation trigger is a no-op stub
- Plan 11-08 must export `triggerGraduationCheck` and uncomment the import in `maybeTriggerGraduation()`
- Plan 11-14 (drift-check cron) can reuse this file's auth and error isolation patterns

---
## Self-Check: PASSED

All files exist, commit hash verified.

---
*Phase: 11-pool-fee-funded-rewire*
*Completed: 2026-04-12*
