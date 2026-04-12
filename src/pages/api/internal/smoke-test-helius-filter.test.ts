// src/pages/api/internal/smoke-test-helius-filter.test.ts
// Phase 11 plan 15 Task 15.5: unit tests for the Helius webhook filter
// smoke test endpoint + helper.

import type { NextApiRequest, NextApiResponse } from 'next';

// ── Mock setup ──

const POOLS_TREASURY = 'PoolsTreasury1111111111111111111111111111111';

jest.mock('@/lib/config/treasuryConfig', () => ({
  getTreasury: (type: string) => {
    if (type === 'pools') return POOLS_TREASURY;
    throw new Error(`unknown treasury ${type}`);
  },
}));

const mockIsAdmin = jest.fn();
jest.mock('@/lib/config/adminConfig', () => ({
  getAdminConfig: () => ({ isAdmin: (...args: any[]) => mockIsAdmin(...args) }),
}));

const mockCaptureException = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureException: (...args: any[]) => mockCaptureException(...args),
}));

jest.mock('@/lib/monitoring/errorHandler', () => ({
  withErrorMonitoring: (handler: any) => handler,
}));

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

// ── Helpers ──

function mockReq(opts: { method?: string; authorization?: string; wallet?: string } = {}): NextApiRequest {
  return {
    method: opts.method || 'GET',
    headers: {
      authorization: opts.authorization || '',
      'x-wallet-address': opts.wallet || '',
    },
    query: {},
  } as unknown as NextApiRequest;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as NextApiResponse;
}

// ── Import after mocks ──

import handler, { runHeliusFilterSmokeTest } from './smoke-test-helius-filter';

describe('smoke-test-helius-filter', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      NODE_ENV: 'production',
      HELIUS_API_KEY: 'fake-api-key',
      HELIUS_WEBHOOK_ID: 'wh-test-1',
      TREASURY_POOLS: POOLS_TREASURY,
      CRON_SECRET: 'cron-secret',
    };
    mockIsAdmin.mockReturnValue(false);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('runHeliusFilterSmokeTest()', () => {
    it('returns ok:true when TREASURY_POOLS is in the account filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webhookID: 'wh-test-1',
          accountAddresses: [POOLS_TREASURY, 'OtherAddr111111111111111111111111111111111'],
        }),
      });

      const result = await runHeliusFilterSmokeTest();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.filter).toContain(POOLS_TREASURY);
        expect(result.poolsTreasury).toBe(POOLS_TREASURY);
      }
    });

    it('returns ok:false when TREASURY_POOLS is MISSING from the filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webhookID: 'wh-test-1',
          accountAddresses: ['OnlyMarketplaceTreasury11111111111111111111'],
        }),
      });

      const result = await runHeliusFilterSmokeTest();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('TREASURY_POOLS');
        expect(result.actionRequired).toContain('Helius dashboard');
      }
    });

    it('returns ok:false when HELIUS_API_KEY is missing', async () => {
      delete process.env.HELIUS_API_KEY;
      const result = await runHeliusFilterSmokeTest();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('HELIUS_API_KEY');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns ok:false when HELIUS_WEBHOOK_ID is missing', async () => {
      delete process.env.HELIUS_WEBHOOK_ID;
      const result = await runHeliusFilterSmokeTest();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('HELIUS_WEBHOOK_ID');
      }
    });

    it('returns ok:false when Helius API returns non-200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
      const result = await runHeliusFilterSmokeTest();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('404');
      }
    });
  });

  describe('handler()', () => {
    it('returns 401 without auth in production', async () => {
      const req = mockReq();
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('allows CRON_SECRET auth and returns 200 on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accountAddresses: [POOLS_TREASURY] }),
      });

      const req = mockReq({ authorization: 'Bearer cron-secret' });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('allows admin wallet auth', async () => {
      mockIsAdmin.mockReturnValue(true);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accountAddresses: [POOLS_TREASURY] }),
      });

      const req = mockReq({ wallet: 'AdminWallet1111111111111111111111111111111' });
      const res = mockRes();
      await handler(req, res);

      expect(mockIsAdmin).toHaveBeenCalledWith('AdminWallet1111111111111111111111111111111');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 503 and emits Sentry error when filter missing TREASURY_POOLS', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accountAddresses: ['OtherOnly111111111111111111111111111111111'] }),
      });

      const req = mockReq({ authorization: 'Bearer cron-secret' });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException.mock.calls[0][1]).toMatchObject({
        level: 'error',
        tags: { category: 'helius_filter_smoke_test' },
      });
    });
  });
});
