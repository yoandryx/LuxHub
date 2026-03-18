# Stack Research

**Domain:** Luxury RWA marketplace on Solana -- production mainnet launch readiness
**Researched:** 2026-03-18
**Confidence:** MEDIUM-HIGH (existing stack is solid; recommendations focus on production hardening)

## Context

LuxHub already has a working stack on devnet. This research does NOT re-evaluate foundational choices (Next.js pages router, MongoDB, Anchor, Solana). Instead, it answers: **what production infrastructure and upgrades are needed to go from devnet testing to mainnet launch?**

The existing stack (Next.js 16 + React 19, Anchor 0.31.0, MongoDB/Mongoose 8, Helius RPC, Irys storage, Squads multisig, Bags API) is well-chosen. The gaps are in production operations, not technology selection.

---

## Current Stack Assessment

### What Stays (No Changes Needed)

| Technology | Current Version | Verdict | Rationale |
|------------|----------------|---------|-----------|
| Next.js (pages router) | ^16.1.3 | **KEEP** | Pages router is supported indefinitely per Vercel. Migration to App Router mid-launch is high risk, zero benefit. |
| React | ^19.2.1 | **KEEP** | Current stable. No action needed. |
| TypeScript | ^5.8.2 | **KEEP** | Current stable. |
| MongoDB + Mongoose | ^8.12.0 | **KEEP** | Adequate for launch volume. Atlas managed hosting recommended for production. |
| Solana wallet adapter | ^0.15.39 | **KEEP** | Stable, widely used. web3.js v1 compatible. |
| Metaplex mpl-core | ^1.7.0 | **KEEP** | Current NFT standard on Solana. |
| Squads multisig | ^2.1.4 | **KEEP** | Required for treasury security. No upgrade needed. |
| Zod | ^3.25.76 | **KEEP** | Runtime validation. Current stable. |
| SWR | ^2.3.8 | **KEEP** | Data fetching. Stable, sufficient for pages router. |
| Framer Motion | ^12.23.25 | **KEEP** | Animation library. Current. |
| EasyPost | ^8.4.0 | **KEEP** | Shipping integration. Working. |
| Resend | (installed) | **KEEP** | Transactional email. Working with luxhub.gold domain. |

### What Needs Production Configuration (Not New Libraries)

| Technology | Action | Priority |
|------------|--------|----------|
| **Helius RPC** | Upgrade from free tier to Developer ($49/mo) or Business ($499/mo) plan. Free tier is 1M credits/10 RPS -- will fail under real traffic. | CRITICAL |
| **MongoDB Atlas** | Ensure production cluster (M10+ dedicated), not shared tier. Enable backups, monitoring, connection pooling. | CRITICAL |
| **Irys storage** | Switch from devnet to mainnet uploads. Requires SOL funding for uploads. Permanent storage costs are low (~$0.001/KB). | CRITICAL |
| **Vercel** | Pro plan ($20/mo) minimum for production. Enables longer function timeouts (60s vs 10s), more bandwidth, analytics. | HIGH |
| **Sentry** | Already installed via Vercel integration, needs configuration (see below). | HIGH |

---

## Production Infrastructure to Add

### Error Monitoring & Observability

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@sentry/nextjs` | ^10.44.0 | Error tracking, performance monitoring, session replay | Industry standard. Vercel integration already installed. Pages Router fully supported. Configure DSN, source maps, tracesSampleRate (10% production). |

**Confidence:** HIGH -- Sentry is the de facto standard. Already partially installed.

**Configuration needed:**
- `sentry.client.config.ts` -- client-side initialization
- `sentry.server.config.ts` -- server-side initialization
- `instrumentation.ts` -- Next.js instrumentation hook (captures server errors)
- `next.config.js` -- wrap with `withSentryConfig()` for source maps
- Set `SENTRY_AUTH_TOKEN` and `NEXT_PUBLIC_SENTRY_DSN` env vars
- Set `tracesSampleRate: 0.1` for production (10% sampling)
- Enable Vercel Drains to forward logs to Sentry

### Transaction Landing & Priority Fees

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@solana/compute-budget` (via web3.js) | existing | Priority fees for mainnet transaction landing | Mainnet transactions WILL fail without priority fees during congestion. Free on devnet, required on mainnet. |

