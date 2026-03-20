// tests/api/submitShipment.test.ts
// Test that submit-shipment.ts calls notifyShipmentProofSubmitted to admin wallets

import { createMocks } from 'node-mocks-http';

const mockNotifyOrderShipped = jest.fn().mockResolvedValue({ notification: {}, emailSent: false });
const mockNotifyShipmentProofSubmitted = jest.fn().mockResolvedValue([{ notification: {}, emailSent: false }]);

jest.mock('@/lib/services/notificationService', () => ({
  notifyOrderShipped: mockNotifyOrderShipped,
  notifyShipmentProofSubmitted: mockNotifyShipmentProofSubmitted,
}));

jest.mock('@/lib/database/mongodb', () => jest.fn().mockResolvedValue(true));

const mockEscrow = {
  _id: 'escrow-123',
  escrowPda: 'escrowPda456',
  buyerWallet: 'buyerWallet789',
  sellerWallet: 'vendorWallet012',
  seller: 'vendor-obj-id',
  buyer: 'buyer-obj-id',
  status: 'funded',
  asset: 'asset-123',
  assetTitle: 'Rolex GMT-Master',
  deleted: false,
};

jest.mock('@/lib/models/Escrow', () => ({
  Escrow: {
    findOne: jest.fn().mockResolvedValue(mockEscrow),
    findByIdAndUpdate: jest.fn().mockResolvedValue({
      ...mockEscrow,
      _id: 'escrow-123',
      status: 'shipped',
      shipmentStatus: 'proof_submitted',
      trackingCarrier: 'fedex',
      trackingNumber: 'FX123456',
      shipmentProofUrls: ['https://ipfs.io/proof1.jpg'],
      shipmentSubmittedAt: new Date(),
      escrowPda: 'escrowPda456',
    }),
  },
}));

jest.mock('@/lib/models/User', () => ({
  User: {
    findOne: jest.fn().mockResolvedValue({ _id: 'user-vendor', wallet: 'vendorWallet012' }),
  },
}));

jest.mock('@/lib/models/Vendor', () => ({
  Vendor: {
    findOne: jest.fn().mockResolvedValue({ _id: 'vendor-obj-id' }),
  },
}));

jest.mock('@/lib/models/Assets', () => ({
  Asset: {
    findById: jest.fn().mockResolvedValue({ title: 'Rolex GMT-Master', model: 'GMT-Master II' }),
  },
}));

import handler from '@/pages/api/escrow/submit-shipment';

describe('POST /api/escrow/submit-shipment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_WALLETS = 'adminWallet1';
    process.env.SUPER_ADMIN_WALLETS = 'superAdmin1';
  });

  it('calls notifyShipmentProofSubmitted to admin wallets', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        escrowPda: 'escrowPda456',
        vendorWallet: 'vendorWallet012',
        trackingCarrier: 'FedEx',
        trackingNumber: 'FX123456',
        shipmentProofUrls: ['https://ipfs.io/proof1.jpg'],
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockNotifyShipmentProofSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        adminWallets: expect.any(Array),
        vendorWallet: 'vendorWallet012',
        escrowId: expect.any(String),
      })
    );
  });

  it('still calls notifyOrderShipped to buyer', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        escrowPda: 'escrowPda456',
        vendorWallet: 'vendorWallet012',
        trackingCarrier: 'FedEx',
        trackingNumber: 'FX123456',
        shipmentProofUrls: ['https://ipfs.io/proof1.jpg'],
      },
    });

    await handler(req as any, res as any);

    expect(mockNotifyOrderShipped).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerWallet: 'buyerWallet789',
      })
    );
  });
});
