# LuxHub Devnet Trading Simulation Results

**Date:** 2026-03-16T08:06:07.762Z
**Pool ID:** 69b7a18eabd030f2c972cf98
**Token Mint:** NOT CREATED
**Network:** Solana Devnet
**Admin Wallet:** 6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X

## Token Creation
- **Status:** FAILED
- **Mint Address:** N/A
- **TX Signature:** N/A
- **Error:** Failed to create token info via Bags API

## Test Wallets

| Name | Address | SOL Spent | SOL Received | Token Balance | Net P&L |
|------|---------|-----------|--------------|---------------|---------|
| whale | `B4KsbqhD...` | 0.0000 | 0.0000 | 0 | +0.0000 |
| retail1 | `CwaVxZ9L...` | 0.0000 | 0.0000 | 0 | +0.0000 |
| retail2 | `679u5C9w...` | 0.0000 | 0.0000 | 0 | +0.0000 |
| dayTrader | `HcCyK3Rh...` | 0.0000 | 0.0000 | 0 | +0.0000 |
| sniper | `8BNW6vjw...` | 0.0000 | 0.0000 | 0 | +0.0000 |

## Trade Summary

- **Total trades attempted:** 9
- **Successful:** 0
- **Failed:** 9
- **Success rate:** 0.0%
- **Buy trades:** 8 (0 succeeded)
- **Sell trades:** 0 (0 succeeded)

## Detailed Trade Log

| # | Scenario | Wallet | Action | Amount | Success | Impact | TX |
|---|----------|--------|--------|--------|---------|--------|----|
| 1 | Token Creation | admin | CREATE_TOKEN | N/A | NO | - | ERR: Failed to create token info via Bags API |
| 2 | A: Retail Accumulation | retail1 | BUY | 0.1 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 3 | A: Retail Accumulation | retail2 | BUY | 0.5 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 4 | B: Whale Entry | whale | BUY | 5 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 5 | C: Day Trader Scalp | dayTrader | BUY | 1 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 6 | D: Sniper (entry) | sniper | BUY | 0.5 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 7 | E: Reload for sell pressure | retail1 | BUY | 0.3 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 8 | E: Reload for sell pressure | retail2 | BUY | 0.3 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |
| 9 | E: Reload for sell pressure | whale | BUY | 2 SOL | NO | - | ERR: Pool does not have a token yet. Token mu |

## Scenario Analysis

### Token Creation
- Trades: 1 (0 ok, 1 failed)
  - admin CREATE_TOKEN  => FAIL: Failed to create token info via Bags API

### A: Retail Accumulation
- Trades: 2 (0 ok, 2 failed)
  - retail1 BUY 0.1 => FAIL: Pool does not have a token yet. Token must be created first.
  - retail2 BUY 0.5 => FAIL: Pool does not have a token yet. Token must be created first.

### B: Whale Entry
- Trades: 1 (0 ok, 1 failed)
  - whale BUY 5 => FAIL: Pool does not have a token yet. Token must be created first.

### C: Day Trader Scalp
- Trades: 1 (0 ok, 1 failed)
  - dayTrader BUY 1 => FAIL: Pool does not have a token yet. Token must be created first.

### D: Sniper
- Trades: 1 (0 ok, 1 failed)
  - sniper BUY 0.5 => FAIL: Pool does not have a token yet. Token must be created first.

### E: Reload for sell pressure
- Trades: 3 (0 ok, 3 failed)
  - retail1 BUY 0.3 => FAIL: Pool does not have a token yet. Token must be created first.
  - retail2 BUY 0.3 => FAIL: Pool does not have a token yet. Token must be created first.
  - whale BUY 2 => FAIL: Pool does not have a token yet. Token must be created first.

## Final Pool State

- **Status:** open
- **Bags Token Mint:** NONE
- **Bonding Curve Active:** false
- **Current Price:** $0.0000135
- **Shares Sold:** 2858194 / 1000000000
- **Total Trades:** 0
- **Total Volume USD:** $0
- **Accumulated Fees:** $0
- **Participants:** 1
- **Target Amount:** $13500

## Errors and Issues

- **8x:** Pool does not have a token yet. Token must be created first.
- **1x:** Failed to create token info via Bags API

## Assessment

### What Worked
- (No trades succeeded -- see errors above)

### What Needs Fixing
- Bags token creation failed -- pool has no on-chain token
- Buy endpoint not returning successful trades
- Token Creation: Failed to create token info via Bags API
- A: Retail Accumulation: Pool does not have a token yet. Token must be created first.
- A: Retail Accumulation: Pool does not have a token yet. Token must be created first.
- B: Whale Entry: Pool does not have a token yet. Token must be created first.
- C: Day Trader Scalp: Pool does not have a token yet. Token must be created first.

## Raw API Responses (sample)

### Token Creation - admin CREATE_TOKEN
```json
{
  "error": "Failed to create token info via Bags API",
  "details": {}
}
```

### A: Retail Accumulation - retail1 BUY
```json
{
  "error": "Pool does not have a token yet. Token must be created first."
}
```

### A: Retail Accumulation - retail2 BUY
```json
{
  "error": "Pool does not have a token yet. Token must be created first."
}
```

### B: Whale Entry - whale BUY
```json
{
  "error": "Pool does not have a token yet. Token must be created first."
}
```

### C: Day Trader Scalp - dayTrader BUY
```json
{
  "error": "Pool does not have a token yet. Token must be created first."
}
```

### D: Sniper (entry) - sniper BUY
```json
{
  "error": "Pool does not have a token yet. Token must be created first."
}
```
