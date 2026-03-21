// tests/lib/distribute.test.ts
// Unit tests for distribution calculation logic

import { calculateDistribution } from '@/lib/services/distributionCalc';

describe('calculateDistribution', () => {
  it('returns equal 97% split for 3 holders with equal balances', () => {
    const holders = [
      { wallet: 'wallet1', balance: 100, ownershipPercent: 33.333333 },
      { wallet: 'wallet2', balance: 100, ownershipPercent: 33.333333 },
      { wallet: 'wallet3', balance: 100, ownershipPercent: 33.333333 },
    ];

    const result = calculateDistribution(holders, 10000);

    expect(result.royaltyAmount).toBeCloseTo(300, 2);
    expect(result.distributionPool).toBeCloseTo(9700, 2);
    expect(result.distributions).toHaveLength(3);

    // Each holder should get ~$3233.33
    for (const d of result.distributions) {
      expect(d.distributionAmount).toBeCloseTo(3233.33, 0);
    }
  });

  it('returns proportional amounts for unequal balances', () => {
    const holders = [
      { wallet: 'walletA', balance: 500, ownershipPercent: 50 },
      { wallet: 'walletB', balance: 300, ownershipPercent: 30 },
      { wallet: 'walletC', balance: 200, ownershipPercent: 20 },
    ];

    const result = calculateDistribution(holders, 10000);

    expect(result.royaltyAmount).toBeCloseTo(300, 2);
    expect(result.distributionPool).toBeCloseTo(9700, 2);
    expect(result.distributions[0].distributionAmount).toBeCloseTo(4850, 2);
    expect(result.distributions[1].distributionAmount).toBeCloseTo(2910, 2);
    expect(result.distributions[2].distributionAmount).toBeCloseTo(1940, 2);
  });

  it('filters holders with distribution below $0.01 (dust)', () => {
    const holders = [
      { wallet: 'walletBig', balance: 999999, ownershipPercent: 99.9999 },
      { wallet: 'walletDust', balance: 1, ownershipPercent: 0.0001 },
    ];

    const result = calculateDistribution(holders, 100);

    // Dust holder gets 97 * 0.0001/100 = $0.000097 — below $0.01 threshold
    expect(result.distributions).toHaveLength(1);
    expect(result.distributions[0].wallet).toBe('walletBig');
    expect(result.dustFiltered).toBe(1);
  });

  it('returns 3% royalty amount for treasury', () => {
    const holders = [
      { wallet: 'wallet1', balance: 1000, ownershipPercent: 100 },
    ];

    const result = calculateDistribution(holders, 15000);

    expect(result.royaltyAmount).toBeCloseTo(450, 2);
    expect(result.distributionPool).toBeCloseTo(14550, 2);
  });

  it('returns 97% of resale price to single holder', () => {
    const holders = [
      { wallet: 'onlyHolder', balance: 1000, ownershipPercent: 100 },
    ];

    const result = calculateDistribution(holders, 15000);

    expect(result.distributions).toHaveLength(1);
    expect(result.distributions[0].distributionAmount).toBeCloseTo(14550, 2);
    expect(result.distributions[0].wallet).toBe('onlyHolder');
    expect(result.royaltyAmount).toBeCloseTo(450, 2);
  });

  it('returns empty distributions array with zero total supply', () => {
    const holders: { wallet: string; balance: number; ownershipPercent: number }[] = [];

    const result = calculateDistribution(holders, 10000);

    expect(result.distributions).toHaveLength(0);
    expect(result.royaltyAmount).toBeCloseTo(300, 2);
    expect(result.distributionPool).toBeCloseTo(9700, 2);
    expect(result.dustFiltered).toBe(0);
  });
});
