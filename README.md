# LuxHub

**Decentralized Luxury Asset Marketplace on Solana**

[![Version](https://img.shields.io/badge/version-0.3.0-purple.svg)](https://github.com/yoandryx/LuxHub)
[![Solana](https://img.shields.io/badge/Solana-Devnet-blueviolet.svg)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org)
[![Bags](https://img.shields.io/badge/Powered%20by-Bags-green.svg)](https://bags.fm)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<p align="center">
  <img src="public/images/purpleLGG.png" alt="LuxHub Logo" width="200" />
</p>

<p align="center">
  <strong>Programmable trust for luxury commerce.</strong><br/>
  NFT-backed physical assets | Fractional ownership | On-chain escrow | Secondary market trading
</p>

---

## Why LuxHub?

The $350B+ luxury resale market lacks trustless infrastructure. LuxHub bridges this gap by combining:

- **Blockchain-verified authenticity** - Every asset tokenized with immutable provenance
- **Fractional ownership** - Own luxury watches from $10, not $100,000
- **Secondary market trading** - Buy/sell pool shares via Bags DEX
- **Trustless escrow** - Funds secured until physical delivery confirmed
- **Institutional-grade security** - Multisig treasury via Squads Protocol

---

## Key Features

### Marketplace

| Feature | Description |
|---------|-------------|
| **NFT-Backed Listings** | Mint NFTs tied to physical luxury items with IPFS metadata |
| **Escrow Smart Contracts** | Custom Anchor program ensures atomic NFT + fund exchange |
| **Vendor Verification** | KYC-lite onboarding with invite codes and validation |
| **3% Royalty System** | Automatic fee routing on all transactions |

### Fractional Ownership Pools (NEW)

| Feature | Description |
|---------|-------------|
| **Pool Investment** | Convert listings to investment pools with fractional shares |
| **Bonding Curve** | Token price discovery during funding phase via Bags |
| **Secondary Trading** | Trade pool tokens on Bags DEX after graduation |
| **Distribution** | Automatic payout to token holders on asset resale |
| **$10 Minimum** | Democratized access to luxury asset investment |

### Trading Terminal (NEW)

| Feature | Description |
|---------|-------------|
| **Real-time Stats** | Live TVL, active pools, trading volume via SWR |
| **Pool Filtering** | All, Open, Funded, Active, Tradeable views |
| **Invest/Trade Tabs** | Buy shares or trade on secondary market |
| **Bags Integration** | Swap quotes, execute trades, fee routing |

---

## LuxHub x Bags Integration

LuxHub uses [Bags](https://bags.fm) for RWA (Real World Asset) tokenization:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   LUXHUB     │────▶│   BAGS API   │────▶│   SOLANA     │
│  Marketplace │     │  DEX + Token │     │  Blockchain  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
  Pool Creation      Token Minting         On-chain
  Custody Mgmt       Trading/Swaps         Settlement
  Distribution       Fee Routing           Immutable
```

### How It Works

1. **Vendor lists watch** → NFT minted with authentication data
2. **Convert to pool** → Bags creates bonding curve token
3. **Investors buy tokens** → Funds to escrow, tokens to wallets
4. **Pool fills** → Minting stops, vendor ships watch
5. **Secondary trading** → Users trade tokens on Bags DEX
6. **Watch resells** → 97% distributed to token holders

### Volume Generation

| Source | Description |
|--------|-------------|
| Token minting | Every pool creates tradeable tokens |
| Secondary trading | Investors buy/sell positions |
| Speculation | Price discovery on asset value |
| Arbitrage | Market efficiency corrections |

**Every trade = 3% fee to LuxHub via Bags Fee Share**

---

## Tech Stack

### Frontend
```
Next.js 14 | React 18 | TypeScript | CSS Modules | Framer Motion | SWR
```

### Blockchain
```
Solana | Anchor Framework | SPL Token | mpl-core | Helius RPC | Bags API
```

### Backend
```
MongoDB | Mongoose ODM | JWT Auth | Zod Validation | Pinata/IPFS
```

### Integrations
```
Squads Protocol (Multisig) | Bags (Tokenization + DEX) | Phantom/Solflare Wallets
```

---

## Architecture

```
LuxHub/
├── src/
│   ├── pages/              # 20+ Next.js pages + 55+ API endpoints
│   │   ├── api/
│   │   │   ├── bags/       # Bags API integration (NEW)
│   │   │   ├── pool/       # Pool management
│   │   │   ├── stats/      # Platform statistics (NEW)
│   │   │   └── webhooks/   # Bags webhook handler (NEW)
│   │   └── pools.tsx       # Trading terminal (NEW)
│   ├── components/
│   │   ├── marketplace/
│   │   │   ├── BagsPoolTrading.tsx   # Secondary trading (NEW)
│   │   │   ├── PoolList.tsx          # Pool grid with filters
│   │   │   └── PoolDetail.tsx        # Invest/Trade modal
│   │   └── admin/
│   │       └── BagsPartnerDashboard.tsx  # Fee earnings (NEW)
│   ├── hooks/
│   │   └── usePools.ts     # SWR hooks for real-time data (NEW)
│   ├── lib/models/         # 18 Mongoose schemas
│   └── styles/             # CSS Modules (glass-morphism design)
├── Solana-Anchor/          # Rust smart contracts
└── public/                 # Static assets, 3D models
```

---

## Pool Lifecycle

```
OPEN → FILLED → FUNDED → CUSTODY → ACTIVE → LISTED → SOLD → DISTRIBUTED
  │       │        │         │        │        │       │         │
  │       │        │         │        │        │       │         └─ Tokens burned
  │       │        │         │        │        │       └─ Watch sells
  │       │        │         │        │        └─ Listed for resale
  │       │        │         │        └─ Trading enabled
  │       │        │         └─ LuxHub receives watch
  │       │        └─ Vendor paid 97%
  │       └─ Target reached
  └─ Accepting investments
```

---

## API Endpoints

### Bags Integration

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/bags/create-pool-token` | POST | Mint pool share tokens |
| `/api/bags/configure-fee-share` | POST | Set up 3% fee routing |
| `/api/bags/trade-quote` | GET | Get swap price quote |
| `/api/bags/execute-trade` | POST | Execute token swap |
| `/api/bags/partner-stats` | GET | Fetch fee earnings |
| `/api/webhooks/bags` | POST | Handle Bags events |

### Platform Stats

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stats/platform` | GET | Real-time TVL, pools, volume |

### Pool Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/pool/list` | GET | List all pools with filters |
| `/api/pool/[id]` | GET | Get pool details |
| `/api/pool/invest` | POST | Buy pool shares |
| `/api/pool/convert-from-escrow` | POST | Convert listing to pool |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/yoandryx/LuxHub.git
cd LuxHub && npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck
```

### Environment Variables

```env
# Required
NEXT_PUBLIC_SOLANA_ENDPOINT=   # Helius RPC URL
PROGRAM_ID=                     # Deployed Anchor program ID
MONGODB_URI=                    # MongoDB connection string
JWT_SECRET=                     # JWT signing secret
NEXT_PUBLIC_LUXHUB_WALLET=     # Treasury wallet address

# Bags Integration (NEW)
BAGS_API_KEY=                   # Bags API key
BAGS_WEBHOOK_SECRET=            # Webhook signature verification
BAGS_PARTNER_WALLET=            # Fee collection wallet

# Storage
PINATA_API_KEY=                 # Pinata credentials
PINATA_API_SECRET_KEY=
```

---

## Smart Contract

**Program ID (Devnet):** `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj`

### Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize_config` | Set up Squads multisig configuration |
| `initialize` | Create escrow PDA, lock NFT |
| `exchange` | Buyer deposits SOL to escrow vault |
| `confirm_delivery` | Finalize transaction, release funds |

---

## Development Automation

LuxHub uses a **6-agent automation system**:

| Agent | Purpose | Commands |
|-------|---------|----------|
| Git Guardian | Version control | `git commit`, `gh pr create` |
| Build & Deploy | Validation | `npm run build`, `npm run typecheck` |
| Test Runner | Testing | `npm test`, `npm run test:anchor` |
| Smart Contract Security | Rust auditing | `cargo clippy`, `cargo audit` |
| Code Quality | Linting | `npm run lint`, `npm run format` |
| Environment Validator | Config check | `npm run env:check` |

---

## Roadmap

### Phase 1: Foundation ✅
- [x] Core marketplace architecture
- [x] Escrow smart contract
- [x] Vendor/buyer flows
- [x] MongoDB data layer

### Phase 2: MVP Prep ✅
- [x] 6-agent automation system
- [x] Phase 2 UI/UX overhaul
- [x] Bags API integration
- [x] Pool trading terminal
- [x] Real-time stats with SWR
- [x] Secondary market trading component
- [ ] Squads Protocol multisig (in progress)

### Phase 3: Launch
- [ ] Mainnet deployment
- [ ] First vendor onboarding
- [ ] Bonding curve implementation
- [ ] Community building

### Phase 4: Scale
- [ ] Fractional ownership launch
- [ ] Investor portfolio dashboard
- [ ] Third-party API
- [ ] Mobile optimization

---

## Documentation

| Document | Description |
|----------|-------------|
| [`CLAUDE.md`](CLAUDE.md) | Complete project reference for AI agents |
| [`bags_tokenomics_flow.md`](.claude/docs/bags_tokenomics_flow.md) | Full tokenomics & Bags integration guide |
| [`luxhub_workflow.md`](.claude/docs/luxhub_workflow.md) | Marketplace workflow diagrams |

---

## Use Cases

- **Luxury Watch Dealers** - Tokenize authenticated timepieces
- **Fractional Investors** - Own pieces of high-value watches
- **Crypto Traders** - Speculate on luxury asset appreciation
- **Collectibles Curators** - Verified provenance for rare items

---

## Connect

- **Twitter/X:** [@luxhubdotfun](https://x.com/luxhubdotfun)
- **GitHub:** [yoandryx/LuxHub](https://github.com/yoandryx/LuxHub)

---

## Partners

<p align="center">
  <img src="public/images/solana-logo.png" alt="Solana" height="40" />
  &nbsp;&nbsp;&nbsp;
  <img src="public/images/bags-logo.svg" alt="Bags" height="40" />
  &nbsp;&nbsp;&nbsp;
  <img src="public/images/helius-logo.png" alt="Helius" height="40" />
</p>

---

<p align="center">
  <strong>LuxHub is redefining luxury commerce with programmable trust and fractional ownership.</strong>
</p>
