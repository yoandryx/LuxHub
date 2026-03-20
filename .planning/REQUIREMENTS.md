# Requirements: LuxHub Launch Readiness

**Defined:** 2026-03-18
**Core Value:** Every purchase is protected by on-chain escrow — funds held in PDA until buyer confirms delivery, then split 97% vendor / 3% treasury automatically.

## v1 Requirements

Requirements for launch readiness. Each maps to roadmap phases.

### Flow Testing & Validation

- [x] **FLOW-01**: Buyer can browse marketplace, click Buy, pay with USDC, and escrow status changes to funded
- [x] **FLOW-02**: Buyer can browse marketplace, click Buy, pay with SOL (Jupiter swap), and escrow status changes to funded
- [x] **FLOW-03**: Vendor receives notification when order is funded and can view order in vendor dashboard
- [x] **FLOW-04**: Vendor can submit shipment with tracking info and buyer receives shipping notification
- [x] **FLOW-05**: Buyer can confirm delivery and funds are released (97% vendor, 3% treasury)
- [x] **FLOW-06**: Buyer can make offer on a listing and vendor receives offer notification
- [x] **FLOW-07**: Vendor can accept, reject, or counter an offer from vendor dashboard
- [x] **FLOW-08**: Buyer can respond to counter-offer (accept, reject, counter again)
- [x] **FLOW-09**: When offer is accepted, buyer can pay within 24h deadline and escrow becomes funded
- [x] **FLOW-10**: Other buyers' offers are auto-rejected when item is purchased, and they are notified
- [x] **FLOW-11**: Vendor can onboard through 3-step wizard and admin can approve/reject
- [x] **FLOW-12**: Approved vendor can list watches with images and metadata from vendor dashboard
- [x] **FLOW-13**: Vendor dashboard shows orders tab and offers tab with real data and actions
- [x] **FLOW-14**: Buyer orders page shows all orders with status, tracking, and action buttons
- [x] **FLOW-15**: Pool token launch flow works (tokenize watch → bonding curve trading → fee share distribution)
- [x] **FLOW-16**: Pool trading (buy/sell on bonding curve) reflects accurate pricing and balances
- [x] **FLOW-17**: Notification bell shows unread count and notification list displays all lifecycle events

### Security Hardening

- [x] **SEC-01**: All Solana connections use centralized cluster config — no hardcoded devnet fallbacks
- [ ] **SEC-02**: `_app.tsx` network selection is environment-driven (not hardcoded Devnet)
- [x] **SEC-03**: TX verification validates program called, amount transferred, correct USDC mint, and escrow PDA destination
- [x] **SEC-04**: TX verification prevents replay attacks (processed txSignatures stored and checked)
- [x] **SEC-05**: Sentry error monitoring configured with DSN, source maps, and alerting
- [ ] **SEC-06**: Priority fee logic added to all fund-moving transactions for mainnet readiness
- [x] **SEC-07**: Rate limiting applied to `/api/pool/invest` and `/api/pool/buy-resale`
- [ ] **SEC-08**: RPC connection fails loudly with clear error when endpoint env var is missing (no silent devnet fallback)

### Notification Fixes

- [x] **NOTF-01**: Dispute creation notifies admins with correct notification type (not `shipment_submitted`)
- [ ] **NOTF-02**: Auto-rejected offers notify affected buyers with reason
- [x] **NOTF-03**: Vendor delist requests notify admins
- [x] **NOTF-04**: Shipment proof submission notifies admins for verification queue
- [x] **NOTF-05**: Email delivery works end-to-end via Resend — purchase confirmation, offer updates, shipping, and delivery emails arrive in user's inbox
- [ ] **NOTF-06**: Email templates render correctly with LuxHub branding, action URLs, and correct data for each notification type

### Marketplace UX

- [ ] **UX-01**: Multi-image gallery per listing (5+ photos stored in Asset doc, displayed on listing page alongside NFT primary image)
- [ ] **UX-02**: Standardized condition grading dropdown (Unworn, Excellent, Very Good, Good, Fair) with defined criteria
- [ ] **UX-03**: Search by brand name and model on marketplace page
- [ ] **UX-04**: Filter listings by price range and condition grade
- [ ] **UX-05**: All modals (BuyModal, MakeOfferModal) work correctly on mobile devices
- [ ] **UX-06**: Marketplace, orders, and vendor dashboard are mobile-responsive

### Vendor Demo Readiness (JC Gold Miami Trip)

