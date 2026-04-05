---
phase: 260405-c3k-smoke-test
plan: 01
subsystem: pools / bags-trading
tags: [smoke-test, mainnet, bags, audit, runbook]
requires: [BAGS_API_KEY, NEXT_PUBLIC_SOLANA_ENDPOINT mainnet]
provides: [AUDIT.md, SMOKE-TEST-RUNBOOK.md]
affects: [src/pages/api/bags/trade-quote.ts, src/pages/api/bags/execute-trade.ts, src/components/pool/TradeWidget.tsx]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/quick/260405-c3k-smoke-test-buy-sell-on-mainnet-bonding-c/AUDIT.md
    - .planning/quick/260405-c3k-smoke-test-buy-sell-on-mainnet-bonding-c/SMOKE-TEST-RUNBOOK.md
  modified: []
decisions:
  - "Docs-only quick task; no code changes despite finding 2 medium-severity slippage bugs (deferred to follow-up)"
  - "Default 1% slippage path is safe for smoke test; non-default slippage requires fix"
metrics:
  duration: ~5min
  completed: 2026-04-05
---

# Quick Task 260405-c3k: Smoke Test Buy/Sell on Mainnet (Bonding Curve) Summary

Read-only audit of Bags trade-quote + execute-trade endpoints and TradeWidget UI, plus a mainnet buy/sell smoke-test runbook for pool token `72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS`.

## What Was Built

- **AUDIT.md** — 5-section audit covering endpoint surfaces, UI entry point, env deps, gaps/risks, and pool lookup commands
- **SMOKE-TEST-RUNBOOK.md** — Pre-flight checklist, two-test procedure (BUY 0.02 SOL → token, SELL token → SOL), edge cases, observability plan, debug checklist

## Audit Findings

**No blocking gaps.** Two medium-severity bugs flagged for follow-up (do not block default-1%-slippage smoke test):

1. **Slippage mode mismatch** between `trade-quote.ts` and `execute-trade.ts`:
   - `trade-quote` sends `slippageMode=manual` only when `slippageBps !== '100'`
   - `execute-trade` always sends `slippageBps` without `slippageMode`
   - Impact: at non-default slippage the executed quote may differ from displayed quote

2. **Custom slippage input is inert** in TradeWidget:
   - Component computes `effectiveSlippage` (line 187-189) but passes raw `slippageBps` to both API calls
   - Impact: User-typed custom slippage has no effect; only the 0.5/1/3% pills work

Low-severity informational items: no graduated-pool gate in endpoints, no tx signature persisted server-side, 5s edge cache on quote, ATA creation rent not explicitly documented for user.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `c337bb6` docs(260405-c3k-smoke-test-01): add trade endpoint wiring audit
- `aba8fcd` docs(260405-c3k-smoke-test-02): add mainnet buy/sell smoke-test runbook

## Next Step (user)

Follow SMOKE-TEST-RUNBOOK.md steps on mainnet with ~0.02 SOL. Report back buy + sell signatures + pass/fail per test. If slippage bugs block the test, file a follow-up quick task to wire `effectiveSlippage` and align `slippageMode` between endpoints.

## Self-Check: PASSED

- FOUND: `.planning/quick/260405-c3k-smoke-test-buy-sell-on-mainnet-bonding-c/AUDIT.md`
- FOUND: `.planning/quick/260405-c3k-smoke-test-buy-sell-on-mainnet-bonding-c/SMOKE-TEST-RUNBOOK.md`
- FOUND: commit c337bb6
- FOUND: commit aba8fcd
