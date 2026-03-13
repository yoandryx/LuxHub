# LuxHub Architecture

## Overall Pattern

LuxHub is a **full-stack monolith** built on Next.js 14 (pages router), deployed as a single Vercel application. It combines a React frontend, Node.js API routes (serverless functions), MongoDB persistence, and a separate Solana/Anchor smart contract program. The architecture follows a **hybrid web2+web3 pattern**: traditional auth and data storage live in MongoDB, while asset ownership, escrow, and treasury operations are settled on-chain via Solana.

## Layer Organization

### 1. Presentation Layer (Client)

Entry point: `src/pages/_app.tsx`

The app wrapper establishes the full provider hierarchy:
```
ErrorBoundary
  -> PrivyProvider (optional, when PRIVY_APP_ID configured)
    -> PriceDisplayProvider (SOL/USD toggle context)
      -> ConnectionProvider (Solana RPC)
        -> WalletProvider (Phantom, Solflare, Mobile)
          -> WalletModalProvider
            -> Navbar + WalletNavbar + Page + LuxuryAssistant + Footer
```

Pages live in `src/pages/` using Next.js file-based routing. Each page typically fetches data from API routes via `fetch` or SWR (`src/hooks/useSWR.ts`) and interacts with the Solana program through `src/utils/programUtils.ts`.

Key page categories:
- **Public**: `index.tsx`, `marketplace.tsx`, `learnMore.tsx`, `vendors.tsx`, `watchMarket.tsx`
- **Auth**: `login.tsx`, `signup.tsx`
- **User**: `user/userDashboard.tsx`, `profile/edit.tsx`, `my-orders.tsx`, `notifications.tsx`
- **Vendor**: `vendor/onboard.tsx`, `vendor/vendorDashboard.tsx`, `vendor/[wallet].tsx`, `vendor/pending.tsx`, `sellerDashboard.tsx`
- **Admin**: `adminDashboard.tsx`
- **Marketplace**: `createNFT.tsx`, `requestMint.tsx`, `escrow/[pda].tsx`, `luxhubHolders.tsx`
- **Pools**: `pools.tsx`, `pool/[id].tsx`, `bags.tsx`

### 2. Component Layer

Components in `src/components/` are organized by domain:

- **`common/`** (17 files) - Shared UI: `Navbar.tsx`, `Footer.tsx`, `WalletNavbar.tsx`, `WalletNavbarSimple.tsx`, `UnifiedNFTCard.tsx`, `VendorCard.tsx`, `Fallback.tsx`, `Loader.tsx`, `ScrollSteps.tsx`, `WalletGuide.tsx`, `TierBadge.tsx`, `NotificationBell.tsx`, `UserMenuDropdown.tsx`, `RoleNavItems.tsx`, `MobileDrawer.tsx`, `ShippingAddressForm.tsx`, `SavedAddressSelector.tsx`
- **`marketplace/`** (14 files) - Trading UI: `NftDetailCard.tsx`, `NFTCard.tsx`, `NFTCardV2.tsx`, `BuyModal.tsx`, `MakeOfferModal.tsx`, `OfferCard.tsx`, `OfferList.tsx`, `FilterSidebar.tsx`, `FilterSortPanel.tsx`, `Listings.tsx`, `ListingList.tsx`, `PoolCard.tsx`, `PoolList.tsx`, `PoolDetail.tsx`, `BagsPoolTrading.tsx`, `HeroScene.tsx`, `PriceDisplay.tsx`
- **`admins/`** (12 files) - Admin dashboard tabs: `NftForm.tsx`, `NFTPreviewCard.tsx`, `ImageUploader.tsx`, `RadixSelect.tsx`, `MetadataEditorTab.tsx`, `MetadataChangeRequestsTab.tsx`, `TransactionHistoryTab.tsx`, `PlatformSettingsPanel.tsx`, `VaultConfigPanel.tsx`, `VaultInventoryTab.tsx`, `ShipmentVerificationTab.tsx`, `MintRequestsPanel.tsx`, `DelistRequestsPanel.tsx`, `AssetCleanupPanel.tsx`
- **`admin/`** (2 files) - Partner dashboards: `BagsPartnerDashboard.tsx`, `CustodyDashboard.tsx`
- **`vendor/`** (6 files) - Vendor tools: `AddInventoryForm.tsx`, `ConvertToPoolModal.tsx`, `DelistRequestModal.tsx`, `BulkDelistModal.tsx`, `OrderShipmentPanel.tsx`, `ShipmentTrackingForm.tsx`, `VendorManagementPanel.tsx`, `AvatarBannerUploader.tsx`
- **`user/`** (3 files) - User features: `LuxuryAssistant.tsx` (AI chatbot), `MintRequestForm.tsx`, `NFTChangeRequestForm.tsx`
- **`governance/`** (5 files) - Pool governance: `GovernanceDashboard.tsx`, `ProposalCard.tsx`, `CreateProposalModal.tsx`, `VoteButton.tsx`, `MemberList.tsx`

