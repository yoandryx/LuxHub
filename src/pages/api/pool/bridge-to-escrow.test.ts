// src/pages/api/pool/bridge-to-escrow.test.ts
// Unit tests for the bridge-to-escrow API endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1,admin-wallet-2';
process.env.PROGRAM_ID = 'kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj';

// Mock bridgeToEscrow service
const mockBridgeToEscrow = jest.fn();
jest.mock('@/lib/services/poolBridgeService', () => ({
  bridgeToEscrow: (...args: unknown[]) => mockBridgeToEscrow(...args),
}));

// Mock error monitoring (pass-through)
jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: Function) => handler,
}));

// Mock adminConfig — replicate the real isAdmin check
jest.mock('@/lib/config/adminConfig', () => ({
  getAdminConfig: () => ({
    adminWallets: ['admin-wallet-1', 'admin-wallet-2'],
    isAdmin: (w: string | null | undefined) => {
      if (!w) return false;
      return ['admin-wallet-1', 'admin-wallet-2'].includes(w);
    },
    isSuperAdmin: () => false,
  }),
}));

import type { NextApiRequest, NextApiResponse } from 'next';

// Import the handler (default export)
import handler from './bridge-to-escrow';

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
  } as NextApiRequest;
}

function createMockRes(): NextApiResponse & { _status: number; _json: unknown } {
  const res: Record<string, unknown> = {
    _status: 200,
    _json: null,
  };

  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  });
  res.json = jest.fn((data: unknown) => {
    res._json = data;
    return res;
  });
  res.end = jest.fn(() => res);

  return res as unknown as NextApiResponse & { _status: number; _json: unknown };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/pool/bridge-to-escrow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-POST methods', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res._json).toEqual({ error: 'Method not allowed' });
  });

  it('should return 401 when no wallet provided', async () => {
    const req = createMockReq({
      body: { poolId: 'pool123' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json).toEqual({ error: 'Missing wallet for admin authentication' });
  });

  it('should return 401 for non-admin wallet', async () => {
    const req = createMockReq({
      body: { poolId: 'pool123', wallet: 'random-user-wallet' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res._json).toEqual({ error: 'Unauthorized: admin wallet required' });
  });

  it('should return 400 when poolId is missing', async () => {
    const req = createMockReq({
      body: { wallet: 'admin-wallet-1' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._json).toEqual({ error: 'Missing required field: poolId' });
  });

  it('should call bridgeToEscrow and return result for admin wallet', async () => {
    const mockResult = {
      success: true,
      pattern: 'single_proposal',
      proposals: [{ index: 6, txSignature: 'sig123', kind: 'swap_and_exchange' }],
    };
    mockBridgeToEscrow.mockResolvedValue(mockResult);

    const req = createMockReq({
      body: {
        poolId: 'pool123',
        wallet: 'admin-wallet-1',
        options: { slippageBps: 300 },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json).toEqual(mockResult);
    expect(mockBridgeToEscrow).toHaveBeenCalledWith({
      poolId: 'pool123',
      adminWallet: 'admin-wallet-1',
      options: { slippageBps: 300 },
    });
  });

  it('should accept wallet from x-wallet-address header', async () => {
    mockBridgeToEscrow.mockResolvedValue({ success: true, pattern: 'single_proposal', proposals: [] });

    const req = createMockReq({
      headers: { 'x-wallet-address': 'admin-wallet-2' },
      body: { poolId: 'pool123' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBridgeToEscrow).toHaveBeenCalledWith(
      expect.objectContaining({ adminWallet: 'admin-wallet-2' })
    );
  });

  it('should return 400 when service throws', async () => {
    mockBridgeToEscrow.mockRejectedValue(new Error('insufficient_fees_for_bridge'));

    const req = createMockReq({
      body: { poolId: 'pool123', wallet: 'admin-wallet-1' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._json).toEqual({ error: 'insufficient_fees_for_bridge' });
  });
});
