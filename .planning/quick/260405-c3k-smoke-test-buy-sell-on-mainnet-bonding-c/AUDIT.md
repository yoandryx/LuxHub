# AUDIT: Bags Trade Endpoints + TradeWidget Wiring

**Scope:** Read-only audit of buy/sell path for pool token `72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS` on mainnet.
**Date:** 2026-04-05
**Files reviewed:**
- `src/pages/api/bags/trade-quote.ts`
- `src/pages/api/bags/execute-trade.ts`
- `src/components/pool/TradeWidget.tsx`
- `src/pages/pools/[id].tsx`

---

## 1. Endpoint Surface

### `GET /api/bags/trade-quote`

**Query params:** `poolId`, `inputMint`, `outputMint`, `amount` (required), `slippageBps` (default `100`).

**Validation:**
- `amount` required → 400 if missing
- `BAGS_API_KEY` env required → 500 if missing
- If `poolId` passed: Mongo lookup `Pool.findById(poolId)`, rejects if not found or soft-deleted, rejects if `bagsTokenMint` missing
- Requires `finalInputMint` + `finalOutputMint` after resolution → 400 otherwise

**Flow:**
1. Resolve mints (poolId → bagsTokenMint; default output USDC if only poolId)
2. `GET https://public-api-v2.bags.fm/api/v1/trade/quote` with `x-api-key`
3. Returns normalized `quote` object + `raw` Bags response

**Slippage handling (IMPORTANT — inconsistent with execute-trade):**
```ts
if (slippageBps && slippageBps !== '100') {
  quoteUrl.searchParams.set('slippageMode', 'manual');
  quoteUrl.searchParams.set('slippageBps', slippageBps);
}
```
→ When `slippageBps === '100'` (the default 1%), **no slippage params are sent** — Bags uses its `auto` mode.
→ When user picks 0.5% (`50`) or 3% (`300`), `slippageMode=manual` + explicit `slippageBps` are sent.

**Cache:** `s-maxage=5, stale-while-revalidate=10` (Vercel edge cache).

**Error paths:** All failures → 500 with `{ error, details }`.

---

### `POST /api/bags/execute-trade`

**Body:** `poolId`, `inputMint`, `outputMint`, `amount` (required), `userWallet` (required), `slippageBps` (default `100`).

**Validation:**
- `amount` + `userWallet` required → 400
- `BAGS_API_KEY` env required → 500
- Same pool lookup / mint resolution as trade-quote

**Flow:**
1. Fetch fresh quote (`GET /trade/quote`) — always sends `slippageBps` **without `slippageMode`**
2. Build swap tx (`POST /trade/swap`) with `{ quoteResponse, userPublicKey }`
3. Returns `{ transaction: { serialized, lastValidBlockHeight } }`

**⚠ Slippage mismatch (flagged by plan):**
- `trade-quote.ts` only sends `slippageBps` when `!== '100'` AND pairs it with `slippageMode=manual`.
- `execute-trade.ts` always sends `slippageBps` but **never** sends `slippageMode=manual`.
- **Risk:** If Bags API requires `slippageMode=manual` for any custom `slippageBps` to take effect, then `execute-trade` may silently fall back to auto slippage mode, producing a quote-refresh that differs from what the UI showed the user.
- **Severity:** Medium. Default 100 bps (1%) path is unaffected. At 50/300/custom bps the executed swap may use a different slippage than the displayed quote. Not a fund-loss vector — still bounded by Bags auto slippage — but can produce unexpected price impact reporting.

**Error paths:** Quote failure or swap failure → 500 with Bags error payload in `details`.

---

## 2. UI Entry Point

**Route:** `/pools/[id]` where `[id]` = Mongo `_id` of the pool document whose `bagsTokenMint === "72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS"`.

**Component:** `TradeWidget` (`src/components/pool/TradeWidget.tsx`) embedded in pool detail page.

**Pool props consumed:**
- `pool._id` → sent as `poolId` to both endpoints
- `pool.bagsTokenMint` → used as input/output mint
- `pool.graduated` → controls "Trading on DEX" badge + hides bonding-curve progress
- `pool.sharesSold`, `pool.totalShares` → bonding-curve progress bar

