# LuxHub Codebase Concerns

Audit date: 2026-03-13

---

## 1. Security Concerns

### 1.1 Unauthenticated API Routes (Critical)

Many API endpoints that perform privileged or mutating operations have **no authentication whatsoever**. Anyone who discovers the endpoint can call it.

| Endpoint | Risk |
|----------|------|
| `src/pages/api/nft/updateStatus.ts` | Unauthenticated. Anyone can change an NFT's market status. |
| `src/pages/api/nft/updateBuyer.ts` | Unauthenticated. Anyone can assign a buyer to an escrow sale. |
| `src/pages/api/nft/requestSale.ts` | Unauthenticated. Anyone can create sale requests. |
| `src/pages/api/nft/markRequestApproved.ts` | Unauthenticated. Anyone can approve metadata change requests. |
| `src/pages/api/nft/markRequestRejected.ts` | Unauthenticated. Anyone can reject metadata change requests. |
| `src/pages/api/nft/requestMetadataChange.ts` | Unauthenticated. Anyone can request metadata changes. |
| `src/pages/api/vendor/approve.ts` | Unauthenticated. Anyone can approve a vendor. |
| `src/pages/api/vendor/reject.ts` | Unauthenticated. Anyone can reject (and delete) a vendor. |
| `src/pages/api/vendor/generateInvite.ts` | Checks for `adminWallet` in body but never validates it. Anyone can generate invite codes by providing any wallet string. |
| `src/pages/api/assets/create.ts` | Unauthenticated. Anyone can create asset records. |
| `src/pages/api/assets/createPending.ts` | Unauthenticated. Anyone can create pending assets. |
| `src/pages/api/assets/update.ts` | Unauthenticated. Anyone can update asset records. |
| `src/pages/api/pool/create.ts` | Unauthenticated. Anyone can create fractional ownership pools. |
| `src/pages/api/pool/invest.ts` | Unauthenticated. Anyone can record investment entries without on-chain verification. |
| `src/pages/api/pool/buy.ts` | No wallet signature verification. |
| `src/pages/api/offers/create.ts` | No wallet signature verification for buyer identity. |
| `src/pages/api/storage/upload.ts` | Unauthenticated. Anyone can upload files to Irys/Pinata at the project's expense. |
| `src/pages/api/pinata/imgUpload.ts` | Unauthenticated file upload to Pinata. |

### 1.2 Spoofable Admin Authorization (Critical)

Many admin endpoints use `x-wallet-address` or `x-admin-wallet` **headers** for authorization without requiring a wallet signature. An attacker who knows an admin wallet address can spoof the header:

- `src/pages/api/admin/nft/freeze.ts` (line 20)
- `src/pages/api/admin/nft/thaw.ts` (line 19)
- `src/pages/api/admin/nft/burn.ts` (line 20)
- `src/pages/api/admin/nft/update-metadata.ts` (line 52)
- `src/pages/api/admin/assets/cleanup.ts` (line 14)
- `src/pages/api/admin/team/index.ts` (line 13)
- `src/pages/api/admin/team/[wallet].ts` (line 18)
- `src/pages/api/admin/mint-requests/index.ts` (line 18)
- `src/pages/api/admin/mint-requests/[id].ts` (line 14)
- `src/pages/api/admin/mint-requests/review.ts` (line 18)
- `src/pages/api/admin/mint-requests/mint.ts` (line 49)
- `src/pages/api/admin/mint-requests/approve-and-mint.ts` (line 25)
- `src/pages/api/admin/delist-requests/index.ts` (line 18)
- `src/pages/api/admin/delist-requests/[id].ts` (line 24)
- `src/pages/api/admin/api/listings/approve.ts` (line 13)
- `src/pages/api/vault/config.ts` (line 74)
- `src/pages/api/vault/config/admins.ts` (line 14)
- `src/pages/api/vault/config/change-multisig.ts` (line 15)
- `src/pages/api/platform/config.ts` (line 14, 97)

**Only the Squads endpoints and address endpoints use proper `withWalletAuth` middleware that verifies signed messages.**

### 1.3 Admin Token Endpoint Without Signature

`src/pages/api/auth/admin-token.ts` - Issues JWT admin tokens based solely on a wallet address in the request body or `x-admin-wallet` header. No signature verification. An attacker who knows an admin wallet can obtain admin JWTs.

### 1.4 PII Encryption Fallback (High)

`src/lib/security/encryption.ts` (lines 15-21) - When `PII_ENCRYPTION_KEY` is not set, encryption uses a hardcoded deterministic key derived from `'luxhub-dev-key-change-me'`. The `PII_HASH_SALT` also falls back to a hardcoded value `'luxhub-hash-salt'` (line 161). Any data encrypted without the env var set is trivially decryptable.

