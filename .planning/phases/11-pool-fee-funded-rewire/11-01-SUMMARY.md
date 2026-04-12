---
phase: "11"
plan: "01"
subsystem: pool-model
tags: [schema, migration, mongoose, fee-funded, tokenomics]
dependency_graph:
  requires: [11-00]
  provides: [Pool-schema-v11, TreasuryDeposit-enum-v11, migration-script, test-harness]
  affects: [11-02, 11-03, 11-04, 11-05, 11-07, 11-08]
tech_stack:
  added: [mongodb-memory-server]
  patterns: [three-source-fee-accumulation, USDC-denominated-graduation, lifecycle-memo-trail]
key_files:
  created:
    - src/lib/models/Pool.test.ts
    - scripts/migrate-pool-schema-v11.ts
    - tests/_setup/mongoMemory.ts
    - tests/fixtures/.gitkeep
    - jest.config.models.cjs
  modified:
    - src/lib/models/Pool.ts
    - src/lib/models/TreasuryDeposit.ts
    - package.json
    - package-lock.json
decisions:
  - Pre-save hook simplified to P2P-only vendor payment (AMM path removed with orphan fields)
  - Created dedicated jest.config.models.cjs for node-environment model tests (jsdom setup conflicts)
  - treasuryPoolsVaultPda field added per CONTEXT.md (not in original plan but required by Squads vault pivot)
metrics:
  duration: "388s"
  completed: "2026-04-12T15:03:16Z"
  tasks: 6
  files: 9
---

# Phase 11 Plan 01: Pool Model Schema Migration Summary

Pool schema rewired for fee-funded tokenomics: USDC graduation targets, three-source fee counters (authoritative claim-driven + pending UI estimate + audit trail), lifecycle memo trail, 11-value tokenStatus enum, and 24 orphan fields removed (Squad DAO, AMM, fee-split, wind-down).

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| Pre-task | Test harness setup (mongodb-memory-server, tests/_setup, tests/fixtures) | Done |
| 1.1 | Add new fields to Pool schema (graduation target, fee accumulation, escrow linkage, lifecycle memos, tokenStatus enum, compound indexes) | Done |
| 1.2 | Remove orphan fields (7 Squad DAO, 6 fee-split, 8 AMM, 2 wind-down = 23 fields + 3 orphan indexes) | Done |
| 1.3 | Extend TreasuryDeposit depositType enum with pool_trading_fee and unclaimed_sweep | Done |
| 1.4 | Migration script (Scenario 2 path) created at scripts/migrate-pool-schema-v11.ts | Done |
| 1.5 | Pre-save hook audited and simplified (removed AMM/liquidityModel references) | Done |
| 1.6 | Unit test suite (90 tests) covering defaults, enum validation, removed fields, indexes, legacy compat | Done |

## Deviations from Plan

### Auto-added (Rule 2)

**1. [Rule 2] Added treasuryPoolsVaultPda field**
- **Found during:** Task 1.1
- **Issue:** CONTEXT.md specifies `treasuryPoolsVaultPda` field (Squads vault PDA index 1) but the PLAN.md task 1.1 field list did not include it
- **Fix:** Added the field to Pool schema per CONTEXT.md consolidated reference
- **Files modified:** src/lib/models/Pool.ts

**2. [Rule 3] Created jest.config.models.cjs for node-environment tests**
- **Found during:** Task 1.6
- **Issue:** Default jest.config.cjs uses jsdom environment with window.matchMedia mock in jest.setup.cjs, which crashes in node environment needed for Mongoose tests
- **Fix:** Created dedicated jest.config.models.cjs with testEnvironment: "node" and no setupFilesAfterEnv
- **Files modified:** jest.config.models.cjs (new file)

## Verification Results

1. Typecheck: Pre-existing node_modules type conflicts only (mocha/jest, react-toastify, @types/web). No errors from modified files.
2. Test suite: 90/90 tests pass (npx jest --config jest.config.models.cjs)
3. Orphan field grep: Zero matches for squadMultisigPda, accumulatedHolderFees, ammPoolAddress in Pool.ts
4. New field grep: Confirmed matches for fundingTargetUsdc, accumulatedFeesLamports, lifecycleMemos
5. Migration script: Created at scripts/migrate-pool-schema-v11.ts (execution deferred to Wave E 11-18)

## Commits

| Hash | Message |
|------|---------|
| 83fde18 | feat(11-01): rewire Pool schema for fee-funded model |

## Self-Check: PASSED

All created files verified on disk. Commit 83fde18 confirmed in git log.
