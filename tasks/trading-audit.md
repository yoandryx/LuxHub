# LuxHub Trading System Audit Report

**Date:** 2026-03-16
**Auditor Perspective:** Crypto-native day trader, memecoin analyst, CT researcher
**Scope:** Full trading flow from pool creation through bonding curve buy/sell, secondary market, webhooks, and UX

---

## SEVERITY LEGEND

- **P0 CRITICAL** -- Users can lose funds, exploitable
- **P1 HIGH** -- Serious UX/security gap, will lose traders
- **P2 MEDIUM** -- Missing expected feature, friction
- **P3 LOW** -- Nice-to-have, polish

---

## 1. CRITICAL ISSUES (P0)

### 1.1 Fake Chart Data -- Users Trading on Fiction

**Severity: P0 CRITICAL**
**Files:**
- `src/components/marketplace/TvChart.tsx:229-241` (`generatePriceHistory`)
- `src/pages/pools.tsx:400-407` (`generatePriceHistory` duplicate)
- `src/components/marketplace/PoolDetail.tsx:180` (chart data source)

**Problem:** The candlestick/area/line charts displayed to users are 100% fabricated. `generatePriceHistory` takes a base price and generates random walk data with an artificial upward bias (`drift = basePrice * 0.002`). The volume histogram in `TvChart.tsx:143-149` is `Math.random() * 1000 + 100` -- pure fiction.

Users see professional-looking TradingView candles and think they're looking at real price action. They make buy/sell decisions based on fake chart patterns. This is textbook market manipulation even if unintentional.

**Impact:** A trader opens a pool, sees green candles trending up, buys in thinking momentum is strong. The real price could be going the opposite direction. On pump.fun or DEX Screener, charts reflect actual on-chain trades. Here they reflect nothing.

**Fix:** Either (a) pull real trade history from Bags API / MongoDB `recentTrades` and plot actual OHLC data, or (b) clearly label the chart as "Simulated" / "Illustration Only" with a prominent banner. Never show fake volume data.

---

### 1.2 Fallback Sell Path Has No On-Chain Execution -- Users Get Nothing

**Severity: P0 CRITICAL**
**File:** `src/pages/api/pool/sell.ts:210-297`

**Problem:** The MongoDB-only fallback sell path (for pools without Bags tokens) updates participant records in the database but never sends any SOL/USDC back to the seller. It decrements `participant.shares` and `pool.sharesSold`, logs `$${netUSD.toFixed(2)} net`, and returns success -- but there is zero on-chain transaction. The user's token balance in the DB goes down, they receive no funds.

**Impact:** If someone sells in a non-Bags pool, their position is deleted from MongoDB but they receive $0. This is a complete loss of funds with a green "success" message.

**Fix:** Either (a) the fallback sell must construct and execute an on-chain SOL transfer from an escrow/treasury account to the seller, verified before updating MongoDB, or (b) disable the sell button entirely for non-tokenized pools and show a message that selling is only available for Bags-tokenized pools.

---

### 1.3 Fallback Buy Path Sends SOL Directly to Treasury -- No Escrow

**Severity: P0 CRITICAL**
**File:** `src/components/marketplace/PoolDetail.tsx:252-278`

**Problem:** For pools without a Bags token, the buy flow sends SOL directly to the LuxHub treasury wallet (or vendor wallet) via `SystemProgram.transfer`. There is no escrow PDA, no refund mechanism, and no way for the user to exit before the pool fills. The code at line 254 does:

```typescript
const treasury = new PublicKey(process.env.NEXT_PUBLIC_LUXHUB_WALLET || p.vendorWallet || '');
```

If `NEXT_PUBLIC_LUXHUB_WALLET` is unset and `vendorWallet` is empty, this creates a `PublicKey('')` which will throw, but more importantly -- funds sent here are irrecoverable by the user.

**Impact:** Users are told "On-chain escrow. Exit before pool fills." at line 557 but this is false for non-Bags pools. Their SOL goes to a regular wallet with no programmatic exit.

**Fix:** Non-tokenized pools should use the Anchor escrow program or disable direct SOL transfers entirely. The UI text "On-chain escrow" is misleading and should be conditioned on whether escrow is actually used.

---

