# LuxHub x Bags: Complete Tokenomics & Integration Guide

> **Last Updated:** 2025-01-25
> **Version:** 2.0
> **Status:** Production Ready
> **Integration:** Bags API for RWA (Real World Asset) Tokenization

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Concepts](#core-concepts)
3. [Tokenomics Model](#tokenomics-model)
4. [Pool Lifecycle](#pool-lifecycle)
5. [Bonding Curve Mechanics](#bonding-curve-mechanics)
6. [Secondary Market Trading](#secondary-market-trading)
7. [Liquidity Models](#liquidity-models)
8. [Distribution & Payouts](#distribution--payouts)
9. [API Integration](#api-integration)
10. [Security & Rug Prevention](#security--rug-prevention)
11. [Stakeholder Benefits](#stakeholder-benefits)

---

## Executive Summary

### What LuxHub Does

LuxHub is a **fractional ownership marketplace for luxury watches** on Solana. Instead of one buyer paying $100K for a Rolex, 100 investors can each contribute $1K for fractional shares.

### How Bags Powers This

Bags provides the tokenization and trading infrastructure:

| Bags Feature | LuxHub Use Case |
|--------------|-----------------|
| Token Launch API | Mint pool share tokens |
| Bonding Curve | Price discovery during funding |
| DEX/Trading | Secondary market for shares |
| Fee Share | Automatic 3% routing to LuxHub |
| Webhooks | Real-time trade/event sync |

### One-Liner

> "LuxHub uses Bags to tokenize fractional ownership of luxury watches - every pool becomes tradeable tokens, generating continuous secondary market volume through Bags DEX infrastructure, with automatic 3% fee routing on every swap."

---

## Core Concepts

### Two Types of Tokens

| Token Type | Purpose | Who Gets It |
|------------|---------|-------------|
| **NFT Certificate** | Proof of authenticity for the physical watch | Final buyer who purchases the watch outright |
| **Pool Share Tokens** | Fractional ownership claim via Bags | Investors (tradeable on secondary market) |

### Key Principle

> **The NFT follows the watch. The Bags tokens follow the money.**

### Token Value Lifecycle

```
STAGE 1: FUNDING
├─ Investors deposit funds → Escrow holds cash
├─ Tokens minted via bonding curve
└─ TOKENS BACKED BY ESCROWED CASH

STAGE 2: CUSTODY TRANSITION
├─ Pool fills 100%
├─ Watch verified, ships to LuxHub
├─ Vendor receives payment
└─ TOKENS NOW BACKED BY PHYSICAL WATCH

STAGE 3: HOLDING PERIOD
├─ Watch secured in LuxHub vault
├─ Secondary trading active
└─ TOKENS = SPECULATION ON RESALE VALUE

STAGE 4: RESALE & DISTRIBUTION
├─ Watch sells to full-price buyer
├─ 97% distributed to token holders
├─ Tokens burned
└─ TOKENS REDEEMED FOR CASH
```

---

## Tokenomics Model

### Fixed Supply Model

```
Watch Price: $100,000
Token Supply: 1,000,000 tokens
Token Price: $0.10 each

MATH:
├─ 1 token = 0.0001% ownership
├─ 10,000 tokens = 1% ownership
├─ 100,000 tokens = 10% ownership
└─ All tokens sold = pool filled
```

### Why Fixed Supply?

| Approach | Pros | Cons |
|----------|------|------|
| **Fixed Supply** | Clear ownership %, deterministic distribution | Must sell all to fill |
| **Infinite Supply** | Always available | Dilutes existing holders |
| **1 Billion Model** | Low price per token | Confusing ownership math |

**Recommendation:** Fixed supply matching asset value for RWA clarity.

### Minimum Investment

```
$10 minimum = 100 tokens
$100 = 1,000 tokens
$1,000 = 10,000 tokens (1% ownership)
$10,000 = 100,000 tokens (10% ownership)

NO CAP on who can invest - democratized access
```

---

## Pool Lifecycle

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              PHASE 1: POOL CREATION                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Vendor lists authenticated watch for $100,000            │
│ 2. Vendor clicks "Convert to Pool"                          │
│ 3. Bags mints token via bonding curve                       │
│ 4. Pool status: OPEN                                         │
│ 5. Max supply: 1,000,000 tokens @ $0.10                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PHASE 2: FUNDING (Primary Market)               │
├─────────────────────────────────────────────────────────────┤
│ Investors buy tokens via bonding curve:                      │
│ ├─ Alice: $10,000 → 100,000 tokens minted                   │
│ ├─ Bob: $5,000 → 50,000 tokens minted                       │
│ ├─ Carol: $500 → 5,000 tokens minted                        │
│ └─ ... continues until $100,000 raised                      │
│                                                              │
│ Funds flow: Investor wallet → Escrow reserve                 │
│ Tokens: Minted fresh to investor wallet                      │
│                                                              │
│ EARLY EXIT OPTION:                                           │
│ ├─ Sell tokens back to curve (burns tokens)                 │
│ ├─ Or list on P2P order book                                │
│ └─ Get USDC from reserve                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ ($100K raised)
┌─────────────────────────────────────────────────────────────┐
│              PHASE 3: GRADUATION (Pool Filled)               │
├─────────────────────────────────────────────────────────────┤
│ AUTOMATIC TRIGGERS:                                          │
│ ├─ Minting STOPS (supply locked at 1M tokens)               │
│ ├─ Escrow LOCKED ($100K secured)                            │
│ ├─ Vendor notified to ship                                   │
│ ├─ Secondary trading ENABLED                                 │
│ └─ Status: FILLED                                            │
│                                                              │
│ RECORDED ON-CHAIN:                                           │
│ ├─ All wallet addresses that bought                         │
│ ├─ Token amounts per wallet                                 │
│ └─ Timestamps of purchases                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PHASE 4: CUSTODY TRANSFER                       │
├─────────────────────────────────────────────────────────────┤
│ 1. Vendor ships watch to LuxHub vault                       │
│ 2. LuxHub receives and verifies authenticity                │
│ 3. Photos uploaded as custody proof                          │
│ 4. NFT certificate transfers to LuxHub custody wallet       │
│ 5. Vendor receives: $97,000 (97%)                           │
│ 6. LuxHub treasury: $3,000 (3%)                             │
│ 7. Status: ACTIVE                                            │
│                                                              │
│ TOKENS NOW BACKED BY PHYSICAL WATCH                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PHASE 5: SECONDARY MARKET                       │
├─────────────────────────────────────────────────────────────┤
│ TRADING DYNAMICS:                                            │
│ ├─ Fixed supply (1M tokens, no new minting)                 │
│ ├─ Price fluctuates with demand                             │
│ ├─ Anyone can buy/sell                                      │
│ └─ 3% fee per trade → LuxHub                                │
│                                                              │
│ PRICE DISCOVERY:                                             │
│ ├─ Watch appreciating → tokens trade at premium             │
│ ├─ Watch market down → tokens trade at discount             │
│ ├─ Urgent seller → sells below NAV                          │
│ └─ FOMO/hype → significant premium                          │
│                                                              │
│ DOES NOT CHANGE:                                             │
│ ├─ Total supply (still 1M)                                  │
│ ├─ Watch ownership (100% by token holders)                  │
│ └─ Distribution entitlement (based on holdings)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PHASE 6: WATCH RESALE                           │
├─────────────────────────────────────────────────────────────┤
│ Full-price buyer purchases watch for $120,000               │
│ ├─ Watch + NFT certificate → Buyer                          │
│ ├─ $120,000 → Distribution pool                             │
│ └─ Status: SOLD                                              │
│                                                              │
│ SNAPSHOT TAKEN:                                              │
│ ├─ All current token holders at this moment                 │
│ ├─ Their token balances                                     │
│ └─ Their proportional ownership %                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PHASE 7: DISTRIBUTION                           │
├─────────────────────────────────────────────────────────────┤
│ RESALE: $120,000                                             │
│ ├─ 97% to token holders: $116,400                           │
│ └─ 3% to LuxHub treasury: $3,600                            │
│                                                              │
│ PAYOUT FORMULA:                                              │
│ (Your tokens ÷ Total supply) × $116,400                     │
│                                                              │
│ EXAMPLE:                                                     │
│ ├─ 100,000 tokens (10%) → $11,640                           │
│ ├─ 50,000 tokens (5%) → $5,820                              │
│ └─ 10,000 tokens (1%) → $1,164                              │
│                                                              │
│ FINAL:                                                       │
│ ├─ USDC/SOL sent to each holder's wallet                    │
│ ├─ All tokens BURNED                                         │
│ └─ Pool status: CLOSED                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Bonding Curve Mechanics

### How It Works (Zero External Liquidity Needed)

```
BONDING CURVE = AUTOMATED MARKET MAKER FOR PRIMARY SALES

BUYING TOKENS:
├─ User sends USDC to the curve (smart contract)
├─ Curve MINTS new tokens to user
├─ Price increases slightly along curve
└─ USDC stays in curve's RESERVE

SELLING TOKENS (back to curve):
├─ User sends tokens to the curve
├─ Curve BURNS those tokens
├─ Curve sends USDC from reserve to user
├─ Price decreases slightly
└─ Reserve always has USDC to pay sellers

THE RESERVE IS THE LIQUIDITY:
├─ Every buy adds USDC to reserve
├─ Every sell removes USDC from reserve
├─ Math ensures there's always enough to pay sellers
└─ No external LP capital needed!
```

### Example Walkthrough

```
START:
├─ Reserve: $0
├─ Supply: 0 tokens
└─ Price: $0.10

ALICE BUYS $10,000:
├─ Reserve: $0 → $10,000
├─ Supply: 0 → 100,000 tokens (to Alice)
└─ Price: $0.10 → $0.102

BOB BUYS $5,000:
├─ Reserve: $10,000 → $15,000
├─ Supply: 100,000 → 149,000 tokens
└─ Price: $0.102 → $0.103

ALICE SELLS 20,000 TOKENS:
├─ Tokens burned: 20,000
├─ Alice receives: ~$2,040 from reserve
├─ Reserve: $15,000 → $12,960
└─ Price: $0.103 → $0.101

... CONTINUES UNTIL POOL FILLS AT $100K ...
```

### Post-Graduation

```
AFTER POOL FILLS:
├─ Minting STOPS permanently
├─ Supply locked at final amount
├─ Bonding curve no longer active
├─ Trading moves to P2P or AMM
└─ Reserve ($100K) → Vendor payment
```

---

## Secondary Market Trading

### What Gets Traded?

**The tokens themselves** - representing ownership claims.

```
NOT TRADING:
├─ The physical watch
├─ The NFT certificate
└─ Escrow funds

TRADING:
├─ Pool share tokens
├─ Between users (P2P)
├─ Or via AMM pools
└─ At market-determined prices
```

### Trading Scenarios

| Scenario | Who | Why | Effect |
|----------|-----|-----|--------|
| Early Exit | Original investor | Needs liquidity | Sells tokens, exits position |
| Late Entry | New investor | Wants exposure | Buys tokens, joins pool |
| Speculation | Trader | Expects appreciation | Buy low, sell high |
| Arbitrage | Market maker | Price mismatch | Corrects inefficiencies |
| Rebalancing | Portfolio manager | Adjust allocation | Trade between pools |

### Price Dynamics

```
TOKEN NAV (Net Asset Value):
= Watch market value ÷ Token supply
= $100,000 ÷ 1,000,000
= $0.10 per token

MARKET PRICE CAN DIFFER:

PREMIUM (price > NAV):
├─ Watch expected to appreciate
├─ High demand for this pool
├─ FOMO / hype
└─ Example: $0.12 (20% premium)

DISCOUNT (price < NAV):
├─ Seller needs urgent liquidity
├─ Market uncertainty
├─ Watch market declining
└─ Example: $0.08 (20% discount)
```

### Does Trading Affect Original Investors?

**NO** - trading just transfers ownership, doesn't change pool value.

```
EXAMPLE:

ORIGINAL STATE:
├─ Alice: 100,000 tokens (10%)
├─ Bob: 50,000 tokens (5%)
└─ Total: 1,000,000 tokens

ALICE SELLS 50,000 TO DAVE:
├─ Alice: 50,000 tokens (5%)
├─ Dave: 50,000 tokens (5%)
├─ Bob: 50,000 tokens (5%) - UNCHANGED
└─ Total: still 1,000,000 tokens

AT DISTRIBUTION:
├─ Alice gets 5% (she sold half)
├─ Dave gets 5% (he bought in)
├─ Bob gets 5% (held steady)
└─ FAIR: Dave bought Alice's claim, he deserves payout
```

---

## Liquidity Models

### The Challenge

```
POST-GRADUATION:
├─ Bonding curve inactive (no more minting/burning)
├─ Fixed supply needs trading venue
├─ Traditional AMM needs liquidity capital
└─ LuxHub has zero capital for LP
```

### Available Options

#### Option 1: Pure P2P Order Book (Zero Capital)

```
HOW IT WORKS:
├─ Users post buy/sell orders
├─ Orders match against each other
├─ Direct wallet-to-wallet trades
└─ No liquidity pool needed

PROS:
├─ Zero capital required
├─ Simple to implement
└─ No impermanent loss

CONS:
├─ Slower execution
├─ May have wide spreads
└─ Less liquid
```

#### Option 2: Bags DEX Infrastructure

```
HOW IT WORKS:
├─ Bags provides trading infrastructure
├─ Their liquidity, their AMM
├─ LuxHub just routes trades
└─ Collects 3% fee

PROS:
├─ No capital needed from LuxHub
├─ Professional DEX experience
└─ Bags handles complexity
```

#### Option 3: Fee-Seeded Liquidity (Future)

```
HOW IT WORKS:
├─ LuxHub takes 3% fee on pool funding
├─ Portion seeds LP for that pool
├─ Grows organically over time

EXAMPLE:
├─ Pool raises $100,000
├─ 3% fee = $3,000
├─ $1,500 to treasury, $1,500 to LP
├─ Small but functional liquidity

GROWTH:
├─ 10 pools = $15,000 LP
├─ 100 pools = $150,000 LP
└─ Compounds with trading fees
```

#### Option 4: Investor-Provided Liquidity

```
HOW IT WORKS:
├─ Token holders add liquidity
├─ Deposit: tokens + USDC
├─ Receive: LP tokens
├─ Earn: share of trading fees

INCENTIVE:
├─ "Stake tokens, earn 10% of fees"
├─ Passive income for holders
└─ Still get distribution at resale
```

### Recommended MVP Approach

```
PHASE 1 (Now):
├─ Bags bonding curve for funding
├─ P2P order book post-graduation
└─ Zero capital required

PHASE 2 (With Revenue):
├─ Seed LP from accumulated fees
├─ Add investor LP option
└─ Deeper liquidity over time
```

---

## Distribution & Payouts

### The Key Insight

```
WRONG MENTAL MODEL:
"Investors get their money back PLUS profits"

RIGHT MENTAL MODEL:
"Investors split the resale price proportionally"

MATH:
├─ Funded: $100,000
├─ Resold: $120,000
├─ Net to investors: $116,400 (97%)
├─ Collective profit: $16,400
└─ Each gets: (their tokens ÷ total) × $116,400
```

### Distribution Goes to CURRENT HOLDERS

```
NOT original buyers - whoever holds tokens at snapshot.

FAIR BECAUSE:
├─ If you sold, you already got value
├─ Buyer took on your risk
├─ They deserve the payout
└─ This IS the secondary market
```

### Detailed Example

```
FUNDING:
├─ Alice: 100,000 tokens for $10,000
├─ Bob: 50,000 tokens for $5,000
├─ Carol: 850,000 tokens for $85,000
└─ TOTAL: $100,000 raised

SECONDARY TRADING:
├─ Alice sells 50,000 to Dave for $6,000
├─ Bob sells ALL to Eve for $7,000
└─ Carol holds

CURRENT HOLDERS:
├─ Alice: 50,000 (5%)
├─ Dave: 50,000 (5%)
├─ Eve: 50,000 (5%)
├─ Carol: 850,000 (85%)
└─ Bob: 0 (exited)

WATCH SELLS FOR $120,000:
├─ Distribution pool: $116,400

PAYOUTS:
├─ Alice: 5% → $5,820
├─ Dave: 5% → $5,820
├─ Eve: 5% → $5,820
├─ Carol: 85% → $98,940
├─ Bob: 0% → $0
└─ TOTAL: $116,400

PROFIT/LOSS ANALYSIS:
├─ Alice: $10K in, $6K sold + $5.8K dist = $11.8K (+18%)
├─ Bob: $5K in, $7K sold = $7K (+40%) - great early exit!
├─ Dave: $6K in, $5.8K dist = -$180 (-3%) - slight loss
├─ Eve: $7K in, $5.8K dist = -$1.2K (-17%) - bought too high
├─ Carol: $85K in, $98.9K dist = +$13.9K (+16%)
```

---

## API Integration

### Bags Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/token/create-token-info` | POST | Create token metadata |
| `/token/create-token-launch-transaction` | POST | Mint pool tokens |
| `/fee-share/create-fee-share-config-v2-transaction` | POST | Set up 3% routing |
| `/trade/quote` | GET | Get swap price quote |
| `/trade/swap` | POST | Execute token swap |
| `/partner/stats` | GET | Fetch earnings data |

### LuxHub API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/bags/create-pool-token` | POST | Mint pool share tokens |
| `/api/bags/configure-fee-share` | POST | Set up 3% fee routing |
| `/api/bags/trade-quote` | GET | Get swap quote |
| `/api/bags/execute-trade` | POST | Execute token swap |
| `/api/bags/partner-stats` | GET | Get fee earnings |
| `/api/webhooks/bags` | POST | Handle Bags events |
| `/api/stats/platform` | GET | Real-time platform stats |

### Environment Variables

```env
# Bags API Configuration
BAGS_API_KEY=bags_prod_xxxxx
BAGS_WEBHOOK_SECRET=whsec_xxxxx
BAGS_PARTNER_WALLET=your_treasury_wallet
```

### Webhook Events Handled

| Event | Action |
|-------|--------|
| `TRADE_EXECUTED` | Update pool trading stats |
| `POOL_CREATED` | Sync pool metadata |
| `POOL_UPDATED` | Update price/market cap |
| `TOKEN_GRADUATED` | Mark bonding curve complete |
| `PARTNER_FEE_EARNED` | Record treasury deposit |

---

## Security & Rug Prevention

### Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Fake Asset | Pre-listing verification, physical inspection |
| Non-Delivery | Escrow holds funds until custody confirmed |
| Token Inflation | Fixed supply, immutable on-chain |
| Distribution Theft | Squads multisig, on-chain execution |
| Price Manipulation | Bonding curve math, volume monitoring |

### Safeguards

```
1. ESCROW-BASED FUNDING
├─ Investor funds → Escrow PDA (on-chain)
├─ NOT released until pool fills
├─ Squads multisig confirmation required

2. FIXED TOKEN SUPPLY
├─ Supply set at pool creation
├─ No mint authority after graduation
├─ Freeze authority only for emergencies

3. CUSTODY VERIFICATION
├─ Photos uploaded as proof
├─ Admin verification required
├─ Timestamp recorded on-chain

4. MULTISIG DISTRIBUTION
├─ Squads vault holds proceeds
├─ 2/3 admin approval required
├─ All transactions auditable
```

---

## Stakeholder Benefits

### For Investors

| Benefit | Description |
|---------|-------------|
| Accessibility | Own luxury assets with $10 instead of $100K |
| Liquidity | Sell anytime on secondary market |
| Diversification | Own pieces of multiple watches |
| Transparency | All transactions on-chain |
| Upside | Share in asset appreciation |

### For Vendors

| Benefit | Description |
|---------|-------------|
| Faster Sales | Don't wait for single wealthy buyer |
| Broader Market | Access crypto-native global buyers |
| Instant Liquidity | 97% payment when pool fills |
| No Chargebacks | Crypto is final |

### For LuxHub

| Benefit | Description |
|---------|-------------|
| Trading Fees | 3% on every secondary trade |
| Distribution Fees | 3% on every resale |
| Network Effects | More pools → more trading → more fees |

### For Bags

| Benefit | Description |
|---------|-------------|
| Volume | LuxHub drives continuous trading |
| Use Case | RWA tokenization showcase |
| Integration Example | Reference for other projects |

---

## Volume Generation Summary

| Source | How It Creates Volume |
|--------|----------------------|
| Initial tokenization | Every filled pool mints tokens via Bags |
| Secondary trading | Investors trade in/out of positions |
| Speculation | Watch appreciation drives activity |
| Early exits | Investors needing liquidity sell |
| Late entries | New investors buy into funded pools |
| Arbitrage | Correcting price mismatches |

---

## Glossary

| Term | Definition |
|------|------------|
| **Pool** | Collection of investors co-owning a luxury asset |
| **Share Token** | SPL token representing pool ownership |
| **Bonding Curve** | Automated pricing mechanism for primary sales |
| **Graduation** | When pool fills and minting stops |
| **NAV** | Net Asset Value - watch value ÷ token supply |
| **Distribution** | Payout to holders when asset sells |
| **Escrow PDA** | On-chain account holding pool funds |
| **Secondary Market** | Trading tokens between investors |
| **RWA** | Real World Asset - physical item tokenized |

---

*This document should be updated as the integration evolves.*
