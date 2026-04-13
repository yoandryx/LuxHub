// src/pages/api/pools/distribution/[poolId]/claim.test.ts
// Unit tests for the Phase 11-12 holder distribution claim endpoint

// Mock environment
process.env.ADMIN_WALLETS = 'admin-wallet-1';
process.env.NEXT_PUBLIC_SQUADS_MSIG = '5hy7HgdqM3vCPPtBY8crXqDhy3DttBvzrY3rzWnVRZor';

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
const mockDistFindOneAndUpdate = jest.fn();
const mockDistUpdateOne = jest.fn();
const mockDistFindById = jest.fn();
jest.mock('@/lib/models/PoolDistribution', () => ({
  PoolDistribution: {
    findOne: (...args: unknown[]) => mockDistFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockDistFindOneAndUpdate(...args),
    updateOne: (...args: unknown[]) => mockDistUpdateOne(...args),
    findById: (...args: unknown[]) => mockDistFindById(...args),
  },
}));

const mockVerifyBurnTx = jest.fn();
jest.mock('@/lib/solana/verifyBurn', () => ({
  verifyBurnTx: (...args: unknown[]) => mockVerifyBurnTx(...args),
}));

const mockBuildMultiTransferProposal = jest.fn();
jest.mock('@/lib/services/squadsTransferService', () => ({
  buildMultiTransferProposal: (...args: unknown[]) => mockBuildMultiTransferProposal(...args),
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

jest.mock('@/lib/middleware/rateLimit', () => ({
  strictLimiter: (handler: Function) => handler,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/pools/distribution/[poolId]/claim';

function mockReq(
  overrides: Partial<NextApiRequest> & { body?: any; query?: any } = {}
): NextApiRequest {
  return {
    method: 'POST',
    query: { poolId: 'pool-123' },
    body: {
      holderWallet: 'holder-wallet-abc',
      burnTxSignature: 'burn-sig-xyz',
    },
    headers: {},
    ...overrides,
  } as unknown as NextApiRequest;
}

function mockRes(): NextApiResponse & { _status: number; _json: any } {
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

// Default distribution with one unclaimed holder
function makeDistribution(overrides: any = {}) {
  return {
    _id: 'dist-1',
    pool: 'pool-123',
    status: 'pending',
    claimDeadlineAt: new Date(Date.now() + 86400000), // +1 day
    distributions: [
      {
        payoutWallet: 'holder-wallet-abc',
        shares: 1000,
        payoutUSD: 97.0,
        claimedAt: null,
        burnTxSignature: null,
        paidTxSignature: null,
        paidAt: null,
        squadsProposalIndex: null,
      },
      {
        payoutWallet: 'holder-wallet-def',
        shares: 500,
        payoutUSD: 48.5,
        claimedAt: null,
        burnTxSignature: null,
        paidTxSignature: null,
        paidAt: null,
        squadsProposalIndex: null,
      },
    ],
    ...overrides,
  };
}

function makePool(overrides: any = {}) {
  return {
    _id: 'pool-123',
    bagsTokenMint: 'mint-abc123',
    tokenStatus: 'resold',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/pools/distribution/[poolId]/claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransitionPoolState.mockResolvedValue({ success: true, newState: 'distributed' });
    mockBuildMultiTransferProposal.mockResolvedValue({
      success: true,
      transactionIndex: '42',
      signature: 'payout-sig-123',
      squadsDeepLink: 'https://v4.squads.so/squads/5hy7.../tx/42',
    });
    mockVerifyBurnTx.mockResolvedValue({ valid: true, burnedAmount: 1000 });
    mockDistUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  // ------ Input validation ------

  test('rejects non-POST methods', async () => {
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  test('returns 400 for missing holderWallet', async () => {
    const req = mockReq({ body: { burnTxSignature: 'sig' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('missing_params');
  });

  test('returns 400 for missing burnTxSignature', async () => {
    const req = mockReq({ body: { holderWallet: 'wallet' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('missing_params');
  });

  // ------ Distribution lookup ------

  test('returns 404 when no active distribution exists', async () => {
    mockDistFindOne.mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._json.error).toBe('no_distribution');
  });

  test('returns 400 when claim deadline has passed', async () => {
    const dist = makeDistribution({
      claimDeadlineAt: new Date(Date.now() - 86400000), // yesterday
    });
    mockDistFindOne.mockResolvedValue(dist);
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('claim_expired');
  });

  test('returns 404 when holder not in snapshot', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    const req = mockReq({ body: { holderWallet: 'unknown-wallet', burnTxSignature: 'sig' } });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._json.error).toBe('holder_not_in_snapshot');
  });

  test('returns 400 when holder already claimed', async () => {
    const dist = makeDistribution();
    dist.distributions[0].claimedAt = new Date();
    mockDistFindOne.mockResolvedValue(dist);
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('already_claimed');
  });

  // ------ Pool lookup ------

  test('returns 404 when pool not found', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._json.error).toBe('pool_not_found');
  });

  test('returns 400 when pool has no token mint', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(makePool({ bagsTokenMint: null }));
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('no_token_mint');
  });

  // ------ Burn verification ------

  test('returns 400 when burn tx not found on-chain', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(makePool());
    mockVerifyBurnTx.mockResolvedValue({ valid: false, reason: 'tx_not_found' });
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('burn_verification_failed');
    expect(res._json.detail).toBe('tx_not_found');
  });

  test('returns 400 when burn tx for wrong mint', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(makePool());
    mockVerifyBurnTx.mockResolvedValue({ valid: false, reason: 'no_matching_burn_ix' });
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('burn_verification_failed');
  });

  test('returns 400 when burn tx amount too low', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(makePool());
    mockVerifyBurnTx.mockResolvedValue({ valid: false, reason: 'no_matching_burn_ix' });
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toBe('burn_verification_failed');
  });

  // ------ Race condition ------

  test('returns 409 when compare-and-set fails (race)', async () => {
    const dist = makeDistribution();
    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(makePool());
    mockVerifyBurnTx.mockResolvedValue({ valid: true, burnedAmount: 1000 });
    mockDistFindOneAndUpdate.mockResolvedValue(null); // CAS failed
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(409);
    expect(res._json.error).toBe('race_condition_or_already_claimed');
  });

  // ------ Happy path ------

  test('happy path: verifies burn, creates proposal, returns success', async () => {
    const dist = makeDistribution();
    const pool = makePool();

    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(pool);
    mockVerifyBurnTx.mockResolvedValue({ valid: true, burnedAmount: 1000 });

    // CAS succeeds: return updated dist with one claimed entry
    const updatedDist = makeDistribution();
    updatedDist.distributions[0].claimedAt = new Date();
    updatedDist.distributions[0].burnTxSignature = 'burn-sig-xyz';
    mockDistFindOneAndUpdate.mockResolvedValue(updatedDist);
    mockDistFindById.mockResolvedValue(updatedDist);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.payoutUSD).toBe(97.0);
    expect(res._json.burnTxSignature).toBe('burn-sig-xyz');
    expect(res._json.proposalIndex).toBe('42');
    expect(res._json.proposalDeepLink).toContain('squads.so');

    // Verify burn was called with correct params
    expect(mockVerifyBurnTx).toHaveBeenCalledWith({
      txSignature: 'burn-sig-xyz',
      expectedMint: 'mint-abc123',
      expectedOwner: 'holder-wallet-abc',
      expectedMinAmount: 1000,
    });

    // Verify Squads proposal was created
    expect(mockBuildMultiTransferProposal).toHaveBeenCalledWith(
      [
        {
          wallet: 'holder-wallet-abc',
          amountUSD: 97.0,
          label: 'Pool distribution claim for pool pool-123',
        },
      ],
      { autoApprove: true }
    );

    // Verify state transition to partial_distributed (only 1 of 2 claimed)
    expect(mockDistUpdateOne).toHaveBeenCalled();
    expect(mockTransitionPoolState).toHaveBeenCalledWith({
      poolId: 'pool-123',
      fromState: 'resold',
      toState: 'partial_distributed',
      reason: 'first claim received',
    });
  });

  // ------ All-claimed state transition ------

  test('transitions to distributed when all holders have claimed', async () => {
    const dist = makeDistribution();
    const pool = makePool();

    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(pool);
    mockVerifyBurnTx.mockResolvedValue({ valid: true, burnedAmount: 1000 });

    // CAS succeeds
    const updatedDist = makeDistribution();
    updatedDist.distributions[0].claimedAt = new Date();
    updatedDist.distributions[1].claimedAt = new Date(); // both claimed
    mockDistFindOneAndUpdate.mockResolvedValue(updatedDist);
    mockDistFindById.mockResolvedValue(updatedDist);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);

    // Verify transition to distributed (not partial_distributed)
    expect(mockTransitionPoolState).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: 'pool-123',
        fromState: 'resold',
        toState: 'distributed',
        reason: 'all holders claimed',
      })
    );
  });

  // ------ Squads proposal failure (burn still recorded) ------

  test('returns success with proposal error when Squads fails (burn is irreversible)', async () => {
    const dist = makeDistribution();
    const pool = makePool();

    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(pool);
    mockVerifyBurnTx.mockResolvedValue({ valid: true, burnedAmount: 1000 });

    const updatedDist = makeDistribution();
    updatedDist.distributions[0].claimedAt = new Date();
    mockDistFindOneAndUpdate.mockResolvedValue(updatedDist);

    mockBuildMultiTransferProposal.mockRejectedValue(new Error('Squads RPC timeout'));

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.proposalError).toBe('Squads RPC timeout');
    expect(res._json.burnTxSignature).toBe('burn-sig-xyz');
  });

  // ------ Case-insensitive wallet match ------

  test('matches wallet case-insensitively', async () => {
    const dist = makeDistribution();
    dist.distributions[0].payoutWallet = 'Holder-Wallet-ABC';
    const pool = makePool();

    mockDistFindOne.mockResolvedValue(dist);
    mockPoolFindById.mockResolvedValue(pool);
    mockVerifyBurnTx.mockResolvedValue({ valid: true, burnedAmount: 1000 });

    const updatedDist = makeDistribution();
    updatedDist.distributions[0].claimedAt = new Date();
    mockDistFindOneAndUpdate.mockResolvedValue(updatedDist);
    mockDistFindById.mockResolvedValue(updatedDist);

    const req = mockReq({ body: { holderWallet: 'holder-wallet-abc', burnTxSignature: 'burn-sig-xyz' } });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
  });
});
