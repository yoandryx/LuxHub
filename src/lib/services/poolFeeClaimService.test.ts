// src/lib/services/poolFeeClaimService.test.ts
// Unit tests for poolFeeClaimService — the authoritative fee accumulation engine.

import { Types } from 'mongoose';

// ── Mock setup (must be before imports) ──

const mockPoolFindById = jest.fn();
const mockPoolFindOneAndUpdate = jest.fn();
const mockPoolUpdateOne = jest.fn();
const mockPoolFind = jest.fn();
const mockTreasuryDepositCreate = jest.fn();
const mockTreasuryDepositFind = jest.fn();

jest.mock('@/lib/models/Pool', () => ({
  __esModule: true,
  Pool: {
    findById: (...args: any[]) => mockPoolFindById(...args),
    findOneAndUpdate: (...args: any[]) => mockPoolFindOneAndUpdate(...args),
    updateOne: (...args: any[]) => mockPoolUpdateOne(...args),
    find: (...args: any[]) => ({
      lean: () => mockPoolFind(...args),
    }),
  },
}));

jest.mock('@/lib/models/TreasuryDeposit', () => ({
  TreasuryDeposit: {
    create: (...args: any[]) => mockTreasuryDepositCreate(...args),
    find: (...args: any[]) => ({
      lean: () => mockTreasuryDepositFind(...args),
    }),
  },
}));

jest.mock('@/lib/config/treasuryConfig', () => ({
  getTreasury: (type: string) => {
    if (type === 'pools') return '45L5fwfNLx6Y52nsd1SwcnUunPXDF8BLj1sETRCuwTtt';
    throw new Error(`Unknown treasury: ${type}`);
  },
}));

const mockGetConnection = jest.fn();
jest.mock('@/lib/solana/clusterConfig', () => ({
  getConnection: () => mockGetConnection(),
}));

jest.mock('@/lib/services/solPriceService', () => ({
  lamportsToUsd: jest.fn().mockResolvedValue(100),
}));

