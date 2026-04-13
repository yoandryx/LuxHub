// src/pages/api/webhooks/helius.test.ts
// Phase 11 plan 15 Task 15.4: assert TREASURY_POOLS audit path NEVER
// increments Pool.accumulatedFeesLamports (owned exclusively by the claim
// service — Pitfall 3: double-counting).

import type { NextApiRequest, NextApiResponse } from 'next';

// ── Mock setup (must be before imports) ──

const POOLS_TREASURY = 'PoolsTreasury1111111111111111111111111111111';
const MARKETPLACE_TREASURY = 'MarketplaceTreasury11111111111111111111111111';

const mockTreasuryDepositCreate = jest.fn();
const mockTreasuryDepositFindOne = jest.fn();
jest.mock('@/lib/models/TreasuryDeposit', () => ({
  TreasuryDeposit: {
    create: (...args: any[]) => mockTreasuryDepositCreate(...args),
    findOne: (...args: any[]) => mockTreasuryDepositFindOne(...args),
  },
}));

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

const mockEscrowFindOne = jest.fn();
const mockEscrowFindOneAndUpdate = jest.fn();
const mockEscrowFindByIdAndUpdate = jest.fn();
jest.mock('@/lib/models/Escrow', () => ({
  Escrow: {
    findOne: (...args: any[]) => mockEscrowFindOne(...args),
    findOneAndUpdate: (...args: any[]) => mockEscrowFindOneAndUpdate(...args),
    findByIdAndUpdate: (...args: any[]) => mockEscrowFindByIdAndUpdate(...args),
  },
}));

jest.mock('@/lib/models/Assets', () => ({
  Asset: {
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('@/lib/models/Transaction', () => ({
  Transaction: { create: jest.fn() },
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

jest.mock('@/lib/config/treasuryConfig', () => ({
  getTreasury: (type: string) => {
    if (type === 'pools') return POOLS_TREASURY;
    if (type === 'marketplace') return MARKETPLACE_TREASURY;
    throw new Error(`unknown treasury ${type}`);
  },
}));

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

import handler from '@/pages/api/webhooks/helius';

describe('helius webhook — TREASURY_POOLS audit path', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      NODE_ENV: 'test',
      TREASURY_POOLS: POOLS_TREASURY,
      TREASURY_MARKETPLACE: MARKETPLACE_TREASURY,
    };
    mockTreasuryDepositFindOne.mockResolvedValue(null);
    mockTreasuryDepositCreate.mockResolvedValue({ _id: 'deposit-1' });
    mockPoolFindByIdAndUpdate.mockResolvedValue(null);
    mockPoolFindOneAndUpdate.mockResolvedValue(null);
    mockEscrowFindOne.mockResolvedValue(null);
    mockEscrowFindByIdAndUpdate.mockResolvedValue(null);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('records a TreasuryDeposit with depositType=pool_trading_fee on TREASURY_POOLS arrival', async () => {
    mockPoolFindOne.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ _id: 'pool-abc' }),
    });

    const event = {
      type: 'TRANSFER',
      signature: 'sig-pool-deposit-1',
      timestamp: 1700000000,
      slot: 12345,
      nativeTransfers: [
        {
          fromUserAccount: 'SenderWallet11111111111111111111111111111111',
          toUserAccount: POOLS_TREASURY,
          amount: 50_000_000, // 0.05 SOL
        },
      ],
    };

    const req = mockReq([event]);
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Pool.findOne called with feeClaimTxSignatures filter
    expect(mockPoolFindOne).toHaveBeenCalledWith({
      feeClaimTxSignatures: 'sig-pool-deposit-1',
    });
    // TreasuryDeposit written with depositType=pool_trading_fee
    expect(mockTreasuryDepositCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        depositType: 'pool_trading_fee',
        amountLamports: 50_000_000,
        toWallet: POOLS_TREASURY,
        pool: 'pool-abc',
      })
    );
  });

  it('CRITICAL: does NOT call Pool.findByIdAndUpdate on TREASURY_POOLS deposits (no write to accumulatedFeesLamports)', async () => {
    mockPoolFindOne.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ _id: 'pool-abc' }),
    });

    const event = {
      type: 'TRANSFER',
      signature: 'sig-pool-deposit-2',
      timestamp: 1700000100,
      nativeTransfers: [
        {
          fromUserAccount: 'SenderWallet22222222222222222222222222222222',
          toUserAccount: POOLS_TREASURY,
          amount: 75_000_000,
        },
      ],
    };

    const req = mockReq([event]);
    const res = mockRes();
    await handler(req, res);

    // Pitfall 3: this handler must be read-only on the pool document.
    // The primary counter (accumulatedFeesLamports) is owned exclusively by
    // poolFeeClaimService.claimPoolFees.
    expect(mockPoolFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('records a deposit with pool=undefined when no matching feeClaimTxSignatures row exists', async () => {
    mockPoolFindOne.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue(null),
    });

    const event = {
      type: 'TRANSFER',
      signature: 'sig-unlinked-pool-deposit',
      timestamp: 1700000200,
      nativeTransfers: [
        {
          fromUserAccount: 'SenderWallet33333333333333333333333333333333',
          toUserAccount: POOLS_TREASURY,
          amount: 1_000_000,
        },
      ],
    };

    const req = mockReq([event]);
    const res = mockRes();
    await handler(req, res);

    expect(mockTreasuryDepositCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        depositType: 'pool_trading_fee',
        pool: undefined,
      })
    );
    // Still no pool writes
    expect(mockPoolFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('skips duplicate tx signatures for TREASURY_POOLS (idempotent)', async () => {
    mockTreasuryDepositFindOne.mockResolvedValue({ _id: 'existing-deposit' });

    const event = {
      type: 'TRANSFER',
      signature: 'sig-duplicate',
      timestamp: 1700000300,
      nativeTransfers: [
        {
          fromUserAccount: 'SenderWallet44444444444444444444444444444444',
          toUserAccount: POOLS_TREASURY,
          amount: 1_000_000,
        },
      ],
    };

    const req = mockReq([event]);
    const res = mockRes();
    await handler(req, res);

    expect(mockTreasuryDepositCreate).not.toHaveBeenCalled();
    expect(mockPoolFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});