### 1.4 Transaction Replay / Double-Spend in Invest Endpoint

**Severity: P0 CRITICAL**
**File:** `src/pages/api/pool/invest.ts:54-68`

**Problem:** `verifyTransactionForWallet` only checks that a transaction exists on-chain, is confirmed, and involves the expected wallet. It does NOT check:
- Whether this txSignature has already been used for another investment
- Whether the transaction actually transferred the correct amount of SOL
- Whether the destination was the correct treasury/escrow

An attacker can:
1. Send 0.01 SOL to the treasury (legitimate small tx)
2. Call `/api/pool/invest` with that txSignature but claim `shares: 100000, investedUSD: 50000`
3. The endpoint verifies the tx exists and the wallet signed it -- passes
4. Attacker gets credited with $50K of shares for a $0.01 payment

**Impact:** Complete pool drain. Attacker can claim unlimited shares with minimal SOL.

**File:** `src/lib/services/txVerification.ts:57-106`

The `verifyTransactionForWallet` function at line 81-91 checks account keys but never verifies transfer amounts or instruction data.

**Fix:**
1. Add a `usedTxSignatures` set (or DB collection) to prevent replay
2. Parse the transaction instructions to verify the actual SOL transfer amount matches `investedUSD` (converted to lamports)
3. Verify the destination matches the expected treasury/escrow address
4. Consider using the Anchor escrow program instead of raw SOL transfers

---

### 1.5 Buy/Sell API Endpoints Have No Authentication

**Severity: P0 CRITICAL**
**Files:**
- `src/pages/api/pool/buy.ts:17-163`
- `src/pages/api/pool/sell.ts:18-305`

**Problem:** Neither `/api/pool/buy` nor `/api/pool/sell` verify that the caller actually controls the `buyerWallet`/`sellerWallet` they claim to be. Any unauthenticated HTTP request can:
1. Call `/api/pool/buy` with any wallet address to get a pre-built swap transaction
2. The transaction itself requires wallet signing, so the buy path is partially protected by Bags
3. BUT the sell fallback path (non-Bags pools, lines 210-297) modifies MongoDB directly with zero authentication -- anyone can call it with any wallet to manipulate other users' share balances

**Impact:** For non-Bags pools, an attacker can zero out any participant's shares by calling the sell endpoint with their wallet address.

**Fix:** Both endpoints need wallet signature verification via the `walletAuth` middleware (like `pool/create.ts` uses `withWalletValidation`). The sell fallback path is especially dangerous.

---

## 2. UX GAPS (P1-P2)

### 2.1 No Solscan/Explorer Links After Trades

**Severity: P1 HIGH**
**File:** `src/components/marketplace/PoolDetail.tsx:250, 263`

**Problem:** After a successful buy/sell on the bonding curve, the user sees a generic "Bought X tokens" or "Sold X tokens" message but no transaction signature link. The `BagsPoolTrading.tsx` component at line 478-486 does show a Solscan link, but `PoolDetail.tsx` (the primary trading interface) does not.

Crypto natives expect to immediately verify their trade on Solscan. Without this, users will panic-check their wallet history.

**Fix:** Store the `sig` variable from lines 236/242 into state and display a clickable Solscan link in the success message.

---

### 2.2 No Price Impact Warning

**Severity: P1 HIGH**
**File:** `src/components/marketplace/PoolDetail.tsx:148-152`

**Problem:** The buy panel calculates `tokensOut` using a static `curPriceSol` (line 152) without accounting for bonding curve price impact. A user buying 5 SOL might expect 500K tokens at current price, but the bonding curve means they'll get progressively fewer tokens as price moves up during their purchase.

The sell panel has the same issue at lines 162-164 -- `sellSol = sellTkns * curPriceSol` assumes flat price.

Pump.fun shows price impact prominently. DEX Screener routes show exactly what you'll receive.

**Fix:** Show the actual quote from the Bags API response (which includes `priceImpact` and `minOutputAmount`) in the UI before the user confirms. The buy API already returns this data at `buyData.quote.priceImpact` but it's never displayed.

---

### 2.3 Hardcoded 2% Slippage -- No User Control

