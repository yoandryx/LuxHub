# Requirements: LuxHub v1.1 Mainnet & Pools

**Defined:** 2026-03-24
**Core Value:** Every purchase is protected by on-chain escrow — funds held in PDA until buyer confirms delivery, then split 97% vendor / 3% treasury automatically.

## v1.1 Requirements

Requirements for mainnet launch and pool feature completion. Each maps to roadmap phases.

### Mainnet Deployment

- [x] **MN-01**: Anchor program deployed to mainnet-beta with correct program ID in all config (Anchor.toml, env vars, frontend)
- [x] **MN-02**: EscrowConfig initialized on mainnet (treasury authority, fee_bps=300, Squads vault as treasury)
- [x] **MN-03**: Squads multisig created on mainnet with at least 1 member (2nd co-signer deferred if needed)
- [x] **MN-04**: All Vercel env vars switched to mainnet (SOLANA_NETWORK, RPC endpoint, PROGRAM_ID, Irys, treasury wallets)
- [x] **MN-05**: Irys configured for mainnet storage (IRYS_NETWORK=mainnet)
- [x] **MN-06**: Bags partner config PDA created on mainnet
- [x] **MN-07**: Sec3 X-ray automated security scan run on deployed program with no critical findings

### On-Chain Flow Validation

- [ ] **TX-01**: Buyer can purchase a listing with SOL via Jupiter swap on mainnet — escrow PDA funded with USDC, verified on-chain
- [ ] **TX-02**: Buyer can purchase a listing with direct USDC payment on mainnet — escrow funded, verified on-chain
- [ ] **TX-03**: Admin can confirm delivery via Squads multisig proposal — funds split 97% vendor / 3% treasury, verified on-chain
- [ ] **TX-04**: Notifications fire correctly at each lifecycle step (funded, shipped, delivered, released) on mainnet
- [ ] **TX-05**: Transaction retry logic handles mainnet congestion (dropped tx retried with updated blockhash)

### Pool Lifecycle

- [x] **POOL-01**: Admin can tokenize a watch via Bags API on mainnet (token launch → bonding curve active)
- [x] **POOL-02**: Users can buy/sell pool tokens on bonding curve with real SOL on mainnet
- [x] **POOL-03**: Pool graduation works on mainnet (bonding curve → Jupiter DEX transition)
- [x] **POOL-04**: Post-graduation trading works via Bags DEX (buy/sell tokens after graduation)
- [x] **POOL-05**: Resale distribution sends proceeds to all token holders proportionally and closes pool
- [x] **POOL-06**: Pool detail page shows lifecycle status (launch → funding → graduation → trading → distribution)

### Offer Management UX

- [x] **OFFER-01**: Offer cards show live countdown timer ("Expires in 18h 32m") instead of static date
- [x] **OFFER-02**: Accepted offers show payment deadline countdown ("24h to deposit funds")
- [x] **OFFER-03**: Buyer can withdraw from an accepted offer via UI button (wires existing buyer-respond API)
- [x] **OFFER-04**: Visual urgency badges on cards for items expiring within 4 hours (amber) and 1 hour (red)

### UI Polish

- [x] **UI-01**: Landing page refreshed with updated feature showcase, vendor/buyer CTAs, and current platform stats
- [x] **UI-02**: Navbar dropdown reorganized — orders and notifications prioritized, pages grouped by user role
- [x] **UI-03**: Pool lifecycle timeline visualization on pool detail page (visual progress indicator)

### Production Operations

- [x] **OPS-01**: Vercel cron configured to call enforce-timeouts every 6 hours (CRON_SECRET env var set)
- [x] **OPS-02**: Sentry alert rules configured (new issue → email, high frequency → urgent)
- [x] **OPS-03**: RPC failover configured (Alchemy or Chainstack as backup to Helius)
- [x] **OPS-04**: GitHub Dependabot alerts enabled with auto-security PRs
- [x] **OPS-05**: Priority fee env var set for mainnet (NEXT_PUBLIC_PRIORITY_FEE_MICRO_LAMPORTS)

### AI-Powered Bulk Inventory Upload

- [x] **BULK-01**: Vendor can upload a CSV in ANY format (their own column names, layout) and AI maps it to LuxHub's NFT template fields
- [x] **BULK-02**: AI analyzes uploaded watch images in bulk and auto-fills metadata (brand, model, condition, estimated price) for each row
- [x] **BULK-03**: Parsed bulk inventory enters an admin review queue where admin can approve, edit, or reject individual items before minting
- [x] **BULK-04**: Admin can mint approved items in bulk from the review queue (batch on-chain minting)
- [x] **BULK-05**: Vendor can upload an image folder alongside CSV and AI matches images to inventory rows by filename or description