### 1.5 ADMIN_SECRET Used as Both Keypair and Auth Token

`ADMIN_SECRET` serves double duty: it is a Solana keypair JSON array (used in `src/pages/api/nft/approveSale.ts` line 19) and also compared directly as a string for auth bypass (used in `src/pages/api/pool/graduate.ts` line 27, `src/pages/api/test/setup-governance.ts` line 26). When `ADMIN_SECRET` is empty, `graduate.ts` line 27 evaluates `isSecretValid` as `false` (safe), but `setup-governance.ts` line 10 falls back to `'test-admin-secret'` which is guessable.

### 1.6 Global State for Sale Requests

`src/pages/api/nft/approveSale.ts` (lines 8-12, 47-49, 107-109) - Uses `globalThis.saleRequests` and `globalThis.activeListings` to store marketplace state in server memory. In a serverless environment (Vercel), this state is not shared across instances and will be lost on cold starts.

### 1.7 Keypair File Reads from Disk

Squads API routes read keypair files from disk using `readFileSync`:
- `src/pages/api/squads/propose.ts` (line 87)
- `src/pages/api/squads/execute.ts` (line 54)
- `src/pages/api/squads/approve.ts` (line 83)
- `src/pages/api/squads/cancel.ts` (line 64)

This pattern can fail in serverless deployments where the filesystem path may not exist.

### 1.8 Previously Identified (from MEMORY.md, still open)

- JWT_SECRET may still be `"your_secret_key_here"` -- user was warned to rotate.
- Old keypair file still in git history (needs BFG purge).
- Old GitHub PAT embedded in remote URL needs revoking.
- 13 dependency vulnerabilities reported by GitHub (1 critical).

---

## 2. Missing Input Validation

### 2.1 Almost No Zod Usage

Despite Zod being listed as a dependency, only **2 API routes** use Zod validation:
- `src/pages/api/vendor/onboard-b-api.ts`
- `src/pages/api/vendor/onboard-api.ts`

All other routes (~100+) destructure `req.body` directly with manual checks or no validation at all.

### 2.2 No Rate Limiting on Most Endpoints

Only ~10 endpoints use rate limiting (treasury, AI, escrow purchase/confirm, arweave upload, webhooks). The remaining ~90+ API routes have no rate limiting, including sensitive ones like:
- `src/pages/api/auth/admin-token.ts`
- `src/pages/api/auth/signup.ts`
- `src/pages/api/auth/login.ts`
- `src/pages/api/pool/invest.ts`
- `src/pages/api/offers/create.ts`
- All admin endpoints

### 2.3 Mongoose Schema with `strict: false`

`src/pages/api/nft/markRequestApproved.ts` (line 11) and `src/pages/api/nft/markRequestRejected.ts` (line 8) define a MetadataChangeRequest model with `new mongoose.Schema({}, { strict: false })`, meaning any arbitrary data can be stored. This is a data integrity risk.

---

## 3. Technical Debt

### 3.1 TODO/FIXME Comments

Active TODOs in the codebase:

| Location | Comment |
|----------|---------|
| `src/components/marketplace/OfferList.tsx:236` | `TODO: Implement withdraw API endpoint` |
| `src/pages/api/admin/nft/freeze.ts:91` | `TODO: If notifyOwner is true, send notification to owner` |
| `src/pages/api/pool/pay-vendor.ts:190` | `TODO: Call Bags API to create AMM liquidity pool` |

### 3.2 Duplicate Model Definitions

`MetadataChangeRequest` is defined in three different files with different schemas:
- `src/pages/api/nft/requestMetadataChange.ts` (lines 7-17) - with proper schema
- `src/pages/api/nft/markRequestApproved.ts` (lines 6-11) - with `strict: false`, empty schema
- `src/pages/api/nft/markRequestRejected.ts` (lines 5-8) - with `strict: false`, empty schema

These should be consolidated into a single model file under `src/lib/models/`.

### 3.3 Mixed Auth Patterns

The codebase uses at least 4 different authentication approaches with no consistency:
1. **JWT Bearer tokens** (`verifyToken`) - used by `rejectSale.ts`, `listings.ts`, `profile.ts`, `users/update.ts`, `users/listings.ts`, `treasury/transactions.ts`
2. **`withWalletAuth` middleware** (signed messages) - used by Squads and address endpoints
3. **`x-wallet-address` header** (spoofable) - used by most admin endpoints
4. **`adminSecret` in request body** (shared secret) - used by `pool/graduate.ts`, `test/setup-governance.ts`

### 3.4 Inconsistent Error Handling

