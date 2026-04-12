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

- [x] **Phase 5.1: Anchor Program Security Hardening** (INSERTED) - Fix critical/high vulnerabilities from pre-mainnet audit: PDA-derived vaults, seller!=buyer guard, fee_bps cap, Squads CPI gate fix, account close constraints, confirm_delivery test coverage
- [x] **Phase 6: Mainnet Deployment & Production Ops** - Deploy Anchor program, switch all infra to mainnet, configure production monitoring and automation
- [x] **Phase 7: On-Chain Flow Validation** - Verify buy, delivery, and notification flows work with real SOL on mainnet
- [x] **Phase 9: Offer UX & UI Polish** - Countdown timers on offers, offer confirm_delivery flow, landing page refresh, navbar reorganization
- [ ] **Phase 10: AI Bulk Inventory Upload** - AI-powered CSV parsing, image analysis, admin review queue, batch minting
- [~] **Phase 8: Pool Lifecycle** — **SUPERSEDED BY PHASE 11** (see 2026-04-10 decision). Phase 8's code is treated as scaffolding to be rewired by phase 11; phase 8 will NOT execute on mainnet as originally scoped.
- [ ] **Phase 11: Pool Fee-Funded Rewire** - Canonical pool lifecycle execution. Replaces phase 8. Fee-driven graduation via cumulative Bags trading fees accumulated to Pools Treasury, vendor payout gated by existing marketplace escrow `confirm_delivery`, Helius DAS holder snapshot at resale, claimable distribution with 90-day graceful expiry.

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
**Plans:** 4 plans (3 complete + 1 gap closure)

Plans:
- [x] 05.1-01-PLAN.md — Fix all Rust security vulnerabilities, regenerate IDL, cleanup stale files
- [x] 05.1-02-PLAN.md — Rewrite Anchor test suite for new vault pattern and security guards
- [x] 05.1-03-PLAN.md — Update API routes and Squads service for new account layout
- [x] 05.1-04-PLAN.md — Gap closure: confirm_delivery happy-path test + API TX verification

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
- [x] 06-01-PLAN.md — Deploy Anchor program to mainnet, initialize EscrowConfig, Squads multisig, Bags partner config PDA
- [x] 06-02-PLAN.md — Production ops: Vercel cron, Dependabot, enforce-timeouts auth update
- [x] 06-03-PLAN.md — Cloudflare R2 migration replacing IBM COS for avatar/banner uploads
- [x] 06-04-PLAN.md — Vercel env var cutover to mainnet, Sentry alerts, RPC backup, final verification

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
**Plans:** 2 plans

Plans:
- [ ] 07-01-PLAN.md — Auto-approve env toggle, retry with escalating priority fees, unit tests
- [ ] 07-02-PLAN.md — Integrate sendWithRetry into Squads service, mainnet end-to-end validation

### Phase 8: Pool Lifecycle (SUPERSEDED BY PHASE 11 — 2026-04-10)

**Status:** Scaffolding only. Phase 8's plans built code that implements an incompatible tokenomics model (Bags-DBC graduation + Squad DAO from top holders) which conflicts with the canonical `LuxHub_Pool_Lifecycle_Workflow.pdf` (2026-04-02) + `.claude/docs/bags_tokenomics_flow.md` (rewritten 2026-04-10). Phase 11 inherits POOL-01 through POOL-06 requirements and rewires phase 8's existing files in-place. Phase 8 will NOT execute as originally scoped on mainnet.

**Original phase 8 definition (retained for context):**


**Goal**: Users can participate in pool tokenization from launch through graduation to distribution on mainnet
**Depends on**: Phase 7
**Requirements**: POOL-01, POOL-02, POOL-03, POOL-04, POOL-05, POOL-06, UI-03, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Admin can tokenize a watch via Bags API on mainnet and the bonding curve is active for trading
  2. Users can buy and sell pool tokens on the bonding curve, and the pool graduates to Jupiter DEX when threshold is met
  3. Post-graduation trading works via Bags DEX (buy/sell tokens after graduation)
  4. Resale distribution sends proceeds proportionally to all token holders and the pool closes
  5. Pool detail page shows a visual lifecycle timeline indicating current stage (launch, funding, graduation, trading, distribution)
**Plans:** 4 plans

Plans:
- [x] 08-01-PLAN.md — Backend APIs: claim distribution, reconciliation cron, listing removal, MongoDB indexes
- [x] 08-02-PLAN.md — Pool detail page with lifecycle stepper, trade widget, chart, position summary, claim panel
- [x] 08-03-PLAN.md — Pool creation stepper, vendor pool initiation, pool management dashboard
- [x] 08-04-PLAN.md — Build validation, redirect wiring, and human verification of pool lifecycle

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
**Plans:** 3 plans

