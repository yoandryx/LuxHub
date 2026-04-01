---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Mainnet & Pools
status: Ready to execute
stopped_at: Completed 10-02-PLAN.md
last_updated: "2026-04-01T13:29:39.972Z"
last_activity: 2026-04-01
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 17
  completed_plans: 14
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Every purchase is protected by on-chain escrow -- funds held in PDA until buyer confirms delivery, then split 97% vendor / 3% treasury automatically.
**Current focus:** Phase 10 — ai-bulk-inventory-upload

## Current Position

Phase: 10 (ai-bulk-inventory-upload) — EXECUTING
Plan: 3 of 4
Execution order: Phase 9 → 10 → 8

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

### Roadmap Evolution

- Phase 5.1 inserted after Phase 5: Anchor Program Security Hardening (URGENT) — 2 critical, 5 high vulnerabilities found in pre-mainnet audit. Must complete before Phase 6 mainnet deployment.

### Pending Todos

None yet.

### Blockers/Concerns

- Bags partner config PDA — check if created on mainnet (user unsure)

## Session Continuity

Last activity: 2026-04-01
Stopped at: Completed 10-02-PLAN.md
Key context: confirm_delivery proven on mainnet (TX: 3VqZFwcr...), 8 bugs fixed, program redeployed 2x. Offers still need confirm_delivery flow.
