---
phase: "11"
plan: "02"
subsystem: pool-distribution-model
tags: [mongoose, schema, indexes, pre-save-hook]
dependency_graph:
  requires: [11-00]
  provides: [PoolDistribution-phase11-schema]
  affects: [11-05, 11-06, 11-11, 11-12, 11-13, 11-14]
tech_stack:
  added: []
  patterns: [mongoose-pre-save-hook, compound-indexes, unique-sparse-index]
key_files:
  created:
    - src/lib/models/PoolDistribution.test.ts
  modified:
    - src/lib/models/PoolDistribution.ts
    - jest.config.cjs
decisions:
  - Used `pool` field name (existing) instead of `poolId` (plan text) for index consistency
  - Added bson CJS mapping to jest.config.cjs to unblock Mongoose model tests (Rule 3 deviation)
metrics:
  duration: ~4min
  completed: "2026-04-12"
  tasks_completed: 5
  tasks_total: 5
---

# Phase 11 Plan 02: PoolDistribution Model Extension Summary

Extended PoolDistribution Mongoose schema with phase 11 claim lifecycle fields, compound indexes for cron hot paths, and pre-save hook for 90-day claim deadline auto-computation.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| 2.1 | Add top-level distribution fields (distributionKind, snapshotTakenAt, claimDeadlineAt, sourceEscrowPda, sourceTxSignature) + new status enum values (snapshot_failed, expired) | Done |
| 2.2 | Extend per-holder distributions[] sub-schema (burnTxSignature, paidTxSignature, claimedAt, claimTxSignature, notification timestamps, squadsProposalIndex) | Done |
| 2.3 | Add compound indexes for cron hot paths + unique sparse idempotency index | Done |
| 2.4 | Pre-save hook: auto-compute claimDeadlineAt = snapshotTakenAt + 90 days | Done |
| 2.5 | Unit tests (11 tests, all passing) | Done |

## Commits

| Hash | Message |
|------|---------|
| 37f68a9 | feat(11-02): extend PoolDistribution for phase 11 claim lifecycle |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed bson ESM parse error in Jest**
- **Found during:** Task 2.5
- **Issue:** Jest could not parse `bson/lib/bson.mjs` (ESM export syntax) when importing mongoose. This blocked all Mongoose model tests.
- **Fix:** Added `"^bson$": "<rootDir>/node_modules/bson/lib/bson.cjs"` to `moduleNameMapper` in `jest.config.cjs`, plus `bson|mongodb` to `transformIgnorePatterns`.
- **Files modified:** jest.config.cjs
- **Commit:** 37f68a9

**2. [Rule 1 - Bug] Used `pool` instead of `poolId` for index field names**
- **Found during:** Task 2.3
- **Issue:** Plan text referenced `poolId` in index definitions, but the existing schema uses `pool` as the field name.
- **Fix:** Used `pool` in all index definitions to match the actual schema field.
- **Files modified:** src/lib/models/PoolDistribution.ts
- **Commit:** 37f68a9

## Verification

- All 11 unit tests pass
- TypeScript typecheck: no new errors (7 pre-existing errors in unrelated test files)
- All required fields confirmed present via grep
