---
phase: quick-260322-pz2
plan: 01
subsystem: ui
tags: [react, email, notification, chrome-glass, banner]

requires:
  - phase: none
    provides: none
provides:
  - Reusable EmailPromptBanner component for wallet-only users
  - Inline email nudge in MakeOfferModal and BuyModal shipping steps
affects: [notification-prefs, user-dashboard, vendor-dashboard, marketplace-modals]

tech-stack:
  added: []
  patterns: [localStorage dismissal keyed by wallet, fail-silent email check]

key-files:
  created:
    - src/components/common/EmailPromptBanner.tsx
    - src/styles/EmailPromptBanner.module.css
  modified:
    - src/pages/user/userDashboard.tsx
    - src/pages/vendor/vendorDashboard.tsx
    - src/components/marketplace/MakeOfferModal.tsx
    - src/components/marketplace/BuyModal.tsx
    - src/styles/MakeOfferModal.module.css
    - src/styles/BuyModal.module.css
    - src/lib/services/notificationService.ts

key-decisions:
  - "Banner uses localStorage keyed by wallet for dismissal persistence"
  - "Email check fails silently -- nudge hidden on error to avoid blocking flows"

patterns-established:
  - "EmailPromptBanner: reusable email collection pattern for any dashboard"

requirements-completed: [EMAIL-PROMPT]

duration: 9min
completed: 2026-03-22
---

# Quick Task 260322-pz2: Email Prompt Banner Summary

**Reusable chrome-glass EmailPromptBanner on both dashboards plus subtle email nudge in offer/buy modal shipping steps**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-22T22:47:30Z
- **Completed:** 2026-03-22T22:56:30Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created EmailPromptBanner component with inline email input, save via PUT /api/users/notification-prefs, and localStorage-based dismissal
- Integrated banner on user dashboard (after title) and vendor dashboard (after pending approval banner)
- Added email nudge to MakeOfferModal and BuyModal shipping steps linking to /settings
- Chrome glass styling consistent with existing theme

## Task Commits

Each task was committed atomically:

1. **Task 1: Create EmailPromptBanner component and add to both dashboards** - `5dc284f` (feat)
2. **Task 2: Add inline email nudge to MakeOfferModal and BuyModal shipping steps** - `d45a04f` (feat)

## Files Created/Modified
- `src/components/common/EmailPromptBanner.tsx` - Reusable banner component with email input, save, dismiss
- `src/styles/EmailPromptBanner.module.css` - Chrome glass styling with responsive mobile layout
- `src/pages/user/userDashboard.tsx` - Added EmailPromptBanner after title
- `src/pages/vendor/vendorDashboard.tsx` - Added EmailPromptBanner after pending approval banner
- `src/components/marketplace/MakeOfferModal.tsx` - Added hasEmail state check and email nudge in shipping step
- `src/components/marketplace/BuyModal.tsx` - Added hasEmail state check and email nudge in shipping step
- `src/styles/MakeOfferModal.module.css` - Added .emailNudge and .emailNudgeLink styles
- `src/styles/BuyModal.module.css` - Added .emailNudge and .emailNudgeLink styles
- `src/lib/services/notificationService.ts` - Fixed Mongoose lean() type errors (pre-existing)

## Decisions Made
- Banner uses localStorage keyed by wallet (`luxhub_email_banner_dismissed_${wallet}`) for dismissal persistence
- Email check fails silently in modals (setHasEmail(true) on error) to avoid blocking purchase/offer flows
- Nudge links to /settings rather than inline input to keep modals simple

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Mongoose lean() type errors in notificationService.ts**
- **Found during:** Build verification
- **Issue:** Pre-existing build failure -- VendorProfileModel.findOne().lean() and InviteCodeModel.findOne().lean() returning union types that TypeScript rejected for property access
- **Fix:** Added `as any` cast to both lean() results (consistent with existing pattern in the same file)
- **Files modified:** src/lib/services/notificationService.ts
- **Verification:** `npm run build` succeeds
- **Committed in:** `9ab30d2`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Pre-existing type error, not caused by this plan. Fix is minimal and consistent with existing codebase patterns.

## Issues Encountered
None beyond the pre-existing build error documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Email collection surfaces are in place across dashboards and purchase/offer modals
- Future enhancement: email verification flow after collection
