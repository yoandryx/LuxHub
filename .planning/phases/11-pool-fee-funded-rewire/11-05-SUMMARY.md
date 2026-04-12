---
phase: 11-pool-fee-funded-rewire
plan: "05"
subsystem: api
tags: [bags-api, squads, solana, fee-claim, treasury, mongodb]

requires:
  - phase: 11-pool-fee-funded-rewire
    provides: Pool schema with accumulatedFeesLamports, feeClaimInFlight fields (11-01), solPriceService (11-03), poolStateTransition (11-04), TREASURY_POOLS vault type (11-00)
provides:
  - poolFeeClaimService with claimPoolFees(), getPendingFees(), reconcilePoolFeeCounters()
  - poolFeeClaimSquadsHelper with buildVaultProposalFromBagsTxs()
  - parseWithdrawalAmount() for on-chain balance delta extraction
affects: [11-06-claim-cron, 11-07-bridge-service, 11-08-graduation-trigger, 11-15-helius-webhook]

tech-stack:
  added: []
  patterns: [CAS lock for concurrency control, Squads vault proposal wrapping for Bags txs, on-chain pre/post balance delta parsing]

key-files:
  created:
    - src/lib/services/poolFeeClaimService.ts
    - src/lib/services/poolFeeClaimSquadsHelper.ts
    - src/lib/services/poolFeeClaimService.test.ts
  modified: []

key-decisions:
  - "Single-writer rule enforced: only poolFeeClaimService writes Pool.accumulatedFeesLamports via $inc"
  - "Withdrawal amount parsed from on-chain pre/post balances (RPC-confirmed delta), never from Bags quote"
  - "Squads helper extracted to separate module for clean test mocking and separation of concerns"

patterns-established:
  - "CAS lock pattern: findOneAndUpdate with $ne guard + try/finally unlock for concurrency"
  - "Bags tx wrapping: decode base64 legacy tx, remap signer to vault PDA, wrap in Squads proposal"

requirements-completed: []

duration: 333s
completed: 2026-04-12
---

# Phase 11 Plan 05: Pool Fee Claim Service Summary

**Authoritative fee accumulation engine wrapping Bags claim-txs/v3 in Squads vault proposals with CAS concurrency lock, on-chain withdrawal parsing, and TreasuryDeposit audit trail**

## Performance

- **Duration:** 333s (~5.5 min)
- **Started:** 2026-04-12T15:46:58Z
- **Completed:** 2026-04-12T15:52:31Z
- **Tasks:** 5 (5.1-5.5 implemented together as single service + tests)
- **Files created:** 3

## Accomplishments
- Built `poolFeeClaimService.ts` as the single authoritative writer of `Pool.accumulatedFeesLamports`
- `claimPoolFees()`: full orchestration with CAS lock, Bags API call, Squads vault proposal, withdrawal parsing, atomic `$inc`, and TreasuryDeposit audit record
- `getPendingFees()`: read-only Bags fee check with graceful fallback
- `reconcilePoolFeeCounters()`: drift detection comparing primary counter vs audit sum (1% or 0.1 SOL threshold)
- `poolFeeClaimSquadsHelper.ts`: wraps Bags base64 txs into Squads vault proposals at index 1 (TREASURY_POOLS)
- 15 unit tests covering happy path, concurrency, invalid state, nothing to claim, proposal failure, withdrawal parsing, and drift detection

## Task Commits

1. **Tasks 5.1-5.5: Public API, claimPoolFees, getPendingFees, reconcile, tests** - `c36efdb` (feat)

## Files Created/Modified
- `src/lib/services/poolFeeClaimService.ts` - Authoritative fee claim orchestrator (claimPoolFees, getPendingFees, reconcilePoolFeeCounters, parseWithdrawalAmount)
- `src/lib/services/poolFeeClaimSquadsHelper.ts` - Squads vault proposal builder for Bags claim txs
- `src/lib/services/poolFeeClaimService.test.ts` - 15 unit tests

## Decisions Made
- Extracted Squads helper to separate module (`poolFeeClaimSquadsHelper.ts`) for clean mocking in tests and separation of concerns
- `getPendingFees()` returns `claimableLamports: 1` as boolean indicator since actual amount is only known after on-chain execution
- Used `any[]` type for `.lean()` result in reconciliation to avoid complex Mongoose type gymnastics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pool model uses named export, not default**
- **Found during:** TypeScript check
- **Issue:** Plan used `import Pool from '@/lib/models/Pool'` but model exports as `export const Pool`
- **Fix:** Changed to `import { Pool } from '@/lib/models/Pool'`
- **Files modified:** src/lib/services/poolFeeClaimService.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** c36efdb

**2. [Rule 3 - Blocking] VersionedTransaction message has staticAccountKeys not getAccountKeys().staticKeys**
- **Found during:** TypeScript check
- **Issue:** `getAccountKeys()` returns `MessageAccountKeys` which doesn't expose `.staticKeys` as a direct property
- **Fix:** Used `msg.staticAccountKeys || msg.accountKeys` pattern (cast to any for version compat)
- **Files modified:** src/lib/services/poolFeeClaimService.ts
- **Verification:** `npx tsc --noEmit` passes, parseWithdrawalAmount tests pass
- **Committed in:** c36efdb

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were import/type compatibility issues. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Service ready for consumption by 11-06 (claim cron) and 11-07 (bridge service)
- Single-writer rule must be maintained: Helius webhook (11-15) must only write to TreasuryDeposit, never to Pool.accumulatedFeesLamports

---
*Phase: 11-pool-fee-funded-rewire*
*Completed: 2026-04-12*
