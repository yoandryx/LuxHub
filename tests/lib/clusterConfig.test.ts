// Test stubs for SEC-01, SEC-08: Cluster configuration
// Wave 1+ executors will implement these tests with real assertions
//
// Note: Real tests require transformIgnorePatterns for uuid/jayson ESM modules.
// The Wave 1 executor for SEC-01 should update jest.config.cjs accordingly.

describe('getClusterConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test.todo('returns ClusterConfig when both env vars are set');
  test.todo('throws with [LuxHub] prefix when NEXT_PUBLIC_SOLANA_ENDPOINT is missing');
  test.todo('throws with [LuxHub] prefix when NEXT_PUBLIC_SOLANA_NETWORK is missing');
  test.todo('throws when NEXT_PUBLIC_SOLANA_NETWORK is an invalid value');
  test.todo('returns correct USDC mint for devnet');
  test.todo('returns correct USDC mint for mainnet-beta');
  test.todo('explorerUrl includes ?cluster=devnet for devnet');
  test.todo('explorerUrl has no cluster param for mainnet-beta');
});
