# LuxHub Code Conventions

## TypeScript Configuration

- **Target:** ES2022 with strict mode enabled
- **Module:** ESNext with bundler module resolution (Next.js 16+)
- **Path aliases:** `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- **Skip lib check:** Enabled to avoid Solana SDK type conflicts
- **JSX:** `react-jsx` (no need for `import React` in every file)

Key file: `/home/ycstudio/LuxHub/tsconfig.json`

## Prettier Configuration

Defined in `/home/ycstudio/LuxHub/.prettierrc`:

- Print width: 100
- Tab width: 2 (spaces, not tabs)
- Semicolons: always
- Single quotes: yes
- Trailing commas: `es5`
- Bracket spacing: yes
- Arrow parens: always
- End of line: LF

## ESLint Configuration

Flat config format in `/home/ycstudio/LuxHub/eslint.config.js`:

- Extends `@eslint/js` recommended
- Plugins: `@typescript-eslint`, `react`, `react-hooks`, `@next/next`
- **`@typescript-eslint/no-unused-vars`**: warn (ignores `_` prefixed args/vars)
- **`@typescript-eslint/no-explicit-any`**: warn (not error, widely used in codebase)
- **`@typescript-eslint/no-require-imports`**: off (dynamic requires allowed)
- **`react/react-in-jsx-scope`**: off (not needed with `react-jsx`)
- **`react-hooks/rules-of-hooks`**: error
- **`react-hooks/exhaustive-deps`**: warn
- **`no-console`**: warn (console.log still present in many files)
- **Security rule**: Custom restricted syntax pattern to detect hardcoded secrets

## Pre-commit Hooks

Configured via Husky + lint-staged in `package.json`:

- **`.ts/.tsx` files**: `eslint --fix --max-warnings 1000` then `prettier --write`
- **`.css` files**: `prettier --write`

Max warnings is set high (1000) to avoid blocking commits while the codebase stabilizes.

---

## Component Patterns

### Functional Components

All components use functional component syntax. No class components exist in the codebase.

**Default export pattern** (most common):

```typescript
export default function ComponentName() { ... }
```

Example: `src/components/common/Navbar.tsx`

**Named export with memo pattern** (performance-sensitive components):

```typescript
const ComponentName = memo(({ prop1, prop2 }: Props) => { ... });
ComponentName.displayName = 'ComponentName';
export default ComponentName;
```

Example: `src/components/marketplace/NFTCard.tsx`

### Props Interfaces

Props are defined as interfaces directly above the component, in the same file. There is no separate types file for component props.

```typescript
interface NFTCardProps {
  nft: NFT;
  onClick: () => void;
  onQuickBuy?: () => void;
}
```

Exported prop interfaces use the `export` keyword when needed by other components:

```typescript
export interface UnifiedNFTCardProps {
  title: string;
  image?: string;
  ...
}
```

See: `src/components/common/UnifiedNFTCard.tsx`

### Hooks Usage

- **`useState`** for local component state
- **`useMemo`** for derived/computed values (heavily used in NFTCard for price/image resolution)
- **`useCallback`** for event handlers passed to children
- **`useEffect`** for client-side initialization and data fetching
- **`dynamic()` from `next/dynamic`** for lazy-loaded components with `ssr: false`

### Client-Side Rendering Guard

A common pattern for avoiding SSR mismatches with wallet components:

```typescript
const [isClient, setIsClient] = useState(false);
useEffect(() => { setIsClient(true); }, []);
// Then: {isClient && <WalletComponent />}
```

See: `src/pages/_app.tsx:49-53`, `src/components/common/Navbar.tsx:24-26`

### Custom Hooks

Located in `src/hooks/`:

| Hook | File | Purpose |
|------|------|---------|
| `useUserRole` | `src/hooks/useUserRole.ts` | Unified role detection (admin/vendor/user/browser) with SWR |
| `useSWR` (collection) | `src/hooks/useSWR.ts` | Pre-configured SWR hooks for pools, vendors, escrows, offers, etc. |
| `usePools` | `src/hooks/usePools.ts` | Pool data fetching |
| `useNotifications` | `src/hooks/useNotifications.ts` | Notification polling |

Custom hooks follow the pattern of returning an object with `data`, `isLoading`, `isError`, and `mutate`:

```typescript
export function useVendors() {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, config);
  return { vendors: data?.vendors || [], isLoading, isError: error, mutate };
}
```

### Context Providers

Defined as standalone files with `createContext` + custom provider component + `useContext` hook:

```typescript
const PriceDisplayContext = createContext<PriceDisplayContextType | undefined>(undefined);
export const PriceDisplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => { ... };
export const usePriceDisplay = () => useContext(PriceDisplayContext);
```

See: `src/components/marketplace/PriceDisplay.tsx`

---

## API Route Patterns

### File Location

All API routes live under `src/pages/api/` following Next.js pages router conventions.

### Handler Structure

Every API route exports a default async handler function:

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) { ... }
```

