# LuxHub

**Version:** 0.2.0 (MVP Prep Phase)
**Status:** Transitioning from prototype to production MVP

## Project Overview

Decentralized luxury asset marketplace on Solana. NFT-backed physical assets (watches, jewelry, collectibles, art) with verified provenance, on-chain escrow, vendor verification, fractional ownership pools, 3% royalty to treasury, and analytics dashboards.

## Tech Stack

**Frontend:**
- Next.js 14 (pages router) + React 18 + TypeScript
- CSS Modules for component-scoped styling
- Framer Motion for animations
- React Three Fiber + Three.js for 3D visualization
- Radix UI components

**Blockchain:**
- Solana + Anchor framework + mpl-core
- @solana/wallet-adapter-react (Phantom, Solflare, Mobile)
- Helius RPC (via NEXT_PUBLIC_SOLANA_ENDPOINT)
- Squads Protocol multisig (planned for treasury/pool vaults)
- Backpack Bags API (wallet linking, sessions)

**Backend:**
- MongoDB + Mongoose ODM
- Pinata/IPFS for asset storage
- JWT authentication (jsonwebtoken + bcryptjs)
- Zod for runtime validation

**Deployment:**
- Vercel

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/pages/` | Next.js pages (20 pages) and API routes (51 endpoints) |
| `src/components/` | React components organized by feature (admins, common, marketplace, user, vendor) |
| `src/lib/models/` | Mongoose models (18 total: User, Vendor, Asset, NFT, Transaction, Escrow, Pool, etc.) |
| `src/lib/database/` | MongoDB connection utility |
| `src/lib/middleware/` | Auth middleware for protected routes |
| `src/utils/` | Helpers: programUtils.ts (Anchor), pinataUtils.ts, formatUtils.ts |
| `src/styles/` | CSS Modules (29 files, 1:1 with components) |
| `src/idl/` | Anchor IDL JSON files |
| `src/context/` | React Context providers (PriceDisplayProvider) |
| `Solana-Anchor/` | Anchor program source (Rust) for escrow marketplace |
| `public/` | Static assets (3D models, images, HDR files) |

## Automation Agents

LuxHub uses a 6-agent automation system for development workflows:

### Agent 1: Git Guardian
Version control, commits, PRs, release tagging, secret detection.
```bash
# Stage, lint, and commit with semantic message
git add . && npm run lint:fix && git commit -m "type: description"

# Create PR (requires gh CLI)
gh pr create --title "title" --body "description"

# Tag release
git tag -a v1.x.x -m "Release notes" && git push origin v1.x.x
```

### Agent 2: Build & Deploy
Build validation and deployment pipeline.
```bash
npm run build           # Build Next.js frontend
npm run build:all       # Build frontend + Anchor contracts
npm run typecheck       # TypeScript type checking
```

### Agent 3: Test Runner
Run frontend and smart contract tests.
```bash
npm test                # Run Jest tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
npm run test:anchor     # Run Anchor/Rust tests
```

### Agent 4: Smart Contract Security
Audit Anchor/Rust code for vulnerabilities.
```bash
cargo clippy            # Rust linter (from Solana-Anchor/)
cargo audit             # Security vulnerability scan
anchor build            # Compile and verify
```

### Agent 5: Code Quality
Linting, formatting, and code standards.
```bash
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
npm run format          # Prettier format
npm run format:check    # Prettier check only
```

### Agent 6: Environment Validator
Verify environment configuration.
```bash
npm run env:check       # Validate all env vars
```

### Automatic Hooks
- **Pre-commit**: Runs lint-staged (ESLint + Prettier) on staged files
- **CI Pipeline**: Runs on PR/push to main (lint, typecheck, build, test)
- **Security Scan**: Weekly cargo/npm audit via GitHub Actions

## Essential Commands

**Development:**
```bash
npm run dev          # Start dev server (binds 0.0.0.0)
npm run build        # Production build
npm start            # Start production server
```

**Anchor Program (from Solana-Anchor/):**
```bash
anchor build         # Compile Rust programs
anchor test          # Run ts-mocha tests
anchor deploy        # Deploy to configured cluster
```

**Environment Variables:**
- `NEXT_PUBLIC_SOLANA_ENDPOINT` - Helius/Alchemy RPC URL
- `PROGRAM_ID` - Deployed Anchor program ID
- `MONGODB_URI` - MongoDB connection string
- `NEXT_PUBLIC_PINATA_API_KEY`, `NEXT_PUBLIC_PINATA_SECRET_KEY` - Pinata credentials
- `JWT_SECRET` - JWT signing secret
- `NEXT_PUBLIC_LUXHUB_WALLET` - Treasury wallet address

## Key Entry Points

- App wrapper with wallet providers: `src/pages/_app.tsx:1-99`
- Anchor program access: `src/utils/programUtils.ts`
- Database connection: `src/lib/database/mongodb.ts`
- Auth middleware: `src/lib/middleware/auth.ts`
- Main escrow program: `Solana-Anchor/programs/luxhub-marketplace/src/lib.rs:21-58`

## Additional Documentation

Detailed documentation is organized in `.claude/docs/`:

| Document | Description |
|----------|-------------|
| `architectural_patterns.md` | Recurring code patterns (Mongoose hooks, API routes, wallet integration, CSS modules) |
| `escrow_flow.md` | (Planned) On-chain escrow lifecycle: initialize → exchange → confirm_delivery |
| `fractional_pools.md` | (Planned) Pool creation, share calculations, distribution mechanics |
| `backpack_integration.md` | (Planned) Backpack Bags API, wallet linking, session management |
| `squads_multisig.md` | (Planned) Treasury/vendor vault multisig setup via Squads Protocol |
| `vendor_onboarding.md` | (Planned) Vendor verification flow, invite codes, profile setup |

## Program IDs

- **Marketplace Escrow:** `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj` (Devnet)

## Partnership Integrations

| Partner | Status | Integration |
|---------|--------|-------------|
| **Squads Protocol** | Active | Multisig treasury/pool vaults for institutional-grade security |
| **Backpack (Bags API)** | Planned | Wallet linking, session management, xNFT support |
| **Helius** | Active | RPC infrastructure, enhanced Solana APIs |
| **Pinata** | Active | IPFS gateway for NFT metadata and asset storage |

## Squads Protocol Integration

LuxHub uses Squads Protocol v4 for multisig security on treasury operations and escrow confirmations.

### Architecture

1. **Multisig Vault**: All treasury fees (5%) are collected into a Squads vault PDA
2. **Proposal Flow**: Admin actions (confirm_delivery, initialize escrow) create Squads proposals
3. **Approval Threshold**: Proposals require multisig member approvals before execution
4. **On-Chain Gating**: The Anchor program's `confirm_delivery` instruction validates Squads CPI origin

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/squads/propose` | POST | Create a new Squads vault transaction proposal |
| `/api/squads/status` | GET | Check proposal status (approvals, threshold, state) |
| `/api/squads/execute` | POST | Execute an approved proposal on-chain |
| `/api/squads/proposals` | GET | List all proposals with optional status filter |
| `/api/squads/sync` | POST | Sync on-chain escrow state to MongoDB after execution |

