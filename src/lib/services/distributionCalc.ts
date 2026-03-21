// src/lib/services/distributionCalc.ts
// Pure distribution calculation logic for pool resale proceeds.
// Separated from API route for testability.

export interface DistributionEntry {
  wallet: string;
  balance: number;
  ownershipPercent: number;
  distributionAmount: number;
}

export interface DistributionResult {
  distributions: DistributionEntry[];
  royaltyAmount: number;
  distributionPool: number;
  dustFiltered: number;
}

/**
 * Calculate how to distribute resale proceeds among token holders.
 *
 * @param holders - Array of token holders with wallet, balance, ownershipPercent
 * @param resalePriceUSD - Total resale price in USD
 * @param royaltyPercent - Fraction taken as royalty (default 0.03 = 3%)
 * @param dustThreshold - Minimum distribution amount in USD (default $0.01)
 * @returns Distribution breakdown with royalty, per-holder amounts, and dust count
 */
export function calculateDistribution(
  holders: { wallet: string; balance: number; ownershipPercent: number }[],
  resalePriceUSD: number,
  royaltyPercent: number = 0.03,
  dustThreshold: number = 0.01
): DistributionResult {
  const royaltyAmount = resalePriceUSD * royaltyPercent;
  const distributionPool = resalePriceUSD * (1 - royaltyPercent);

  let dustFiltered = 0;
  const distributions: DistributionEntry[] = holders
    .map((h) => ({
      wallet: h.wallet,
      balance: h.balance,
      ownershipPercent: h.ownershipPercent,
      distributionAmount: distributionPool * (h.ownershipPercent / 100),
    }))
    .filter((d) => {
      if (d.distributionAmount < dustThreshold) {
        dustFiltered++;
        return false;
      }
      return true;
    });

  return { distributions, royaltyAmount, distributionPool, dustFiltered };
}
