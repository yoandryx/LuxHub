# LuxHub

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

## Notes

- Cluster: Devnet (see `Solana-Anchor/Anchor.toml`)
- 3% royalty calculated in pre-save hooks: `src/lib/models/Transaction.ts:36-42`
- Pool ownership calculated automatically: `src/lib/models/Pool.ts:41-54`
