---
phase: 07-on-chain-flow-validation
plan: 01
subsystem: infra
tags: [squads, solana, retry, priority-fees, multisig, env-config]

requires:
  - phase: 06-mainnet-deployment-production-ops
    provides: "priorityFees.ts with getPriorityFeeMicroLamports, Squads integration endpoints"
provides:
  - "getSquadsAutoApprove() env-var-driven toggle for Squads proposal auto-approval"
  - "sendWithRetry() with 4-attempt escalating priority fees for transaction resilience"
  - "getPriorityFeeWithEscalation() and RETRY_MULTIPLIERS constants"
  - "All call sites use env-driven toggle (zero hardcoded autoApprove: true)"
affects: [07-on-chain-flow-validation, 08-pools-mainnet]

tech-stack:
  added: []
  patterns: ["env-var-driven feature toggle for mainnet safety", "escalating retry with priority fee multipliers"]

key-files:
  created:
    - src/lib/config/squadsConfig.ts
    - src/lib/solana/retryTransaction.ts
    - tests/lib/squadsAutoApprove.test.ts
    - tests/lib/retryTransaction.test.ts
  modified:
    - src/lib/solana/priorityFees.ts
    - src/lib/services/squadsTransferService.ts
    - src/pages/api/escrow/confirm-delivery.ts
    - src/pages/api/escrow/create-with-mint.ts
    - src/pages/api/escrow/refund.ts
    - src/pages/api/escrow/verify-shipment.ts
    - src/pages/api/pool/pay-vendor.ts
    - src/pages/api/pool/refund.ts
    - src/pages/api/pool/distribute.ts
    - src/pages/adminDashboard.tsx
    - .env.example

key-decisions:
  - "SQUADS_AUTO_APPROVE must be exactly 'true' to enable; all other values default to false (safe for mainnet)"
  - "adminDashboard.tsx (client-side) uses hardcoded false default since process.env is server-only; server handles toggle"
  - "Retry multipliers [1, 1.5, 2, 3] provide gradual escalation without overpaying on congestion"

patterns-established:
  - "Env-var toggle pattern: getSquadsAutoApprove() returns boolean from process.env with safe default"
  - "Retry pattern: sendWithRetry wraps transaction submission with fresh blockhash + escalating priority fees"

requirements-completed: [TX-03, TX-05]

duration: 5min
completed: 2026-03-27
---

# Phase 07 Plan 01: Squads Auto-Approve Toggle & Transaction Retry Summary

**Env-var-driven Squads auto-approve toggle replacing 10 hardcoded `true` values, plus sendWithRetry utility with 4-attempt escalating priority fees [1x, 1.5x, 2x, 3x]**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T17:12:29Z
- **Completed:** 2026-03-27T17:17:37Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Created getSquadsAutoApprove() centralized toggle that reads SQUADS_AUTO_APPROVE env var (default false for mainnet safety)
- Created sendWithRetry() with fresh blockhash per attempt and escalating priority fees via RETRY_MULTIPLIERS [1, 1.5, 2, 3]
- Replaced all 10 hardcoded autoApprove: true instances across 9 source files with env-var-driven toggle
- 14 passing unit tests covering both utilities
- Added SQUADS_AUTO_APPROVE=false to .env.example with production safety documentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create squadsConfig helper, retryTransaction utility, and unit tests** - `90d3fbd` (feat)
2. **Task 2: Replace all hardcoded autoApprove:true with env-var-driven toggle** - `ab257ca` (feat)

## Files Created/Modified
- `src/lib/config/squadsConfig.ts` - Centralized auto-approve toggle (getSquadsAutoApprove)
- `src/lib/solana/retryTransaction.ts` - sendWithRetry with escalating priority fees
- `src/lib/solana/priorityFees.ts` - Added RETRY_MULTIPLIERS and getPriorityFeeWithEscalation
- `tests/lib/squadsAutoApprove.test.ts` - 6 tests for env-var toggle behavior
- `tests/lib/retryTransaction.test.ts` - 8 tests for retry logic and fee escalation
- `src/lib/services/squadsTransferService.ts` - Default autoApprove now uses getSquadsAutoApprove()
- `src/pages/api/escrow/confirm-delivery.ts` - 2 autoApprove sites updated
- `src/pages/api/escrow/create-with-mint.ts` - Destructuring default updated
- `src/pages/api/escrow/refund.ts` - autoApprove site updated
- `src/pages/api/escrow/verify-shipment.ts` - autoApprove site updated
- `src/pages/api/pool/pay-vendor.ts` - autoApprove site updated
- `src/pages/api/pool/refund.ts` - autoApprove site updated
- `src/pages/api/pool/distribute.ts` - autoApprove site updated
- `src/pages/adminDashboard.tsx` - Client-side default changed to false
- `.env.example` - Added SQUADS_AUTO_APPROVE=false with documentation

## Decisions Made
- SQUADS_AUTO_APPROVE must be exactly 'true' to enable; all other values (undefined, 'false', 'yes', '1') default to false for mainnet safety
- adminDashboard.tsx is client-side so cannot use server-side getSquadsAutoApprove(); hardcoded to false as safe default (server endpoint handles the actual toggle)
- Retry multipliers [1, 1.5, 2, 3] chosen for gradual escalation: 4 attempts cover most congestion without overpaying

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run build` has a pre-existing failure due to missing `@aws-sdk/client-s3` dependency (unrelated to this plan's changes). All unit tests pass and TypeScript compilation of modified files succeeds.

## Known Stubs

None.

## User Setup Required

None - SQUADS_AUTO_APPROVE=false is already the safe default in .env.example. For devnet fast iteration, set to 'true'.

## Next Phase Readiness
- sendWithRetry utility ready for Squads proposal submission in Phase 07 Plan 02
- All Squads call sites now respect env-var toggle for mainnet deployment
- No blockers for next plan

## Self-Check: PASSED

All 5 created files verified on disk. Both commit hashes (90d3fbd, ab257ca) found in git log.

---
*Phase: 07-on-chain-flow-validation*
*Completed: 2026-03-27*