**Severity: P2 MEDIUM**
**Files:**
- `src/components/marketplace/PoolDetail.tsx:222` (buy: `slippageBps: 200`)
- `src/components/marketplace/PoolDetail.tsx:308` (sell: `slippageBps: 200`)

**Problem:** Slippage is hardcoded at 2% (200 bps) with no way for the user to adjust. On pump.fun, traders set slippage from 0.5% to 50%+ depending on volatility. 2% is too much for stable pools (leaves money on the table) and potentially too little for fast-moving ones (tx fails).

**Fix:** Add a slippage settings gear icon (like Jupiter/Raydium) with preset options (0.5%, 1%, 2%, 5%, custom). Store in localStorage.

---

### 2.4 No Real-Time Price Updates

**Severity: P2 MEDIUM**
**File:** `src/hooks/usePools.ts:133-149`

**Problem:** Pool list refreshes every 60 seconds (`refreshInterval: 60000`). Pool status refreshes every 15 seconds. Trade quotes refresh every 10 seconds. During active trading, prices can move significantly in 15-60 seconds on a bonding curve.

Compare to: pump.fun updates in real-time via WebSocket. DEX Screener refreshes every 2-5 seconds.

**Fix:** For the active trading view (PoolDetail), reduce refresh to 5 seconds or implement WebSocket/SSE for real-time price streaming from Bags webhooks.

---

### 2.5 No Transaction History Per User

**Severity: P2 MEDIUM**

**Problem:** There's no way for a user to see their own trade history for a pool. The trade feed shows recent trades from all users (last 5-6), truncated wallet addresses, with no ability to filter "my trades." Users want to see their cost basis, entry prices, and P&L.

**Fix:** Add a "My Trades" tab or section in PoolDetail that filters `recentTrades` by the connected wallet, and/or query the Transaction model for the user's trade history.

---

### 2.6 Pool Card Shows "Invest Now" Language

**Severity: P2 MEDIUM (Legal)**
**File:** `src/components/marketplace/PoolCard.tsx:268`

**Problem:** The CTA button says "Invest Now" and the progress label says "shares" (line 205). Per the legal language rules in MEMORY.md, "invest", "shares", and "ROI" should never appear in UI. The `roiPercent` badge at line 120-121 and `projectedROI` field are also violations.

**Fix:** Replace with "Contribute Now", "tokens", "est. returns" per legal language rules. Also the `pools.tsx` card uses "shares" at lines 205, 612.

---

### 2.7 No Mobile Wallet Deep Link Support

**Severity: P2 MEDIUM**
**File:** `src/components/marketplace/PoolDetail.tsx:118-133`

**Problem:** The `sendTx` function handles wallet adapter and Privy but doesn't account for mobile wallet apps (Phantom mobile, Solflare mobile). On mobile, `VersionedTransaction` signing via `signTransaction` may fail silently or show confusing errors because mobile wallets handle transaction serialization differently.

**Fix:** Test the full flow on Phantom mobile. Consider adding `sendTransaction` preference over `signTransaction` + `sendRawTransaction` for better mobile compatibility.

---

## 3. SECURITY CONCERNS (P0-P1)

### 3.1 Webhook Signature Bypass in Development

**Severity: P1 HIGH**
**File:** `src/pages/api/webhooks/bags.ts:577-586`

**Problem:** If `BAGS_WEBHOOK_SECRET` is not set AND `NODE_ENV !== 'production'`, webhook signature verification is silently skipped (line 577: `if (secret) { ... }`). In dev/staging, anyone can send fake webhook events to manipulate pool stats, fake trades, trigger graduation, or create fraudulent treasury deposits.

The production path at line 583-585 properly rejects unsigned webhooks, but dev/preview environments on Vercel may not have `NODE_ENV=production` set correctly.

**Fix:** Always require webhook signature verification. For local dev, use a known test secret rather than bypassing entirely.

---

### 3.2 Internal Webhook Auth Uses Predictable Token

**Severity: P1 HIGH**
**File:** `src/pages/api/webhooks/bags.ts:364`

**Problem:** The `triggerSquadCreation` function calls `/api/pool/finalize` with `'x-internal-webhook': process.env.BAGS_WEBHOOK_SECRET || 'internal'`. If `BAGS_WEBHOOK_SECRET` is not set, the auth header is the literal string `'internal'`. Any attacker who discovers this can trigger Squad DAO creation for any pool, potentially seizing governance.

