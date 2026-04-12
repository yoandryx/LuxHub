// src/pages/api/webhooks/bags.test.ts
// Phase 11 plan 15 Task 15.4: assert that
// 1) handleTokenGraduated is a no-op (no Pool state change, no Squad trigger)
// 2) TRADE_EXECUTED only writes to accumulatedFeesLamportsPending (tertiary
//    counter), never to accumulatedFeesLamports (primary/authoritative)

import type { NextApiRequest, NextApiResponse } from 'next';

// ── Mock setup (must be before imports) ──

const mockPoolFindOne = jest.fn();
const mockPoolFindByIdAndUpdate = jest.fn();
const mockPoolFindOneAndUpdate = jest.fn();
jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findOne: (...args: any[]) => mockPoolFindOne(...args),
    findByIdAndUpdate: (...args: any[]) => mockPoolFindByIdAndUpdate(...args),
    findOneAndUpdate: (...args: any[]) => mockPoolFindOneAndUpdate(...args),
  },
}));

const mockTransactionCreate = jest.fn();
jest.mock('@/lib/models/Transaction', () => ({
  Transaction: { create: (...args: any[]) => mockTransactionCreate(...args) },
}));

const mockTreasuryDepositCreate = jest.fn();
const mockTreasuryDepositFindOneAndUpdate = jest.fn();
jest.mock('@/lib/models/TreasuryDeposit', () => ({
  TreasuryDeposit: {
    create: (...args: any[]) => mockTreasuryDepositCreate(...args),
    findOneAndUpdate: (...args: any[]) => mockTreasuryDepositFindOneAndUpdate(...args),
  },
}));

jest.mock('@/lib/models/TreasuryVesting', () => ({
  TreasuryVesting: { findOneAndUpdate: jest.fn() },
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/middleware/rateLimit', () => ({
  webhookLimiter: (handler: any) => handler,
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: any) => handler,
  errorMonitor: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
}));

// Make sure any stray fetch call (e.g. legacy Squad DAO trigger) is
// detectable.
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

// ── Helpers ──

function mockReq(body: any): NextApiRequest {
  return {
    method: 'POST',
    headers: {},
    body,
  } as unknown as NextApiRequest;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as NextApiResponse;
}

// ── Import handler after mocks ──

import handler from './bags';

describe('bags webhook — phase 11 rewire', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, NODE_ENV: 'test' };
    mockPoolFindByIdAndUpdate.mockResolvedValue(null);
    mockPoolFindOneAndUpdate.mockResolvedValue(null);
    mockTransactionCreate.mockResolvedValue({});
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('TOKEN_GRADUATED handler (no-op)', () => {
    it('does not mutate any Pool when TOKEN_GRADUATED arrives', async () => {
      const event = {
        type: 'TOKEN_GRADUATED',
        timestamp: 1700000000,
        tokenMint: 'Mint111111111111111111111111111111111111111',
        graduatedAt: 1700000000,
        marketCap: 85_000,
        priceUSD: 0.0000123,
      };

      const req = mockReq([event]);
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Pitfall 3 / phase 11: Bags DBC graduation is informational only.
      expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
      expect(mockPoolFindByIdAndUpdate).not.toHaveBeenCalled();
      // Must NOT trigger Squad DAO creation
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('TRADE_EXECUTED handler (tertiary pending counter only)', () => {
    it('increments accumulatedFeesLamportsPending and NOT accumulatedFeesLamports', async () => {
      mockPoolFindOne.mockResolvedValue({
        _id: 'pool-xyz',
        bagsTokenMint: 'Mint111111111111111111111111111111111111111',
        lastPriceUSD: 0.000001,
      });

      const event = {
        type: 'TRADE_EXECUTED',
        timestamp: 1700000000,
        signature: 'sig-trade-1',
        tokenMint: 'Mint111111111111111111111111111111111111111',
        tradeType: 'buy',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'Mint111111111111111111111111111111111111111',
        inputAmount: '1000000000',
        outputAmount: '500000',
        priceUSD: 0.0000015,
        traderWallet: 'Trader11111111111111111111111111111111111111',
        partnerFee: '1234567', // exact lamports from Bags payload
      };

      const req = mockReq([event]);
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPoolFindByIdAndUpdate).toHaveBeenCalledTimes(1);

      const [poolId, update] = mockPoolFindByIdAndUpdate.mock.calls[0];
      expect(poolId).toBe('pool-xyz');

      // Must touch the pending counter
      expect(update.$inc).toBeDefined();
      expect(update.$inc).toHaveProperty('accumulatedFeesLamportsPending', 1234567);
      expect(update.$inc).toHaveProperty('totalTrades', 1);
      expect(update.$inc).toHaveProperty('totalVolumeUSD');

      // CRITICAL: must NOT touch the authoritative counter
      expect(update.$inc).not.toHaveProperty('accumulatedFeesLamports');

      // Orphan fields MUST be gone
      expect(update.$inc).not.toHaveProperty('accumulatedHolderFees');
      expect(update.$inc).not.toHaveProperty('accumulatedVendorFees');
      expect(update.$inc).not.toHaveProperty('accumulatedTradeRewards');
      expect(update.$inc).not.toHaveProperty('accumulatedTradingFees');
    });

    it('does nothing when no matching pool exists', async () => {
      mockPoolFindOne.mockResolvedValue(null);

      const event = {
        type: 'TRADE_EXECUTED',
        timestamp: 1700000000,
        signature: 'sig-trade-2',
        tokenMint: 'UnknownMint1111111111111111111111111111111',
        tradeType: 'sell',
        inputMint: 'UnknownMint1111111111111111111111111111111',
        outputMint: 'So11111111111111111111111111111111111111112',
        inputAmount: '1',
        outputAmount: '1',
        traderWallet: 'Trader22222222222222222222222222222222222222',
      };

      const req = mockReq([event]);
      const res = mockRes();
      await handler(req, res);

      expect(mockPoolFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(mockTransactionCreate).not.toHaveBeenCalled();
    });
  });
});
