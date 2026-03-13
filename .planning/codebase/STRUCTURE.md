# LuxHub Directory Structure

## Top-Level Layout

```
LuxHub/
  CLAUDE.md                    # Project documentation and instructions
  CONTRIBUTING.md              # Partner onboarding guide
  package.json                 # Dependencies and scripts
  tsconfig.json                # TypeScript configuration
  next.config.js               # Next.js configuration
  eslint.config.js             # ESLint flat config
  jest.config.cjs              # Jest test configuration
  jest.setup.cjs               # Jest setup file
  next-env.d.ts                # Next.js type declarations
  src/                         # Application source code
  Solana-Anchor/               # Anchor smart contract workspace
  public/                      # Static assets (images, 3D models, HDR)
  scripts/                     # Build/deploy scripts
  docs/                        # Documentation assets
  tasks/                       # Task tracking (todo, lessons)
  __mocks__/                   # Jest mocks
  node_modules/                # Dependencies
```

## `src/` Directory

```
src/
  pages/                       # Next.js pages + API routes
  components/                  # React components by domain
  lib/                         # Server-side libraries
  utils/                       # Client/shared utilities
  styles/                      # CSS Modules + global styles
  hooks/                       # React custom hooks
  types/                       # TypeScript type declarations
  idl/                         # Anchor IDL JSON files
  context/                     # React Context providers (empty, moved to components)
  scripts/                     # Utility scripts (PDA derivation, escrow lookup)
  __tests__/                   # Test files
```

## `src/pages/` - Pages and API Routes

### Pages (23 pages)

```
pages/
  _app.tsx                     # App wrapper (providers, layout)
  index.tsx                    # Homepage with 3D hero
  marketplace.tsx              # NFT marketplace browser
  createNFT.tsx                # NFT minting form
  requestMint.tsx              # User mint request form
  login.tsx                    # Email/password login
  signup.tsx                   # User registration
  learnMore.tsx                # Platform info page
  adminDashboard.tsx           # Admin control panel
  sellerDashboard.tsx          # Vendor sales view
  pools.tsx                    # Pool listing page
  bags.tsx                     # Bags API integration page
  vendors.tsx                  # Vendor directory
  watchMarket.tsx              # Watch market data
  luxhubHolders.tsx            # NFT holder analytics
  my-orders.tsx                # User order history
  notifications.tsx            # Notification center
  escrow/[pda].tsx             # Escrow detail (dynamic)
  pool/[id].tsx                # Pool detail (dynamic)
  profile/edit.tsx             # Profile editor
  user/userDashboard.tsx       # User dashboard
  vendor/onboard.tsx           # Vendor onboarding
  vendor/vendorDashboard.tsx   # Vendor dashboard
  vendor/pending.tsx           # Pending vendor status
  vendor/[wallet].tsx          # Public vendor profile (dynamic)
```

### API Routes (~100+ endpoints)