### 3. API Layer (Serverless Functions)

All API routes live under `src/pages/api/`. Each file exports a default handler following the pattern:
```
method validation -> optional auth middleware -> dbConnect() -> Mongoose operation -> JSON response
```

API route domains (~100+ endpoints):

| Domain | Path | Purpose |
|--------|------|---------|
| Auth | `api/auth/` | `login`, `signup`, `verify` |
| Users | `api/users/` | `me`, `update`, `listings`, `sol-price`, `sync-privy` |
| NFT | `api/nft/` | CRUD, sale requests, metadata changes, status updates, holder queries |
| Escrow | `api/escrow/` | `[pda]`, `pending-shipments`, `submit-shipment`, `update-price` |
| Pool | `api/pool/` | `create`, `list`, `[id]`, `invest`, `buy`, `finalize`, `custody`, `convert-from-escrow`, `list-for-resale`, `status` |
| Pool Proposals | `api/pool/proposals/` | `index`, `[proposalId]`, `[proposalId]/vote`, `[proposalId]/execute` |
| Vendor | `api/vendor/` | `register`, `onboard-*`, `approve`, `reject`, `verify`, `profile`, `payouts`, `pending`, `assets/` |
| Admin | `api/admin/` | `team/`, `mint-requests/`, `nft/burn`, `nft/freeze`, `nft/thaw`, `listings/` |
| Squads | `api/squads/` | `approve`, `cancel`, `execute`, `status`, `sync` |
| Treasury | `api/treasury/` | `deposits`, `stats`, `transactions` |
| Vault | `api/vault/` | `config`, `admins`, `assets`, `inventory`, `mint`, `transfer`, `derive-pda`, `activity`, `config/admins`, `config/change-multisig` |
| Shipping | `api/shipping/` | `rates`, `purchase-label`, `track`, `status`, `verify-address` |
| Notifications | `api/notifications/` | `list`, `mark-read`, `unread-count` |
| Addresses | `api/addresses/` | `index`, `[id]`, `default` |
| AI | `api/ai/` | `analyze-watch`, `verify-listing` |
| Bags | `api/bags/` | `execute-trade`, `trade-quote`, `partner-stats` |
| Storage | `api/pinata/`, `api/arweave/`, `api/ibm/`, `api/storage/` | Image/metadata upload |
| Webhooks | `api/webhooks/` | `bags`, `helius` |
| Stats | `api/stats/` | `platform` |
| Platform | `api/platform/` | `config` |
| Offers | `api/offers/` | `list` |
| Buyer | `api/buyer/` | `orders` |
| Verify | `api/verify/` | `nft` |
| Test | `api/test/` | `setup-data`, `setup-governance` |

### 4. Data Layer

**MongoDB (via Mongoose)** - `src/lib/models/` contains 29 model files:

Core entities:
- `User.ts`, `Vendor.ts`, `VendorProfile.ts` - Identity and roles
- `NFT.ts`, `Assets.ts`, `marketplaceNFTs.ts` - Asset records
- `Escrow.ts`, `SaleRequest.ts`, `Transaction.ts` - Trade lifecycle
- `Pool.ts`, `PoolDistribution.ts`, `PoolProposal.ts` - Fractional ownership
- `Offer.ts`, `DelistRequest.ts`, `MintRequest.ts` - Request workflows

