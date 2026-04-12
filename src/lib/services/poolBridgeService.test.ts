// src/lib/services/poolBridgeService.test.ts
// Unit tests for the pool bridge service (SOL->USDC swap + exchange)

// Mock environment variables before any imports
process.env.PROGRAM_ID = 'kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj';
process.env.NEXT_PUBLIC_SQUADS_MSIG = '5hy7HgdqM3vCPPtBY8crXqDhy3DttBvzrY3rzWnVRZor';
process.env.NEXT_PUBLIC_SOLANA_ENDPOINT = 'https://api.devnet.solana.com';
process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';
process.env.TREASURY_POOLS = 'FJYnuRUvMM9zuiEDMPyuVBMgGs5UtkAKSouTaMTaoqqZ';
process.env.SQUADS_MEMBER_KEYPAIR_JSON = JSON.stringify([112,24,224,156,136,197,167,236,171,199,35,80,74,113,210,250,151,140,31,254,112,151,204,189,229,254,136,6,181,121,208,75,77,148,247,128,136,158,4,92,112,195,15,129,142,5,221,20,113,17,99,134,43,69,91,59,81,185,148,210,188,37,96,9]);

// We use the real @solana/web3.js PublicKey (needs transformIgnorePatterns for uuid)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PublicKey, TransactionInstruction, TransactionMessage, Keypair } = require('@solana/web3.js');

// ---------------------------------------------------------------------------
// Mocks — must come before the dynamic import of the service
// ---------------------------------------------------------------------------

// Mock mongoose/Pool model
const mockPool = {
  findById: jest.fn(),
};
jest.mock('@/lib/models/Pool', () => ({ Pool: mockPool, __esModule: true }));
jest.mock('@/lib/database/mongodb', () => ({ default: jest.fn().mockResolvedValue(undefined), __esModule: true }));

// Mock solPriceService
jest.mock('@/lib/services/solPriceService', () => ({
  getSolUsdRate: jest.fn().mockResolvedValue(150), // $150/SOL
}));

// Mock squadsConfig
jest.mock('@/lib/config/squadsConfig', () => ({
  getSquadsAutoApprove: jest.fn().mockReturnValue(true),
}));

// Mock retryTransaction
jest.mock('@/lib/solana/retryTransaction', () => ({
  sendWithRetry: jest.fn().mockResolvedValue('mock-tx-signature-abc123'),
}));

