# Architecture Research

**Domain:** Solana RWA Marketplace (devnet-to-mainnet hardening)
**Researched:** 2026-03-18
**Confidence:** HIGH (based on codebase analysis + official Solana/Vercel docs)

## Current Architecture Overview

LuxHub is a Next.js 14 monolith on Vercel with an Anchor smart contract on Solana. The architecture is sound for launch scale but has specific hardening gaps for mainnet.

```
┌──────────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Pages    │  │ Components│  │ Hooks    │  │ Wallet Adapter│   │
│  │ (Router) │  │ (UI)      │  │ (State)  │  │ (Solana Sign) │   │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬────────┘   │
│       │               │             │               │            │
├───────┴───────────────┴─────────────┴───────────────┴────────────┤
│                     API LAYER (Vercel Serverless)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  │ Auth MW  │  │ Validate │  │ Rate     │  │ Services     │     │
│  │ (JWT/Sig)│  │ (Zod)    │  │ Limit    │  │ (Notify/DAS) │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘     │
│       │              │             │               │             │
├───────┴──────────────┴─────────────┴───────────────┴─────────────┤
│                     DATA LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐        │
│  │ MongoDB      │  │ Solana Chain │  │ External APIs   │        │
│  │ (Mongoose)   │  │ (Anchor PDAs)│  │ (Helius/Bags/   │        │
│  │ 29 models    │  │ Escrow/NFT   │  │  Irys/EasyPost) │        │
│  └──────────────┘  └──────────────┘  └─────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Current State |
|-----------|----------------|---------------|
| Next.js Pages (20+) | Route handling, SSR/CSR rendering | Working, pages router |
| API Routes (100+) | Business logic, DB ops, chain queries | Working, serverless on Vercel |
| Anchor Program | Escrow lifecycle, NFT authority, treasury fees | Deployed on devnet only |
| MongoDB (29 models) | Off-chain state: users, vendors, listings, orders, notifications | Working, Atlas connection |
| Wallet Adapter | Phantom/Solflare/Mobile wallet connections | Working, hardcoded to devnet |
| Service Layer | Squads, Helius DAS, notifications, TX verification | Working, devnet endpoints |
| Middleware | Auth (JWT + wallet sig), Zod validation, rate limiting | Working, in-memory rate limits |

## Critical Architecture Gaps for Mainnet

### Gap 1: Hardcoded Devnet References (BLOCKING)

The codebase has 35+ hardcoded devnet references that must be parameterized before mainnet. These fall into distinct categories:

**RPC Fallbacks (13 occurrences):** Pattern `process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'` appears in `programUtils.ts`, `txVerification.ts`, `dasApi.ts`, `adminDashboard.tsx`, `NftDetailCard.tsx`, `BagsPoolTrading.tsx`, `PoolDetail.tsx`, `watchMarket.tsx`, `metadata.ts`, `irys.ts`. On mainnet, a silent fallback to devnet is catastrophic -- it would verify transactions against the wrong chain.

**Explorer/Solscan Links (10 occurrences):** Hardcoded `?cluster=devnet` in `BuyModal.tsx`, `adminDashboard.tsx`, `user/[wallet].tsx`, `BagsPoolTrading.tsx`, `pool/[id].tsx`, `TransactionHistoryTab.tsx`, `VaultInventoryTab.tsx`.

**Wallet Adapter Config (2 occurrences):** `_app.tsx` sets `WalletAdapterNetwork.Devnet` and `chain: 'devnet'` for mobile adapter.

**USDC Mint (1 occurrence):** `squadsTransferService.ts` correctly switches based on `NEXT_PUBLIC_SOLANA_CLUSTER` env var -- this is the right pattern to replicate everywhere.

### Gap 2: In-Memory Rate Limiting

`rateLimit.ts` uses a `Map<string, RateLimitRecord>` for request tracking. On Vercel serverless, each function invocation may run in a different container, so this rate limit is per-instance, not global. An attacker can bypass it by triggering new cold starts. This is acceptable for launch but not for scale.

