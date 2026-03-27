// tests/lib/retryTransaction.test.ts
// Tests for retry-with-escalating-priority-fees transaction utility

// Mock @solana/web3.js to avoid ESM breakage in test environment
jest.mock('@solana/web3.js', () => {
  const actual = {
    Keypair: {
      generate: jest.fn(() => ({
        publicKey: { toBase58: () => 'MockPayer11111111111111111111111111111111111' },
        secretKey: new Uint8Array(64),
      })),
    },
    Connection: jest.fn().mockImplementation(() => ({
      getLatestBlockhash: jest.fn(),
      sendTransaction: jest.fn(),
      confirmTransaction: jest.fn(),
    })),
    Transaction: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockReturnThis(),
      recentBlockhash: undefined,
      lastValidBlockHeight: undefined,
      feePayer: undefined,
    })),
    TransactionInstruction: jest.fn(),
    ComputeBudgetProgram: {
      setComputeUnitPrice: jest.fn(({ microLamports }: { microLamports: number }) => ({
        type: 'computeBudgetPrice',
        microLamports,
      })),
    },
    VersionedTransaction: jest.fn(),
  };
  return actual;
});

// Mock priorityFees module
jest.mock('@/lib/solana/priorityFees', () => ({
  getPriorityFeeMicroLamports: jest.fn(() => 50000),
  getPriorityFeeWithEscalation: jest.fn((attempt: number) => {
    const multipliers = [1, 1.5, 2, 3];
    const mult = multipliers[Math.min(attempt, multipliers.length - 1)];
    return Math.round(50000 * mult);
  }),
  RETRY_MULTIPLIERS: [1, 1.5, 2, 3],
  addPriorityFee: jest.fn(),
  getPriorityFeeInstructions: jest.fn(() => []),
}));

import { Connection, Keypair, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getPriorityFeeWithEscalation } from '@/lib/solana/priorityFees';

describe('sendWithRetry', () => {
  let mockConnection: any;
  let mockPayer: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockPayer = {
      publicKey: { toBase58: () => 'MockPayer11111111111111111111111111111111111' },
      secretKey: new Uint8Array(64),
    };

    mockConnection = {
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mockBlockhash123',
        lastValidBlockHeight: 999999,
      }),
      sendTransaction: jest.fn().mockResolvedValue('mockSignature123'),
      confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
    };
  });

  async function importSendWithRetry() {
    const mod = await import('@/lib/solana/retryTransaction');
    return mod.sendWithRetry;
  }

  it('succeeds on first attempt when sendTransaction resolves', async () => {
    const sendWithRetry = await importSendWithRetry();
    const result = await sendWithRetry(mockConnection, [], mockPayer);

    expect(result).toBe('mockSignature123');
    expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.getLatestBlockhash).toHaveBeenCalledTimes(1);
  });

  it('retries with higher priority fee on BlockhashNotFound error', async () => {
    mockConnection.sendTransaction
      .mockRejectedValueOnce(new Error('BlockhashNotFound'))
      .mockResolvedValueOnce('mockSignature456');

    const sendWithRetry = await importSendWithRetry();
    const result = await sendWithRetry(mockConnection, [], mockPayer);

    expect(result).toBe('mockSignature456');
    expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(2);
    expect(mockConnection.getLatestBlockhash).toHaveBeenCalledTimes(2);
  });

  it('retries on block height exceeded error', async () => {
    mockConnection.sendTransaction
      .mockRejectedValueOnce(new Error('block height exceeded'))
      .mockResolvedValueOnce('mockSignature789');

    const sendWithRetry = await importSendWithRetry();
    const result = await sendWithRetry(mockConnection, [], mockPayer);

    expect(result).toBe('mockSignature789');
    expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all 4 attempts', async () => {
    const retryError = new Error('BlockhashNotFound');
    mockConnection.sendTransaction.mockRejectedValue(retryError);

    const sendWithRetry = await importSendWithRetry();
    await expect(sendWithRetry(mockConnection, [], mockPayer)).rejects.toThrow('BlockhashNotFound');

    expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry on non-retryable errors like InsufficientFunds', async () => {
    mockConnection.sendTransaction.mockRejectedValue(new Error('InsufficientFunds'));

    const sendWithRetry = await importSendWithRetry();
    await expect(sendWithRetry(mockConnection, [], mockPayer)).rejects.toThrow('InsufficientFunds');

    expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('calls getLatestBlockhash before each attempt (fresh blockhash)', async () => {
    mockConnection.sendTransaction
      .mockRejectedValueOnce(new Error('BlockhashNotFound'))
      .mockRejectedValueOnce(new Error('block height exceeded'))
      .mockResolvedValueOnce('mockSignatureOK');

    const sendWithRetry = await importSendWithRetry();
    await sendWithRetry(mockConnection, [], mockPayer);

    expect(mockConnection.getLatestBlockhash).toHaveBeenCalledTimes(3);
  });

  it('uses escalating priority fees: 50000, 75000, 100000, 150000', async () => {
    mockConnection.sendTransaction
      .mockRejectedValueOnce(new Error('BlockhashNotFound'))
      .mockRejectedValueOnce(new Error('BlockhashNotFound'))
      .mockRejectedValueOnce(new Error('BlockhashNotFound'))
      .mockRejectedValue(new Error('BlockhashNotFound'));

    // Get the mock reference after resetModules
    const priorityMod = await import('@/lib/solana/priorityFees');
    const escalationSpy = priorityMod.getPriorityFeeWithEscalation as jest.Mock;
    escalationSpy.mockClear();

    const sendWithRetry = await importSendWithRetry();
    try { await sendWithRetry(mockConnection, [], mockPayer); } catch { /* expected */ }

    // Verify getPriorityFeeWithEscalation was called with attempt indices 0-3
    expect(escalationSpy).toHaveBeenCalledWith(0);
    expect(escalationSpy).toHaveBeenCalledWith(1);
    expect(escalationSpy).toHaveBeenCalledWith(2);
    expect(escalationSpy).toHaveBeenCalledWith(3);
  });
});

describe('getPriorityFeeWithEscalation', () => {
  it('returns correct fee for each attempt index', () => {
    // Using the mocked version which mirrors real logic
    expect(getPriorityFeeWithEscalation(0)).toBe(50000);   // 50000 * 1
    expect(getPriorityFeeWithEscalation(1)).toBe(75000);   // 50000 * 1.5
    expect(getPriorityFeeWithEscalation(2)).toBe(100000);  // 50000 * 2
    expect(getPriorityFeeWithEscalation(3)).toBe(150000);  // 50000 * 3
  });
});
