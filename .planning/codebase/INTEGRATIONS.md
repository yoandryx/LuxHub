# LuxHub External Integrations

## Database: MongoDB

- **ODM**: Mongoose ^8.12.0
- **Connection**: `src/lib/database/mongodb.ts`
- **Connection string**: `MONGODB_URI` env var (MongoDB Atlas with SSL)
- **Connection caching**: Global singleton pattern to reuse connections across serverless invocations
- **DNS**: Forces IPv4 (`dns.setDefaultResultOrder('ipv4first')`)
- **Server-only**: Guard prevents client-side `dbConnect()` calls

### Models (29 total)

Located in `src/lib/models/`:

| Model | File | Purpose |
|-------|------|---------|
| User | `User.ts` | User accounts, wallet addresses |
| Vendor | `Vendor.ts` | Vendor registrations |
| VendorProfile | `VendorProfile.ts` | Extended vendor profiles |
| NFT | `NFT.ts` | NFT records |
| Assets | `Assets.ts` | Physical asset records |
| Transaction | `Transaction.ts` | Transaction history (3% royalty in pre-save hooks) |
| Escrow | `Escrow.ts` | Escrow state records |
| Pool | `Pool.ts` | Fractional ownership pools |
| PoolProposal | `PoolProposal.ts` | Pool governance proposals |
| PoolDistribution | `PoolDistribution.ts` | Pool payout distributions |
| SaleRequest | `SaleRequest.ts` | NFT sale requests |
| DelistRequest | `DelistRequest.ts` | NFT delist requests |
| MintRequest | `MintRequest.ts` | NFT mint approval requests |
| Offer | `Offer.ts` | Purchase offers |
| Notification | `Notification.ts` | User notifications |
| InviteCode | `InviteCode.ts` | Vendor invite codes |
| AdminRole | `AdminRole.ts` | Admin role assignments |
| SavedAddress | `SavedAddress.ts` | Saved shipping addresses |
| TreasuryDeposit | `TreasuryDeposit.ts` | Treasury deposit records |
| TreasuryVesting | `TreasuryVesting.ts` | Treasury vesting schedules |
| LuxHubVault | `LuxHubVault.ts` | Vault configuration |
| PlatformConfig | `PlatformConfig.ts` | Platform settings |
| GlobalAnalytics | `GlobalAnalytics.ts` | Platform-wide analytics |
| UserAnalytics | `UserAnalytics.ts` | Per-user analytics |
| VendorAnalytics | `VendorAnalytics.ts` | Per-vendor analytics |
| PostSaleFeedback | `PostSaleFeedback.ts` | Post-sale feedback |
| ConditionUpdate | `ConditionUpdate.ts` | Asset condition updates |
| NFTAuthorityAction | `NFTAuthorityAction.ts` | NFT authority action logs |
| marketplaceNFTs | `marketplaceNFTs.ts` | Marketplace NFT listings |

---

## Blockchain: Solana

### RPC Providers

1. **Helius** (primary/production)
   - Env: `HELIUS_API_KEY`, `HELIUS_ENDPOINT`
   - URL pattern: `https://devnet.helius-rpc.com/?api-key={key}`

2. **Alchemy** (test validator clone source)
   - Used in `Solana-Anchor/Anchor.toml` for test validator
   - URL: `https://solana-devnet.g.alchemy.com/v2/{key}`

3. **Solana public RPC** (fallback)
   - Default: `https://api.devnet.solana.com`

- **Client-side endpoint**: `NEXT_PUBLIC_SOLANA_ENDPOINT` env var
- **Cluster**: Devnet (configured in `Solana-Anchor/Anchor.toml` and `src/pages/_app.tsx`)
- **Program initialization**: `src/utils/programUtils.ts` (creates Anchor `Program` instance)

### Wallet Adapters

Configured in `src/pages/_app.tsx`:

| Wallet | Adapter |
|--------|---------|
| Phantom | `PhantomWalletAdapter` |
| Solflare | `SolflareWalletAdapter` |
| Mobile (MWA) | `RemoteSolanaMobileWalletAdapter` |

