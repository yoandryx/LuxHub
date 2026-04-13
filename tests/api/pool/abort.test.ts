// src/pages/api/pool/abort.test.ts
// Unit tests for the Phase 11-14 per-pool abort/refund endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1,admin-wallet-2';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTransitionPoolState = jest.fn();
jest.mock('@/lib/services/poolStateTransition', () => ({
  transitionPoolState: (...args: unknown[]) => mockTransitionPoolState(...args),
}));

const mockFindById = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

const mockDistributionCreate = jest.fn();
jest.mock('@/lib/models/PoolDistribution', () => ({
  PoolDistribution: {
    create: (...args: unknown[]) => mockDistributionCreate(...args),
  },
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: Function) => handler,
  errorMonitor: {
    captureException: jest.fn(),
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

const mockGetAllTokenHolders = jest.fn();
jest.mock('@/lib/services/dasApi', () => ({
  getAllTokenHolders: (...args: unknown[]) => mockGetAllTokenHolders(...args),
}));

const mockLamportsToUsd = jest.fn();
jest.mock('@/lib/services/solPriceService', () => ({
  lamportsToUsd: (...args: unknown[]) => mockLamportsToUsd(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/pool/abort';

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

function makePool(overrides: any = {}) {
  return {
    _id: 'pool-123',
    tokenStatus: 'funding',
    bagsTokenMint: 'BagsToken1111111111111111111111111111111111',
    accumulatedFeesLamports: 500_000_000, // 0.5 SOL
    backingEscrowPda: 'EscrowPda111111111111111111111111111111111',
    ...overrides,
  };
}

const VALID_REASON = 'This pool needs to be aborted for safety reasons';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'aborted' });
  mockLamportsToUsd.mockResolvedValue(80); // 0.5 SOL ~ $80
  mockGetAllTokenHolders.mockResolvedValue([
    { wallet: 'holder-1', balance: 600, ownershipPercent: 60 },
    { wallet: 'holder-2', balance: 400, ownershipPercent: 40 },
  ]);
  mockDistributionCreate.mockImplementation((data: any) => ({
    _id: 'dist-abc',
    ...data,
  }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('abort endpoint', () => {
  // --- Auth & validation ---

  it('returns 405 for non-POST requests', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 401 when no wallet provided', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { poolId: 'pool-123', reason: VALID_REASON },
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
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Unauthorized/);
  });

  it('returns 400 for missing poolId', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('invalid_pool_id');
  });

  it('returns 400 when reason is too short', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: 'short' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('reason_required');
  });

  it('returns 400 when reason is missing', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('reason_required');
  });

  it('returns 404 when pool not found', async () => {
    mockFindById.mockResolvedValue(null);
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'nonexistent', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._json.error).toBe('pool_not_found');
  });

  it('returns 400 for non-abortable state (distributed)', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'distributed' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('not_abortable');
    expect(res._json.current).toBe('distributed');
  });

  // --- Pre-trading abort (pending, minted) ---

  it('aborts pending pool with no distribution created', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'pending' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.flow).toBe('pre_trading');
    expect(mockDistributionCreate).not.toHaveBeenCalled();
    expect(mockTransitionPoolState).toHaveBeenCalledWith({
      poolId: 'pool-123',
      fromState: 'pending',
      toState: 'aborted',
      reason: expect.stringContaining('admin abort'),
    });
  });

  it('aborts minted pool with no distribution created', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'minted' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.flow).toBe('pre_trading');
    expect(mockDistributionCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when pre-trading transition fails', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'pending' }));
    mockTransitionPoolState.mockResolvedValue({ success: false, error: 'race_condition' });
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.error).toBe('transition_failed');
    expect(res._json.detail).toBe('race_condition');
  });

  // --- Funding abort ---

  it('creates abort_refund distribution for funding pool', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'funding' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.flow).toBe('funding_abort');
    expect(res._json.holders).toBe(2);
    expect(res._json.refundUsd).toBe(80);
    expect(res._json.distributionId).toBe('dist-abc');

    // Verify distribution was created with correct fields
    expect(mockDistributionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: 'pool-123',
        distributionKind: 'abort_refund',
        status: 'pending',
        salePriceUSD: 80,
        sourceEscrowPda: 'EscrowPda111111111111111111111111111111111',
        sourceTxSignature: null,
      })
    );

    // Verify distributions array has correct pro-rata splits
    const createArg = mockDistributionCreate.mock.calls[0][0];
    expect(createArg.distributions).toHaveLength(2);
    expect(createArg.distributions[0].payoutWallet).toBe('holder-1');
    expect(createArg.distributions[0].payoutUSD).toBeCloseTo(48); // 60% of $80
    expect(createArg.distributions[1].payoutWallet).toBe('holder-2');
    expect(createArg.distributions[1].payoutUSD).toBeCloseTo(32); // 40% of $80

    // Verify state transition
    expect(mockTransitionPoolState).toHaveBeenCalledWith({
      poolId: 'pool-123',
      fromState: 'funding',
      toState: 'aborted',
      reason: expect.stringContaining('funding_abort'),
    });
  });

  it('returns 400 no_bags_token when funding pool has no token mint', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'funding', bagsTokenMint: null }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toBe('no_bags_token');
  });

  // --- Graduated abort ---

  it('creates distribution with manual_recovery_required label for graduated pool', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'graduated' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.flow).toBe('post_graduation_abort_manual_recovery_required');
    expect(res._json.distributionId).toBe('dist-abc');

    expect(mockDistributionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        distributionKind: 'abort_refund',
      })
    );

    expect(mockTransitionPoolState).toHaveBeenCalledWith(
      expect.objectContaining({
        fromState: 'graduated',
        toState: 'aborted',
      })
    );
  });

  // --- Custody abort ---

  it('creates distribution for custody abort (resale_listed)', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'resale_listed' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.flow).toBe('custody_abort');
    expect(mockTransitionPoolState).toHaveBeenCalledWith(
      expect.objectContaining({
        fromState: 'resale_listed',
        toState: 'aborted',
      })
    );
  });

  it('creates distribution for custody abort (resale_unlisted)', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'resale_unlisted' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.flow).toBe('custody_abort');
  });

  // --- Snapshot failure ---

  it('returns 500 with snapshot_failed when DAS fails twice', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'funding' }));
    mockGetAllTokenHolders
      .mockRejectedValueOnce(new Error('DAS down'))
      .mockRejectedValueOnce(new Error('DAS still down'));

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json.error).toBe('snapshot_failed');
    expect(res._json.distributionId).toBe('dist-abc');

    // Verify failed distribution was created
    expect(mockDistributionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'snapshot_failed',
        distributionKind: 'abort_refund',
      })
    );

    // State should NOT have transitioned
    expect(mockTransitionPoolState).not.toHaveBeenCalled();
  });

  // --- poolId from query ---

  it('accepts poolId from query param', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'pending' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-from-query' },
      body: { reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockFindById).toHaveBeenCalledWith('pool-from-query');
  });

  // --- Zero accumulated fees ---

  it('handles zero accumulated fees gracefully', async () => {
    mockFindById.mockResolvedValue(makePool({ tokenStatus: 'funding', accumulatedFeesLamports: 0 }));
    mockLamportsToUsd.mockResolvedValue(0);
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123', reason: VALID_REASON },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.refundUsd).toBe(0);

    const createArg = mockDistributionCreate.mock.calls[0][0];
    expect(createArg.distributions[0].payoutUSD).toBe(0);
    expect(createArg.distributions[1].payoutUSD).toBe(0);
  });
});
