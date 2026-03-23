---
phase: quick-260322-rpg
plan: 01
subsystem: api, ui
tags: [offers, counter-offers, escrow, notifications, actionUrl]

requires:
  - phase: quick-260322-nmo
    provides: offer lifecycle notification helpers
provides:
  - "Counter-offer amount correctly resolved in vendor accept (escrow, transaction, notification)"
  - "OfferCard displays accepted/latest counter amount with original offer as secondary"
  - "Unified /order/{escrowId} actionUrls across all offer and order notifications"
affects: [offer-flow, order-flow, notification-emails]

tech-stack:
  added: []
  patterns: ["latestCounter resolution before escrow update in accept cases"]

key-files:
  created: []
  modified:
    - src/pages/api/offers/respond.ts
    - src/components/marketplace/OfferCard.tsx
    - src/lib/services/notificationService.ts
    - src/pages/api/offers/buyer-respond.ts

key-decisions:
  - "latestCounter resolution pattern matches buyer-respond.ts accept_counter for consistency"
  - "notifyOfferAccepted actionUrl kept as /marketplace?pay= deep-link (correct for payment CTA)"
  - "notifyOfferAutoRejected kept pointing to /marketplace (no escrowId available)"

patterns-established:
  - "Counter-offer amount resolution: always check counterOffers array before using original offer amount"
  - "Notification actionUrls use /order/{escrowId} for unified order experience"

requirements-completed: [BUG-counter-amount, FEAT-order-urls]

duration: 4min
completed: 2026-03-22
---

# Quick Task 260322-rpg: Fix Counter-Offer Amount Bug Summary

**Fixed financial data integrity bug where vendor accept stored original offer amount instead of negotiated counter amount, and unified all notification actionUrls to /order/{escrowId}**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T23:59:53Z
- **Completed:** 2026-03-23T00:03:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Vendor accept now resolves latest counter-offer amount before updating escrow, transaction, and notification
- OfferCard shows "Accepted Amount" or "Latest Counter" when counter-offers exist, with original offer as secondary
- 14 notification helpers updated from dashboard tab URLs to /order/{escrowId} for unified order experience
- buyer-respond.ts withdraw case also updated

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix counter-offer amount bug in vendor accept + OfferCard display** - `91d1178` (fix)
2. **Task 2: Update notification actionUrls to /order/{escrowId}** - `621f858` (feat)

## Files Created/Modified
- `src/pages/api/offers/respond.ts` - Added latestCounter resolution in vendor accept case
- `src/components/marketplace/OfferCard.tsx` - Added displayAmount useMemo with counter-offer awareness
- `src/lib/services/notificationService.ts` - Updated 14 notification actionUrls to /order/{escrowId}
- `src/pages/api/offers/buyer-respond.ts` - Updated withdraw notification URL

## Decisions Made
- Matched latestCounter resolution pattern from buyer-respond.ts accept_counter for consistency
- Preserved notifyOfferAccepted /marketplace?pay= deep-link (correct for payment CTA)
- Preserved notifyOfferAutoRejected /marketplace link (no escrowId available)
- Preserved admin shipment proof /admin/shipments link (admin-specific)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Counter-offer financial integrity is now correct across the full accept flow
- All notification links provide direct deep-links to order pages

---
*Phase: quick-260322-rpg*
*Completed: 2026-03-22*