### Infrastructure & Scaling

- [x] **INFRA-01**: Vendor/admin avatar and banner uploads migrated from IBM COS to Cloudflare R2 (S3-compatible, global CDN, zero egress, image transforms; remove ibm-cos-sdk dependency; Irys stays for immutable NFT images only)
- [x] **INFRA-02**: MongoDB compound indexes audited and added for hot queries (offers by status+wallet, escrows by status+date, pools by status)
- [x] **INFRA-03**: Bags webhook reconciliation job — periodically checks Bags API for graduation status in case webhook delivery fails
- [x] **INFRA-04**: Pool resale → physical delivery flow validated end-to-end (resale creates escrow → vendor ships → buyer confirms → proceeds distribute to token holders)

### Wallet Stack Consolidation

Phase 12 — Strip Privy, commit to `@solana/wallet-adapter-react` as the single source of wallet state. Added 2026-05-21 in response to dual-wallet-stack session-confusion bugs. The 34 consumer files already use `useEffectiveWallet()` as the unified abstraction; this phase makes `useEffectiveWallet` a thin pass-through over wallet-adapter and removes Privy entirely.

- [ ] **WALLET-01**: `PrivyProvider` and `toSolanaWalletConnectors` are removed from `src/pages/_app.tsx`; provider tree is `ConnectionProvider → WalletProvider (autoConnect) → WalletModalProvider` with no Privy wrappers and no `hasValidPrivyId` conditional shell
- [ ] **WALLET-02**: `@privy-io/react-auth` package is removed from `package.json` dependencies and the lockfile is regenerated (no `@privy-io` references in `package.json` or `package-lock.json`)
- [x] **WALLET-03**: `src/hooks/useEffectiveWallet.ts` is refactored to depend only on `useWallet()` and `useConnection()` from `@solana/wallet-adapter-react`; all Privy imports and branches removed; public API surface (`publicKey`, `connected`, `signTransaction`, `signAllTransactions`, `signMessage`, `sendVersionedTransaction`, `source`) preserved with `source` hardcoded to `'wallet-adapter' as const`
- [x] **WALLET-04**: `src/hooks/useUserRole.ts` is refactored to drop `usePrivy` and `useWallets`; `activePublicKey` derives only from `wallet.publicKey`; `isConnected` derives only from `wallet.connected`
- [ ] **WALLET-05**: `src/components/common/UserMenuDropdown.tsx` is refactored: remove `usePrivy` import, remove `login`/`logout`/`privyReady` usage, route "Connect" CTA through `useWalletModal().setVisible(true)`, route "Sign Out" through `useWallet().disconnect()` only
- [ ] **WALLET-06**: `src/components/common/MobileDrawer.tsx` is refactored: remove `usePrivy` import, remove `login`/`logout`, route connect through `useWalletModal()`, route disconnect through `useWallet().disconnect()`
- [ ] **WALLET-07**: `src/components/common/WalletGuide.tsx` is refactored: remove the `usePrivySafe` runtime-require pattern entirely; route all connects through `useWalletModal()`
- [ ] **WALLET-08**: `NEXT_PUBLIC_PRIVY_APP_ID` (and any `# Privy` comments) removed from `.env.local`, `.env.mainnet`, `.env.devnet`, `.env.example`, `.env.vercel`; Vercel dashboard env var deletion called out as manual user task in plan summary
- [ ] **WALLET-09**: The `src/pages/api/users/sync-privy.ts` orphan endpoint is deleted (no callers in the codebase) and `src/pages/api/users/me.ts` is either deleted or refactored to drop the `privyId` query param branch
- [ ] **WALLET-10**: The `src/components/common/WalletConnect.tsx` legacy component is deleted (no callers in `src/`)
- [ ] **WALLET-11**: Smoke-test pass on devnet then mainnet: (a) mint NFT via `/createNFT`, (b) escrow purchase via `BuyModal`, (c) make offer via `MakeOfferModal`, (d) vendor bulk inventory upload via `/vendor/bulk-upload`, (e) admin confirm-delivery via `adminDashboard` — all complete successfully with Phantom
- [ ] **WALLET-12**: `User.privyId`, `User.privyCreatedAt`, `User.emailVerified` fields are left dormant in `src/lib/models/User.ts` for this phase, but each is marked with a `// DEPRECATED Phase 12 (2026-05-21): Privy removed; field retained for read-back compatibility, drop in follow-up quick task` comment. Schema migration deferred to a follow-up quick task per researcher recommendation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Fee Structure Evolution

