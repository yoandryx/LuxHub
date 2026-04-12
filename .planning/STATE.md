---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Mainnet & Pools
status: Executing Phase 11
stopped_at: Completed 11-10-PLAN.md
last_updated: "2026-04-12T16:18:00Z"
last_activity: 2026-04-12 — Wave C executing. 11-10 (list-resale endpoint) complete.
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 41
  completed_plans: 32
  percent: 78
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Every purchase is protected by on-chain escrow -- funds held in PDA until buyer confirms delivery, then split 97% vendor / 3% treasury automatically.
**Current focus:** Phase 11 — pool-fee-funded-rewire (supersedes phase 8)

## Current Position

Phase: 11 (pool-fee-funded-rewire) — EXECUTING
Plan: Wave 0 (11-00) + Wave A (11-01 through 11-04) + Wave B (11-05 through 11-08) complete. Wave C (11-09 through 11-11) executing.
Execution order: Phase 9 → 10 → 11 (phase 8 superseded)

## Performance Metrics

**Velocity:**

- Total plans completed: 20 (v1.0)
- Average duration: ~10min
- Total execution time: ~3.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.0 totals | 20 | ~3.3h | ~10min |

**Recent Trend:**

- Last 5 plans: 13min, 8min, 11min, 143s, (quick tasks)
- Trend: Stable

