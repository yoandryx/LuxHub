# Task Tracker

<!-- Active task plans and progress. -->

## Current Sprint — Marketplace & Bags Launch Prep

### P0 — Must Do Before Live Users

- [ ] **Test full marketplace flow end-to-end** — offer → accept → pay → ship → deliver → funds release (devnet)
- [ ] **Test direct buy flow** — click Buy → USDC/SOL payment → escrow funded → ship → deliver (devnet)
- [ ] **Build buyer orders tab** in `src/pages/user/userDashboard.tsx` — notifications link to `?tab=orders` but tab doesn't exist. Show purchase history, order status, tracking info.
- [ ] **Add `IRYS_PRIVATE_KEY` + `STORAGE_PROVIDER=irys` to Vercel env** — minting fails on production without these
- [ ] **Register Bags webhook URL** at dev.bags.fm → `https://luxhub.gold/api/webhooks/bags` — live trade events won't flow until registered

### P1 — Before Mainnet Launch

- [ ] **Switch RPC to mainnet Helius** — currently devnet for escrow, mainnet for Bags. Need single mainnet RPC.
- [ ] **Deploy Anchor escrow program to mainnet** — currently only on devnet (`kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj`)
- [ ] **Initialize escrow config on mainnet** — `initialize_config(authority, treasury, fee_bps=300)`
- [ ] **Fund treasury wallet on mainnet** (~0.05 SOL) → create partner config PDA for 25% bonus Bags fees
- [ ] **Create partner config on-chain** — sign creation tx with treasury wallet, save PDA `7YV3WwZvyTfoDpfxBcW2fXUqNp1PE2imMyXAdTu141rt`
- [ ] **Mobile QA pass** — all modals (Buy, Offer, PoolDetail), cards, navbar on mobile viewport

### P2 — Polish & Features

- [ ] **Vendor toggle for offers** — UI in vendor dashboard inventory tab to enable/disable offers per listing
- [ ] **"Holding but open to offers"** — profile cards show Offer button for non-listed NFTs (API wired, needs frontend integration)
- [ ] **Admin fee claim UI** — button in admin dashboard to claim Bags creator fees + partner fees
- [ ] **Pool token auto-unlock** — `tokenStatus` stuck at `minted`, needs trigger when pool fills + asset verified
- [ ] **Buyer notification on counter offer** — clicking notification should auto-open the offer response UI
- [ ] **Real volume on pool cards** — pool cards show DB volume; should prefer DexScreener `volume24h`
- [ ] **Vendor dashboard notification feed** — show real-time notifications inline, not just badge counts

### P3 — Deferred / Nice-to-Have

- [ ] **WebSocket for real-time notifications** — currently polling every 30s via SWR
- [ ] **Remove test token from Bags** — `BcQAJB6SyQVjRbGLbzv9K6DSGzKHx86W3zpZVDvyBAGS` (LUX-TST) is live on mainnet
- [ ] **Compress large assets** — `public/3Dmodels/RolexSub.glb` (19MB), `public/images/nw.png` (4MB)
- [ ] **Hardcoded Pinata gateway URLs** — ~15 files reference `gateway.pinata.cloud` for display; migrate to Irys gateway
- [ ] **Pool wind-down UI** — admin trigger for snapshot/distribution announcements

## Completed (2026-03-16)

- [x] Bags API v2 integration — all endpoints rewritten for correct API spec
- [x] Token launch tested on mainnet (create → fee share → launch → buy → sell)
- [x] Fee model corrected: 1% creator fee (not 3%), 97/3 escrow split (not 95/5)
- [x] Jupiter swap URL updated (`public.jupiterapi.com`)
- [x] SOL price: Pyth oracle primary, CoinGecko fallback
- [x] All offer notifications wired (create, accept, reject, counter, withdraw)
- [x] Transaction records for purchases, offers, deliveries
- [x] NFT name: brand + model (max 32 chars)
- [x] Chrome glass toasts globally
- [x] Solana icon (`SiSolana`) replaces sparkles/circles
- [x] BuyModal compact layout (580px, fits on screen)
- [x] NFT card footer: USD primary, SOL secondary
- [x] TvChart: timeframes, MCap/Price toggle, real DexScreener data
- [x] Pool cards: real 24h price change, quick trade buttons
- [x] Buy/Offer buttons wired on NftDetailCard across all pages
- [x] Deep links: `/marketplace?pay=` and `/marketplace?offer=`
- [x] 50% minimum offer floor
- [x] `acceptingOffers` defaults to `true`
- [x] Hardcoded SOL $150 removed from all offer handlers

## Review Notes

- Jupiter `quote-api.jup.ag/v6/` is DEAD — always use `public.jupiterapi.com`
- Bags `fee-share/config` requires payer to have SOL on mainnet for PDA rent
- Bags SDK constructor is positional: `new BagsSDK(apiKey, connection, commitment)` — NOT an object
- Fee share config txs must be confirmed on-chain BEFORE launch tx can be built (two-phase)
- Wallet must be connected for Buy/Offer buttons — now shows toast error if not
