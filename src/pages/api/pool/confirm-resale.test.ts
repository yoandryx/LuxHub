// src/pages/api/pool/confirm-resale.test.ts
// Unit tests for the Phase 11-11 confirm-resale endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1,admin-wallet-2';
process.env.CRON_SECRET = 'test-cron-secret';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTransitionPoolState = jest.fn();
jest.mock('@/lib/services/poolStateTransition', () => ({
  transitionPoolState: (...args: unknown[]) => mockTransitionPoolState(...args),
}));

const mockPoolFindById = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findById: (...args: unknown[]) => mockPoolFindById(...args),
  },
}));

const mockDistFindOne = jest.fn();
const mockDistCreate = jest.fn();
jest.mock('@/lib/models/PoolDistribution', () => ({
  PoolDistribution: {
    findOne: (...args: unknown[]) => mockDistFindOne(...args),
    create: (...args: unknown[]) => mockDistCreate(...args),
  },
}));

const mockGetAllTokenHolders = jest.fn();
jest.mock('@/lib/services/dasApi', () => ({
  getAllTokenHolders: (...args: unknown[]) => mockGetAllTokenHolders(...args),
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

const mockCaptureException = jest.fn();
jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: Function) => handler,
  errorMonitor: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}));

jest.mock('@/lib/config/adminConfig', () => ({
  getAdminConfig: () => ({
    adminWallets: ['admin-wallet-1', 'admin-wallet-2'],
    isAdmin: (w: string | null | undefined) => {
      if (!w) return false;
      return ['admin-wallet-1', 'admin-wallet-2'].includes(w);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from './confirm-resale';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'POST',
    headers: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as NextApiRequest;
}

function createMockRes(): NextApiResponse & {
  _status: number;
  _json: any;
} {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

function makeResaleListedPool(overrides: any = {}) {
  return {
    _id: 'pool-123',
    tokenStatus: 'resale_listed',
    bagsTokenMint: 'BagsToken1111111111111111111111111111111111',
    resaleEscrowPda: 'ResaleEscrowPda1111111111111111111111111',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'resold' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('confirm-resale endpoint', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 401 when no wallet and no cron secret', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { poolId: 'pool-123', confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Missing wallet/);
  });

  it('returns 401 for non-admin wallet', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'random-wallet' } as any,
      body: { poolId: 'pool-123', confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Unauthorized/);
  });

  it('allows access with valid CRON_SECRET', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    mockDistFindOne.mockResolvedValue(null);
    mockGetAllTokenHolders.mockResolvedValue([
      { wallet: 'holder-1', balance: 1000, ownershipPercent: 100 },
    ]);
    mockDistCreate.mockResolvedValue({
      _id: 'dist-1',
      totalDistributedUSD: 970,
      claimDeadlineAt: new Date(),
    });

    const req = createMockReq({
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' } as any,
      body: { poolId: 'pool-123', confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
  });

  it('returns 400 for missing poolId', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('invalid_pool_id');
  });

  it('returns 400 for missing confirmDeliveryTxSignature', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('missing_confirm_delivery_tx_signature');
  });

  it('returns 400 for invalid resalePriceUsdc', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 0 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('invalid_resale_price');
  });

  it('returns 404 when pool not found', async () => {
    mockPoolFindById.mockResolvedValue(null);
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'nonexistent' },
      body: { confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._json.error).toBe('pool_not_found');
  });

  it('returns 400 wrong_state when pool is not resale_listed', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool({ tokenStatus: 'custody' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('wrong_state');
    expect(res._json.current).toBe('custody');
  });

  it('returns 400 when pool has no bagsTokenMint', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool({ bagsTokenMint: null }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('no_bags_token');
  });

  it('returns existing distribution on idempotent call', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    const existingDist = {
      _id: 'existing-dist',
      pool: 'pool-123',
      distributionKind: 'resale',
      sourceTxSignature: 'tx-1',
    };
    mockDistFindOne.mockResolvedValue(existingDist);

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-1', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.idempotent).toBe(true);
    expect(res._json.distribution).toBe(existingDist);
    // Should NOT call getAllTokenHolders or create new distribution
    expect(mockGetAllTokenHolders).not.toHaveBeenCalled();
    expect(mockDistCreate).not.toHaveBeenCalled();
  });

  it('happy path: 3 holders, $1000 resale -> proportional distribution', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    mockDistFindOne.mockResolvedValue(null);
    mockGetAllTokenHolders.mockResolvedValue([
      { wallet: 'holder-A', balance: 500, ownershipPercent: 50 },
      { wallet: 'holder-B', balance: 300, ownershipPercent: 30 },
      { wallet: 'holder-C', balance: 200, ownershipPercent: 20 },
    ]);
    mockDistCreate.mockImplementation((data: any) => ({
      ...data,
      _id: 'dist-new',
      totalDistributedUSD: data.salePriceUSD * 0.97,
      claimDeadlineAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }));

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-abc', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.distribution.holders).toBe(3);

    // Verify PoolDistribution.create was called with correct data
    expect(mockDistCreate).toHaveBeenCalledTimes(1);
    const createArg = mockDistCreate.mock.calls[0][0];
    expect(createArg.pool).toBe('pool-123');
    expect(createArg.distributionKind).toBe('resale');
    expect(createArg.status).toBe('pending');
    expect(createArg.salePriceUSD).toBe(1000);
    expect(createArg.sourceTxSignature).toBe('tx-abc');
    expect(createArg.snapshotTakenAt).toBeInstanceOf(Date);

    // Verify distributions are proportional: 97% of $1000 = $970
    const dists = createArg.distributions;
    expect(dists).toHaveLength(3);
    expect(dists[0].payoutWallet).toBe('holder-A');
    expect(dists[0].shares).toBe(500);
    expect(dists[0].payoutUSD).toBeCloseTo(485, 1); // 50% of 970
    expect(dists[1].payoutWallet).toBe('holder-B');
    expect(dists[1].payoutUSD).toBeCloseTo(291, 1); // 30% of 970
    expect(dists[2].payoutWallet).toBe('holder-C');
    expect(dists[2].payoutUSD).toBeCloseTo(194, 1); // 20% of 970

    // Verify state transition was called
    expect(mockTransitionPoolState).toHaveBeenCalledWith({
      poolId: 'pool-123',
      fromState: 'resale_listed',
      toState: 'resold',
      reason: expect.stringContaining('3 holders snapshotted'),
      txContext: 'tx-abc',
    });
  });

  it('snapshot failure: DAS throws twice -> creates failed distribution, returns 500', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    mockDistFindOne.mockResolvedValue(null);
    mockGetAllTokenHolders
      .mockRejectedValueOnce(new Error('DAS timeout'))
      .mockRejectedValueOnce(new Error('DAS timeout retry'));
    mockDistCreate.mockResolvedValue({ _id: 'failed-dist' });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-fail', resalePriceUsdc: 500 },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json.error).toBe('snapshot_failed');
    expect(res._json.distributionId).toBe('failed-dist');

    // Verify failed distribution was created
    expect(mockDistCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: 'pool-123',
        distributionKind: 'resale',
        status: 'snapshot_failed',
        sourceTxSignature: 'tx-fail',
      })
    );

    // Verify error was captured
    expect(mockCaptureException).toHaveBeenCalled();

    // State transition should NOT be called
    expect(mockTransitionPoolState).not.toHaveBeenCalled();
  });

  it('empty holders: 0 holders from DAS -> distribution with 0 entries', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    mockDistFindOne.mockResolvedValue(null);
    mockGetAllTokenHolders.mockResolvedValue([]);
    mockDistCreate.mockImplementation((data: any) => ({
      ...data,
      _id: 'dist-empty',
      totalDistributedUSD: data.salePriceUSD * 0.97,
      claimDeadlineAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }));

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-empty', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);

    // Should still succeed -- unusual but shouldn't crash
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.distribution.holders).toBe(0);

    const createArg = mockDistCreate.mock.calls[0][0];
    expect(createArg.distributions).toHaveLength(0);
  });

  it('DAS succeeds on retry after first failure', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    mockDistFindOne.mockResolvedValue(null);
    mockGetAllTokenHolders
      .mockRejectedValueOnce(new Error('DAS timeout'))
      .mockResolvedValueOnce([
        { wallet: 'holder-X', balance: 1000, ownershipPercent: 100 },
      ]);
    mockDistCreate.mockImplementation((data: any) => ({
      ...data,
      _id: 'dist-retry',
      totalDistributedUSD: data.salePriceUSD * 0.97,
      claimDeadlineAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }));

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-123' },
      body: { confirmDeliveryTxSignature: 'tx-retry', resalePriceUsdc: 500 },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(mockGetAllTokenHolders).toHaveBeenCalledTimes(2);
  });

  it('accepts poolId from query param', async () => {
    mockPoolFindById.mockResolvedValue(makeResaleListedPool());
    mockDistFindOne.mockResolvedValue(null);
    mockGetAllTokenHolders.mockResolvedValue([
      { wallet: 'holder-1', balance: 100, ownershipPercent: 100 },
    ]);
    mockDistCreate.mockImplementation((data: any) => ({
      ...data,
      _id: 'dist-q',
      totalDistributedUSD: 970,
      claimDeadlineAt: new Date(),
    }));

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-from-query' },
      body: { confirmDeliveryTxSignature: 'tx-q', resalePriceUsdc: 1000 },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockPoolFindById).toHaveBeenCalledWith('pool-from-query');
  });
});
