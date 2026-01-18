# Architectural Patterns

Recurring patterns across the LuxHub codebase.

---

## Mongoose Model Patterns

### Pre-Save Hooks for Calculations

Models use pre-save hooks to compute derived fields automatically before persistence.

**Royalty Calculation (3% LuxHub fee):**
- `src/lib/models/Transaction.ts:36-42` - Calculates `luxhubRoyaltyUSD` (3%) and `vendorEarningsUSD` (97%) on sale transactions

**Pool Ownership Calculation:**
- `src/lib/models/Pool.ts:41-54` - Iterates participants to calculate `ownershipPercent = (shares / totalShares) * 100`, auto-sets status to "filled" when fully subscribed

**Distribution Calculation:**
- `src/lib/models/PoolDistribution.ts:31-41` - Splits proceeds: 3% treasury, 97% pro-rata to users

**Price History Tracking:**
- `src/lib/models/Asset.ts:44-49` - Appends current price to `priceHistory` array on modification

**Analytics Aggregation:**
- `src/lib/models/UserAnalytics.ts:19-24` - Calculates net profit (gains - losses)
- `src/lib/models/VendorAnalytics.ts:18-26` - Calculates vendor earnings at 97% rate

### Index Conventions

- Single-field ascending: `{ field: 1 }`
- Composite for filtering/sorting: `{ status: 1, createdAt: -1 }`
- TTL for expiration: `{ expiresAt: 1 }, { expireAfterSeconds: 0 }` (Escrow model)
- Unique constraints: `{ walletAddress: 1 }, { unique: true }`

### Model Export Pattern

```
export const Model = models.Model || model("Model", Schema);
```

This prevents model recompilation in Next.js hot reload. See any model in `src/lib/models/`.

---

## API Route Patterns

### Standard Structure

All API routes in `src/pages/api/` follow this flow:

1. Method validation (405 if wrong method)
2. Input validation (400 with error details)
3. Database connection via `dbConnect()`
4. Database operation
5. Success response (200/201)
6. Error handling with console logging (500)

**Reference implementations:**
- `src/pages/api/vendor/onboard-b-api.ts:1-80` - Full Zod validation example
- `src/pages/api/auth/signup.ts` - JWT token creation pattern
- `src/pages/api/nft/requestMint.ts` - Protected route with auth middleware

### Validation with Zod

- `src/pages/api/vendor/onboard-b-api.ts:8-22` - Schema definition with wallet, strings, optional fields
- Returns 400 with `error.errors` array on validation failure

### Auth Middleware

- `src/lib/middleware/auth.ts` - Extracts Bearer token, verifies JWT, attaches user to request
- Usage: `import { authMiddleware } from '@/lib/middleware/auth'`

---

## Wallet/Solana Integration Patterns

### Wallet Provider Setup

- `src/pages/_app.tsx:1-99` - ConnectionProvider + WalletProvider + WalletModalProvider wrapping
- Wallets configured: RemoteSolanaMobileWalletAdapter, PhantomWalletAdapter, SolflareWalletAdapter

### Anchor Program Access

- `src/utils/programUtils.ts` - `getProgram(wallet)` returns typed Anchor Program instance
- Creates AnchorProvider from wallet context and connection
- Throws if wallet not connected

### Wallet State Usage

Components access wallet via `useWallet()` hook:
- `src/components/common/WalletNavbar.tsx:1-50` - Balance fetching, connect/disconnect
- `src/components/common/Navbar.tsx:26-51` - Admin status checking via on-chain PDA

### Balance Fetching Pattern

```
const lamports = await connection.getBalance(publicKey);
const solBalance = lamports / 1e9;
```

Used in: `src/components/common/WalletNavbar.tsx:22-34`

### Admin Gating

- Fetch admin list from program PDA: `program.account.adminList.fetch(adminListPda)`
- Compare wallet address against admin array
- Conditionally render admin UI: `src/components/common/Navbar.tsx:79-80`

---

## Component Patterns

### Standard Structure

Components in `src/components/` follow:

1. React imports + hooks
2. CSS module import: `import styles from '../../styles/ComponentName.module.css'`
3. TypeScript interface for props
4. Functional component with hooks
5. Default export

### Context Provider Pattern

- `src/components/marketplace/PriceDisplay.tsx:1-63` - Defines context, provider component, and `usePriceDisplay()` hook
- Fetches SOL price from CoinGecko on interval
- Provides `formatPrice()` utility for USD/SOL display toggle

### Form Component Pattern

- `src/components/user/MintRequestForm.tsx` - Multiple useState for form fields
- Image conversion to Base64 for upload
- Field rendering helper: `renderField(label, description, element)`
- API submission with full payload construction

---

## CSS Module Patterns

### Naming Convention

One CSS module per component: `src/styles/[ComponentName].module.css`

### Design System

**Glass-morphism:**
- `backdrop-filter: blur(25px)` + `-webkit-backdrop-filter: blur(25px)`
- Semi-transparent backgrounds: `rgba(0, 0, 0, 0.68)`

**Color Palette:**
- Primary: `#c8a1ff` (light purple)
- Background: `#000000` with opacity variants
- Text: `#ffffff`, `rgba(255, 255, 255, 0.7)`
- Success: `#a0ffa0` (green)

**Common Transitions:**
- `transition: all 0.3s ease-in-out`
- Hover: `transform: scale(1.05)`, `box-shadow: 0px 0px 5px 0px #c8a1ff`

**Reference files:**
- `src/styles/WalletNavbar.module.css` - Wallet orb, panel, buttons
- `src/styles/NFTCard.module.css` - Card with hover overlay
- `src/styles/VendorDashboard.module.css` - Dashboard layout

---

## Anchor Program Patterns

### Account State Definition

- `Solana-Anchor/programs/luxhub-marketplace/src/state/escrow.rs:1-23` - Escrow struct with SIZE constant
- `Solana-Anchor/programs/luxhub-marketplace/src/state/config.rs:1-11` - Config struct

### Context (Accounts) Pattern

- `Solana-Anchor/programs/luxhub-marketplace/src/contexts/initialize.rs` - Account constraints, PDA derivation
- Seeds for PDAs: `seeds = [ESCROW_SEED, &seed.to_le_bytes()[..]]`

### Instruction Handler Pattern

- `Solana-Anchor/programs/luxhub-marketplace/src/instructions/exchange.rs` - Business logic
- Uses CPI for SPL token transfers
- Returns `Result<()>` with custom errors

### Program Entry Points

- `Solana-Anchor/programs/luxhub-marketplace/src/lib.rs:21-58` - `#[program]` module with all instruction handlers:
  - `initialize_config` - Set up multisig config
  - `initialize` - Create escrow
  - `exchange` - Execute trade
  - `confirm_delivery` - Finalize transaction
  - `admin_only_example` - Admin-gated operation

---

## Escrow/Transaction Flow

1. **Initialize:** Seller creates escrow PDA with NFT locked (`initialize` instruction)
2. **Exchange:** Buyer deposits SOL to escrow vault (`exchange` instruction)
3. **Confirm Delivery:** After physical delivery verified, funds released (`confirm_delivery`)
4. **Royalty:** 3% calculated and sent to treasury wallet

Key files:
- `Solana-Anchor/programs/luxhub-marketplace/src/contexts/` - All account contexts
- `Solana-Anchor/programs/luxhub-marketplace/src/instructions/` - All handlers
- `src/lib/models/Escrow.ts` - MongoDB escrow tracking with TTL index
