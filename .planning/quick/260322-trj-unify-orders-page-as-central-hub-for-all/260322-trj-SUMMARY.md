---
phase: quick-260322-trj
plan: 01
subsystem: ui
tags: [react, orders, vendor, role-detection, offers]

requires:
  - phase: quick-260322-s2x
    provides: useEffectiveWallet deployed app-wide
provides:
  - Role-aware /orders page serving both buyers and vendors
  - Vendor offer management (accept/reject/counter) moved from vendorDashboard to /orders
  - vendorDashboard slimmed by ~430 lines, offers tab removed
affects: [vendorDashboard, orders, marketplace-offers]

tech-stack:
  added: []
  patterns:
    - "Role detection via /api/vendor/profile fetch on wallet connect"
    - "Buying/Selling toggle with auto-detection and manual override"
    - "URL query param ?tab=offers for deep linking to offers tab"

key-files:
  created: []
  modified:
    - src/pages/orders.tsx
    - src/styles/MyOrders.module.css
    - src/pages/vendor/vendorDashboard.tsx

key-decisions:
  - "Role detection uses /api/vendor/profile (200=vendor, else buyer) rather than checking offers API"
  - "Both buyer and vendor can toggle roles since users may be both"
  - "Vendor offer handlers re-implemented in orders.tsx (not shared module) to avoid coupling"
  - "Metric card shows 'View Offers' with external link icon instead of count to avoid extra API call"

patterns-established:
  - "Role toggle pattern: auto-detect then allow manual switch for dual-role users"

requirements-completed: [UNIFY-01, UNIFY-02, UNIFY-03]

duration: 11min
completed: 2026-03-23
---

# Quick Task 260322-trj: Unify Orders Page Summary

**Role-aware /orders hub with Buying/Selling toggle, vendor offer management (accept/reject/counter), and vendorDashboard slimmed by removing offers tab**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-23T01:31:46Z
- **Completed:** 2026-03-23T01:43:00Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

### Task 1: Make /orders page role-aware with vendor offer management
- Added role detection via `/api/vendor/profile` on wallet connect
- Added Buying/Selling segmented toggle with auto-detection
- URL query param `?tab=offers` support for deep linking
- Vendor offers tab: fetches from `/api/vendor/offers`, shows offer cards with accept/reject/counter
- Vendor orders tab: fetches from `/api/vendor/orders`, shows order cards with status badges
- Vendor counter-offer and reject modals (chrome glass design)
- Buyer behavior completely unchanged
- **Commit:** 8f08c3c

### Task 2: Remove offers tab from vendorDashboard, link to /orders
- Removed TabId 'offers' from type and tab validation
- Removed all offer state variables (15 state hooks)
- Removed fetchOffers, handleAcceptOffer, handleRejectOffer, handleCounterOffer, filteredOffers
- Removed offer filter tabs, offer cards, counter modal, reject modal
- Updated "Pending Offers" metric card to "View Offers" linking to /orders?tab=offers
- Updated "View Offers" quick action to router.push('/orders?tab=offers')
- Removed unused FiRefreshCw import, added FiExternalLink and useRouter
- File reduced from ~1766 to ~1334 lines (~430 lines removed)
- **Commit:** bd7206f

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript: `npx tsc --noEmit` passes (no errors in modified files)
- All pre-existing errors are in node_modules or unrelated test files
