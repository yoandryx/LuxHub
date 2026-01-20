# LuxHub Marketplace Complete Workflow

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LUXHUB MARKETPLACE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│   │  VENDOR  │    │  BUYER   │    │  ADMIN   │    │ INVESTOR │             │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘             │
│        │               │               │               │                    │
│        ▼               ▼               ▼               ▼                    │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │                      NEXT.JS API LAYER                          │      │
│   │  /api/escrow/* │ /api/offers/* │ /api/pool/* │ /api/squads/*   │      │
│   └────────────────────────────┬────────────────────────────────────┘      │
│                                │                                            │
│        ┌───────────────────────┼───────────────────────┐                   │
│        ▼                       ▼                       ▼                    │
│   ┌─────────┐           ┌─────────────┐         ┌──────────┐               │
│   │ MongoDB │           │   Solana    │         │  Squads  │               │
│   │  (Data) │           │  (On-Chain) │         │(Multisig)│               │
│   └─────────┘           └─────────────┘         └──────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 1: Direct Escrow Sale (Fixed Price or Offers)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ESCROW SALE WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

VENDOR                    ADMIN/SQUADS                 BUYER
  │                            │                         │
  │ 1. Create Asset            │                         │
  │ POST /api/assets/create    │                         │
  ├───────────────────────────►│                         │
  │                            │                         │
  │ 2. Request Sale            │                         │
  │ POST /api/nft/requestSale  │                         │
  ├───────────────────────────►│                         │
  │                            │                         │
  │                     3. Admin Approves                │
  │                     POST /api/nft/approveSale        │
  │                            │                         │
  │ 4. Mint NFT + Init Escrow  │                         │
  │ POST /api/escrow/create-with-mint                    │
  ├───────────────────────────►│                         │
  │                            │                         │
  │              ┌─────────────┴─────────────┐           │
  │              │  SQUADS PROPOSAL CREATED  │           │
  │              │  - Multisig members vote  │           │
  │              │  - Threshold reached      │           │
  │              │  - Execute transaction    │           │
  │              └─────────────┬─────────────┘           │
  │                            │                         │
  │              5. Escrow PDA Created On-Chain          │
  │◄───────────────────────────┤                         │
  │                            │                         │
  │                            │    6. Browse Listings   │
  │                            │    GET /api/offers/list │
  │                            │◄────────────────────────┤
  │                            │                         │
  │                            │    7. Make Offer        │
  │                            │    POST /api/offers/create
  │                            │◄────────────────────────┤
  │                            │                         │
  │ 8. View/Counter/Accept     │                         │
  │ POST /api/offers/respond   │                         │
  ├───────────────────────────►│                         │
  │    (action: accept)        │                         │
  │                            │                         │
  │                            │    9. Buyer Deposits    │
  │                            │    (Exchange instruction)
  │                            │◄────────────────────────┤
  │                            │                         │
  │ 10. Ship Item              │                         │
  │ POST /api/escrow/submit-shipment                     │
  ├───────────────────────────►│                         │
  │                            │                         │
  │                     11. Admin Verifies Delivery      │
  │                     POST /api/escrow/verify-shipment │
  │                            │                         │
  │              ┌─────────────┴─────────────┐           │
  │              │  SQUADS CONFIRM_DELIVERY  │           │
  │              │  - NFT → Buyer            │           │
  │              │  - Funds → Seller (97%)   │           │
  │              │  - Fee → Treasury (3%)    │           │
  │              └─────────────┬─────────────┘           │
  │                            │                         │
  │ 12. Receive Payment        │    12. Receive NFT     │
  │◄───────────────────────────┴────────────────────────►│
  │                                                      │
```

---

## Flow 2: Fractional Ownership Pool

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FRACTIONAL POOL WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

VENDOR/DEALER              ADMIN/LUXHUB              INVESTORS
     │                          │                        │
     │ 1. List Asset for Pool   │                        │
     │ (sourceType: dealer)     │                        │
     ├─────────────────────────►│                        │
     │                          │                        │
     │                   2. Create Pool                  │
     │                   POST /api/pool/create           │
     │                          │                        │
     │                   ┌──────┴──────┐                 │
     │                   │ Pool Status │                 │
     │                   │   'open'    │                 │
     │                   └──────┬──────┘                 │
     │                          │                        │
     │                          │    3. View Pool        │
     │                          │    GET /api/pool/status│
     │                          │◄───────────────────────┤
     │                          │                        │
     │                          │    4. Buy Shares       │
     │                          │    POST /api/pool/invest
     │                          │◄───────────────────────┤
     │                          │                        │
     │                   ┌──────┴──────┐                 │
     │                   │ Pool Status │                 │
     │                   │  'filled'   │                 │
     │                   │ (All shares │                 │
     │                   │   sold)     │                 │
     │                   └──────┬──────┘                 │
     │                          │                        │
     │                   5. Pay Vendor (97%)             │
     │                   POST /api/pool/pay-vendor       │
     │◄─────────────────────────┤                        │
     │                          │                        │
     │ 6. Ship to LuxHub        │                        │
     │ (custody tracking)       │                        │
     ├─────────────────────────►│                        │
     │                          │                        │
     │                   7. Verify & Store               │
     │                   POST /api/pool/custody          │
     │                          │                        │
     │                   ┌──────┴──────┐                 │
     │                   │ Pool Status │                 │
     │                   │  'active'   │                 │
     │                   │ (In custody)│                 │
     │                   └──────┬──────┘                 │
     │                          │                        │
     │                   8. List for Resale              │
     │                   POST /api/pool/list-for-resale  │
     │                          │                        │
     │                   ┌──────┴──────┐                 │
     │                   │ Pool Status │                 │
     │                   │  'listed'   │                 │
     │                   └──────┬──────┘                 │
     │                          │                        │
     │                    [BUYER PURCHASES]              │
     │                          │                        │
     │                   ┌──────┴──────┐                 │
     │                   │ Pool Status │                 │
     │                   │   'sold'    │                 │
     │                   └──────┬──────┘                 │
     │                          │                        │
     │                   9. Distribute Proceeds          │
     │                   POST /api/pool/distribute       │
     │                          │                        │
     │              ┌───────────┴───────────┐            │
     │              │  SQUADS DISTRIBUTION  │            │
     │              │  - 97% to investors   │            │
     │              │  - 3% to treasury     │            │
     │              └───────────┬───────────┘            │
     │                          │                        │
     │                          │    10. Receive Payout  │
     │                          ├───────────────────────►│
     │                          │                        │
```

---

## Flow 3: Escrow to Pool Conversion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ESCROW → POOL CONVERSION                                   │
└─────────────────────────────────────────────────────────────────────────────┘

     EXISTING ESCROW                    POOL
          │                               │
          │  No direct buyer?             │
          │  Convert to fractional!       │
          │                               │
          ▼                               │
   POST /api/pool/convert-from-escrow     │
          │                               │
          │  - Copy asset reference       │
          │  - Set sourceType:            │
          │    'escrow_conversion'        │
          │  - Auto-reject pending offers │
          │  - Mark escrow 'converted'    │
          │                               │
          └──────────────────────────────►│
                                          │
                                   Pool opens for
                                   investment
```

---

## Squads Multisig Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SQUADS MULTISIG FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

    ACTION REQUIRED              SQUADS PROTOCOL              EXECUTION
          │                            │                          │
          │ 1. Build Instruction       │                          │
          │ (e.g., confirm_delivery)   │                          │
          ├───────────────────────────►│                          │
          │                            │                          │
          │              2. POST /api/squads/propose              │
          │              - Create vault transaction               │
          │              - Create proposal                        │
          │              - Auto-approve (creator)                 │
          │                            │                          │
          │              ┌─────────────┴─────────────┐            │
          │              │    PROPOSAL CREATED       │            │
          │              │    Status: Active         │            │
          │              │    Approvals: 1/N         │            │
          │              └─────────────┬─────────────┘            │
          │                            │                          │
          │              3. Members Approve                       │
          │              POST /api/squads/approve                 │
          │              (or via Squads UI)                       │
          │                            │                          │
          │              ┌─────────────┴─────────────┐            │
          │              │   THRESHOLD REACHED       │            │
          │              │   Approvals: N/N          │            │
          │              └─────────────┬─────────────┘            │
          │                            │                          │
          │              4. POST /api/squads/execute              │
          │                            ├─────────────────────────►│
          │                            │                          │
          │                            │    5. On-chain execution │
          │                            │    - Funds transferred   │
          │                            │    - NFT transferred     │
          │                            │◄─────────────────────────┤
          │                            │                          │
          │              6. POST /api/squads/sync                 │
          │              - Update MongoDB with results            │
          │◄───────────────────────────┤                          │
          │                            │                          │
```

---

## API Endpoints Reference

### Escrow APIs
| Endpoint | Method | Description | Requires |
|----------|--------|-------------|----------|
| `/api/escrow/create-with-mint` | POST | Mint NFT + Create escrow via Squads | Squads config |
| `/api/escrow/update-price` | POST | Update listing price/mode | Vendor wallet |
| `/api/escrow/pending-shipments` | GET | List pending shipments | - |
| `/api/escrow/submit-shipment` | POST | Submit tracking info | Funded escrow |
| `/api/escrow/verify-shipment` | POST | Admin verifies delivery | Admin + Shipped |

### Offers APIs
| Endpoint | Method | Description | Requires |
|----------|--------|-------------|----------|
| `/api/offers/create` | POST | Buyer makes offer | Escrow accepting offers |
| `/api/offers/list` | GET | List offers for escrow | - |
| `/api/offers/respond` | POST | Accept/reject/counter | Vendor wallet |

### Pool APIs
| Endpoint | Method | Description | Requires |
|----------|--------|-------------|----------|
| `/api/pool/status` | GET | Get pool details | Pool ID |
| `/api/pool/invest` | POST | Buy shares | Open pool |
| `/api/pool/convert-from-escrow` | POST | Convert escrow to pool | Valid escrow |
| `/api/pool/pay-vendor` | POST | Pay vendor 97% | Filled pool + Admin |
| `/api/pool/distribute` | POST | Distribute to investors | Sold pool + Admin |
| `/api/pool/list-for-resale` | POST | List for secondary sale | Active pool + Admin |

### Squads APIs
| Endpoint | Method | Description | Requires |
|----------|--------|-------------|----------|
| `/api/squads/propose` | POST | Create multisig proposal | Member keypair |
| `/api/squads/approve` | POST | Approve proposal | Member keypair |
| `/api/squads/execute` | POST | Execute approved proposal | Threshold met |
| `/api/squads/status` | GET | Check proposal status | Transaction index |
| `/api/squads/proposals` | GET | List all proposals | - |
| `/api/squads/sync` | POST | Sync on-chain to MongoDB | - |

---

## Environment Variables Required

```bash
# Solana
NEXT_PUBLIC_SOLANA_ENDPOINT=https://devnet.helius-rpc.com/?api-key=xxx
PROGRAM_ID=kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj

# Squads Multisig
NEXT_PUBLIC_SQUADS_MSIG=<your_multisig_pda>
SQUADS_MEMBER_KEYPAIR_PATH=/path/to/keypair.json
# OR
SQUADS_MEMBER_KEYPAIR_JSON='[1,2,3...]'

# Database
MONGODB_URI=mongodb+srv://...

# Treasury
NEXT_PUBLIC_LUXHUB_WALLET=<treasury_wallet>
```

---

## Step-by-Step Testing Guide

### Current Squads Configuration
```
Multisig PDA: H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7
Threshold: 1 (single approval)
Vault 0: CaMDGCYKDVUhLZfRVgteQyksUnRDpt9AWZa8JLAqf6S1 (1 SOL)
Squads UI: https://v4.squads.so/squads/H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7
```

### Phase 1: API Logic Tests (No Blockchain)
These tests verify database and API logic without on-chain operations:
```bash
# Run the test suite
npx tsx scripts/test-marketplace-apis.ts

# Expected: 7 passing, 12 skipped
```

### Phase 2: Full On-Chain Flow (Requires Real Wallets)

#### Step 1: Set Up Test Wallets
```bash
# Get your wallet address
solana address
# Example: 8N3bdK3tXAEiJs6AgHdtXksBdmSURvisYygmTzLFCYGn

# Airdrop devnet SOL
solana airdrop 2

# Check balance
solana balance
```

#### Step 2: Create Vendor Profile
```bash
# Create user with your real wallet
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"wallet": "<YOUR_WALLET>", "role": "vendor"}'

# Create vendor profile
curl -X POST http://localhost:3000/api/vendor/onboard-api \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "<YOUR_WALLET>",
    "businessName": "Test Luxury Watches",
    "username": "test_vendor"
  }'
```

#### Step 3: Create Asset
```bash
curl -X POST http://localhost:3000/api/assets/create \
  -H "Content-Type: application/json" \
  -d '{
    "vendorWallet": "<YOUR_WALLET>",
    "model": "Rolex Submariner Date",
    "serial": "ROLEX-123456",
    "priceUSD": 15000,
    "description": "Mint condition, box and papers"
  }'
# Save the assetId from response
```

#### Step 4: Mint NFT (Manual or via Metaplex)
```bash
# Option A: Use Metaplex CLI to create NFT
# Option B: Use existing mint from your wallet

# The NFT mint address must be a real SPL token
```

#### Step 5: Create Escrow via Squads
```bash
curl -X POST http://localhost:3000/api/escrow/create-with-mint \
  -H "Content-Type: application/json" \
  -d '{
    "vendorWallet": "<YOUR_WALLET>",
    "assetId": "<ASSET_ID>",
    "nftMint": "<NFT_MINT_ADDRESS>",
    "saleMode": "accepting_offers",
    "listingPrice": 15000000000,
    "listingPriceUSD": 15000,
    "minimumOffer": 10000000000,
    "minimumOfferUSD": 10000,
    "seed": 12345,
    "fileCid": "<IPFS_CID>"
  }'

# This creates a Squads proposal
# Response includes: squadsDeepLink to approve in Squads UI
```

#### Step 6: Execute Squads Proposal
```bash
# Check proposal status
curl "http://localhost:3000/api/squads/status?transactionIndex=7"

# Execute if threshold met
curl -X POST http://localhost:3000/api/squads/execute \
  -H "Content-Type: application/json" \
  -d '{"transactionIndex": "7"}'
```

#### Step 7: Buyer Makes Offer
```bash
curl -X POST http://localhost:3000/api/offers/create \
  -H "Content-Type: application/json" \
  -d '{
    "escrowPda": "<ESCROW_PDA>",
    "buyerWallet": "<BUYER_WALLET>",
    "offerAmount": 14000000000,
    "offerPriceUSD": 14000,
    "message": "Interested in this piece"
  }'
```

#### Step 8: Vendor Accepts Offer
```bash
curl -X POST http://localhost:3000/api/offers/respond \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "<OFFER_ID>",
    "vendorWallet": "<VENDOR_WALLET>",
    "action": "accept"
  }'
```

#### Step 9: Buyer Deposits (On-Chain Exchange)
```typescript
// This requires a frontend transaction:
// - Buyer signs exchange instruction
// - Funds transfer to escrow vault
```

#### Step 10: Vendor Ships & Admin Confirms
```bash
# Vendor submits shipment
curl -X POST http://localhost:3000/api/escrow/submit-shipment \
  -H "Content-Type: application/json" \
  -d '{
    "escrowPda": "<ESCROW_PDA>",
    "vendorWallet": "<VENDOR_WALLET>",
    "trackingCarrier": "FedEx",
    "trackingNumber": "123456789"
  }'

# Admin verifies delivery (creates Squads proposal for confirm_delivery)
curl -X POST http://localhost:3000/api/escrow/verify-shipment \
  -H "Content-Type: application/json" \
  -d '{
    "escrowPda": "<ESCROW_PDA>",
    "adminWallet": "<ADMIN_WALLET>",
    "approved": true
  }'
```

### Phase 3: Pool Flow Testing
```bash
# Create pool from dealer asset
curl -X POST http://localhost:3000/api/pool/create \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "<ASSET_ID>",
    "vendorId": "<VENDOR_ID>",
    "sourceType": "dealer",
    "totalShares": 100,
    "sharePriceUSD": 150,
    "minBuyInUSD": 150,
    "maxInvestors": 50,
    "projectedROI": 1.2
  }'

# Invest in pool
curl -X POST http://localhost:3000/api/pool/invest \
  -H "Content-Type: application/json" \
  -d '{
    "poolId": "<POOL_ID>",
    "investorWallet": "<INVESTOR_WALLET>",
    "shares": 5,
    "investedUSD": 750
  }'
```

---

## UI Pages & Components Analysis

### Existing Pages
| Page | Path | Purpose | Status |
|------|------|---------|--------|
| Marketplace | `/watchMarket` | Browse & buy NFTs | ✅ Working |
| Seller Dashboard | `/sellerDashboard` | Vendor NFT management, offers | ✅ Has OfferList |
| Admin Dashboard | `/adminDashboard` | Approve sales, manage vendors | ✅ Working |
| Pools | `/pools` | View fractional pools | 🟡 New |
| Create NFT | `/createNFT` | Mint new NFT | ✅ Working |
| Vendors | `/vendors` | Browse vendors | ✅ Working |

### Marketplace Components
| Component | Path | Purpose |
|-----------|------|---------|
| `NFTCard.tsx` | `/components/marketplace/` | Display NFT in grid |
| `NftDetailCard.tsx` | `/components/marketplace/` | NFT detail modal |
| `OfferList.tsx` | `/components/marketplace/` | List offers on escrow |
| `OfferCard.tsx` | `/components/marketplace/` | Single offer display |
| `MakeOfferModal.tsx` | `/components/marketplace/` | Create offer form |
| `PoolList.tsx` | `/components/marketplace/` | List pools |
| `PoolCard.tsx` | `/components/marketplace/` | Single pool display |
| `PoolDetail.tsx` | `/components/marketplace/` | Pool detail view |
| `FilterSortPanel.tsx` | `/components/marketplace/` | Filter/sort controls |

### UI Gaps Identified

#### Missing in watchMarket.tsx:
1. **Make Offer Integration** - Button exists but needs MakeOfferModal
2. **Escrow Status Display** - Show if item is in escrow, accepting offers
3. **Offer Count Badge** - Show number of active offers
4. **Price History** - Historical pricing data

#### Missing in sellerDashboard.tsx:
1. **Shipment Tracking Form** - Submit tracking info after sale
2. **Escrow Management** - View/update escrow settings
3. **Pool Conversion** - Convert escrow to pool

#### Missing Admin Features:
1. **Shipment Verification UI** - Verify delivered items
2. **Squads Proposal Management** - View/execute pending proposals
3. **Pool Distribution Controls** - Trigger payouts

#### New Pages Needed:
1. **`/escrow/[pda]`** - Detailed escrow view with offers
2. **`/pool/[id]`** - Pool detail with investment UI
3. **`/vendor/dashboard/shipments`** - Shipment management

---

## State Machines

### Escrow Status Flow
```
initiated → listed → offer_accepted → funded → shipped → delivered → released
     │                                                          │
     └──────────────────► converted (to pool) ◄─────────────────┘
                                │
                          cancelled/failed
```

### Pool Status Flow
```
open → filled → funded → custody → active → listed → sold → distributing → distributed → closed
  │                                                    │
  └─────────────────────► failed/burned ◄──────────────┘
```

### Offer Status Flow
```
pending → accepted → settled
    │         │
    │    countered ←──┐
    │         │       │
    │         └───────┘
    │
    ├──► rejected
    ├──► withdrawn
    ├──► expired
    └──► auto_rejected (pool conversion)
```
