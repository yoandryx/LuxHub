# Deferred Items - Phase 02

## Pre-existing Build Error

**File:** `src/hooks/useEffectiveWallet.ts` line 54-56
**Error:** `'address' does not exist in type 'SolanaSignMessageInput'` (Privy SDK type mismatch)
**Origin:** Commit `f0be337 fix(01-03): pass address param to Privy signMessage`
**Impact:** `npm run build` fails. Not caused by phase 02 changes.
**Action needed:** Update Privy SDK types or adjust the signMessage call signature.
