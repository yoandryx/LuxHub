# SMOKE TEST RUNBOOK: Mainnet Buy/Sell — Pool Token `72DexA...BAGS`

**Goal:** Verify Phase 8 bonding-curve trading works end-to-end on mainnet.
**Pool Token Mint:** `72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS`
**Expected duration:** ~10 minutes + Solana confirmation time

---

## Pre-flight Checklist

- [ ] `.env.local` is switched to mainnet (`cp .env.mainnet .env.local` per `local_mainnet_env_setup.md`)
- [ ] `NEXT_PUBLIC_SOLANA_ENDPOINT` points to mainnet Helius URL
- [ ] `BAGS_API_KEY` is set in `.env.local` (server-side; required by both endpoints)
- [ ] `MONGODB_URI` points to the correct mainnet-aware database
- [ ] User wallet (Phantom / Privy) has ≥ **0.1 SOL** on mainnet for buy + fees + ATA rent
- [ ] Run `node scripts/validate-env-mainnet.cjs` — all checks green
- [ ] Run pool lookup (from AUDIT.md §5) to obtain the Mongo `_id` for the pool:
      - Confirm `bagsTokenMint === "72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS"`
      - Confirm `status` allows trading (not halted/deleted)
      - Record `graduated` + `bondingCurveActive` state for reference
- [ ] `npm run dev` running locally, bound to mainnet env
- [ ] Wallet connected to `http://localhost:3000` on Solana **mainnet** cluster (not devnet)

**Record pool state before test:**
- Pool `_id`: `__________________________`
- `graduated`: `________`
- `bondingCurveActive`: `________`
- `bagsTokenStatus`: `________`

---

## Test 1: BUY (SOL → Pool Token)

1. Navigate to: `http://localhost:3000/pools/{poolId}` (use the `_id` recorded above)
2. **Expected:** Pool detail page renders, `TradeWidget` visible, Buy tab active by default
3. If pool is `graduated === true`, confirm "Trading on DEX" badge visible
4. Enter `0.02` in the SOL Amount field
5. **Expected checkpoint (quote):** Within ~1s, "Estimated tokens: N" appears below the input
   - If quote loader spins then disappears with no value → check browser console + server stdout for `[/api/bags/trade-quote]` error
   - If quote never fires → check that `amount > 0` and `tokenMint` is present on pool doc
6. Click **"Buy Tokens"** button
7. **Expected checkpoint (wallet popup):** Wallet shows a `VersionedTransaction` to sign
   - Verify the tx swaps SOL for `72DexA...BAGS`
8. Approve and submit
9. **Expected checkpoint (UI):** Green "Trade executed successfully!" toast; amount field clears
10. Capture the transaction signature:
    - Open DevTools → Network tab → find the `sendTransaction` RPC call response
    - OR check wallet "Recent Activity" for the hash
11. **Verify on Solscan** (mainnet): `https://solscan.io/tx/{signature}`
    - SOL transferred OUT of user wallet
    - Pool token (mint `72DexA...`) credited to user's ATA (may show new ATA creation)
12. **Verify token balance via CLI:**
    ```bash
    spl-token balance 72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS --url mainnet-beta --owner <USER_WALLET>
    ```

**Record buy test:**
- Quote SOL input: `0.02`
- Quote estimated token output: `________`
- Actual token output (from Solscan): `________`
- Buy tx signature: `________`
- Gas/fees paid (SOL): `________`

---

## Test 2: SELL (Pool Token → SOL)

1. Same page — click the **"Sell"** tab
2. Amount input label switches to "Token Amount"
3. Enter a value **less than** your current token balance from Test 1 (e.g. 50% of received tokens)
4. **Expected checkpoint (quote):** "Estimated SOL: N" appears
5. Click **"Sell Tokens"**, sign in wallet, submit
6. **Expected checkpoint (UI):** Success toast; SOL balance increases on next wallet refresh
7. **Verify on Solscan** — pool tokens debited from user, SOL credited

**Record sell test:**
- Token input: `________`
- Quote estimated SOL output: `________`
- Actual SOL output (from Solscan): `________`
- Sell tx signature: `________`