- **FEE-01**: Tiered fee schedule based on asset price thresholds (e.g., 3% under $10K, 2% over $10K)
- **FEE-02**: Per-vendor custom fee agreements stored on-chain or in vendor profile
- **FEE-03**: Admin UI to change fee_bps via update_config instruction without CLI

### Marketing & Vendor Onboarding

- **MKT-01**: JC Gold Jewelers formal onboarding (10 watches listed, USDC payouts configured)
- **MKT-02**: Marketing landing page with social proof, vendor testimonials, demo video
- **MKT-03**: Multi-vendor support (onboard vendor #2)
- **MKT-04**: Community building (Discord/Telegram, social media presence)

### Advanced Features

- **ADV-01**: Admin shipment verification queue with priority sorting
- **ADV-02**: Vendor OAuth social verification (Instagram, X)
- **ADV-03**: Pool governance voting UI for graduated pools
- **ADV-04**: Treasury balance monitoring with Slack/Discord alerts

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tiered/per-vendor fee structure | Flat fee_bps adjustable on-chain via update_config — tiered needs program upgrade (v2.0) |
| Fiat on-ramp (Stripe/MoonPay) | Crypto-only for now — regulatory complexity |
| Real-time WebSocket notifications | Polling sufficient for transaction-based flows (shipping takes days) |
| Mobile native app | Web responsive covers 90% of use cases |
| Formal smart contract audit | Sec3 scan + Squads multisig for v1.1; formal audit when TVL > $100K |
| Enhanced KYC/identity verification | Direct vendor relationships sufficient at 1-vendor scale |
| Multi-chain support | Solana-only, execute well on one chain |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MN-01 | Phase 6 | Complete |
| MN-02 | Phase 6 | Complete |
| MN-03 | Phase 6 | Complete |
| MN-04 | Phase 6 | Complete |
| MN-05 | Phase 6 | Complete |
| MN-06 | Phase 6 | Complete |
| MN-07 | Phase 6 | Complete |
| TX-01 | Phase 7 | Pending |
| TX-02 | Phase 7 | Pending |
| TX-03 | Phase 7 | Pending |
| TX-04 | Phase 7 | Pending |
| TX-05 | Phase 7 | Pending |
| POOL-01 | Phase 8 | Complete |
| POOL-02 | Phase 8 | Complete |
| POOL-03 | Phase 8 | Complete |
| POOL-04 | Phase 8 | Complete |
| POOL-05 | Phase 8 | Complete |
| POOL-06 | Phase 8 | Complete |
| OFFER-01 | Phase 9 | Complete |
| OFFER-02 | Phase 9 | Complete |
| OFFER-03 | Phase 9 | Complete |
| OFFER-04 | Phase 9 | Complete |
| UI-01 | Phase 9 | Complete |
| UI-02 | Phase 9 | Complete |
| UI-03 | Phase 8 | Complete |
| OPS-01 | Phase 6 | Complete |
| OPS-02 | Phase 6 | Complete |
| OPS-03 | Phase 6 | Complete |
| OPS-04 | Phase 6 | Complete |
| OPS-05 | Phase 6 | Complete |

| BULK-01 | Phase 10 | Complete |
| BULK-02 | Phase 10 | Complete |
| BULK-03 | Phase 10 | Complete |
| BULK-04 | Phase 10 | Complete |
| BULK-05 | Phase 10 | Complete |
| INFRA-01 | Phase 6 | Complete |
| INFRA-02 | Phase 8 | Complete |
| INFRA-03 | Phase 8 | Complete |
| INFRA-04 | Phase 8 | Complete |

| WALLET-01 | Phase 12 | Pending |
| WALLET-02 | Phase 12 | Pending |
| WALLET-03 | Phase 12 | Complete (12-02, 2026-05-21) |
| WALLET-04 | Phase 12 | Complete (12-02, 2026-05-21) |
| WALLET-05 | Phase 12 | Pending |
| WALLET-06 | Phase 12 | Pending |
| WALLET-07 | Phase 12 | Pending |
| WALLET-08 | Phase 12 | Pending |
| WALLET-09 | Phase 12 | Pending |
| WALLET-10 | Phase 12 | Pending |
| WALLET-11 | Phase 12 | Pending |
| WALLET-12 | Phase 12 | Pending |

**Coverage:**
- v1.1 requirements: 51 total (39 prior + 12 Phase 12 wallet)
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-05-21 — added WALLET-01 through WALLET-12 for Phase 12 wallet stack consolidation*
