# Bags API Integration — Support Request

**From:** LuxHub Team (luxhub.gold)
**Date:** 2026-03-16
**Repo:** https://github.com/yoandryx/LuxHub
**API Key:** bags_prod_FhTM4-* (active, verified working on /trade/quote)

---

## What We're Building

LuxHub is a Solana marketplace for tokenized luxury watches. Each verified watch becomes a pool with a bonding curve token via Bags. Users buy/sell tokens representing fractional access to authenticated timepieces.

We've fully integrated the Bags API across our codebase:
- Token creation via `/token-launch/create-token-info`
- Launch transactions via `/token-launch/create-launch-transaction`
- Trading via `/trade/quote` + `/trade/swap`
- Fee share configuration via `/fee-share/config`
- Webhooks for trade events, graduation, fee claims
- Partner stats and fee claiming

## The Blocker

**`POST /fee-share/config` returns 500 Internal Server Error** — every time, regardless of parameters.

This blocks our entire token launch flow because `create-launch-transaction` requires a `configKey` (Meteora DBC config public key) which comes from the fee-share config creation.

### What We Tried

**Request (simplest case — single claimer):**
```bash
curl -X POST "https://public-api-v2.bags.fm/api/v1/fee-share/config" \
  -H "x-api-key: $BAGS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payer": "6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X",
    "baseMint": "C9UmQSMnE4v39PMwxQgppwrJi35yj57gjj1xTdU2BAGS",
    "claimersArray": ["6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X"],
    "basisPointsArray": [10000]
  }'
```

**Response:** `{"success":false,"response":"Internal server error"}`

**Also tried the v2 path:**
```bash
POST /token-launch/fee-share/create-config
{
  "walletA": "6mst5...",
  "walletB": "CsEbh...",
  "walletABps": 3000,
  "walletBBps": 7000,
  "baseMint": "C9Um...BAGS",
  "quoteMint": "So11...112",
  "payer": "6mst5..."
}
```
Same result: `{"success":false,"error":"Internal server error"}`

### What Works

These endpoints work correctly with our API key:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /token-launch/create-token-info` | 200 | Token created: `C9Um...BAGS` |
| `POST /token-launch/create-launch-transaction` | 200 | Works with borrowed configKey from another pool |
| `GET /trade/quote` | 200 | SOL→USDC quote returned with full route plan |
| `POST /trade/swap` | Not tested (needs active token) | |
| `POST /fee-share/config` | **500** | Blocker |
| `POST /token-launch/fee-share/create-config` | **500** | Blocker |

### Our Token Creation Flow

```
1. POST /token-launch/create-token-info
   → tokenMint: C9UmQSMnE4v39PMwxQgppwrJi35yj57gjj1xTdU2BAGS
   → tokenMetadata: https://ipfs.io/ipfs/QmSjAr...

2. POST /fee-share/config  ← FAILS HERE (500)
   → Should return: meteoraConfigKey

3. POST /token-launch/create-launch-transaction
   → Needs configKey from step 2
   → Works when we borrow a configKey from an existing pool
```

### Questions

1. Is fee-share config creation working on your end? Any known issues?
2. Does the token need to exist on-chain (launch tx signed) before fee-share config can be created? The docs suggest fee-share comes before launch.
3. Is there a default configKey we should use for standard bonding curve launches?
4. Does our API key have the right permissions for fee-share operations?
5. Any devnet-specific limitations we should know about?

### Our Integration Files

All in the latest commit on `main`:
- `src/pages/api/bags/create-pool-token.ts` — token creation + auto fee-share
- `src/pages/api/bags/configure-fee-share.ts` — standalone fee-share config
- `src/pages/api/pool/buy.ts` — bonding curve buy via /trade/quote + /trade/swap
- `src/pages/api/pool/sell.ts` — bonding curve sell
- `src/pages/api/webhooks/bags.ts` — webhook handler for all Bags events

### Contact

- GitHub: https://github.com/yoandryx/LuxHub
- X: @LuxHubStudio
- Website: luxhub.gold
