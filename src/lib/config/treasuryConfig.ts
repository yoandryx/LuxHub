// src/lib/config/treasuryConfig.ts
// Multi-treasury wallet routing helper.
// Each revenue stream has its own treasury wallet for clear accounting.
// Server-side only — env vars intentionally omit NEXT_PUBLIC_ prefix.

type TreasuryType = 'marketplace' | 'pools' | 'partner';

const TREASURY_ENV_MAP: Record<TreasuryType, string> = {
  marketplace: 'TREASURY_MARKETPLACE',
  pools: 'TREASURY_POOLS',
  partner: 'TREASURY_PARTNER',
};

/**
 * Returns the treasury wallet address for the given revenue stream.
 * Throws a descriptive error if the corresponding env var is not set.
 */
export function getTreasury(type: TreasuryType): string {
  const envKey = TREASURY_ENV_MAP[type];
  const wallet = process.env[envKey];
  if (!wallet) {
    throw new Error(
      `[LuxHub] ${envKey} not configured. Set this env var to the ${type} treasury wallet address.`
    );
  }
  return wallet;
}

/**
 * Backward-compatible legacy treasury lookup.
 * Returns NEXT_PUBLIC_LUXHUB_WALLET if set, otherwise falls back to marketplace treasury.
 * Use this during migration — new code should use getTreasury() directly.
 */
export function getLegacyTreasury(): string {
  return process.env.NEXT_PUBLIC_LUXHUB_WALLET || getTreasury('marketplace');
}

export type { TreasuryType };
