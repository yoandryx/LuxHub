---
phase: 02-security-and-notification-hardening
plan: 02
subsystem: api
tags: [notifications, email, resend, mongoose, jest, tdd]

requires:
  - phase: 02-00
    provides: test infrastructure and stub files for notification tests
provides:
  - dispute_created and delist_request_submitted notification types in model and service
  - notifyDisputeCreated and notifyDelistRequestSubmitted convenience functions
  - Correct notification calls in dispute, delist-request, and submit-shipment endpoints
  - 11 passing notification tests across 4 test files
affects: [admin-dashboard, vendor-dashboard, email-delivery]

tech-stack:
  added: [node-mocks-http]
  patterns: [admin-notification-pattern, tdd-api-testing]

key-files:
  created:
    - tests/lib/notificationService.test.ts
    - tests/api/dispute.test.ts
    - tests/api/delistRequest.test.ts
    - tests/api/submitShipment.test.ts
  modified:
    - src/lib/models/Notification.ts
    - src/lib/services/notificationService.ts
    - src/pages/api/escrow/dispute.ts
    - src/pages/api/vendor/delist-request.ts
    - src/pages/api/escrow/submit-shipment.ts

key-decisions:
  - "dispute_created mapped to securityAlerts category so admins get urgent email notifications"
  - "delist_request_submitted mapped to orderUpdates category (operational, not security-critical)"
  - "Admin notification pattern: combine ADMIN_WALLETS + SUPER_ADMIN_WALLETS with deduplication via Set"

patterns-established:
  - "Admin notification pattern: parse env wallets, deduplicate, call convenience function with .catch() for best-effort delivery"
  - "API endpoint notification tests: mock notificationService module, use node-mocks-http for req/res, assert correct function called with expected args"

requirements-completed: [NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, NOTF-06]

duration: 8min
completed: 2026-03-20
---

# Phase 02 Plan 02: Notification Bug Fixes Summary

**Fixed 4 notification bugs (dispute uses correct type, delist/shipment notify admins), added 2 new notification types with email templates, 11 TDD tests passing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-20T00:13:25Z
- **Completed:** 2026-03-20T00:21:45Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Fixed NOTF-01: dispute.ts now sends `dispute_created` notification instead of `shipment_submitted`
- Fixed NOTF-03: delist-request.ts now notifies all admin wallets when vendor submits delist request
- Fixed NOTF-04: submit-shipment.ts now notifies all admin wallets when vendor submits shipment proof
- Verified NOTF-02: auto-rejected offers already correctly notify affected buyers
- Verified NOTF-05/06: email templates and Resend infrastructure cover all notification types
- Added `dispute_created` and `delist_request_submitted` to Notification model enum and service type union
- Created `notifyDisputeCreated` and `notifyDelistRequestSubmitted` convenience functions
- All 11 tests passing across 4 test files (TDD approach)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add new notification types and convenience functions**
   - `8731787` (test: RED phase - failing tests)
   - `fe9fe75` (feat: GREEN phase - types, templates, functions implemented)
2. **Task 2: Fix notification calls in dispute, delist-request, and submit-shipment endpoints**
   - `fa5e4a2` (test: RED phase - failing API tests)
   - `29e93f1` (fix: GREEN phase - endpoints fixed)

## Files Created/Modified
- `src/lib/models/Notification.ts` - Added dispute_created and delist_request_submitted to enum
- `src/lib/services/notificationService.ts` - Added types, email templates, category mappings, and 2 convenience functions
- `src/pages/api/escrow/dispute.ts` - Replaced notifyUser(shipment_submitted) with notifyDisputeCreated
- `src/pages/api/vendor/delist-request.ts` - Added notifyDelistRequestSubmitted call after creating request
- `src/pages/api/escrow/submit-shipment.ts` - Added notifyShipmentProofSubmitted call for admin verification queue
- `tests/lib/notificationService.test.ts` - 5 tests for new types and convenience functions
- `tests/api/dispute.test.ts` - 2 tests verifying correct notification call
- `tests/api/delistRequest.test.ts` - 2 tests verifying admin notification
- `tests/api/submitShipment.test.ts` - 2 tests verifying admin and buyer notifications

## Decisions Made
- Mapped `dispute_created` to `securityAlerts` category (urgent admin attention needed for 7-day SLA)
- Mapped `delist_request_submitted` to `orderUpdates` category (operational workflow, not security)
- Used existing admin notification pattern: env wallet parsing + Set deduplication + best-effort .catch()
- Installed `node-mocks-http` as dev dependency for API endpoint testing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed node-mocks-http dependency**
- **Found during:** Task 2 (API endpoint tests)
- **Issue:** node-mocks-http not installed, needed for createMocks() in API tests
- **Fix:** `npm install --save-dev node-mocks-http`
- **Files modified:** package.json, package-lock.json
- **Verification:** Tests run successfully
- **Committed in:** fa5e4a2 (Task 2 RED phase commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Dependency install required for test infrastructure. No scope creep.

## Issues Encountered
- Pre-existing build failure (`npm run build`) due to Privy `signMessage` type mismatch in `src/hooks/useEffectiveWallet.ts` (commit f0be337). Not caused by this plan's changes. Logged to `deferred-items.md`. TypeScript compilation of changed files passes cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All notification types now have correct mappings and email templates
- Admin notification pattern established for future endpoints
- Test infrastructure validated for API endpoint testing with mocked dependencies

---
*Phase: 02-security-and-notification-hardening*
*Completed: 2026-03-20*