### Escrow Lifecycle with Squads

```
1. Seller lists NFT → Sale Request created in MongoDB
2. Admin approves → Proposal created in Squads (initialize escrow)
3. Multisig members approve in Squads UI
4. Admin executes proposal → Escrow PDA created on-chain
5. Buyer purchases → Funds deposited to escrow vault
6. Admin confirms delivery → Proposal created in Squads (confirm_delivery)
7. Multisig members approve
8. Admin executes → NFT transferred to buyer, funds split (95% seller, 5% treasury)
9. Admin syncs → MongoDB updated with execution status
```

### Environment Variables

```env
NEXT_PUBLIC_SQUADS_MSIG=<multisig_pda>           # Squads multisig account address
SQUADS_MEMBER_KEYPAIR_PATH=<path_to_keypair>    # OR
SQUADS_MEMBER_KEYPAIR_JSON=<json_string>        # Member keypair for signing proposals
```

### Treasury Configuration

The `currentEscrowConfig` (set via `initialize_config`) should point to the Squads vault PDA:

```typescript
const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: 0 });
// Use vaultPda.toBase58() as the luxhubWallet in escrow config
```

## Recent Development Progress

### Latest Commits
1. **TypeScript Build Fixes** - Fixed type definitions for Vercel deployment, updated vendor API endpoints
2. **6-Agent Automation System** - Documented and implemented development workflow automation
3. **Phase 2 UI/UX Overhaul** - Major update (5,237 lines) to AdminDashboard, CreateNFT, Vendor Dashboard with glass-morphism effects
4. **Partnership Assets** - Added Solana, Helius, IPFS, Bags logos for integration showcase
5. **Privy Integration** - Added NavbarPrivy, WalletNavbarPrivy components for enhanced wallet connection

### Completed Features
- [x] NFT minting with IPFS metadata via Pinata
- [x] On-chain escrow with Anchor smart contracts
- [x] Vendor verification and onboarding flow
- [x] Admin dashboard with role-based access
- [x] Marketplace UI with 3D visualization
- [x] Price display toggle (SOL/USD)
- [x] Fractional ownership pool models
- [x] Analytics dashboard models (Global, User, Vendor)
- [x] JWT authentication with bcrypt
- [x] 6-agent automation system

### In Progress
- [x] Squads Protocol multisig integration (proposal, execute, sync, status APIs complete)
- [ ] Backpack Bags API wallet sessions
- [ ] Enhanced vendor KYC flow
- [ ] Pool distribution mechanics
- [ ] Production deployment optimizations

## Current Sprint Goals

1. **Stabilize Vercel Deployment** - Ensure all TypeScript errors resolved
2. **Complete Squads Integration** - Treasury vault with multisig approval
3. **Refine Escrow Flow** - Optimize gas costs and UX
4. **Launch Vendor Beta** - Onboard first verified luxury vendors

## Roadmap

### Phase 1: Foundation (Completed)
- Core marketplace architecture
- Escrow smart contract
- Basic vendor/buyer flows
- MongoDB data layer

### Phase 2: MVP Prep (Current)
- Partnership integrations (Squads, Bags)
- Enhanced security (multisig vaults)
- Production-ready UI/UX
- Vendor verification system

### Phase 3: Launch
- Mainnet deployment
- First vendor onboarding
- Marketing and community building
- Mobile optimization

### Phase 4: Scale
- Fractional ownership launch
- Advanced analytics
- API for third-party integrations
- International expansion

## Notes

- Cluster: Devnet (see `Solana-Anchor/Anchor.toml`)
- 3% royalty calculated in pre-save hooks: `src/lib/models/Transaction.ts:36-42`
- Pool ownership calculated automatically: `src/lib/models/Pool.ts:41-54`
- 111 commits in repository history
- 2.2GB codebase (excluding build artifacts)
