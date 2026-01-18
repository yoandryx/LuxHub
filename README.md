# LuxHub

**Decentralized Luxury Asset Marketplace on Solana**

[![Version](https://img.shields.io/badge/version-0.2.0-purple.svg)](https://github.com/yoandryx/LuxHub)
[![Solana](https://img.shields.io/badge/Solana-Devnet-blueviolet.svg)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<p align="center">
  <img src="public/images/purpleLGG.png" alt="LuxHub Logo" width="200" />
</p>

<p align="center">
  <strong>Programmable trust for luxury commerce.</strong><br/>
  NFT-backed physical assets | On-chain escrow | Verified provenance
</p>

---

## Why LuxHub?

The $350B+ luxury resale market lacks trustless infrastructure. LuxHub bridges this gap by combining:

- **Blockchain-verified authenticity** - Every asset tokenized with immutable provenance
- **Trustless escrow** - Funds and NFTs secured until physical delivery confirmed
- **Institutional-grade security** - Multisig treasury via Squads Protocol
- **Fractional ownership** - Democratized access to high-value assets

---

## Key Features

| Feature | Description |
|---------|-------------|
| **NFT-Backed Listings** | Mint NFTs tied to physical luxury items with full metadata on IPFS |
| **Escrow Smart Contracts** | Custom Anchor program ensures atomic NFT + fund exchange |
| **Admin Dashboard** | Role-restricted management for inventory, approvals, and transfers |
| **Royalty Distribution** | Automatic 95/5 split (seller/treasury) via on-chain transfers |
| **Dynamic Metadata** | Update NFT traits post-sale (provenance, ownership history) |
| **Vendor Verification** | KYC-lite onboarding with invite codes and profile validation |
| **Fractional Pools** | Pooled investment with automatic share calculations |
| **Analytics Dashboards** | Real-time metrics for marketplace, vendors, and users |

---

## Tech Stack

### Frontend
```
Next.js 14 | React 18 | TypeScript | CSS Modules | Framer Motion | React Three Fiber
```

### Blockchain
```
Solana | Anchor Framework | SPL Token | mpl-core | Helius RPC
```

### Backend
```
MongoDB | Mongoose ODM | JWT Auth | Zod Validation | Pinata/IPFS
```

### Integrations
```
Squads Protocol (Multisig) | Backpack Bags API | Phantom/Solflare Wallets
```

---

## Architecture

```
LuxHub/
├── src/
│   ├── pages/           # 20 Next.js pages + 51 API endpoints
│   ├── components/      # Feature-organized React components
│   ├── lib/models/      # 18 Mongoose schemas
│   ├── utils/           # Anchor program utils, formatters
│   └── styles/          # CSS Modules (glass-morphism design)
├── Solana-Anchor/       # Rust smart contracts
│   └── programs/luxhub-marketplace/
└── public/              # Static assets, 3D models
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
| `confirm_delivery` | Finalize transaction, release funds with royalty split |

### Security
- Escrow PDAs with dynamic seeds for unique tracking
- ATA vaults for NFT and fund isolation
- Admin-only confirmation for sensitive transfers
- No finalization unless vault balances match

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

# Deploy smart contracts (from Solana-Anchor/)
cd Solana-Anchor
anchor build && anchor deploy
```

### Environment Variables

```env
NEXT_PUBLIC_SOLANA_ENDPOINT=   # Helius RPC URL
PROGRAM_ID=                     # Deployed Anchor program ID
MONGODB_URI=                    # MongoDB connection string
NEXT_PUBLIC_PINATA_API_KEY=    # Pinata credentials
JWT_SECRET=                     # JWT signing secret
NEXT_PUBLIC_LUXHUB_WALLET=     # Treasury wallet address
```

---

## Development Automation

LuxHub uses a **6-agent automation system** for development workflows:

| Agent | Purpose | Commands |
|-------|---------|----------|
| Git Guardian | Version control, PRs, releases | `git commit`, `gh pr create` |
| Build & Deploy | Build validation, deployment | `npm run build`, `npm run typecheck` |
| Test Runner | Frontend + smart contract tests | `npm test`, `npm run test:anchor` |
| Smart Contract Security | Rust auditing, vulnerability scanning | `cargo clippy`, `cargo audit` |
| Code Quality | Linting, formatting | `npm run lint`, `npm run format` |
| Environment Validator | Config verification | `npm run env:check` |

**Automatic Hooks:**
- Pre-commit: lint-staged (ESLint + Prettier)
- CI Pipeline: GitHub Actions on PR/push
- Security: Weekly cargo/npm audit

---

## Roadmap

### Phase 1: Foundation
- [x] Core marketplace architecture
- [x] Escrow smart contract
- [x] Vendor/buyer flows
- [x] MongoDB data layer

### Phase 2: MVP Prep (Current)
- [x] 6-agent automation system
- [x] Phase 2 UI/UX overhaul
- [ ] Squads Protocol multisig integration
- [ ] Backpack Bags API wallet sessions
- [ ] Enhanced vendor KYC

### Phase 3: Launch
- [ ] Mainnet deployment
- [ ] First vendor onboarding
- [ ] Community building

### Phase 4: Scale
- [ ] Fractional ownership launch
- [ ] Third-party API
- [ ] International expansion

---

## Use Cases

- **Luxury Watch Dealers** - Tokenize authenticated timepieces
- **Collectibles Curators** - Verified provenance for rare items
- **Web3 Authentication Startups** - Decentralized trust infrastructure
- **High-End P2P Markets** - Trustless luxury transactions

---

## Connect

- **Twitter/X:** [@luxhubdotfun](https://x.com/luxhubdotfun)
- **GitHub:** [yoandryx/LuxHub](https://github.com/yoandryx/LuxHub)

---

<p align="center">
  <strong>LuxHub is redefining luxury commerce with programmable trust.</strong>
</p>
