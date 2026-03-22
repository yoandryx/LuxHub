# Roadmap: LuxHub Launch Readiness

## Overview

This milestone takes LuxHub from "code exists" to "every flow works end-to-end on devnet and is demo-ready for JC Gold." The codebase has 100+ API routes, 29 models, and a deployed Anchor program on devnet -- but no flow has been validated end-to-end with real wallet interactions. We test the core marketplace flows first (buy, offer, vendor, pools), then harden security and fix notification bugs, then add marketplace UX features that buyers need to trust a $5K+ purchase, then polish everything for the JC Gold vendor demo. Mainnet deployment is a separate milestone after this.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Core Marketplace Flows** - Validate every user flow end-to-end on devnet (buy, offer, vendor, pools, notifications)
- [ ] **Phase 2: Security and Notification Hardening** - Eliminate devnet fallbacks, harden TX verification, fix notification bugs, add monitoring
- [ ] **Phase 3: Marketplace UX** - Multi-image listings, condition grading, search/filter, mobile responsiveness
- [ ] **Phase 4: Vendor Demo Readiness** - Polish all flows for JC Gold in-person walkthrough

## Phase Details

### Phase 1: Core Marketplace Flows
**Goal**: Every marketplace user flow works end-to-end on devnet -- a buyer can purchase, an offer can be negotiated, a vendor can onboard and list, pools can be tokenized, and notifications fire at every lifecycle step
**Depends on**: Nothing (first phase)
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06, FLOW-07, FLOW-08, FLOW-09, FLOW-10, FLOW-11, FLOW-12, FLOW-13, FLOW-14, FLOW-15, FLOW-16, FLOW-17
**Success Criteria** (what must be TRUE):
  1. Buyer can browse marketplace, purchase a listing with USDC (or SOL via Jupiter swap), and see escrow status change to funded -- then vendor ships, buyer confirms delivery, and funds split 97/3
  2. Buyer can make an offer, vendor can accept/reject/counter, buyer can respond to counter, and accepted offer leads to funded escrow within 24h deadline
  3. Vendor can complete 3-step onboarding wizard, get admin-approved, and list a watch with images and metadata from vendor dashboard -- and vendor dashboard shows orders and offers tabs with real data
  4. Buyer orders page shows all orders with correct status, tracking info, and action buttons (confirm delivery, dispute)
  5. Pool token launch flow works (tokenize watch, bonding curve trading with accurate pricing, fee share distribution) and notification bell shows unread count with all lifecycle events
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Validate buy flow end-to-end (FLOW-01 to FLOW-05)
- [x] 01-02-PLAN.md -- Validate offer negotiation flow (FLOW-06 to FLOW-10)
- [x] 01-03-PLAN.md -- Validate vendor, pools, buyer orders, and notifications (FLOW-11 to FLOW-17)

### Phase 2: Security and Notification Hardening
**Goal**: The codebase is production-safe -- no silent devnet fallbacks, transaction verification catches spoofing and replay attacks, error monitoring catches failures, and every notification type fires correctly
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, NOTF-06
**Success Criteria** (what must be TRUE):
  1. All Solana connections use a centralized cluster config module -- removing the env var causes a loud failure, not a silent devnet fallback
  2. Transaction verification validates the correct program, transfer amount, USDC mint address, and escrow PDA destination -- and rejects replayed transaction signatures
  3. Sentry captures and alerts on errors in production, and all fund-moving transactions include priority fee logic
  4. Dispute creation, auto-rejected offers, vendor delist requests, and shipment proof submissions each trigger the correct notification to the correct recipient
  5. Email delivery works end-to-end via Resend — purchase, offer, shipping, and delivery emails arrive with correct LuxHub branding and action URLs
**Plans**: 4 plans

Plans:
- [ ] 02-00-PLAN.md -- Install Jest test infrastructure and create 8 test stub files (Wave 0)
- [ ] 02-01-PLAN.md -- Centralize Solana cluster config, chrome glass error page, and migrate all files (SEC-01, SEC-02, SEC-08)
- [ ] 02-02-PLAN.md -- Fix 4 notification bugs and verify email delivery (NOTF-01 through NOTF-06)
- [ ] 02-03-PLAN.md -- Enhanced TX verification, replay prevention, Sentry, priority fees, rate limiting (SEC-03 through SEC-07)

### Phase 02.1: Tokenomics & Multi-Treasury (INSERTED)

