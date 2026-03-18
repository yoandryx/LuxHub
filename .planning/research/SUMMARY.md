# Project Research Summary

**Project:** LuxHub -- Decentralized Luxury Asset Marketplace on Solana
**Domain:** RWA (Real-World Asset) marketplace with NFT-backed physical goods, on-chain escrow, and pool tokenization
**Researched:** 2026-03-18
**Confidence:** HIGH (existing production codebase audited; research focused on mainnet launch gaps)

## Executive Summary

LuxHub is a functional luxury watch marketplace on Solana's devnet with a working escrow smart contract, vendor onboarding, AI watch analysis, Squads multisig treasury, and Bags pool tokenization. The core product architecture is sound. The project does NOT need a technology re-evaluation or a ground-up rebuild. What it needs is a disciplined mainnet hardening sprint that eliminates 35+ hardcoded devnet references, strengthens transaction verification to handle real money, adds missing buyer-trust features (multi-image listings, condition grading, search/filtering), and sets up production infrastructure (Sentry, paid Helius RPC, priority fees).

The recommended approach is a three-phase launch: (1) environment configuration and security hardening to make the codebase mainnet-safe, (2) marketplace UX completion to fill trust gaps that would prevent a luxury buyer from spending $5K+ through the platform, and (3) mainnet deployment with the first vendor (JC Gold Jewelers, 10 watches). This order is non-negotiable -- deploying to mainnet before fixing the devnet fallback pattern risks processing transactions against the wrong chain, which is the single most dangerous bug in the codebase.

The key risks are: silent devnet fallback causing transactions to verify against the wrong chain (critical, pre-launch fix), insufficient transaction verification allowing replay attacks or amount spoofing (critical, pre-launch fix), unaudited smart contract handling real USDC custody (mitigate with automated tooling now, professional audit after first 10 sales), and physical custody gap where on-chain escrow cannot enforce off-chain shipping honesty (mitigate with mandatory shipping insurance, delivery photo evidence, and inspection windows). Monthly production infrastructure costs are approximately $126/month (Helius Developer $49, Vercel Pro $20, Atlas M10 $57), with ~4 SOL needed upfront for mainnet program deployment and treasury funding.

## Key Findings

### Recommended Stack

The existing stack is well-chosen and requires no foundational changes. Next.js 16 (pages router), React 19, Anchor 0.31.0, MongoDB/Mongoose 8, Helius RPC, Irys storage, Squads multisig, and Bags API all stay. The work is production configuration, not technology selection. Explicitly do NOT upgrade Anchor to 0.32, do NOT migrate to @solana/web3.js v2, and do NOT switch to App Router -- all three would delay launch with zero user-facing benefit.

**Core production additions:**
- **Helius paid plan ($49/mo minimum):** Free tier (10 RPS) will fail under real traffic; Developer tier provides 50 RPS
- **Sentry (@sentry/nextjs):** Error monitoring and performance tracking; already partially installed via Vercel
- **Priority fees (ComputeBudgetProgram):** Mainnet transactions fail without priority fees during congestion; use Helius fee estimation API
- **Cluster config module:** Single source of truth replacing 35+ scattered devnet fallbacks

**Dependencies to remove (bundle optimization):**
- openai, stripe, aws-sdk, ibm-cos-sdk, react-toastify, react-feather (~60MB node_modules, ~200KB client bundle savings)

See `.planning/research/STACK.md` for full version matrix and cost estimates.

### Expected Features

Research cross-referenced Chrono24, Kettle, Courtyard.io, eBay Authenticity Guarantee, and 4K Protocol. LuxHub has strong competitive advantages (trustless on-chain escrow, Squads multisig, AI analysis, pool tokenization) but critical trust-gap features are missing for a buyer spending $5K+ on a watch.

**Must have for launch (P1 -- blocks buyer trust):**
- Multi-image upload per listing (minimum 5 angles) -- single image is unacceptable for luxury
- Standardized condition grading (Unworn/Excellent/Very Good/Good/Fair) -- free-text is ambiguous
- Authentication record display (serial number photos, certificate uploads) -- biggest trust gap
- Search and basic filtering (brand, price range, condition) -- critical once inventory exceeds 10 items
- Buyer protection policy page -- clear guarantee messaging with escrow terms
- Mobile-responsive testing pass -- 60%+ of luxury watch browsing is mobile

