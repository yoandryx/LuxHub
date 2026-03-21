// tests/lib/treasuryConfig.test.ts
// Unit tests for multi-treasury config helper

describe('treasuryConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set test treasury wallets
    process.env.TREASURY_MARKETPLACE = 'E69iMVCrmQLpZHDUVGjpysqeUnxV3Qqi9HCoaQ3cYXgR';
    process.env.TREASURY_POOLS = '3TjKUpPUkbVQVvcYjUGScrjoxswXRH9yqVVnRr5RkSsg';
    process.env.TREASURY_PARTNER = '4adjrteuyFj3zB2zQ1hQp7JfncSVAunN7EAnq3ZqgZwh';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function importConfig() {
    return await import('@/lib/config/treasuryConfig');
  }

  it('getTreasury("marketplace") returns env value when TREASURY_MARKETPLACE is set', async () => {
    const { getTreasury } = await importConfig();
    expect(getTreasury('marketplace')).toBe('E69iMVCrmQLpZHDUVGjpysqeUnxV3Qqi9HCoaQ3cYXgR');
  });

  it('getTreasury("pools") returns env value when TREASURY_POOLS is set', async () => {
    const { getTreasury } = await importConfig();
    expect(getTreasury('pools')).toBe('3TjKUpPUkbVQVvcYjUGScrjoxswXRH9yqVVnRr5RkSsg');
  });

  it('getTreasury("partner") returns env value when TREASURY_PARTNER is set', async () => {
    const { getTreasury } = await importConfig();
    expect(getTreasury('partner')).toBe('4adjrteuyFj3zB2zQ1hQp7JfncSVAunN7EAnq3ZqgZwh');
  });

  it('getTreasury("marketplace") throws Error with message containing "TREASURY_MARKETPLACE not configured" when env var is missing', async () => {
    delete process.env.TREASURY_MARKETPLACE;
    const { getTreasury } = await importConfig();
    expect(() => getTreasury('marketplace')).toThrow(/TREASURY_MARKETPLACE not configured/);
  });

  it('getLegacyTreasury() returns NEXT_PUBLIC_LUXHUB_WALLET when set', async () => {
    process.env.NEXT_PUBLIC_LUXHUB_WALLET = 'LegacyWalletAddress123';
    const { getLegacyTreasury } = await importConfig();
    expect(getLegacyTreasury()).toBe('LegacyWalletAddress123');
  });

  it('getLegacyTreasury() falls back to getTreasury("marketplace") when NEXT_PUBLIC_LUXHUB_WALLET is unset', async () => {
    delete process.env.NEXT_PUBLIC_LUXHUB_WALLET;
    const { getLegacyTreasury } = await importConfig();
    expect(getLegacyTreasury()).toBe('E69iMVCrmQLpZHDUVGjpysqeUnxV3Qqi9HCoaQ3cYXgR');
  });
});