```
pages/api/
  ping.ts                      # Health check
  profile.ts                   # User profile CRUD
  auth/
    login.ts                   # JWT login
    signup.ts                  # User registration
    verify.ts                  # Token verification
  users/
    me.ts                      # Current user info
    update.ts                  # Update user
    listings.ts                # User's listings
    sol-price.ts               # SOL/USD price
    sync-privy.ts              # Privy wallet sync
  nft/
    [mintAddress].ts            # NFT by mint address
    requestSale.ts             # Create sale request
    approveSale.ts             # Admin approve sale
    rejectSale.ts              # Admin reject sale
    checkSaleRequest.ts        # Check request status
    updateStatus.ts            # Update NFT status
    updateBuyer.ts             # Assign buyer
    seller.ts                  # Seller's NFTs
    holders.ts                 # NFT holders
    ownedByWallet.ts           # Wallet's NFTs
    pendingRequests.ts         # Pending requests
    activeEscrowsByMint.ts     # Active escrows
    requestMetadataChange.ts   # Request metadata edit
    getMetadataRequests.ts     # List metadata requests
    markRequestApproved.ts     # Approve metadata change
    markRequestRejected.ts     # Reject metadata change
  escrow/
    [pda].ts                   # Escrow by PDA
    pending-shipments.ts       # Shipments awaiting action
    submit-shipment.ts         # Submit tracking info
    update-price.ts            # Update escrow price
  pool/
    create.ts                  # Create pool
    list.ts                    # List pools
    [id].ts                    # Pool by ID
    invest.ts                  # Invest in pool
    buy.ts                     # Buy pool shares
    finalize.ts                # Finalize pool
    custody.ts                 # Custody info
    convert-from-escrow.ts     # Convert escrow to pool
    list-for-resale.ts         # List shares for resale
    status.ts                  # Pool status
    proposals/
      index.ts                 # List proposals
      [proposalId]/
        index.ts               # Proposal detail
        vote.ts                # Vote on proposal
        execute.ts             # Execute proposal
  vendor/
    register.ts                # Vendor registration
    onboard-b-api.ts           # Bags API onboarding
    onboard-x.ts               # Alternative onboarding
    approve.ts                 # Admin approve vendor
    reject.ts                  # Admin reject vendor
    verify.ts                  # Vendor verification
    profile.ts                 # Vendor profile
    pending.ts                 # Pending vendors
    approved.ts                # Approved vendors
    checkUsername.ts            # Username availability
    generateInvite.ts          # Generate invite code
    payouts.ts                 # Vendor payouts
    assets/
      index.ts                 # Vendor asset list
      [id].ts                  # Vendor asset by ID
  admin/
    team/
      index.ts                 # List team members
      [wallet].ts              # Team member by wallet
    mint-requests/
      index.ts                 # List mint requests
      [id].ts                  # Mint request by ID
    nft/
      burn.ts                  # Burn NFT
      freeze.ts                # Freeze NFT
      thaw.ts                  # Thaw NFT
    api/listings/
      listings.ts              # Admin listing view
      approve.ts               # Approve listing
  squads/
    approve.ts                 # Approve multisig proposal
    cancel.ts                  # Cancel proposal
    execute.ts                 # Execute proposal
    status.ts                  # Proposal status
    sync.ts                    # Sync on-chain state to DB
  treasury/
    deposits.ts                # Treasury deposits
    stats.ts                   # Treasury statistics
    transactions.ts            # Treasury transactions
  vault/
    config.ts                  # Vault configuration
    admins.ts                  # Vault admin list
    assets.ts                  # Vault assets
    inventory.ts               # Vault inventory
    mint.ts                    # Mint from vault
    transfer.ts                # Transfer from vault
    derive-pda.ts              # Derive PDA addresses
    activity.ts                # Vault activity log
    config/
      admins.ts                # Admin management
      change-multisig.ts       # Change multisig
  shipping/
    rates.ts                   # Shipping rate quotes
    purchase-label.ts          # Buy shipping label
    track.ts                   # Track shipment
    status.ts                  # Shipment status
    verify-address.ts          # Address verification
  notifications/
    list.ts                    # List notifications
    mark-read.ts               # Mark as read
    unread-count.ts            # Unread count
  addresses/
    index.ts                   # Saved addresses CRUD
    [id].ts                    # Address by ID
    default.ts                 # Default address
  ai/
    analyze-watch.ts           # AI watch image analysis
    verify-listing.ts          # AI listing verification
  bags/
    execute-trade.ts           # Execute Bags trade
    trade-quote.ts             # Get trade quote
    partner-stats.ts           # Partner statistics
  pinata/
    nfts.ts                    # Fetch NFTs from Pinata
    imgUpload.ts               # Upload image to Pinata
  arweave/
    upload.ts                  # Upload to Arweave
    uploadMetadata.ts          # Upload metadata to Arweave
  ibm/
    uploadImage.ts             # Upload to IBM Cloud
  storage/
    upload.ts                  # Generic storage upload
  assets/
    create.ts                  # Create asset record
    createPending.ts           # Create pending asset
    approveMint.ts             # Approve mint
    update.ts                  # Update asset
  offers/
    list.ts                    # List offers
  buyer/
    orders.ts                  # Buyer order history
  verify/
    nft.ts                     # NFT verification
  stats/
    platform.ts                # Platform statistics
  platform/
    config.ts                  # Platform configuration
  webhooks/
    bags.ts                    # Bags webhook handler
    helius.ts                  # Helius webhook handler
  test/
    setup-data.ts              # Test data seeding
    setup-governance.ts        # Test governance setup
```

