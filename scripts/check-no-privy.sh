#!/usr/bin/env bash
# scripts/check-no-privy.sh
# Regression guard: fails if any Privy reference exists in src/, package.json, package-lock.json, or .env.* files.
# Created Phase 12 (2026-05-21). CI runs this post-merge to prevent re-introduction of @privy-io/react-auth.
# Exit 0 = clean (no Privy). Exit 1 = Privy detected (print offending lines).

set -u
FAILED=0

echo "[check-no-privy] Scanning src/ for Privy imports and identifiers..."
# Exclude __tests__/ — test files contain intentional negative-assertion string literals
# (e.g., "// DO NOT mock @privy-io/react-auth") that serve as regression guards per Plan 12-01.
# Production code in src/ (outside __tests__) must remain Privy-free.
PRIVY_MATCHES=$(grep -rnE '@privy-io|usePrivy|PrivyProvider|toSolanaWalletConnectors|usePrivySafe' src/ 2>/dev/null | grep -v '__tests__')
if [ -n "$PRIVY_MATCHES" ]; then
  echo "$PRIVY_MATCHES"
  echo "[check-no-privy] FAIL: Privy references found in src/ (excluding __tests__/)"
  FAILED=1
fi

echo "[check-no-privy] Scanning package.json + package-lock.json for @privy-io..."
if grep -nE '@privy-io' package.json package-lock.json 2>/dev/null; then
  echo "[check-no-privy] FAIL: @privy-io found in package manifest or lockfile"
  FAILED=1
fi

echo "[check-no-privy] Scanning .env files for NEXT_PUBLIC_PRIVY_APP_ID..."
# .env files are gitignored but exist locally; scan if present
for envfile in .env.local .env.mainnet .env.devnet .env.example .env.vercel; do
  if [ -f "$envfile" ]; then
    if grep -niE 'privy' "$envfile" 2>/dev/null; then
      echo "[check-no-privy] FAIL: Privy reference found in $envfile"
      FAILED=1
    fi
  fi
done

if [ "$FAILED" -eq 0 ]; then
  echo "[check-no-privy] PASS: no Privy references detected."
  exit 0
else
  echo "[check-no-privy] One or more Privy references detected. Phase 12 forbids re-introduction."
  exit 1
fi
