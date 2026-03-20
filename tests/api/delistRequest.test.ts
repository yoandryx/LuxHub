// tests/api/delistRequest.test.ts
// Test that delist-request.ts calls notifyDelistRequestSubmitted after creating request

import { createMocks } from 'node-mocks-http';

const mockNotifyDelistRequestSubmitted = jest.fn().mockResolvedValue([{ notification: {}, emailSent: false }]);

jest.mock('@/lib/services/notificationService', () => ({
  notifyDelistRequestSubmitted: mockNotifyDelistRequestSubmitted,
}));

jest.mock('@/lib/database/mongodb', () => jest.fn().mockResolvedValue(true));

const mockVendor = { _id: 'vendor-123', wallet: 'vendorWallet123' };
const mockAsset = {
  _id: 'asset-456',
  title: 'Patek Philippe Nautilus',
  nftMint: 'mint123',
  vendor: 'vendor-123',
  nftOwnerWallet: 'vendorWallet123',
  status: 'listed',
};

jest.mock('@/lib/models/Vendor', () => ({
  Vendor: {
    findOne: jest.fn().mockResolvedValue(mockVendor),
  },
}));

jest.mock('@/lib/models/Assets', () => ({
  Asset: {
    findOne: jest.fn().mockResolvedValue(mockAsset),
  },
}));

jest.mock('@/lib/models/DelistRequest', () => {
  const mockModule = {
    create: jest.fn().mockResolvedValue({
      _id: 'delist-789',
      status: 'pending',
      reason: 'sold_externally',
      assetId: 'asset-456',
      createdAt: new Date(),
    }),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    }),
  };
  return { __esModule: true, default: mockModule, ...mockModule };
});

import handler from '@/pages/api/vendor/delist-request';

describe('POST /api/vendor/delist-request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_WALLETS = 'adminWallet1,adminWallet2';
    process.env.SUPER_ADMIN_WALLETS = '';
  });

  it('calls notifyDelistRequestSubmitted after creating request', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        wallet: 'vendorWallet123',
        assetId: 'asset-456',
        reason: 'sold_externally',
        reasonDetails: 'Sold at auction',
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mockNotifyDelistRequestSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        adminWallets: expect.any(Array),
        vendorWallet: 'vendorWallet123',
        assetTitle: 'Patek Philippe Nautilus',
      })
    );
  });

  it('passes all admin wallets to notification', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        wallet: 'vendorWallet123',
        assetId: 'asset-456',
        reason: 'sold_externally',
        reasonDetails: 'Sold at auction',
      },
    });

    await handler(req as any, res as any);

    const callArgs = mockNotifyDelistRequestSubmitted.mock.calls[0][0];
    expect(callArgs.adminWallets).toContain('adminWallet1');
    expect(callArgs.adminWallets).toContain('adminWallet2');
  });
});