Supporting:
- `AdminRole.ts`, `InviteCode.ts`, `PlatformConfig.ts` - Platform management
- `Notification.ts`, `SavedAddress.ts`, `PostSaleFeedback.ts` - User features
- `LuxHubVault.ts`, `TreasuryDeposit.ts`, `TreasuryVesting.ts` - Treasury
- `GlobalAnalytics.ts`, `UserAnalytics.ts`, `VendorAnalytics.ts` - Analytics
- `NFTAuthorityAction.ts`, `ConditionUpdate.ts` - Audit trail

Connection singleton: `src/lib/database/mongodb.ts` (caches connection on `globalThis` for serverless reuse).

### 5. Blockchain Layer (Solana/Anchor)

Program source: `Solana-Anchor/programs/luxhub-marketplace/src/`

Program ID: `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj` (Devnet)

Module structure:
- `lib.rs` - Program entry, account context structs, instruction dispatch
- `state/` - `escrow.rs` (Escrow PDA), `config.rs` (EscrowConfig PDA), `admin_list.rs`
- `instructions/` - Handler logic for each instruction
- `contexts/` - Account validation structs (duplicated in `lib.rs` for Anchor 0.31.0 compatibility)
- `constants.rs` - PDA seeds (`CONFIG_SEED`, `ESCROW_SEED`)
- `errors.rs` - Custom error codes (`LuxError`)
- `utils/` - `ata.rs` (associated token helpers), `squads_gate.rs` (multisig CPI verification)

Instructions:
- `initialize_config` - One-time protocol setup (authority, treasury, fee_bps)
- `initialize` - Create escrow, lock NFT in vault
- `exchange` - Buyer deposits funds to escrow
- `confirm_delivery` - Release funds to seller (95%) + treasury (5%), transfer NFT to buyer
- `update_price` - Seller updates listing price (pre-buyer only)
- `cancel_escrow` - Seller cancels and reclaims NFT (pre-buyer only)
- `refund_buyer` - Admin refund via Squads multisig CPI
- `update_config` / `close_config` - Protocol admin operations
- `mint_nft`, `burn_nft`, `freeze_nft`, `admin_transfer` - NFT authority actions
- `init_admin_list`, `add_admin` - On-chain admin management

Client-side Anchor access: `src/utils/programUtils.ts` creates an `AnchorProvider` from the connected wallet and loads the IDL from `src/idl/luxhub_marketplace.json`.

## Data Flow Patterns

### NFT Listing and Sale (Primary Flow)

```
Seller (browser)
  -> POST /api/nft/requestSale  (creates SaleRequest in MongoDB, status: pending)
  -> Admin approves via /api/nft/approveSale
  -> Seller signs `initialize` tx via Anchor program (NFT locked in escrow PDA vault)
  -> Buyer browses marketplace (GET /api/pinata/nfts or /api/users/listings)
  -> Buyer signs `exchange` tx (funds deposited to escrow WSOL vault)
  -> Admin verifies shipment, signs `confirm_delivery` (optionally via Squads multisig proposal)
  -> On-chain: NFT transferred to buyer, funds split 95/5 to seller/treasury
  -> POST /api/squads/sync updates MongoDB escrow status
```

### Authentication

Two parallel auth systems:
1. **JWT auth** (`src/lib/auth/` + `src/lib/middleware/auth.ts`) - Traditional email/password login via `api/auth/login` and `api/auth/signup`. JWT token in Bearer header.
2. **Wallet signature auth** (`src/lib/middleware/walletAuth.ts`) - Nonce-based challenge/response using ed25519 signature verification (tweetnacl). Proves wallet ownership without passwords.
3. **Privy** (optional) - Embedded wallet creation for users without wallets, email login fallback.

### Storage

Multiple storage backends:
- **Pinata/IPFS** (`src/utils/pinata.ts`) - Primary NFT metadata and image storage
- **Arweave/Irys** (`src/utils/irys.ts`, `src/utils/arweave.ts`) - Permanent metadata storage
- **IBM Cloud** (`src/lib/ibm/uploadImageToIBM.ts`) - Alternative image hosting

### Pool/Fractional Ownership