### Gap 3: No RPC Failover

Every Solana connection in the app creates a single `Connection` with the Helius RPC endpoint. If Helius has a regional outage (even briefly), all on-chain operations fail silently or throw. There is no retry logic, no secondary RPC provider, and no circuit breaker.

### Gap 4: MongoDB Connection in Serverless

The `dbConnect()` singleton caches on `globalThis`, which works for warm Vercel instances but creates connection churn during cold starts or scale-ups. The default Mongoose pool size (5) is reasonable, but there is no `maxPoolSize` explicitly set, no connection timeout configured, and no monitoring for connection exhaustion.

## Recommended Architecture Changes

### Pattern 1: Environment-Driven Cluster Configuration

**What:** Create a single `src/lib/config/cluster.ts` module that centralizes ALL cluster-dependent values. Every file that touches Solana must import from here -- never construct a `Connection` or generate an explorer URL directly.

**Why:** Eliminates the 35+ hardcoded devnet references with one configuration source. The `squadsTransferService.ts` USDC mint switch is the right pattern -- extend it globally.

**Implementation:**

```typescript
// src/lib/config/cluster.ts
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

type Cluster = 'devnet' | 'mainnet-beta';

const CLUSTER: Cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as Cluster) || 'devnet';

export const clusterConfig = {
  cluster: CLUSTER,
  network: CLUSTER === 'mainnet-beta'
    ? WalletAdapterNetwork.Mainnet
    : WalletAdapterNetwork.Devnet,
  rpcEndpoint: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT!, // MUST be set, no fallback
  explorerUrl: (address: string, type: 'tx' | 'address' | 'token' = 'address') =>
    `https://solscan.io/${type}/${address}${CLUSTER === 'devnet' ? '?cluster=devnet' : ''}`,
  usdcMint: CLUSTER === 'mainnet-beta'
    ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  irysNetwork: CLUSTER === 'mainnet-beta' ? 'mainnet' : 'devnet',
  mobileChain: CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet',
} as const;

// Fail fast if RPC is not configured (prevents silent devnet fallback)
if (!clusterConfig.rpcEndpoint) {
  throw new Error('NEXT_PUBLIC_SOLANA_ENDPOINT must be set. No silent fallback.');
}
```

**Trade-offs:** Adds one module to import chain. Worth it to eliminate an entire class of mainnet bugs.

### Pattern 2: RPC Connection Factory with Retry

**What:** Replace direct `new Connection(endpoint)` calls with a factory that adds retry logic and optional failover.

**Implementation:**

```typescript
// src/lib/solana/connection.ts
import { Connection, ConnectionConfig } from '@solana/web3.js';
import { clusterConfig } from '../config/cluster';

const PRIMARY_RPC = clusterConfig.rpcEndpoint;
const FALLBACK_RPC = process.env.SOLANA_FALLBACK_RPC; // Optional secondary (e.g., Alchemy)

let cachedConnection: Connection | null = null;

export function getConnection(commitment: 'confirmed' | 'finalized' = 'confirmed'): Connection {
  if (cachedConnection) return cachedConnection;
  cachedConnection = new Connection(PRIMARY_RPC, {
    commitment,
    confirmTransactionInitialTimeout: 60000,
  });
  return cachedConnection;
}

