# LuxHub Testing Documentation

## Overview

LuxHub has testing infrastructure configured but **very few actual tests written**. The testing setup is complete for both frontend (Jest) and smart contracts (ts-mocha/Anchor), but coverage of the application code is minimal.

---

## Frontend Testing (Jest)

### Framework & Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Jest | via `ts-jest` 29.x | Test runner |
| `@testing-library/react` | 16.x | React component testing |
| `@testing-library/jest-dom` | 6.x | DOM assertion matchers |
| `ts-jest` | 29.x | TypeScript transform for Jest |
| `identity-obj-proxy` | 3.x | CSS Module mock |
| `jest-environment-jsdom` | 29.x | Browser-like DOM environment |

### Configuration

**Config file:** `/home/ycstudio/LuxHub/jest.config.cjs`

Key settings:
- **Test environment:** `jsdom`
- **Transform:** ts-jest with `react-jsx` JSX setting
- **Module aliases:** `@/*` mapped to `<rootDir>/src/$1`
- **CSS Modules:** Proxied via `identity-obj-proxy` (class names return themselves)
- **Plain CSS:** Mocked via `__mocks__/styleMock.js` (empty object)
- **Images/assets:** Mocked via `__mocks__/fileMock.js` (returns `'test-file-stub'`)
- **Ignored paths:** `node_modules/`, `.next/`, `Solana-Anchor/`

### Coverage Configuration

```javascript
collectCoverageFrom: [
  "src/**/*.{ts,tsx}",
  "!src/**/*.d.ts",
  "!src/pages/_app.tsx",
  "!src/pages/_document.tsx",
  "!src/pages/api/**/*",      // API routes excluded from coverage
],
coverageThreshold: {
  global: {
    branches: 50,
    functions: 50,
    lines: 50,
    statements: 50,
  },
},
```

Note: API routes are explicitly excluded from frontend coverage collection. The 50% thresholds are aspirational -- there are currently no test files in the `src/` directory.

### Setup File

**File:** `/home/ycstudio/LuxHub/jest.setup.cjs`

Provides these global mocks:

1. **`@testing-library/jest-dom`** -- Extended DOM matchers (`.toBeInTheDocument()`, etc.)
2. **`next/router`** -- Mocked `useRouter` returning stub functions (`push`, `replace`, `back`, etc.)
3. **`next/navigation`** -- Mocked App Router hooks (`useRouter`, `usePathname`, `useSearchParams`)
4. **`next/image`** -- Replaced with plain `<img>` element
5. **`window.matchMedia`** -- Stub implementation
6. **`ResizeObserver`** -- Stub implementation
7. **`IntersectionObserver`** -- Stub implementation
8. **Console suppression** -- Filters out React DOM render warnings during tests

### Mock Files

| File | Path | Purpose |
|------|------|---------|
| `styleMock.js` | `__mocks__/styleMock.js` | Returns `{}` for plain CSS imports |
| `fileMock.js` | `__mocks__/fileMock.js` | Returns `'test-file-stub'` for image/asset imports |

### Test Commands

```bash
npm test                # Run all Jest tests
npm run test:watch      # Watch mode (re-run on file changes)
npm run test:coverage   # Run with coverage report
```

### Test File Locations

**There are currently zero test files** in the `src/` directory. No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files exist outside of `node_modules/`.

The Jest config does not specify a `testMatch` pattern, so it uses the default: files in `__tests__/` directories or files matching `*.test.*` / `*.spec.*`.

### What Needs Tests (Not Currently Tested)

Based on the codebase structure, the following areas have no test coverage:

**Components (0% coverage):**
- `src/components/common/Navbar.tsx` -- Navigation with role-based rendering
- `src/components/common/UnifiedNFTCard.tsx` -- Core card component with many variants
- `src/components/marketplace/NFTCard.tsx` -- Wrapper with image/price resolution logic
- `src/components/marketplace/PriceDisplay.tsx` -- SOL/USD price context provider
- `src/components/marketplace/BuyModal.tsx` -- Purchase flow
- `src/components/marketplace/MakeOfferModal.tsx` -- Offer creation

**Hooks (0% coverage):**
- `src/hooks/useUserRole.ts` -- Role detection logic (admin/vendor/user)
- `src/hooks/useSWR.ts` -- Custom SWR data fetching hooks
- `src/hooks/useNotifications.ts` -- Notification polling

**Utilities (0% coverage):**
- `src/utils/programUtils.ts` -- Anchor program initialization
- `src/utils/formatUtils.ts` -- Price/address formatting
- `src/utils/imageUtils.ts` -- Image URL resolution

**Validation schemas (0% coverage):**
- `src/lib/validation/schemas.ts` -- Zod schemas (highly testable, pure functions)

**Middleware (0% coverage, excluded from coverage config):**
- `src/lib/middleware/auth.ts` -- JWT auth
- `src/lib/middleware/walletAuth.ts` -- Wallet signature verification
- `src/lib/middleware/rateLimit.ts` -- Rate limiting
- `src/lib/middleware/validate.ts` -- Zod validation middleware

**Models (0% coverage, excluded from coverage config):**
- Pre-save hooks contain business logic (royalty calculation, ownership percentages)
- `src/lib/models/Transaction.ts:47-53` -- 3% royalty calculation
- `src/lib/models/Pool.ts:245-301` -- Ownership, vendor payment, distribution calculations
- `src/lib/models/Escrow.ts:185-202` -- Auto-status transitions