- Many catch blocks use `any` type: e.g., `catch (e: any)` in `src/pages/api/nft/updateStatus.ts`
- Some endpoints return `error` key, others return `message` key for error responses
- Error monitoring (`withErrorMonitoring`) is applied to very few endpoints

### 3.5 Hardcoded Program ID Fallback

`src/scripts/derive-addresses.ts` (line 6): hardcodes a fallback program ID `'GRE7cbpBscopx6ygmCvhPqMNEUDWtu9gBVSzNMSPWkLX'` that differs from the documented program ID `kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj`.

### 3.6 Hardcoded Squads Multisig PDA

`src/pages/api/adminDashboard.tsx` (line 804): hardcodes a Squads multisig PDA `'4mXpAeaRJdRkAAkbDjxPicG2itn7WHQ6wBtS3vFJD9ku'` as a fallback.

### 3.7 Lint Warning Threshold

`package.json` (line 25): `eslint --fix --max-warnings 1000` sets an extremely high warning threshold, effectively disabling lint warnings as a quality gate.

### 3.8 Inconsistent Pinata Gateway URLs

The codebase uses at least 3 different Pinata gateway URL patterns:
- `'https://gateway.pinata.cloud/ipfs/'` in `src/utils/pinata.ts` (line 8)
- `'https://teal-working-frog-718.mypinata.cloud/ipfs/'` in `src/utils/imageUtils.ts` (line 10)
- `process.env.NEXT_PUBLIC_GATEWAY_URL` everywhere else

---

## 4. Performance Concerns

### 4.1 Large Static Assets

Known large files in `public/`:
- `public/3Dmodels/RolexSub-optimized.glb` - 3D model (likely multi-MB)
- `public/hdr/studioHDR.exr` - HDR environment map (likely multi-MB)
- `public/images/purpleLGG.png` - placeholder image
- Multiple `.jpg` watch images

The original unoptimized `RolexSub.glb` (19MB per MEMORY.md) may have been replaced, but should be confirmed. The `studioHDR.exr` file is an uncompressed HDR format -- consider converting to `.hdr` or compressed format.

### 4.2 Windows Zone.Identifier Files

Several files in `public/images/` have `:Zone.Identifier` suffixes (Windows ADS metadata):
- `public/images/15c247a3-9c12-4ec2-a3ff-8644e1fc5344.jpg:Zone.Identifier`
- `public/images/bc9b7fed-4448-4a57-8ffe-a9e68821a597.jpg:Zone.Identifier`
- `public/images/1984a73c-3bd5-48b7-9dcf-3cb0adc6924d.jpg:Zone.Identifier`
- `public/images/cartier-crash.jpg:Zone.Identifier`

These are junk files that should be removed and added to `.gitignore`.

### 4.3 Excessive Console Logging in API Routes

395 `console.log/error/warn` calls across 153 API route files. In production, these create unnecessary log noise and potential information leakage (e.g., `src/pages/api/nft/updateBuyer.ts` line 13 logs incoming request body data).

### 4.4 No Database Query Optimization Signals

Several API routes query MongoDB without `.lean()` for read-only operations, returning full Mongoose documents with overhead. No evidence of compound indexes being explicitly defined for common query patterns.

---

## 5. Fragile Areas

### 5.1 Pool Investment Without On-Chain Verification

`src/pages/api/pool/invest.ts` accepts `investorWallet`, `shares`, and `investedUSD` from the request body and records the investment in MongoDB without verifying any on-chain payment transaction. An attacker could claim shares without actually paying.

### 5.2 Non-Atomic MongoDB Updates

`src/pages/api/pool/invest.ts` (and similar routes) performs read-modify-write patterns without transactions. Under concurrent requests, two investors could both be told shares are available, leading to overselling.

### 5.3 Sentry Integration Placeholder

`src/lib/monitoring/errorHandler.ts` (lines 75-76, 100-101) has commented-out Sentry integration placeholders. Error monitoring is incomplete.

### 5.4 Test Endpoints Accessible in Non-Production

`src/pages/api/test/setup-data.ts` and `src/pages/api/test/setup-governance.ts` are blocked in `production` but accessible in any other `NODE_ENV` value, including `preview` (Vercel preview deployments) or if `NODE_ENV` is unset.

### 5.5 IBM COS Integration Dead Code

`src/lib/ibm/uploadImageToIBM.ts` and `src/pages/api/ibm/uploadImage.ts` reference IBM Cloud Object Storage with `process.env.IBM_COS_API_KEY` and `process.env.IBM_COS_RESOURCE_INSTANCE_ID`. These appear to be unused legacy code.

### 5.6 Arweave Key Loading

