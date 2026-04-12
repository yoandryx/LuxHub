---
phase: 11-pool-fee-funded-rewire
plan: "09"
subsystem: api
tags: [solana, spl-token, escrow, custody, squads, admin-endpoint]

# Dependency graph
requires:
  - phase: 11-04
    provides: poolStateTransition service (graduated -> custody transition)
  - phase: 11-07
    provides: bridge-to-escrow delivers NFT to vault NFT ATA
provides:
  - POST /api/pool/confirm-custody endpoint (graduated -> custody state transition)
  - On-chain NFT custody verification via Squads vault ATA check
  - custodyConfirmedAt field on Pool schema
affects: [11-10, 11-11, 11-15]

# Tech tracking
tech-stack:
  added: []
  patterns: [on-chain ATA balance verification, NFT mint resolution via Asset/Escrow fallback]

key-files:
  created:
    - src/pages/api/pool/confirm-custody.ts
    - src/pages/api/pool/confirm-custody.test.ts
  modified:
    - src/lib/models/Pool.ts

key-decisions:
  - "Used /api/pool/confirm-custody (singular) matching existing pool route convention, not /api/pools/[id]/ as plan suggested"
  - "NFT mint resolved via Asset -> Escrow fallback chain since Pool model lacks nftMint field"
  - "Used named exports for Asset/Escrow imports matching their actual export patterns"

patterns-established:
  - "NFT mint resolution: pool -> Asset(selectedAssetId).nftMint -> Escrow(escrowId).nftMint"
  - "On-chain custody verification: getAccount on vault ATA, check amount > 0 and mint match"

requirements-completed: [POOL-11-07]

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 11, Plan 09: Confirm Custody Endpoint Summary

**Admin-gated endpoint that verifies NFT landed in Squads vault ATA on-chain and transitions pool state graduated -> custody**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T16:06:39Z
- **Completed:** 2026-04-12T16:10:17Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- POST /api/pool/confirm-custody endpoint with admin auth, on-chain NFT verification, and state transition
- NFT mint resolution fallback chain (pool -> Asset -> Escrow) handles missing nftMint on Pool model
- custodyConfirmedAt field added to Pool schema for audit trail
- 11 unit tests covering auth (401), method (405), state validation (400), on-chain checks (400), happy path (200), and race conditions (409)

## Task Commits

Each task was committed atomically:

1. **Tasks 9.1 + 9.2 + 9.3: Endpoint, schema, tests** - `034abaf` (feat)

## Files Created/Modified
- `src/pages/api/pool/confirm-custody.ts` - Admin endpoint: verifies NFT in Squads vault ATA, transitions graduated -> custody
- `src/pages/api/pool/confirm-custody.test.ts` - 11 unit tests covering all error and success paths
- `src/lib/models/Pool.ts` - Added custodyConfirmedAt field (Date, optional)

## Decisions Made
- Used `/api/pool/confirm-custody` (singular) with `poolId` query param, matching the existing convention from 11-07 and 11-08 (not `/api/pools/[id]/` as the plan template suggested)
- NFT mint resolved through Asset and Escrow model fallback chain since Pool model does not have an nftMint field directly
- Used `{ Asset }` and `{ Escrow }` named imports matching actual model export patterns (plan template used `.default` which does not exist on Escrow)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Route path convention mismatch**
- **Found during:** Task 9.1 (endpoint creation)
- **Issue:** Plan specified `src/pages/api/pools/[id]/confirm-custody.ts` but all existing pool endpoints use `/api/pool/` (singular) with poolId as query param
- **Fix:** Created at `src/pages/api/pool/confirm-custody.ts` following established convention
- **Files modified:** src/pages/api/pool/confirm-custody.ts
- **Verification:** Matches graduate.ts, bridge-to-escrow.ts patterns

**2. [Rule 1 - Bug] Plan used requireAdmin which does not exist**
- **Found during:** Task 9.1 (endpoint creation)
- **Issue:** Plan code used `requireAdmin` from walletAuth.ts which does not exist in the codebase
- **Fix:** Used `getAdminConfig().isAdmin()` pattern from adminConfig.ts (matching graduate.ts)
- **Files modified:** src/pages/api/pool/confirm-custody.ts
- **Verification:** Typecheck passes, tests verify auth behavior

**3. [Rule 1 - Bug] Plan used `.default` import for Escrow model**
- **Found during:** Task 9.1 (NFT mint resolution)
- **Issue:** Plan code used `(await import('@/lib/models/Escrow')).default` but Escrow only has named export
- **Fix:** Used `{ Escrow }` named import and `{ Asset }` for consistency, plus `as any` cast for lean() return type
- **Files modified:** src/pages/api/pool/confirm-custody.ts
- **Verification:** Typecheck passes with zero errors on this file

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and consistency with existing codebase conventions. No scope creep.

## Issues Encountered
None beyond the deviations noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Custody transition endpoint ready for integration with 11-10 (resale listing) and 11-11 (distribution snapshot)
- Pool state machine supports full graduated -> custody -> resale_listed flow

---
*Phase: 11-pool-fee-funded-rewire*
*Completed: 2026-04-12*