export async function withRetry<T>(
  fn: (conn: Connection) => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const conn = attempt === 0
        ? getConnection()
        : new Connection(FALLBACK_RPC || PRIMARY_RPC, 'confirmed');
      return await fn(conn);
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}
```

**Trade-offs:** Adds ~200ms retry delay on failure. Acceptable because RPC failures would otherwise cause complete transaction loss.

### Pattern 3: Anchor Program Deployment Strategy

**What:** Deploy the same program to mainnet-beta with a new program ID (or reuse the devnet ID if you control the keypair). Use `anchor deploy` with mainnet provider.

**Steps:**
1. Update `Anchor.toml` to add `[programs.mainnet]` section with mainnet program ID
2. Set provider cluster to `mainnet-beta` with a funded deploy authority wallet
3. Deploy with `anchor deploy --provider.cluster mainnet`
4. Verify the program ID matches what the client expects
5. Keep upgrade authority in a secure multisig (Squads) -- not a hot wallet
6. After launch stabilizes, consider making the program immutable

**Critical:** The deploy authority keypair must be secured. If compromised, an attacker can upgrade the program to steal escrow funds. Transfer upgrade authority to a Squads multisig after deploy.

### Pattern 4: MongoDB Hardening for Serverless

**What:** Explicitly configure connection pool size, timeouts, and error handling.

```typescript
// Enhanced dbConnect options
const opts = {
  bufferCommands: false,
  ssl: true,
  maxPoolSize: 3,           // Low for serverless (each instance is short-lived)
  minPoolSize: 0,           // Allow full cleanup on idle
  serverSelectionTimeoutMS: 5000,  // Fail fast if Atlas is unreachable
  socketTimeoutMS: 30000,
  connectTimeoutMS: 10000,
  maxIdleTimeMS: 30000,     // Release connections quickly in serverless
};
```

**Trade-offs:** Lower pool size means sequential queries in the same request. Fine for LuxHub's API pattern (1-3 queries per request).

## Data Flow Patterns

### Primary Purchase Flow (Critical Path)

```
Buyer (Browser)
    │
    ├──1. GET /api/users/listings ─────────> MongoDB (NFT listings)
    │   <── NFT list with prices ──────────
    │
    ├──2. Wallet signs `exchange` tx ──────> Solana (Anchor escrow PDA)
    │   <── txSignature ───────────────────
    │
    ├──3. POST /api/escrow/purchase ───────> API Route
    │       ├── verifyTransactionForWallet() ──> Solana RPC (confirm tx)
    │       ├── Escrow.findOneAndUpdate() ─────> MongoDB (status: funded)
    │       └── notificationService.create() ──> MongoDB (notify vendor)
    │   <── { success: true } ─────────────
    │
    └──4. Vendor ships, admin confirms
            ├── Squads proposal + execute ──> Solana (confirm_delivery)
            ├── squadService.sync() ────────> MongoDB (status: delivered)
            └── notificationService ────────> MongoDB + Resend (email)
```

### Key principle: On-chain action first, then MongoDB update. Never the reverse. If MongoDB write fails after successful on-chain tx, the system can recover by re-syncing from chain. If MongoDB wrote first and chain fails, the database is in an inconsistent state.

### Offer Negotiation Flow (Off-Chain)

```
Buyer                          API                          Vendor
  │                              │                              │
  ├── POST /api/offers/create ──>│                              │
  │                              ├── Save Offer (MongoDB) ─────>│
  │                              ├── Notify vendor ────────────>│
  │                              │                              │
  │                              │<── POST /api/offers/counter ─┤
  │<── Notify buyer ─────────────┤                              │
  │                              │                              │
  ├── POST /api/offers/accept ──>│                              │
  │                              ├── Lock at agreed price ─────>│
  │                              │                              │
  ├── Wallet signs `exchange` ──>│ [same as purchase flow]      │
```

Offers are entirely off-chain until accepted. This is correct -- no SOL wasted on negotiation. Only the final purchase touches the chain.

### Pool/Bags Token Flow

```
Vendor                         API                          Bags API
  │                              │                              │
  ├── POST /api/pool/create ────>│                              │
  │                              ├── Create Pool (MongoDB) ────>│
  │                              │                              │
  ├── POST /api/bags/launch ────>│                              │
  │                              ├── Launch token ─────────────>│
  │                              │<── tokenMint, bondingCurve ──┤
  │                              ├── Update Pool (MongoDB) ────>│
