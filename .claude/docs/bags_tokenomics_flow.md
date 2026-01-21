# LuxHub x Bags: Tokenomics & Pool Flow Documentation

> **Last Updated:** 2025-01-20
> **Status:** Active Development
> **Integration:** Bags API for RWA (Real World Asset) Tokenization

---

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Pool Lifecycle](#pool-lifecycle)
3. [Two-Asset Architecture](#two-asset-architecture)
4. [Tokenization Approaches](#tokenization-approaches)
5. [Secondary Market Trading](#secondary-market-trading)
6. [Rug Pull Prevention](#rug-pull-prevention)
7. [Stakeholder Benefits](#stakeholder-benefits)
8. [API Endpoints](#api-endpoints)

---

## Core Concepts

### What is a Pool?
A pool represents fractional ownership of a verified luxury asset (watch, jewelry, collectible). Instead of one buyer paying $100,000 for a Rolex Daytona, 100 investors can each pay $1,000 for a share.

### Two Types of Tokens

| Token Type | Purpose | Who Gets It |
|------------|---------|-------------|
| **NFT Certificate** | Proof of authenticity for the physical watch | Final buyer who purchases the watch outright |
| **Bags Pool Tokens** | Fractional ownership claim on investment returns | Investors (tradeable on secondary market) |

### Key Principle
> **The NFT follows the watch. The Bags tokens follow the money.**

---

## Critical: Understanding Token Value & Liquidity

### The Fundamental Question
> "If investor funds go to the vendor, what are the tokens actually worth?"

### Token Value Lifecycle

```
STAGE 1: FUNDING (Tokens backed by escrowed cash)
├─ Investors deposit funds → Escrow holds $100,000
├─ Tokens minted → 1,000 tokens @ $100 each
├─ Token value = Cash in escrow ÷ Total supply
└─ TOKENS ARE FULLY BACKED BY CASH

STAGE 2: CUSTODY TRANSITION (Tokens backed by physical asset)
├─ Watch verified, ships to LuxHub
├─ LuxHub confirms custody
├─ Vendor receives payment ($97,000)
├─ Token value = Watch market value ÷ Total supply
└─ TOKENS NOW BACKED BY PHYSICAL WATCH

STAGE 3: HOLDING PERIOD (Speculative value)
├─ Watch in LuxHub vault
├─ Token value = Perceived future sale price ÷ Supply
├─ Trading is peer-to-peer speculation
└─ LIQUIDITY DEPENDS ON BUYER INTEREST

STAGE 4: RESALE (Tokens backed by sale proceeds)
├─ Watch sells for $120,000
├─ 97% ($116,400) goes to distribution pool
├─ Token value = Distribution pool ÷ Total supply
└─ TOKENS REDEEMABLE FOR CASH
```

### Where Liquidity Actually Comes From

| Source | When | Description |
|--------|------|-------------|
| **Escrow Cash** | Before vendor paid | Tokens could theoretically be redeemed |
| **Speculation** | During holding | Others believe watch will appreciate |
| **Early Exit Need** | Anytime | Investor needs cash, sells at discount |
| **Late Entry Demand** | After funding | Someone wants exposure, missed initial |
| **Arbitrage** | If mispriced | Token price vs. watch value mismatch |

### Important: This is NOT a Liquid Investment

```
HONEST DISCLOSURE TO INVESTORS:
┌─────────────────────────────────────────────────────────────┐
│ Pool tokens represent a claim on FUTURE SALE PROCEEDS.     │
│ After vendor payment, tokens are backed by physical asset. │
│ Secondary trading liquidity depends on market interest.    │
│ There is NO guaranteed buyer for your tokens.              │
│ Treat this like equity in a watch investment fund.         │
└─────────────────────────────────────────────────────────────┘
```

### Vendor Payment Timing (Critical for Value)

**Option A: Pay vendor when pool fills (Current)**
```
Pool fills → Vendor paid immediately → Tokens backed by watch promise
RISK: Watch hasn't arrived yet, tokens have no backing if vendor doesn't ship
```

**Option B: Pay vendor when watch arrives (Recommended)**
```
Pool fills → Funds held in escrow → Watch ships → Watch verified → Vendor paid
BENEFIT: Tokens always backed by either cash OR verified watch
```

**Recommendation:** Option B is safer for investors and makes token value clearer.

---

## Pool Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POOL LIFECYCLE FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

1. LISTING PHASE
   ├─ Vendor authenticates watch with LuxHub
   ├─ NFT certificate minted (proof of authenticity)
   ├─ Vendor lists for full sale at $100,000
   └─ NFT remains in vendor's wallet

2. CONVERSION TO POOL (Vendor Decision)
   ├─ Vendor clicks "Convert to Pool"
   ├─ Pool created: 1,000 shares @ $100 each
   ├─ Escrow status → "converted"
   ├─ All pending offers auto-rejected
   └─ NFT still with vendor (not moved yet)

3. FUNDING PHASE (status: "open")
   ├─ Investors buy shares via /api/pool/invest
   ├─ Each investor recorded in participants[]
   ├─ Bags tokens minted (see Tokenization Approaches below)
   └─ Pool hits 100% → status: "filled"

4. VENDOR PAYMENT (status: "funded")
   ├─ 97% of pool funds sent to vendor ($97,000)
   ├─ 3% retained as LuxHub fee ($3,000)
   ├─ vendorPaidAmount, vendorPaymentTx recorded
   └─ Vendor MUST now ship watch to LuxHub

5. CUSTODY TRANSIT (status: "custody")
   ├─ Vendor ships watch to LuxHub vault
   ├─ custodyTrackingNumber recorded
   ├─ NFT transfers to LuxHub custody wallet
   └─ LuxHub verifies receipt

6. LUXHUB CUSTODY (status: "active")
   ├─ Watch received, authenticated, stored securely
   ├─ NFT locked in LuxHub custody wallet
   ├─ Pool is now "operational"
   └─ Bags tokens freely tradeable on secondary market

7. RESALE LISTING (status: "listed")
   ├─ LuxHub lists watch for resale on marketplace
   ├─ resaleListingPriceUSD set (e.g., $120,000)
   └─ Wait for full-price buyer

8. SALE COMPLETE (status: "sold")
   ├─ Full-price buyer purchases watch for $120,000
   ├─ Watch + NFT transfer to new buyer
   └─ resaleSoldPriceUSD recorded

9. DISTRIBUTION (status: "distributing" → "distributed")
   ├─ 97% distributed to token holders: $116,400
   ├─ 3% royalty to LuxHub treasury: $3,600
   ├─ Distribution based on who holds Bags tokens NOW
   └─ Pool closes (status: "closed")

INVESTOR OUTCOME:
- Invested: $1,000 (10 shares @ $100)
- Ownership: 1% of pool
- Received: $1,164 (1% of $116,400)
- Profit: $164 (16.4% ROI)
```

---

## Two-Asset Architecture

### NFT Certificate (Authenticity Proof)

**Purpose:** Proves the physical watch is real and verified

**Lifecycle:**
```
Vendor Wallet → [Pool Fills] → LuxHub Custody Wallet → [Resale] → Final Buyer Wallet
```

**Contains:**
- Brand, model, serial number
- Authentication photos
- Verification timestamp
- LuxHub certification signature

**Who Owns It:**
- During pool: LuxHub (custodial)
- After resale: The person who bought the physical watch

### Bags Pool Tokens (Investment Claim)

**Purpose:** Represents fractional ownership and claim to distribution

**Lifecycle:**
```
Minted via Bags API → Distributed to Investors → Tradeable → Burned on Distribution
```

**Properties:**
- Fixed supply = totalShares (e.g., 1,000)
- SPL token on Solana
- Tradeable on secondary market via Bags
- 3% fee on trades goes to LuxHub

**Who Owns It:**
- Whoever bought/traded for the tokens
- Distribution goes to current holders, not original investors

---

## Tokenization Approaches

### Option A: Tokenize on Pool Creation (Recommended)

```
Pool Created → Immediately mint Bags tokens → Distribute to investors as they buy
```

**Pros:**
- True blockchain-native from day one
- Investors receive tokens immediately
- Can start trading before pool fills
- More "DeFi-native" experience
- Consistent state (all pools have tokens)

**Cons:**
- Tokens exist before pool is funded
- Need to handle unfilled pool scenario (burn tokens?)
- Slightly more complex edge cases

**Implementation:**
```typescript
// In /api/pool/create or /api/pool/convert-from-escrow
const pool = await Pool.create({ ... });

// Immediately tokenize via Bags
const tokenResult = await fetch('/api/bags/create-pool-token', {
  method: 'POST',
  body: JSON.stringify({ poolId: pool._id })
});

pool.bagsTokenMint = tokenResult.mint;
await pool.save();
```

### Option B: Tokenize When Pool Fills (Current Approach)

```
Pool Created → Investors buy shares (DB records) → Pool fills → Admin tokenizes → Distribute tokens
```

**Pros:**
- Simpler mental model
- No tokens for unfunded pools
- Admin has manual control
- Can review before tokenizing

**Cons:**
- Investment is "off-chain" until tokenization
- Extra step required
- Investors don't have tradeable asset immediately
- Less blockchain-native feel

**Implementation:**
```typescript
// Current: Manual admin action after pool fills
// Admin clicks "Launch Token" button in dashboard
```

### Option C: Tokenize on First Investment (Hybrid)

```
Pool Created → First investment triggers tokenization → Subsequent investors get tokens
```

**Pros:**
- Lazy tokenization (only when needed)
- First investor triggers the process
- No tokens for pools with zero interest

**Cons:**
- First investor has different experience
- Slight delay on first investment
- Complexity in handling the trigger

### Recommendation: Option A with Safeguards

**Why Option A:**
1. Aligns with Web3 ethos - tokens are the source of truth
2. Immediate liquidity potential
3. Cleaner UX - investors always get tokens
4. Better for hackathon demo - shows full Bags integration

**Safeguards needed:**
1. Tokens locked until pool fills (no trading partially funded pools)
2. Refund mechanism if pool fails to fill
3. Clear UI showing pool status and token tradability

---

## Secondary Market Trading

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECONDARY MARKET FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO: Alice wants to exit early, Bob wants to buy in

1. Alice owns 50 LUX-DAYTONA tokens (5% of pool)
2. Alice lists tokens for sale on Bags marketplace
3. Bob sees listing, wants to buy
4. Bob pays market price (may be higher/lower than original)
5. Bags executes swap: Bob's USDC → Alice's tokens
6. 3% fee automatically sent to LuxHub treasury
7. Alice has USDC, Bob has tokens

RESULT:
- Alice exited her position (liquidity!)
- Bob now owns 5% claim on distribution
- LuxHub earned 3% fee
- Original investment record unchanged
- Distribution will go to BOB, not Alice
```

### Price Discovery

```
INITIAL PRICE:
$100,000 watch ÷ 1,000 shares = $100/share

MARKET PRICE (varies based on):
├─ Supply/demand for this specific pool
├─ Perceived value of underlying watch
├─ Time until expected resale
├─ Market sentiment
└─ Overall crypto market conditions

EXAMPLES:
- Watch appreciating → tokens trade at $120 (20% premium)
- Watch market down → tokens trade at $80 (20% discount)
- Urgent seller → tokens trade at $90 (10% discount)
- Hype/FOMO → tokens trade at $150 (50% premium)
```

### Fee Structure

| Event | Fee | Recipient |
|-------|-----|-----------|
| Initial Investment | 0% | - |
| Secondary Trade | 3% | LuxHub Treasury |
| Distribution | 3% | LuxHub Treasury |

**Annual Revenue Potential:**
- 100 pools × $100,000 avg × 10 trades/pool × 3% = $3,000,000/year in trading fees
- Plus 3% on all distributions

---

## Rug Pull Prevention

### Threat Vectors

| Threat | Description | Mitigation |
|--------|-------------|------------|
| Fake Asset | Vendor lists non-existent watch | Pre-listing verification, physical inspection |
| Non-Delivery | Vendor takes money, doesn't ship | Escrow holds funds until custody confirmed |
| Fake Custody | LuxHub claims custody without watch | Photo proof, third-party audits, insurance |
| Token Inflation | Minting more tokens to dilute | Fixed supply, immutable on-chain |
| Distribution Theft | Not distributing to holders | On-chain distribution via Squads multisig |
| Price Manipulation | Fake trades to pump price | Bags AMM mechanics, volume monitoring |

### Safeguards Implemented

#### 1. Escrow-Based Funding
```
Investor funds → Escrow PDA (on-chain) → NOT released until:
  ├─ Pool fills 100%
  ├─ Admin approval
  └─ Squads multisig confirmation
```

#### 2. Custody Verification
```
Vendor ships watch → LuxHub receives → Photos uploaded → Admin verifies → Status updated
- custodyProofUrls: [photo1, photo2, ...]
- custodyVerifiedBy: adminWallet
- custodyReceivedAt: timestamp
```

#### 3. Fixed Token Supply
```javascript
// Bags Token Launch - supply CANNOT be changed after creation
{
  totalSupply: pool.totalShares,  // Exactly 1,000 tokens
  mintAuthority: null,            // No one can mint more
  freezeAuthority: luxhubWallet   // Only LuxHub can freeze (emergency)
}
```

#### 4. Multisig Distribution
```
Resale proceeds → Squads Vault → Proposal created → 2/3 admins approve → Distribution executed
- No single admin can steal funds
- All transactions on-chain and auditable
```

#### 5. Vendor Verification
```
Vendor onboarding:
├─ KYC/KYB verification
├─ Business documentation
├─ Bank account verification
├─ Reputation score tracking
└─ Escrow history tracking
```

#### 6. Insurance Fund (Planned)
```
3% of all fees → Insurance fund
- Covers: Lost/damaged items, vendor fraud, custody issues
- Managed via Squads multisig
```

### What Investors Can Verify

| Check | How | Where |
|-------|-----|-------|
| Pool exists | View on Solscan | Pool escrow PDA |
| Token supply | View on Solscan | bagsTokenMint address |
| Their balance | Wallet | Token account |
| Distribution tx | Solscan | txSignature in pool |
| Custody status | LuxHub UI | Pool detail page |

---

## Stakeholder Benefits

### For Investors

| Benefit | Description |
|---------|-------------|
| **Accessibility** | Own luxury assets with $100 instead of $100,000 |
| **Liquidity** | Sell anytime on secondary market (don't wait for resale) |
| **Diversification** | Own pieces of multiple watches instead of one |
| **Transparency** | All transactions on-chain, verifiable |
| **Upside Potential** | If watch appreciates, so does your share |
| **Passive Income** | Hold and wait for distribution |

### For Vendors/Dealers

| Benefit | Description |
|---------|-------------|
| **Faster Sales** | Don't wait for single wealthy buyer |
| **Price Discovery** | Market determines fair value |
| **Broader Market** | Access crypto-native buyers globally |
| **Instant Liquidity** | 97% payment when pool fills |
| **Reduced Risk** | No chargebacks (crypto is final) |
| **Inventory Turnover** | Move slow-selling inventory via pools |

### For LuxHub

| Benefit | Description |
|---------|-------------|
| **Trading Fees** | 3% on every secondary trade |
| **Distribution Fees** | 3% on every resale distribution |
| **Network Effects** | More pools → more trading → more fees |
| **Data Moat** | Pricing data on luxury assets |
| **Brand Building** | "Fractional luxury" category leader |
| **Custody Revenue** | Storage fees (potential future) |

### For Bags (Partner)

| Benefit | Description |
|---------|-------------|
| **Volume** | LuxHub drives trading volume |
| **Use Case** | Real-world asset tokenization showcase |
| **Fees** | Platform fees on infrastructure |
| **Integration Example** | Reference implementation for other RWA projects |

---

## API Endpoints

### Pool Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pool/list` | GET | List all pools with filters |
| `/api/pool/[id]` | GET | Get pool details |
| `/api/pool/convert-from-escrow` | POST | Convert listing to pool |
| `/api/pool/invest` | POST | Buy shares in pool |
| `/api/pool/pay-vendor` | POST | Release funds to vendor |
| `/api/pool/custody` | POST | Update custody status |
| `/api/pool/distribute` | POST | Distribute to token holders |

### Bags Integration
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bags/create-pool-token` | POST | Mint pool share tokens |
| `/api/bags/configure-fee-share` | POST | Set up 3% fee routing |
| `/api/bags/trade-quote` | GET | Get swap quote |
| `/api/bags/execute-trade` | POST | Execute token swap |
| `/api/bags/partner-stats` | GET | Get fee earnings |

### UI Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `BagsPoolTrading` | `/components/marketplace/` | Buy/sell pool tokens |
| `BagsPartnerDashboard` | `/components/admin/` | Fee earnings dashboard |
| `PoolCard` | `/components/marketplace/` | Pool listing card |
| `bags.tsx` | `/pages/` | Bags integration showcase |

---

## Database Schema Reference

### Pool Model Fields (Bags-related)

```typescript
{
  // Bags API Integration
  bagsTokenMint: String,        // SPL token mint address
  bagsFeeShareConfigId: String, // Fee share config ID
  bagsTokenCreatedAt: Date,     // When token was minted

  // Distribution tracking
  distributions: [{
    wallet: String,             // Token holder at distribution time
    shares: Number,             // Shares held
    ownershipPercent: Number,   // % of pool
    amount: Number,             // USD distributed
    txSignature: String,        // On-chain proof
    distributedAt: Date
  }]
}
```

---

## Future Considerations

### Phase 2 Enhancements
- [ ] Auto-tokenization on pool creation
- [ ] Token locking until pool fills
- [ ] Refund mechanism for failed pools
- [ ] Real-time price feeds from Bags
- [ ] Portfolio view for investors

### Phase 3 Enhancements
- [ ] Governance tokens for pool decisions
- [ ] Buyout mechanism (one holder acquires all)
- [ ] Fractionalized NFT standard (SPL-404?)
- [ ] Cross-chain bridging
- [ ] Institutional custody integration

---

## Glossary

| Term | Definition |
|------|------------|
| **Pool** | Collection of investors co-owning a luxury asset |
| **Share** | Unit of ownership in a pool |
| **Bags Token** | SPL token representing pool shares |
| **NFT Certificate** | On-chain proof of asset authenticity |
| **Secondary Market** | Trading pool tokens between investors |
| **Distribution** | Payout to token holders when asset sells |
| **Escrow PDA** | On-chain account holding pool funds |
| **Custody** | LuxHub physically holding the asset |
| **RWA** | Real World Asset (physical item tokenized on-chain) |

---

*This document should be updated as the integration evolves.*
