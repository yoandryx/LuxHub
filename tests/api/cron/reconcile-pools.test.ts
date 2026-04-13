// src/pages/api/cron/reconcile-pools.test.ts
// Phase 11 plan 15 Task 15.4: assert reconcile-pools cron no longer
// triggers Squad DAO creation and uses the new tokenStatus filter.

import type { NextApiRequest, NextApiResponse } from 'next';

// ── Mock setup (must be before imports) ──

const mockPoolFind = jest.fn();
const mockPoolFindByIdAndUpdate = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    find: (...args: any[]) => mockPoolFind(...args),
    findByIdAndUpdate: (...args: any[]) => mockPoolFindByIdAndUpdate(...args),
  },
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: any) => handler,
  errorMonitor: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
}));

// Any stray fetch should be caught here (legacy Squad DAO trigger path).
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

// ── Helpers ──

function mockReq(opts: { method?: string; authorization?: string } = {}): NextApiRequest {
  return {
    method: opts.method || 'GET',
    headers: {
      authorization: opts.authorization || `Bearer ${process.env.CRON_SECRET}`,
    },
  } as unknown as NextApiRequest;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as NextApiResponse;
}

function makeSelect(result: any[]) {
  return { select: jest.fn().mockResolvedValue(result) };
}

// ── Import handler after mocks ──

import handler from '@/pages/api/cron/reconcile-pools';

describe('reconcile-pools cron — phase 11 rewire', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      NODE_ENV: 'production',
      CRON_SECRET: 'test-secret',
      BAGS_API_KEY: 'bags-key',
    };
    mockPoolFindByIdAndUpdate.mockResolvedValue(null);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 401 without valid CRON_SECRET in production', async () => {
    const req = mockReq({ authorization: 'Bearer wrong' });
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('queries pools with new tokenStatus enum (minted/funding/graduated)', async () => {
    mockPoolFind.mockReturnValueOnce(makeSelect([]));

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(mockPoolFind).toHaveBeenCalledWith({
      tokenStatus: { $in: ['minted', 'funding', 'graduated'] },
      bagsTokenMint: { $exists: true, $ne: null },
      deleted: { $ne: true },
    });
  });

  it('syncs bagsDbcState, lastMarketCap, lastPriceUSD informationally', async () => {
    mockPoolFind.mockReturnValueOnce(
      makeSelect([
        {
          _id: 'pool-1',
          bagsTokenMint: 'Mint111111111111111111111111111111111111111',
          bagsTokenStatus: 'PRE_GRAD',
          tokenStatus: 'funding',
        },
      ])
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'MIGRATED', marketCap: 100_000, priceUSD: 0.00005 }),
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(mockPoolFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [poolId, update] = mockPoolFindByIdAndUpdate.mock.calls[0];
    expect(poolId).toBe('pool-1');

    // Informational sync only — must NOT set graduated=true or trigger state
    // transitions on tokenStatus.
    expect(update.$set).toBeDefined();
    expect(update.$set).toHaveProperty('bagsDbcState', 'MIGRATED');
    expect(update.$set).toHaveProperty('lastMarketCap', 100_000);
    expect(update.$set).toHaveProperty('lastPriceUSD', 0.00005);
    expect(update.$set).not.toHaveProperty('graduated');
    expect(update.$set).not.toHaveProperty('tokenStatus');
    expect(update.$set).not.toHaveProperty('bondingCurveActive');
  });

  it('CRITICAL: never triggers Squad DAO creation via fetch(/api/pool/finalize)', async () => {
    mockPoolFind.mockReturnValueOnce(
      makeSelect([
        {
          _id: 'pool-2',
          bagsTokenMint: 'Mint222222222222222222222222222222222222222',
          bagsTokenStatus: 'PRE_GRAD',
          tokenStatus: 'funding',
        },
      ])
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'MIGRATED', marketCap: 100_000, priceUSD: 0.00005 }),
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    // The Bags token API is called, but NOTHING pointing at /api/pool/finalize
    // or any Squad creation path should be fetched.
    const finalizeCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes('/api/pool/finalize')
    );
    expect(finalizeCalls).toHaveLength(0);
  });

  it('returns 200 with no pools to sync when filter is empty', async () => {
    mockPoolFind.mockReturnValueOnce(makeSelect([]));
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ checked: 0, synced: 0, errors: 0 })
    );
  });
});