**Fix:** Never use fallback secrets. Require `BAGS_WEBHOOK_SECRET` to be set and fail hard if missing.

---

### 3.3 No Rate Limiting on Buy/Sell Endpoints

**Severity: P1 HIGH**
**Files:**
- `src/pages/api/pool/buy.ts`
- `src/pages/api/pool/sell.ts`

**Problem:** Neither endpoint has rate limiting. A bot can spam the buy endpoint to get millions of quotes and swap transactions per minute, potentially DDoS-ing the Bags API (using LuxHub's API key). The sell fallback path can be spammed to manipulate pool state rapidly.

The webhook handler at `bags.ts:662` does use `webhookLimiter`, but the trading endpoints are wide open.

**Fix:** Apply rate limiting middleware. Consider per-wallet rate limits (e.g., 10 trades/minute).

---

### 3.4 MEV / Front-Running Exposure

**Severity: P1 HIGH**
**File:** `src/components/marketplace/PoolDetail.tsx:207-248`

**Problem:** The buy flow is a two-step process:
1. Client calls `/api/pool/buy` which gets a quote AND builds the swap tx from Bags
2. Client signs and submits the tx

Between step 1 and step 2, the quote can become stale. Worse, since the API call reveals the user's intent (buy X tokens for Y SOL), a MEV bot monitoring the LuxHub API or network could front-run by buying tokens first, pushing the price up, then selling after the user's tx lands.

The 2% hardcoded slippage at line 222 gives MEV bots a guaranteed 2% profit window per sandwich.

**Fix:**
- Reduce default slippage
- Add priority fee support (`computeUnitPrice`) to the transaction for faster inclusion
- Consider using Jito bundles for front-running protection
- Display a warning when price impact + slippage exceeds a threshold (e.g., 3%)

---

### 3.5 Bags API Key Exposed in Server-Side Calls -- No Key Rotation Plan

**Severity: P2 MEDIUM**
**Files:** All `/api/bags/*` and `/api/pool/buy.ts`, `/api/pool/sell.ts`

**Problem:** A single `BAGS_API_KEY` is used for all Bags API interactions. If compromised, an attacker can:
- Create tokens on LuxHub's behalf
- Execute trades using LuxHub's partner account
- Configure fee shares
- Query partner stats

There's no key rotation mechanism, no per-endpoint key scoping, and no request signing beyond the API key header.

**Fix:** Implement key rotation procedures. Monitor Bags API usage for anomalies. Consider IP-restricting the API key if Bags supports it.

---

## 4. TRADING FEATURE GAPS (P2-P3)

### 4.1 No Limit Orders

**Severity: P2 MEDIUM**

**Problem:** Only market orders are supported. Serious traders expect to set buy limits ("buy at X price") and sell limits ("sell when price hits Y"). Without limit orders, users must constantly monitor prices and manually execute.

On pump.fun/Raydium, limit orders are standard.

**Fix:** Implement a limit order book stored in MongoDB. A background job checks current bonding curve price against open orders and executes when conditions are met.

---

### 4.2 No Take-Profit / Stop-Loss

**Severity: P2 MEDIUM**

**Problem:** No automated exit strategy. Traders can't set "sell if price drops 20%" or "sell if price hits 2x." This is table stakes for any trading terminal.

**Fix:** Build on top of limit order system. Store TP/SL levels per position.

---

### 4.3 No Token Alerts / Price Notifications

**Severity: P2 MEDIUM**

**Problem:** No way to get notified when a pool token hits a certain price, when a new pool launches, or when large trades happen. Traders live on alerts.

**Fix:** Implement notification system (already have `NotificationBell` component) with configurable price alerts.

---

### 4.4 No Market Cap Display

**Severity: P2 MEDIUM**
**File:** `src/components/marketplace/PoolDetail.tsx`

**Problem:** Market cap is never shown in the UI despite being tracked in the Pool model (`lastMarketCap`). Every pump.fun/DEX Screener user thinks in market cap. "The token is at $50K mcap" is how CT talks about tokens.

**Fix:** Display market cap prominently: `mcap = currentPrice * totalSupply`. Show it in the top bar alongside price.

---

### 4.5 No Holder Distribution View

**Severity: P2 MEDIUM**

**Problem:** No way to see the top holders, holder concentration, or whether a single wallet holds a dangerous percentage. On DEX Screener, the "Holders" tab shows top 10 wallets with their percentages. This is critical for rug-pull detection.

**Fix:** Display `participants` data sorted by ownership percentage. Flag if top wallet holds >20%. Show holder growth/decline over time.

---

### 4.6 No Trading Volume Timeframes

**Severity: P3 LOW**
**File:** `src/components/marketplace/PoolDetail.tsx:402`

**Problem:** Volume is shown as a single lifetime total. Traders want: 5m / 1h / 6h / 24h volume. "Volume" without timeframe context is meaningless.

**Fix:** Track volume by time bucket in the webhook handler and display 24h volume as the primary metric.

---

### 4.7 No Buy/Sell Ratio or Order Flow

**Severity: P3 LOW**

**Problem:** The trade feed shows individual trades but there's no aggregated buy/sell pressure indicator. Traders want to see "60% buys / 40% sells in last hour" to gauge sentiment.

**Fix:** Calculate buy/sell counts from `recentTrades` and display as a ratio bar.

---

### 4.8 No Token Address Copy Button

**Severity: P3 LOW**
**File:** `src/components/marketplace/BagsPoolTrading.tsx:342-344`

**Problem:** The token mint address is displayed truncated with no copy button. Traders need to copy the full mint address to check it on Solscan, Birdeye, or DEX Screener.

**Fix:** Add a click-to-copy icon next to the truncated mint address.

---

## 5. SPECIFIC CODE FIXES

### 5.1 Token Count Calculation Uses Wrong Math

**File:** `src/components/marketplace/PoolDetail.tsx:152`
```typescript
const tokensOut = curPriceSol > 0 ? Math.floor(solIn / curPriceSol) : 0;
```

**Problem:** This divides SOL input by price-per-token-in-SOL, giving tokens out. But `curPriceSol` is derived from `curPriceUSD / solPriceInUSD` (line 149), which is the price of one token in SOL. For a 1B supply pool with $50K target, each token is $0.00005, which at $130/SOL is ~0.000000384 SOL. So 1 SOL would give ~2.6M tokens. This math is correct IF `curPriceUSD` is accurate -- but it uses `pool.currentBondingPrice || pool.lastPriceUSD || pool.sharePriceUSD` which may be stale or initial values.

**Recommendation:** Always use the live quote from Bags API for the display, not the stored DB price.

---

### 5.2 Sell Quote for Non-Bags Uses USD as "minSolOutput"

**File:** `src/components/marketplace/PoolDetail.tsx:349`
```typescript
minSolOutput: sellUsd * 0.97 * 0.98, // 3% fee + 2% slippage
```

**Problem:** `sellUsd` is in USD, but the parameter is called `minSolOutput`. The server at `sell.ts:234` compares this against `netUSD` which is also in USD, so the comparison works by accident. But the naming is dangerously misleading and if anyone later converts to actual SOL values, this breaks silently.

**Fix:** Rename the parameter to `minOutputUSD` and clarify units on both sides.

---

### 5.3 Error Swallowed on Versioned Transaction Fallback

**File:** `src/components/marketplace/PoolDetail.tsx:243`
```typescript
} catch {
  // Fallback to legacy Transaction
  const tx = Transaction.from(txBuf);
  sig = await sendTx(tx, connection);
}
```

**Problem:** If `VersionedTransaction.deserialize` fails, the error is silently swallowed and a legacy `Transaction` deserialization is attempted. If Bags returns a versioned transaction (which it typically does), the first deserialize should work. If it fails, the error contains useful diagnostic information that's being discarded. The fallback to legacy `Transaction.from` on a versioned tx buffer will produce a corrupt transaction.

**Fix:** Log the error in the catch block. Only fall back to legacy if the error is specifically about versioned transaction support.

---

### 5.4 Pool List Exposes Full Participant Data

**File:** `src/pages/api/pool/list.ts:110-115`

**Problem:** The pool list endpoint returns all participant wallets, shares, ownership percentages, and invested amounts for every pool. This leaks:
- Which wallets are invested in which pools
- How much each wallet invested
- Full position sizing data

This is a privacy concern and gives competitors/attackers free intelligence.

**Fix:** Only return aggregated stats (total participants, total invested) in the list view. Full participant data should only be available in a single-pool detail endpoint, and wallet addresses should be truncated for non-admin callers.

---

### 5.5 Race Condition in Pool Status Transition

**File:** `src/pages/api/pool/sell.ts:269-271`
```typescript
if (pool.status === 'filled' && pool.sharesSold < pool.totalShares) {
  pool.status = 'open';
}
```

**Problem:** The sell endpoint can revert a pool from "filled" back to "open" when someone sells shares. But between the `Pool.findById` and `pool.save()`, another user could have triggered the "filled" status via a buy. There's no optimistic locking, no `findOneAndUpdate` with conditions, and no version check.

**Fix:** Use `Pool.findOneAndUpdate` with `{ status: 'filled', sharesSold: { $lt: pool.totalShares } }` as the query condition to atomically update only if the condition still holds.

---

### 5.6 Webhook Trade Amount Calculation May Be Wrong

**File:** `src/pages/api/webhooks/bags.ts:147`
```typescript
const tradeAmountUSD = priceUSD ? parseFloat(outputAmount) * priceUSD : 0;
```

**Problem:** This multiplies `outputAmount` (tokens received) by `priceUSD` (price per token?). But `priceUSD` from the webhook event might be the token price, in which case `outputAmount * priceUSD` gives the total USD value. However, the semantics of `priceUSD` in the Bags webhook payload are unclear -- it could be price per unit of input mint, not output. If `priceUSD` is the SOL price in USD (common in Solana trade events), then this calculation is completely wrong.

**Fix:** Clarify with Bags API docs what `priceUSD` represents. Consider computing USD value from `inputAmount` * known SOL price instead.

---

## 6. ARCHITECTURE OBSERVATIONS

### 6.1 Two Parallel Trading Systems

The codebase maintains two completely separate trading paths:
1. **Bags bonding curve** (PoolDetail.tsx buy/sell with Bags API)
2. **MongoDB fallback** (direct SOL transfer + DB accounting)

The fallback system is dangerous and should be deprecated. It creates false safety guarantees, has no real escrow, and allows the critical vulnerabilities listed above. The entire fallback path should be removed or clearly marked as "demo only."

### 6.2 No Unified Quote Flow

BagsPoolTrading.tsx fetches quotes independently from PoolDetail.tsx. Neither component shares quote data. If a user switches between the "Buy/Sell" and "Trade" tabs, they see inconsistent prices because each fetches separately with different refresh intervals.

### 6.3 Token Status Gate Is UI-Only

The `tokenStatus` field controls whether the "Trade" tab appears, but the API endpoints (`pool/buy`, `pool/sell`) don't check `tokenStatus`. A user who discovers the API can trade tokens that are supposed to be "locked" or "frozen."

**Fix:** Add `tokenStatus` validation in `pool/buy.ts` and `pool/sell.ts`.

---

## 7. SUMMARY

### Must-Fix Before Any Real Money (P0):
1. Remove or clearly label fake chart data
2. Fix/remove the non-Bags sell fallback (users lose funds)
3. Fix/remove non-Bags buy path (no real escrow)
4. Prevent tx signature replay in invest endpoint
5. Add authentication to buy/sell endpoints

### Must-Fix Before Mainnet (P1):
6. Add Solscan links after all trades
7. Show real price impact from Bags quotes
8. Enforce webhook signature in all environments
9. Fix internal webhook auth fallback
10. Add rate limiting to trading endpoints
11. Address MEV exposure with priority fees

### Should-Fix for Trader Adoption (P2):
12. User-configurable slippage
13. Real-time price updates (5s or WebSocket)
14. Market cap display
15. Top holders view
16. Fix legal language violations
17. Trade history per user
18. Limit orders

### Nice-to-Have (P3):
19. Volume by timeframe
20. Buy/sell pressure ratio
21. Token address copy button
22. Mobile wallet deep link testing

---

*This audit covers the trading flow only. Smart contract (Anchor), multisig (Squads), and vendor onboarding flows were not in scope.*
