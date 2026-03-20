// Tests for SEC-03: Enhanced transaction verification
// verifyTransactionEnhanced — program, amount, mint, PDA destination checks

// Mock @solana/web3.js to avoid uuid ESM breakage in test environment
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((key: string) => ({
    toBase58: () => key,
    equals: (other: any) => other?.toBase58?.() === key,
  })),
  Connection: jest.fn(),
}));

// All mocks must be declared before any imports
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
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/lib/database/mongodb', () => jest.fn());

import { verifyTransactionEnhanced } from '@/lib/services/txVerification';
import { getConnection } from '@/lib/solana/clusterConfig';
import { ProcessedTransaction } from '@/lib/models/ProcessedTransaction';

// Helper to build a mock transaction
function buildMockTx(overrides: Record<string, any> = {}) {
  const defaultAccountKeys = [
    { pubkey: { toBase58: () => 'BuyerWallet111111111111111111111111111111111', equals: (pk: any) => pk?.toBase58?.() === 'BuyerWallet111111111111111111111111111111111' } },
    { pubkey: { toBase58: () => 'EscrowPDA2222222222222222222222222222222222', equals: (pk: any) => pk?.toBase58?.() === 'EscrowPDA2222222222222222222222222222222222' } },
    { pubkey: { toBase58: () => 'ProgramId3333333333333333333333333333333333', equals: (pk: any) => pk?.toBase58?.() === 'ProgramId3333333333333333333333333333333333' } },
  ];

  const keys = overrides.accountKeys || defaultAccountKeys;

  return {
    slot: 12345,
    blockTime: 1700000000,
    meta: {
      err: null,
      fee: 5000,
      preBalances: [1000000000, 0, 0],
      postBalances: [900000000, 100000000, 0],
      preTokenBalances: [],
      postTokenBalances: [],
      ...(overrides.meta || {}),
    },
    transaction: {
      message: {
        getAccountKeys: () => ({
          length: keys.length,
          get: (i: number) => keys[i]?.pubkey,
          staticAccountKeys: keys.map((k: any) => k.pubkey),
        }),
        compiledInstructions: overrides.compiledInstructions || [
          { programIdIndex: 2 },
        ],
      },
    },
  };
}

describe('verifyTransactionEnhanced', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ProcessedTransaction.findOne as jest.Mock).mockResolvedValue(null);
    (ProcessedTransaction.create as jest.Mock).mockResolvedValue({});
  });

  test('rejects invalid transaction signature (< 32 chars)', async () => {
    const result = await verifyTransactionEnhanced({
      txSignature: 'short',
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  test('rejects when expected wallet is not a signer', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });

    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'WrongWallet9999999999999999999999999999999999',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/wallet|signer/i);
  });

  test('rejects when expected program ID is not invoked', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });

    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      expectedProgramId: 'NotInvokedProgram444444444444444444444444444',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/program.*not invoked|expected program/i);
  });

  test('rejects when transfer amount is outside tolerance', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });

    // The mock tx has walletIndex=0: pre=1000000000, post=900000000, fee=5000
    // actualAmount = 1000000000 - 900000000 - 5000 = 99995000
    // We expect 500000000 which is way outside 1% tolerance
    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      expectedAmountLamports: 500000000,
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/amount mismatch/i);
  });

  test('rejects when escrow PDA destination did not receive funds (SPL path)', async () => {
    const tx = buildMockTx({
      meta: {
        preTokenBalances: [],
        postTokenBalances: [],
      },
    });
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });

    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      expectedDestination: 'EscrowPDA2222222222222222222222222222222222',
      expectedMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/destination.*did not receive/i);
  });

  test('rejects when escrow PDA destination did not receive funds (SOL path)', async () => {
    const tx = buildMockTx({
      meta: {
        preBalances: [1000000000, 0, 0],
        postBalances: [999995000, 0, 0], // escrow index 1 unchanged
      },
    });
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });

    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      expectedDestination: 'EscrowPDA2222222222222222222222222222222222',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/destination.*did not receive/i);
  });

  test('returns verified: true for valid transaction', async () => {
    const tx = buildMockTx();
    (getConnection as jest.Mock).mockReturnValue({
      getTransaction: jest.fn().mockResolvedValue(tx),
    });

    const result = await verifyTransactionEnhanced({
      txSignature: 'A'.repeat(88),
      expectedWallet: 'BuyerWallet111111111111111111111111111111111',
      endpoint: '/api/test',
    });
    expect(result.verified).toBe(true);
    expect(result.slot).toBe(12345);
  });
});
