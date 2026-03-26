# Roadmap: LuxHub

## Milestones

- ✅ **v1.0 Launch Readiness** — Phases 1-5 (shipped 2026-03-23)
- 🚧 **v1.1 Mainnet & Pools** — Phases 5.1, 6-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Launch Readiness (Phases 1-5) — SHIPPED 2026-03-23</summary>

- [x] Phase 1: Core Marketplace Flows (3/3 plans) — completed 2026-03-19
- [x] Phase 2: Security and Notification Hardening (4/4 plans) — completed 2026-03-20
- [x] Phase 2.1: Tokenomics & Multi-Treasury (4/4 plans) — completed 2026-03-21
- [x] Phase 3: Marketplace UX (4/4 plans) — completed 2026-03-21
- [x] Phase 4: Vendor Demo Readiness (3/3 plans) — completed 2026-03-22
- [x] Phase 5: Mobile Polish & Verification (2/2 plans) — completed 2026-03-23

</details>

### 🚧 v1.1 Mainnet & Pools (In Progress)

**Milestone Goal:** Deploy to mainnet, validate all on-chain flows with real SOL, get pool tokenization fully working end-to-end, and polish UX for production users.

- [ ] **Phase 5.1: Anchor Program Security Hardening** (INSERTED) - Fix critical/high vulnerabilities from pre-mainnet audit: PDA-derived vaults, seller!=buyer guard, fee_bps cap, Squads CPI gate fix, account close constraints, confirm_delivery test coverage
- [ ] **Phase 6: Mainnet Deployment & Production Ops** - Deploy Anchor program, switch all infra to mainnet, configure production monitoring and automation
- [ ] **Phase 7: On-Chain Flow Validation** - Verify buy, delivery, and notification flows work with real SOL on mainnet
- [ ] **Phase 8: Pool Lifecycle** - Validate full pool tokenization from launch through graduation to distribution on mainnet
- [ ] **Phase 9: Offer UX & UI Polish** - Countdown timers on offers, landing page refresh, navbar reorganization
- [ ] **Phase 10: AI Bulk Inventory Upload** - AI-powered CSV parsing, image analysis, admin review queue, batch minting

## Phase Details

### Phase 5.1: Anchor Program Security Hardening
**Goal**: All critical and high-severity vulnerabilities in the Anchor escrow program are fixed, tested, and verified before mainnet deployment
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: Security audit findings (C-1, C-2, H-1, H-2, H-3, H-4, H-5)
**Success Criteria** (what must be TRUE):
  1. Vault accounts (nft_vault, wsol_vault) are PDA-derived ATAs of the escrow, not arbitrary keypairs
  2. `exchange` instruction rejects seller == buyer (self-purchase guard)
  3. `initialize_config` enforces fee_bps <= 1000
  4. `confirm_delivery` via Squads CPI is tested and working on devnet
  5. Escrow, nft_vault, and wsol_vault are closed after `confirm_delivery` and `refund_buyer` (rent reclaimed)
  6. `RefundBuyer` state checks moved to account constraints
  7. `close_config` uses proper Anchor account type with discriminator check
  8. `confirm_delivery` and `refund_buyer` have passing test coverage
  9. Leaked Alchemy API key rotated, stale `anchor_escrow.json` removed
  10. `confirm-delivery.ts` API has on-chain TX verification and correct mint ordering
**Plans:** 3 plans

Plans:
- [ ] 05.1-01-PLAN.md — Fix all Rust security vulnerabilities, regenerate IDL, cleanup stale files
- [ ] 05.1-02-PLAN.md — Rewrite Anchor test suite for new vault pattern and security guards
- [ ] 05.1-03-PLAN.md — Update API routes and Squads service for new account layout

### Phase 6: Mainnet Deployment & Production Ops
**Goal**: The platform is running on mainnet with all infrastructure configured and monitored
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: MN-01, MN-02, MN-03, MN-04, MN-05, MN-06, MN-07, OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, INFRA-01
**Success Criteria** (what must be TRUE):
  1. Anchor program is deployed on mainnet-beta and EscrowConfig PDA is initialized with correct treasury/fee settings
  2. All Vercel environment variables point to mainnet (RPC, program ID, Irys, treasury wallets) and the app loads without errors
  3. Squads multisig and Bags partner config PDA exist on mainnet
  4. Sec3 X-ray scan completes with no critical findings on the deployed program
  5. Vercel cron fires enforce-timeouts on schedule, Sentry alerts are configured, RPC failover is active, and Dependabot is enabled
**Plans:** 4 plans

Plans:
- [ ] 06-01-PLAN.md — Deploy Anchor program to mainnet, initialize EscrowConfig, Squads multisig, Bags partner config PDA
- [ ] 06-02-PLAN.md — Production ops: Vercel cron, Dependabot, enforce-timeouts auth update
- [ ] 06-03-PLAN.md — Cloudflare R2 migration replacing IBM COS for avatar/banner uploads
- [ ] 06-04-PLAN.md — Vercel env var cutover to mainnet, Sentry alerts, RPC backup, final verification