Provider chain: `ConnectionProvider` > `WalletProvider` > `WalletModalProvider`

### On-Chain Programs

**Marketplace Escrow Program**
- Program ID: `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj`
- Source: `Solana-Anchor/programs/luxhub-marketplace/src/lib.rs`
- IDL: `src/idl/luxhub_marketplace.json`
- Instructions: `initialize_config`, `initialize` (escrow), `exchange`, `confirm_delivery`
- Uses: `anchor-lang` 0.31.0, `anchor-spl` 0.31.0

### Squads Protocol (Multisig)

- **Package**: `@sqds/multisig` ^2.1.4
- **Env**: `NEXT_PUBLIC_SQUADS_MSIG`, `SQUADS_MEMBER_KEYPAIR_PATH` or `SQUADS_MEMBER_KEYPAIR_JSON`
- **API endpoints**:
  - `POST /api/squads/approve` - Approve a proposal
  - `POST /api/squads/cancel` - Cancel a proposal
  - `POST /api/squads/execute` - Execute approved proposal (`src/pages/api/squads/execute.ts`)
  - `GET /api/squads/status` - Check proposal status
  - `POST /api/squads/sync` - Sync on-chain state to MongoDB

### Metaplex (NFT Minting)

- **Standard**: MPL Core (`@metaplex-foundation/mpl-core`)
- **Framework**: Umi (`@metaplex-foundation/umi-bundle-defaults`)
- **Operations**: Mint, burn, freeze, thaw NFTs
- **Admin endpoints**:
  - `POST /api/admin/nft/burn`
  - `POST /api/admin/nft/freeze`
  - `POST /api/admin/nft/thaw`

---

## Storage: IPFS / Arweave / Irys

Unified storage layer at `src/utils/storage.ts` supporting multiple providers.

### Provider Selection
- Configured via `STORAGE_PROVIDER` env var: `irys` | `pinata` | `arweave` | `both`
- Default: `irys` (permanent Arweave-backed storage, free on devnet)

### Pinata (IPFS)
- **Package**: `pinata` ^2.0.1
- **Env**: `PINATA_API_KEY`, `PINATA_API_SECRET_KEY`, `PINATA_JWT`
- **Gateway**: `NEXT_PUBLIC_GATEWAY_URL` (default: `https://teal-working-frog-718.mypinata.cloud/ipfs/`)
- **Utils**: `src/utils/pinata.ts`
- **API endpoints**:
  - `GET /api/pinata/nfts` - List NFTs from Pinata
  - `POST /api/pinata/imgUpload` - Upload image to Pinata

### Irys (Arweave)
- **Package**: `@irys/sdk` ^0.2.11
- **Env**: `IRYS_NETWORK` (devnet/mainnet), `IRYS_PRIVATE_KEY`
- **Utils**: `src/utils/irys.ts`
- **Gateway**: `https://gateway.irys.xyz/`

### Arweave (Direct)
- **Package**: `arweave` ^1.15.7
- **Utils**: `src/utils/arweave.ts`
- **API endpoints**:
  - `POST /api/arweave/upload` - Upload image (`src/pages/api/arweave/upload.ts`)
  - `POST /api/arweave/uploadMetadata` - Upload JSON metadata

### IBM Cloud Object Storage
- **Package**: `ibm-cos-sdk` ^1.14.1
- **Env**: `IBM_COS_API_KEY`, `IBM_COS_RESOURCE_INSTANCE_ID`
- **Endpoint**: `https://s3.us-south.cloud-object-storage.appdomain.cloud`
- **Bucket**: `luxhub-assets`
- **Usage**: Profile image uploads
- **API endpoint**: `POST /api/ibm/uploadImage` (`src/pages/api/ibm/uploadImage.ts`)

### Next.js Image Optimization
Allowed remote patterns in `next.config.js`:
- `gateway.irys.xyz`
- `arweave.net`
- `*.mypinata.cloud/ipfs/`
- `ipfs.io/ipfs/`