*Updated after each plan completion*
| Phase 5.1 P01 | 5min | 2 tasks | 13 files |
| Phase 5.1 P02 | 3min | 1 tasks | 2 files |
| Phase 5.1 P03 | 3min | 2 tasks | 5 files |
| Phase 5.1 P04 | 3min | 2 tasks | 2 files |
| Phase 06 P02 | 1min | 2 tasks | 3 files |
| Phase 06 P03 | 5min | 2 tasks | 7 files |
| Phase 06 P01 | 4min | 2 tasks | 4 files |
| Phase 06 P04 | 2min | 2 tasks | 1 files |
| Phase 09 P02 | 4min | 1 tasks | 3 files |
| Phase 09 P03 | 191s | 1 tasks | 3 files |
| Phase 09 P01 | 4min | 2 tasks | 6 files |
| Phase 10 P01 | 6min | 3 tasks | 9 files |
| Phase 10 P02 | 4min | 2 tasks | 5 files |
| Phase 10 P03 | 9min | 3 tasks | 6 files |
| Phase 08 P01 | 176s | 2 tasks | 5 files |
| Phase 08 P02 | 6min | 2 tasks | 10 files |
| Phase 08 P03 | 10min | 2 tasks | 6 files |
| Phase 11 P03 | 145s | 4 tasks | 4 files |
| Phase 11 P02 | 240s | 5 tasks | 3 files |
| Phase 11 P01 | 388s | 6 tasks | 9 files |
| Phase 11 P04 | 169s | 5 tasks | 2 files |
| Phase 11 P05 | 333s | 5 tasks | 3 files |
| Phase 11 P07 | 11min | 7 tasks | 5 files |
| Phase 11 P06 | 237s | 3 tasks | 3 files |
| Phase 11 P08 | 180s | 3 tasks | 3 files |
| Phase 11 P09 | 218s | 3 tasks | 3 files |
| Phase 11 P10 | 5min | 5 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Treasury wallets funded 2026-03-26: Deploy 3.0 SOL, Marketplace/Pools/Partner 0.1 SOL each
- Bags partner config PDA not yet created on mainnet
- Devnet USDC limitation: Jupiter swap payment deferred to mainnet testing
- Pool token endpoints validated for code paths; full Bags API testing deferred to mainnet
- On-chain token burn deferred to v2; tokens marked burned in DB only
- Phase 8 (Pools) and Phase 9 (Offer UX & UI) can run in parallel after Phase 7
- [Phase 5.1]: PDA-derived ATA vaults replace arbitrary keypair vaults for deterministic address derivation
- [Phase 5.1]: Removed broken cur_ix CPI gate check; rely solely on enforce_squads_cpi() utility
- [Phase 5.1]: seller_share = sale_price - fee_share eliminates integer division remainder loss
- [Phase 5.1]: Squads CPI gate tested via negative testing (rejection without CPI); full flow deferred to devnet per D-07
- [Phase 5.1]: API routes updated to match new ATA vault layout: mint_a=funds, mint_b=NFT, seller account for rent return
- [Phase 5.1]: txSignature optional on confirm-delivery.ts (defense-in-depth for admin calls, not required for buyer confirmations)
- [Phase 5.1]: confirm_delivery happy-path test verifies preconditions only; full CPI flow deferred to devnet per D-07
- [Phase 06]: 6-hour Vercel cron for escrow timeouts (daily sufficient given day-scale thresholds)
- [Phase 06]: OPS-05 (priority fee) satisfied by existing priorityFees.ts; env var set in Plan 04
- [Phase 06]: R2 upload uses lazy client instantiation to avoid module-level errors when env vars are missing
- [Phase 06]: Deployment scripts are interactive (not automated) since on-chain txs require user wallet signing
- [Phase 06]: Anchor.toml changes via patch file since Solana-Anchor is a git submodule
- [Phase 06]: Treasury marketplace wallet as initial EscrowConfig treasury; update to Squads vault PDA via update_config
- [Phase 06]: Dual-environment setup: local .env keeps devnet for development, Vercel env vars = mainnet for production
- [Phase 09]: LearnMore removed from top nav, moved to dropdown Account section; Vendors link also moved to dropdown-only
- [Phase 09]: 4h amber / 1h red urgency thresholds for offer countdowns; 48h default progress bar duration
- [Phase 08]: Pull/claim distribution model over push model for pool proceeds
- [Phase 08]: On-chain SPL burn with burn_pending fallback; admin can retry
- [Phase 08]: 90-day claim window with admin sweep for unclaimed funds
- [Phase 08]: getLifecycleStage() exported as reusable utility for stepper and browse badges
- [Phase 08]: Pool browse page navigates to /pools/[id] dedicated page instead of modal
- [Phase 08]: PoolCreationStepper uses adminMode prop for D-02 direct pool creation
- [Phase 08]: getLifecycleStage duplicated locally in PoolManagement (parallel worktree; merge reconciles)
- [Phase 11]: Refactored duplicate sol-price.ts proxy to use shared solPriceService (DRY)
- [Phase 11]: Used pool field (not poolId) for index consistency with existing schema
- [Phase 11]: Added bson CJS mapping to jest.config.cjs to enable Mongoose model unit tests
- [Phase 11]: Pre-save hook simplified to P2P-only vendor payment (AMM path removed with orphan fields)
- [Phase 11]: Memo signer uses direct keypair (not Squads proposals) per Pitfall 7; falls back to SQUADS_MEMBER_KEYPAIR
- [Phase 11]: uuid CJS moduleNameMapper in jest.config.cjs fixes jsdom ESM resolution for Solana tests
- [Phase 11]: API endpoint at /api/pool/bridge-to-escrow (singular) matching existing pool route convention
- [Phase 11]: Graduation trigger stubbed as no-op until 11-08; auth follows reconcile-pools CRON_SECRET pattern
- [Phase 11]: Graduation endpoint at /api/pool/graduate (singular) with poolId as param, not /api/pools/[id]/graduate
- [Phase 11]: Admin auth uses getAdminConfig().isAdmin() pattern (requireAdmin does not exist)
- [Phase 11]: confirm-custody at /api/pool/confirm-custody (singular) with poolId param, matching existing convention
- [Phase 11]: list-resale reuses existing Escrow.convertedToPool + Escrow.poolId fields instead of adding new poolBacked field
- [Phase 11]: list-resale uses vault PDA as both admin and seller in initialize instruction (Squads CPI signs both)

### Roadmap Evolution

- Phase 5.1 inserted after Phase 5: Anchor Program Security Hardening (URGENT) — 2 critical, 5 high vulnerabilities found in pre-mainnet audit. Must complete before Phase 6 mainnet deployment.

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Bags partner config PDA — check if created on mainnet (user unsure)~~ RESOLVED 2026-04-12: PDA `9sgH...txXo` exists, env vars corrected.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260405-c3k | Smoke test buy/sell on mainnet bonding curve (72DexA...BAGS) — audit + runbook | 2026-04-05 | 4da37dd | [260405-c3k-smoke-test-buy-sell-on-mainnet-bonding-c](./quick/260405-c3k-smoke-test-buy-sell-on-mainnet-bonding-c/) |