### Phase 7: On-Chain Flow Validation
**Goal**: A buyer can purchase a listing and receive delivery confirmation with real SOL on mainnet, with the full 97/3 split verified on-chain
**Depends on**: Phase 6
**Requirements**: TX-01, TX-02, TX-03, TX-04, TX-05
**Success Criteria** (what must be TRUE):
  1. Buyer can purchase a listing with SOL (via Jupiter swap) on mainnet and the escrow PDA shows funded with USDC
  2. Buyer can purchase a listing with direct USDC on mainnet and the escrow PDA shows funded
  3. Admin can confirm delivery via Squads multisig and the 97/3 fund split is verified on-chain (Solana explorer)
  4. Email notifications fire at each lifecycle step (funded, shipped, delivered, released) on mainnet transactions
  5. Dropped transactions are retried with fresh blockhash instead of silently failing
**Plans**: TBD

### Phase 8: Pool Lifecycle
**Goal**: Users can participate in pool tokenization from launch through graduation to distribution on mainnet
**Depends on**: Phase 7
**Requirements**: POOL-01, POOL-02, POOL-03, POOL-04, POOL-05, POOL-06, UI-03, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Admin can tokenize a watch via Bags API on mainnet and the bonding curve is active for trading
  2. Users can buy and sell pool tokens on the bonding curve, and the pool graduates to Jupiter DEX when threshold is met
  3. Post-graduation trading works via Bags DEX (buy/sell tokens after graduation)
  4. Resale distribution sends proceeds proportionally to all token holders and the pool closes
  5. Pool detail page shows a visual lifecycle timeline indicating current stage (launch, funding, graduation, trading, distribution)
**Plans**: TBD
**UI hint**: yes

### Phase 9: Offer UX & UI Polish
**Goal**: The marketplace feels production-ready with urgency-driven offer UX and a refreshed public-facing presence
**Depends on**: Phase 7
**Requirements**: OFFER-01, OFFER-02, OFFER-03, OFFER-04, UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Offer cards show live countdown timers (e.g., "Expires in 18h 32m") and accepted offers show payment deadline countdown
  2. Buyer can withdraw from an accepted offer via a UI button on the orders page
  3. Offers expiring within 4 hours show amber badges, within 1 hour show red badges
  4. Landing page showcases platform features with vendor/buyer CTAs and current stats
  5. Navbar dropdown prioritizes orders and notifications, with pages grouped by user role
**Plans**: TBD
**UI hint**: yes

### Phase 10: AI Bulk Inventory Upload
**Goal**: Vendors can upload their inventory in any CSV format with images and AI transforms it into mint-ready NFT listings for admin review and batch minting
**Depends on**: Phase 7 (needs mainnet minting working)
**Requirements**: BULK-01, BULK-02, BULK-03, BULK-04, BULK-05
**Success Criteria** (what must be TRUE):
  1. Vendor uploads a CSV with non-standard column names (e.g., "Watch Name", "Ref #") and AI correctly maps fields to LuxHub NFT template
  2. Vendor uploads watch images and AI auto-fills brand, model, condition, and estimated price for each
  3. Parsed inventory appears in admin review queue where admin can approve, edit, or reject individual items
  4. Admin can select approved items and mint them all in one batch operation
  5. Vendor can upload an image folder and AI matches images to CSV rows by filename or description
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5.1 → 6 → 7 → 8/9/10 (8, 9, and 10 can run in parallel after Phase 7)
(Phase 5.1 MUST complete before Phase 6 — security hardening before mainnet deploy)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Marketplace Flows | v1.0 | 3/3 | Complete | 2026-03-19 |
| 2. Security & Notification Hardening | v1.0 | 4/4 | Complete | 2026-03-20 |
| 2.1 Tokenomics & Multi-Treasury | v1.0 | 4/4 | Complete | 2026-03-21 |
| 3. Marketplace UX | v1.0 | 4/4 | Complete | 2026-03-21 |
| 4. Vendor Demo Readiness | v1.0 | 3/3 | Complete | 2026-03-22 |
| 5. Mobile Polish & Verification | v1.0 | 2/2 | Complete | 2026-03-23 |
| 5.1 Anchor Security Hardening | v1.1 | 1/3 | Executing | - |
| 6. Mainnet Deployment & Production Ops | v1.1 | 0/4 | Planning | - |
| 7. On-Chain Flow Validation | v1.1 | 0/? | Not started | - |
| 8. Pool Lifecycle | v1.1 | 0/? | Not started | - |
| 9. Offer UX & UI Polish | v1.1 | 0/? | Not started | - |
| 10. AI Bulk Inventory Upload | v1.1 | 0/? | Not started | - |

---
*Full v1.0 details: .planning/milestones/v1.0-ROADMAP.md*
