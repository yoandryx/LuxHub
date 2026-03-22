---
phase: quick-260322-qkv
plan: 01
subsystem: api
tags: [addresses, auth, walletAuth, encryption, saved-addresses]

requires:
  - phase: none
    provides: n/a
provides:
  - Working address CRUD endpoints accepting wallet from body/query params
affects: [SavedAddressSelector, BuyModal, MakeOfferModal, shipping-flow]

tech-stack:
  added: []
  patterns: [wallet-from-body-query extraction pattern for non-signature endpoints]

key-files:
  created: []
  modified:
    - src/pages/api/addresses/index.ts
    - src/pages/api/addresses/[id].ts
    - src/pages/api/addresses/default.ts

key-decisions:
  - "Removed withWalletAuth in favor of wallet from req.query/req.body -- callers never send signatures"

patterns-established:
  - "Address endpoints: GET uses req.query.wallet, POST/PUT/DELETE use req.body.wallet"

requirements-completed: [QUICK-FIX]

duration: 3min
completed: 2026-03-22
---

# Quick Task 260322-qkv: Fix Saved Address Auth Summary

**Removed withWalletAuth signature middleware from all 3 address endpoints, replacing with simple wallet extraction from query/body params to fix silent CRUD failures**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T23:12:39Z
- **Completed:** 2026-03-22T23:16:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- All three address API endpoints now accept wallet from body/query instead of requiring cryptographic signature auth
- SavedAddressSelector, BuyModal, and MakeOfferModal can now successfully create, list, and delete saved addresses
- PII encryption (AES-256-GCM) remains intact for data-at-rest security

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace withWalletAuth with wallet-from-body/query** - `5132cc7` (fix)

## Files Created/Modified
- `src/pages/api/addresses/index.ts` - Removed withWalletAuth, wallet from query (GET) / body (POST)
- `src/pages/api/addresses/[id].ts` - Removed withWalletAuth, wallet per-method from query (GET) / body (PUT/DELETE)
- `src/pages/api/addresses/default.ts` - Removed withWalletAuth, wallet from query (GET) / body (POST)

## Decisions Made
- Removed withWalletAuth because all callers (SavedAddressSelector, BuyModal, MakeOfferModal) only send wallet address in body/query -- no signature. This matches the established pattern in vendor/mint-request.ts, offers/create.ts, and buyer/orders.ts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Address CRUD is now functional for the shipping/checkout flow
- No blockers

---
*Phase: quick-260322-qkv*
*Completed: 2026-03-22*