**Should have post-validation (P2 -- add within 30 days):**
- Provenance trail viewer (on-chain ownership history) -- infra exists via Helius DAS
- Pool tokenization public launch -- Bags integration done, needs 5+ successful direct sales first
- Advanced search filters -- case size, material, movement type
- Vendor reputation scores -- after multiple vendors are active

**Defer to v2+:**
- Watch price index (needs 100+ transactions for meaningful data)
- Fiat on-ramp (regulatory complexity, KYC burden)
- Native mobile app (PWA covers 90% of use cases)
- Built-in chat/messaging (structured offers handle negotiation)

See `.planning/research/FEATURES.md` for full competitor analysis and dependency map.

### Architecture Approach

LuxHub is a Next.js monolith on Vercel with 100+ API routes, 29 Mongoose models, and an Anchor smart contract. The architecture is correct for launch scale (0-1K users). The critical principle is "on-chain action first, then MongoDB update" -- never the reverse. The main architectural gaps are: (1) no centralized cluster configuration (35+ files construct their own Solana connections), (2) no RPC retry/failover logic, (3) in-memory rate limiting that resets on Vercel cold starts, and (4) MongoDB connection settings not optimized for serverless.

**Major components and hardening needs:**
1. **Cluster config module (NEW)** -- centralizes all devnet/mainnet-dependent values; every Solana-touching file imports from here
2. **RPC connection factory (NEW)** -- singleton connection with retry logic and optional failover to secondary provider
3. **Transaction verification (HARDEN)** -- must verify program called, amount transferred, correct USDC mint, and escrow PDA destination; store processed txSignatures to prevent replay
4. **MongoDB connection (HARDEN)** -- explicit pool limits (maxPoolSize: 3), timeouts, and connection monitoring for serverless

See `.planning/research/ARCHITECTURE.md` for data flow diagrams, build order, and scaling considerations.

### Critical Pitfalls

1. **Silent devnet fallback (CRITICAL)** -- 35+ files fall back to devnet RPC if env var is missing. On mainnet, this means transactions verify against the wrong chain while appearing successful. Fix: centralized config module that throws on missing endpoint, zero fallbacks.

2. **Insufficient transaction verification (CRITICAL)** -- Current TX verification confirms a transaction exists and the wallet signed it, but does NOT verify the correct program, amount, USDC mint, or escrow PDA. An attacker could submit any successful transaction to "fund" an escrow. Fix: parse inner instructions, verify amount/mint/destination, store txSignatures to prevent replay.

3. **Unaudited smart contract with real USDC custody (HIGH)** -- Sec3's data shows 10 vulnerabilities per audit on average, 85.5% being logic/permissions/validation errors. Fix: automated tooling (clippy, cargo audit, sec3 X-ray) pre-launch; cap escrows at $5K initially; professional audit before scaling past 10 sales.

4. **Physical custody gap (HIGH)** -- On-chain escrow protects digital funds but nothing prevents buyer claiming "never received" or vendor shipping an empty box. Fix: mandatory signature-on-delivery, shipping insurance for items over $1K, delivery photo evidence stored on Irys, 48-72 hour inspection period.

5. **Solo operator single point of failure (MEDIUM)** -- Single admin means all escrows freeze if admin is unavailable for 24 hours. Fix: add at least one Squads co-signer, implement dispute auto-escalation cron, set up Sentry alerting.

See `.planning/research/PITFALLS.md` for full recovery strategies and "looks done but isn't" checklist.

## Implications for Roadmap

Based on research, the suggested phase structure follows strict dependency ordering. Environment configuration must come first because every subsequent phase depends on correct cluster routing. UX features come before mainnet deployment because launching without buyer-trust features wastes the first-vendor opportunity.

### Phase 1: Mainnet Environment Hardening