## Session Continuity

Last activity: 2026-04-12 — Wave C executing. 11-10 (list-resale endpoint) complete.
Stopped at: Completed 11-10-PLAN.md
Key context: All Wave 0 resolutions locked. TREASURY_POOLS updated to Squads vault PDA `FJYnuRUvMM9zuiEDMPyuVBMgGs5UtkAKSouTaMTaoqqZ` in .env.local + .env.mainnet. Vercel prod env needs manual update by user.

## 2026-04-10 — Phase 11 Context Captured

Phase 11 (Pool Fee-Funded Rewire) CONTEXT.md written at `.planning/phases/11-pool-fee-funded-rewire/11-CONTEXT.md`.

**Key decision:** Phase 11 supersedes phase 8. Phase 8 code is treated as scaffolding to be rewired in-place; phase 8 will not execute on mainnet as originally scoped.

**Architectural keystone:** Vendor payout reuses the existing marketplace escrow program's `confirm_delivery` (phase 5.1 hardened). Fee graduation triggers a Squads proposal to bridge accumulated Pools Treasury fees into the pool's existing backing escrow PDA. From there, normal marketplace delivery flow applies. Zero new payout logic; maximum reuse of audited primitives.

**Wave 0 (blocking validation) before implementation:**

- 0.1 Bags creator fee payout tx structure (can we attribute to pool from tx alone?)
- 0.2 Marketplace escrow pool-funded bridging (path a, b, or c? does it need new Rust code?)
- 0.3 Production pool inventory (any phase-8-built pools to migrate?)
- 0.4 Bags partner program provisioning (env vars set, earnings flowing?)

**Next command:** `/gsd:plan-phase 11` — researcher will execute Wave 0 investigation as part of the research pass and feed findings into the planner.

## 2026-04-10 — Phase 11 Planning Complete, Approved for Execution

Phase 11 has finished planning. Full artifact inventory:

**Artifacts:**

- `11-CONTEXT.md` (revised 4x post-research) — business invariant + locked decisions
- `11-RESEARCH.md` (995 lines) — wave 0 resolutions + research findings
- `11-VALIDATION.md` (NEW) — test framework, requirements→tests map, success criteria→verification map
- `11-PLAN-INDEX.md` — wave ordering, dependency graph, traceability matrices
- `11-00` through `11-18-PLAN.md` — 19 executable plans

**Verification status:** Plan check ran twice. First pass returned PASS_WITH_WARNINGS (14 PASS, 1 WARN). All 5 recommendations applied. Confirmation check returned PASS / APPROVED FOR EXECUTION.

**Wave structure:**

- Wave 0: 11-00 (blocking validation — 4 runtime tasks + Jupiter swap tx size measurement)
- Wave A: 11-01 through 11-04 (schema, state machine, price service)
- Wave B: 11-05 through 11-08 (claim cron, bridge service, graduation trigger)
- Wave C: 11-09 through 11-11 (custody, resale, distribution snapshot)
- Wave D: 11-12 through 11-14 (holder claim, crons, abort safety valve)
- Wave E: 11-15 through 11-18 (webhooks, UI, SSE, cleanup)

**Total complexity:** ~18 complexity points, 40-50 focused executor hours.

**Architectural keystone locked:** Vendor payout reuses marketplace escrow `confirm_delivery`. Bridge = Jupiter swap (SOL→USDC) + `exchange` instruction via Squads vault proposal. Zero new Rust. Graduation is USD-equivalent comparison with 2% slippage buffer.

**Business invariant locked:** USDC denomination is intentional — vendor receives exact listed USD amount with zero SOL-volatility risk.

**Next command:** `/gsd:execute-phase 11` — Wave 0 must complete before Waves A-E.

## 2026-04-12 — Wave 0 Complete, All Resolutions Captured

### Wave 0 Final Resolutions