**Wallet flow (`useEffectiveWallet` → Privy/adapter):**
```
amount input (debounced 500ms)
  → GET /api/bags/trade-quote → setQuote
Click Buy/Sell Tokens
  → POST /api/bags/execute-trade → { serialized, lastValidBlockHeight }
  → VersionedTransaction.deserialize(base64)
  → signTransaction(tx)
  → connection.sendRawTransaction(signed.serialize())
  → connection.confirmTransaction(signature, 'confirmed')
  → onTradeComplete() refresh
```

**Connection:** Built from `getClusterConfig().endpoint` (NEXT_PUBLIC_SOLANA_ENDPOINT).

---

## 3. Env / Config Dependencies

| Variable | Scope | Required | Notes |
|---|---|---|---|
| `BAGS_API_KEY` | server | yes | Both endpoints fail 500 without it |
| `NEXT_PUBLIC_SOLANA_ENDPOINT` | client | yes | Must be mainnet Helius URL for this smoke test |
| `MONGODB_URI` | server | yes | Pool lookup |

**User wallet prerequisites:**
- ≥0.1 SOL mainnet for buy + fees (tx fee + rent for ATA creation)
- For sell: pool token balance (from a prior buy)

---

## 4. Gaps / Risks Found

### Medium
1. **Slippage mode mismatch between quote and execute** (detailed above in §1). At non-default slippage (50/300/custom), the two endpoints build different Bags queries.
2. **TradeWidget does not use `effectiveSlippage` in API calls.** The component computes `effectiveSlippage` (line 187-189) to honor custom slippage input, but `executeTrade()` and `fetchQuote()` both send raw `slippageBps.toString()` instead. Custom slippage input is visually captured but **not applied** to the request. User-facing bug: "Custom" field is inert.
3. **No pre-flight wallet balance check on server.** Swap tx could fail at submit time with insufficient SOL. Low-risk (wallet shows error), but a friendlier client-side check already exists via `solBalance` display.

### Low
4. **No `graduated`/`bondingCurveActive` gate in endpoints.** If a pool is not yet live on Bags (mint exists, curve not live) the Bags quote endpoint will return its own error — surfaced as `details` in the 500. Not a code bug, just a runbook pre-check.
5. **No txSignature persisted server-side.** Buy/sell txs aren't recorded in MongoDB by either API route. Observability depends on client-side capture (signature returned from `sendRawTransaction`) + Solscan. Not a blocker for smoke test.
6. **Quote cache header** (`s-maxage=5`): 5s Vercel edge cache on GET /trade-quote means two users on identical params share a stale quote for up to 5s. Low risk for smoke test with single user.

### Informational
7. `execute-trade.ts` does not echo back `lastValidBlockHeight` expiration info in a user-friendly way; the UI does not currently reference `lastValidBlockHeight` — it just sends the tx. If the tx is held too long before signing, it could fail with "blockhash expired."
8. `ATA creation rent (~0.002 SOL)` is included inside the Bags swap tx (standard Jupiter-style). User needs slightly more than trade amount in SOL.

### Blockers
**No blocking gaps — proceed to runbook.**

The slippage bugs (#1, #2) are real issues for custom-slippage trades but **do not block a default-1%-slippage smoke test**. Log them for follow-up after runbook passes.

---

## 5. Pool Lookup Command

To find the Mongo `_id` for the target pool, run in a mongo shell or Node script:

```javascript
db.pools.findOne(
  { bagsTokenMint: "72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS" },
  { _id: 1, status: 1, graduated: 1, bondingCurveActive: 1, bagsTokenStatus: 1, sharesSold: 1, totalShares: 1 }
)
```

Or via existing LuxHub API (if a pools list endpoint is exposed):
```bash
curl -s "http://localhost:3000/api/pools/list" | jq '.pools[] | select(.bagsTokenMint=="72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS") | { _id, status, graduated, bondingCurveActive }'
```

Or a one-liner Node script at repo root:
```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const m = require('mongoose');
m.connect(process.env.MONGODB_URI).then(async () => {
  const p = await m.connection.db.collection('pools').findOne(
    { bagsTokenMint: '72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS' },
    { projection: { _id: 1, status: 1, graduated: 1, bondingCurveActive: 1, bagsTokenStatus: 1 } }
  );
  console.log(JSON.stringify(p, null, 2));
  process.exit(0);
});
"
```

Paste the returned `_id` into `http://localhost:3000/pools/{_id}` to reach the TradeWidget.