`src/utils/arweave.ts` (line 20) loads `process.env.ARWEAVE_KEY` as a base64-encoded key. If the key is malformed, errors are thrown at runtime with no graceful fallback.

---

## 6. Incomplete Features

| Feature | Evidence | Status |
|---------|----------|--------|
| Offer withdrawal | `src/components/marketplace/OfferList.tsx:236` - TODO comment | Not implemented |
| Owner notification on freeze | `src/pages/api/admin/nft/freeze.ts:91` - TODO comment | Not implemented |
| Bags AMM pool creation | `src/pages/api/pool/pay-vendor.ts:190` - TODO comment | Not implemented |
| Backpack Bags API wallet sessions | Documented in CLAUDE.md as in-progress | Not started |
| Enhanced vendor KYC | Documented in CLAUDE.md as in-progress | Not started |
| Pool distribution mechanics | Documented in CLAUDE.md as in-progress | Not started |
| Sentry error monitoring | Placeholder code in `src/lib/monitoring/errorHandler.ts` | Commented out |
| Escrow flow documentation | `escrow_flow.md` listed as "(Planned)" | Not written |
| Fractional pools documentation | `fractional_pools.md` listed as "(Planned)" | Not written |
| Squads multisig documentation | `squads_multisig.md` listed as "(Planned)" | Not written |
| Vendor onboarding documentation | `vendor_onboarding.md` listed as "(Planned)" | Not written |

---

## 7. Build & Deployment Concerns

### 7.1 `.tsx` File in API Directory

`src/pages/api/admin/adminDashboard.tsx` - A React component (`.tsx`) exists inside the `pages/api/` directory. Next.js treats everything under `pages/api/` as API routes. This file likely causes build warnings or unexpected behavior.

### 7.2 File Upload to `/tmp` in Serverless

`src/pages/api/pinata/imgUpload.ts` (line 11) configures multer to write to `/tmp`. In Vercel's serverless environment, `/tmp` has limited space (512MB) and is ephemeral. Large uploads or concurrent requests could exhaust it.

### 7.3 `readFileSync` in Serverless Paths

The Squads API routes (`propose.ts`, `execute.ts`, `approve.ts`, `cancel.ts`) use `readFileSync` to load keypair files from `SQUADS_MEMBER_KEYPAIR_PATH`. This path may not exist in Vercel deployments.

### 7.4 Version Mismatch

`CLAUDE.md` states version `0.2.0`, but `package.json` declares `"version": "1.0.0"`.

---

## 8. Dependency Concerns

### 8.1 GitHub Reports 13 Vulnerabilities

Per MEMORY.md, GitHub reports 13 dependency vulnerabilities including 1 critical. These have not been resolved.

### 8.2 Heavy 3D Dependencies

`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `three` - These are large dependencies used only on the homepage 3D visualization. They contribute significantly to bundle size for pages that don't use 3D features. Consider dynamic imports or code splitting.

### 8.3 Deprecated Metaplex JS SDK

`@metaplex-foundation/js` (v0.20.1) in `src/pages/api/nft/approveSale.ts` is the deprecated Metaplex JS SDK. The codebase also uses the newer `@metaplex-foundation/mpl-core` and `umi` -- the old SDK should be migrated away from.

---

## 9. Summary of Priorities

### Must Fix Before Production

1. Add authentication to all mutating API routes (Section 1.1)
2. Replace `x-wallet-address` header auth with `withWalletAuth` signed-message middleware (Section 1.2)
3. Secure admin-token endpoint with wallet signature (Section 1.3)
4. Set `PII_ENCRYPTION_KEY` and remove hardcoded fallback (Section 1.4)
5. Add on-chain payment verification for pool investments (Section 5.1)
6. Resolve critical dependency vulnerability (Section 8.1)
7. Ensure test endpoints are blocked on Vercel preview deployments (Section 5.4)

### Should Fix for MVP

8. Add Zod validation to all API routes (Section 2.1)
9. Add rate limiting to auth and financial endpoints (Section 2.2)
10. Consolidate auth patterns to 1-2 approaches (Section 3.3)
11. Use MongoDB transactions for pool investment (Section 5.2)
12. Remove or gate IBM COS dead code (Section 5.5)
13. Remove Zone.Identifier files (Section 4.2)
14. Fix version mismatch (Section 7.4)

### Nice to Have

15. Reduce console logging in production (Section 4.3)
16. Add `.lean()` to read-only Mongoose queries (Section 4.4)
17. Dynamic import 3D dependencies (Section 8.2)
18. Migrate off deprecated Metaplex JS SDK (Section 8.3)
19. Lower ESLint max-warnings threshold (Section 3.7)
20. Unify Pinata gateway URL references (Section 3.8)
