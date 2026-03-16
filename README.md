<p align="center">
  <img src="public/images/purpleLGG.png" alt="LuxHub" width="180" />
</p>

<h1 align="center">LuxHub</h1>

<p align="center">
  <strong>Decentralized luxury asset marketplace on Solana</strong><br/>
  NFT-backed physical assets with verified provenance, on-chain escrow, and tokenized ownership pools.
</p>

<p align="center">
  <a href="https://github.com/yoandryx/LuxHub/actions/workflows/ci.yml"><img src="https://github.com/yoandryx/LuxHub/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://luxhub.gold"><img src="https://img.shields.io/badge/Live-luxhub.gold-c8a1ff?style=flat" alt="Website" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-Devnet-blueviolet?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMTcuMjggNS4zMmwtMi4yIDIuMTVINi40MWEuNjcuNjcgMCAwMC0uNDYuMTkuNjMuNjMgMCAwMDAgLjljLjEyLjEzLjI5LjE5LjQ2LjE5aDguNjdsLTIuMiAyLjE1Yy0uMjUuMjUtLjI1LjY1IDAgLjlzLjY3LjI1LjkyIDBsMyA0LjA2YS42My42MyAwIDAwLjQ2LjE5LjYzLjYzIDAgMDAuNDYtLjE5bDMuMjktMy4yMmMuMjUtLjI1LjI1LS42NSAwLS45cy0uNjctLjI1LS45MiAwbC0yLjIgMi4xNUg5LjIzYS42Ny42NyAwIDAwLS40Ni4xOS42My42MyAwIDAwMCAuOWMuMTIuMTMuMjkuMTkuNDYuMTloOC42N2wtMi4yIDIuMTVjLS4yNS4yNS0uMjUuNjUgMCAuOXMuNjcuMjUuOTIgMGwzLjI5LTMuMjJ6Ii8+PC9zdmc+" alt="Solana" /></a>
  <a href="https://github.com/yoandryx/LuxHub/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-CC--BY--NC--ND--4.0-blue" alt="License" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Anchor-0.31-purple" alt="Anchor" />
</p>

<p align="center">
  <a href="https://luxhub.gold">Website</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#getting-started">Getting Started</a> &middot;
  <a href="#security">Security</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## Why LuxHub?

The $350B+ luxury resale market lacks trustless infrastructure. Buyers can't verify authenticity, sellers face chargebacks, and fractional access doesn't exist. LuxHub solves this:

- **Blockchain-verified provenance** — every asset tokenized as an NFT with immutable authentication data
- **Trustless escrow** — funds locked on-chain until physical delivery is confirmed
- **Tokenized ownership pools** — own luxury watches starting from $1.50, not $100,000
- **Secondary market trading** — buy and sell pool tokens on Bags DEX
- **Institutional-grade security** — Squads Protocol multisig for all treasury operations
- **AI-powered onboarding** — Claude Vision auto-analyzes watch images to fill mint forms in seconds

---

## Features

### Marketplace

| Feature | Description |
|---------|-------------|
| **NFT-Backed Listings** | Physical luxury items tokenized with IPFS/Arweave metadata |
| **On-Chain Escrow** | Anchor smart contract locks NFT + funds until delivery |
| **AI Watch Analysis** | Upload a photo — Claude Vision identifies brand, model, condition, estimated price |
| **Vendor Verification** | KYC-lite onboarding with invite codes and admin approval |
| **Offers & Negotiation** | Buyers can make offers with counter-offer support |
| **Dispute Resolution** | 7-day SLA buyer disputes with admin escalation |
| **Shipping Integration** | EasyPost carrier tracking and label generation |

### Tokenized Ownership Pools

| Feature | Description |
|---------|-------------|
| **$1.50 Minimum** | Accessible entry point via 1B token supply per pool |
| **Bonding Curve** | Fair price discovery during funding phase via Bags |
| **Secondary Trading** | Trade pool tokens on Bags DEX after graduation |
| **Resale Distribution** | 97% of watch resale proceeds distributed to token holders |
| **3% Fee Routing** | Automatic split — 1% platform, 1% holders, 0.5% vendor, 0.5% rewards |

### Admin & Vendor Tools

| Feature | Description |
|---------|-------------|
| **Admin Dashboard** | 9 specialized tabs — mint requests, custody, disputes, Squads proposals |
| **Vendor Dashboard** | Inventory management, order fulfillment, earnings tracking |
| **Squads Multisig** | Create, approve, and execute treasury proposals on-chain |
| **Escrow Timeouts** | Auto-cancel if vendor doesn't ship within 14 days |

### 3D Visualization

| Feature | Description |
|---------|-------------|
| **Interactive 3D Scene** | React Three Fiber hero with gyroscope support |
| **Holographic NFT Cards** | 3D flip animation with sparkle particles and shine effects |
| **Mobile Optimized** | Vanilla Tilt for device rotation on mobile |

---

## Architecture

