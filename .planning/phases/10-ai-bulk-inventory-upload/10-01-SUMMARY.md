---
phase: 10-ai-bulk-inventory-upload
plan: 01
subsystem: api
tags: [anthropic, claude, csv-mapping, image-analysis, bulk-upload, r2, mongoose]

requires:
  - phase: none
    provides: standalone backend APIs
provides:
  - Extended MintRequest model with batch fields (batchId, batchName, imageR2Url, aiConfidence, aiSource)
  - Shared imageMatching utility (matchImageToRow, matchAllImages)
  - POST /api/ai/map-csv — AI CSV column mapping
  - POST /api/ai/analyze-batch — batch watch image analysis
  - POST /api/bulk-upload/images — multi-file R2 upload
  - POST /api/bulk-upload/submit — vendor batch MintRequest creation
affects: [10-02, 10-03, 10-04]

tech-stack:
  added: []
  patterns: [lazy-anthropic-client, p-limit-concurrency, csv-map-limiter]

key-files:
  created:
    - src/utils/imageMatching.ts
    - src/pages/api/ai/map-csv.ts
    - src/pages/api/ai/analyze-batch.ts
    - src/pages/api/bulk-upload/images.ts
    - src/pages/api/bulk-upload/submit.ts
    - tests/lib/image-matching.test.ts
    - tests/api/ai/map-csv.test.ts
    - tests/api/ai/analyze-batch.test.ts
  modified:
    - src/lib/models/MintRequest.ts

key-decisions:
  - "csvMapLimiter at 5 req/min per IP (stricter than aiLimiter) for cost control on Haiku calls"
  - "p-limit(3) concurrency cap on batch analysis to avoid Anthropic rate limits"
  - "estimatedPriceSol set to 0 in batch analysis — calculated client-side with live SOL price"

patterns-established:
  - "Rate limiter composition: rateLimit() returns middleware wrapper, applied via csvMapLimiter(handler)"
  - "Bulk upload key pattern: bulk-uploads/{timestamp}/{originalFilename}"
  - "Image matching tiers: ref number (0.95) > model name (0.8) > numeric index (0.6)"

requirements-completed: [BULK-01, BULK-02, BULK-05]

duration: 6min
completed: 2026-04-01
---

# Phase 10 Plan 01: Backend APIs & AI Pipeline Summary

**5 API endpoints + 1 model extension + 1 shared utility + 3 test files for AI-powered bulk inventory upload backend**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-01T13:13:55Z
- **Completed:** 2026-04-01T13:19:59Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Extended MintRequest model with 5 batch fields (batchId indexed for query performance)
- Created shared imageMatching utility with 3-tier matching algorithm (pure function, no dependencies)
- Built AI CSV column mapping endpoint using Claude Haiku with JSON retry logic
- Built batch image analysis endpoint using Claude Sonnet with p-limit(3) concurrency
- Created bulk image upload to R2 with partial failure resilience
- Created vendor batch submission endpoint with insertMany for grouped MintRequests
- 23 unit tests passing across 3 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend MintRequest, imageMatching, AI endpoints** - `a8bc641` (feat)
2. **Task 2: Bulk upload images + submit endpoints** - `0053b9d` (feat)
3. **Task 3: Unit tests for all new functionality** - `a3dfda5` (test)

## Files Created/Modified
- `src/lib/models/MintRequest.ts` - Added batchId (indexed), batchName, imageR2Url, aiConfidence, aiSource
- `src/utils/imageMatching.ts` - Shared 3-tier image-to-row matching (ref number, model, numeric index)
- `src/pages/api/ai/map-csv.ts` - AI CSV column mapping via Claude Haiku with 5req/min rate limit
- `src/pages/api/ai/analyze-batch.ts` - Batch watch analysis via Claude Sonnet with p-limit(3)
- `src/pages/api/bulk-upload/images.ts` - Multi-file upload to R2 (max 25 files, 10MB each)
- `src/pages/api/bulk-upload/submit.ts` - Vendor batch MintRequest creation with shared batchId
- `tests/lib/image-matching.test.ts` - 10 tests for matching tiers and edge cases
- `tests/api/ai/map-csv.test.ts` - 7 tests for CSV mapping validation and AI mock
- `tests/api/ai/analyze-batch.test.ts` - 6 tests for batch analysis and partial failures

## Decisions Made
- Used csvMapLimiter (5/min) separate from aiLimiter (10/min) for tighter cost control on CSV mapping
- Set estimatedPriceSol to 0 in batch analysis — live SOL price should be applied client-side
- No admin auth on any endpoint — these are vendor-facing APIs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] p-limit ESM mock for Jest**
- **Found during:** Task 3 (unit tests)
- **Issue:** p-limit is an ESM module; Jest mock needed special handling for dynamic import
- **Fix:** Used `__esModule` flag and dual export pattern in mock
- **Files modified:** tests/api/ai/analyze-batch.test.ts
- **Verification:** All 6 analyze-batch tests pass
- **Committed in:** a3dfda5

**2. [Rule 1 - Bug] Rate limiter mock for map-csv tests**
- **Found during:** Task 3 (unit tests)
- **Issue:** Rate limiter shared state caused 429 errors on successive test requests
- **Fix:** Mocked @/lib/middleware/rateLimit to pass through in tests
- **Files modified:** tests/api/ai/map-csv.test.ts
- **Verification:** All 7 map-csv tests pass
- **Committed in:** a3dfda5

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were test infrastructure issues, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend APIs ready for Plan 02 (Vendor Bulk Upload UI) and Plan 03 (Admin Batch Review Panel)
- imageMatching utility importable from React components for client-side preview matching

---
*Phase: 10-ai-bulk-inventory-upload*
*Completed: 2026-04-01*