| Task | Resolution | Key detail |
|---|---|---|
| 0.1 TREASURY_POOLS type | **EOA → migrating to Squads vault index 1** | User confirmed Squads pivot. Derive vault from existing multisig `5hy7Hgd...VRZor` at index 1. Original EOA `HvAB36TpqVgBRitWSCi9nHUEP6QdWP6jg3kjBqpiQcWU` preserved offline at `/keys/mainnet/` (gitignored). |
| 0.2 Prod pool inventory | **Scenario 2 — 1 pool, not graduated** | `totalPools: 1, withBagsToken: 1, graduated: 0, withSquadDao: 0`. Schema migration in 11-18 (add new fields, no data loss risk). |
| 0.3 Partner config | **EXISTS and env fixed** | Config Key PDA `9sgH...txXo` (ref code `luxhubstudio`, 25% platform fee). Bags wallet: `BDtU37eGbKQwhvMuZYute5zgCxfxcmj5v6GjAvHbHqbg`. User fixed env: `BAGS_PARTNER_WALLET=BDtU37...bHqbg`, `BAGS_PARTNER_CONFIG_PDA=9sgH...txXo` — set in `.env.local`, `.env.mainnet`, and Vercel production. |
| 0.4 Jupiter tx size | **v0+ALT = 798 bytes, fits** | Single-proposal path viable. `BRIDGE_PATTERN=auto` (v0+ALT primary, two-proposal fallback). Legacy (979 bytes) is borderline. |
| 0.5 Test harness | **Setup needed** | Jest OK, `mongodb-memory-server` not installed, `tests/fixtures/` and `tests/integration/` don't exist. First task of 11-01. |

### Squads Pivot Decision (2026-04-12)

**User explicitly chose Squads vault index 1 for TREASURY_POOLS over server-side keypair.**

Rationale: user intentionally kept TREASURY_POOLS keypair off-server for security (stored at `/keys/mainnet/`, gitignored). Squads matches phase 5.1 security posture, keeps all fund movements in one multisig UI, provides revocable authority.

**Impact on plans:**

- `11-05` (poolFeeClaimService): claim via Squads proposal, not direct keypair signing
- `11-07` (poolBridgeService): bridge is vault-to-vault within same multisig (simpler than cross-wallet)
- `11-CONTEXT.md`: needs update to reflect Squads vault as TREASURY_POOLS
- New Wave 0.6 task: derive vault PDA at index 1 from existing multisig, update env vars

### Partner Config Env Fix (2026-04-12)

Was: `BAGS_PARTNER_WALLET=9sgH...txXo` (wrong — this is the PDA, not the wallet), `BAGS_PARTNER_CONFIG_PDA` not set.
Now: `BAGS_PARTNER_WALLET=BDtU37eGbKQwhvMuZYute5zgCxfxcmj5v6GjAvHbHqbg`, `BAGS_PARTNER_CONFIG_PDA=9sgH...txXo`. Set in `.env.local`, `.env.mainnet`, and Vercel production.

### Strategic Context (from user, 2026-04-12)

User's goal: launch the pools feature as the differentiator for crypto Twitter traction. A simple crypto-only watch marketplace won't make noise — the fee-funded tokenized pools feature IS what makes LuxHub interesting and worth tweeting about. Phase 11 is launch-critical, not post-launch polish.

### Pending Updates Before Wave A

These must be applied at the START of the next session (before Wave A executors spawn):

1. **Update `11-CONTEXT.md`:** Replace EOA-based signing with Squads vault index 1. Add Wave 0.6 (derive vault PDA). Update Gray area 2 and Gray area 5 to reference Squads claim path.
2. **Update `11-WAVE-0-FINDINGS.md`:** Add resolution sections for all 5 tasks with the answers above.
3. **Update plan `11-05`:** Claim service uses Squads proposal pattern from `squadsTransferService.ts` instead of keypair signing. Both the `claimPoolFees()` function and the `claim-pool-fees` cron.
4. **Update plan `11-07`:** `BRIDGE_PATTERN=auto` (v0+ALT primary, two-proposal fallback). Bridge is now vault-to-vault transfer within the same multisig (index 0 marketplace vault → index 1 pools vault → backing escrow). Simpler account layout.
5. **Add Wave 0.6 task:** Derive Squads vault PDA at index 1, update `TREASURY_POOLS` env var in `.env.local` + `.env.mainnet` + Vercel, verify on-chain that the new PDA exists and is owned by the Squads multisig.

**Next command:** `/gsd:resume-work` in a fresh context window. Claude reads this STATE.md, applies the 5 pending updates, then executes Wave A (11-01, 11-02, 11-03, 11-04 in parallel).
