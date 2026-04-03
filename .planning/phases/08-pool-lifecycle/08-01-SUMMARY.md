---
phase: 08-pool-lifecycle
plan: 01
subsystem: api
tags: [solana, spl-token, bags, cron, mongodb, distribution, pools]

# Dependency graph
requires:
  - phase: 07-mainnet-deployment
    provides: "On-chain escrow and minting infrastructure"
provides:
  - "Claimable distribution endpoint (pull model) for pool token holders"
  - "On-chain SPL token burn in finalizePool (D-11)"
  - "Bags graduation reconciliation cron (INFRA-03)"
  - "Listing removal on pool creation (D-03)"
  - "Compound MongoDB indexes for pool hot queries"
affects: [08-pool-lifecycle, pool-detail-page, pool-management-dashboard]

# Tech tracking
tech-stack:
  added: ["@solana/spl-token (dynamic import for burn)"]
  patterns: ["Pull/claim distribution model", "Vercel cron reconciliation pattern"]

key-files:
  created:
    - src/pages/api/pool/claim-distribution.ts
    - src/pages/api/cron/reconcile-pools.ts
  modified:
    - src/pages/api/pool/create.ts
    - src/lib/models/Pool.ts
    - vercel.json

key-decisions:
  - "Pull/claim model over push model for distributions — users claim their own share, reducing admin overhead"
  - "On-chain SPL token burn with burn_pending fallback — if burn fails, admin can retry separately"
  - "90-day claim window with admin sweep for unclaimed funds"

patterns-established:
  - "Claim distribution: POST (check/execute), PATCH (confirm TX), admin sweep pattern"
  - "Cron reconciliation: check external API state vs MongoDB, sync mismatches"

requirements-completed: [POOL-05, POOL-03, INFRA-02, INFRA-03]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 08 Plan 01: Pool Lifecycle Backend APIs Summary

**Claimable distribution endpoint with on-chain SPL burn, Bags graduation reconciliation cron, and listing removal on pool creation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T02:12:12Z
- **Completed:** 2026-04-03T02:15:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Claim distribution API with POST (check/execute claim), PATCH (confirm TX + auto-finalize), admin sweep-unclaimed, and retry-burn actions
- finalizePool() executes on-chain SPL token burn per D-11 with burn_pending fallback and Sentry logging
- Bags graduation reconciliation cron runs every 6 hours, detects missed graduations, triggers Squad DAO creation
- Pool creation now sets pooled=true and poolId on the source asset (D-03)
- 4 new compound indexes on Pool collection for hot queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Claim distribution API + listing removal + Pool model indexes** - `ba61cbb` (feat)
2. **Task 2: Bags graduation reconciliation cron job** - `d32a69e` (feat)

## Files Created/Modified
- `src/pages/api/pool/claim-distribution.ts` - Claimable distribution endpoint with POST/PATCH + admin actions
- `src/pages/api/cron/reconcile-pools.ts` - Vercel cron for Bags graduation reconciliation
- `src/pages/api/pool/create.ts` - Added pooled=true and poolId on asset (D-03)
- `src/lib/models/Pool.ts` - Claim window fields + 4 compound indexes
- `vercel.json` - Added 6-hour reconciliation cron schedule

## Decisions Made
- Pull/claim model chosen over push model: users claim their own share, reducing admin overhead and enabling self-service UX
- On-chain SPL token burn with burn_pending fallback: if admin keypair or mint authority is unavailable, pool still closes and admin can retry
- 90-day default claim window: unclaimed funds swept to pools treasury after expiration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. CRON_SECRET environment variable must already be set for existing enforce-timeouts cron.

## Known Stubs
None - all endpoints are fully wired to existing services (distributionCalc, dasApi, adminConfig, treasuryConfig).

## Next Phase Readiness
- Claim distribution endpoint ready for pool detail page UX (Plan 02)
- Reconciliation cron ready for production deployment
- Pool model indexes ready for dashboard queries (Plan 03)

---
*Phase: 08-pool-lifecycle*
*Completed: 2026-04-03*
