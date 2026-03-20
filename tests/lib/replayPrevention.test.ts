// Tests for SEC-04: Replay prevention

// Mock @solana/web3.js to avoid uuid ESM breakage in test environment
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((key: string) => ({
    toBase58: () => key,
    equals: (other: any) => other?.toBase58?.() === key,
  })),
  Connection: jest.fn(),
}));

jest.mock('@/lib/solana/clusterConfig', () => ({
  getConnection: jest.fn(),
  getClusterConfig: jest.fn(() => ({
    endpoint: 'https://test-rpc.example.com',
    chain: 'devnet',
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  })),
}));

jest.mock('@/lib/models/ProcessedTransaction', () => ({
  ProcessedTransaction: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('@/lib/database/mongodb', () => jest.fn());

import { verifyTransactionEnhanced } from '@/lib/services/txVerification';
import { getConnection } from '@/lib/solana/clusterConfig';
import { ProcessedTransaction } from '@/lib/models/ProcessedTransaction';

function buildMockTx() {
  const accountKeys = [
    { pubkey: { toBase58: () => 'BuyerWallet111111111111111111111111111111111', equals: (pk: any) => pk?.toBase58?.() === 'BuyerWallet111111111111111111111111111111111' } },
  ];

  return {
    slot: 12345,
    blockTime: 1700000000,
    meta: {
      err: null,
      fee: 5000,
      preBalances: [1000000000],
      postBalances: [999995000],
      preTokenBalances: [],
      postTokenBalances: [],
    },
    transaction: {
      message: {
        getAccountKeys: () => ({
          length: accountKeys.length,
          get: (i: number) => accountKeys[i]?.pubkey,
          staticAccountKeys: accountKeys.map((k) => k.pubkey),
        }),
        compiledInstructions: [{ programIdIndex: 0 }],
      },
    },
  };
}

describe('replay prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a previously-processed txSignature', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });
    (ProcessedTransaction.findOne as jest.Mock).mockResolvedValue({ txSignature: 'A'.repeat(88) });

    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/already processed|replay/i);
  });

  test('records new txSignature after successful verification', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });
    (ProcessedTransaction.findOne as jest.Mock).mockResolvedValue(null);
    (ProcessedTransaction.create as jest.Mock).mockResolvedValue({});

    const result = await verifyTransactionEnhanced({
      txSignature: 'B'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(true);
    expect(ProcessedTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ txSignature: 'B'.repeat(88) })
    );
  });

  test('handles E11000 duplicate key race condition gracefully', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });
    (ProcessedTransaction.findOne as jest.Mock).mockResolvedValue(null);

    const e11000Error = new Error('E11000 duplicate key error') as any;
    e11000Error.code = 11000;
    (ProcessedTransaction.create as jest.Mock).mockRejectedValue(e11000Error);

    const result = await verifyTransactionEnhanced({
      txSignature: 'C'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/already processed|duplicate|replay/i);
  });
});
