// tests/api/admin/batch-review.test.ts
// Tests for GET /api/admin/mint-requests with batch grouping and filtering (BULK-03)

import { createMocks } from 'node-mocks-http';

// Mock database connection
jest.mock('@/lib/database/mongodb', () => jest.fn().mockResolvedValue(true));

// Mock admin config
jest.mock('@/lib/config/adminConfig', () => ({
  getAdminConfig: () => ({
    adminWallets: ['adminWallet1'],
    superAdminWallets: [],
    isAdmin: (w: string) => w === 'adminWallet1',
  }),
}));

// Mock AdminRole
jest.mock('@/lib/models/AdminRole', () => ({
  findOne: jest.fn().mockResolvedValue(null),
}));

// Sample mint requests with and without batch IDs
const mockRequests = [
  {
    _id: 'req-1',
    title: 'Rolex Submariner',
    brand: 'Rolex',
    model: 'Submariner',
    referenceNumber: 'REF-001',
    priceUSD: 10000,
    wallet: 'vendor1',
    status: 'pending',
    batchId: 'batch-abc',
    batchName: 'JC Gold Batch 1',
    imageUrl: 'https://example.com/img1.png',
    createdAt: new Date('2026-04-01T10:00:00Z'),
  },
  {
    _id: 'req-2',
    title: 'Rolex Daytona',
    brand: 'Rolex',
    model: 'Daytona',
    referenceNumber: 'REF-002',
    priceUSD: 25000,
    wallet: 'vendor1',
    status: 'approved',
    batchId: 'batch-abc',
    batchName: 'JC Gold Batch 1',
    imageUrl: 'https://example.com/img2.png',
    createdAt: new Date('2026-04-01T10:01:00Z'),
  },
  {
    _id: 'req-3',
    title: 'Omega Speedmaster',
    brand: 'Omega',
    model: 'Speedmaster',
    referenceNumber: 'REF-003',
    priceUSD: 5000,
    wallet: 'vendor2',
    status: 'pending',
    batchId: 'batch-xyz',
    batchName: 'Vendor2 Upload',
    imageUrl: 'https://example.com/img3.png',
    createdAt: new Date('2026-04-01T09:00:00Z'),
  },
  {
    _id: 'req-4',
    title: 'TAG Heuer Monaco',
    brand: 'TAG Heuer',
    model: 'Monaco',
    referenceNumber: 'REF-004',
    priceUSD: 3500,
    wallet: 'vendor1',
    status: 'minted',
    // No batchId - legacy single submission
    imageUrl: 'https://example.com/img4.png',
    createdAt: new Date('2026-03-30T12:00:00Z'),
  },
];

// Build a mock chain that supports both groupBy=batch (sort.select.lean) and standard (sort.skip.limit.select.lean) paths
const buildFindChain = (data: any[]) => {
  const leanFn = jest.fn().mockResolvedValue(data);
  const selectFn = jest.fn().mockReturnValue({ lean: leanFn });
  const limitFn = jest.fn().mockReturnValue({ select: selectFn });
  const skipFn = jest.fn().mockReturnValue({ limit: limitFn });
  const sortFn = jest.fn().mockReturnValue({
    skip: skipFn,
    select: selectFn, // groupBy=batch path: sort().select().lean()
  });

  return { sort: sortFn };
};

const mockFind = jest.fn();
const mockCountDocuments = jest.fn().mockResolvedValue(mockRequests.length);

jest.mock('@/lib/models/MintRequest', () => {
  const mockModel = {
    find: (...args: any[]) => mockFind(...args),
    countDocuments: (...args: any[]) => mockCountDocuments(...args),
  };
  return { __esModule: true, default: mockModel };
});

import handler from '@/pages/api/admin/mint-requests/index';

describe('GET /api/admin/mint-requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('groupBy=batch mode', () => {
    it('returns batches grouped by batchId with status summaries', async () => {
      mockFind.mockReturnValue(buildFindChain(mockRequests));

      const { req, res } = createMocks({
        method: 'GET',
        query: { groupBy: 'batch' },
        headers: { 'x-wallet-address': 'adminWallet1' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();

      // Should have batches and ungrouped
      expect(data.batches).toBeDefined();
      expect(data.ungrouped).toBeDefined();

      // Two batches: batch-abc and batch-xyz
      expect(data.batches.length).toBe(2);

      // batch-abc has 2 items (1 pending, 1 approved)
      const batchAbc = data.batches.find((b: any) => b.batchId === 'batch-abc');
      expect(batchAbc).toBeDefined();
      expect(batchAbc.count).toBe(2);
      expect(batchAbc.batchName).toBe('JC Gold Batch 1');
      expect(batchAbc.statuses.pending).toBe(1);
      expect(batchAbc.statuses.approved).toBe(1);
      expect(batchAbc.statuses.rejected).toBe(0);
      expect(batchAbc.statuses.minted).toBe(0);

      // batch-xyz has 1 item
      const batchXyz = data.batches.find((b: any) => b.batchId === 'batch-xyz');
      expect(batchXyz).toBeDefined();
      expect(batchXyz.count).toBe(1);
      expect(batchXyz.statuses.pending).toBe(1);
    });

    it('places items without batchId in ungrouped array', async () => {
      mockFind.mockReturnValue(buildFindChain(mockRequests));

      const { req, res } = createMocks({
        method: 'GET',
        query: { groupBy: 'batch' },
        headers: { 'x-wallet-address': 'adminWallet1' },
      });

      await handler(req as any, res as any);

      const data = res._getJSONData();
      expect(data.ungrouped.length).toBe(1);
      expect(data.ungrouped[0]._id).toBe('req-4');
    });
  });

  describe('batchId filter', () => {
    it('returns only items from the specified batch', async () => {
      const batchItems = mockRequests.filter((r) => r.batchId === 'batch-abc');
      mockFind.mockReturnValue(buildFindChain(batchItems));
      mockCountDocuments.mockResolvedValue(batchItems.length);

      const { req, res } = createMocks({
        method: 'GET',
        query: { batchId: 'batch-abc' },
        headers: { 'x-wallet-address': 'adminWallet1' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.requests).toBeDefined();
      expect(data.requests.length).toBe(2);

      // Verify the filter was called with batchId
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: 'batch-abc' })
      );
    });
  });

  describe('auth', () => {
    it('returns 401 if no wallet header provided', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        query: {},
        headers: {},
      });

      await handler(req as any, res as any);
      expect(res._getStatusCode()).toBe(401);
    });
  });
});