### Method Validation

Two styles exist in the codebase:

**Style 1 -- Early return (preferred in newer routes):**
```typescript
if (req.method !== 'POST') {
  return res.status(405).json({ error: 'Method not allowed' });
}
```

**Style 2 -- If-else block (older routes):**
```typescript
if (req.method === "POST") {
  // ... handler logic
} else {
  res.status(405).json({ message: "Method Not Allowed" });
}
```

### Request Body Destructuring

Body fields are destructured at the top of the handler, then validated:

```typescript
const { assetId, vendorWallet, targetAmountUSD } = req.body;
if (!assetId || !vendorWallet || !targetAmountUSD) {
  return res.status(400).json({ error: 'Missing required fields' });
}
```

Some newer routes cast the body to a typed interface:

```typescript
const { wallet, businessName, username } = req.body as RegisterVendorRequest;
```

### Database Connection

Every API route that touches MongoDB calls `dbConnect()` before any database operations:

```typescript
await dbConnect();
```

The `dbConnect` function (`src/lib/database/mongodb.ts`) uses a cached global connection pattern to avoid reconnecting on every request.

### Response Patterns

**Success responses** vary between two styles:

```typescript
// Style 1: Simple object
res.status(200).json({ message: "Sale request received" });

// Style 2: Structured with success flag (newer routes)
return res.status(201).json({ success: true, pool: { ... } });
```

**Error responses:**
```typescript
// 400 - Validation errors
return res.status(400).json({ error: 'Missing required fields' });

// 404 - Not found
return res.status(404).json({ error: 'Asset not found' });

// 409 - Conflict
return res.status(409).json({ error: 'Username already taken' });

// 500 - Server errors
return res.status(500).json({ error: error.message || 'Failed to create pool' });
```

### Error Handling in Catch Blocks

Two patterns:

```typescript
// Pattern 1: error typed as `any`
catch (error: any) {
  console.error('Create pool error:', error);
  return res.status(500).json({ error: error.message || 'Failed to create pool' });
}

// Pattern 2: error typed as `unknown` (newer, safer)
catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return res.status(500).json({ error: 'Failed to register vendor', details: message });
}
```

### Console Error Logging

API errors are logged with a prefix indicating the route:

```typescript
console.error('[/api/vendor/register] Error:', error);
console.error('AI Analysis Error:', error);
```

### Zod Validation Middleware

Newer routes use Zod schemas from `src/lib/validation/schemas.ts` with validation middleware from `src/lib/middleware/validate.ts`:

```typescript
export default aiLimiter(withErrorMonitoring(handler));
```

Middleware is composed via function wrapping (higher-order functions), not `next-connect` middleware chains.

### Middleware Composition

Middleware wraps handlers as HOFs:

```typescript
// Rate limiting + error monitoring
export default aiLimiter(withErrorMonitoring(handler));

// Wallet authentication
export default withWalletAuth(handler);
```

A `composeMiddleware` utility exists in `src/lib/middleware/validate.ts` for combining multiple middleware.

### Authentication

Two auth systems coexist:

1. **JWT auth** (`src/lib/middleware/auth.ts`): Bearer token in Authorization header, attaches `req.user`
2. **Wallet signature auth** (`src/lib/middleware/walletAuth.ts`): Nonce-based ed25519 signature verification, attaches `req.wallet`

### Rate Limiting

Pre-configured limiters in `src/lib/middleware/rateLimit.ts`:

| Limiter | Requests/min | Use Case |
|---------|-------------|----------|
| `apiLimiter` | 60 | General endpoints |
| `aiLimiter` | 10 | AI analysis (expensive) |
| `uploadLimiter` | 20 | File uploads |
| `webhookLimiter` | 100 | Helius webhooks |
| `strictLimiter` | 5 | Sensitive operations |

### Runtime Configuration

Some API routes export a Next.js runtime config:

```typescript
export const config = { runtime: 'nodejs' };
```

---

## Mongoose Model Patterns

### File Location

All models are in `src/lib/models/`. Each model gets its own file.

### Two Export Styles

**Style 1 -- Default export with `mongoose.models` guard (older models):**
```typescript
import mongoose from 'mongoose';
const NftSchema = new mongoose.Schema({ ... }, { timestamps: true });
export default mongoose.models.NFT || mongoose.model('NFT', NftSchema);
```