// Mock @solana/spl-token to avoid real PDA derivation in tests
jest.mock('@solana/spl-token', () => {
  const { PublicKey: PK } = require('@solana/web3.js');
  const TOKEN_PROGRAM_ID = new PK('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PK('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  // Return deterministic mock ATAs based on args
  let ataCounter = 0;
  return {
    getAssociatedTokenAddressSync: jest.fn().mockImplementation(() => {
      // Generate unique but valid PublicKeys for each ATA call
      const seed = Buffer.alloc(32, 0);
      seed.writeUInt32LE(++ataCounter, 0);
      seed[31] = 1; // Ensure it's different from system program
      return new PK(seed);
    }),
    createAssociatedTokenAccountIdempotentInstruction: jest.fn().mockReturnValue({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [],
      data: Buffer.alloc(0),
    }),
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  };
});

// Mock @sqds/multisig — use require to get PublicKey for mock values
jest.mock('@sqds/multisig', () => {
  const { PublicKey: PK } = require('@solana/web3.js');
  const dummyIx = {
    programId: new PK('11111111111111111111111111111111'),
    keys: [],
    data: Buffer.alloc(0),
  };
  return {
    getVaultPda: jest.fn().mockReturnValue([new PK('FJYnuRUvMM9zuiEDMPyuVBMgGs5UtkAKSouTaMTaoqqZ')]),
    accounts: {
      Multisig: {
        fromAccountAddress: jest.fn().mockResolvedValue({ transactionIndex: 5 }),
      },
    },
    instructions: {
      vaultTransactionCreate: jest.fn().mockReturnValue(dummyIx),
      proposalCreate: jest.fn().mockReturnValue(dummyIx),
      proposalApprove: jest.fn().mockReturnValue(dummyIx),
    },
    getProposalPda: jest.fn().mockReturnValue([new PK('11111111111111111111111111111111')]),
    getTransactionPda: jest.fn().mockReturnValue([new PK('11111111111111111111111111111111')]),
  };
});

// Mock clusterConfig
const mockGetAccountInfo = jest.fn();
jest.mock('@/lib/solana/clusterConfig', () => ({
  getClusterConfig: jest.fn().mockReturnValue({
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    endpoint: 'https://api.devnet.solana.com',
    chain: 'devnet',
  }),
  getConnection: jest.fn().mockReturnValue({
    getAccountInfo: mockGetAccountInfo,
    getLatestBlockhash: jest.fn().mockResolvedValue({
      blockhash: 'mock-blockhash-123',
      lastValidBlockHeight: 1000,
    }),
  }),
}));

// Mock treasuryConfig
jest.mock('@/lib/config/treasuryConfig', () => ({
  getTreasury: jest.fn().mockReturnValue('FJYnuRUvMM9zuiEDMPyuVBMgGs5UtkAKSouTaMTaoqqZ'),
}));

// Mock global fetch for Jupiter API
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock on-chain Escrow account buffer matching the Anchor layout.
 */
function buildMockEscrowBuffer(opts: {
  salePrice: bigint;
  mintA: InstanceType<typeof PublicKey>;
  mintB: InstanceType<typeof PublicKey>;
  buyer?: InstanceType<typeof PublicKey>;
  isCompleted?: boolean;
}): Buffer {
  const DEFAULT_PK = new PublicKey('11111111111111111111111111111111');
  const buf = Buffer.alloc(512); // plenty of space
  let offset = 0;

  // Discriminator (8 bytes)
  offset += 8;
  // seed: u64
  buf.writeBigUInt64LE(42n, offset);
  offset += 8;
  // bump: u8
  buf[offset] = 255;
  offset += 1;
  // initializer: Pubkey (32)
  DEFAULT_PK.toBuffer().copy(buf, offset);
  offset += 32;
  // luxhub_wallet: Pubkey (32)
  DEFAULT_PK.toBuffer().copy(buf, offset);
  offset += 32;
  // mint_a: Pubkey (32)
  opts.mintA.toBuffer().copy(buf, offset);
  offset += 32;
  // mint_b: Pubkey (32)
  opts.mintB.toBuffer().copy(buf, offset);
  offset += 32;
  // initializer_amount: u64
  offset += 8;
  // taker_amount: u64
  offset += 8;
  // file_cid: String (4 bytes length + N bytes)
  buf.writeUInt32LE(4, offset); // length = 4
  offset += 4;
  Buffer.from('test').copy(buf, offset);
  offset += 4;
  // sale_price: u64
  buf.writeBigUInt64LE(opts.salePrice, offset);
  offset += 8;
  // is_completed: bool
  buf[offset] = opts.isCompleted ? 1 : 0;
  offset += 1;
  // buyer: Pubkey
  (opts.buyer || DEFAULT_PK).toBuffer().copy(buf, offset);

  return buf;
}

function mockJupiterResponses(expectedOutAmount: string = '2000000000') {
  mockFetch
    .mockResolvedValueOnce({
      // quote
      ok: true,
      json: async () => ({
        outAmount: expectedOutAmount,
        routePlan: [],
      }),
    })
    .mockResolvedValueOnce({
      // swap-instructions
      ok: true,
      json: async () => ({
        setupInstructions: [],
        swapInstruction: {
          programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
          accounts: [
            { pubkey: 'FJYnuRUvMM9zuiEDMPyuVBMgGs5UtkAKSouTaMTaoqqZ', isSigner: true, isWritable: true },
          ],
          data: Buffer.from([1, 2, 3]).toString('base64'),
        },
        cleanupInstruction: null,
        addressLookupTableAddresses: [],
      }),
    });
}

function makeGraduatedPool(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'pool123',
    tokenStatus: 'graduated',
    backingEscrowPda: 'kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj',
    accumulatedFeesLamports: 15_000_000_000, // 15 SOL
    slippageBufferBps: 200,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('poolBridgeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset BRIDGE_PATTERN
    delete process.env.BRIDGE_PATTERN;
  });

  describe('bridgeToEscrow', () => {
    let bridgeToEscrow: typeof import('./poolBridgeService').bridgeToEscrow;

    beforeAll(async () => {
      const mod = await import('./poolBridgeService');
      bridgeToEscrow = mod.bridgeToEscrow;
    });

    it('should build single proposal for graduated pool (happy path)', async () => {
      mockPool.findById.mockResolvedValue(makeGraduatedPool());

      const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      const NFT_MINT = new PublicKey('So11111111111111111111111111111111111111112');
      mockGetAccountInfo.mockResolvedValue({
        data: buildMockEscrowBuffer({
          salePrice: 2000_000_000n, // $2000 USDC
          mintA: USDC_MINT,
          mintB: NFT_MINT,
        }),
      });

      mockJupiterResponses('2000000000'); // $2000 USDC out

      const result = await bridgeToEscrow({
        poolId: 'pool123',
        adminWallet: 'admin-wallet-abc',
      });

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('single_proposal');
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].kind).toBe('swap_and_exchange');
      expect(result.proposals[0].txSignature).toBe('mock-tx-signature-abc123');
      expect(result.expectedUsdcOut).toBe('2000000000');
    });

    it('should build two proposals when BRIDGE_PATTERN=two_proposal', async () => {
      process.env.BRIDGE_PATTERN = 'two_proposal';

      mockPool.findById.mockResolvedValue(makeGraduatedPool());

      const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      const NFT_MINT = new PublicKey('So11111111111111111111111111111111111111112');
      mockGetAccountInfo.mockResolvedValue({
        data: buildMockEscrowBuffer({
          salePrice: 2000_000_000n,
          mintA: USDC_MINT,
          mintB: NFT_MINT,
        }),
      });

      mockJupiterResponses('2000000000');

      const result = await bridgeToEscrow({
        poolId: 'pool123',
        adminWallet: 'admin-wallet-abc',
      });

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('two_proposal');
      expect(result.proposals).toHaveLength(2);
      expect(result.proposals[0].kind).toBe('swap');
      expect(result.proposals[1].kind).toBe('exchange');
    });

    it('should throw insufficient_fees_for_bridge when pool lacks funds', async () => {
      mockPool.findById.mockResolvedValue(
        makeGraduatedPool({ accumulatedFeesLamports: 1_000_000_000 }) // 1 SOL
      );

      const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      const NFT_MINT = new PublicKey('So11111111111111111111111111111111111111112');
      mockGetAccountInfo.mockResolvedValue({
        data: buildMockEscrowBuffer({
          salePrice: 2000_000_000n, // $2000 — needs ~13.6 SOL at $150
          mintA: USDC_MINT,
          mintB: NFT_MINT,
        }),
      });

      await expect(
        bridgeToEscrow({ poolId: 'pool123', adminWallet: 'admin' })
      ).rejects.toThrow('insufficient_fees_for_bridge');
    });

    it('should throw bridge_requires_graduated_state for non-graduated pool', async () => {
      mockPool.findById.mockResolvedValue(
        makeGraduatedPool({ tokenStatus: 'funding' })
      );

      await expect(
        bridgeToEscrow({ poolId: 'pool123', adminWallet: 'admin' })
      ).rejects.toThrow('bridge_requires_graduated_state');
    });

    it('should throw jupiter_quote_insufficient when quote is too low', async () => {
      mockPool.findById.mockResolvedValue(makeGraduatedPool());

      const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      const NFT_MINT = new PublicKey('So11111111111111111111111111111111111111112');
      mockGetAccountInfo.mockResolvedValue({
        data: buildMockEscrowBuffer({
          salePrice: 2000_000_000n, // $2000
          mintA: USDC_MINT,
          mintB: NFT_MINT,
        }),
      });

      // Jupiter returns only $1500 worth of USDC
      mockJupiterResponses('1500000000');

      await expect(
        bridgeToEscrow({ poolId: 'pool123', adminWallet: 'admin' })
      ).rejects.toThrow('jupiter_quote_insufficient');
    });

    it('should throw no_backing_escrow when pool has no escrow PDA', async () => {
      mockPool.findById.mockResolvedValue(
        makeGraduatedPool({ backingEscrowPda: null })
      );

      await expect(
        bridgeToEscrow({ poolId: 'pool123', adminWallet: 'admin' })
      ).rejects.toThrow('no_backing_escrow');
    });

    it('should throw nothing_to_bridge when no fees accumulated', async () => {
      mockPool.findById.mockResolvedValue(
        makeGraduatedPool({ accumulatedFeesLamports: 0 })
      );

      await expect(
        bridgeToEscrow({ poolId: 'pool123', adminWallet: 'admin' })
      ).rejects.toThrow('nothing_to_bridge');
    });

    it('should throw pool_not_found for invalid poolId', async () => {
      mockPool.findById.mockResolvedValue(null);

      await expect(
        bridgeToEscrow({ poolId: 'nonexistent', adminWallet: 'admin' })
      ).rejects.toThrow('pool_not_found');
    });
  });
});
