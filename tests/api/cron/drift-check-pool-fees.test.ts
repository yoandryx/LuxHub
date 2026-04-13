// src/pages/api/cron/drift-check-pool-fees.test.ts
// Unit tests for the daily drift reconciliation cron.

import type { NextApiRequest, NextApiResponse } from 'next';

// ── Mock setup (must be before imports) ──

const mockReconcile = jest.fn();
jest.mock('@/lib/services/poolFeeClaimService', () => ({
  reconcilePoolFeeCounters: (...args: any[]) => mockReconcile(...args),
}));

const mockRunHeliusFilterSmokeTest = jest.fn();
jest.mock('@/pages/api/internal/smoke-test-helius-filter', () => ({
  runHeliusFilterSmokeTest: (...args: any[]) => mockRunHeliusFilterSmokeTest(...args),
}));

const mockCaptureException = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: any[]) => mockCaptureException(...args),
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: any) => handler,
}));

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

// ── Import handler after mocks ──

import handler from '@/pages/api/cron/drift-check-pool-fees';

describe('drift-check-pool-fees cron', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, CRON_SECRET: 'test-secret', NODE_ENV: 'production' };
    // Default: Helius filter is healthy. Individual tests can override.
    mockRunHeliusFilterSmokeTest.mockResolvedValue({
      ok: true,
      webhookId: 'wh-1',
      filter: ['PoolsTreasury1111111111111111111111111111111'],
      poolsTreasury: 'PoolsTreasury1111111111111111111111111111111',
    });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 401 without valid auth in production', async () => {
    const req = mockReq({ authorization: 'Bearer wrong' });
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns OK with no drifted pools and does not call Sentry', async () => {
    mockReconcile.mockResolvedValue({ checked: 3, drifted: [] });
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ checked: 3, driftedCount: 0, drifted: [] })
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('calls Sentry.captureException for each drifted pool', async () => {
    const driftedPools = [
      {
        poolId: 'pool1',
        primaryLamports: 1_000_000_000,
        auditLamports: 900_000_000,
        diffLamports: 100_000_000,
        diffPct: 10,
      },
      {
        poolId: 'pool2',
        primaryLamports: 2_000_000_000,
        auditLamports: 1_800_000_000,
        diffLamports: 200_000_000,
        diffPct: 10,
      },
    ];
    mockReconcile.mockResolvedValue({ checked: 5, drifted: driftedPools });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(mockCaptureException).toHaveBeenCalledTimes(2);

    // First call -- pool1
    expect(mockCaptureException.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCaptureException.mock.calls[0][0].message).toContain('pool1');
    expect(mockCaptureException.mock.calls[0][1]).toMatchObject({
      level: 'warning',
      tags: { category: 'pool_fee_drift', poolId: 'pool1' },
    });

    // Second call -- pool2
    expect(mockCaptureException.mock.calls[1][1].tags.poolId).toBe('pool2');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ driftedCount: 2 })
    );
  });

  it('emits Sentry error when Helius filter smoke test fails', async () => {
    mockReconcile.mockResolvedValue({ checked: 1, drifted: [] });
    mockRunHeliusFilterSmokeTest.mockResolvedValueOnce({
      ok: false,
      reason: 'TREASURY_POOLS not in filter',
      actionRequired: 'Update Helius dashboard',
      webhookId: 'wh-1',
      filter: ['other-addr'],
      poolsTreasury: 'PoolsTreasury1111111111111111111111111111111',
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    // Exactly one captureException for the Helius filter failure
    const heliusCalls = mockCaptureException.mock.calls.filter((call) =>
      String(call[0]?.message || '').includes('Helius webhook filter smoke test FAILED')
    );
    expect(heliusCalls).toHaveLength(1);
    expect(heliusCalls[0][1]).toMatchObject({
      level: 'error',
      tags: { category: 'helius_filter_smoke_test' },
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        heliusFilterOk: false,
        heliusFilterReason: 'TREASURY_POOLS not in filter',
      })
    );
  });
});