```

## Component Boundaries

### What Talks to What

```
Browser (client)
  ├──> API Routes (via fetch/SWR)         [HTTP JSON]
  ├──> Solana RPC (via wallet adapter)     [Web3.js transactions]
  └──> Privy (optional, via SDK)           [Auth tokens]

API Routes (server)
  ├──> MongoDB (via Mongoose)              [TCP/TLS, connection pool]
  ├──> Solana RPC (via @solana/web3.js)    [HTTPS JSON-RPC]
  ├──> Helius DAS API (via fetch)          [HTTPS REST]
  ├──> Squads SDK (via @sqds/multisig)     [On-chain CPI]
  ├──> Bags API (via fetch)                [HTTPS REST]
  ├──> EasyPost (via SDK)                  [HTTPS REST]
  ├──> Resend (via SDK)                    [HTTPS REST]
  ├──> Irys (via @irys/sdk)               [HTTPS upload]
  └──> Anthropic (via API)                 [HTTPS REST]

Anchor Program (on-chain)
  ├──> SPL Token Program                   [CPI]
  ├──> System Program                      [CPI]
  └──> Squads Multisig (CPI gate)          [CPI verification]
```

### Boundary Rules

1. **Client never talks to MongoDB.** All data flows through API routes.
2. **Client signs transactions directly.** Wallet adapter sends to Solana RPC, not through API.
3. **API routes verify on-chain state.** After client signs, API verifies the tx before updating MongoDB.
4. **Notifications are server-side only.** `notificationService` runs in API routes, never client.
5. **Anchor program is autonomous.** Once deployed, it enforces escrow rules regardless of API state.

## Suggested Build Order for Mainnet Hardening

Dependencies flow top-to-bottom. Each step depends on the one above.

### Phase A: Environment Configuration (must be first)

1. Create `src/lib/config/cluster.ts` with cluster-driven configuration
2. Create `src/lib/solana/connection.ts` with connection factory
3. Replace all 13 RPC fallback patterns with factory import
4. Replace all 10 explorer URL patterns with `clusterConfig.explorerUrl()`
5. Update `_app.tsx` to use `clusterConfig.network` and `clusterConfig.mobileChain`
6. Set up Vercel environment variables: `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`

**Why first:** Every other mainnet change depends on correct cluster routing. If this is wrong, all subsequent testing is invalid.

### Phase B: Anchor Program Deploy

1. Add `[programs.mainnet]` to Anchor.toml
2. Fund deploy authority wallet on mainnet
3. Deploy program to mainnet-beta
4. Verify program matches IDL (test with simple escrow init)
5. Transfer upgrade authority to Squads multisig
6. Update `PROGRAM_ID` env var for mainnet

**Why second:** Cannot test any mainnet flow without the program deployed.

### Phase C: Storage and Service Migration

1. Switch Irys to mainnet network (`IRYS_NETWORK=mainnet`)
2. Verify Helius RPC endpoint is mainnet (`mainnet.helius-rpc.com`)
3. Confirm Bags API works on mainnet (partner config PDA)
4. Fund treasury wallet with SOL for transaction fees
5. Configure EasyPost for production mode (live API key)

**Why third:** Depends on cluster config (Phase A) and program (Phase B).

### Phase D: Resilience Hardening

1. Add RPC retry/failover logic
2. Configure MongoDB pool size and timeouts
3. Add Sentry error monitoring
4. Add health check endpoint that verifies all external service connectivity
5. Test rate limiting under load (consider upgrading to Redis if needed)

**Why fourth:** Polish layer. System works without it, but is fragile.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users (launch) | Current monolith is fine. Vercel serverless handles cold starts. In-memory rate limits are "good enough." MongoDB Atlas M10 tier. Single Helius RPC. |
| 100-1K users | Add Redis for rate limiting and session caching (Vercel KV or Upstash). Add RPC failover (secondary Alchemy endpoint). Monitor MongoDB connection count -- upgrade Atlas tier if hitting limits. |
| 1K-10K users | Consider dedicated API for high-traffic reads (listings, prices) with ISR/edge caching. Add CDN caching for NFT metadata. Move notification delivery to a queue (Vercel Cron or external). |
| 10K+ users | Split API into microservices (marketplace reads, escrow writes, notification worker). Consider dedicated MongoDB replica set. Multiple RPC providers with load balancing. This is not a near-term concern. |

### First Bottleneck: MongoDB Connections

Vercel serverless can spin up many concurrent functions, each opening a MongoDB connection. At ~50 concurrent users doing writes, you will start seeing connection exhaustion on Atlas shared tiers. Fix: set `maxPoolSize: 3`, upgrade to Atlas M10+ dedicated, enable Vercel Fluid Compute.

### Second Bottleneck: RPC Rate Limits

Helius free tier is 30 RPS. At scale, the marketplace page alone can generate 5-10 RPC calls per user (listings, prices, wallet balances). Fix: cache RPC responses aggressively (ISR for listings, client-side SWR with stale-while-revalidate). Upgrade Helius plan.

### Third Bottleneck: Notification Delivery

The notification service creates MongoDB documents synchronously in API request handlers. At scale, this adds latency to purchase flows. Fix: fire-and-forget pattern (don't await notification creation in critical paths), or move to a queue.

## Anti-Patterns

### Anti-Pattern 1: Silent Devnet Fallback

**What people do:** `process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'`
**Why it is wrong:** On mainnet, if the env var is missing or empty, the app silently connects to devnet. Transactions are "verified" against the wrong chain. MongoDB shows success, but no real money moved. This is the single most dangerous bug in the codebase.
**Do this instead:** Fail loudly. No fallback URL. If the env var is not set, throw at startup.

