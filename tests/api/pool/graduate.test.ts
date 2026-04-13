// src/pages/api/pool/graduate.test.ts
// Unit tests for the Phase 11 graduation trigger endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1,admin-wallet-2';
process.env.CRON_SECRET = 'test-cron-secret';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLamportsToUsd = jest.fn();
const mockUsdcUnitsToUsd = jest.fn();
jest.mock('@/lib/services/solPriceService', () => ({
  lamportsToUsd: (...args: unknown[]) => mockLamportsToUsd(...args),
  usdcUnitsToUsd: (...args: unknown[]) => mockUsdcUnitsToUsd(...args),
}));

const mockTransitionPoolState = jest.fn();
jest.mock('@/lib/services/poolStateTransition', () => ({
  transitionPoolState: (...args: unknown[]) => mockTransitionPoolState(...args),
}));

const mockBridgeToEscrow = jest.fn();
jest.mock('@/lib/services/poolBridgeService', () => ({
  bridgeToEscrow: (...args: unknown[]) => mockBridgeToEscrow(...args),
}));

const mockFindById = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: Function) => handler,
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
import handler, { triggerGraduationCheck } from '@/pages/api/pool/graduate';

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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default: usdcUnitsToUsd is pure math (units / 1_000_000)
  mockUsdcUnitsToUsd.mockImplementation((units: number) => units / 1_000_000);
});

// ---------------------------------------------------------------------------
// triggerGraduationCheck unit tests
// ---------------------------------------------------------------------------

describe('triggerGraduationCheck', () => {
  it('throws pool_not_found when pool does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(triggerGraduationCheck('nonexistent')).rejects.toThrow(
      'pool_not_found'
    );
  });

  it('returns already_graduated_or_later for post-graduation states', async () => {
    for (const state of ['graduated', 'custody', 'resale_listed', 'resold', 'distributed']) {
      mockFindById.mockResolvedValue({ tokenStatus: state });
      const result = await triggerGraduationCheck('pool1');
      expect(result.graduated).toBe(true);
      expect(result.reason).toBe('already_graduated_or_later');
    }
  });

  it('returns wrong_state for non-funding states like pending/minted', async () => {
    mockFindById.mockResolvedValue({ tokenStatus: 'pending' });
    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(false);
    expect(result.reason).toBe('wrong_state');
  });

  it('returns no_target_set when fundingTargetUsdc is missing', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: null,
    });
    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(false);
    expect(result.reason).toBe('no_target_set');
  });

  it('returns target_not_met when accumulated < target with buffer', async () => {
    // Pool: accumulated 50_000_000_000 lamports, target 100_000_000 USDC units ($100)
    // Buffer: 2% -> target with buffer = $102
    // Accumulated: $50
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 50_000_000_000,
      slippageBufferBps: 200,
    });
    mockLamportsToUsd.mockResolvedValue(50);

    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(false);
    expect(result.reason).toBe('target_not_met');
    expect(result.accumulatedUsd).toBe(50);
    expect(result.targetUsdWithBuffer).toBe(102);
  });

  it('returns target_not_met when barely missed (101.50 < 102)', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 100_000_000_000,
      slippageBufferBps: 200,
    });
    mockLamportsToUsd.mockResolvedValue(101.5);

    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(false);
    expect(result.reason).toBe('target_not_met');
  });

  it('graduates when target is exactly met with buffer (102 >= 102)', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 110_000_000_000,
      slippageBufferBps: 200,
    });
    mockLamportsToUsd.mockResolvedValue(102);
    mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'graduated' });
    mockBridgeToEscrow.mockResolvedValue({ success: true, pattern: 'single_proposal' });

    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(true);
    expect(result.reason).toBe('graduated_now');
    expect(result.accumulatedUsd).toBe(102);
    expect(result.targetUsdWithBuffer).toBe(102);
    expect(mockTransitionPoolState).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: 'pool1',
        fromState: 'funding',
        toState: 'graduated',
      })
    );
    expect(mockBridgeToEscrow).toHaveBeenCalledWith({
      poolId: 'pool1',
      adminWallet: 'cron',
    });
  });

  it('treats transition race condition as idempotent (already_graduated_or_later)', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 200_000_000_000,
      slippageBufferBps: 200,
    });
    mockLamportsToUsd.mockResolvedValue(200);
    mockTransitionPoolState.mockResolvedValue({ success: false, error: 'race_condition' });

    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(true);
    expect(result.reason).toBe('already_graduated_or_later');
    // Bridge should NOT have been called
    expect(mockBridgeToEscrow).not.toHaveBeenCalled();
  });

  it('returns graduated:true even when bridge fails', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 200_000_000_000,
      slippageBufferBps: 200,
    });
    mockLamportsToUsd.mockResolvedValue(200);
    mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'graduated' });
    mockBridgeToEscrow.mockRejectedValue(new Error('jupiter_quote_failed'));

    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(true);
    expect(result.reason).toBe('graduated_now');
    expect(result.bridgeResult).toEqual({
      success: false,
      error: 'jupiter_quote_failed',
    });
  });

  it('uses default slippageBufferBps of 200 when not set', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 200_000_000_000,
      // No slippageBufferBps set
    });
    mockLamportsToUsd.mockResolvedValue(200);
    mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'graduated' });
    mockBridgeToEscrow.mockResolvedValue({ success: true });

    const result = await triggerGraduationCheck('pool1');
    expect(result.graduated).toBe(true);
    // Default buffer = 200 bps = 2%, target = $100 * 1.02 = $102
    expect(result.targetUsdWithBuffer).toBe(102);
  });
});

// ---------------------------------------------------------------------------
// HTTP handler tests
// ---------------------------------------------------------------------------

describe('graduate HTTP handler', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 401 when no wallet and no cron secret', async () => {
    const req = createMockReq({ method: 'POST', body: { poolId: 'pool1' } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Missing wallet/);
  });

  it('returns 401 for non-admin wallet', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'random-wallet' } as any,
      body: { poolId: 'pool1' },
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
      body: {},
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('invalid_pool_id');
  });

  it('allows admin wallet to trigger graduation', async () => {
    mockFindById.mockResolvedValue({
      tokenStatus: 'funding',
      fundingTargetUsdc: 100_000_000,
      accumulatedFeesLamports: 200_000_000_000,
      slippageBufferBps: 200,
    });
    mockLamportsToUsd.mockResolvedValue(200);
    mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'graduated' });
    mockBridgeToEscrow.mockResolvedValue({ success: true });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool1' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.graduated).toBe(true);
    expect(res._json.reason).toBe('graduated_now');
  });

  it('allows cron secret to bypass admin check', async () => {
    mockFindById.mockResolvedValue({ tokenStatus: 'pending' });

    const req = createMockReq({
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' } as any,
      body: { poolId: 'pool1' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.reason).toBe('wrong_state');
  });

  it('returns 400 when triggerGraduationCheck throws', async () => {
    mockFindById.mockResolvedValue(null);

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'nonexistent' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.error).toBe('pool_not_found');
  });

  it('accepts poolId from query param', async () => {
    mockFindById.mockResolvedValue({ tokenStatus: 'graduated' });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      query: { poolId: 'pool-from-query' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockFindById).toHaveBeenCalledWith('pool-from-query');
  });
});