Plans:
- [x] 09-01-PLAN.md — Countdown timers, urgency badges, and withdraw button on offer cards + urgency banner on Orders page
- [x] 09-02-PLAN.md — Wallet awareness layer on landing page
- [x] 09-03-PLAN.md — Role-adaptive navbar and sectioned dropdown menu

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
**Plans:** 2/4 plans executed

Plans:
- [x] 10-01-PLAN.md — Model extension + AI API endpoints (map-csv, analyze-batch) + bulk upload/submit/batch-mint APIs
- [x] 10-02-PLAN.md — Vendor bulk upload page with 4-step wizard (CSV, mapping preview, images, review+submit)
- [ ] 10-03-PLAN.md — Admin batch review and batch mint UI in MintRequestsPanel
- [ ] 10-04-PLAN.md — Build validation and end-to-end flow verification (human checkpoint)

### Phase 11: Pool Fee-Funded Rewire
**Goal**: Trading fees accumulated to Pools Treasury become the graduation trigger. When cumulative fees ≥ watch price, LuxHub pays the vendor 97% and takes 3% for treasury, vendor ships to LuxHub custody, LuxHub relists via marketplace escrow, and snapshot holders claim 97% of resale proceeds proportionally.
**Depends on**: Phase 8 (Pool Lifecycle baseline — phase 8 built the Bags-DBC-graduation model that this phase replaces)
**Why this phase exists**: Phase 8 implemented a pool feature where graduation fires on Bags DBC migration (volume-driven) and finalization creates a Squad DAO from top holders. The 2026-04-02 Pool Lifecycle PDF + `.claude/docs/bags_tokenomics_flow.md` (rewritten 2026-04-10) define a different contract: graduation is fee-driven (cumulative 1% creator fees routed to Pools Treasury must sum to the watch price), the NFT is paid for in full by trading volume, and holders are passive claimants at resale rather than DAO governors. This phase rewires the existing infrastructure to match that contract.
**UI hint**: Yes (pool detail page stepper + admin dashboard new states)
**Requirements**:
  - POOL-11-01: Helius webhook watches TREASURY_POOLS for incoming Bags fee transfers and attributes each deposit to a Pool by parsing the tx for `bagsTokenMint`
  - POOL-11-02: Pool model has `watchPriceUSD` (or `watchPriceLamports`) target and `accumulatedTradingFees` is the authoritative cumulative fee counter
  - POOL-11-03: Every fee-attribution update runs a graduation check; when cumulative ≥ target, fires a fee-funded graduation flow
  - POOL-11-04: Fee-funded graduation creates two Squads proposals — 97% × watch price → vendor wallet, 3% × watch price → LuxHub Treasury — and advances Pool state to `graduated`
  - POOL-11-05: Bags webhook `TOKEN_GRADUATED` event becomes informational-only (logged, no side-effect); Bags DBC migration and LuxHub fee graduation are independent
  - POOL-11-06: Pool state machine implements the 8-state PDF lifecycle (`pending → minted → funding → graduated → custody → resale_listed → resold → distributed`) and the reconcile-pools cron is updated to match
  - POOL-11-07: Admin confirm-custody endpoint moves NFT from vendor escrow to LuxHub custody wallet and advances state to `custody`
  - POOL-11-08: Admin list-resale endpoint lists the NFT via marketplace escrow at an admin-set resale price
  - POOL-11-09: Marketplace escrow completion on a pool-backed NFT creates a `PoolDistribution` record with a frozen holder snapshot fetched via Helius DAS `getTokenHolders`
  - POOL-11-10: Holders can claim their proportional share via a self-serve endpoint; each claim burns their tokens via SPL burn instruction
  - POOL-11-11: A daily Inngest cron sweeps `PoolDistribution` records older than 90 days with unclaimed balances to LuxHub Treasury
  - POOL-11-12: `/api/pool/finalize` + Squad-DAO-from-holders flow is deprecated or re-scoped — decided during `/gsd:discuss-phase 11`
  - POOL-11-13: Orphan Pool fields from the old fee-split model (`accumulatedHolderFees`, `accumulatedVendorFees`, `accumulatedTradeRewards`) are removed or migrated
  - POOL-11-14: Pool detail UI stepper reflects the 8-state lifecycle with funding progress based on `accumulatedTradingFees / watchPriceUSD`