---

## Authentication

### JWT Authentication
- **Package**: `jsonwebtoken` ^9.0.2
- **Hashing**: `bcryptjs` ^3.0.2
- **Secret**: `JWT_SECRET` env var
- **Middleware**: `src/lib/middleware/auth.ts` (Bearer token validation)
- **Token generation**: `src/lib/auth/token.ts`
- **Endpoints**:
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
  - `GET /api/auth/verify`

### Wallet Signature Auth
- **Library**: `tweetnacl` (ed25519 signature verification)
- **Middleware**: `src/lib/middleware/walletAuth.ts`
- **Flow**: Nonce-based challenge-response
  1. Client requests nonce for wallet address
  2. Client signs nonce with wallet
  3. Server verifies signature via `nacl.sign.detached.verify()`
- **Nonce store**: In-memory `Map` (note: should be Redis for multi-instance)
- **Nonce expiry**: 5 minutes

### Privy (Social + Wallet Auth)
- **Package**: `@privy-io/react-auth` ^3.10.0
- **Env**: `NEXT_PUBLIC_PRIVY_APP_ID`
- **Config** (in `src/pages/_app.tsx`):
  - Login methods: `email`, `wallet`
  - Embedded Solana wallets for users without wallets
  - External wallet connectors (Phantom, Solflare via Privy)
  - Dark theme with `#c8a1ff` accent
- **Graceful fallback**: App works without Privy if app ID not configured
- **Sync endpoint**: `POST /api/users/sync-privy`

### Admin Authorization
- **Env**: `ADMIN_WALLETS` (comma-separated), `SUPER_ADMIN_WALLETS`
- **Model**: `src/lib/models/AdminRole.ts`

---

## AI Services

### Anthropic Claude
- **Package**: `@anthropic-ai/sdk` ^0.71.2
- **Env**: `ANTHROPIC_API_KEY`
- **Model used**: `claude-sonnet-4-20250514`
- **Endpoints**:
  - `POST /api/ai/analyze-watch` (`src/pages/api/ai/analyze-watch.ts`)
    - Vision-based watch image analysis
    - Returns: brand, model, condition, authenticity indicators, estimated price
    - Converts USD to SOL using CoinGecko price
  - `POST /api/ai/verify-listing` (`src/pages/api/ai/verify-listing.ts`)
    - Listing verification and authenticity assessment
    - Uses prompt builder from `src/lib/ai/prompts.ts`
- **Rate limited**: Via `aiLimiter` middleware
- **Lazy initialization**: Client created on first request to avoid startup errors

### OpenAI (Installed but unused)
- **Package**: `openai` ^4.100.0
- No active usage found in `src/` directory

### xAI/Grok (Deprecated)
- **Env**: `XAI_API_KEY` (in `.env.example` but no active usage)
- Previously used for Luxury Assistant, now replaced by Anthropic Claude

---

## External APIs

### CoinGecko (Price Feed)
- **No SDK** - Direct HTTP fetch
- **URL**: `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`
- **Usage**:
  - `src/pages/api/users/sol-price.ts` - SOL/USD price endpoint
  - `src/pages/api/ai/analyze-watch.ts` - USD to SOL conversion
  - `src/components/marketplace/PriceDisplay.tsx` - Client-side price display
  - `src/pages/createNFT.tsx` - Price estimation

### Bags API (RWA Tokenization & Trading)
- **Base URL**: `https://public-api-v2.bags.fm/api/v1`
- **Auth**: `x-api-key` header with `BAGS_API_KEY`
- **Env**: `BAGS_API_KEY`, `BAGS_WEBHOOK_SECRET`, `BAGS_PARTNER_WALLET`
- **Endpoints**:
  - `GET /api/bags/trade-quote` (`src/pages/api/bags/trade-quote.ts`)
    - Gets swap quotes for pool token trading
    - Supports USDC and SOL as quote currencies
  - `POST /api/bags/execute-trade` - Execute token swaps
  - `GET /api/bags/partner-stats` - Partner analytics