- [ ] **VEND-01**: Vendor onboarding flow is polished and demo-ready for in-person walkthrough
- [ ] **VEND-02**: Vendor can list a watch with multi-image gallery, condition grade, and pricing
- [ ] **VEND-03**: Vendor can convert a listing to a pool token via Bags integration
- [ ] **VEND-04**: Vendor dashboard clearly shows pending orders, active offers, and payout history
- [ ] **VEND-05**: Admin can approve vendor and manage listings in admin dashboard

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Post-Launch Features

- **POST-01**: Buyer-facing authentication record display (serial number photos, certificate uploads)
- **POST-02**: Buyer protection / guarantee policy page with escrow terms and inspection window
- **POST-03**: On-chain provenance trail viewer using Helius DAS data
- **POST-04**: Advanced search filters (case size, material, movement type, year)
- **POST-05**: Vendor reputation scores based on completed transactions
- **POST-06**: Wishlist / price alert notifications
- **POST-07**: Professional smart contract security audit

### Mainnet Deployment (Separate Milestone)

- **MAIN-01**: Deploy Anchor program to mainnet-beta
- **MAIN-02**: Initialize EscrowConfig on mainnet (treasury, authority, fee_bps)
- **MAIN-03**: Transfer upgrade authority to Squads multisig
- **MAIN-04**: Create Bags partner config PDA on mainnet
- **MAIN-05**: Switch Irys to mainnet storage
- **MAIN-06**: Fund treasury wallet
- **MAIN-07**: Add second Squads co-signer
- **MAIN-08**: Upgrade Helius to paid plan
- **MAIN-09**: Configure Vercel cron for timeout enforcement

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fiat on-ramp (Stripe/MoonPay) | Regulatory complexity, KYC burden — crypto-native for v1 |
| Real-time WebSocket notifications | Polling sufficient; transactions take days (shipping) |
| Built-in chat/messaging | Structured offers handle negotiation; moderation burden |
| Full KYC/identity verification | Overkill at 1-vendor scale; admin verification sufficient |
| Multi-chain support | Fragments liquidity; Solana-only and execute well |
| Auction system | Luxury watches trade via fixed price + negotiation, not auctions |
| Native mobile app | PWA/responsive web covers 90% of use cases |
| Watch price index | Needs 100+ transactions for meaningful data |
| Social features (follows, likes) | Feature creep; forums serve this need |
| Securities language in UI | Legal compliance — no "invest", "shares", "ROI", "profit" anywhere |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-01 | Phase 1 | Complete |
| FLOW-02 | Phase 1 | Complete |
| FLOW-03 | Phase 1 | Complete |
| FLOW-04 | Phase 1 | Complete |
| FLOW-05 | Phase 1 | Complete |
| FLOW-06 | Phase 1 | Complete |
| FLOW-07 | Phase 1 | Complete |
| FLOW-08 | Phase 1 | Complete |
| FLOW-09 | Phase 1 | Complete |
| FLOW-10 | Phase 1 | Complete |
| FLOW-11 | Phase 1 | Complete |
| FLOW-12 | Phase 1 | Complete |
| FLOW-13 | Phase 1 | Complete |
| FLOW-14 | Phase 1 | Complete |
| FLOW-15 | Phase 1 | Complete |
| FLOW-16 | Phase 1 | Complete |
| FLOW-17 | Phase 1 | Complete |
| SEC-01 | Phase 2 | Complete |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 2 | Complete |
| SEC-04 | Phase 2 | Complete |
| SEC-05 | Phase 2 | Complete |
| SEC-06 | Phase 2 | Pending |
| SEC-07 | Phase 2 | Complete |
| SEC-08 | Phase 2 | Pending |
| NOTF-01 | Phase 2 | Complete |
| NOTF-02 | Phase 2 | Pending |
| NOTF-03 | Phase 2 | Complete |
| NOTF-04 | Phase 2 | Complete |
| NOTF-05 | Phase 2 | Complete |
| NOTF-06 | Phase 2 | Pending |
| UX-01 | Phase 3 | Pending |
| UX-02 | Phase 3 | Pending |
| UX-03 | Phase 3 | Pending |
| UX-04 | Phase 3 | Pending |
| UX-05 | Phase 3 | Pending |
| UX-06 | Phase 3 | Pending |
| VEND-01 | Phase 4 | Pending |
| VEND-02 | Phase 4 | Pending |
| VEND-03 | Phase 4 | Pending |
| VEND-04 | Phase 4 | Pending |
| VEND-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap phase mapping*
