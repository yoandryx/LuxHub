# LuxHub Technology Stack

## Primary Languages

| Language | Version | Usage |
|----------|---------|-------|
| **TypeScript** | ^5.8.2 | Frontend, API routes, utilities |
| **Rust** | Edition 2021 | Solana smart contracts (Anchor) |
| **CSS** | CSS Modules | Component-scoped styling (29 module files) |

### TypeScript Configuration
- Target: `es2022`
- Module: `esnext` with `bundler` resolution
- Strict mode enabled
- Path alias: `@/*` maps to `./src/*`
- Config: `tsconfig.json`

## Runtime Environment

- **Node.js** (version not pinned; no `.nvmrc` in project root)
- **Solana CLI/Validator**: v2.1.16 (per `Solana-Anchor/Anchor.toml`)
- **Deployment**: Vercel (serverless functions for API routes)
- **Module System**: ES Modules (`"type": "module"` in `package.json`)

## Core Frameworks

| Framework | Version | Purpose |
|-----------|---------|---------|
| **Next.js** | ^16.1.3 | Full-stack React framework (pages router) |
| **React** | ^19.2.1 | UI library |
| **React DOM** | ^19.2.1 | DOM rendering |
| **Anchor** | 0.31.0 | Solana smart contract framework (Rust + TS client) |
| **Mongoose** | ^8.12.0 | MongoDB ODM |

### Next.js Configuration
- Pages router (not App Router)
- Webpack bundler (not Turbopack)
- React Strict Mode enabled
- Custom webpack config for crypto polyfills and Solana externals
- Config file: `next.config.js`

## Frontend Dependencies

### UI & Styling
| Package | Version | Purpose |
|---------|---------|---------|
| `framer-motion` | ^12.23.25 | Animation library |
| `@radix-ui/react-select` | ^2.2.4 | Accessible select component |
| `lucide-react` | ^0.508.0 | Icon library |
| `react-icons` | ^5.5.0 | Icon library |
| `react-feather` | ^2.0.10 | Feather icons |
| `vanilla-tilt` | ^1.8.1 | 3D tilt effect for NFT cards |
| `embla-carousel-react` | ^8.6.0 | Carousel component |
| `embla-carousel-autoplay` | ^8.6.0 | Carousel autoplay plugin |

### 3D & Visualization
| Package | Version | Purpose |
|---------|---------|---------|
| `three` | ^0.174.0 | 3D rendering engine |
| `@react-three/fiber` | ^9.0.4 | React renderer for Three.js |
| `@react-three/drei` | ^10.0.7 | Three.js helpers/abstractions |
| `@react-three/postprocessing` | ^3.0.4 | Post-processing effects |
| `babel-plugin-glsl` | ^1.0.0 | GLSL shader imports |

### Charts & Data Visualization
| Package | Version | Purpose |
|---------|---------|---------|
| `chart.js` | ^4.4.8 | Charting library |
| `react-chartjs-2` | ^5.3.0 | React wrapper for Chart.js |
| `lightweight-charts` | ^5.1.0 | Financial/trading charts |

### State Management & Data Fetching
| Package | Version | Purpose |
|---------|---------|---------|
| `swr` | ^2.3.8 | React data fetching/caching |
| `axios` | ^1.8.1 | HTTP client |

### Notifications
| Package | Version | Purpose |
|---------|---------|---------|
| `react-hot-toast` | ^2.6.0 | Toast notifications (primary) |
| `react-toastify` | ^11.0.5 | Toast notifications (legacy) |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `react-dropzone` | ^14.3.8 | File upload drag-and-drop |
| `react-intersection-observer` | ^9.16.0 | Intersection observer hook |
| `react-error-boundary` | ^5.0.0 | Error boundary component |
| `papaparse` | ^5.5.3 | CSV parsing |
| `csv-parser` | ^3.2.0 | CSV stream parsing |
| `jszip` | ^3.10.1 | ZIP file creation |
| `p-limit` | ^7.2.0 | Concurrency limiter |

## Blockchain Dependencies

### Solana Core
| Package | Version | Purpose |
|---------|---------|---------|
| `@solana/web3.js` | ^1.98.0 | Solana JavaScript SDK |
| `@solana/spl-token` | ^0.4.13 | SPL Token program client |
| `@solana/wallet-adapter-react` | ^0.15.39 | Wallet connection (React) |
| `@solana/wallet-adapter-react-ui` | ^0.9.39 | Wallet UI components |
| `@solana/wallet-adapter-wallets` | ^0.19.37 | Wallet adapters (Phantom, Solflare) |
| `@solana/kit` | ^5.1.0 | Solana utilities |
| `@solana-program/memo` | ^0.10.0 | Memo program client |
| `@solana-program/system` | ^0.10.0 | System program client |
| `@solana-program/token` | ^0.9.0 | Token program client |
| `@coral-xyz/anchor` | ^0.31.0 | Anchor framework (TS client) |

### Metaplex (NFT)
| Package | Version | Purpose |
|---------|---------|---------|
| `@metaplex-foundation/js` | ^0.20.1 | Metaplex JS SDK |
| `@metaplex-foundation/mpl-core` | ^1.7.0 | MPL Core (NFT standard) |
| `@metaplex-foundation/umi-bundle-defaults` | ^1.4.1 | Umi framework defaults |
| `@metaplex-foundation/umi-signer-wallet-adapters` | ^1.4.1 | Umi wallet adapter |

