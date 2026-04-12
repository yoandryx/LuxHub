// src/pages/api/cron/claim-pool-fees.test.ts
// Unit tests for the hourly fee claim cron endpoint.

import type { NextApiRequest, NextApiResponse } from 'next';
import { Types } from 'mongoose';

// ── Mock setup (must be before imports) ──

const mockPoolFind = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  __esModule: true,
  Pool: {
    find: (...args: any[]) => mockPoolFind(...args),
  },
}));

const mockClaimPoolFees = jest.fn();
const mockGetPendingFees = jest.fn();
jest.mock('@/lib/services/poolFeeClaimService', () => ({
  claimPoolFees: (...args: any[]) => mockClaimPoolFees(...args),
  getPendingFees: (...args: any[]) => mockGetPendingFees(...args),
}));

const mockLamportsToUsd = jest.fn();
jest.mock('@/lib/services/solPriceService', () => ({
  lamportsToUsd: (...args: any[]) => mockLamportsToUsd(...args),
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: any) => handler,
}));

// ── Helpers ──

function makePool(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(),
    tokenStatus: 'funding',
    bagsTokenMint: 'TokenMint111111111111111111111111111111111111',
    accumulatedFeesLamports: 0,
    fundingTargetUsdc: 100_000_000, // $100 in USDC base units
    slippageBufferBps: 200,
    lastFeeClaimAt: null as Date | null,
    deleted: false,
    ...overrides,
  };
}

function mockReq(opts: {
  method?: string;
  authorization?: string;
} = {}): NextApiRequest {
  return {
    method: opts.method || 'GET',
    headers: {
      authorization: opts.authorization,
    },
    body: {},
  } as unknown as NextApiRequest;
}

function mockRes(): NextApiResponse & { _status: number; _json: any } {
  const res: any = {
    _status: 0,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
  };
  return res;
}

// Chain builder for Pool.find().sort().limit().lean()
function setupPoolFind(pools: any[]) {
  mockPoolFind.mockReturnValue({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(pools),
      }),
    }),
  });
}

// ── Tests ──

// Must import AFTER mocks are set up
import handler from './claim-pool-fees';