## `src/components/` - React Components

```
components/
  common/                      # Shared/layout components
    Navbar.tsx                 # Main navigation bar
    Footer.tsx                 # Site footer
    WalletNavbar.tsx           # Wallet connection bar (Privy)
    WalletNavbarSimple.tsx     # Wallet connection bar (no Privy)
    WalletConnect.tsx          # Wallet connect button
    WalletGuide.tsx            # Wallet setup guide
    UnifiedNFTCard.tsx         # Standard NFT card component
    VendorCard.tsx             # Vendor profile card
    TierBadge.tsx              # User tier badge
    NotificationBell.tsx       # Notification icon + dropdown
    UserMenuDropdown.tsx       # User menu
    RoleNavItems.tsx           # Role-based nav items
    MobileDrawer.tsx           # Mobile navigation drawer
    ScrollSteps.tsx            # Scroll-based step animation
    Fallback.tsx               # Error boundary fallback
    Loader.tsx                 # Loading spinner
    ShippingAddressForm.tsx    # Shipping address form
    SavedAddressSelector.tsx   # Saved address picker
    withAuth.tsx               # Auth HOC
    WaveScene.tsx              # 3D wave background
    index.ts                   # Barrel exports

  marketplace/                 # Trading and browsing
    NftDetailCard.tsx          # Premium 3D flip card with holographic effects
    NFTCard.tsx                # Basic NFT card
    NFTCardV2.tsx              # Updated NFT card
    BuyModal.tsx               # Purchase modal
    MakeOfferModal.tsx         # Make offer modal
    OfferCard.tsx              # Offer display card
    OfferList.tsx              # Offer list
    FilterSidebar.tsx          # Category/filter sidebar
    FilterSortPanel.tsx        # Filter and sort controls
    Listings.tsx               # Listing grid
    ListingList.tsx            # Listing list view
    PoolCard.tsx               # Pool summary card
    PoolList.tsx               # Pool grid
    PoolDetail.tsx             # Pool detail view
    BagsPoolTrading.tsx        # Bags AMM trading UI
    HeroScene.tsx              # 3D hero scene (React Three Fiber)
    PriceDisplay.tsx           # SOL/USD price toggle + context provider

  admins/                      # Admin dashboard panels
    NftForm.tsx                # NFT create/edit form
    NFTPreviewCard.tsx         # NFT preview in admin
    ImageUploader.tsx          # Image upload component
    RadixSelect.tsx            # Radix UI select wrapper
    MetadataEditorTab.tsx      # NFT metadata editor
    MetadataChangeRequestsTab.tsx  # Metadata change review
    TransactionHistoryTab.tsx  # Transaction history
    PlatformSettingsPanel.tsx  # Platform settings
    VaultConfigPanel.tsx       # Vault configuration
    VaultInventoryTab.tsx      # Vault inventory view
    ShipmentVerificationTab.tsx # Shipment verification
    MintRequestsPanel.tsx      # Mint request review
    DelistRequestsPanel.tsx    # Delist request review
    AssetCleanupPanel.tsx      # Asset cleanup utility

  admin/                       # Partner admin features
    BagsPartnerDashboard.tsx   # Bags partnership dashboard
    CustodyDashboard.tsx       # Custody management

  vendor/                      # Vendor tools
    AddInventoryForm.tsx       # Add inventory item
    ConvertToPoolModal.tsx     # Convert NFT to pool
    DelistRequestModal.tsx     # Request delisting
    BulkDelistModal.tsx        # Bulk delist
    OrderShipmentPanel.tsx     # Order shipment management
    ShipmentTrackingForm.tsx   # Tracking number entry
    VendorManagementPanel.tsx  # Vendor management
    AvatarBannerUploader.tsx   # Profile image upload

  user/                        # User features
    LuxuryAssistant.tsx        # AI chatbot (Claude-powered)
    MintRequestForm.tsx        # User mint request
    NFTChangeRequestForm.tsx   # Metadata change request

  governance/                  # Pool governance
    GovernanceDashboard.tsx    # Governance overview
    ProposalCard.tsx           # Proposal display
    CreateProposalModal.tsx    # Create proposal
    VoteButton.tsx             # Vote action button
    MemberList.tsx             # Pool member list
    index.ts                   # Barrel exports
```

