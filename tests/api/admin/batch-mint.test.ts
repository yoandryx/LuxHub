// tests/api/admin/batch-mint.test.ts
// Tests for POST /api/admin/mint-requests/batch-mint (BULK-04)

import { createMocks } from 'node-mocks-http';

// Mock database connection
jest.mock('@/lib/database/mongodb', () => jest.fn().mockResolvedValue(true));

// Mock admin config
const mockAdminKeypair = {
  publicKey: { toBase58: () => 'AdminPubkey111111111111111111111111111111' },
  secretKey: new Uint8Array(64),
};

jest.mock('@/lib/config/adminConfig', () => ({
  getAdminConfig: () => ({
    adminWallets: ['adminWallet1'],
    superAdminWallets: ['adminWallet1'],
    isAdmin: (w: string) => w === 'adminWallet1',
    isSuperAdmin: (w: string) => w === 'adminWallet1',
    getAdminKeypair: () => mockAdminKeypair,
  }),
}));

// Mock AdminRole
jest.mock('@/lib/models/AdminRole', () => ({
  findOne: jest.fn().mockResolvedValue(null),
}));

// Mock Solana cluster config
jest.mock('@/lib/solana/clusterConfig', () => ({
  getConnection: () => ({ rpcEndpoint: 'https://api.devnet.solana.com' }),
}));

// Mock UMI and token metadata
jest.mock('@metaplex-foundation/umi-bundle-defaults', () => ({
  createUmi: () => ({
    use: jest.fn().mockReturnThis(),
  }),
}));

jest.mock('@metaplex-foundation/umi', () => ({
  keypairIdentity: jest.fn().mockReturnValue({}),
  generateSigner: () => ({ publicKey: 'MockMintAddress' + Math.random().toString(36).slice(2, 8) }),
  publicKey: jest.fn((s: string) => s),
  percentAmount: jest.fn((n: number) => n),
}));

const mockCreateNft = jest.fn().mockReturnValue({
  sendAndConfirm: jest.fn().mockResolvedValue({}),
});

const mockTransferV1 = jest.fn().mockReturnValue({
  sendAndConfirm: jest.fn().mockResolvedValue({}),
});

jest.mock('@metaplex-foundation/mpl-token-metadata', () => ({
  mplTokenMetadata: () => ({}),
  createNft: (...args: any[]) => mockCreateNft(...args),
  transferV1: (...args: any[]) => mockTransferV1(...args),
  TokenStandard: { NonFungible: 0 },
}));

// Mock storage
jest.mock('@/utils/storage', () => ({
  uploadImage: jest.fn().mockResolvedValue({
    gateway: 'https://gateway.irys.xyz/mockImageTx',
    irysTxId: 'mockImageTx',
    provider: 'irys',
  }),
  uploadMetadata: jest.fn().mockResolvedValue({
    gateway: 'https://gateway.irys.xyz/mockMetadataTx',
    irysTxId: 'mockMetadataTx',
    provider: 'irys',
  }),
  getStorageConfig: () => ({ provider: 'irys' }),
}));

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn().mockReturnValue((fn: () => any) => fn());
});

// Mock MintRequest
const mockApprovedRequests = [
  {
    _id: 'req-1',
    title: 'Rolex Submariner',
    brand: 'Rolex',
    model: 'Submariner',
    referenceNumber: 'REF-001',
    priceUSD: 10000,
    wallet: 'vendorWallet1',
    status: 'approved',
    imageCid: null,
    imageUrl: 'https://example.com/img1.png',
    batchId: 'batch-abc',
  },
  {
    _id: 'req-2',
    title: 'Rolex Daytona',
    brand: 'Rolex',
    model: 'Daytona',
    referenceNumber: 'REF-002',
    priceUSD: 25000,
    wallet: 'vendorWallet1',
    status: 'approved',
    imageCid: 'existingCid123',
    imageUrl: 'https://gateway.irys.xyz/existingCid123',
    batchId: 'batch-abc',
  },
];

const mockMixedRequests = [
  { ...mockApprovedRequests[0] },
  { ...mockApprovedRequests[1], status: 'pending', _id: 'req-pending' },
];

const mockFindByIdAndUpdate = jest.fn().mockResolvedValue({});
const mockFind = jest.fn();

