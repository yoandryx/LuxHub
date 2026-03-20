// tests/api/dispute.test.ts
// Test that dispute.ts calls notifyDisputeCreated (not notifyUser with shipment_submitted)

import { createMocks } from 'node-mocks-http';

// Track notification calls
const mockNotifyDisputeCreated = jest.fn().mockResolvedValue([{ notification: {}, emailSent: false }]);
const mockNotifyUser = jest.fn().mockResolvedValue({ notification: {}, emailSent: false });

jest.mock('@/lib/services/notificationService', () => ({
  notifyDisputeCreated: mockNotifyDisputeCreated,
  notifyUser: mockNotifyUser,
}));

jest.mock('@/lib/database/mongodb', () => jest.fn().mockResolvedValue(true));

const mockEscrow = {
  _id: 'escrow-123',
  escrowPda: 'escrowPda456',
  buyerWallet: 'buyerWallet789',
  sellerWallet: 'sellerWallet012',
  status: 'funded',
  assetTitle: 'Rolex Submariner',
  dispute: null as any,
};

jest.mock('@/lib/models/Escrow', () => ({
  Escrow: {
    findOne: jest.fn().mockResolvedValue(mockEscrow),
    findById: jest.fn().mockResolvedValue(mockEscrow),
    findByIdAndUpdate: jest.fn().mockResolvedValue(mockEscrow),
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    }),
  },
}));

jest.mock('@/lib/config/adminConfig', () => ({
  getAdminConfig: () => ({
    adminWallets: ['adminWallet1', 'adminWallet2'],
    superAdminWallets: [],
    isAdmin: (w: string) => w === 'adminWallet1',
  }),
}));

import handler from '@/pages/api/escrow/dispute';

describe('POST /api/escrow/dispute (create)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEscrow.dispute = null;
    mockEscrow.status = 'funded';
  });

  it('calls notifyDisputeCreated not notifyUser with shipment_submitted', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        escrowPda: 'escrowPda456',
        buyerWallet: 'buyerWallet789',
        reason: 'not_received',
        description: 'Item never arrived',
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    // Should call notifyDisputeCreated
    expect(mockNotifyDisputeCreated).toHaveBeenCalled();
    // Should NOT call notifyUser directly with shipment_submitted type
    const notifyUserCalls = mockNotifyUser.mock.calls;
    const shipmentSubmittedCalls = notifyUserCalls.filter(
      (call: any) => call[0]?.type === 'shipment_submitted'
    );
    expect(shipmentSubmittedCalls).toHaveLength(0);
  });

  it('passes admin wallets and buyer wallet to notification', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        escrowPda: 'escrowPda456',
        buyerWallet: 'buyerWallet789',
        reason: 'not_received',
        description: 'Item never arrived',
      },
    });

    await handler(req as any, res as any);

    expect(mockNotifyDisputeCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        adminWallets: expect.any(Array),
        buyerWallet: 'buyerWallet789',
      })
    );
  });
});