### Multisig
| Package | Version | Purpose |
|---------|---------|---------|
| `@sqds/multisig` | ^2.1.4 | Squads Protocol multisig |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `bs58` | ^6.0.0 | Base58 encoding/decoding |
| `crypto-browserify` | ^3.12.1 | Crypto polyfill for browser |

## Backend Dependencies

### Authentication & Security
| Package | Version | Purpose |
|---------|---------|---------|
| `jsonwebtoken` | ^9.0.2 | JWT token generation/verification |
| `bcryptjs` | ^3.0.2 | Password hashing |
| `zod` | ^3.25.76 | Runtime schema validation |

### Storage
| Package | Version | Purpose |
|---------|---------|---------|
| `pinata` | ^2.0.1 | Pinata IPFS SDK |
| `@irys/sdk` | ^0.2.11 | Irys (Arweave) permanent storage |
| `arweave` | ^1.15.7 | Arweave direct uploads |
| `ibm-cos-sdk` | ^1.14.1 | IBM Cloud Object Storage |
| `aws-sdk` | ^2.1693.0 | AWS SDK (S3-compatible storage) |
| `multer` | ^2.0.0 | Multipart file upload handling |

### External Services
| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.71.2 | Anthropic Claude AI (watch analysis) |
| `openai` | ^4.100.0 | OpenAI SDK (installed, not actively used) |
| `stripe` | ^17.7.0 | Stripe payments (optional fiat) |
| `@easypost/api` | ^8.4.0 | EasyPost shipping labels |
| `@privy-io/react-auth` | ^3.10.0 | Privy authentication (email + wallet) |

### Vercel
| Package | Version | Purpose |
|---------|---------|---------|
| `@vercel/edge-config` | ^1.4.0 | Vercel Edge Config |
| `next-connect` | ^1.0.0 | API route middleware chaining |

## Rust/Anchor Dependencies

Defined in `Solana-Anchor/programs/luxhub-marketplace/Cargo.toml`:

| Crate | Version | Purpose |
|-------|---------|---------|
| `anchor-lang` | 0.31.0 | Anchor framework core (with `init-if-needed` feature) |
| `anchor-spl` | 0.31.0 | Anchor SPL token integration |

Program ID: `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj` (Devnet)

## Build Tools & Configuration

### Build Pipeline
| Tool | Config File | Purpose |
|------|-------------|---------|
| **Next.js** | `next.config.js` | Frontend build + API routes |
| **TypeScript** | `tsconfig.json` | Type checking |
| **Anchor** | `Solana-Anchor/Anchor.toml` | Smart contract build |
| **Cargo** | `Solana-Anchor/Cargo.toml` | Rust workspace |

### Code Quality
| Tool | Config File | Purpose |
|------|-------------|---------|
| **ESLint** | `eslint.config.js` | Linting (flat config format) |
| **Prettier** | (inline in lint-staged) | Code formatting |
| **Husky** | `.husky/` | Git hooks |
| **lint-staged** | `package.json` (lint-staged key) | Pre-commit formatting |

### ESLint Plugins
- `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `@next/eslint-plugin-next` (via `eslint-config-next`)

### Testing
| Tool | Config File | Purpose |
|------|-------------|---------|
| **Jest** | `jest.config.cjs` | Test runner (jsdom environment) |
| **ts-jest** | (within jest config) | TypeScript transform |
| **@testing-library/react** | - | React component testing |
| **@testing-library/jest-dom** | - | DOM assertion matchers |
| **identity-obj-proxy** | - | CSS module mocking |
| **ts-mocha** | `Solana-Anchor/Anchor.toml` (scripts.test) | Anchor program tests |

### Coverage Thresholds (Jest)
- Branches: 50%
- Functions: 50%
- Lines: 50%
- Statements: 50%

## Dev Dependencies Summary

| Package | Version | Purpose |
|---------|---------|---------|
| `@eslint/js` | ^9.39.2 | ESLint core configs |
| `@testing-library/jest-dom` | ^6.9.1 | DOM test matchers |
| `@testing-library/react` | ^16.3.1 | React testing utilities |
| `@types/jest` | ^30.0.0 | Jest type definitions |
| `@types/jsonwebtoken` | ^9.0.9 | JWT type definitions |
| `@types/multer` | ^1.4.12 | Multer type definitions |
| `@types/node` | 22.13.9 | Node.js type definitions |
| `@types/react` | ^19.0.10 | React type definitions |
| `@types/react-dom` | ^19.0.4 | React DOM type definitions |
| `eslint` | ^9.39.2 | Linter |
| `eslint-config-next` | ^16.1.3 | Next.js ESLint config |
| `husky` | ^9.1.7 | Git hooks |
| `identity-obj-proxy` | ^3.0.0 | CSS module mock for tests |
| `jest-environment-jsdom` | ^29.7.0 | Jest DOM environment |
| `lint-staged` | ^16.2.7 | Pre-commit lint runner |
| `prettier` | ^3.8.0 | Code formatter |
| `ts-jest` | ^29.4.6 | TypeScript Jest transform |

## Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, lint-staged config |
| `tsconfig.json` | TypeScript compiler options |
| `next.config.js` | Next.js webpack, env, images config |
| `eslint.config.js` | ESLint flat config with TS/React/Next plugins |
| `jest.config.cjs` | Jest test configuration |
| `.env.example` | Environment variable template |
| `Solana-Anchor/Anchor.toml` | Anchor framework config |
| `Solana-Anchor/Cargo.toml` | Rust workspace config |
| `Solana-Anchor/programs/luxhub-marketplace/Cargo.toml` | Program crate config |