## `src/lib/` - Server-Side Libraries

```
lib/
  database/
    mongodb.ts                 # Mongoose connection singleton

  models/                      # Mongoose schemas (29 files)
    User.ts                    # User model (email, wallet, role, tier)
    Vendor.ts                  # Vendor model (verification status)
    VendorProfile.ts           # Vendor public profile
    NFT.ts                     # NFT record (mint address, metadata, status)
    Assets.ts                  # Physical asset records
    marketplaceNFTs.ts         # Marketplace NFT listings
    Escrow.ts                  # Escrow record (MongoDB mirror of on-chain)
    SaleRequest.ts             # Sale request (pending -> approved -> active)
    Transaction.ts             # Transaction record (3% royalty in pre-save hook)
    Pool.ts                    # Fractional ownership pool
    PoolDistribution.ts        # Pool payout distribution
    PoolProposal.ts            # Governance proposal
    Offer.ts                   # Buy offers
    DelistRequest.ts           # Delist requests
    MintRequest.ts             # User-initiated mint requests
    AdminRole.ts               # Admin role assignments
    InviteCode.ts              # Vendor invite codes
    PlatformConfig.ts          # Platform configuration
    Notification.ts            # User notifications
    SavedAddress.ts            # Saved shipping addresses
    PostSaleFeedback.ts        # Post-sale buyer feedback
    LuxHubVault.ts             # Vault configuration
    TreasuryDeposit.ts         # Treasury deposit records
    TreasuryVesting.ts         # Treasury vesting schedules
    GlobalAnalytics.ts         # Platform-wide analytics
    UserAnalytics.ts           # Per-user analytics
    VendorAnalytics.ts         # Per-vendor analytics
    NFTAuthorityAction.ts      # NFT authority action audit log
    ConditionUpdate.ts         # Asset condition updates

  auth/
    auth.ts                    # Auth helpers
    token.ts                   # JWT sign/verify

  middleware/
    auth.ts                    # JWT auth middleware (HOF)
    walletAuth.ts              # Wallet signature auth (nonce-based)
    validate.ts                # Zod validation middleware
    rateLimit.ts               # Rate limiting middleware

  security/
    encryption.ts              # AES-256-GCM PII encryption/decryption

  services/
    squadService.ts            # Squads Protocol multisig operations
    squadsTransferService.ts   # Squads vault transfers
    heliusService.ts           # Helius enhanced RPC
    notificationService.ts     # Server-side notification creation

  config/
    adminConfig.ts             # Admin wallet list and authorization

  validation/
    schemas.ts                 # Zod schemas for API input validation

  monitoring/
    errorHandler.ts            # Centralized error handling

  shipping/
    easypost.ts                # EasyPost shipping API integration

  ibm/
    uploadImageToIBM.ts        # IBM Cloud Object Storage upload

  types/                       # Server-side type definitions
```

## `src/utils/` - Client/Shared Utilities

```
utils/
  programUtils.ts              # Anchor Program instance factory
  pinata.ts                    # Pinata IPFS upload helpers
  arweave.ts                   # Arweave upload helpers
  irys.ts                      # Irys (Bundlr) upload helpers
  storage.ts                   # Storage abstraction layer
  token.ts                     # SPL token helpers
  walletHelper.ts              # Wallet utility functions
  jupiterSwap.ts               # Jupiter DEX swap integration
  metadata.ts                  # NFT metadata helpers
  imageUtils.ts                # Image processing utilities
  formatDate.ts                # Date formatting
  formatPrice.ts               # Price formatting (SOL/USD)
  fetcher.ts                   # SWR fetcher function
  config.ts                    # Client-side configuration
```

## `src/styles/` - CSS Modules

```
styles/
  globals.css                  # Global CSS reset and base styles
  LuxHubTheme.css              # Design system reference (variables, patterns)
  [ComponentName].module.css   # Component-scoped CSS Modules (70+ files)
```

