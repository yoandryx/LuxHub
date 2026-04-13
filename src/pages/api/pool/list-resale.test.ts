// src/pages/api/pool/list-resale.test.ts
// Unit tests for the Phase 11-10 list-resale endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1,admin-wallet-2';
process.env.PROGRAM_ID = 'kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj';
process.env.NEXT_PUBLIC_SQUADS_MSIG = '5hy7HgdqM3vCPPtBY8crXqDhy3DttBvzrY3rzWnVRZor';
process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://fake-rpc.example.com';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
const FAKE_VAULT = '8MaQxSmMaVkB9gyThzzspukafkK5kTzNSb5bTpWrF3aR';
const FAKE_NFT_MINT = 'So11111111111111111111111111111111111111112';
const FAKE_POOL_ID = '507f1f77bcf86cd799439011';

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

const mockEscrowSave = jest.fn();
const mockEscrowConstructor = jest.fn();
jest.mock('@/lib/models/Escrow', () => {
  return {
    Escrow: jest.fn().mockImplementation((data: any) => {
      mockEscrowConstructor(data);
      return {
        ...data,
        _id: 'escrow-id-123',
        save: mockEscrowSave,
      };
    }),
  };
});

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

jest.mock('@/lib/solana/clusterConfig', () => ({
  getConnection: () => ({}),
  getClusterConfig: () => ({
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chain: 'mainnet-beta',
    network: 'mainnet-beta',
    endpoint: 'https://fake-rpc.example.com',
    explorerUrl: (a: string) => `https://solscan.io/account/${a}`,
    explorerTxUrl: (t: string) => `https://solscan.io/tx/${t}`,
  }),
}));

// Mock @solana/spl-token
const FAKE_PDA = new (require('@solana/web3.js').PublicKey)('6YEpC6rpQokYzpwcG27mdQx95paoT2pfPckvopqKecSX');
jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddressSync: jest.fn().mockReturnValue(FAKE_PDA),
}));

// Patch findProgramAddressSync to return a deterministic PDA in test env
// (Jest environment polyfills interfere with @noble/hashes used by @solana/web3.js)
const { PublicKey: RealPublicKey } = require('@solana/web3.js');
const origFindProgramAddressSync = RealPublicKey.findProgramAddressSync.bind(RealPublicKey);
RealPublicKey.findProgramAddressSync = (seeds: Buffer[], programId: any) => {
  try {
    return origFindProgramAddressSync(seeds, programId);
  } catch {
    // Return a deterministic fake PDA when derivation fails in Jest
    return [FAKE_PDA, 255];
  }
};

// Mock @sqds/multisig
jest.mock('@sqds/multisig', () => ({
  getVaultPda: jest.fn().mockReturnValue([
    new (require('@solana/web3.js').PublicKey)(FAKE_VAULT),
    255,
  ]),
}));

// Mock @coral-xyz/anchor -- use a real BN so PDA derivation works
jest.mock('@coral-xyz/anchor', () => {
  // Lightweight BN that supports toArrayLike for le u64
  class FakeBN {
    private val: bigint;
    constructor(v: any) { this.val = BigInt(v || 0); }
    toArrayLike(_Buf: any, endian: string, len: number): Buffer {
      const buf = Buffer.alloc(len);
      let n = this.val;
      if (endian === 'le') {
        for (let i = 0; i < len; i++) {
          buf[i] = Number(n & BigInt(0xff));
          n >>= BigInt(8);
        }
      }
      return buf;
    }
    toString() { return this.val.toString(); }
  }
  return { BN: FakeBN };
});

// Mock Asset model for resolveNftMint
jest.mock('@/lib/models/Assets', () => ({
  Asset: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ nftMint: FAKE_NFT_MINT }),
      }),
    }),
  },
}));

// Mock global fetch for Squads propose API call
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ---------------------------------------------------------------------------
// Import handler
// ---------------------------------------------------------------------------

