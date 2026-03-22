---
phase: quick-260322-nwk
plan: 01
subsystem: notifications
tags: [email, offers, notifications, ux, badge]
dependency_graph:
  requires: [notificationService, offers-create, NotificationBell]
  provides: [rich-offer-emails, purple-badge-pulse, fixed-actionUrls]
  affects: [vendor-dashboard, buyer-dashboard, navbar]
tech_stack:
  added: []
  patterns: [offerEmailTemplate, rich-metadata-forwarding]
key_files:
  created: []
  modified:
    - src/lib/services/notificationService.ts
    - src/pages/api/offers/create.ts
    - src/styles/NotificationBell.module.css
decisions:
  - Replaced offer email entries with offerEmailTemplate instead of adding separate sendOfferEmail to avoid double emails
  - Extended NotificationMetadata interface with offer-specific fields rather than creating a parallel type
  - Forward rich email metadata through existing notifyUser -> sendEmail pipeline
metrics:
  duration: 6min
  completed: "2026-03-22T21:23:34Z"
---

# Quick Task 260322-nwk: Offer Notification UX — Emails + Navbar Badge Summary

Rich chrome-glass offer email template with watch image, amount display, wallet info, and purple CTA button; plus purple pulsing badge on NotificationBell.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add rich offer email template + fix actionUrls | eae7426 | offerEmailTemplate function, 4 offer email entries switched, actionUrl fixes for rejected/countered |
| 2 | Pass imageUrl + purple pulse badge | 55e6b68 | IPFS-to-gateway URL resolution in create.ts, purple gradient badge, badgePulse animation |

## Changes Made

### notificationService.ts
- **New function**: `offerEmailTemplate()` generates chrome-glass HTML email with dark background (#050507), purple gradient header, asset image with rounded corners, event badge (NEW OFFER, OFFER ACCEPTED, etc.), large purple amount display, truncated wallet info, descriptive message, and purple CTA button
- **Extended `NotificationMetadata`** with `imageUrl`, `amountLabel`, `counterpartyWallet`, `counterpartyLabel`, `ctaText`, `eventBadge` fields
- **Extended `EmailTemplateParams`** with same offer-specific fields
- **Updated `notifyUser`** to forward all rich email fields from metadata into `sendEmail`
- **Switched 4 email template entries** (`offer_received`, `offer_accepted`, `offer_rejected`, `offer_countered`) from `baseEmailTemplate` to `offerEmailTemplate`
- **Added `imageUrl?` param** to `notifyOfferReceived`, `notifyOfferAccepted`, `notifyOfferRejected`, `notifyOfferCountered`, `notifyCounterAcceptedByBuyer`
- **Fixed actionUrls**:
  - `notifyOfferRejected`: `/marketplace` -> `/user/userDashboard?tab=offers`
  - `notifyOfferCountered`: `/orders` -> `/user/userDashboard?tab=offers`
- **Verified existing correct actionUrls**: `notifyCounterAcceptedByBuyer`, `notifyCounterRejectedByBuyer`, `notifyBuyerCounteredVendor` all correctly point to `/vendor/vendorDashboard?tab=offers`

### offers/create.ts
- Resolves asset image URL from `asset.imageIpfsUrls[0]`, `asset.images[0]`, or `escrow.imageUrl`
- Converts bare IPFS hashes to full gateway URLs using `NEXT_PUBLIC_GATEWAY_URL`
- Passes `imageUrl` to `notifyOfferReceived` for rich email rendering

### NotificationBell.module.css
- Changed badge gradient from red (`#ff4444/#cc0000`) to purple (`#c8a1ff/#9b6dff`)
- Changed box-shadow from red glow to purple glow
- Added `@keyframes badgePulse` animation: 2s ease-in-out infinite purple glow pulse
- Applied animation to both desktop and mobile `.badge` selectors

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript: 0 new errors (6 pre-existing from node_modules type conflicts)
- All offer notification helpers pass rich email metadata through existing pipeline
- Single email per notification (no double-send) via template replacement approach