jest.mock('@/lib/models/MintRequest', () => {
  const mockModel = {
    find: (...args: any[]) => mockFind(...args),
    findByIdAndUpdate: (...args: any[]) => mockFindByIdAndUpdate(...args),
  };
  return { __esModule: true, default: mockModel };
});

// Mock Asset
jest.mock('@/lib/models/Assets', () => {
  const mockModel = {
    create: jest.fn().mockResolvedValue({ _id: 'asset-1' }),
  };
  return { __esModule: true, default: mockModel };
});

// Mock fetch for image download
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
  headers: { get: () => 'image/png' },
}) as any;

import handler from '@/pages/api/admin/mint-requests/batch-mint';

describe('POST /api/admin/mint-requests/batch-mint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNft.mockReturnValue({
      sendAndConfirm: jest.fn().mockResolvedValue({}),
    });
    mockTransferV1.mockReturnValue({
      sendAndConfirm: jest.fn().mockResolvedValue({}),
    });
  });

  it('returns 401 if no admin wallet header', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: ['req-1'] },
      headers: {},
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 for non-admin wallets', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: ['req-1'] },
      headers: { 'x-wallet-address': 'randomWallet' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 if any requestId has non-approved status', async () => {
    mockFind.mockResolvedValue(mockMixedRequests);

    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: ['req-1', 'req-pending'] },
      headers: { 'x-wallet-address': 'adminWallet1' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);

    const data = res._getJSONData();
    expect(data.nonApprovedIds).toBeDefined();
    expect(data.nonApprovedIds.length).toBe(1);
    expect(data.nonApprovedIds[0].status).toBe('pending');
  });

  it('processes approved items and returns per-item results', async () => {
    mockFind.mockResolvedValue(mockApprovedRequests);

    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: ['req-1', 'req-2'] },
      headers: { 'x-wallet-address': 'adminWallet1' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);

    const data = res._getJSONData();
    expect(data.results).toBeDefined();
    expect(data.results.length).toBe(2);
    expect(data.summary.minted).toBe(2);
    expect(data.summary.errors).toBe(0);

    // Each result should have a mint address
    for (const result of data.results) {
      expect(result.status).toBe('minted');
      expect(result.mintAddress).toBeDefined();
    }

    // MintRequest should be updated for each
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('handles partial failure - one item errors, others succeed', async () => {
    // Make the second item's createNft fail
    let callCount = 0;
    mockCreateNft.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return {
          sendAndConfirm: jest.fn().mockRejectedValue(new Error('RPC timeout')),
        };
      }
      return {
        sendAndConfirm: jest.fn().mockResolvedValue({}),
      };
    });

    mockFind.mockResolvedValue(mockApprovedRequests);

    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: ['req-1', 'req-2'] },
      headers: { 'x-wallet-address': 'adminWallet1' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);

    const data = res._getJSONData();
    expect(data.results.length).toBe(2);
    expect(data.summary.minted).toBe(1);
    expect(data.summary.errors).toBe(1);

    // First should succeed
    const success = data.results.find((r: any) => r.status === 'minted');
    expect(success).toBeDefined();

    // Second should have error
    const error = data.results.find((r: any) => r.status === 'error');
    expect(error).toBeDefined();
    expect(error.error).toContain('RPC timeout');
  });

  it('keeps status as approved for failed items (retryable)', async () => {
    // Make all items fail
    mockCreateNft.mockReturnValue({
      sendAndConfirm: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    mockFind.mockResolvedValue([mockApprovedRequests[0]]);

    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: ['req-1'] },
      headers: { 'x-wallet-address': 'adminWallet1' },
    });

    await handler(req as any, res as any);

    // Should update adminNotes with error, NOT change status to minted
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({
        adminNotes: expect.stringContaining('Batch mint error'),
      })
    );

    // The status update to 'minted' should NOT have been called for the failed item
    const mintedCalls = mockFindByIdAndUpdate.mock.calls.filter(
      (call: any[]) => call[1]?.status === 'minted'
    );
    expect(mintedCalls.length).toBe(0);
  });

  it('returns 400 if requestIds is empty', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { requestIds: [] },
      headers: { 'x-wallet-address': 'adminWallet1' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 405 for non-POST methods', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: { 'x-wallet-address': 'adminWallet1' },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });
});
