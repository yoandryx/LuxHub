# Contributing to LuxHub

Welcome to LuxHub! This guide will help you get set up and contributing quickly.

## Your Mission: Bags API Integration

Your primary scope is integrating the Bags API for:
- **Pool tokenization** - Creating and managing fractional ownership tokens
- **Secondary trading** - Token swap flows via Bags DEX
- **Webhook handling** - Processing Bags events (trades, graduations, fees)
- **Wallet linking** - Backpack/Bags wallet sessions
- **Tokenomics** - Bonding curve, fee routing, distribution mechanics

### Key Documentation

Read these in order:
1. **`.claude/docs/bags_tokenomics_flow.md`** - Complete tokenomics model, pool lifecycle, API endpoints
2. **`.claude/docs/luxhub_workflow.md`** - Full marketplace workflow with visual diagrams
3. **`.claude/docs/security.md`** - Auth patterns, encryption, admin authorization
4. **`.claude/docs/architectural_patterns.md`** - Code patterns used throughout the project

### Key Files for Your Work

| File/Directory | Purpose |
|---------------|---------|
| `src/pages/api/webhooks/bags.ts` | Bags webhook handler |
| `src/pages/api/pool/*.ts` | Pool API endpoints (invest, graduate, distribute) |
| `src/lib/models/Pool.ts` | Pool Mongoose model with ownership calculations |
| `src/lib/models/Transaction.ts` | Transaction model with 3% royalty logic |
| `src/lib/models/PoolDistribution.ts` | Distribution model (97/3 split) |
| `src/pages/pools.tsx` | Pools page UI |
| `src/pages/api/bags/*.ts` | Bags-specific API routes |
| `src/lib/services/bagsService.ts` | Bags API service layer |

### What NOT to Touch

- `main` branch directly (always use feature branches)
- `Solana-Anchor/` directory (Rust smart contracts)
- Vercel deployment configs
- Admin dashboard security logic
- Squads multisig integration (unless coordinating)

---

## Development Setup

### Option A: Replit (Recommended for Partners)

1. **Fork the repo** on GitHub (or get collaborator access)
2. **Import into Replit**: Create a new Repl > Import from GitHub
3. **Set environment variables** in Replit's Secrets tab (see `.env.example`)
4. **Install dependencies**: `npm install`
5. **Start dev server**: `npm run dev`
6. The app will be available at your Replit URL

**Replit Notes:**
- Replit files (`.replit`, `replit.nix`) are gitignored and won't affect the repo
- Use Replit's built-in Git panel to create branches and push
- Always create a new branch before making changes

### Option B: Local Development

1. **Clone the repo:**
   ```bash
   git clone https://github.com/yoandryx/LuxHub.git
   cd LuxHub
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up environment:**
   ```bash
   cp .env.example .env.local
   # Fill in your values in .env.local
   ```
4. **Start dev server:**
   ```bash
   npm run dev
   ```
5. **Open**: http://localhost:3000

### Required Environment Variables

At minimum, you need these to run the app:

| Variable | Where to Get It |
|----------|----------------|
| `NEXT_PUBLIC_SOLANA_ENDPOINT` | Use `https://api.devnet.solana.com` for dev |
| `MONGODB_URI` | Ask the team lead for the dev database URI |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BAGS_API_KEY` | From your Bags developer dashboard |
| `BAGS_WEBHOOK_SECRET` | From Bags webhook configuration |

See `.env.example` for all available variables with descriptions.

---

## Branch Workflow

```
main (production - protected, DO NOT push directly)
 |
 +-- develop (integration branch)
      |
      +-- feature/bags-pools (your feature branches)
      +-- feature/bags-webhooks
      +-- feature/bags-trading
```

### How to Contribute

1. **Start from `develop`:**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/bags-your-feature
   ```

3. **Make your changes**, commit with clear messages:
   ```bash
   git add <specific-files>
   git commit -m "feat(bags): add pool creation via Bags API"
   ```

4. **Push your branch:**
   ```bash
   git push -u origin feature/bags-your-feature
   ```

5. **Open a Pull Request** on GitHub:
   - Target: `develop` (NOT `main`)
   - Describe what you changed and why
   - Link relevant Bags API docs if applicable

6. **Wait for review** - the team lead will review and merge to `develop`

### Commit Message Format

We use conventional commits:
```
type(scope): description

Examples:
feat(bags): add token creation endpoint
fix(pools): correct bonding curve calculation
docs(bags): update webhook event handling guide
refactor(pools): extract distribution logic to service
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run env:check` | Validate environment variables |

### Before Pushing

Always run these checks:
```bash
npm run lint:fix
npm run typecheck
npm run build
```

The CI pipeline will run these automatically on your PR, but catching issues locally saves time.

---

## Tech Stack Quick Reference

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (pages router), React 18, TypeScript |
| Styling | CSS Modules with glass-morphism design system |
| Blockchain | Solana, Anchor framework, mpl-core |
| Database | MongoDB + Mongoose ODM |
| Auth | JWT + Solana wallet signature verification |
| Storage | Irys/IPFS via Pinata |
| Validation | Zod for runtime schema validation |
| Multisig | Squads Protocol v4 |

---

## Project Structure

```
src/
  pages/          # Next.js pages and API routes
    api/          # Backend API endpoints
      bags/       # Bags API integration
      pool/       # Pool management
      escrow/     # Escrow operations
      squads/     # Squads multisig
  components/     # React components
    common/       # Shared components (Navbar, cards)
    marketplace/  # Marketplace-specific components
    vendor/       # Vendor dashboard components
  lib/
    models/       # Mongoose models (18 total)
    middleware/   # Auth middleware
    services/     # Service layer (bagsService, etc.)
    security/     # Encryption, auth utilities
  utils/          # Helper utilities
  styles/         # CSS Modules (1:1 with components)
  hooks/          # Custom React hooks
  context/        # React Context providers
  idl/            # Anchor IDL JSON files
```

---

## Bags API Integration Architecture

```
[Bags API] <--webhook--> [/api/webhooks/bags.ts]
                              |
                         [bagsService.ts]
                              |
                    [MongoDB Models: Pool, Transaction]
                              |
                    [Frontend: pools.tsx, components]
```

### API Flow for Pool Creation
1. Vendor lists watch for fractional pool
2. Admin approves -> calls Bags `/token/create-token-info`
3. Bags creates token -> webhook fires `POOL_CREATED`
4. LuxHub webhook handler updates MongoDB Pool status
5. Investors buy tokens via `/api/pool/invest` -> Bags `/trade/swap`
6. Pool reaches target -> webhook fires `TOKEN_GRADUATED`
7. LuxHub marks pool as graduated, stops bonding curve

### Fee Routing
- 3% of all trades routed to LuxHub treasury via Bags fee-share config
- Configured during pool creation with `/fee-share/create-fee-share-config-v2-transaction`
- Treasury wallet: `BAGS_PARTNER_WALLET` env variable

---

## Questions?

- Check the documentation in `.claude/docs/` first
- Reach out to the team lead for access credentials
- For Bags API questions, refer to https://bags.fm/developers
