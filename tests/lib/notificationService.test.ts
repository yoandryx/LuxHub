// tests/lib/notificationService.test.ts
// Tests for notification service: new types dispute_created, delist_request_submitted

// Mock mongoose models before importing the service
jest.mock('@/lib/models/Notification', () => ({
  Notification: {
    create: jest.fn().mockResolvedValue({
      _id: 'notif-123',
      emailSent: false,
      save: jest.fn().mockResolvedValue(true),
    }),
  },
}));

jest.mock('@/lib/models/User', () => ({
  User: {
    findOne: jest.fn().mockResolvedValue({
      _id: 'user-123',
      wallet: 'adminWallet123',
      notificationPrefs: {},
    }),
  },
}));

jest.mock('@/lib/database/mongodb', () => jest.fn());

// Mock fetch (for Resend email API)
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  text: jest.fn().mockResolvedValue('{}'),
}) as jest.Mock;

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://luxhub.gold';
  });

  describe('notifyDisputeCreated', () => {
    it('creates notification with type dispute_created', async () => {
      const { notifyDisputeCreated } = await import('@/lib/services/notificationService');
      const { Notification } = await import('@/lib/models/Notification');

      const result = await notifyDisputeCreated({
        adminWallets: ['admin1'],
        buyerWallet: 'buyerWallet123',
        escrowId: 'escrow-1',
        escrowPda: 'escrowPda123',
        assetTitle: 'Rolex Submariner',
        reason: 'not_received',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dispute_created',
        })
      );
    });
  });

  describe('notifyDelistRequestSubmitted', () => {
    it('creates notification with type delist_request_submitted', async () => {
      const { notifyDelistRequestSubmitted } = await import('@/lib/services/notificationService');
      const { Notification } = await import('@/lib/models/Notification');

      const result = await notifyDelistRequestSubmitted({
        adminWallets: ['admin1'],
        vendorWallet: 'vendorWallet123',
        assetId: 'asset-1',
        assetTitle: 'Patek Philippe',
        reason: 'sold_externally',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delist_request_submitted',
        })
      );
    });
  });

  describe('emailTemplates', () => {
    it('has dispute_created email template (notifyUser accepts type without error)', async () => {
      const service = await import('@/lib/services/notificationService');
      const { Notification } = await import('@/lib/models/Notification');

      await service.notifyUser({
        userWallet: 'test-wallet',
        type: 'dispute_created',
        title: 'Test',
        message: 'Test message',
      });

      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'dispute_created' })
      );
    });

    it('has delist_request_submitted email template (notifyUser accepts type without error)', async () => {
      const service = await import('@/lib/services/notificationService');
      const { Notification } = await import('@/lib/models/Notification');

      await service.notifyUser({
        userWallet: 'test-wallet',
        type: 'delist_request_submitted',
        title: 'Test',
        message: 'Test message',
      });

      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'delist_request_submitted' })
      );
    });
  });

  describe('categoryMap', () => {
    it('dispute_created notifications work end-to-end', async () => {
      const { notifyDisputeCreated } = await import('@/lib/services/notificationService');

      const result = await notifyDisputeCreated({
        adminWallets: ['admin1'],
        buyerWallet: 'buyer1',
        escrowId: 'esc-1',
        escrowPda: 'pda-1',
        assetTitle: 'Test Watch',
        reason: 'damaged',
      });

      expect(result).toHaveLength(1);
    });
  });
});