```
Vendor creates pool (POST /api/pool/create)
  -> Investors buy shares (POST /api/pool/invest)
  -> Governance proposals (api/pool/proposals/)
  -> Pool graduation/finalization (POST /api/pool/finalize)
  -> Distribution to shareholders (PoolDistribution model)
```

### Shipping

```
Buyer provides address (ShippingAddressForm component)
  -> Vendor submits shipment (POST /api/escrow/submit-shipment)
  -> EasyPost integration (src/lib/shipping/easypost.ts)
  -> Rate quotes (api/shipping/rates), label purchase (api/shipping/purchase-label)
  -> Tracking (api/shipping/track, api/shipping/status)
  -> Admin verifies (ShipmentVerificationTab component)
```

## Key Abstractions

| Abstraction | Location | Responsibility |
|------------|----------|---------------|
| `dbConnect()` | `src/lib/database/mongodb.ts` | Singleton MongoDB connection with global caching |
| `getProgram()` | `src/utils/programUtils.ts` | Anchor Program instance from connected wallet |
| `authMiddleware()` | `src/lib/middleware/auth.ts` | JWT token verification HOF for API routes |
| `walletAuthMiddleware()` | `src/lib/middleware/walletAuth.ts` | Wallet signature verification for API routes |
| `validate()` | `src/lib/middleware/validate.ts` | Zod schema validation middleware |
| `rateLimit()` | `src/lib/middleware/rateLimit.ts` | API rate limiting |
| `encrypt/decrypt` | `src/lib/security/encryption.ts` | AES-256-GCM PII encryption |
| `PriceDisplayProvider` | `src/components/marketplace/PriceDisplay.tsx` | React context for SOL/USD price toggle |
| `useUserRole()` | `src/hooks/useUserRole.ts` | Hook to determine user role (admin/vendor/user) |
| `useNotifications()` | `src/hooks/useNotifications.ts` | Hook for notification polling |
| `usePools()` | `src/hooks/usePools.ts` | Hook for pool data fetching |
| `squadService` | `src/lib/services/squadService.ts` | Squads Protocol multisig operations |
| `heliusService` | `src/lib/services/heliusService.ts` | Helius RPC enhanced API calls |
| `notificationService` | `src/lib/services/notificationService.ts` | Server-side notification creation |
| `errorHandler` | `src/lib/monitoring/errorHandler.ts` | Centralized error handling |
| `adminConfig` | `src/lib/config/adminConfig.ts` | Admin wallet authorization |

## Entry Points

| Entry Point | File | Role |
|-------------|------|------|
| App wrapper | `src/pages/_app.tsx` | Provider hierarchy, layout, global styles |
| Homepage | `src/pages/index.tsx` | Landing page with 3D hero scene |
| Marketplace | `src/pages/marketplace.tsx` | NFT browsing and search |
| Create NFT | `src/pages/createNFT.tsx` | Mint form with AI auto-fill |
| Admin Dashboard | `src/pages/adminDashboard.tsx` | Full admin control panel |
| Seller Dashboard | `src/pages/sellerDashboard.tsx` | Vendor sales management |
| Escrow Detail | `src/pages/escrow/[pda].tsx` | Individual escrow view |
| Pool Detail | `src/pages/pool/[id].tsx` | Individual pool view |
| API Health | `src/pages/api/ping.ts` | Health check endpoint |
| Anchor Program | `Solana-Anchor/programs/luxhub-marketplace/src/lib.rs` | On-chain program entry |

## Cross-Cutting Concerns

- **Styling**: CSS Modules with glass-morphism design system. Theme reference in `src/styles/LuxHubTheme.css`. All modules redeclare CSS variables at component root.
- **Error Handling**: React ErrorBoundary at app level (`src/components/common/Fallback.tsx`), server-side via `src/lib/monitoring/errorHandler.ts`.
- **Validation**: Zod schemas in `src/lib/validation/schemas.ts`, applied via `src/lib/middleware/validate.ts`.
- **Type Definitions**: `src/types/` contains ambient declarations (`next.d.ts`, `user.d.ts`, `listing.d.ts`) and Mongoose type helpers (`mongoose.ts`).
- **IDL Files**: `src/idl/anchor_escrow.json` and `src/idl/luxhub_marketplace.json` define the Anchor program interface for client-side interaction.
