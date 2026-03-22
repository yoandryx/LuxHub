---
phase: quick-260322-nmo
plan: 01
subsystem: api
tags: [notifications, offers, escrow, vendor]

requires:
  - phase: quick-260322-my2
    provides: offer button and buyer-respond endpoint working

provides:
  - Vendor-specific offer notification helpers (notifyCounterAcceptedByBuyer, notifyCounterRejectedByBuyer, notifyBuyerCounteredVendor)
  - Correct notification wiring in buyer-respond.ts for all 4 buyer actions

affects: [vendor-dashboard, offer-lifecycle]

tech-stack:
  added: []
  patterns: [vendor-specific notification helpers separate from buyer-centric helpers]

key-files:
  created: []
  modified:
    - src/lib/services/notificationService.ts
    - src/pages/api/offers/buyer-respond.ts

key-decisions:
  - "Added new vendor-specific helpers rather than modifying existing buyer-centric ones (respond.ts uses them correctly)"
  - "All vendor notification actionUrls point to /vendor/vendorDashboard?tab=offers consistently"

patterns-established:
  - "Vendor notification helpers: notifyCounterAcceptedByBuyer, notifyCounterRejectedByBuyer, notifyBuyerCounteredVendor"
  - "Buyer-centric helpers (notifyOfferAccepted etc.) only used in respond.ts for buyer notifications"

requirements-completed: [OFFER-NOTIF-01, OFFER-NOTIF-02]

duration: 2min
completed: 2026-03-22
---

# Quick 260322-nmo: Audit & Fix Offer Notification Lifecycle Summary

**Fixed vendor-receiving-buyer-centric-notifications bug: 3 new vendor-specific helpers + rewired buyer-respond.ts for correct offer lifecycle notifications**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T21:05:38Z
- **Completed:** 2026-03-22T21:07:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added 3 vendor-specific notification helpers to notificationService.ts with correct vendor-centric message text
- Rewired all 3 buggy notification calls in buyer-respond.ts (accept_counter, reject_counter, counter)
- Fixed reject_counter actionUrl from non-existent `/vendor/offers` to `/vendor/vendorDashboard?tab=offers`
- Verified all 8 offer lifecycle notification paths now send correct messages to correct wallets

## Task Commits

Each task was committed atomically:

1. **Task 1: Add vendor-specific offer notification helpers** - `88159ea` (feat)
2. **Task 2: Wire correct notification helpers in buyer-respond.ts** - `cebf1fb` (fix)

## Files Created/Modified
- `src/lib/services/notificationService.ts` - Added notifyCounterAcceptedByBuyer, notifyCounterRejectedByBuyer, notifyBuyerCounteredVendor
- `src/pages/api/offers/buyer-respond.ts` - Replaced wrong notification calls with new vendor-specific helpers

## Decisions Made
- Added new vendor-specific helpers rather than modifying existing buyer-centric ones, since respond.ts correctly uses the existing helpers for buyer notifications
- All vendor notification actionUrls consistently point to /vendor/vendorDashboard?tab=offers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Offer Lifecycle Notification Audit (All 8 Paths)

| Action | File | Helper | Recipient | Message | Status |
|--------|------|--------|-----------|---------|--------|
| Buyer creates offer | create.ts | notifyOfferReceived | Vendor | "New Offer Received!" | Already correct |
| Vendor accepts | respond.ts | notifyOfferAccepted | Buyer | "Your Offer Was Accepted!" | Already correct |
| Vendor rejects | respond.ts | notifyOfferRejected | Buyer | "Offer Not Accepted" | Already correct |
| Vendor counters | respond.ts | notifyOfferCountered | Buyer | "Counter Offer Received" | Already correct |
| Buyer accepts counter | buyer-respond.ts | notifyCounterAcceptedByBuyer | Vendor | "Counter-Offer Accepted!" | FIXED |
| Buyer rejects counter | buyer-respond.ts | notifyCounterRejectedByBuyer | Vendor | "Counter-Offer Rejected" | FIXED |
| Buyer counters back | buyer-respond.ts | notifyBuyerCounteredVendor | Vendor | "Buyer Counter-Offer Received" | FIXED |
| Buyer withdraws | buyer-respond.ts | notifyUser (direct) | Vendor | "Offer Withdrawn" | Already correct |

---
*Phase: quick-260322-nmo*
*Completed: 2026-03-22*