---

## Test 3: Edge Cases (optional, if time permits)

- [ ] **Slippage pills:** Toggle 0.5% / 1% / 3% — quote refreshes; output changes with slippage
- [ ] **Custom slippage:** NOTE — per AUDIT §4 gap #2, custom slippage input is currently not wired to API calls. Expect it to be inert. Document behavior.
- [ ] **Zero amount:** clear input → no quote fetched, Buy/Sell button disabled
- [ ] **Disconnect wallet** mid-flow → error shown "Please connect your wallet"
- [ ] **Huge amount** (larger than SOL balance) → wallet refuses to sign OR tx fails on submit with "insufficient lamports"

---

## Observability — What to Capture

While testing, keep open:
1. **Browser console** — record all errors, warnings
2. **Browser Network tab** — watch `/api/bags/trade-quote` + `/api/bags/execute-trade` responses
3. **Server stdout (npm run dev terminal)** — look for `[/api/bags/trade-quote] Error:` or `[/api/bags/execute-trade] Error:` log lines
4. **TX signatures** — save both buy + sell hashes
5. **Before/after balances** — SOL + pool token, recorded above

---

## Expected vs Actual Results Table

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Pre-flight: mainnet env validated | all green | | |
| Pool lookup returns `_id` | non-null doc | | |
| Pool page `/pools/{id}` renders | TradeWidget visible | | |
| Quote appears for 0.02 SOL buy | `outputAmount > 0` | | |
| Buy tx signed + submitted | signature returned | | |
| Buy tx confirmed on Solscan | success, tokens credited | | |
| Sell quote appears | `outputAmount > 0` | | |
| Sell tx signed + submitted | signature returned | | |
| Sell tx confirmed on Solscan | success, SOL credited | | |

---

## Known Issues to Watch

- **Slippage default (100 bps / 1%)**: `trade-quote.ts` uses Bags auto slippage mode at this default; `execute-trade.ts` always sends raw `slippageBps` without `slippageMode=manual`. At 1% this is harmless; at non-default values the two endpoints may behave differently (AUDIT §1, §4).
- **Custom slippage input is inert** (AUDIT §4 gap #2) — TradeWidget computes `effectiveSlippage` but never passes it to API calls. If smoke test uses only the 0.5/1/3% pills, this bug doesn't trigger.
- **Graduated pool vs bonding curve**: Bags swap API may reject trades for graduated pools whose DexScreener pair hasn't indexed yet.
- **Blockhash expiration**: If you take >60s between clicking Buy and signing in wallet, the tx may fail with "blockhash expired." Retry.
- **Priority fees**: Mainnet may need higher priority fees to land quickly. If tx is pending >30s, check Solscan status.
- **ATA rent**: First buy creates the user's associated token account (~0.002 SOL rent). Keep extra buffer.

---

## If Trade Fails — Debug Checklist

1. **BAGS_API_KEY validity:** curl test —
   ```bash
   curl -s "http://localhost:3000/api/bags/trade-quote?poolId=<POOL_ID>&amount=0.01&inputMint=So11111111111111111111111111111111111111112&outputMint=72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS&slippageBps=100" | jq .
   ```
2. **Bags API status:** check `https://public-api-v2.bags.fm` is reachable + responding
3. **Mint match:** confirm `pool.bagsTokenMint === "72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS"` exactly (no whitespace)
4. **Wallet cluster:** confirm wallet is set to **Solana Mainnet**, not devnet or testnet
5. **Helius RPC:** `curl $NEXT_PUBLIC_SOLANA_ENDPOINT -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'` → expect `"result":"ok"`
6. **Capture full error:** Network tab → failed request → response body → paste into follow-up ticket

---

## Outcome

Once both tests pass, **Phase 8 bonding-curve trading is verified on mainnet**.

If either test fails, isolate the failure to one of:
- (A) Quote endpoint (Bags API / server-side)
- (B) Swap tx build (Bags API / server-side)
- (C) Wallet sign/send (client-side)
- (D) On-chain execution (RPC / Solana)

…and open a follow-up quick task with the captured error payloads.
