# LuxHub — The Luxury Protocol on Solana

## What This Is

A decentralized marketplace for luxury physical assets (watches, jewelry, collectibles) on Solana. NFT-backed real-world assets with verified provenance, on-chain escrow, vendor verification, fractional ownership pools via Bags, and Squads-secured treasury. LuxHub bridges traditional luxury dealers into crypto (RWA listings) and gives crypto natives access to real assets that hold value.

## Core Value

Every purchase is protected by on-chain escrow — funds are held in a PDA until the buyer confirms delivery, then split 97% vendor / 3% treasury automatically. No one can steal funds, not even LuxHub.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Existing in codebase. -->

- ✓ NFT minting with IPFS/Irys metadata storage — existing
- ✓ On-chain escrow with Anchor smart contracts (initialize, exchange, confirm_delivery, cancel, refund) — existing
- ✓ Vendor verification and 3-step onboarding wizard — existing
- ✓ Admin dashboard with role-based access and escrow management — existing
- ✓ Marketplace UI with 3D visualization and glass-morphism design — existing
- ✓ Price display toggle (SOL/USD) via Pyth oracle — existing
- ✓ Direct buy flow (USDC or SOL→USDC via Jupiter swap) — existing
- ✓ Offer system with counter-negotiation (create, accept, reject, counter, buyer-respond) — existing
- ✓ 17 notification types with Resend email delivery and user preferences — existing
- ✓ Transaction verification on all fund-moving endpoints — existing
- ✓ Squads Protocol multisig integration (proposal, execute, sync) — existing
- ✓ Bags API integration (token launch, bonding curve trading, fee share) — existing
- ✓ Helius DAS API integration (asset indexing, token holders, NFT metadata) — existing
- ✓ JWT + wallet signature authentication — existing
- ✓ PII encryption (AES-256-GCM) for shipping addresses — existing
- ✓ Rate limiting on critical endpoints — existing
- ✓ Buyer dispute/refund system with 7-day SLA — existing
- ✓ Escrow timeout enforcement (14-day auto-cancel) — existing
- ✓ AI watch analysis for auto-filling mint forms — existing
- ✓ Shipping integration with EasyPost — existing
- ✓ Pool governance (proposals, voting, member list) — existing
- ✓ Public user/vendor profiles with on-chain NFT holdings — existing

### Active

<!-- Current scope. Building toward these for launch. -->

- [ ] Full buy flow tested end-to-end (browse → buy → escrow funded → ship → deliver → funds released)
- [ ] Full offer flow tested end-to-end (offer → accept/counter → pay → ship → deliver)
- [ ] Pool/Bags token launch flow tested (tokenize watch → bonding curve → fee share)
- [ ] Vendor onboarding flow tested (JC Gold → admin approve → list inventory → sell)
- [ ] Notification delivery verified at every lifecycle step
- [ ] Buyer orders page functional with real data
- [ ] Vendor dashboard orders/offers tabs with real data
- [ ] Edge case handling (expired offers, disconnected wallet, double-purchase, timeout enforcement)
- [ ] Notification gaps fixed (auto-rejected offers, delist admin notify, dispute type bug)
- [ ] Mainnet network switch (5 hardcoded devnet references)
- [ ] Sentry error monitoring enabled
- [ ] Irys storage switched to mainnet
- [ ] Rate limiting added to pool fund endpoints
- [ ] RPC fallback fails loudly instead of silent devnet fallback
- [ ] Admin shipment verification queue works at scale
- [ ] Squads multisig proposal → approve → execute tested end-to-end
- [ ] Mobile responsive testing on all modals and flows
- [ ] Multi-vendor support validated (onboard vendor #2 after JC Gold)

### Out of Scope

- Enhanced KYC flow — direct vendor relationships for now
- Backpack Bags wallet sessions — deferred
- Real-time WebSocket notifications — polling is sufficient for launch
- Fiat on-ramp (Stripe) — crypto-only for v1
- Mobile native app — web-first, mobile responsive
- International expansion — US market first
- Advanced analytics dashboards — basic admin stats sufficient

## Context

- **First vendor:** JC Gold Jewelers (Miami, FL) — 10 watches ready, crypto-friendly, payouts in USDC
- **Hackathon:** Bags hackathon submitted (DeFi category), judges can review anytime
- **Domain:** luxhub.gold (primary), notifications@luxhub.gold via Resend
- **Cluster:** Currently devnet, targeting mainnet-beta
- **Treasury:** CsEbhhe4PtC5pumcJoe8RWnzLgtojioqFdXFWJGJDHCZ (0 SOL on mainnet)
- **Program ID:** kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj (devnet)
- **Testing wallets:**
  - Vendor: 5FqmUoj9ZszHztsqr8abSapeNcAvzDSR7jcVjAeK3AkD
  - Buyer/Admin: 6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X
  - Treasury: CsEbhhe4PtC5pumcJoe8RWnzLgtojioqFdXFWJGJDHCZ
- **Codebase:** ~100+ API endpoints, 29 Mongoose models, 14 marketplace components, 17 notification types
- **Solo developer** building full-stack + smart contracts
- **Legal:** Never use "fractional ownership", "shares", "invest", "ROI", "profit" — compliance language

## Constraints

- **Solo dev**: One person building everything — phases must be sequential and focused
- **Vendor waiting**: JC Gold has 10 watches ready — demo/testing flows must be prioritized
- **Hackathon live**: Judges can review anytime — core flows must work NOW on devnet
- **Budget**: Minimize mainnet SOL costs (treasury needs funding for partner config PDA, program deploy)
- **Tech stack**: Next.js 14 pages router, Anchor 0.31.0, MongoDB — no migrations mid-launch
- **Compliance**: RWA marketplace must avoid securities language (no "invest", "shares", "ROI")
- **Storage**: Irys for permanent storage (NOT Pinata), Pinata gateway URLs for display only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| USDC as payment token | Vendors need stable payouts, no volatility risk | ✓ Good |
| Squads multisig for treasury | Institutional-grade security, required for trust | ✓ Good |
| Bags for pool tokenization | Hackathon partner, bonding curves built-in, fee share | ✓ Good |
| Irys over Pinata for storage | Permanent on-chain storage, Arweave-backed | ✓ Good |
| Pages router (not App Router) | Stability over features, too late to migrate | ✓ Good |
| Devnet testing first | Validate all flows before spending mainnet SOL | — Pending |
| Hackathon demo then mainnet | Two-phase approach: prove it works, then launch | — Pending |

---
*Last updated: 2026-03-18 after GSD initialization*