**Confidence:** HIGH -- this is documented Solana best practice.

**Implementation pattern:**
```typescript
// Add to every transaction that moves funds
import { ComputeBudgetProgram } from '@solana/web3.js';

// 1. Simulate to get actual CU usage
// 2. Set compute unit limit to 1.2x simulated usage
// 3. Set priority fee based on Helius fee estimation API
const computeUnitLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: estimatedCU * 1.2 });
const computeUnitPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 });
// Add BEFORE other instructions in transaction
```

Helius provides a `getPriorityFeeEstimate` API endpoint for dynamic fee estimation. Use it instead of hardcoding.

### Mainnet Program Deployment

| Item | Estimate | Notes |
|------|----------|-------|
| Program deploy (rent-exempt) | ~1.8 SOL | For ~350KB compiled program. Halved recently (was 3.6 SOL). |
| Partner config PDA | ~0.01 SOL | Bags partner config creation |
| Escrow config PDA | ~0.01 SOL | Initialize marketplace config |
| Treasury funding buffer | ~2 SOL | For ongoing transaction fees, priority fees |
| **Total needed** | **~4 SOL** | Fund treasury wallet before mainnet launch |

**Confidence:** MEDIUM -- program size estimate based on typical Anchor programs. Actual cost depends on compiled .so size.

---

## Upgrades to Evaluate (NOT Required for Launch)

### Anchor 0.31.0 to 0.32.1

| Aspect | Details |
|--------|---------|
| Current | 0.31.0 |
| Latest stable | 0.32.1 |
| Required Solana CLI | 2.3.0 (up from 2.1.16) |
| Breaking changes | Verifiable builds now use `solana-verify`, IDL auto-uploaded on deploy, requires Rust 1.89+ |
| Recommendation | **DO NOT upgrade for launch.** Upgrade is low-risk but adds unnecessary testing burden. Program works on 0.31.0 and there are no security fixes that require it. Upgrade post-launch when stabilizing for Anchor 1.0. |

**Confidence:** HIGH -- Anchor 0.32 release notes explicitly state it is the last planned upgrade before 1.0 breaking changes.

### @solana/web3.js v1 to v2 (@solana/kit)

| Aspect | Details |
|--------|---------|
| Current | ^1.98.0 (v1) |
| Latest | 2.x (@solana/kit) |
| Breaking changes | Complete rewrite. Class-based to functional. Keypair to KeyPairSigner. PublicKey to address(). Modular imports. |
| Recommendation | **DO NOT migrate for launch.** v2 is a total rewrite that would touch every file interacting with Solana. Use `@solana/compat` only if you need interop with a v2-only library. The v1 line continues to receive maintenance. |

**Confidence:** HIGH -- migration is well-documented as a complete breaking change affecting every Solana interaction.

### Next.js Pages Router to App Router

| Aspect | Details |
|--------|---------|
| Recommendation | **DO NOT migrate.** Pages Router is supported indefinitely. Migration mid-launch is the highest-risk change possible. Zero user-facing benefit for a marketplace. |

**Confidence:** HIGH -- Vercel has stated pages router support continues.

---

## Competitive Landscape Context

### How Competitors Stack Up

| Competitor | Chain | Model | Fee | Key Difference |
|------------|-------|-------|-----|----------------|
| **Kettle** | Blast (L2) | Custodial vault in NYC, NFT-backed watches | 2.5% | Physical custody by platform, not vendor |
| **Courtyard** | Polygon | Tokenized collectible cards, vault storage | ~2.5% | Cards only, massive scale, institutional vaults |
| **Magic Eden** | Multi-chain | General NFT marketplace | 2% | No physical asset verification |
| **LuxHub** | Solana | Vendor-custodied luxury goods, escrow-protected | 3% | Vendor ships direct, on-chain escrow, no central vault |

**LuxHub's differentiator:** No central vault overhead (vendors ship direct), Solana speed, Squads multisig treasury, and pool tokenization via Bags. The 3% fee is slightly above market but justified by escrow protection.

---

## Production Checklist: Environment Variables

### New for Mainnet