```
LuxHub/
├── src/
│   ├── pages/                    # 31 pages + 177 API endpoints
│   │   ├── api/
│   │   │   ├── bags/             # Bags tokenization (5 endpoints)
│   │   │   ├── pool/             # Pool management (20 endpoints)
│   │   │   ├── escrow/           # Escrow lifecycle (15 endpoints)
│   │   │   ├── admin/            # Admin operations (12 endpoints)
│   │   │   ├── vendor/           # Vendor management (8 endpoints)
│   │   │   ├── squads/           # Squads multisig (5 endpoints)
│   │   │   ├── ai/              # AI analysis (2 endpoints)
│   │   │   └── webhooks/         # Bags + Helius events
│   │   ├── marketplace.tsx       # NFT marketplace grid
│   │   ├── pools.tsx             # Trading terminal
│   │   ├── createNFT.tsx         # Mint form with AI + bulk upload
│   │   └── adminDashboard.tsx    # 9-tab admin panel
│   ├── components/               # 70 React components
│   │   ├── marketplace/          # NFT cards, pool UI, 3D scene
│   │   ├── admin/                # Dashboard tabs, custody mgmt
│   │   ├── vendor/               # Vendor tools, onboarding
│   │   └── common/               # Navbar, cards, wallet UI
│   ├── lib/
│   │   ├── models/               # 18 Mongoose schemas
│   │   ├── services/             # Bags, Squads, DAS, TX verification
│   │   ├── middleware/           # Auth, rate limiting, validation
│   │   └── security/            # AES-256-GCM encryption, wallet auth
│   ├── hooks/                    # usePools, useSWR hooks
│   └── styles/                   # 29+ CSS Modules (chrome glass design)
├── Solana-Anchor/                # Rust smart contracts
│   └── programs/luxhub-marketplace/
│       └── src/
│           ├── instructions/     # 16 on-chain instructions
│           ├── state/            # Escrow, config PDAs
│           └── errors/           # Custom error types
└── public/                       # 3D models, partner logos, assets
```

---

## Tech Stack

<table>
<tr>
<td><strong>Frontend</strong></td>
<td>Next.js 16 &middot; React 19 &middot; TypeScript 5.8 &middot; CSS Modules &middot; Framer Motion &middot; React Three Fiber &middot; SWR &middot; Radix UI</td>
</tr>
<tr>
<td><strong>Blockchain</strong></td>
<td>Solana &middot; Anchor 0.31 &middot; SPL Token &middot; mpl-core &middot; Helius RPC &middot; Helius DAS API</td>
</tr>
<tr>
<td><strong>Backend</strong></td>
<td>MongoDB &middot; Mongoose &middot; JWT + Wallet Signature Auth &middot; Zod Validation &middot; AES-256-GCM Encryption</td>
</tr>
<tr>
<td><strong>Storage</strong></td>
<td>Pinata/IPFS &middot; Irys (Arweave-backed permanent storage)</td>
</tr>
<tr>
<td><strong>Integrations</strong></td>
<td>Squads Protocol v4 (multisig) &middot; Bags API (tokenization + DEX) &middot; Anthropic Claude (AI analysis) &middot; EasyPost (shipping) &middot; Sentry (monitoring)</td>
</tr>
<tr>
<td><strong>Wallets</strong></td>
<td>Phantom &middot; Solflare &middot; Privy &middot; Mobile Wallet Adapter</td>
</tr>
<tr>
<td><strong>Deployment</strong></td>
<td>Vercel &middot; MongoDB Atlas &middot; Helius RPC</td>
</tr>
</table>

---

## Smart Contract

**Program ID (Devnet):** `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj`

The Anchor program manages atomic escrow for NFT-backed luxury asset sales:

| Instruction | Description |
|-------------|-------------|
| `initialize_config` | Configure Squads multisig as treasury authority |
| `initialize` | Create escrow PDA, lock NFT in vault |
| `exchange` | Buyer deposits SOL to escrow |
| `confirm_delivery` | Release NFT to buyer, split funds (95% seller / 5% treasury) |
| `refund_buyer` | Refund on dispute or timeout |
| `cancel_escrow` | Cancel sale, return NFT + funds |
| `mint_nft` | Admin-gated NFT creation |
| `freeze_nft` / `burn_nft` | Lock or destroy fraudulent assets |
| `update_price` | Change listing price |
| `admin_transfer` | Squads-gated fund movement |

---

## Pool Lifecycle

```
OPEN → FILLED → FUNDED → CUSTODY → ACTIVE → LISTED → SOLD → DISTRIBUTED
  │       │        │         │        │        │       │         │
  │       │        │         │        │        │       │         └─ Proceeds to holders
  │       │        │         │        │        │       └─ Watch sells on market
  │       │        │         │        │        └─ Listed for resale
  │       │        │         │        └─ Tokens tradeable on Bags DEX
  │       │        │         └─ LuxHub receives physical watch
  │       │        └─ Vendor paid 97%
  │       └─ Funding target reached
  └─ Accepting contributions
```

---

## Getting Started

### Prerequisites