### Anti-Pattern 2: Client-Side Chain Selection

**What people do:** Hardcode `WalletAdapterNetwork.Devnet` in `_app.tsx` and `chain: 'devnet'` in mobile adapter config.
**Why it is wrong:** These must match the RPC endpoint. If RPC points to mainnet but wallet adapter says devnet, transaction simulation and fee estimation break.
**Do this instead:** Derive wallet network from the same cluster config that drives RPC.

### Anti-Pattern 3: On-Chain State Without MongoDB Sync

**What people do:** Execute an on-chain action (e.g., confirm_delivery) and assume MongoDB will be updated by a separate process.
**Why it is wrong:** If the sync fails, the database shows stale state. Users see "funded" when escrow is already delivered.
**Do this instead:** Always update MongoDB in the same API handler that executes the on-chain action. If MongoDB write fails, log the error and trigger a re-sync job. Never leave the two stores out of sync for longer than a few seconds.

### Anti-Pattern 4: Storing Keypairs in Environment Variables as JSON

**What people do:** `SQUADS_MEMBER_KEYPAIR_JSON` contains a full secret key array in an env var.
**Why it is wrong:** Env vars can leak through logs, error reporters, or Vercel dashboard access. A Squads member keypair can approve fund transfers.
**Do this instead:** For mainnet, use Vercel encrypted environment variables (they are encrypted at rest). Better yet, move to a KMS-backed signing service or hardware wallet flow for Squads approvals. Never log env vars in error handlers.

## Integration Points

### External Services

| Service | Integration Pattern | Mainnet Considerations |
|---------|---------------------|------------------------|
| Helius RPC | Direct JSON-RPC via `@solana/web3.js` | Upgrade to paid plan (30 RPS free is tight). Use `mainnet.helius-rpc.com`. Add failover RPC. |
| Helius DAS | REST API via fetch in `dasApi.ts` | Same API key works for mainnet. Verify asset responses match mainnet NFTs. |
| MongoDB Atlas | Mongoose ODM, connection cached on globalThis | Enable IP allowlisting for Vercel's IP ranges. Set explicit pool limits. |
| Squads Protocol | `@sqds/multisig` SDK, CPI in Anchor program | Mainnet multisig PDA must be created separately. Fund members. |
| Bags API | REST via fetch, webhooks | Verify mainnet partner config PDA. Test token launch with minimal SOL. |
| Irys | `@irys/sdk` for permanent storage | Mainnet uploads cost real SOL/tokens. Set `IRYS_NETWORK=mainnet`. |
| EasyPost | REST SDK for shipping | Switch from test API key to production key. |
| Resend | REST for transactional email | Already production-ready. Verify domain authentication. |
| Sentry | Error reporting via Vercel integration | Enable and configure. Critical for mainnet error visibility. |
| Anthropic | REST API for AI watch analysis | Already production-ready. No cluster dependency. |