Each CSS module file corresponds 1:1 to a component or page. All modules redeclare CSS variables at the component root level for scoping.

## `src/hooks/` - Custom React Hooks

```
hooks/
  useSWR.ts                    # SWR configuration wrapper
  useUserRole.ts               # Determine user role from wallet/JWT
  useNotifications.ts          # Notification polling hook
  usePools.ts                  # Pool data fetching hook
```

## `src/types/` - TypeScript Declarations

```
types/
  next.d.ts                    # Next.js type augmentations
  user.d.ts                    # User type definitions
  listing.d.ts                 # Listing type definitions
  mongoose.ts                  # Mongoose helper types
```

## `src/idl/` - Anchor IDL Files

```
idl/
  luxhub_marketplace.json      # Current program IDL (matches deployed)
  anchor_escrow.json           # Legacy escrow IDL
```

## `Solana-Anchor/` - Smart Contract Workspace

```
Solana-Anchor/
  Anchor.toml                  # Anchor config (cluster: devnet)
  Cargo.toml                   # Rust workspace config
  programs/
    luxhub-marketplace/
      src/
        lib.rs                 # Program entry + account contexts
        constants.rs           # PDA seeds
        errors.rs              # Custom error enum
        state/
          mod.rs
          escrow.rs            # Escrow account struct
          config.rs            # EscrowConfig account struct
          admin_list.rs        # AdminList account struct
        instructions/
          mod.rs
          initialize.rs        # Create escrow + lock NFT
          initialize_config.rs # One-time config setup
          exchange.rs          # Buyer deposits funds
          confirm_delivery.rs  # Release funds + transfer NFT
          update_price.rs      # Update listing price
          cancel_escrow.rs     # Cancel and return NFT
          refund_buyer.rs      # Refund via Squads CPI
          update_config.rs     # Update protocol config
          close_config.rs      # Close config account
          mint_nft.rs          # Mint NFT via program
          burn_nft.rs          # Burn NFT
          freeze_nft.rs        # Freeze NFT transfers
          admin_transfer.rs    # Admin-initiated transfer
          init_admin_list.rs   # Initialize admin list
          add_admin.rs         # Add admin to list
          admin_only_example.rs # Admin-gated example
        contexts/              # Account validation structs
          mod.rs
          initialize.rs
          initialize_config.rs
          exchange.rs
          confirm_delivery.rs
          update_price.rs
          mint_nft.rs
          burn_nft.rs
          freeze_nft.rs
          admin_transfer.rs
          init_admin_list.rs
          add_admin.rs
          admin_only_example.rs
        utils/
          mod.rs
          ata.rs               # Associated token account helpers
          squads_gate.rs       # Squads multisig CPI verification
  tests/                       # Anchor integration tests (ts-mocha)
  keys/                        # Keypair files
  migrations/                  # Anchor migrations
  extras/                      # Additional scripts/tools
  scripts/                     # Deployment scripts
```

## `public/` - Static Assets

```
public/
  3Dmodels/                    # GLB/GLTF 3D models (RolexSub.glb ~19MB)
  images/                      # Logos, icons, partner assets
  hdri/                        # HDR environment maps for 3D scenes
```

## Naming Conventions

| Category | Pattern | Examples |
|----------|---------|---------|
| Pages | `camelCase.tsx` or `kebab-case.tsx` | `createNFT.tsx`, `my-orders.tsx` |
| Components | `PascalCase.tsx` | `NftDetailCard.tsx`, `BuyModal.tsx` |
| CSS Modules | `PascalCase.module.css` | `NFTDetailCard.module.css` |
| Models | `PascalCase.ts` | `SaleRequest.ts`, `Pool.ts` |
| API routes | `camelCase.ts` or `kebab-case.ts` | `requestSale.ts`, `pending-shipments.ts` |
| Utils | `camelCase.ts` | `programUtils.ts`, `formatPrice.ts` |
| Hooks | `useCamelCase.ts` | `useUserRole.ts`, `usePools.ts` |
| Anchor Rust | `snake_case.rs` | `confirm_delivery.rs`, `escrow.rs` |
| Dynamic routes | `[param].tsx` / `[param].ts` | `[pda].tsx`, `[mintAddress].ts` |