**Goal:** Full pool token lifecycle from tokenomics document is implemented -- 3 separate treasury wallets route revenue by source, fee-share config sends 100% to Pools Treasury, resale distribution pays all token holders proportionally and closes the pool, and the pool page shows position tracking with a legal-safe explainer
**Requirements**: TM-01, TM-02, TM-03, TM-04, TM-05
**Depends on:** Phase 02
**Success Criteria** (what must be TRUE):
  1. All fund-moving endpoints route fees to the correct treasury (Marketplace, Pools, or Partner) via a centralized config helper
  2. Bags fee-share config uses single claimer at 10,000 BPS (100% Pools Treasury) -- no vendor split on trading fees
  3. Post-graduation trading works via Bags DEX (webhook sets bondingCurveActive: false, component handles post-graduation UI)
  4. Resale distribution snapshots ALL token holders via paginated DAS, distributes 97% proportionally, and closes the pool (status=closed, tokenStatus=burned)
  5. Pool detail page shows YOUR POSITION (tokens, ownership %, cost basis, value, gain/loss), funding progress with %, and a collapsible HOW THIS WORKS 4-step explainer with legal-safe language
**Plans:** 4/4 plans complete

Plans:
- [ ] 02.1-01-PLAN.md -- Treasury config helper + fee-share change to 100% Pools Treasury (TM-01, TM-02)
- [ ] 02.1-02-PLAN.md -- Migrate 11 endpoints from NEXT_PUBLIC_LUXHUB_WALLET to multi-treasury (TM-01)
- [ ] 02.1-03-PLAN.md -- Resale distribution with paginated snapshot, state machine, pool closure (TM-03, TM-04)
- [ ] 02.1-04-PLAN.md -- Pool page UX: position tracking, funding progress, HOW THIS WORKS explainer (TM-05)

### Phase 3: Marketplace UX
**Goal**: The marketplace meets luxury buyer expectations -- multiple photos per listing, standardized condition grading, searchable inventory, and everything works on mobile
**Depends on**: Phase 1
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06
**Success Criteria** (what must be TRUE):
  1. Each listing displays a multi-image gallery (5+ photos) alongside the NFT primary image, with images stored in the Asset document
  2. Listings show a standardized condition grade (Unworn, Excellent, Very Good, Good, Fair) selected from a dropdown with defined criteria
  3. Buyer can search listings by brand name and model, and filter by price range and condition grade
  4. All modals (BuyModal, MakeOfferModal) and key pages (marketplace, orders, vendor dashboard) render correctly and are usable on mobile devices
**Plans**: 4 plans

Plans:
- [ ] 03-01-PLAN.md -- Condition grading enum update, migration, PriceRangeSlider, filter consolidation (UX-02, UX-04)
- [ ] 03-02-PLAN.md -- Image gallery and lightbox components, NftDetailCard integration, search integrity (UX-01, UX-03)
- [ ] 03-03-PLAN.md -- Multi-image upload zone with drag-and-drop reorder, createNFT integration (UX-01)
- [ ] 03-04-PLAN.md -- Mobile responsiveness: bottom sheet modals, FilterDrawer component, responsive layouts (UX-05, UX-06)

### Phase 4: Vendor Demo Readiness
**Goal**: Every flow is polished and demo-ready for an in-person walkthrough with JC Gold Jewelers in Miami -- vendor onboarding, listing creation, pool tokenization, dashboard management, and admin approval all work smoothly
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: VEND-01, VEND-02, VEND-03, VEND-04, VEND-05
**Success Criteria** (what must be TRUE):
  1. Vendor onboarding wizard is visually polished, handles edge cases gracefully, and can be walked through in-person without errors or confusing states
  2. Vendor can list a watch with multi-image gallery, condition grade, and pricing -- and convert that listing to a pool token via Bags integration
  3. Vendor dashboard clearly shows pending orders, active offers, and payout history with real data
  4. Admin can approve a vendor application and manage their listings from the admin dashboard without hitting errors
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md -- Vendor onboarding wizard polish: localStorage persistence, double-click protection, pending approval state (VEND-01)
- [ ] 04-02-PLAN.md -- Vendor dashboard tabs: chrome glass styling, count badges, empty states, loading states (VEND-04)
- [ ] 04-03-PLAN.md -- Listing progress overlay, vendor CTA hiding, admin approval polish, pool tokenization access (VEND-02, VEND-03, VEND-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 2.1 -> 3 -> 4
Note: Phase 3 depends on Phase 1 (not Phase 2), so Phases 2 and 3 could theoretically run in parallel if needed.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Marketplace Flows | 3/3 | Complete | 2026-03-19 |
| 2. Security and Notification Hardening | 0/4 | Not started | - |
| 2.1 Tokenomics & Multi-Treasury | 0/4 | Not started | - |
| 3. Marketplace UX | 0/4 | Not started | - |
| 4. Vendor Demo Readiness | 0/3 | Not started | - |
