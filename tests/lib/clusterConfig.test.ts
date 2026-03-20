// tests/lib/clusterConfig.test.ts
// Tests for centralized Solana cluster configuration module

describe('getClusterConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function importConfig() {
    const mod = await import('@/lib/solana/clusterConfig');
    return mod;
  }

  it('returns ClusterConfig with correct fields when both env vars set (devnet)', async () => {
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://devnet.helius-rpc.com/?api-key=test';
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';

    const { getClusterConfig } = await importConfig();
    const config = getClusterConfig();

    expect(config.network).toBeDefined();
    expect(config.endpoint).toBe('https://devnet.helius-rpc.com/?api-key=test');
    expect(config.chain).toBe('devnet');
    expect(config.usdcMint).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    expect(typeof config.explorerUrl).toBe('function');
  });

  it('returns correct USDC mint for mainnet-beta', async () => {
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=test';
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'mainnet-beta';

    const { getClusterConfig } = await importConfig();
    const config = getClusterConfig();

    expect(config.usdcMint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(config.chain).toBe('mainnet-beta');
  });

  it('throws Error starting with [LuxHub] when NEXT_PUBLIC_SOLANA_ENDPOINT missing', async () => {
    delete process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';

    const { getClusterConfig } = await importConfig();
    expect(() => getClusterConfig()).toThrow(/^\[LuxHub\] NEXT_PUBLIC_SOLANA_ENDPOINT/);
  });

  it('throws Error starting with [LuxHub] when NEXT_PUBLIC_SOLANA_NETWORK missing', async () => {
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://devnet.helius-rpc.com/?api-key=test';
    delete process.env.NEXT_PUBLIC_SOLANA_NETWORK;

    const { getClusterConfig } = await importConfig();
    expect(() => getClusterConfig()).toThrow(/^\[LuxHub\] NEXT_PUBLIC_SOLANA_NETWORK/);
  });

  it('throws when NEXT_PUBLIC_SOLANA_NETWORK is testnet (invalid)', async () => {
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://api.testnet.solana.com';
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'testnet';

    const { getClusterConfig } = await importConfig();
    expect(() => getClusterConfig()).toThrow(/^\[LuxHub\] NEXT_PUBLIC_SOLANA_NETWORK/);
  });

  it('explorerUrl returns URL with ?cluster=devnet for devnet', async () => {
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://devnet.helius-rpc.com/?api-key=test';
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';

    const { getClusterConfig } = await importConfig();
    const config = getClusterConfig();
    const url = config.explorerUrl('abc123');

    expect(url).toContain('solscan.io');
    expect(url).toContain('abc123');
    expect(url).toContain('cluster=devnet');
  });

  it('explorerUrl returns URL without cluster param for mainnet-beta', async () => {
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=test';
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'mainnet-beta';

    const { getClusterConfig } = await importConfig();
    const config = getClusterConfig();
    const url = config.explorerUrl('abc123');

    expect(url).toContain('solscan.io');
    expect(url).toContain('abc123');
    expect(url).not.toContain('cluster=');
  });
});
