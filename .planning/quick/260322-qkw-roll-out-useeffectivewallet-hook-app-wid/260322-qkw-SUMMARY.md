---
phase: quick-260322-qkw
plan: 01
subsystem: ui
tags: [privy, wallet-adapter, react-hooks, solana]

requires:
  - phase: 04-vendor-demo-readiness
    provides: useEffectiveWallet hook (created but only in vendor/onboard)
provides:
  - useEffectiveWallet deployed to all 12 pages/components that check wallet state
  - Privy embedded wallet users recognized app-wide
  - Bridged signTransaction for Privy (Transaction + VersionedTransaction)
affects: [all-wallet-dependent-pages, privy-integration]

tech-stack:
  added: []
  patterns:
    - "useEffectiveWallet for all publicKey/connected checks; keep useWallet only for getProgram() or sendTransaction"
    - "Generic signTransaction<T extends Transaction | VersionedTransaction> in hook"

key-files:
  created: []
  modified:
    - src/hooks/useEffectiveWallet.ts
    - src/pages/nft/[mint].tsx
    - src/pages/watchMarket.tsx
    - src/pages/user/userDashboard.tsx
    - src/pages/user/[wallet].tsx
    - src/pages/vendor/vendorDashboard.tsx
    - src/pages/settings.tsx
    - src/pages/notifications.tsx
    - src/components/marketplace/MakeOfferModal.tsx
    - src/components/marketplace/BuyModal.tsx
    - src/components/marketplace/OfferList.tsx
    - src/components/marketplace/BagsPoolTrading.tsx
    - src/components/marketplace/PoolDetail.tsx

key-decisions:
  - "useWallet retained in watchMarket (for Anchor getProgram), BuyModal (for getProgram), PoolDetail (for sendTransaction) alongside useEffectiveWallet"
  - "signTransaction generic typed to handle both Transaction and VersionedTransaction"
  - "PoolDetail manual Privy bridging fully replaced with hook - cleaner sendTx fallback"

patterns-established:
  - "Dual-import pattern: useWallet for Anchor/sendTransaction, useEffectiveWallet for UI checks"

requirements-completed: []

duration: 10min
completed: 2026-03-22
---

# Quick Task 260322-qkw: Roll Out useEffectiveWallet Hook App-Wide Summary

**Unified wallet detection for Privy embedded wallets across all 12 pages/components with bridged signTransaction supporting both Transaction and VersionedTransaction**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-22T23:12:58Z
- **Completed:** 2026-03-22T23:23:30Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- All 12 pages and components now use useEffectiveWallet for publicKey/connected detection
- Privy embedded wallet users are recognized on every page (previously only vendor/onboard worked)
- useEffectiveWallet.ts upgraded with bridged signTransaction that handles both Transaction and VersionedTransaction via generic type
- PoolDetail.tsx manual Privy bridging (usePrivy, useWallets, inline publicKey/signTransaction fallback) fully replaced with hook
- notifications.tsx manual Privy bridging (activePublicKey, isConnected inline computation) fully replaced with hook

## Task Commits

1. **Task 1: Migrate pages to useEffectiveWallet** - `7b8f709` (feat)
2. **Task 2: Migrate marketplace components to useEffectiveWallet** - `872e8ac` (feat)

## Files Created/Modified
- `src/hooks/useEffectiveWallet.ts` - Added bridged signTransaction with generic type for Transaction + VersionedTransaction
- `src/pages/nft/[mint].tsx` - useWallet replaced with useEffectiveWallet
- `src/pages/watchMarket.tsx` - Dual import: useWallet for Anchor, useEffectiveWallet for UI checks
- `src/pages/user/userDashboard.tsx` - useWallet replaced with useEffectiveWallet
- `src/pages/user/[wallet].tsx` - useWallet replaced with useEffectiveWallet (connectedPublicKey alias)
- `src/pages/vendor/vendorDashboard.tsx` - useWallet replaced with useEffectiveWallet
- `src/pages/settings.tsx` - useWallet replaced with useEffectiveWallet
- `src/pages/notifications.tsx` - Manual Privy bridging removed, replaced with useEffectiveWallet
- `src/components/marketplace/MakeOfferModal.tsx` - useWallet replaced with useEffectiveWallet
- `src/components/marketplace/BuyModal.tsx` - Dual import: useWallet for getProgram, useEffectiveWallet for publicKey/connected/signTransaction
- `src/components/marketplace/OfferList.tsx` - useWallet replaced with useEffectiveWallet
- `src/components/marketplace/BagsPoolTrading.tsx` - useWallet replaced with useEffectiveWallet
- `src/components/marketplace/PoolDetail.tsx` - Manual Privy bridging fully removed, replaced with useEffectiveWallet

## Decisions Made
- useWallet retained alongside useEffectiveWallet in 3 files that need Anchor getProgram() or wallet adapter sendTransaction (watchMarket, BuyModal, PoolDetail)
- signTransaction typed as generic `<T extends Transaction | VersionedTransaction>` to support both legacy and versioned transactions (needed by BagsPoolTrading and PoolDetail for Bags API)
- PoolDetail sendTx fallback simplified: uses hook's bridged signTransaction instead of inline privyWallet access

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing legal language violations in staged files**
- **Found during:** Task 1 (commit pre-hook failure)
- **Issue:** Pre-commit lint-legal-language hook flagged prohibited terms (invest, profit, fractional ownership, ROI, investors) in staged files
- **Fix:** Replaced prohibited terms: invest->participate/join, profit->proceeds/gain, fractional ownership->tokenized access, ROI->estimated value, investors->participants, Investment->Contribution
- **Files modified:** src/pages/watchMarket.tsx, src/pages/user/[wallet].tsx, src/pages/notifications.tsx
- **Committed in:** 7b8f709 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking - pre-commit hook)
**Impact on plan:** Legal language fixes were pre-existing violations surfaced by staging the files. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in watchMarket.tsx (PublicKey | null assignability) and vendor/onboard.tsx (VersionedTransaction type) were not introduced by our changes and remain as-is

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All wallet-dependent pages now recognize Privy embedded wallets
- Further wallet operations (signAllTransactions, disconnect) could be added to the hook if needed
- Pre-existing TS errors in watchMarket.tsx handlePurchase could be addressed in a future cleanup task

---
*Phase: quick-260322-qkw*
*Completed: 2026-03-22*
