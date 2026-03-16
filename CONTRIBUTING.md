# Contributing to LuxHub

Thank you for your interest in contributing to LuxHub! This guide will help you get set up and contributing quickly.

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Workflow](#branch-workflow)
- [Coding Standards](#coding-standards)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Key Documentation](#key-documentation)
- [Compliance Rules](#compliance-rules)

---

## Development Setup

### Prerequisites

- **Node.js** 20.x or later
- **npm** 10.x or later
- **MongoDB** (local or [Atlas](https://www.mongodb.com/atlas))
- **Solana CLI** + **Anchor CLI** (for smart contract work)
- A Solana wallet ([Phantom](https://phantom.app) or [Solflare](https://solflare.com))

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/yoandryx/LuxHub.git
cd LuxHub

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in your values — see .env.example for documentation on each variable

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Minimum Required Environment Variables

| Variable | Where to Get It |
|----------|----------------|
| `NEXT_PUBLIC_SOLANA_ENDPOINT` | Use `https://api.devnet.solana.com` for dev |
| `MONGODB_URI` | Your MongoDB connection string |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

See [`.env.example`](.env.example) for the full list with descriptions.

### Anchor Program (Smart Contract)

```bash
cd Solana-Anchor
npm install
anchor build     # Compile
anchor test      # Run tests
anchor deploy    # Deploy to configured cluster
```

---

## Branch Workflow

```
main (production — protected, auto-deploys to Vercel)
 │
 └── develop (integration branch)
      │
      ├── feature/your-feature
      ├── fix/bug-description
      └── docs/documentation-update
```

### How to Contribute

1. **Start from `develop`:**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**, commit with clear messages:
   ```bash
   git add <specific-files>
   git commit -m "feat: add pool distribution endpoint"
   ```

4. **Push your branch:**
   ```bash
   git push -u origin feature/your-feature-name
   ```

5. **Open a Pull Request** targeting `develop` (not `main`).

### Commit Message Format

We use [conventional commits](https://www.conventionalcommits.org/):

```
type(scope): description

Examples:
feat(pools): add bonding curve pricing
fix(escrow): correct timeout calculation
docs(api): update webhook documentation
refactor(vendor): extract shipping service
test(auth): add wallet signature tests
chore(deps): update Anchor to 0.31
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`

---

## Coding Standards

### Before Pushing

Always run these checks — they also run in CI on your PR:

```bash
npm run lint:fix      # ESLint auto-fix
npm run typecheck     # TypeScript type checking
npm run build         # Production build
```

### Style Guide

- **TypeScript** — strict mode, no `any` without justification
- **CSS Modules** — one `.module.css` per component, chrome glass design system
- **API routes** — method validation → Zod input → dbConnect → operation → response
- **Components** — functional components with hooks, no class components
- **Naming** — PascalCase for components, camelCase for functions/variables

### Design System

All UI follows the **chrome glass** design language:

```css
/* Glass panels */
background: rgba(10, 10, 14, 0.85);
backdrop-filter: blur(48px);
border: 1px solid rgba(200, 161, 255, 0.25);

/* Accent color */
--accent: #c8a1ff;
```

Reference: [`src/styles/LuxHubTheme.css`](src/styles/LuxHubTheme.css)

---

## Project Structure

```
src/
  pages/              # Next.js pages and API routes
    api/              # Backend API endpoints
      bags/           # Bags API integration
      pool/           # Pool management
      escrow/         # Escrow operations
      squads/         # Squads multisig
      admin/          # Admin operations
      vendor/         # Vendor management
      ai/             # AI analysis
      webhooks/       # Bags + Helius events
  components/         # React components
    common/           # Shared (Navbar, cards, wallet)
    marketplace/      # Marketplace-specific
    vendor/           # Vendor dashboard
    admin/            # Admin tools
  lib/
    models/           # Mongoose models (18 total)
    middleware/       # Auth, rate limiting
    services/         # Business logic (Bags, Squads, DAS)
    security/         # Encryption, wallet auth
  utils/              # Helper utilities
  styles/             # CSS Modules (1:1 with components)
  hooks/              # Custom React hooks
  context/            # React Context providers
  idl/                # Anchor IDL JSON files
```

---

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier check only |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:anchor` | Run Anchor/Rust tests |
| `npm run env:check` | Validate environment variables |
| `npm run lint:compliance` | Check for securities language violations |
| `npm run analyze` | Bundle size analysis |

---

## Key Documentation

Read these to understand the project:

| Document | Description |
|----------|-------------|
| [`CLAUDE.md`](CLAUDE.md) | Complete project reference |
| [`.claude/docs/bags_tokenomics_flow.md`](.claude/docs/bags_tokenomics_flow.md) | Tokenomics model and pool lifecycle |
| [`.claude/docs/luxhub_workflow.md`](.claude/docs/luxhub_workflow.md) | Marketplace workflow diagrams |
| [`.claude/docs/security.md`](.claude/docs/security.md) | Security implementation details |
| [`.claude/docs/architectural_patterns.md`](.claude/docs/architectural_patterns.md) | Code patterns and conventions |

---

## Compliance Rules

LuxHub must avoid securities-related language in all user-facing UI:

| Do NOT Use | Use Instead |
|-----------|-------------|
| "fractional ownership" | "tokenized pools" |
| "shares" | "tokens" or "participation" |
| "invest" / "investment" | "contribute" / "participation" |
| "ROI" / "profit" / "returns" | "proceeds" / "distributions" |
| "dividend" | "distribution" |

This is enforced by `npm run lint:compliance` and checked in pre-commit hooks.

---

## Areas Not to Touch Without Coordination

- `main` branch directly (always use PRs)
- `Solana-Anchor/` smart contracts (coordinate with core team)
- Vercel deployment configs
- Admin dashboard security logic
- Squads multisig integration

---

## Questions?

- Check the documentation in `.claude/docs/` first
- Open a [GitHub Discussion](https://github.com/yoandryx/LuxHub/discussions) or Issue
- Reach out to the team at **yoandry@luxhub.gold**