### Internal Boundaries

| Boundary | Communication | Mainnet Notes |
|----------|---------------|---------------|
| Client <-> API | HTTP JSON via fetch/SWR | No changes needed. Vercel handles TLS. |
| Client <-> Solana | Wallet adapter direct signing | Must use mainnet RPC. Wallet adapter network must match. |
| API <-> MongoDB | Mongoose TCP/TLS | Tighten pool settings for serverless. |
| API <-> Solana RPC | `@solana/web3.js` Connection | Add retry logic. Remove devnet fallbacks. |
| Anchor <-> SPL Token | On-chain CPI | Mainnet SPL Token program is same address. No changes. |
| Anchor <-> Squads | CPI gate in `squads_gate.rs` | Mainnet Squads program address is same. Multisig PDA differs. |

## Mainnet Migration Checklist (Summary)

| Category | Item | Files Affected | Risk |
|----------|------|----------------|------|
| Config | Create cluster config module | New file + 25 imports | LOW |
| Config | Remove all devnet fallback URLs | 13 files | HIGH (most critical) |
| Config | Parameterize explorer URLs | 10 files | LOW |
| Config | Update `_app.tsx` network config | 1 file | MEDIUM |
| Deploy | Deploy Anchor program to mainnet | Anchor.toml + deploy | HIGH |
| Deploy | Transfer upgrade authority to Squads | Post-deploy | HIGH |
| Deploy | Fund treasury wallet on mainnet | Manual | MEDIUM |
| Deploy | Create Squads multisig on mainnet | Manual | MEDIUM |
| Storage | Switch Irys to mainnet | env var | MEDIUM |
| Services | Verify Helius endpoint is mainnet | env var | HIGH |
| Services | Configure Bags partner PDA on mainnet | API call | MEDIUM |
| Services | Switch EasyPost to production | env var | LOW |
| Resilience | Add RPC retry/failover | 2 new files | MEDIUM |
| Resilience | Harden MongoDB connection config | 1 file | LOW |
| Resilience | Enable Sentry | Vercel config | LOW |
| Security | Secure keypair storage | env var handling | HIGH |

## Sources

- Codebase analysis: `src/pages/_app.tsx`, `src/utils/programUtils.ts`, `src/lib/database/mongodb.ts`, `src/lib/services/txVerification.ts`, `src/lib/middleware/rateLimit.ts`, `src/lib/services/squadsTransferService.ts`, `Solana-Anchor/Anchor.toml`
- [Solana Program Deploying Docs](https://solana.com/docs/programs/deploying)
- [Solana Program Security Checklist](https://dev.to/ohmygod/solana-program-security-checklist-14-critical-checks-before-you-deploy-to-mainnet-2d66)
- [Helius RPC Overview](https://www.helius.dev/docs/rpc/overview)
- [Complete Guide to Solana RPC Providers 2026](https://sanctum.so/blog/complete-guide-solana-rpc-providers-2026)
- [Vercel Connection Pooling with Serverless Functions](https://vercel.com/guides/connection-pooling-with-serverless-functions)
- [Vercel Fluid Compute for Database Pools](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)
- [Solana Clusters and RPC Endpoints](https://solana.com/docs/references/clusters)

---
*Architecture research for: Solana RWA Marketplace (mainnet hardening)*
*Researched: 2026-03-18*