- **Token mints**:
  - USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - SOL: `So11111111111111111111111111111111111111112`

### EasyPost (Shipping)
- **Package**: `@easypost/api` ^8.4.0
- **Integration**: `src/lib/shipping/easypost.ts`
- **Env**: `EASYPOST_TEST_API_KEY`, `EASYPOST_PRODUCTION_API_KEY`
- **Features**: Shipping label generation, rate comparison, address verification
- **Mode switching**: Test mode on devnet, production on mainnet
- **API endpoints**:
  - `POST /api/escrow/submit-shipment`
  - `GET /api/escrow/pending-shipments`

### Stripe (Fiat Payments)
- **Package**: `stripe` ^17.7.0
- **Env**: `STRIPE_SECRET_KEY`
- **Status**: Optional, for fiat payment support
- **Referenced in**: `src/types/user.d.ts`, `src/lib/database/User.ts`, `src/pages/profile/edit.tsx`

---

## Webhooks

### Bags Webhook
- **Secret**: `BAGS_WEBHOOK_SECRET` env var
- **Purpose**: Receive notifications on trade execution, token events

---

## Vercel Platform

### Edge Config
- **Package**: `@vercel/edge-config` ^1.4.0
- **Env**: `EDGE_CONFIG`
- **Purpose**: Runtime feature flags and configuration

### Deployment
- **Platform**: Vercel (serverless)
- **App URL**: `https://luxhub-gamma.vercel.app`
- **API Runtime**: Node.js (not Edge, explicitly set `runtime: 'nodejs'` on some routes)

---

## Security Services

### PII Encryption
- **Implementation**: `src/lib/security/encryption.ts`
- **Algorithm**: AES-256-GCM
- **Env**: `PII_ENCRYPTION_KEY` (64-char hex), `PII_HASH_SALT`
- **Encrypted fields**: fullName, street1, street2, phone, email, deliveryInstructions
- **Searchable hashing**: HMAC-SHA256 for indexed lookups on encrypted data

### Rate Limiting
- **Implementation**: `src/lib/middleware/rateLimit.ts`
- **Limiters**: `aiLimiter` (AI endpoints), `uploadLimiter` (file uploads)
- **Applied via**: Middleware wrapping on handler functions

### Input Validation
- **Package**: `zod` ^3.25.76
- **Schemas**: `src/lib/validation/schemas.ts`
- **Middleware**: `src/lib/middleware/validate.ts`

### Error Monitoring
- **Implementation**: `src/lib/monitoring/errorHandler.ts`
- **Applied via**: `withErrorMonitoring()` middleware wrapper

---

## Font Services

### Fontshare
- **URL**: `https://api.fontshare.com/v2/css?f[]=clash-display@200,300,400,500,600,700,800&display=swap`
- **Font**: Clash Display (loaded in `src/pages/_app.tsx`)

---

## Integration Dependency Map

```
Client (Browser)
  |
  +-- Solana Wallet Adapters (Phantom, Solflare, Mobile)
  +-- Privy (email login, embedded wallets)
  +-- CoinGecko (SOL/USD price)
  +-- Fontshare (typography)
  |
Next.js API Routes (Vercel Serverless)
  |
  +-- MongoDB Atlas (data persistence)
  +-- Solana RPC (Helius/Alchemy/public)
  |     +-- Anchor Program (escrow marketplace)
  |     +-- Metaplex MPL Core (NFT operations)
  |     +-- Squads Protocol (multisig treasury)
  |     +-- SPL Token (token operations)
  +-- Anthropic Claude (AI watch analysis, listing verification)
  +-- Pinata / Irys / Arweave (decentralized storage)
  +-- IBM Cloud Object Storage (profile images)
  +-- Bags API (RWA token trading)
  +-- EasyPost (shipping labels)
  +-- Stripe (fiat payments)
  +-- Vercel Edge Config (feature flags)
```