// Mock the Squads helper
const mockBuildVaultProposal = jest.fn();
jest.mock('./poolFeeClaimSquadsHelper', () => ({
  buildVaultProposalFromBagsTxs: (...args: any[]) => mockBuildVaultProposal(...args),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ── Imports (after mocks) ──

import {
  claimPoolFees,
  getPendingFees,
  reconcilePoolFeeCounters,
  parseWithdrawalAmount,
} from './poolFeeClaimService';

// ── Test data ──

const POOL_ID = new Types.ObjectId().toString();
const TOKEN_MINT = '72DexAuaFcpDcLLZtu4mZMkYXa2USo4AyTGmuig8BAGS';
const TREASURY_POOLS = '45L5fwfNLx6Y52nsd1SwcnUunPXDF8BLj1sETRCuwTtt';
const TX_SIG = 'abc123txsig';

function makePool(overrides: Record<string, any> = {}) {
  return {
    _id: POOL_ID,
    bagsTokenMint: TOKEN_MINT,
    tokenStatus: 'funding',
    feeClaimInFlight: false,
    accumulatedFeesLamports: 0,
    ...overrides,
  };
}

// ── Tests ──

describe('poolFeeClaimService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BAGS_API_KEY = 'test-bags-key';
    mockPoolUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockTreasuryDepositCreate.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.BAGS_API_KEY;
  });

  // ── Happy path ──
  describe('claimPoolFees — happy path', () => {
    it('should claim 0.5 SOL, increment counter, write audit record', async () => {
      const pool = makePool();
      mockPoolFindById.mockResolvedValue(pool);
      mockPoolFindOneAndUpdate.mockResolvedValue(pool);
      mockBuildVaultProposal.mockResolvedValue({
        success: true,
        txSignatures: ['sig1', 'sig2'],
        withdrawalTxSignature: 'sig2',
      });

      // Mock the on-chain tx parsing
      const mockConnection = {
        getTransaction: jest.fn().mockResolvedValue({
          meta: {
            preBalances: [1_000_000_000, 500_000_000],
            postBalances: [1_500_000_000, 0],
          },
          transaction: {
            message: {
              staticAccountKeys: [
                { toBase58: () => TREASURY_POOLS },
                { toBase58: () => 'other_wallet' },
              ],
            },
          },
        }),
      };
      mockGetConnection.mockReturnValue(mockConnection);

      // Mock Bags API
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              { tx: 'base64tx1', blockhash: 'hash1' },
              { tx: 'base64tx2', blockhash: 'hash2' },
            ],
          }),
      });

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(true);
      expect(result.withdrawalAmountLamports).toBe(500_000_000); // 0.5 SOL
      expect(result.txSignatures).toEqual(['sig1', 'sig2']);
      expect(result.withdrawalTxSignature).toBe('sig2');

      // Verify Pool.updateOne was called with $inc
      expect(mockPoolUpdateOne).toHaveBeenCalledWith(
        { _id: POOL_ID },
        expect.objectContaining({
          $inc: { accumulatedFeesLamports: 500_000_000 },
          $push: { feeClaimTxSignatures: 'sig2' },
          $set: expect.objectContaining({
            lastFeeClaimAt: expect.any(Date),
            lastFeeClaimError: null,
          }),
        })
      );

      // Verify TreasuryDeposit.create was called
      expect(mockTreasuryDepositCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          depositType: 'pool_trading_fee',
          pool: POOL_ID,
          amountLamports: 500_000_000,
          amountSOL: 0.5,
          txSignature: 'sig2',
          toWallet: TREASURY_POOLS,
        })
      );

      // Verify lock was released (finally block)
      const releaseCalls = mockPoolUpdateOne.mock.calls.filter(
        (call: any[]) =>
          call[1]?.$set?.feeClaimInFlight === false
      );
      expect(releaseCalls.length).toBeGreaterThan(0);
    });
  });

  // ── Already in flight ──
  describe('claimPoolFees — already in flight', () => {
    it('should return skippedReason: already_in_flight when lock is held', async () => {
      const pool = makePool({ feeClaimInFlight: true });
      mockPoolFindById.mockResolvedValue(pool);
      mockPoolFindOneAndUpdate.mockResolvedValue(null); // CAS fails

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe('already_in_flight');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Nothing to claim ──
  describe('claimPoolFees — nothing to claim', () => {
    it('should return skippedReason: nothing_to_claim when Bags returns 400', async () => {
      const pool = makePool();
      mockPoolFindById.mockResolvedValue(pool);
      mockPoolFindOneAndUpdate.mockResolvedValue(pool);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      });

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(true);
      expect(result.skippedReason).toBe('nothing_to_claim');
    });

    it('should return nothing_to_claim when Bags returns empty array', async () => {
      const pool = makePool();
      mockPoolFindById.mockResolvedValue(pool);
      mockPoolFindOneAndUpdate.mockResolvedValue(pool);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(true);
      expect(result.skippedReason).toBe('nothing_to_claim');
    });
  });

  // ── Invalid state ──
  describe('claimPoolFees — invalid state', () => {
    it('should return skippedReason: invalid_state for distributed pool', async () => {
      const pool = makePool({ tokenStatus: 'distributed' });
      mockPoolFindById.mockResolvedValue(pool);

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe('invalid_state');
    });

    it('should return invalid_state when no bagsTokenMint', async () => {
      const pool = makePool({ bagsTokenMint: undefined });
      mockPoolFindById.mockResolvedValue(pool);

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(false);
      expect(result.skippedReason).toBe('invalid_state');
    });
  });

  // ── Proposal failure ──
  describe('claimPoolFees — Squads proposal failure', () => {
    it('should return error and release lock on proposal failure', async () => {
      const pool = makePool();
      mockPoolFindById.mockResolvedValue(pool);
      mockPoolFindOneAndUpdate.mockResolvedValue(pool);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [{ tx: 'base64tx1', blockhash: 'hash1' }],
          }),
      });

      mockBuildVaultProposal.mockResolvedValue({
        success: false,
        txSignatures: [],
        error: 'Squads proposal rejected',
      });

      const result = await claimPoolFees(POOL_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Squads proposal');

      // Lock should be released
      const releaseCalls = mockPoolUpdateOne.mock.calls.filter(
        (call: any[]) => call[1]?.$set?.feeClaimInFlight === false
      );
      expect(releaseCalls.length).toBeGreaterThan(0);
    });
  });

  // ── Withdrawal parse ──
  describe('parseWithdrawalAmount', () => {
    it('should parse 0.5 SOL delta from pre/post balances', async () => {
      const mockConnection = {
        getTransaction: jest.fn().mockResolvedValue({
          meta: {
            preBalances: [1_000_000_000, 200_000_000],
            postBalances: [1_500_000_000, 200_000_000],
          },
          transaction: {
            message: {
              staticAccountKeys: [
                { toBase58: () => TREASURY_POOLS },
                { toBase58: () => 'other' },
              ],
            },
          },
        }),
      };
      mockGetConnection.mockReturnValue(mockConnection);

      const amount = await parseWithdrawalAmount('txsig123', TREASURY_POOLS);
      expect(amount).toBe(500_000_000);
    });

    it('should return 0 for negative delta (fees paid)', async () => {
      const mockConnection = {
        getTransaction: jest.fn().mockResolvedValue({
          meta: {
            preBalances: [1_500_000_000],
            postBalances: [1_400_000_000],
          },
          transaction: {
            message: {
              staticAccountKeys: [{ toBase58: () => TREASURY_POOLS }],
            },
          },
        }),
      };
      mockGetConnection.mockReturnValue(mockConnection);

      const amount = await parseWithdrawalAmount('txsig456', TREASURY_POOLS);
      expect(amount).toBe(0);
    });

    it('should throw when tx not found', async () => {
      const mockConnection = {
        getTransaction: jest.fn().mockResolvedValue(null),
      };
      mockGetConnection.mockReturnValue(mockConnection);

      await expect(parseWithdrawalAmount('notfound', TREASURY_POOLS)).rejects.toThrow(
        'not found'
      );
    });
  });

  // ── Drift reconciliation ──
  describe('reconcilePoolFeeCounters', () => {
    it('should detect pools with >1% drift', async () => {
      const pool1Id = new Types.ObjectId();
      const pool2Id = new Types.ObjectId();

      mockPoolFind.mockResolvedValue([
        { _id: pool1Id, accumulatedFeesLamports: 10_000_000_000 }, // 10 SOL
        { _id: pool2Id, accumulatedFeesLamports: 5_000_000_000 }, // 5 SOL
      ]);

      // Pool 1: 5% drift (drifted)
      // Pool 2: exact match (not drifted)
      mockTreasuryDepositFind
        .mockResolvedValueOnce([
          { amountLamports: 9_500_000_000 }, // 9.5 SOL (5% off from 10 SOL)
        ])
        .mockResolvedValueOnce([
          { amountLamports: 5_000_000_000 }, // 5 SOL (exact match)
        ]);

      const result = await reconcilePoolFeeCounters();

      expect(result.checked).toBe(2);
      expect(result.drifted).toHaveLength(1);
      expect(result.drifted[0].poolId).toBe(pool1Id.toString());
      expect(result.drifted[0].diffLamports).toBe(500_000_000);
      expect(result.drifted[0].diffPct).toBeCloseTo(5, 0);
    });

    it('should return empty drifted array when all pools match', async () => {
      const poolId = new Types.ObjectId();

      mockPoolFind.mockResolvedValue([
        { _id: poolId, accumulatedFeesLamports: 1_000_000_000 },
      ]);

      mockTreasuryDepositFind.mockResolvedValue([
        { amountLamports: 1_000_000_000 },
      ]);

      const result = await reconcilePoolFeeCounters();

      expect(result.checked).toBe(1);
      expect(result.drifted).toHaveLength(0);
    });
  });

  // ── getPendingFees ──
  describe('getPendingFees', () => {
    it('should return claimableLamports > 0 when Bags returns transactions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [{ tx: 'base64tx1' }],
          }),
      });

      const result = await getPendingFees(TOKEN_MINT);
      expect(result.claimableLamports).toBeGreaterThan(0);
      expect(result.lastChecked).toBeInstanceOf(Date);
    });

    it('should return 0 when Bags returns 400', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      });

      const result = await getPendingFees(TOKEN_MINT);
      expect(result.claimableLamports).toBe(0);
    });

    it('should return 0 on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await getPendingFees(TOKEN_MINT);
      expect(result.claimableLamports).toBe(0);
    });
  });
});