### Recommended Testing Approach

If tests were to be added, they would likely need these additional mocks:

**Solana wallet adapter:**
```typescript
jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({ publicKey: null, connected: false }),
  useConnection: () => ({ connection: {} }),
}));
```

**Privy auth:**
```typescript
jest.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: false }),
  PrivyProvider: ({ children }) => children,
}));
```

**MongoDB/Mongoose** (for API route tests):
```typescript
jest.mock('../../lib/database/mongodb', () => jest.fn().mockResolvedValue({}));
```

---

## Smart Contract Testing (Anchor/ts-mocha)

### Framework

| Tool | Purpose |
|------|---------|
| Anchor | Build and test Solana programs |
| ts-mocha | TypeScript-aware Mocha runner |
| Chai | Assertion library (`expect` syntax) |
| `@coral-xyz/anchor` | Anchor client SDK |
| `@solana/spl-token` | SPL Token operations in tests |

### Test Files

| File | Purpose |
|------|---------|
| `Solana-Anchor/tests/luxhub_marketplace.ts` | Main escrow marketplace tests |
| `Solana-Anchor/tests/anchor-escrow.ts` | Likely an earlier/alternate test file |

### Test Command

```bash
npm run test:anchor    # Runs: cd Solana-Anchor && anchor test
```

This spins up a local Solana validator, deploys the program, and runs the tests.

### Test Structure (`luxhub_marketplace.ts`)

The test file follows a sequential integration test pattern where each `it()` block depends on state from previous blocks:

```
1. "environment info"          -- Logs program ID, cluster, actor wallets
2. "sets up wallets, mints..."  -- Airdrops SOL, creates token mints and ATAs
3. "initialize_config"          -- Calls initialize_config instruction
4. "initialize escrow"          -- Creates escrow, transfers NFT to vault
5. "exchange"                   -- Buyer deposits funds to escrow
```

### Test Patterns

**Actor setup:**
```typescript
const admin = (provider.wallet as anchor.Wallet).payer;
const seller = Keypair.generate();
const buyer = Keypair.generate();
```

**PDA derivation:**
```typescript
const CONFIG_SEED = Buffer.from("luxhub-config");
const ESCROW_SEED = Buffer.from("state");
[configPda, configBump] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
```

**Instruction calls:**
```typescript
const sig = await program.methods
  .initialize(escrowSeed, initializerAmount, takerAmount, fileCid, salePrice)
  .accounts({ admin: admin.publicKey, seller: seller.publicKey, ... })
  .signers([seller, nftVault, wsolVault])
  .rpc();
```

**Assertions (Chai):**
```typescript
expect(Number(sellerNftAcc.amount)).to.eq(0);
expect(Number(vaultNftAcc.amount)).to.eq(1);
expect(escrowAcc.initializer.toBase58()).to.eq(seller.publicKey.toBase58());
```

**Error handling in tests:**
```typescript
try {
  const sig = await program.methods.initializeConfig(...).accounts({...}).rpc();
} catch (e: any) {
  console.error("initialize_config failed:", e?.logs ?? e);
  throw e;
}
```

### Helper Functions

The test file includes debug helpers:

- `airdrop(pubkey, sol, label)` -- Airdrops SOL and logs
- `dumpTokenAcc(label, address)` -- Logs token account state
- `dumpEscrowState(label, escrowPk)` -- Logs escrow PDA state
- `logHdr(title)` -- Section header logging

### What's Tested (Smart Contracts)

- Config initialization with Squads multisig/authority
- Escrow initialization (NFT transfer to vault)
- Token exchange (buyer funds deposit)

### What's NOT Tested (Smart Contracts)

- `confirm_delivery` instruction (gated by Squads CPI)
- `refund_buyer` instruction
- Escrow cancellation
- Edge cases (insufficient funds, invalid accounts, re-initialization)
- Admin-only instruction access control
- Sale price validation

---

## End-to-End Testing

There is **no E2E testing framework** configured (no Cypress, Playwright, or similar).

---

## CI/CD Testing

According to `CLAUDE.md`, a CI pipeline is documented:

> CI Pipeline: Runs on PR/push to main (lint, typecheck, build, test)

However, no GitHub Actions workflow files were found in the repository root. The pipeline may be configured in Vercel's build settings rather than via GitHub Actions.

### Build Verification Commands

```bash
npm run lint           # ESLint check
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm run build          # Next.js production build
npm test               # Jest tests (currently no tests to run)
```

---

## Testing Gap Summary

| Area | Status | Priority |
|------|--------|----------|
| Zod validation schemas | Not tested | High -- pure functions, easy to test |
| Middleware (auth, rate limit, validate) | Not tested | High -- security-critical |
| Mongoose pre-save hooks (royalty calc) | Not tested | High -- financial logic |
| Utility functions | Not tested | Medium -- formatting, image resolution |
| Custom hooks | Not tested | Medium -- data fetching wrappers |
| React components | Not tested | Medium -- UI rendering |
| API routes | Excluded from coverage | Medium -- business logic |
| Smart contract edge cases | Not tested | High -- on-chain security |
| E2E flows | No framework | Low -- complex setup needed |

The infrastructure is ready (Jest configured, mocks in place, setup file complete), but no application tests have been written yet.
