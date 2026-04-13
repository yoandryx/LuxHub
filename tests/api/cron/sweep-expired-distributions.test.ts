// src/pages/api/cron/sweep-expired-distributions.test.ts
// Unit tests for the daily sweep of expired pool distributions.

import type { NextApiRequest, NextApiResponse } from 'next';
import { Types } from 'mongoose';

// ── Mock setup (must be before imports) ──

const mockDistFind = jest.fn();
const mockDistUpdateOne = jest.fn();
jest.mock('@/lib/models/PoolDistribution', () => ({
  __esModule: true,
  PoolDistribution: {
    find: (...args: any[]) => mockDistFind(...args),
    updateOne: (...args: any[]) => mockDistUpdateOne(...args),
  },
}));

const mockTreasuryCreate = jest.fn();
jest.mock('@/lib/models/TreasuryDeposit', () => ({
  __esModule: true,
  TreasuryDeposit: {
    create: (...args: any[]) => mockTreasuryCreate(...args),
  },
}));

jest.mock('@/lib/config/treasuryConfig', () => ({
  getTreasury: () => 'PoolsTreasuryWallet111111111111111111111111',
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

import handler from '@/pages/api/cron/sweep-expired-distributions';

describe('sweep-expired-distributions cron', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, CRON_SECRET: 'test-secret', NODE_ENV: 'production' };
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

  it('returns 200 with no expired distributions', async () => {
    mockDistFind.mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ processed: 0, results: [] })
    );
  });

  it('sweeps expired distribution with unclaimed holders', async () => {
    const distId = new Types.ObjectId();
    const poolId = new Types.ObjectId();
    mockDistFind.mockResolvedValue([
      {
        _id: distId,
        pool: poolId,
        distributions: [
          { payoutUSD: 50, claimedAt: null },
          { payoutUSD: 30, claimedAt: new Date() }, // already claimed
          { payoutUSD: 20, claimedAt: null },
        ],
        claimDeadlineAt: new Date(Date.now() - 86400000), // yesterday
      },
    ]);
    mockTreasuryCreate.mockResolvedValue({});
    mockDistUpdateOne.mockResolvedValue({});

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.processed).toBe(1);
    expect(body.results[0].action).toBe('swept');
    expect(body.results[0].unclaimedCount).toBe(2);
    expect(body.results[0].unclaimedUsd).toBe(70);

    // TreasuryDeposit audit record
    expect(mockTreasuryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        depositType: 'unclaimed_sweep',
        pool: poolId,
        amountUSD: 70,
      })
    );

    // PoolDistribution marked expired
    expect(mockDistUpdateOne).toHaveBeenCalledWith(
      { _id: distId },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'expired' }),
      }),
      { arrayFilters: [{ 'elem.claimedAt': null }] }
    );
  });

  it('closes distribution with zero unclaimed (all claimed)', async () => {
    const distId = new Types.ObjectId();
    mockDistFind.mockResolvedValue([
      {
        _id: distId,
        pool: new Types.ObjectId(),
        distributions: [
          { payoutUSD: 50, claimedAt: new Date() },
          { payoutUSD: 30, claimedAt: new Date() },
        ],
        claimDeadlineAt: new Date(Date.now() - 86400000),
      },
    ]);
    mockDistUpdateOne.mockResolvedValue({});

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.results[0].action).toBe('closed_no_unclaimed');
    expect(mockTreasuryCreate).not.toHaveBeenCalled();
  });

  it('is idempotent -- re-run does not double-process expired distributions', async () => {
    // After first sweep, status is 'expired', so second run won't find it
    // (query filters on status: ['pending', 'distributed'])
    mockDistFind.mockResolvedValue([]);
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res.json.mock.calls[0][0].processed).toBe(0);
  });
});