import handler from './list-resale';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'POST',
    headers: { 'x-wallet-address': 'admin-wallet-1' },
    query: { poolId: FAKE_POOL_ID },
    body: { resalePriceUsdc: 5000 },
    ...overrides,
  } as unknown as NextApiRequest;
}

function buildRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res as NextApiResponse;
}

function mockPoolRecord(overrides: any = {}) {
  return {
    _id: FAKE_POOL_ID,
    tokenStatus: 'custody',
    selectedAssetId: 'asset-id-123',
    nftMint: FAKE_NFT_MINT,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/pool/list-resale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransitionPoolState.mockResolvedValue({ success: true, memoTxSignature: 'memo-sig-123' });
    mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockEscrowSave.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        transactionIndex: '42',
        proposalPda: 'proposalPda123',
        vaultTransactionPda: 'vaultTxPda123',
        signature: 'proposal-sig-abc',
        squadsDeepLink: 'https://v4.squads.so/squads/xxx/tx/42',
        autoApproved: true,
      }),
    });
  });

  it('rejects non-POST methods with 405', async () => {
    const req = buildReq({ method: 'GET' });
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejects missing wallet with 401', async () => {
    const req = buildReq({ headers: {} as any });
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects non-admin wallet with 401', async () => {
    const req = buildReq({ headers: { 'x-wallet-address': 'random-wallet' } as any });
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects invalid resale price with 400', async () => {
    const req = buildReq({ body: { resalePriceUsdc: -100 } });
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_resale_price' });
  });

  it('rejects zero resale price with 400', async () => {
    const req = buildReq({ body: { resalePriceUsdc: 0 } });
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_resale_price' });
  });

  it('rejects missing resale price with 400', async () => {
    const req = buildReq({ body: {} });
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_resale_price' });
  });

  it('returns 404 when pool not found', async () => {
    mockFindById.mockResolvedValue(null);
    const req = buildReq();
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'pool_not_found' });
  });

  it('rejects wrong state (graduated) with 400', async () => {
    mockFindById.mockResolvedValue(mockPoolRecord({ tokenStatus: 'graduated' }));
    const req = buildReq();
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'wrong_state', current: 'graduated', expected: 'custody' })
    );
  });

  it('rejects wrong state (funding) with 400', async () => {
    mockFindById.mockResolvedValue(mockPoolRecord({ tokenStatus: 'funding' }));
    const req = buildReq();
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'wrong_state', current: 'funding' })
    );
  });

  it('happy path: creates proposal, escrow record, transitions state', async () => {
    mockFindById.mockResolvedValue(mockPoolRecord());
    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    // Should succeed
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.salePriceUsdc).toBe(5000);
    expect(body.newState).toBe('resale_listed');
    expect(body.resaleEscrowPda).toBeTruthy();

    // Squads propose was called
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toContain('/api/squads/propose');

    // Escrow record was created with pool-backed flag
    expect(mockEscrowConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        convertedToPool: true,
        poolId: FAKE_POOL_ID,
        paymentMint: 'USDC',
        saleMode: 'fixed_price',
      })
    );
    expect(mockEscrowSave).toHaveBeenCalledTimes(1);

    // State transition was called
    expect(mockTransitionPoolState).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: FAKE_POOL_ID,
        fromState: 'custody',
        toState: 'resale_listed',
      })
    );

    // Pool was updated with resale metadata
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: FAKE_POOL_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          resaleListingPriceUSD: 5000,
          resaleEscrowId: 'escrow-id-123',
        }),
      })
    );
  });

  it('returns 500 when Squads proposal fails', async () => {
    mockFindById.mockResolvedValue(mockPoolRecord());
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'proposal creation failed' }),
    });
    const req = buildReq();
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'proposal_failed' })
    );
  });

  it('returns 409 when state transition fails', async () => {
    mockFindById.mockResolvedValue(mockPoolRecord());
    mockTransitionPoolState.mockResolvedValue({ success: false, error: 'race_condition' });
    const req = buildReq();
    const res = buildRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'transition_failed', detail: 'race_condition' })
    );
  });
});
