// src/lib/config/feeShareConfig.ts
// Fee-share claimer configuration for Bags pool tokens.
// Extracted from configure-fee-share API route for testability.

import { getTreasury } from './treasuryConfig';

export interface FeeShareClaimer {
  wallet: string;
  basisPoints: number; // Share of creator fee (must total 10,000 across all claimers)
  label?: string;
}

/**
 * Build the default fee claimers array for a pool.
 * 10,000 BPS = 100% of the creator's 1% fee on every trade.
 *
 * New tokenomics model: 100% goes to the Pools Treasury.
 * Vendor is paid at graduation only (when pool reaches target and asset is purchased),
 * not from ongoing trading fees.
 */
export function buildDefaultClaimers(): FeeShareClaimer[] {
  const poolsTreasury = getTreasury('pools');
  return [{ wallet: poolsTreasury, basisPoints: 10000, label: 'Pools Treasury' }];
}
