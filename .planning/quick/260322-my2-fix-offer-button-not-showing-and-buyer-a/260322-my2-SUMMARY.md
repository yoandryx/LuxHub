---
phase: quick-260322-my2
plan: 01
subsystem: marketplace
tags: [mongoose, escrow, pre-save-hook, offers, nft-detail]

requires:
  - phase: 04-vendor-demo-readiness
    provides: NFT detail page and escrow listing flow
provides:
  - Fixed Escrow pre-save hook preserving explicit acceptingOffers values
  - NFT detail page reads acceptingOffers from DB instead of hardcoding
  - DB migration for 3 existing escrows
affects: [marketplace, escrow, vendor-mint]

tech-stack:
  added: []
  patterns: [isModified guard pattern for Mongoose pre-save hooks]

key-files:
  created: []
  modified:
    - src/lib/models/Escrow.ts
    - src/pages/api/admin/mint-requests/confirm-mint.ts
    - src/pages/nft/[mint].tsx

key-decisions:
  - "Guard acceptingOffers override with isModified check so explicit values survive pre-save"

patterns-established:
  - "Mongoose pre-save: when auto-deriving field B from field A, guard with isModified(B) to let explicit values win"

requirements-completed: [FIX-OFFER-BTN, FIX-EXISTING-ESCROWS]

duration: 3min
completed: 2026-03-22
---

# Quick Task 260322-my2: Fix Offer Button Not Showing Summary

**Fixed Escrow pre-save hook that silently overrode acceptingOffers=true, and wired NFT detail page to read acceptingOffers from DB**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T20:33:52Z
- **Completed:** 2026-03-22T20:36:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Fixed Mongoose pre-save hook in Escrow.ts that was overriding `acceptingOffers: true` to `false` when `saleMode` was `fixed_price`
- Updated NFT detail page to read `acceptingOffers` from escrow API data instead of hardcoding `!isOwnListing`
- Migrated 3 existing escrows in production DB to `acceptingOffers: true`

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Escrow pre-save hook and patch existing DB records** - `1a8456e` (fix)
2. **Task 2: Fix NFT detail page to read acceptingOffers from escrow data** - `710304a` (fix)

## Files Created/Modified
- `src/lib/models/Escrow.ts` - Added `!this.isModified('acceptingOffers')` guard to pre-save hook
- `src/pages/api/admin/mint-requests/confirm-mint.ts` - Updated comment for status auto-promotion clarity
- `src/pages/nft/[mint].tsx` - Added acceptingOffers state from escrow API, used in NftDetailCard prop

## Decisions Made
- Guard acceptingOffers override with `isModified('acceptingOffers')` so explicit values survive pre-save -- this preserves backward compatibility where changing only saleMode still auto-derives acceptingOffers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Offer buttons now visible on marketplace cards and NFT detail pages for all listed NFTs
- Future escrows created via confirm-mint will correctly persist acceptingOffers=true
