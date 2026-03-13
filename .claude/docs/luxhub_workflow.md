# LuxHub Marketplace Complete Workflow

> **Last Updated:** 2026-03-12
> **Status:** USDC-based escrow (Jupiter swap for SOL payers), Squads multisig gating

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              LUXHUB PLATFORM                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│   │  VENDOR  │    │  BUYER   │    │  ADMIN   │    │ INVESTOR │                │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘                │
│        │               │               │               │                       │
│        ▼               ▼               ▼               ▼                       │
│   ┌─────────────────────────────────────────────────────────────────────┐      │
│   │                       NEXT.JS API LAYER                             │      │
│   │  /api/escrow/*  │  /api/offers/*  │  /api/pool/*  │  /api/squads/* │      │
│   └────────┬──────────────┬──────────────┬──────────────┬──────────────┘      │
│            │              │              │              │                       │
│   ┌────────▼────────┐ ┌──▼───────┐ ┌───▼──────┐ ┌────▼─────────┐             │
│   │    MongoDB      │ │  Solana  │ │  Squads  │ │   Jupiter    │             │
│   │   (Off-Chain    │ │  (Anchor │ │ (Multisig│ │  (SOL→USDC   │             │
│   │    Records)     │ │  Escrow) │ │  Gating) │ │   Swap)      │             │
│   └─────────────────┘ └──────────┘ └──────────┘ └──────────────┘             │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐      │
│   │                    SETTLEMENT LAYER                                  │      │
│   │  USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)              │      │
│   │  All escrows hold USDC · Vendors receive USDC · Fixed USD pricing   │      │
│   └─────────────────────────────────────────────────────────────────────┘      │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## FLOW 1: MARKETPLACE DIRECT SALE (ESCROW)

### Complete Transaction Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      MARKETPLACE ESCROW SALE — FULL FLOW                         │
│                     (Fixed USD Price · USDC Settlement)                           │
└──────────────────────────────────────────────────────────────────────────────────┘

  VENDOR                  ADMIN / SQUADS              BUYER
    │                          │                         │
    │                          │                         │
    ▼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 1: LISTING ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    │                          │                         │
    │  1. Upload asset photos  │                         │
    │     + AI watch analysis  │                         │
    │     ┌────────────────┐   │                         │
    │     │ POST /api/ai/  │   │                         │
    │     │ analyze-watch  │   │                         │
    │     │ → auto-fills   │   │                         │
    │     │   brand, model │   │                         │
    │     │   specs, price │   │                         │
    │     └────────────────┘   │                         │
    │                          │                         │
    │  2. Request sale listing │                         │
    │  POST /api/vendor/       │                         │
    │       mint-request       │                         │
    ├─────────────────────────►│                         │
    │                          │                         │
    │                   3. Admin reviews & approves      │
    │                   POST /api/nft/approveSale        │
    │                          │                         │
    │  4. Mint NFT + Create    │                         │
    │     Escrow via Squads    │                         │
    │  POST /api/escrow/       │                         │
    │       create-with-mint   │                         │
    ├─────────────────────────►│                         │
    │                          │                         │
    │   ┌──────────────────────┴──────────────────────┐  │
    │   │          SQUADS PROPOSAL #1                  │  │
    │   │  Instruction: initialize                     │  │
    │   │  ┌────────────────────────────────────────┐  │  │
    │   │  │ • Create Escrow PDA on-chain           │  │  │
    │   │  │ • Transfer NFT → escrow nft_vault      │  │  │
    │   │  │ • Create USDC vault (empty)            │  │  │
    │   │  │ • Set sale_price in USDC atomic units  │  │  │
    │   │  │ • mint_a = USDC mint                   │  │  │
    │   │  │ • mint_b = NFT mint                    │  │  │
    │   │  └────────────────────────────────────────┘  │  │
    │   │  Threshold: 1/1 → Auto-execute               │  │
    │   └──────────────────────┬──────────────────────┘  │
    │                          │                         │
    │   MongoDB:               │                         │
    │   ┌──────────────────────┴───────┐                 │
    │   │ status: 'listed'             │                 │
    │   │ listingPriceUSD: 15000       │                 │
    │   │ listingPrice: 15000000000    │ ← USDC atomic   │
    │   │ saleMode: 'fixed_price'     │                 │
    │   │ paymentMint: 'USDC'         │                 │
    │   │ escrowPda: '...'            │                 │
    │   │ nftMint: '...'              │                 │
    │   └──────────────────────────────┘                 │
    │                          │                         │
    ▼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 2: PURCHASE ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    │                          │                         │
    │                          │   5. Buyer browses      │
    │                          │   marketplace           │
    │                          │   ┌──────────────────┐  │
    │                          │   │ Price displayed   │  │
    │                          │   │ as: $15,000 USD   │  │
    │                          │   │ Pay with: SOL or  │  │
    │                          │   │          USDC     │  │
    │                          │   └──────────────────┘  │
    │                          │                         │
    │                          │   6a. IF PAYING USDC:   │
    │                          │   ┌──────────────────┐  │
    │                          │   │ Check USDC ATA   │  │
    │                          │   │ balance >= price  │  │
    │                          │   │ Sign exchange tx  │  │
    │                          │   │ USDC → vault      │  │
    │                          │   └──────────────────┘  │
    │                          │                         │
    │                          │   6b. IF PAYING SOL:    │
    │                          │   ┌──────────────────┐  │
    │                          │   │ Step 1: Jupiter   │  │
    │                          │   │ ExactOut quote    │  │
    │                          │   │ "How much SOL for │  │
    │                          │   │  15000 USDC?"     │  │
    │                          │   │                   │  │
    │                          │   │ Step 2: Sign swap │  │
    │                          │   │ SOL → USDC into   │  │
    │                          │   │ buyer's ATA       │  │
    │                          │   │                   │  │
    │                          │   │ Step 3: Sign      │  │
    │                          │   │ exchange tx       │  │
    │                          │   │ USDC → vault      │  │
    │                          │   └──────────────────┘  │
    │                          │                         │
    │                          │   7. Record purchase    │
    │                          │   POST /api/escrow/     │
    │                          │        purchase         │
    │                          │◄────────────────────────┤
    │                          │                         │
    │   MongoDB:               │                         │
    │   ┌──────────────────────┴───────┐                 │
    │   │ status: 'funded'             │                 │
    │   │ buyerWallet: '...'           │                 │
    │   │ buyerShippingAddress: {...}   │                 │
    │   │ fundedAt: timestamp          │                 │
    │   │ fundedAmount: 15000000000    │ ← USDC atomic   │
    │   │ paymentMint: 'USDC'          │                 │
    │   │ swapTxSignature: '...'       │ ← if SOL swap   │
    │   │ txSignature: '...'           │ ← exchange tx   │
    │   └──────────────────────────────┘                 │
    │                          │                         │
    │   ┌───── NOTIFICATIONS ──┴──────────┐              │
    │   │ → Vendor: "New order!"          │              │
    │   │ → Buyer: "Purchase confirmed,   │              │
    │   │   $15,000 USDC in escrow"       │              │
    │   └─────────────────────────────────┘              │
    │                          │                         │
    ▼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 3: SHIPMENT ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    │                          │                         │
    │  8. Vendor ships item    │                         │
    │  POST /api/escrow/       │                         │
    │       submit-shipment    │                         │
    ├─────────────────────────►│                         │
    │                          │                         │
    │   MongoDB:               │                         │
    │   ┌──────────────────────┴───────┐                 │
    │   │ status: 'shipped'            │                 │
    │   │ shipmentStatus: 'shipped'    │                 │
    │   │ trackingCarrier: 'FedEx'     │                 │
    │   │ trackingNumber: '123456'     │                 │
    │   │ trackingUrl: 'https://...'   │                 │
    │   │ shipmentProofUrls: [IPFS]    │                 │
    │   └──────────────────────────────┘                 │
    │                          │                         │
    │   ┌───── NOTIFICATIONS ──┴──────────┐              │
    │   │ → Buyer: "Your order shipped!   │              │
    │   │   Track: FedEx 123456"          │              │
    │   │ → Admin: "Proof submitted,      │              │
    │   │   verify shipment"              │              │
    │   └─────────────────────────────────┘              │
    │                          │                         │
    │                   9. Admin verifies shipment       │
    │                   POST /api/escrow/                │
    │                        verify-shipment             │
    │                          │                         │
    │                   ┌──────┴──────┐                  │
    │                   │  APPROVED?  │                  │
    │                   └──┬──────┬──┘                   │
    │                  YES │      │ NO                   │
    │                      │      │                      │
    │                      │      ▼                      │
    │                      │  Reject → vendor must       │
    │                      │  resubmit tracking          │
    │                      │  (stored in rejection       │
    │                      │   history array)            │
    │                      ▼                             │
    │                          │                         │
    ▼ ─ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 4: DELIVERY CONFIRMATION ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    │                          │                         │
    │                          │  10. Buyer confirms     │
    │                          │  POST /api/escrow/      │
    │                          │       confirm-delivery   │
    │                          │◄────────────────────────┤
    │                          │                         │
    │   ┌──────────────────────┴──────────────────────┐  │
    │   │          SQUADS PROPOSAL #2                  │  │
    │   │  Instruction: confirm_delivery               │  │
    │   │  ┌────────────────────────────────────────┐  │  │
    │   │  │ On-Chain Actions:                      │  │  │
    │   │  │                                        │  │  │
    │   │  │  USDC Vault ($15,000 USDC)             │  │  │
    │   │  │    ├─── 97% ($14,550) → Seller ATA     │  │  │
    │   │  │    └───  3% ($450)   → Treasury ATA    │  │  │
    │   │  │                                        │  │  │
    │   │  │  NFT Vault                             │  │  │
    │   │  │    └─── NFT → Buyer ATA                │  │  │
    │   │  │                                        │  │  │
    │   │  │  Escrow: is_completed = true            │  │  │
    │   │  └────────────────────────────────────────┘  │  │
    │   │  Squads CPI validates authority              │  │
    │   └──────────────────────┬──────────────────────┘  │
    │                          │                         │
    │   ┌───── NOTIFICATIONS ──┴──────────┐              │
    │   │ → Vendor: "Payment released!    │              │
    │   │   $14,550 USDC received"        │              │
    │   │ → Buyer: "Delivery confirmed,   │              │
    │   │   NFT transferred to you"       │              │
    │   └─────────────────────────────────┘              │
    │                          │                         │
    │  11. Vendor receives     │  11. Buyer receives     │
    │      $14,550 USDC        │      NFT in wallet      │
    │      (fixed USD value)   │      (ownership proof)   │
    │                          │                         │
    ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 4-ALT: REFUND (Rejection Path) ─ ─ ─ ─ ─ ─ ─ ─
    │                          │                         │
    │                  10-ALT. Admin initiates refund    │
    │                  POST /api/escrow/refund           │
    │                          │                         │
    │   ┌──────────────────────┴──────────────────────┐  │
    │   │          SQUADS PROPOSAL #2-ALT              │  │
    │   │  Instruction: refund_buyer                   │  │
    │   │  ┌────────────────────────────────────────┐  │  │
    │   │  │ On-Chain Actions:                      │  │  │
    │   │  │                                        │  │  │
    │   │  │  USDC Vault ($15,000 USDC)             │  │  │
    │   │  │    └─── 100% → Buyer ATA               │  │  │
    │   │  │                                        │  │  │
    │   │  │  NFT Vault                             │  │  │
    │   │  │    └─── NFT → Seller ATA               │  │  │
    │   │  │                                        │  │  │
    │   │  │  Escrow: is_completed = true            │  │  │
    │   │  │  Vault accounts closed (rent returned)  │  │  │
    │   │  └────────────────────────────────────────┘  │  │
    │   └──────────────────────┬──────────────────────┘  │
    │                          │                         │
    │   ┌───── NOTIFICATIONS ──┴──────────┐              │
    │   │ → Buyer: "Refund processed,     │              │
    │   │   $15,000 USDC returned"        │              │
    │   │ → Vendor: "Order refunded,      │              │
    │   │   NFT returned to your wallet"  │              │
    │   └─────────────────────────────────┘              │
    │                          │                         │
```

### Escrow Status State Machine

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                 ESCROW STATUS FLOW                           │
                    └─────────────────────────────────────────────────────────────┘

    ┌───────────┐   Squads    ┌───────────┐   Buyer    ┌───────────┐
    │ initiated │──execute──►│  listed   │──deposits──►│  funded   │
    └─────┬─────┘            └─────┬─────┘            └─────┬─────┘
          │                        │                        │
          │  convert               │  cancel                │  vendor ships
          │  to pool               │  (no buyer)            │
          ▼                        ▼                        ▼
    ┌───────────┐           ┌───────────┐           ┌───────────┐
    │ converted │           │ cancelled │◄──refund──│  shipped  │
    └───────────┘           └───────────┘           └─────┬─────┘
                                  ▲                       │
                                  │                       │  admin verifies
                                  │                       │  + buyer confirms
                                  │                       ▼
                            ┌───────────┐           ┌───────────┐
                            │  failed   │           │ delivered │
                            └───────────┘           └─────┬─────┘
                                                          │
                                                          │  Squads execute
                                                          │  confirm_delivery
                                                          ▼
                                                    ┌───────────┐
                                                    │ released  │
                                                    └───────────┘
```

### Data Tracked at Each Stage

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     REAL-WORLD DATA PER TRANSACTION                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  LISTING DATA (set at creation)                                                 │
│  ├── Asset: brand, model, serial, condition, specs, photos (IPFS)              │
│  ├── Pricing: listingPriceUSD (fixed), listingPrice (USDC atomic)              │
│  ├── Sale Mode: fixed_price | accepting_offers | crowdfunded                   │
│  ├── On-Chain: escrowPda, nftMint, seed, bump                                  │
│  ├── Squads: squadsTransactionIndex, squadsProposedAt                          │
│  └── Vendor: sellerWallet, seller (Vendor ref)                                 │
│                                                                                 │
│  PURCHASE DATA (set when buyer deposits)                                        │
│  ├── Buyer: buyerWallet, buyer (User ref)                                      │
│  ├── Payment: paymentMint (SOL|USDC), fundedAmount, fundedAt                   │
│  ├── Swap: swapTxSignature (if SOL→USDC via Jupiter)                           │
│  ├── On-Chain: txSignature (exchange instruction)                              │
│  └── Shipping: fullName, street1/2, city, state, zip, country, phone, email    │
│                                                                                 │
│  SHIPMENT DATA (set when vendor ships)                                          │
│  ├── Carrier: trackingCarrier (FedEx/UPS/DHL/USPS)                             │
│  ├── Tracking: trackingNumber, trackingUrl (auto-generated)                    │
│  ├── Proof: shipmentProofUrls[] (IPFS photos of packaging/receipt)             │
│  ├── Origin: shippedFromAddress { city, state, country }                       │
│  ├── ETA: estimatedDeliveryDate                                                │
│  ├── Notes: vendorShipmentNotes                                                │
│  └── Rejection History: [{ reason, rejectedBy, rejectedAt, prev tracking }]    │
│                                                                                 │
│  DELIVERY DATA (set when buyer confirms)                                        │
│  ├── Confirmation: { confirmedBy, confirmationType, confirmedAt }              │
│  ├── Review: { rating (1-5), reviewText }                                      │
│  ├── Delivery: actualDeliveryDate, deliveryNotes                               │
│  └── Squads: confirmDeliveryProposalIndex, confirmDeliveryExecutedAt           │
│                                                                                 │
│  FINANCIAL DATA (calculated)                                                    │
│  ├── Sale Price: listingPriceUSD (what buyer pays)                             │
│  ├── Vendor Receives: 97% of sale price in USDC                               │
│  ├── Treasury Fee: 3% of sale price in USDC                                   │
│  ├── Royalty: royaltyAmount (pre-calculated in pre-save hook)                  │
│  └── On-Chain Split: enforced by confirm_delivery instruction                  │
│                                                                                 │
│  REFUND DATA (if applicable)                                                    │
│  ├── Reason: cancelReason                                                      │
│  ├── Amount: refundedAmount (full USDC amount returned)                        │
│  ├── Timing: cancelledAt, refundProposedAt, refundExecutedAt                   │
│  └── Squads: refundProposalIndex                                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## FLOW 2: FRACTIONAL OWNERSHIP POOLS

### Complete Pool Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    FRACTIONAL OWNERSHIP POOL — FULL FLOW                          │
│                  (Crowdfunded RWA · USDC Settlement · Bags DEX)                   │
└──────────────────────────────────────────────────────────────────────────────────┘

 VENDOR/DEALER             ADMIN / LUXHUB               INVESTORS
      │                          │                          │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 1: POOL CREATION ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │   Option A: Fresh Pool   │                          │
      │   POST /api/pool/create  │                          │
      ├─────────────────────────►│                          │
      │                          │                          │
      │   Option B: Escrow→Pool  │                          │
      │   POST /api/pool/        │                          │
      │        convert-from-     │                          │
      │        escrow            │                          │
      ├─────────────────────────►│                          │
      │                          │                          │
      │   MongoDB:               │                          │
      │   ┌──────────────────────┴───────┐                  │
      │   │ status: 'open'               │                  │
      │   │ totalShares: 1,000,000       │                  │
      │   │ sharePriceUSD: $0.10         │                  │
      │   │ targetAmountUSD: $100,000    │                  │
      │   │ liquidityModel: 'p2p'        │                  │
      │   │ bondingCurveType: 'linear'   │                  │
      │   │ tokenStatus: 'pending'       │                  │
      │   │ custodyStatus: 'pending'     │                  │
      │   └──────────────────────────────┘                  │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 2: INVESTOR FUNDING ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │                          │   Investors buy shares   │
      │                          │   POST /api/pool/invest  │
      │                          │◄─────────────────────────┤
      │                          │                          │
      │                          │   OR via bonding curve   │
      │                          │   POST /api/pool/buy     │
      │                          │   (Bags API quote+swap)  │
      │                          │◄─────────────────────────┤
      │                          │                          │
      │   ┌──────────────────────┴───────────────────────┐  │
      │   │            INVESTMENT TRACKING                │  │
      │   │                                               │  │
      │   │  participants: [                              │  │
      │   │    {                                          │  │
      │   │      wallet: "8N3b...",                       │  │
      │   │      shares: 200,000,                        │  │
      │   │      investedUSD: 20000,                     │  │
      │   │      ownershipPercent: 20%,  ← auto-calc     │  │
      │   │      investedAt: timestamp                   │  │
      │   │    },                                        │  │
      │   │    ...                                       │  │
      │   │  ]                                           │  │
      │   │  sharesSold: 800,000 / 1,000,000             │  │
      │   │  fundsInEscrow: $80,000                      │  │
      │   │  ┌────────────────────────────────────┐      │  │
      │   │  │ ████████████████████░░░░░  80%     │      │  │
      │   │  └────────────────────────────────────┘      │  │
      │   └──────────────────────────────────────────────┘  │
      │                          │                          │
      │              When 100% shares sold:                 │
      │              status → 'filled'                      │
      │              (auto via pre-save hook)               │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 3: VENDOR PAYMENT ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │              Admin pays vendor                      │
      │              POST /api/pool/pay-vendor              │
      │                          │                          │
      │   ┌──────────────────────┴──────────────────────┐   │
      │   │         SQUADS PROPOSAL: PAY VENDOR          │   │
      │   │  ┌────────────────────────────────────────┐  │   │
      │   │  │  Pool Funds ($100,000 USDC)            │  │   │
      │   │  │    ├── 97% ($97,000) → Vendor wallet   │  │   │
      │   │  │    └──  3% ($3,000)  → Treasury        │  │   │
      │   │  └────────────────────────────────────────┘  │   │
      │   │  status → 'funded'                           │   │
      │   │  tokenStatus → 'unlocked' (trading enabled)  │   │
      │   └──────────────────────┬──────────────────────┘   │
      │                          │                          │
      │  Vendor receives $97K    │                          │
      │◄─────────────────────────┤                          │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 4: CUSTODY TRANSFER ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │  Ship to LuxHub vault    │                          │
      │  POST /api/pool/custody  │                          │
      │  action: submit_tracking │                          │
      ├─────────────────────────►│                          │
      │                          │                          │
      │              ┌───────────┴───────────┐              │
      │              │   CUSTODY PIPELINE    │              │
      │              │                       │              │
      │              │  pending              │              │
      │              │    ↓ submit_tracking  │              │
      │              │  shipped (tracking #) │              │
      │              │    ↓ mark_received    │              │
      │              │  received (proof      │              │
      │              │    photos on IPFS)    │              │
      │              │    ↓ verify           │              │
      │              │  verified (admin      │              │
      │              │    authenticates)     │              │
      │              │    ↓ store            │              │
      │              │  stored (in secure    │              │
      │              │    vault)             │              │
      │              └───────────┬───────────┘              │
      │                          │                          │
      │              status → 'active'                      │
      │              (asset in LuxHub custody)              │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 5: SECONDARY TRADING ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │                          │   Token holders can      │
      │                          │   trade pool shares      │
      │                          │                          │
      │   ┌──────────────────────┴──────────────────────┐   │
      │   │         TRADING OPTIONS                      │   │
      │   │                                              │   │
      │   │  P2P (Direct):                               │   │
      │   │  ┌──────────────────────────────────────┐    │   │
      │   │  │ Holder A sells 50K shares to B       │    │   │
      │   │  │ Price: negotiated between parties    │    │   │
      │   │  │ LuxHub escrows the trade             │    │   │
      │   │  └──────────────────────────────────────┘    │   │
      │   │                                              │   │
      │   │  Bonding Curve (Bags DEX):                   │   │
      │   │  ┌──────────────────────────────────────┐    │   │
      │   │  │ Automated market maker               │    │   │
      │   │  │ Price adjusts with demand             │    │   │
      │   │  │ Buy/sell anytime via /api/pool/buy    │    │   │
      │   │  │ Slippage protection built-in          │    │   │
      │   │  └──────────────────────────────────────┘    │   │
      │   └──────────────────────────────────────────────┘   │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 6: ASSET RESALE ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │              Admin lists for resale                 │
      │              POST /api/pool/                        │
      │                   list-for-resale                   │
      │                          │                          │
      │   ┌──────────────────────┴──────────────────────┐   │
      │   │         RESALE LISTING                       │   │
      │   │                                              │   │
      │   │  Original cost: $100,000                     │   │
      │   │  Resale price:  $120,000                     │   │
      │   │                                              │   │
      │   │  After 3% fee:  $116,400 to distribute      │   │
      │   │  Profit:         $16,400                     │   │
      │   │  Projected ROI:  16.4%                       │   │
      │   │                                              │   │
      │   │  status → 'listed'                           │   │
      │   └──────────────────────────────────────────────┘   │
      │                          │                          │
      │              [FULL-PRICE BUYER PURCHASES]           │
      │              status → 'sold'                        │
      │                          │                          │
      ▼ ─ ─ ─ ─ ─ ─ ─ ─ PHASE 7: DISTRIBUTION ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
      │                          │                          │
      │              POST /api/pool/distribute              │
      │                          │                          │
      │   ┌──────────────────────┴──────────────────────┐   │
      │   │         SQUADS PROPOSAL: DISTRIBUTE          │   │
      │   │                                              │   │
      │   │  Resale Proceeds ($120,000 USDC)             │   │
      │   │    ├── 3% ($3,600)  → Treasury               │   │
      │   │    └── 97% ($116,400) → Investors             │   │
      │   │                                              │   │
      │   │  Per-Investor Calculation:                    │   │
      │   │  ┌──────────────────────────────────────┐    │   │
      │   │  │ Wallet       │ Shares │ Own% │ Payout│    │   │
      │   │  │──────────────│────────│──────│───────│    │   │
      │   │  │ 8N3b...      │ 200K  │ 20%  │$23,280│    │   │
      │   │  │ 5Kx2...      │ 300K  │ 30%  │$34,920│    │   │
      │   │  │ 9Rm7...      │ 500K  │ 50%  │$58,200│    │   │
      │   │  └──────────────────────────────────────┘    │   │
      │   │                                              │   │
      │   │  status → 'distributed' → 'closed'          │   │
      │   └──────────────────────┬──────────────────────┘   │
      │                          │                          │
      │                          │   Investors receive      │
      │                          │   USDC proportional      │
      │                          │   to their shares        │
      │                          ├─────────────────────────►│
      │                          │                          │
```

### Pool Status State Machine

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    POOL STATUS FLOW                          │
                    └─────────────────────────────────────────────────────────────┘

    ┌────────┐  all shares  ┌────────┐  vendor   ┌────────┐  custody   ┌────────┐
    │  open  │───sold──────►│ filled │──paid────►│ funded │──verified─►│ active │
    └───┬────┘              └────────┘           └────────┘            └───┬────┘
        │                                                                  │
        │ failed                                                     list for
        ▼                                                           resale
    ┌────────┐                                                          │
    │ failed │                                                          ▼
    └────────┘                                                     ┌────────┐
                                                                   │ listed │
        ┌────────┐   distribute   ┌──────────────┐   buyer       └───┬────┘
        │ closed │◄──proceeds────│ distributed  │◄──purchases───────┘
        └────────┘                └──────────────┘     │
                                                   ┌───┴────┐
                                                   │  sold  │
                                                   └────────┘
```

### Pool Data Model Summary

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       REAL-WORLD DATA PER POOL                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  POOL CONFIGURATION                                                             │
│  ├── Asset: selectedAssetId, assetTitle, assetImageUrl                          │
│  ├── Escrow Link: escrowId, escrowPda (if converted from escrow)               │
│  ├── Shares: totalShares, sharesSold, sharePriceUSD                            │
│  ├── Target: targetAmountUSD (e.g., $100,000)                                  │
│  ├── Limits: minBuyInUSD, maxInvestors                                         │
│  └── Source: sourceType ('dealer' | 'escrow_conversion')                       │
│                                                                                 │
│  INVESTOR RECORDS                                                               │
│  ├── participants[]: { wallet, shares, investedUSD, ownershipPercent, date }   │
│  ├── fundsInEscrow: running total of invested USDC                             │
│  ├── investorCount: number of unique investors                                 │
│  └── highestInvestor: wallet with most shares                                  │
│                                                                                 │
│  TOKENIZATION (Bags DEX)                                                        │
│  ├── bagsTokenMint: SPL token address                                          │
│  ├── tokenStatus: pending | minted | unlocked                                  │
│  ├── bondingCurveActive: boolean                                                │
│  ├── bondingCurveType: linear | exponential | sqrt                             │
│  └── currentBondingPrice: latest price from curve                              │
│                                                                                 │
│  CUSTODY CHAIN                                                                  │
│  ├── custodyStatus: pending → shipped → received → verified → stored           │
│  ├── custodyTrackingCarrier, custodyTrackingNumber                              │
│  ├── custodyProofUrls[]: IPFS photos of received asset                         │
│  ├── custodyVerifiedBy: admin wallet who authenticated                         │
│  └── custodyReceivedAt, custodyVerifiedAt, custodyStoredAt                     │
│                                                                                 │
│  VENDOR PAYMENT                                                                 │
│  ├── vendorPaymentAmount: 97% of target (calculated)                           │
│  ├── vendorPaymentAt: when paid                                                │
│  ├── vendorPaymentTxSignature: on-chain proof                                  │
│  └── squadsVendorPaymentIndex: Squads proposal reference                       │
│                                                                                 │
│  RESALE & DISTRIBUTION                                                          │
│  ├── resaleListingPrice, resaleListingPriceUSD                                 │
│  ├── resaleSoldPrice, resaleBuyerWallet                                        │
│  ├── distributionStatus: pending | proposed | executing | completed             │
│  ├── distributions[]: { wallet, shares, ownershipPercent, amount, profit, roi } │
│  ├── squadsDistributionIndex: Squads proposal for payout                       │
│  └── royaltyAmount: 3% treasury fee                                            │
│                                                                                 │
│  GOVERNANCE (Squad DAO)                                                         │
│  ├── squadMultisigPda: DAO address                                             │
│  ├── squadMembers[]: { wallet, shares, role }                                  │
│  ├── squadThreshold: votes needed for decisions                                │
│  └── nftTransferredToSquad: boolean                                            │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## SQUADS MULTISIG INTEGRATION

### Which Actions Require Squads Approval

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                   SQUADS-GATED ACTIONS                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  MARKETPLACE ESCROW:                                                            │
│  ├── initialize       → Create escrow, lock NFT in vault                       │
│  ├── confirm_delivery → Release funds (97/3 split), transfer NFT               │
│  └── refund_buyer     → Return USDC to buyer, NFT to seller                    │
│                                                                                 │
│  POOL OPERATIONS:                                                               │
│  ├── pay_vendor       → Send 97% of pool funds to vendor                       │
│  └── distribute       → Split resale proceeds to all investors                 │
│                                                                                 │
│  PROTOCOL:                                                                      │
│  ├── update_config    → Change authority, treasury, fee, pause                 │
│  └── close_config     → Remove config (migration only)                         │
│                                                                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                                                 │
│  FLOW:  Action → POST /api/squads/propose → Members approve → Execute          │
│                                                                                 │
│  Current Config:                                                                │
│  ├── Multisig: H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7                  │
│  ├── Threshold: 1 (dev mode — increase for production)                         │
│  └── Vault 0: CaMDGCYKDVUhLZfRVgteQyksUnRDpt9AWZa8JLAqf6S1                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## REAL-WORLD GAPS & WHAT'S NEEDED

### Marketplace (Mostly Complete)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    MARKETPLACE — IMPLEMENTATION STATUS                            │
├──────────────────────────────────────────┬──────────────────────────────────────┤
│  COMPLETE ✅                              │  NEEDS WORK ⚠️                       │
├──────────────────────────────────────────┼──────────────────────────────────────┤
│  NFT minting + IPFS metadata             │  Escrow timeout/expiry (no auto-    │
│  Escrow PDA creation via Squads          │    refund after N days)             │
│  USDC-based pricing (fixed USD)          │  Dispute resolution UI (admin has   │
│  Jupiter SOL→USDC swap (buyer-side)      │    override but no formal flow)     │
│  BuyModal with token selector            │  Squads proposal execution is       │
│  Purchase recording + notifications      │    manual (admin clicks execute)    │
│  Shipment tracking (carrier+tracking#)   │  No webhook for tracking updates    │
│  Shipment proof (IPFS photos)            │    (manual carrier check)           │
│  Admin verification of shipment          │  Offer mode UX (accepting_offers    │
│  Buyer delivery confirmation             │    works but flow is clunky)        │
│  confirm_delivery (97/3 USDC split)      │  No transaction history page        │
│  refund_buyer (full USDC return)         │    for buyers                       │
│  Notification system (in-app + email)    │  EasyPost label integration         │
│  Shipping address collection             │    (schema ready, not wired)        │
│                                          │                                     │
└──────────────────────────────────────────┴──────────────────────────────────────┘
```

### Pools (Needs Significant Work)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      POOLS — IMPLEMENTATION STATUS                               │
├──────────────────────────────────────────┬──────────────────────────────────────┤
│  COMPLETE ✅                              │  NEEDS WORK ⚠️                       │
├──────────────────────────────────────────┼──────────────────────────────────────┤
│  Data model (240+ fields)                │  CRITICAL: Vendor payment doesn't    │
│  Pool creation API                       │    actually execute on-chain         │
│  Investment recording + auto-calc        │  CRITICAL: Distribution doesn't      │
│  Custody pipeline (5-stage tracking)     │    actually transfer USDC            │
│  Resale listing + ROI projection         │  CRITICAL: Funds tracked in MongoDB  │
│  Distribution math (per-investor)        │    but not in on-chain escrow        │
│  Status state machine                    │  Token minting falls back to mock    │
│  Admin guards + role checks              │    if Bags API unavailable           │
│  Pool UI page with filters               │  No resale buyer mechanism           │
│  SWR hooks for data fetching             │    (listed but can't be purchased)  │
│  Squads proposal creation (structure)    │  Bonding curve not on-chain          │
│  Bonding curve config schema             │  Token burn post-distribution        │
│  P2P + AMM + Hybrid model schema        │  Squad DAO creation                  │
│                                          │  AMM liquidity pool setup            │
│                                          │  Bags webhook sync                   │
│                                          │  Investor claim/withdrawal UI        │
│                                          │                                     │
└──────────────────────────────────────────┴──────────────────────────────────────┘
```

### Priority Fix Order for Pools MVP

```
                    ┌─────────────────────────────────────────────┐
                    │         POOLS MVP PRIORITY LADDER            │
                    └─────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────┐
    │  P0: MONEY MUST MOVE                                         │
    │  ─────────────────────                                       │
    │  1. On-chain escrow for pool investments (hold USDC)        │
    │  2. Vendor payment execution (not just proposal)            │
    │  3. Distribution execution (actually pay investors)          │
    │  Without these, pools are a database of promises             │
    └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  P1: TOKENS MUST EXIST                                       │
    │  ─────────────────────                                       │
    │  4. Real Bags token minting (not mock fallback)              │
    │  5. Token unlock after vendor payment                        │
    │  6. Token burn after distribution                            │
    │  Without these, investors have no tradeable asset             │
    └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  P2: ASSETS MUST BE SELLABLE                                 │
    │  ──────────────────────────                                  │
    │  7. Resale buyer matching (marketplace or auction)           │
    │  8. Resale purchase flow (buyer pays, triggers distribute)   │
    │  Without these, pools never close and investors never exit    │
    └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  P3: TRADING MUST WORK                                       │
    │  ─────────────────────                                       │
    │  9. Bags bonding curve on-chain                              │
    │  10. Secondary market trading UI                             │
    │  11. Bags webhook sync for price updates                     │
    │  Without these, tokens exist but can't be traded              │
    └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  P4: GOVERNANCE                                              │
    │  ──────────                                                  │
    │  12. Squad DAO creation for each pool                        │
    │  13. NFT transfer to Squad vault                             │
    │  14. Member voting on pool decisions                         │
    │  Nice-to-have, not blocking MVP                              │
    └──────────────────────────────────────────────────────────────┘
```

---

## API ENDPOINTS REFERENCE

### Escrow APIs
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/escrow/create-with-mint` | POST | Mint NFT + create escrow via Squads | Vendor |
| `/api/escrow/purchase` | POST | Buyer deposits USDC, records shipping | Buyer |
| `/api/escrow/confirm-delivery` | POST | Confirm delivery, trigger fund release | Buyer/Admin |
| `/api/escrow/refund` | POST | Initiate USDC refund to buyer | Admin |
| `/api/escrow/submit-shipment` | POST | Vendor submits tracking info | Vendor |
| `/api/escrow/verify-shipment` | POST | Admin approves/rejects shipment | Admin |
| `/api/escrow/update-price` | POST | Update listing price or mode | Vendor |
| `/api/escrow/list` | GET | List escrow listings with filters | Public |
| `/api/escrow/pending-shipments` | GET | List shipments needing verification | Admin |
| `/api/escrow/[pda]` | GET | Get single escrow by PDA | Public |

### Pool APIs
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/pool/create` | POST | Create new pool | Vendor/Admin |
| `/api/pool/invest` | POST | Buy pool shares | Investor |
| `/api/pool/buy` | POST | Buy via Bags bonding curve | Investor |
| `/api/pool/convert-from-escrow` | POST | Convert escrow to pool | Admin |
| `/api/pool/custody` | GET/POST | Manage custody pipeline | Vendor/Admin |
| `/api/pool/pay-vendor` | POST | Create vendor payment proposal | Admin |
| `/api/pool/list-for-resale` | POST | List asset for secondary sale | Admin |
| `/api/pool/distribute` | POST | Create distribution proposal | Admin |
| `/api/pool/status` | GET | Get pool status + lifecycle info | Public |
| `/api/pool/list` | GET | List all pools with filters | Public |
| `/api/pool/graduate` | POST | Mark pool as graduated | Admin |

### Squads APIs
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/squads/propose` | POST | Create multisig proposal | Admin (wallet auth) |
| `/api/squads/execute` | POST | Execute approved proposal | Admin |
| `/api/squads/status` | GET | Check proposal approval status | Public |
| `/api/squads/proposals` | GET | List all proposals | Public |
| `/api/squads/sync` | POST | Sync on-chain state → MongoDB | Admin |

### Notification Events
| Event | Recipient | Trigger |
|-------|-----------|---------|
| `order_funded` | Buyer + Vendor | Purchase completed |
| `order_shipped` | Buyer | Vendor submits tracking |
| `shipment_submitted` | Admin(s) | Proof needs verification |
| `shipment_verified` | Vendor | Admin approves shipment |
| `shipment_rejected` | Vendor | Admin rejects shipment |
| `order_delivered` | Buyer | Delivery confirmed |
| `payment_released` | Vendor | Funds released to wallet |
| `order_refunded` | Buyer + Vendor | Refund processed |
| `offer_received` | Vendor | Buyer makes offer |
| `offer_accepted` | Buyer | Vendor accepts offer |
| `offer_rejected` | Buyer | Vendor rejects offer |
| `offer_countered` | Buyer | Vendor counter-offers |

---

## ENVIRONMENT VARIABLES

```bash
# Solana
NEXT_PUBLIC_SOLANA_ENDPOINT=https://devnet.helius-rpc.com/?api-key=xxx
PROGRAM_ID=kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj

# Squads Multisig
NEXT_PUBLIC_SQUADS_MSIG=H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7
SQUADS_MEMBER_KEYPAIR_PATH=/path/to/keypair.json

# Database
MONGODB_URI=mongodb+srv://...

# Treasury
NEXT_PUBLIC_LUXHUB_WALLET=<treasury_wallet>

# USDC Mint (constant — do not change)
# EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Notifications
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=LuxHub <notifications@luxhub.io>

# AI Analysis
ANTHROPIC_API_KEY=sk-ant-xxx

# Security
JWT_SECRET=<min 32 chars>
PII_ENCRYPTION_KEY=<64 char hex>
ADMIN_WALLETS=wallet1,wallet2
```

---

## STATE MACHINES (Summary)

### Escrow Status
```
initiated → listed → offer_accepted → funded → shipped → delivered → released
     │                                    │                    │
     └──► converted                       └──► cancelled ◄────┘ (refund)
                                                    │
                                               failed
```

### Pool Status
```
open → filled → funded → custody → active → listed → sold → distributed → closed
  │                                                    │
  └──────────────► failed/burned ◄─────────────────────┘
```

### Shipment Status
```
pending → shipped → in_transit → delivered → proof_submitted → verified
                                                    │
                                              rejected (resubmit)
```

### Custody Status (Pools)
```
pending → shipped → received → verified → stored
```

### Offer Status
```
pending → accepted → settled
    │         │
    │    countered ←──┐
    │         │       │
    │         └───────┘
    ├──► rejected
    ├──► withdrawn
    ├──► expired
    └──► auto_rejected (pool conversion)
```
