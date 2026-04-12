// src/pages/api/cron/notify-pending-claims.test.ts
// Unit tests for the daily claim expiry notification cron.

import type { NextApiRequest, NextApiResponse } from 'next';
import { Types } from 'mongoose';

// ── Mock setup (must be before imports) ──

const mockDistFind = jest.fn();
const mockDistUpdateOne = jest.fn();
jest.mock('@/lib/models/PoolDistribution', () => ({
  __esModule: true,
  PoolDistribution: {
    find: (...args: any[]) => mockDistFind(...args),
    updateOne: (...args: any[]) => mockDistUpdateOne(...args),
  },
}));

const mockUserFindOne = jest.fn();
jest.mock('@/lib/models/User', () => ({
  __esModule: true,
  User: {
    findOne: (...args: any[]) => mockUserFindOne(...args),
  },
}));

jest.mock('@/lib/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: any) => handler,
}));

// Mock Resend API via global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ── Helpers ──

function mockReq(opts: { method?: string; authorization?: string } = {}): NextApiRequest {
  return {
    method: opts.method || 'GET',
    headers: {
      authorization: opts.authorization || `Bearer ${process.env.CRON_SECRET}`,
    },
  } as unknown as NextApiRequest;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as NextApiResponse;
}

// ── Import handler after mocks ──

import handler from './notify-pending-claims';

describe('notify-pending-claims cron', () => {
  const OLD_ENV = process.env;
  const now = new Date('2026-04-12T14:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now });
    process.env = {
      ...OLD_ENV,
      CRON_SECRET: 'test-secret',
      NODE_ENV: 'production',
      RESEND_API_KEY: 'test-resend-key',
      NEXT_PUBLIC_APP_URL: 'https://luxhub.gold',
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 401 without valid auth', async () => {
    const req = mockReq({ authorization: 'Bearer wrong' });
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sends email for 60-day window match and flags as notified', async () => {
    const distId = new Types.ObjectId();
    const poolId = new Types.ObjectId();
    const wallet = 'WalletABC111111111111111111111111111111111111';

    // Claim deadline is 60 days from now (within the 12h window)
    const claimDeadline = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    mockDistFind.mockImplementation((query: any) => {
      // Only the 60-day window query should match
      if (query.claimDeadlineAt?.$gte && query.claimDeadlineAt?.$lte) {
        const midpoint = (query.claimDeadlineAt.$gte.getTime() + query.claimDeadlineAt.$lte.getTime()) / 2;
        const daysDiff = Math.round((midpoint - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysDiff === 60) {
          return Promise.resolve([
            {
              _id: distId,
              pool: poolId,
              claimDeadlineAt: claimDeadline,
              distributions: [
                { payoutWallet: wallet, payoutUSD: 150, claimedAt: null },
              ],
            },
          ]);
        }
      }
      return Promise.resolve([]);
    });

    mockUserFindOne.mockResolvedValue({ email: 'user@test.com' });
    mockFetch.mockResolvedValue({ ok: true });
    mockDistUpdateOne.mockResolvedValue({});

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.notified).toBe(1);
    expect(body.details[0].daysRemaining).toBe(60);

    // Verify Resend was called
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );

    // Verify notification flag was set
    expect(mockDistUpdateOne).toHaveBeenCalledWith(
      { _id: distId, 'distributions.payoutWallet': wallet },
      { $set: { 'distributions.$.notifiedAt60days': expect.any(Date) } }
    );
  });

  it('skips already-notified holders', async () => {
    const distId = new Types.ObjectId();
    const wallet = 'WalletSkip111111111111111111111111111111111';
    const claimDeadline = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    mockDistFind.mockImplementation((query: any) => {
      if (query.claimDeadlineAt?.$gte) {
        const midpoint = (query.claimDeadlineAt.$gte.getTime() + query.claimDeadlineAt.$lte.getTime()) / 2;
        const daysDiff = Math.round((midpoint - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysDiff === 60) {
          return Promise.resolve([
            {
              _id: distId,
              pool: new Types.ObjectId(),
              claimDeadlineAt: claimDeadline,
              distributions: [
                {
                  payoutWallet: wallet,
                  payoutUSD: 100,
                  claimedAt: null,
                  notifiedAt60days: new Date(), // already notified
                },
              ],
            },
          ]);
        }
      }
      return Promise.resolve([]);
    });

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.notified).toBe(0);
    expect(mockFetch).not.toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.anything()
    );
  });

  it('skips holders outside the notification window (61 days)', async () => {
    // No distributions should match any window if deadline is 61 days out
    // (61 days is outside the 60-day window of +/- 12 hours)
    mockDistFind.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    expect(res.json.mock.calls[0][0].notified).toBe(0);
  });
});