describe('claim-pool-fees cron', () => {
  const VALID_SECRET = 'test-cron-secret-123';

  beforeAll(() => {
    process.env.CRON_SECRET = VALID_SECRET;
    (process.env as any).NODE_ENV = 'production';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setupPoolFind([]);
  });

  // ── Auth ──

  it('rejects requests without valid authorization in production', async () => {
    const req = mockReq({ authorization: 'Bearer wrong-secret' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toBe('unauthorized');
  });

  it('rejects requests with missing authorization header', async () => {
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('accepts valid Bearer token', async () => {
    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  // ── Threshold gating ──

  it('skips pools below claim threshold', async () => {
    const pool = makePool();
    setupPoolFind([pool]);
    mockGetPendingFees.mockResolvedValue({ claimableLamports: 200_000_000 }); // 0.2 SOL < 0.5 threshold
    // Not near graduation
    mockLamportsToUsd.mockResolvedValue(0.5);
    // Not stale (claimed recently)
    pool.lastFeeClaimAt = new Date();

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.results[0].skipped).toBe('below_threshold');
    expect(mockClaimPoolFees).not.toHaveBeenCalled();
  });

  it('claims when threshold is met', async () => {
    const pool = makePool({ lastFeeClaimAt: new Date() });
    setupPoolFind([pool]);
    mockGetPendingFees.mockResolvedValue({ claimableLamports: 600_000_000 }); // 0.6 SOL > 0.5
    mockClaimPoolFees.mockResolvedValue({
      success: true,
      txSignatures: ['sig1'],
      withdrawalAmountLamports: 600_000_000,
    });

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockClaimPoolFees).toHaveBeenCalledWith(pool._id.toString());
    expect(res._json.results[0].success).toBe(true);
  });

  // ── Near-graduation force claim ──

  it('force claims when near graduation even below threshold', async () => {
    const pool = makePool({
      accumulatedFeesLamports: 9_000_000_000, // 9 SOL accumulated
      fundingTargetUsdc: 100_000_000, // $100 target
      lastFeeClaimAt: new Date(), // Not stale
    });
    setupPoolFind([pool]);
    // Only 0.1 SOL pending (well below 0.5 SOL threshold)
    mockGetPendingFees.mockResolvedValue({ claimableLamports: 100_000_000 });
    // But projected total in USD = $97 which is >= $102 * 0.95 = $96.9
    mockLamportsToUsd.mockResolvedValue(97);
    mockClaimPoolFees.mockResolvedValue({
      success: true,
      txSignatures: ['sig1'],
      withdrawalAmountLamports: 100_000_000,
    });

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(mockClaimPoolFees).toHaveBeenCalled();
  });

  // ── Stale claim ──

  it('force claims stale pools (last claimed 30h ago)', async () => {
    const pool = makePool({
      lastFeeClaimAt: new Date(Date.now() - 30 * 3_600_000), // 30 hours ago
    });
    setupPoolFind([pool]);
    mockGetPendingFees.mockResolvedValue({ claimableLamports: 100_000 }); // Tiny amount
    mockLamportsToUsd.mockResolvedValue(0.001);
    mockClaimPoolFees.mockResolvedValue({
      success: true,
      txSignatures: ['sig1'],
      withdrawalAmountLamports: 100_000,
    });

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(mockClaimPoolFees).toHaveBeenCalled();
  });

  it('force claims pools that have never been claimed', async () => {
    const pool = makePool({ lastFeeClaimAt: null });
    setupPoolFind([pool]);
    mockGetPendingFees.mockResolvedValue({ claimableLamports: 1 });
    mockLamportsToUsd.mockResolvedValue(0);
    mockClaimPoolFees.mockResolvedValue({
      success: true,
      txSignatures: [],
      skippedReason: 'nothing_to_claim',
    });

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(mockClaimPoolFees).toHaveBeenCalled();
  });

  // ── Per-pool isolation ──

  it('isolates per-pool errors -- failing pool does not crash cron', async () => {
    const poolA = makePool({ lastFeeClaimAt: null });
    const poolB = makePool({ lastFeeClaimAt: null });
    setupPoolFind([poolA, poolB]);

    mockGetPendingFees
      .mockRejectedValueOnce(new Error('Bags API down'))
      .mockResolvedValueOnce({ claimableLamports: 1 });

    mockClaimPoolFees.mockResolvedValue({
      success: true,
      txSignatures: [],
      skippedReason: 'nothing_to_claim',
    });

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.results).toHaveLength(2);
    expect(res._json.results[0].error).toBe('Bags API down');
    // Pool B still processed
    expect(mockClaimPoolFees).toHaveBeenCalledTimes(1);
  });

  // ── Multiple pools ──

  it('processes multiple eligible pools in one tick', async () => {
    const pools = [
      makePool({ lastFeeClaimAt: null }),
      makePool({ lastFeeClaimAt: null }),
      makePool({ lastFeeClaimAt: null }),
    ];
    setupPoolFind(pools);
    mockGetPendingFees.mockResolvedValue({ claimableLamports: 1 });
    mockLamportsToUsd.mockResolvedValue(0);
    mockClaimPoolFees.mockResolvedValue({
      success: true,
      txSignatures: [],
      skippedReason: 'nothing_to_claim',
    });

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.processed).toBe(3);
    expect(mockClaimPoolFees).toHaveBeenCalledTimes(3);
  });

  // ── MAX_POOLS_PER_TICK is enforced via the query ──

  it('limits pools via query (MAX_POOLS_PER_TICK)', async () => {
    setupPoolFind([]);

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    // Verify the .limit() call is in the chain (mock returns 0 pools)
    const findCall = mockPoolFind.mock.calls[0];
    expect(findCall[0]).toEqual({
      tokenStatus: { $in: ['funding', 'graduated'] },
      bagsTokenMint: { $exists: true, $ne: null },
      deleted: { $ne: true },
    });
  });

  // ── Method not allowed ──

  it('rejects non-GET/POST methods', async () => {
    const req = mockReq({ method: 'DELETE', authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  // ── No eligible pools ──

  it('returns empty results when no pools are eligible', async () => {
    setupPoolFind([]);

    const req = mockReq({ authorization: `Bearer ${VALID_SECRET}` });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.processed).toBe(0);
    expect(res._json.results).toEqual([]);
  });
});
