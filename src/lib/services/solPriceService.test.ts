import {
  getSolUsdRate,
  usdToLamports,
  lamportsToUsd,
  usdToUsdcUnits,
  usdcUnitsToUsd,
  __resetCacheForTesting,
} from './solPriceService';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  __resetCacheForTesting();
  mockFetch.mockReset();
});

// --- Helper: build Pyth response ---
function pythResponse(price: string, expo: number) {
  return {
    ok: true,
    json: async () => ({
      parsed: [{ price: { price, expo } }],
    }),
  };
}

// --- Helper: build CoinGecko response ---
function coingeckoResponse(usd: number) {
  return {
    ok: true,
    json: async () => ({ solana: { usd } }),
  };
}

describe('getSolUsdRate', () => {
  it('returns rate from Pyth on success', async () => {
    // Pyth: price=20000000000, expo=-8 => 200.0
    mockFetch.mockResolvedValueOnce(pythResponse('20000000000', -8));

    const rate = await getSolUsdRate();
    expect(rate).toBeCloseTo(200, 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('hermes.pyth.network');
  });

  it('falls back to CoinGecko when Pyth fails', async () => {
    // Pyth fails
    mockFetch.mockRejectedValueOnce(new Error('Pyth down'));
    // CoinGecko succeeds
    mockFetch.mockResolvedValueOnce(coingeckoResponse(185.5));

    const rate = await getSolUsdRate();
    expect(rate).toBeCloseTo(185.5, 1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to CoinGecko when Pyth returns 0', async () => {
    // Pyth returns non-ok
    mockFetch.mockResolvedValueOnce({ ok: false });
    // CoinGecko succeeds
    mockFetch.mockResolvedValueOnce(coingeckoResponse(190));

    const rate = await getSolUsdRate();
    expect(rate).toBeCloseTo(190, 1);
  });

  it('returns 0 when both sources fail and no cache exists', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Pyth down'));
    mockFetch.mockRejectedValueOnce(new Error('CoinGecko down'));

    const rate = await getSolUsdRate();
    expect(rate).toBe(0);
  });

  it('returns cached rate within TTL without refetching', async () => {
    // First call populates cache
    mockFetch.mockResolvedValueOnce(pythResponse('20000000000', -8));
    const rate1 = await getSolUsdRate();
    expect(rate1).toBeCloseTo(200, 1);

    // Second call within 15s should NOT refetch
    const rate2 = await getSolUsdRate();
    expect(rate2).toBeCloseTo(200, 1);
    expect(mockFetch).toHaveBeenCalledTimes(1); // only 1 fetch total
  });

  it('refetches after TTL expires', async () => {
    // First call
    mockFetch.mockResolvedValueOnce(pythResponse('20000000000', -8));
    await getSolUsdRate();

    // Expire cache by resetting (simulates TTL expiry)
    __resetCacheForTesting();

    // Second call should refetch
    mockFetch.mockResolvedValueOnce(pythResponse('21000000000', -8));
    const rate = await getSolUsdRate();
    expect(rate).toBeCloseTo(210, 1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('usdToLamports', () => {
  it('converts $100 at rate=200 to 500_000_000 lamports (0.5 SOL)', async () => {
    mockFetch.mockResolvedValueOnce(pythResponse('20000000000', -8));
    const lamports = await usdToLamports(100);
    expect(lamports).toBe(500_000_000);
  });

  it('throws when rate is 0', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    await expect(usdToLamports(100)).rejects.toThrow('SOL/USD rate unavailable');
  });
});

describe('lamportsToUsd', () => {
  it('converts 1_000_000_000 lamports (1 SOL) at rate=200 to $200', async () => {
    mockFetch.mockResolvedValueOnce(pythResponse('20000000000', -8));
    const usd = await lamportsToUsd(1_000_000_000);
    expect(usd).toBeCloseTo(200, 1);
  });
});

describe('usdToUsdcUnits', () => {
  it('converts $100 to 100_000_000 USDC units', () => {
    expect(usdToUsdcUnits(100)).toBe(100_000_000);
  });

  it('handles fractional USD', () => {
    expect(usdToUsdcUnits(0.01)).toBe(10_000);
  });
});

describe('usdcUnitsToUsd', () => {
  it('converts 100_000_000 USDC units to $100', () => {
    expect(usdcUnitsToUsd(100_000_000)).toBe(100);
  });

  it('handles small amounts', () => {
    expect(usdcUnitsToUsd(1)).toBe(0.000001);
  });
});
