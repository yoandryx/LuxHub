---
phase: 11-pool-fee-funded-rewire
plan: "07"
subsystem: services
tags: [jupiter, squads, solana, usdc, escrow, bridge, swap]

requires:
  - phase: 11-00
    provides: Wave 0.4 tx size finding (v0+ALT = 798 bytes, single-proposal viable)
  - phase: 11-01
    provides: Pool schema with accumulatedFeesLamports, backingEscrowPda, slippageBufferBps, tokenStatus
  - phase: 11-03
    provides: solPriceService (getSolUsdRate for SOL/USD conversion)
  - phase: 11-04
    provides: tokenStatus state machine (graduated state gate)
provides:
  - poolBridgeService.ts — SOL->USDC swap + exchange bridge via Squads vault proposals
  - POST /api/pool/bridge-to-escrow — admin-gated HTTP endpoint
  - On-chain escrow account deserializer (fetchEscrowAccount)
  - Reusable createVaultProposal helper for arbitrary inner instructions
affects: [11-08-graduation-trigger, 11-09-custody, 11-14-abort-safety]

tech-stack:
  added: []
  patterns:
    - "Jupiter v6 swap-instructions API for server-side swap construction"
    - "Squads vault proposal with arbitrary inner instructions (not just transfers)"
    - "Auto bridge pattern selection based on estimated tx size"
    - "On-chain Anchor account deserialization without full IDL dependency"

key-files:
  created:
    - src/lib/services/poolBridgeService.ts
    - src/lib/services/poolBridgeService.test.ts
    - src/pages/api/pool/bridge-to-escrow.ts
    - src/pages/api/pool/bridge-to-escrow.test.ts
  modified:
    - jest.config.cjs

key-decisions:
  - "API endpoint at /api/pool/bridge-to-escrow (singular pool/) matching existing convention, not /api/pools/[id]/"
  - "uuid CJS moduleNameMapper added to jest.config.cjs to fix jsdom ESM resolution for all Solana-dependent tests"
  - "On-chain escrow deserialized manually (buffer parsing) instead of importing full Anchor IDL coder"
  - "createVaultProposal extracted as reusable helper for any Squads inner instruction set"

patterns-established:
  - "Jupiter swap-instructions pattern: quote -> swap-instructions -> embed in Squads vault tx"
  - "Auto bridge pattern: estimate tx size, single-proposal if <=1100 bytes, two-proposal fallback"
  - "Escrow account reader: manual buffer deserialization matching Anchor struct layout"

requirements-completed: []

duration: 11min
completed: 2026-04-12
---

# Phase 11 Plan 07: Pool Bridge Service Summary

**SOL->USDC swap + exchange bridge via Jupiter v6 and Squads vault proposals, with auto pattern selection (single-proposal primary, two-proposal fallback)**

## What Was Built

### poolBridgeService.ts (Tasks 7.1-7.5)

The architectural keystone of phase 11. `bridgeToEscrow()` orchestrates:

1. Validates pool state (graduated, has escrow PDA, has accumulated fees)
2. Reads on-chain escrow account to get sale_price, mint_a, mint_b
3. Computes SOL needed via solPriceService + slippage buffer
4. Fetches Jupiter v6 swap instructions (SOL->USDC)
5. Builds Anchor `exchange` instruction matching IDL account layout
6. Auto-selects bridge pattern (single-proposal v0+ALT if estimated <=1100 bytes, otherwise two-proposal)
7. Constructs and submits Squads vault proposal(s) via reusable `createVaultProposal` helper

Key internal helpers exported for testing:
- `_fetchJupiterSwapIxs` — Jupiter quote + swap-instructions
- `_buildExchangeIx` — Anchor exchange instruction with correct account order
- `_fetchEscrowAccount` — On-chain escrow buffer deserialization
- `_createVaultProposal` — Reusable Squads vault proposal builder

### API Endpoint (Task 7.6)

`POST /api/pool/bridge-to-escrow` — Admin-gated, accepts `poolId` + optional `options` (slippageBps, autoApprove, onlyDirectRoutes). Returns `BridgeResult` with pattern used, proposal indices, tx signatures, and Squads deep links.

### Unit Tests (Task 7.7)

15 tests across 2 test files:
- **Service (8):** Happy path single-proposal, two-proposal forced, insufficient fees, wrong state, Jupiter quote insufficient, no backing escrow, nothing to bridge, pool not found
- **API (7):** 405 method, 401 no wallet, 401 non-admin, 400 missing poolId, 200 happy path, header auth, service error forwarding

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] uuid ESM resolution in Jest**
- **Found during:** Task 7.7 (tests)
- **Issue:** `@solana/web3.js` transitively imports `uuid` which resolves to `esm-browser` under jsdom, causing `SyntaxError: Unexpected token 'export'`
- **Fix:** Added `"^uuid$": "<rootDir>/node_modules/uuid/dist/index.js"` to jest.config.cjs moduleNameMapper
- **Files modified:** jest.config.cjs
- **Commit:** a178545

**2. [Rule 1 - Bug] Pool model uses named export, not default**
- **Found during:** Task 7.5 (typecheck)
- **Issue:** Plan assumed `import Pool from ...` but actual export is `export const Pool = ...`
- **Fix:** Changed to `const { Pool } = await import('@/lib/models/Pool')`
- **Files modified:** poolBridgeService.ts
- **Commit:** a178545

**3. [Rule 3 - Blocking] API endpoint path convention**
- **Found during:** Task 7.6
- **Issue:** Plan specified `/api/pools/[id]/bridge-to-escrow.ts` but existing routes use singular `/api/pool/`
- **Fix:** Created at `src/pages/api/pool/bridge-to-escrow.ts` with poolId in request body instead of URL path
- **Files modified:** bridge-to-escrow.ts
- **Commit:** a178545

## Verification

- [x] All 15 tests pass (8 service + 7 API)
- [x] TypeScript typecheck passes (no errors in our files)
- [x] Exchange account order matches IDL: taker, escrow, mint_a, mint_b, taker_funds_ata, wsol_vault, token_program, associated_token_program, system_program
- [x] Jupiter API uses `https://public.jupiterapi.com` (not dead quote-api.jup.ag)
- [x] USDC denomination enforced (jupiter_quote_insufficient guard)
- [x] Bridge pattern selection follows Wave 0.4 finding

## Commits

| Hash | Message | Files |
|------|---------|-------|
| a178545 | feat(11-07): add pool bridge service (SOL->USDC swap + exchange) | 5 files |