| Variable | Purpose | Where to Get |
|----------|---------|--------------|
| `NEXT_PUBLIC_SOLANA_ENDPOINT` | Helius mainnet RPC URL | Helius dashboard (paid plan) |
| `SENTRY_AUTH_TOKEN` | Sentry source map uploads | Vercel Sentry integration |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error reporting | Sentry project settings |
| `SENTRY_ORG` | Sentry organization slug | Sentry dashboard |
| `SENTRY_PROJECT` | Sentry project slug | Sentry dashboard |

### Must Change from Devnet

| Variable | Devnet Value | Mainnet Action |
|----------|-------------|----------------|
| `NEXT_PUBLIC_SOLANA_ENDPOINT` | Helius devnet URL | Switch to mainnet URL |
| `PROGRAM_ID` | `kW2w...Npj` (devnet) | Deploy to mainnet, get new ID |
| All hardcoded `devnet` references | 5 locations per PROJECT.md | Change to `mainnet-beta` |
| Irys network config | devnet | mainnet |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **@solana/web3.js v2 / @solana/kit** (for now) | Complete rewrite, would delay launch by weeks. Every Solana interaction changes. | Stay on v1 (`^1.98.0`). Migrate post-launch. |
| **Anchor 1.0-rc** | Release candidate, not stable. Breaking changes from 0.31 with no security benefit. | Stay on 0.31.0. Consider 0.32.1 post-launch. |
| **Next.js App Router migration** | Massive codebase change (100+ API routes, 20+ pages). Zero user-facing benefit. | Stay on pages router. |
| **Privy as primary auth** | Already installed but adds complexity. Wallet signature auth is simpler for crypto-native users. | Keep wallet adapter as primary. Privy optional for email onboarding later. |
| **OpenAI SDK** | Installed (`openai@^4.100.0`) but unused. Dead weight in bundle. | Remove from dependencies, or keep only if planning to use. Anthropic SDK handles AI analysis. |
| **react-toastify** | Legacy duplicate -- `react-hot-toast` is the primary toast library. | Remove `react-toastify`, standardize on `react-hot-toast`. |
| **react-feather** | Redundant with `lucide-react` (same icon set, lucide is the maintained fork). | Remove `react-feather`, use `lucide-react` + `react-icons`. |
| **aws-sdk / ibm-cos-sdk** | Installed but Irys is the storage provider. These are 50MB+ bundles. | Remove unless actively used for something else. |
| **Stripe** | Installed (`stripe@^17.7.0`) but fiat on-ramp is out of scope for v1. | Remove for now, reinstall when fiat is in scope. |
| **Self-hosted RPC / validator** | Expensive ($2,900+/mo for dedicated node), unnecessary for marketplace traffic. | Helius Business plan ($499/mo) covers 100M credits, 200 RPS. |

---

## Recommended Helius Plan for Launch

| Plan | Cost | Credits | RPS | Verdict |
|------|------|---------|-----|---------|
| Free | $0 | 1M | 10 | **Current.** Will fail on launch day. |
| Developer | $49/mo | 10M | 50 | **Minimum viable** for soft launch with 1 vendor. |
| Business | $499/mo | 100M | 200 | **Recommended** if expecting real traffic. DAS API, webhooks, priority support. |

Start with Developer ($49/mo) for soft launch with JC Gold. Upgrade to Business when traffic warrants it.

---

## Bundle Optimization (Production Build)

Unused dependencies to remove before launch (reduces bundle size and cold start time on Vercel):

```bash
# Remove unused production dependencies
npm uninstall openai stripe aws-sdk ibm-cos-sdk react-toastify react-feather

# Verify build still passes
npm run build
```

Estimated savings: ~60MB from node_modules, ~200KB from client bundle (aws-sdk alone is huge).

**Confidence:** MEDIUM -- need to verify none of these are imported anywhere before removing.

---

## Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@coral-xyz/anchor@0.31.0` | `@solana/web3.js@^1.98.0` | Both use v1 patterns. Do NOT mix with v2. |
| `@solana/web3.js@^1.98.0` | `@solana/spl-token@^0.4.13` | v1 compatible pair. |
| `@metaplex-foundation/mpl-core@^1.7.0` | `@metaplex-foundation/umi-bundle-defaults@^1.4.1` | Umi framework required for mpl-core. |
| `next@^16.1.3` | `@sentry/nextjs@^10.44.0` | Pages router supported. Use `withSentryConfig` wrapper. |
| `next@^16.1.3` | `react@^19.2.1` | Compatible. Next.js 16 requires React 19. |
| Anchor 0.31.0 (Rust) | Solana CLI 2.1.16 | Current working pair. 0.32 requires CLI 2.3.0. |

---

## Production Infrastructure Summary

### Must Have for Launch (Critical)

1. **Helius paid plan** -- Developer ($49/mo) minimum
2. **Sentry configuration** -- `@sentry/nextjs@^10.44.0`, DSN, source maps, instrumentation
3. **Priority fees on all fund-moving transactions** -- via ComputeBudgetProgram
4. **Mainnet SOL funding** -- ~4 SOL in treasury for deploy + operations
5. **MongoDB Atlas production cluster** -- M10+ with backups enabled
6. **Network switch** -- all 5 hardcoded devnet references changed to mainnet-beta
7. **Irys mainnet config** -- storage uploads point to mainnet
8. **Vercel Pro** -- $20/mo for production function timeouts and bandwidth

### Should Have for Launch (High)

1. **Remove unused dependencies** -- openai, stripe, aws-sdk, ibm-cos-sdk, react-toastify, react-feather
2. **Helius priority fee estimation** -- dynamic fees instead of hardcoded
3. **Rate limiting on all fund-moving endpoints** -- already partially done per PROJECT.md
4. **RPC fallback removal** -- fail loudly instead of silent devnet fallback (per active requirements)

### Nice to Have Post-Launch

1. **Anchor 0.32.1 upgrade** -- verifiable builds, cleaner IDL deployment
2. **@solana/web3.js v2 migration** -- smaller bundle, faster crypto ops
3. **Sentry Session Replay** -- video-like reproduction of user issues
4. **Helius Enhanced WebSockets** -- real-time escrow state updates (replaces polling)

---

## Monthly Production Costs Estimate

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Helius RPC | Developer | $49 |
| Vercel | Pro | $20 |
| MongoDB Atlas | M10 | $57 |
| Sentry | Team (via Vercel) | $0 (included) |
| Resend | Free tier | $0 |
| Irys storage | Pay per upload | ~$1-5 |
| EasyPost | Pay per label | Variable |
| **Total fixed** | | **~$126/mo** |

**Confidence:** MEDIUM -- Atlas pricing depends on region and cluster size. Helius may need Business tier ($499) under load.

---

## Sources

- [Anchor 0.32.0 Release Notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-0) -- breaking changes, Solana CLI requirements
- [Anchor GitHub Releases](https://github.com/solana-foundation/anchor/releases) -- version history, 1.0-rc status
- [Helius Pricing](https://www.helius.dev/pricing) -- RPC plan tiers, DAS API inclusion
- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) -- Pages Router setup, instrumentation
- [Solana Priority Fees Guide](https://solana.com/developers/guides/advanced/how-to-use-priority-fees) -- ComputeBudgetProgram usage
- [Solana Program Deployment Costs](https://solana.com/docs/programs/deploying) -- rent-exempt calculations
- [@solana/web3.js v2 / @solana/kit](https://blog.triton.one/intro-to-the-new-solana-kit-formerly-web3-js-2/) -- migration scope, breaking changes
- [Next.js Pages Router Future](https://github.com/vercel/next.js/discussions/56655) -- long-term support confirmation
- [Kettle RWA Marketplace](https://alearesearch.substack.com/p/kettle-luxury-watch-rwa-trading-what) -- competitor analysis
- [Solana RWA Report Q4 2025](https://blog.redstone.finance/2025/09/29/solana-rwa/) -- ecosystem context, $873M tokenized assets
- [Smart Contract Audit Pricing 2026](https://www.zealynx.io/blogs/audit-pricing-2026) -- $7K-$20K for simple programs, $60K+ for DeFi

---
*Stack research for: LuxHub luxury RWA marketplace -- mainnet launch readiness*
*Researched: 2026-03-18*