- **Node.js** 20.x or later
- **MongoDB** (local or Atlas)
- **Solana CLI** + **Anchor CLI** (for smart contract development)
- A Solana wallet (Phantom or Solflare)

### Installation

```bash
# Clone the repository
git clone https://github.com/yoandryx/LuxHub.git
cd LuxHub

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your values — see .env.example for documentation

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Anchor Program

```bash
cd Solana-Anchor
anchor build         # Compile Rust programs
anchor test          # Run tests
anchor deploy        # Deploy to configured cluster
```

### Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm test` | Run Jest tests |
| `npm run test:coverage` | Tests with coverage report |
| `npm run test:anchor` | Run Anchor/Rust tests |
| `npm run env:check` | Validate environment variables |
| `npm run analyze` | Bundle size analysis |

---

## Security

LuxHub implements defense-in-depth across on-chain and off-chain layers:

| Layer | Protection |
|-------|-----------|
| **On-chain escrow** | Funds held in program-owned PDA — not LuxHub wallets |
| **Squads multisig** | All treasury operations require M-of-N approval |
| **TX verification** | Every fund movement verified on Solana before database update |
| **Wallet signature auth** | Ed25519 verification on protected API endpoints |
| **PII encryption** | AES-256-GCM for sensitive data (shipping addresses) |
| **Escrow timeouts** | Auto-cancel after 14 days if vendor doesn't ship |
| **Dispute system** | 7-day SLA with admin escalation and refund authority |
| **Rate limiting** | Strict limits on purchase and AI endpoints |
| **Admin gating** | `ADMIN_WALLETS` env var restricts sensitive operations |

See [SECURITY.md](SECURITY.md) for our vulnerability disclosure policy.

---

## Roadmap

### Phase 1: Foundation ✅
- [x] Core marketplace with escrow smart contract
- [x] Vendor verification and buyer flows
- [x] MongoDB data layer with 18 models
- [x] JWT authentication

### Phase 2: MVP Prep ✅
- [x] Squads Protocol multisig integration
- [x] Bags API tokenization + DEX trading
- [x] AI watch analysis (Claude Vision)
- [x] Helius DAS API for on-chain data
- [x] TX verification on all fund-moving endpoints
- [x] Dispute system with 7-day SLA
- [x] Chrome glass design system across all pages
- [x] Real-time platform stats (SWR)

### Phase 3: Launch (Current)
- [ ] Mainnet deployment
- [ ] First vendor onboarding
- [ ] Mobile optimization
- [ ] Community building

### Phase 4: Scale
- [ ] Advanced analytics dashboards
- [ ] API for third-party integrations
- [ ] International expansion
- [ ] Enhanced vendor KYC

---

## Data Models

LuxHub uses 18 Mongoose schemas covering the full marketplace lifecycle:

| Model | Purpose |
|-------|---------|
| `User` | Accounts, linked wallets, roles, portfolio |
| `Vendor` | Business profiles, KYC, verification status |
| `Asset` | Physical item metadata, authentication data |
| `NFT` | On-chain NFT records, mint addresses, royalties |
| `Escrow` | Direct sale escrow with dispute + shipping tracking |
| `Pool` | Tokenized ownership pools with participant tracking |
| `Transaction` | All marketplace transactions with 3% auto-royalty |
| `PoolDistribution` | Resale proceeds split among token holders |
| `Offer` | Purchase offers with counter-offer support |
| `MintRequest` | Vendor NFT mint request workflow |
| `Notification` | User notification system |
| `SavedAddress` | AES-256-GCM encrypted shipping addresses |
| `DelistRequest` | Vendor delisting request workflow |
| `AdminRole` | Admin permissions and access control |
| `GlobalAnalytics` | Platform-wide statistics |
| `UserAnalytics` | User portfolio tracking |
| `VendorAnalytics` | Vendor performance metrics |
| `TreasuryDeposit` | Treasury fund tracking |

---

## Partners

<p align="center">
  <a href="https://solana.com"><img src="public/images/solana-logo.png" alt="Solana" height="40" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://squads.xyz"><img src="public/images/Squads-logo.png" alt="Squads Protocol" height="40" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://helius.dev"><img src="public/images/helius-logo.svg" alt="Helius" height="40" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.metaplex.com"><img src="public/images/metaplex-logo.svg" alt="Metaplex" height="40" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://bags.fm"><img src="public/images/bags-logo.svg" alt="Bags" height="40" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.privy.io"><img src="public/images/Privy_Brandmark_White.png" alt="Privy" height="40" /></a>
</p>

---

## Connect

- **Website:** [luxhub.gold](https://luxhub.gold)
- **Twitter/X:** [@luxhubdotfun](https://x.com/luxhubdotfun)
- **GitHub:** [yoandryx/LuxHub](https://github.com/yoandryx/LuxHub)

---

## License

This project is licensed under [CC-BY-NC-ND-4.0](LICENSE) — you may share with attribution, but commercial use and derivatives are not permitted without explicit permission.

---

<p align="center">
  <strong>LuxHub — programmable trust for luxury commerce.</strong>
</p>
