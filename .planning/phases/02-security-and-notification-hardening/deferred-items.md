# Deferred Items - Phase 02

## Pre-existing Build Error

**File:** `src/hooks/useEffectiveWallet.ts` line 54-56
**Error:** `'address' does not exist in type 'SolanaSignMessageInput'` (Privy SDK type mismatch)
**Origin:** Commit `f0be337 fix(01-03): pass address param to Privy signMessage`
**Impact:** `npm run build` fails. Not caused by phase 02 changes.
**Action needed:** Update Privy SDK types or adjust the signMessage call signature.
**Status:** Fixed in 02-01 (cast to any as workaround).

## Pre-existing SEC-Language Violations

**Files with violations (45 total):**
- `src/pages/watchMarket.tsx` (16 violations: "Investment", "fractional ownership", "profit", "ROI", "investors")
- `src/pages/pool/[id].tsx` (17 violations: "Investment", "Invest", "Investors", "fractional ownership")
- `src/pages/user/[wallet].tsx` (3 violations: "Invested", "investments", "invested")
- `src/components/admins/TransactionHistoryTab.tsx` (4 violations: "investment", "Investment", "Investments")
- `src/components/marketplace/BagsPoolTrading.tsx` (1 violation: "investment")

**Origin:** Pre-existing user-facing strings from Phase 1 development.
**Impact:** Pre-commit hook blocks commits for files containing these strings.
**Action needed:** Replace SEC-sensitive language with compliant alternatives per legal_language_rules.md.
