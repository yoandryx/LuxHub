---
phase: quick-260322-opr
plan: 01
subsystem: notifications
tags: [email, vendor, mongoose, fallback-chain]

requires:
  - phase: none
    provides: existing notificationService and vendor onboarding
provides:
  - Vendor email fallback chain in notifyUser (User -> VendorProfile -> InviteCode)
  - Email field on VendorProfile schema
  - Email propagation during vendor onboarding
affects: [notifications, vendor-onboarding]

tech-stack:
  added: []
  patterns: [email-fallback-chain]

key-files:
  created: []
  modified:
    - src/lib/models/VendorProfile.ts
    - src/pages/api/vendor/onboard-api.ts
    - src/lib/services/notificationService.ts

key-decisions:
  - "3-step email fallback: User.email -> VendorProfile.email -> InviteCode.vendorEmail"
  - "User.findOneAndUpdate with upsert:false -- safe if User record does not exist yet"

patterns-established:
  - "Email fallback chain: always resolve vendor email through multiple sources before sending"

requirements-completed: [VENDOR-EMAIL-FIX]

duration: 3min
completed: 2026-03-22
---

# Quick Task 260322-opr: Fix Vendor Email Notifications Summary

**3-step email fallback chain (User -> VendorProfile -> InviteCode) so vendor notifications always reach the correct email address**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T21:51:10Z
- **Completed:** 2026-03-22T21:54:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- VendorProfile schema now stores vendor email during onboarding
- onboard-api.ts propagates invite.vendorEmail to both VendorProfile and User records
- notifyUser() resolves vendor email via 3-step fallback chain, ensuring all vendor notifications (mint approvals, offers, shipping updates) reach the correct email

## Task Commits

Each task was committed atomically:

1. **Task 1: Store vendor email on User record + VendorProfile during onboarding** - `5b92724` (feat)
2. **Task 2: Add email fallback chain in notifyUser()** - `4bcf820` (feat)

## Files Created/Modified
- `src/lib/models/VendorProfile.ts` - Added email field to schema and type export
- `src/pages/api/vendor/onboard-api.ts` - Save invite.vendorEmail to VendorProfile.email and User.email during onboard
- `src/lib/services/notificationService.ts` - Email fallback chain: User.email -> VendorProfile.email -> InviteCode.vendorEmail

## Decisions Made
- Used 3-step fallback chain rather than only storing on User record, because User record may not exist for wallet-only users
- User.findOneAndUpdate with upsert:false is safe -- if no User exists, the fallback chain handles it
- Used named import `{ User }` (not default) matching the existing export pattern in User.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed User import style**
- **Found during:** Task 1 (onboard-api.ts modification)
- **Issue:** Plan specified `import User from '...'` but User model uses named export `export const User`
- **Fix:** Changed to `import { User } from '../../../lib/models/User'`
- **Files modified:** src/pages/api/vendor/onboard-api.ts
- **Verification:** TypeScript compile check passes (no new errors)
- **Committed in:** 5b92724 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor import style fix required for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Vendor email notifications now work end-to-end
- Existing users with User.email already set are unaffected (fallback chain checks User.email first)

---
*Quick Task: 260322-opr*
*Completed: 2026-03-22*