See: `src/lib/models/NFT.ts`, `src/lib/models/marketplaceNFTs.ts`

**Style 2 -- Named export with destructured `{ Schema, model, models }` (newer models):**
```typescript
import { Schema, model, models } from 'mongoose';
const PoolSchema = new Schema({ ... }, { timestamps: true });
export const Pool = models.Pool || model('Pool', PoolSchema);
```

See: `src/lib/models/Pool.ts`, `src/lib/models/Vendor.ts`, `src/lib/models/Transaction.ts`, `src/lib/models/User.ts`, `src/lib/models/Escrow.ts`

### Schema Options

All schemas use `{ timestamps: true }` to auto-generate `createdAt` and `updatedAt` fields.

### Schema Organization

Larger schemas use section comment headers:

```typescript
// ========== ASSET REFERENCE ==========
// ========== POOL CONFIGURATION ==========
// ========== PARTICIPANTS ==========
```

### Field Patterns

- **Enums** use `type: String, enum: [...]` with explicit values
- **References** use `type: Schema.Types.ObjectId, ref: 'ModelName'`
- **Soft deletes** use `deleted: { type: Boolean, default: false }`
- **Status fields** include `index: true` for query performance
- **Embedded subdocuments** are defined inline or as separate schemas (e.g., `LinkedWalletSchema` in User)

### Indexes

Indexes are defined both inline and explicitly:

```typescript
// Inline
wallet: { type: String, unique: true, sparse: true, index: true }

// Explicit (compound or special)
PoolSchema.index({ escrowId: 1 });
PoolSchema.index({ vendorWallet: 1 });
TransactionSchema.index({ type: 1, createdAt: -1 });
EscrowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
```

### Pre-Save Hooks

Used for computed fields and business logic:

- **Transaction**: 3% royalty calculation on sales (`src/lib/models/Transaction.ts:47-53`)
- **Pool**: Ownership percentages, share price, vendor payment, distribution amounts (`src/lib/models/Pool.ts:245-301`)
- **Escrow**: Royalty calculation, auto-status transitions (`src/lib/models/Escrow.ts:185-202`)

Hook pattern:
```typescript
SchemaName.pre('save', function(next) {
  if (this.isModified('fieldName') && this.fieldName) {
    // compute derived values
  }
  next();
});
```

### Instance Methods

Used sparingly. Example from User model:

```typescript
UserSchema.methods.getPrimaryWallet = function() { ... };
UserSchema.methods.hasWallet = function(address: string) { ... };
```

---

## Zod Validation Schemas

Centralized in `src/lib/validation/schemas.ts`. Organized by domain:

- **Primitives**: `SolanaAddressSchema`, `IPFSCidSchema`, `ArweaveTxIdSchema`
- **Assets**: `CreateAssetSchema`, `AssetStatusSchema`, `LuxuryCategorySchema`
- **AI**: `AnalyzeImageSchema`, `VerifyListingSchema`, `VerificationResultSchema`
- **Webhooks**: `HeliusWebhookEventSchema`, `HeliusWebhookPayloadSchema`
- **Common**: `PaginationQuerySchema`, `SuccessResponseSchema`, `ErrorResponseSchema`

Type inference pattern:
```typescript
export const CreateAssetSchema = z.object({ ... });
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;
```

---

## CSS Module Patterns

### File Organization

Every component has a matching CSS Module: `src/styles/ComponentName.module.css`. There are 70+ CSS module files.

Global styles live in `src/styles/globals.css`. The design system reference is in `src/styles/LuxHubTheme.css`.

### Glass-Morphism Variables

Most CSS modules redeclare theme variables at the container root (not using a global CSS custom property layer):

```css
.container {
  --accent: #c8a1ff;
  --accent-dim: #c8a1ff40;
  --accent-glow: #c8a1ff20;
  --bg-dark: #0d0d0d;
  --border: #222222;
  --glass: rgba(13, 13, 13, 0.85);
  --text-primary: #ffffff;
  --text-secondary: #a1a1a1;
}
```

### Glass Card Pattern

```css
.card {
  background: var(--glass);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border: 1px solid var(--border);
  border-radius: 12px;
}
```

### Navbar Glass Pattern

```css
.navbar {
  background: #43434352;
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  position: fixed;
  z-index: 1000;
}
```

### Responsive Design

Mobile styles use `@media` queries within the same CSS module. Mobile-specific class names use a `mobile` prefix:

```css
.mobileNavContainer { display: none; }
@media (max-width: 768px) {
  .navbarContainer { display: none; }
  .mobileNavContainer { display: flex; }
}
```

### Accent Color Usage

- Interactive elements, CTAs: `#c8a1ff` (solid)
- Borders on hover: `#c8a1ff40` (25% opacity)
- Background glows: `#c8a1ff20` (12% opacity)
- Wallet button backgrounds: `#c8a1ff63`

---

## Import Ordering

No enforced import order via ESLint. The observed convention is:

1. React/Next.js imports (`react`, `next/*`)
2. Third-party libraries (`@solana/*`, `swr`, `framer-motion`, icons)
3. Local components (`../components/*`)
4. Hooks (`@/hooks/*`)
5. Utilities/models (`@/lib/*`, `@/utils/*`)
6. CSS Module import (always last)

```typescript
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from '../../styles/Navbar.module.css';
import Link from 'next/link';
import { FaTimes } from 'react-icons/fa';
import NotificationBell from './NotificationBell';
import { useUserRole } from '@/hooks/useUserRole';
```

Note: `next/link` and CSS imports are sometimes interleaved with third-party imports. The ordering is not strictly enforced.

### Path Alias vs Relative Imports

Both `@/` alias paths and relative paths (`../../`) are used. There is no strict rule, but newer files tend to use `@/` for deep imports.

---

## Naming Conventions

### Files

- **Pages**: camelCase (`createNFT.tsx`, `adminDashboard.tsx`, `learnMore.tsx`)
- **Components**: PascalCase (`Navbar.tsx`, `NFTCard.tsx`, `UnifiedNFTCard.tsx`)
- **API routes**: camelCase or kebab-case (`requestSale.ts`, `analyze-watch.ts`, `pending-shipments.ts`)
- **Models**: PascalCase (`Pool.ts`, `Vendor.ts`, `NFT.ts`)
- **Hooks**: camelCase with `use` prefix (`useUserRole.ts`, `useSWR.ts`)
- **CSS Modules**: PascalCase matching component (`Navbar.module.css`, `NFTCard.module.css`)
- **Utilities**: camelCase (`programUtils.ts`, `formatUtils.ts`, `imageUtils.ts`)

### Variables and Functions

- **Components**: PascalCase (`Navbar`, `NFTCard`)
- **Functions**: camelCase (`getProgram`, `dbConnect`, `verifyWalletSignature`)
- **Constants**: camelCase or SCREAMING_SNAKE for true constants (`NONCE_EXPIRY_MS`, `CONFIG_SEED`)
- **Interfaces**: PascalCase (`NFTCardProps`, `WatchAnalysis`, `AuthenticatedRequest`)
- **Types**: PascalCase (`NFTStatus`, `CardVariant`, `UserRole`)
- **Enums (as union types)**: String literals (`'admin' | 'vendor' | 'user'`)

### Schema/Model Names

- Schema variable: `PascalCaseSchema` (`PoolSchema`, `VendorSchema`)
- Exported model: PascalCase (`Pool`, `Vendor`, `Transaction`)
- MongoDB collection name: derived automatically by Mongoose (pluralized lowercase)

---

## Data Fetching Patterns

### Client-Side

SWR is the primary data fetching library for client components. Custom hooks in `src/hooks/useSWR.ts` wrap SWR with domain-specific defaults.

Common SWR configuration:
```typescript
{
  revalidateOnFocus: false,
  dedupingInterval: 30000,  // 30 seconds
  errorRetryCount: 2,
}
```

### Server-Side (API Routes)

Direct Mongoose queries. No ORM abstraction layer -- queries are written inline in API handlers.

### External APIs

- `fetch()` for external API calls (CoinGecko for SOL price)
- Anthropic SDK for AI analysis (lazy-initialized)
- Squads SDK for multisig operations

---

## Error Handling Summary

| Layer | Pattern |
|-------|---------|
| API routes | try/catch with console.error + JSON error response |
| Components | ErrorBoundary at app level (`react-error-boundary`) |
| SWR hooks | Error returned via `isError` property |
| Mongoose hooks | `next()` propagation |
| Wallet operations | try/catch with user-facing toast notifications |
| Middleware | Early return with structured error JSON |

---

## Type Safety Notes

- `any` is used frequently, especially for Mongoose document types, Anchor program accounts, and wallet adapter interop
- ESLint warns on `any` but does not block
- `as any` casts appear in middleware (`(req as any).user = decoded`) and Anchor interactions
- Zod schemas provide runtime validation but are not consistently applied across all routes (only newer AI/asset routes use them)
