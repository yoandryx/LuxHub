// tests/lib/feeShare.test.ts
// Unit tests for fee-share claimers (100% Pools Treasury model)

describe('buildDefaultClaimers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.TREASURY_POOLS = '3TjKUpPUkbVQVvcYjUGScrjoxswXRH9yqVVnRr5RkSsg';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function importFeeShare() {
    return await import('@/lib/config/feeShareConfig');
  }

  it('returns array with exactly 1 entry', async () => {
    const { buildDefaultClaimers } = await importFeeShare();
    const claimers = buildDefaultClaimers();
    expect(claimers).toHaveLength(1);
  });

  it('single claimer wallet equals getTreasury("pools") value', async () => {
    const { buildDefaultClaimers } = await importFeeShare();
    const claimers = buildDefaultClaimers();
    expect(claimers[0].wallet).toBe('3TjKUpPUkbVQVvcYjUGScrjoxswXRH9yqVVnRr5RkSsg');
  });

  it('single claimer basisPoints equals 10000', async () => {
    const { buildDefaultClaimers } = await importFeeShare();
    const claimers = buildDefaultClaimers();
    expect(claimers[0].basisPoints).toBe(10000);
  });

  it('single claimer label equals "Pools Treasury"', async () => {
    const { buildDefaultClaimers } = await importFeeShare();
    const claimers = buildDefaultClaimers();
    expect(claimers[0].label).toBe('Pools Treasury');
  });

  it('ignores vendorWallet parameter (always returns 1 claimer)', async () => {
    const { buildDefaultClaimers } = await importFeeShare();
    // buildDefaultClaimers no longer accepts parameters, but if called with args it should still return 1 claimer
    const claimers = (buildDefaultClaimers as (...args: unknown[]) => unknown[])('SomeVendorWallet');
    expect(claimers).toHaveLength(1);
  });
});