**Success Criteria** (what must be TRUE):
  1. A test pool with a $100 `watchPriceUSD` target graduates automatically when `accumulatedTradingFees` reaches $100 — vendor receives 97% and LuxHub Treasury receives 3%, both via Squads proposals, with no admin intervention beyond Squads approval
  2. When Bags DBC graduates the same pool (PRE_GRAD → MIGRATED to DAMM v2), LuxHub logs the event but does NOT trigger any state change, vendor payout, or Squad DAO creation
  3. An admin can confirm custody and list a graduated pool's NFT for resale through the existing marketplace escrow, and the pool state advances to `resale_listed`
  4. When the NFT resells through marketplace escrow, a `PoolDistribution` record is created with a frozen holder snapshot pulled from Helius DAS, pre-populated with each holder's claimable amount based on their token balance at sale time
  5. Snapshot holders can call the claim endpoint and receive their proportional share of 97% of the resale price, with their tokens burned in the same transaction; LuxHub Treasury receives 3% upfront at resale completion
  6. Unclaimed `PoolDistribution` balances older than 90 days are swept to LuxHub Treasury by a daily cron with an audit trail in `TreasuryDeposit`
  7. The Pool detail page (`/pools/[id]`) displays the 8-state lifecycle stepper correctly across all states, with the "Funding" progress bar driven by `accumulatedTradingFees / watchPriceUSD`, and the "Distribution" state showing a claim button for eligible holders
  8. A reconciliation audit comparing Helius-attributed fees (authoritative) against Bags webhook `TRADE_EXECUTED` accumulation (secondary) shows less than 1% drift for a pool that has seen at least 20 trades
  9. All orphan Pool fields from the old fee-split model are either removed from the schema or explicitly marked deprecated in a migration note; the Bags webhook no longer writes to them

**Plans**: To be determined via `/gsd:discuss-phase 11` — expected ~6-8 plans grouped into waves:
  - Wave A: Helius fee attribution + Pool schema updates + state machine
  - Wave B: Fee-funded graduation flow + Squads proposals for vendor payout
  - Wave C: Custody transfer + resale listing wiring to marketplace escrow
  - Wave D: PoolDistribution enhancements + snapshot + claim endpoint + cron
  - Wave E: UI updates + cleanup of orphan fields + deprecation decisions

**Open discussion questions** (to resolve before planning):
  - What is the source of truth for `watchPriceUSD`? `selectedAssetId.priceUSD`, `pool.sharePriceUSD * totalShares`, or a new explicit field?
  - Fees arrive as SOL/USDC. Do we accumulate in USD (requiring price conversion at each fee arrival) or in the native unit (requiring a target conversion)? Either way: which price oracle?
  - When the vendor "converts listing to pool," where does the NFT physically live until fee graduation? Vendor wallet, vendor-specific escrow PDA, or a pending-pool escrow?
  - Keep the Squad-DAO-from-holders flow as an optional post-custody governance layer, or delete entirely?
  - Does the vendor payout need a `shipping_confirmed` gate before it releases, or does the Squads proposal fire immediately on fee graduation and trust the existing marketplace timeout/dispute system to enforce shipping?
  - Migration path for existing (phase-8-built) pools — if any exist in prod, do they get migrated to the new state machine, or are they grandfathered into the old flow?

## Progress

**Execution Order:**
Phases execute in order: 5.1 -> 6 -> 7 -> 9 -> 10 -> 11
(Phases 5.1/6/7/9 complete. Phase 10 next. Phase 11 final: canonical pool lifecycle, supersedes phase 8. Phase 8 scaffolding is rewired in-place by phase 11 and never executes as originally scoped.)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Marketplace Flows | v1.0 | 3/3 | Complete | 2026-03-19 |
| 2. Security & Notification Hardening | v1.0 | 4/4 | Complete | 2026-03-20 |
| 2.1 Tokenomics & Multi-Treasury | v1.0 | 4/4 | Complete | 2026-03-21 |
| 3. Marketplace UX | v1.0 | 4/4 | Complete | 2026-03-21 |
| 4. Vendor Demo Readiness | v1.0 | 3/3 | Complete | 2026-03-22 |
| 5. Mobile Polish & Verification | v1.0 | 2/2 | Complete   | 2026-03-26 |
| 5.1 Anchor Security Hardening | v1.1 | 4/4 | Complete | 2026-03-26 |
| 6. Mainnet Deployment & Production Ops | v1.1 | 4/4 | Complete | 2026-03-28 |
| 7. On-Chain Flow Validation | v1.1 | 2/2 | Complete | 2026-03-29 |
| 9. Offer UX & UI Polish | v1.1 | 3/3 | Complete | 2026-03-29 |
| 10. AI Bulk Inventory Upload | v1.1 | 2/4 | In Progress|  |
| 8. Pool Lifecycle | v1.1 | — | Superseded by 11 | - |
| 11. Pool Fee-Funded Rewire | v1.1 | 6/20 | In Progress|  |

---
*Full v1.0 details: .planning/milestones/v1.0-ROADMAP.md*
