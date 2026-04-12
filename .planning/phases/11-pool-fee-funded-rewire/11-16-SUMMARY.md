---
phase: 11
plan: 16
subsystem: pool-ui
tags: [ui, pool-detail, phase-11, lifecycle, progress-bar, claim]
wave: E
requires:
  - 11-01 (schema fields: tokenStatus, fundingTargetUsdc, accumulatedFeesLamports*)
  - 11-02 (distribution snapshot for claim eligibility)
  - 11-12 (buildBurnTx + claim endpoint)
  - 11-17 (SSE endpoint — already wired)
provides:
  - PoolProgressBar component (dual bars — fees primary, Bags DBC informational)
  - PoolLifecycleStepper component (8-state canonical)
  - Self-serve holder claim flow in pool detail page
  - Position P&L display
affects:
  - src/pages/pools/[id].tsx
  - src/pages/api/pool/[id].ts
tech-stack:
  added:
    - "@testing-library/dom (missing peer dep for @testing-library/react)"
  patterns:
    - glass-morphism chrome theme (#c8a1ff accent)
    - react-icons/fa for stepper stage icons
    - client-signed burn + server-signed Squads payout (two-tx claim flow)
key-files:
  created:
    - src/components/marketplace/PoolProgressBar.tsx
    - src/styles/PoolProgressBar.module.css
    - src/components/pool/PoolLifecycleStepper.tsx
    - src/styles/PoolLifecycleStepper.module.css
    - src/components/marketplace/PoolProgressBar.test.tsx
    - src/components/pool/PoolLifecycleStepper.test.tsx
  modified:
    - src/pages/pools/[id].tsx
    - src/pages/api/pool/[id].ts
    - src/styles/PoolDetailV2.module.css
decisions:
  - Map off-canonical tokenStatus (resale_unlisted → custody, partial_distributed → resold) in stepper rather than adding new nodes.
  - Use ref-based local delta tracking for fee arrival pulse animation (complements SSE stream from 11-17 without coupling).
  - Bags DBC progress estimate: MIGRATED=100%, MIGRATING=95%, else mirror LuxHub fee %.
  - Claim button sends burn via `signTransaction` + `sendRawTransaction` (wallet adapter + Privy both supported via useEffectiveWallet).
  - Reuse existing /api/pools/distribution/[poolId]/claim endpoint from 11-12 — no new backend work needed.
metrics:
  duration: 12min
  completed: 2026-04-12
  tasks: 5
  files: 9
  tests: 13 passing
---

# Phase 11 Plan 16: Pool Detail UI (Progress Bars, Lifecycle Stepper, Claim Button) Summary

**One-liner:** Dual-bar pool progress (LuxHub fees primary + Bags DBC informational), 8-state canonical lifecycle stepper, position P&L, and self-serve holder claim flow wired into the pool detail page.

## What Shipped

### Task 16.1 + 16.2 — PoolProgressBar component
`src/components/marketplace/PoolProgressBar.tsx` + `src/styles/PoolProgressBar.module.css`

- Primary bar drives the LuxHub fee funding progress (authoritative, from `accumulatedFeesLamports` × SOL price ÷ 1e9).
- Optional pending overlay (`accumulatedFeesLamportsPending`) rendered behind the primary.
- Clamped 0–100%, zero-target safe (no divide-by-zero).
- `highlightPrimary` prop triggers a glow pulse animation when fees arrive.
- Secondary bar is informational-only Bags DBC (`PRE_LAUNCH`/`PRE_GRAD`/`MIGRATING`/`MIGRATED`); hidden when state is absent.
- Glass-morphism container with `--accent: #c8a1ff` purple per LuxHub design system.

### Task 16.3 — PoolLifecycleStepper component
`src/components/pool/PoolLifecycleStepper.tsx` + `src/styles/PoolLifecycleStepper.module.css`

- Renders 8 canonical stages: `pending → minted → funding → graduated → custody → resale_listed → resold → distributed`.
- Off-canonical state handling:
  - `aborted`: terminal box with danger-colored banner (normal stepper hidden).
  - `partial_distributed`: shown at `resold` index + footer banner.
  - `resale_unlisted`: shown at `custody` index.
- Current stage gets glowing pulse ring (animated 2s ease-in-out).
- Matches LifecycleStepper visual conventions (dot size, line pattern, color tokens).

### Task 16.4 — Pool detail page integration
`src/pages/pools/[id].tsx` + `src/pages/api/pool/[id].ts`

- API endpoint exposes new phase 11 fields: `fundingTargetUsdc`, `fundingTargetUsdcSource`, `accumulatedFeesLamports`, `accumulatedFeesLamportsPending`, `lastFeeClaimAt`, `lifecycleMemos`, `backingEscrowPda`, `custodyVaultPda`, `bagsTokenStatus`.
- Page replaces the legacy 6-state `LifecycleStepper` with the 8-state `PoolLifecycleStepper` when `pool.tokenStatus` is set (falls back to legacy otherwise — safe rollout).
- Dual `PoolProgressBar` rendered in desktop header area when `targetUsd > 0`.
- Fee-arrival highlight: `useRef` tracks last `accumulatedFeesLamports`, triggers `feeHighlight` flag for 1.8s on delta.
- Position P&L card (green/red tabular numerics) when the holder has cost basis.
- Self-serve claim card appears when `tokenStatus ∈ {resold, partial_distributed}` AND wallet is connected:
  - Pulls `ClaimInfo` from existing distribution endpoint.
  - Shows claim amount / ownership %.
  - `handleClaim`: builds burn tx via `buildBurnTx` (9 decimals per Bags), signs with wallet, sends raw, confirms, POSTs `burnTxSignature` to `/api/pools/distribution/[poolId]/claim`.
  - Toast feedback at each stage; disables during processing.
  - Links to burn tx on explorer once claimed.

### Task 16.5 — Component tests
`src/components/marketplace/PoolProgressBar.test.tsx` + `src/components/pool/PoolLifecycleStepper.test.tsx`

- **PoolProgressBar** (7 tests):
  - Primary bar renders at exact percentage
  - Pending overlay renders with combined accumulated+pending width
  - No pending overlay when `pendingUsd` absent
  - Secondary DBC group renders only when state provided
  - Clamps to 100% when `accumulatedUsd > targetUsd`
  - Handles `targetUsd=0` (no divide-by-zero)
  - Hides secondary when `bagsDbcState` undefined
- **PoolLifecycleStepper** (6 tests):
  - 8 canonical stage nodes in correct order
  - Current stage marked visually for "funding"
  - Aborted terminal box replaces stepper (via `data-testid`)
  - Partial-distributed banner renders
  - `resale_unlisted` maps to custody stage
  - Pending initial state renders all 8 nodes
- **13/13 passing** on first run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Install missing `@testing-library/dom` peer dependency**
- **Found during:** Task 16.5 test execution
- **Issue:** `@testing-library/react@16.3.1` requires `@testing-library/dom` as a peer but it was not installed. The pre-existing `src/__tests__/example.test.tsx` was already broken because of this.
- **Fix:** `npm install --save-dev @testing-library/dom`
- **Files modified:** `package.json`, `package-lock.json`
- **Impact:** Unblocks all component-level testing for the project going forward.
- **Commit:** a2f63b9

**2. [Rule 1 - Bug] Unused `CanonicalKey` type alias**
- **Found during:** Post-commit ESLint pass
- **Issue:** Declared `type CanonicalKey` but never referenced — ESLint warning.
- **Fix:** Removed the alias.
- **Commit:** 2e3d1b9

### Plan adjustments (not deviations)

- The plan's proposed polling was already superseded by the SSE endpoint from 11-17, which had merged in parallel. Instead of adding redundant 5s polling, the page already subscribes to SSE events (`snapshot`/`fees`/`state`). I added a complementary local-delta `useRef` check that fires a visual pulse when `accumulatedFeesLamports` increases between SWR refreshes — this works with or without SSE.
- The API endpoint required an extension to expose new phase 11 fields; the plan listed this as an inline task (step 4.1) — kept scope tight.

## Commits

| Hash | Task | Message |
|------|------|---------|
| 8e61af3 | 16.1–16.3 | `feat(11-16): add PoolProgressBar and PoolLifecycleStepper components` |
| b80df7c | 16.4 | `feat(11-16): integrate phase 11 components into pool detail page` |
| a2f63b9 | 16.5 | `test(11-16): add component tests for PoolProgressBar and PoolLifecycleStepper` |
| 2e3d1b9 | cleanup | `chore(11-16): remove unused CanonicalKey type in PoolLifecycleStepper` |

## Verification

1. **TypeScript** — `npx tsc --noEmit` — PASS (no errors in changed files; pre-existing errors in unrelated test files not touched)
2. **Tests** — `npx jest PoolProgressBar PoolLifecycleStepper` — 13/13 PASS
3. **Lint** — `npx eslint` on my new files — PASS (zero warnings after CanonicalKey removal). Pre-existing errors from 11-17 SSE code (`EventSource`, `MessageEvent`, `EventListener` missing DOM types in project eslintrc) are out of scope per deviation rule scope boundary.
4. **Visual verification** — Deferred to human checkpoint per plan notes (plan 16 rollback path is `git revert`).

## Known Stubs

None. Every piece of UI pulls from real data:
- Progress bar: `pool.accumulatedFeesLamports` × live SOL price × target USDC
- Stepper: `pool.tokenStatus`
- Claim: real `buildBurnTx` from 11-12 + real distribution endpoint
- P&L: real on-chain token balance from `getTokenAccountsByOwner`

## Threat Flags

None. All new UI code:
- Uses existing auth paths (no new endpoints)
- Does NOT introduce new file access, auth, or network surfaces
- Claim button hits the existing `/api/pools/distribution/[poolId]/claim` endpoint from 11-12 (already threat-modeled)
- API endpoint `/api/pool/[id]` extension only exposes additional read-only fields that were already persisted by earlier plans

## Deferred Issues

Pre-existing ESLint errors in `src/pages/pools/[id].tsx` from plan 11-17 (SSE code): `EventSource`, `MessageEvent`, `EventListener` are not declared in `no-undef`. These are DOM types and the project's ESLint config needs `env.browser: true` or equivalent. Logged for a future tooling sweep — out of scope for 11-16 per deviation scope boundary.

## Self-Check: PASSED

**Files verified (all FOUND):**
- src/components/marketplace/PoolProgressBar.tsx
- src/styles/PoolProgressBar.module.css
- src/components/pool/PoolLifecycleStepper.tsx
- src/styles/PoolLifecycleStepper.module.css
- src/components/marketplace/PoolProgressBar.test.tsx
- src/components/pool/PoolLifecycleStepper.test.tsx

**Commits verified (all FOUND):**
- 8e61af3 (components)
- b80df7c (page integration)
- a2f63b9 (tests)
- 2e3d1b9 (cleanup)