**Rationale:** Every other phase depends on correct cluster configuration. If this is wrong, all subsequent testing is invalid. This is the highest-risk, highest-impact work.
**Delivers:** A codebase that is mainnet-safe -- no hardcoded devnet references, centralized configuration, fail-fast on misconfiguration.
**Addresses features:** None directly (infrastructure).
**Avoids pitfalls:** Silent devnet fallback (#1), USDC mint mismatch (#5), client-side chain selection mismatch.
**Key tasks:**
- Create `src/lib/config/cluster.ts` (single source of truth for cluster-dependent values)
- Create `src/lib/solana/connection.ts` (connection factory with retry)
- Replace all 13 RPC fallback patterns
- Replace all 10 explorer URL patterns
- Update `_app.tsx` network/chain config to be environment-driven
- Remove unused dependencies (openai, stripe, aws-sdk, etc.)

### Phase 2: Security Hardening

**Rationale:** Must be resolved before real money enters the system. Transaction verification and program security are non-negotiable prerequisites for mainnet deployment.
**Delivers:** Transaction verification that validates amount, mint, destination, and prevents replay. Automated program security scan. Sentry error monitoring.
**Addresses features:** Buyer protection (trust infrastructure).
**Avoids pitfalls:** TX verification insufficient (#2), unaudited program (#3), no error monitoring.
**Key tasks:**
- Harden `txVerification.ts` (verify program, amount, USDC mint, escrow PDA, replay prevention)
- Run `cargo clippy`, `cargo audit`, sec3 X-ray on Anchor program
- Configure Sentry (DSN, source maps, instrumentation, tracesSampleRate)
- Harden MongoDB connection (pool size, timeouts)
- Add priority fee logic to all fund-moving transactions
- Implement build-time check that fails if production + devnet endpoint

### Phase 3: Marketplace UX Completion

**Rationale:** JC Gold (first vendor) is waiting. Launching without multi-image listings, condition grading, and search means luxury buyers will not trust the platform enough to spend $5K+. These features are the difference between "interesting prototype" and "I'll buy a watch here."
**Delivers:** A marketplace that meets luxury buyer expectations for trust and usability.
**Addresses features:** Multi-image upload, condition grading, authentication records, search/filtering, buyer protection page, mobile responsiveness.
**Avoids pitfalls:** Physical custody gap (#4) via buyer protection messaging and evidence requirements.
**Key tasks:**
- Multi-image upload (5 required angles per listing)
- Condition grading dropdown (Unworn/Excellent/Very Good/Good/Fair)
- Authentication record display on listing pages
- Search and filtering (brand, price, condition)
- Buyer protection / guarantee policy page
- Mobile responsive testing and fixes
- Inspection period implementation (48-72 hours post-delivery)

### Phase 4: Mainnet Deployment

**Rationale:** All prerequisites met -- environment is mainnet-safe, security is hardened, UX meets buyer expectations. Now deploy the program and go live.
**Delivers:** Live marketplace on Solana mainnet with JC Gold's first 10 watches listed.
**Addresses features:** All launch features operational on mainnet.
**Avoids pitfalls:** Upgrade authority mismanagement (#7), treasury unfunded, Irys devnet metadata, solo operator SPOF (#6).
**Key tasks:**
- Deploy Anchor program to mainnet-beta (~1.8 SOL)
- Transfer upgrade authority to Squads multisig
- Initialize EscrowConfig on mainnet (treasury, authority, fee_bps)
- Create Bags partner config PDA on mainnet
- Switch Irys to mainnet, re-upload any devnet metadata
- Fund treasury wallet (~4 SOL total)
- Add second Squads co-signer (JC Gold or trusted partner)
- Configure Vercel cron for timeout enforcement and dispute escalation
- Upgrade Helius to Developer plan ($49/mo)
- Switch EasyPost to production API key
- JC Gold vendor onboarding and first 10 listings

### Phase 5: Post-Launch Hardening

**Rationale:** After first transactions validate the system, add monitoring, resilience, and features informed by real user feedback.
**Delivers:** Production-grade resilience and early growth features.
**Addresses features:** Provenance viewer, pool tokenization public launch, vendor reputation.
**Key tasks:**
- Professional smart contract audit (budget $15-20K)
- RPC failover (secondary Alchemy/Triton endpoint)
- Redis rate limiting (Vercel KV or Upstash)
- Provenance trail viewer using Helius DAS data
- Pool tokenization soft launch (after 5+ successful direct sales)
- Advanced search filters

### Phase Ordering Rationale

- **Phases 1-2 before Phase 3:** Security and environment work is invisible to users but creates the foundation. A bug in cluster config invalidates all UX testing.
- **Phase 3 before Phase 4:** Launching on mainnet without buyer-trust features wastes the first-vendor opportunity. JC Gold gets one chance to make a first impression with their clients.
- **Phase 4 as a discrete deployment phase:** Mainnet deployment involves irreversible actions (program deploy, upgrade authority transfer) that should be done deliberately, not mixed with feature work.
- **Phase 5 after launch:** Professional audit and resilience features are informed by real transaction data. Cap escrows at $5K initially to limit risk while unaudited.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Security Hardening):** Transaction verification parsing of Anchor instruction data is non-trivial; may need to research Anchor discriminator format and inner instruction parsing patterns.
- **Phase 3 (Marketplace UX):** Multi-image upload needs Irys/IPFS storage strategy research (batch upload, gallery component, required angle validation).
- **Phase 4 (Mainnet Deployment):** Anchor mainnet deployment with Squads upgrade authority transfer needs step-by-step testing on devnet first.

Phases with standard patterns (skip research):
- **Phase 1 (Environment Hardening):** Well-documented pattern -- centralized config module, env var validation, dependency cleanup. No unknowns.
- **Phase 5 (Post-Launch):** Standard patterns for RPC failover, Redis caching, and feature iteration.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack is validated on devnet; production additions (Sentry, priority fees) are industry standard with official docs. |
| Features | HIGH | Cross-referenced 6+ competitors (Chrono24, Kettle, Courtyard, 4K, eBay, Bob's Watches); luxury watch marketplace feature expectations are well-documented. |
| Architecture | HIGH | Based on direct codebase analysis plus official Solana/Vercel/MongoDB docs; data flow patterns verified against existing code. |
| Pitfalls | HIGH | Devnet fallback pattern confirmed via codebase grep (35+ instances); security pitfalls validated against Sec3's 2025 Solana audit data (163 audits analyzed). |

**Overall confidence:** HIGH

### Gaps to Address

- **Anchor program audit scope:** Automated tools (clippy, cargo audit) catch surface issues but not business logic vulnerabilities. The professional audit cost ($15-20K) and timeline (2-4 weeks) need to be factored into post-launch budget. Mitigated by capping escrow amounts initially.
- **Irys devnet-to-mainnet metadata migration:** Unclear whether existing devnet NFT metadata URLs will resolve on mainnet. Arweave gateway URLs may be network-agnostic, but this needs testing. If not, all existing test NFTs need re-minting on mainnet anyway.
- **Helius plan scaling threshold:** Developer plan (50 RPS) is sufficient for soft launch but the exact traffic threshold for upgrading to Business ($499/mo) is unknown. Monitor RPC 429 errors post-launch.
- **JC Gold USDC off-ramp:** Vendor expects USDC payouts but may need guidance on converting to fiat. Research Coinbase Commerce or similar off-ramp options for vendor documentation.
- **Dispute auto-escalation cron:** `enforce-timeouts.ts` exists but Vercel cron configuration is not set up. Needs implementation during Phase 4.

## Sources

### Primary (HIGH confidence)
- LuxHub codebase analysis -- 35+ devnet fallback patterns, 100+ API routes, 29 Mongoose models audited
- [Solana Program Security Checklist](https://dev.to/ohmygod/solana-program-security-checklist-14-critical-checks-before-you-deploy-to-mainnet-2d66)
- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) -- Pages Router setup
- [Solana Priority Fees Guide](https://solana.com/developers/guides/advanced/how-to-use-priority-fees)
- [Helius Pricing and RPC Docs](https://www.helius.dev/pricing)
- [Vercel Serverless Connection Pooling](https://vercel.com/guides/connection-pooling-with-serverless-functions)

### Secondary (MEDIUM confidence)
- [Kettle Finance Analysis](https://alearesearch.substack.com/p/kettle-luxury-watch-rwa-trading-what) -- Web3 luxury watch competitor model
- [Sec3 Solana Security Ecosystem 2025](https://solanasec25.sec3.dev/) -- 163 audits, vulnerability distribution data
- [Solana RWA Report Q4 2025](https://blog.redstone.finance/2025/09/29/solana-rwa/) -- $873M tokenized assets on Solana
- [Chrono24 Certified Program](https://about.chrono24.com/en/press/chrono24-debuts-new-certified-program-providing-transparency-and-an-authenticity-guarantee-to-the-worlds-largest-selection-of-pre-owned-watches)
- [Smart Contract Audit Pricing 2026](https://www.zealynx.io/blogs/audit-pricing-2026) -- $7K-$20K for simple programs

### Tertiary (LOW confidence)
- Monthly cost estimates for Atlas M10 tier -- depends on region and actual usage patterns
- Bundle size savings from dependency removal -- needs verification that none are imported before removing
- Irys mainnet upload costs (~$0.001/KB) -- depends on Arweave token price at time of upload

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
