// src/pages/api/pool/confirm-custody.test.ts
// Unit tests for the Phase 11-09 confirm-custody endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1,admin-wallet-2';
// Use a valid base58 pubkey for tests (Squads vault from project context)
const FAKE_VAULT = '8MaQxSmMaVkB9gyThzzspukafkK5kTzNSb5bTpWrF3aR';
const FAKE_NFT_MINT = 'So11111111111111111111111111111111111111112';
process.env.TREASURY_POOLS = FAKE_VAULT;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTransitionPoolState = jest.fn();
jest.mock('@/lib/services/poolStateTransition', () => ({
  transitionPoolState: (...args: unknown[]) => mockTransitionPoolState(...args),
}));

const mockFindById = jest.fn();
const mockUpdateOne = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findById: (...args: unknown[]) => mockFindById(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
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

jest.mock('@/lib/config/treasuryConfig', () => ({
  getTreasury: (type: string) => {
    if (type === 'pools') return FAKE_VAULT;
    return '45L5fwfNLx6Y52nsd1SwcnUunPXDF8BLj1sETRCuwTtt';
  },
}));

// Mock @solana/spl-token
const mockGetAccount = jest.fn();
jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddressSync: jest.fn().mockReturnValue({
    toBase58: () => 'FakeATA111111111111111111111111111111111111111',
  }),
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
}));

// Mock clusterConfig
jest.mock('@/lib/solana/clusterConfig', () => ({
  getConnection: () => ({}),
}));

// Mock Asset and Escrow model lookups (for resolveNftMint)
jest.mock('@/lib/models/Assets', () => ({
  Asset: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ nftMint: FAKE_NFT_MINT }),
      }),
    }),
  },
}));

jest.mock('@/lib/models/Escrow', () => ({
  Escrow: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ nftMint: FAKE_NFT_MINT }),
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/pool/confirm-custody';

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

// Default pool that is in the right state
function makeGraduatedPool(overrides: any = {}) {
  return {
    _id: 'pool-123',
    tokenStatus: 'graduated',
    bagsTokenMint: 'BagsToken1111111111111111111111111111111111',
    selectedAssetId: 'asset-456',
    escrowId: 'escrow-789',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('confirm-custody endpoint', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('returns 401 when no wallet provided', async () => {
    const req = createMockReq({ method: 'POST', body: { poolId: 'pool-123' } });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toMatch(/Missing wallet/);
  });

  it('returns 401 for non-admin wallet', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'random-wallet' } as any,
      body: { poolId: 'pool-123' },
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

  it('returns 404 when pool not found', async () => {
    mockFindById.mockResolvedValue(null);
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'nonexistent' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._json.error).toBe('pool_not_found');
  });

  it('returns 400 wrong_state when pool is not graduated', async () => {
    mockFindById.mockResolvedValue(makeGraduatedPool({ tokenStatus: 'funding' }));
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('wrong_state');
    expect(res._json.current).toBe('funding');
    expect(res._json.expected).toBe('graduated');
  });

  it('returns 400 nft_not_in_custody when vault ATA has no NFT', async () => {
    mockFindById.mockResolvedValue(makeGraduatedPool());
    // getAccount throws (account does not exist)
    mockGetAccount.mockRejectedValue(new Error('Account does not exist'));

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('nft_not_in_custody');
  });

  it('returns 400 nft_not_in_custody when vault ATA has amount 0', async () => {
    mockFindById.mockResolvedValue(makeGraduatedPool());
    mockGetAccount.mockResolvedValue({
      amount: 0n,
      mint: { toBase58: () => FAKE_NFT_MINT },
    });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('nft_not_in_custody');
  });

  it('returns 200 and transitions to custody when NFT is in vault ATA', async () => {
    mockFindById.mockResolvedValue(makeGraduatedPool());
    mockGetAccount.mockResolvedValue({
      amount: 1n,
      mint: { toBase58: () => FAKE_NFT_MINT },
    });
    mockTransitionPoolState.mockResolvedValue({
      success: true,
      newState: 'custody',
      memoTxSignature: 'memo-sig-abc',
    });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.newState).toBe('custody');
    expect(res._json.memoTxSignature).toBe('memo-sig-abc');

    // Verify state transition was called correctly
    expect(mockTransitionPoolState).toHaveBeenCalledWith({
      poolId: 'pool-123',
      fromState: 'graduated',
      toState: 'custody',
      reason: expect.stringContaining('NFT verified in vault ATA'),
    });

    // Verify pool was updated with custody info
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'pool-123' },
      {
        $set: {
          custodyVaultPda: FAKE_VAULT,
          custodyConfirmedAt: expect.any(Date),
        },
      }
    );
  });

  it('returns 409 when state transition fails (race condition)', async () => {
    mockFindById.mockResolvedValue(makeGraduatedPool());
    mockGetAccount.mockResolvedValue({
      amount: 1n,
      mint: { toBase58: () => FAKE_NFT_MINT },
    });
    mockTransitionPoolState.mockResolvedValue({
      success: false,
      error: 'race_condition',
    });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-wallet-address': 'admin-wallet-1' } as any,
      body: { poolId: 'pool-123' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.error).toBe('transition_failed');
    expect(res._json.detail).toBe('race_condition');
    // updateOne should NOT have been called since transition failed
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('accepts poolId from query param', async () => {
    mockFindById.mockResolvedValue(makeGraduatedPool());
    mockGetAccount.mockResolvedValue({
      amount: 1n,
      mint: { toBase58: () => FAKE_NFT_MINT },
    });
    mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'custody' });

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
