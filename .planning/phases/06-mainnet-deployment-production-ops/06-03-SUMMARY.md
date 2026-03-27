---
phase: 06-mainnet-deployment-production-ops
plan: 03
subsystem: infra
tags: [cloudflare-r2, aws-s3, object-storage, image-upload, migration]

# Dependency graph
requires: []
provides:
  - R2 upload module at src/lib/storage/uploadImage.ts
  - New API route at /api/upload/image for avatar/banner uploads
  - IBM COS fully removed from codebase
affects: [vendor-onboarding, vendor-dashboard]

# Tech tracking
tech-stack:
  added: ["@aws-sdk/client-s3"]
  removed: ["ibm-cos-sdk"]
  patterns: ["S3-compatible upload via R2 with lazy client instantiation"]

key-files:
  created:
    - src/lib/storage/uploadImage.ts
    - src/pages/api/upload/image.ts
  modified:
    - src/components/vendor/AvatarBannerUploader.tsx
    - scripts/validate-env.js
    - package.json

key-decisions:
  - "R2 upload function uses lazy client instantiation (getR2Client) to avoid errors when env vars are missing at import time"
  - "Renamed uploadToIBM to uploadFile in AvatarBannerUploader for clarity"

patterns-established:
  - "Storage uploads: use src/lib/storage/uploadImage.ts for all R2 uploads"

requirements-completed: [INFRA-01]

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 06 Plan 03: R2 Storage Migration Summary

**Migrated avatar/banner uploads from IBM COS to Cloudflare R2 using @aws-sdk/client-s3 with zero interface changes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T02:54:25Z
- **Completed:** 2026-03-27T02:59:25Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created R2 upload module with S3-compatible API at src/lib/storage/uploadImage.ts
- Created new API route /api/upload/image that mirrors the old /api/ibm/uploadImage interface exactly
- Removed all IBM COS code, dependencies, and env var references from the codebase
- Existing IBM COS URLs in MongoDB continue working (stored as full URLs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create R2 upload module and new API route** - `a6cda77` (feat)
2. **Task 2: Update frontend to use new upload endpoint and clean up IBM files** - `0e7d22a` (feat)

## Files Created/Modified
- `src/lib/storage/uploadImage.ts` - R2 upload function using @aws-sdk/client-s3
- `src/pages/api/upload/image.ts` - New API route for image uploads via R2
- `src/components/vendor/AvatarBannerUploader.tsx` - Updated fetch URL from /api/ibm/uploadImage to /api/upload/image
- `scripts/validate-env.js` - Replaced IBM_COS env vars with R2 env vars
- `package.json` - Added @aws-sdk/client-s3, removed ibm-cos-sdk
- `src/lib/ibm/uploadImageToIBM.ts` - Deleted
- `src/pages/api/ibm/uploadImage.ts` - Deleted

## Decisions Made
- Used lazy client instantiation (getR2Client function) to avoid module-level errors when R2 env vars are not set
- Renamed the internal function from uploadToIBM to uploadFile in AvatarBannerUploader for clarity
- Kept same query param interface (wallet, type) and response shape ({ url: string }) for zero-friction migration

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functionality is fully wired. R2 uploads will work once env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_DOMAIN) are configured.

## User Setup Required

External services require manual configuration:
- **R2_ACCOUNT_ID** - Cloudflare Dashboard -> R2 -> Account ID
- **R2_ACCESS_KEY_ID** - Cloudflare Dashboard -> R2 -> Manage R2 API Tokens -> Access Key ID
- **R2_SECRET_ACCESS_KEY** - Cloudflare Dashboard -> R2 -> Manage R2 API Tokens -> Secret Access Key
- **R2_PUBLIC_DOMAIN** - Cloudflare Dashboard -> R2 -> luxhub-assets bucket -> Settings -> Public Access -> Public URL

## Issues Encountered
None

## Next Phase Readiness
- R2 storage module ready for use by any future upload features
- Vendor avatar/banner uploads will work once R2 env vars are configured in Vercel

## Self-Check: PASSED

- FOUND: src/lib/storage/uploadImage.ts
- FOUND: src/pages/api/upload/image.ts
- CONFIRMED DELETED: src/lib/ibm/uploadImageToIBM.ts
- CONFIRMED DELETED: src/pages/api/ibm/uploadImage.ts
- FOUND: commit a6cda77
- FOUND: commit 0e7d22a

---
*Phase: 06-mainnet-deployment-production-ops*
*Completed: 2026-03-27*
