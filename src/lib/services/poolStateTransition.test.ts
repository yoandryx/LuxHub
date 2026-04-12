// ---------------------------------------------------------------------------
// Mocks (must be defined before imports due to jest.mock hoisting)
// ---------------------------------------------------------------------------

// Mock @solana/web3.js to avoid ESM/uuid issues in test
jest.mock('@solana/web3.js', () => {
  class MockPublicKey {
    _key: string;
    constructor(key: string) { this._key = key; }
    toBase58() { return this._key; }
  }
  class MockKeypair {
    publicKey: MockPublicKey;
    constructor() { this.publicKey = new MockPublicKey('mock-pubkey'); }
    static fromSecretKey() { return new MockKeypair(); }
  }
  class MockTransactionInstruction {
    keys: any[];
    programId: any;
    data: Buffer;
    constructor(opts: any) {
      this.keys = opts.keys;
      this.programId = opts.programId;
      this.data = opts.data;
    }
  }
  return {
    PublicKey: MockPublicKey,
    Keypair: MockKeypair,
    TransactionInstruction: MockTransactionInstruction,
  };
});

// Mock Pool model
const mockFindById = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateOne = jest.fn();

jest.mock('@/lib/models/Pool', () => ({
  Pool: {
    findById: (...args: any[]) => ({ lean: () => mockFindById(...args) }),
    findOneAndUpdate: (...args: any[]) => mockFindOneAndUpdate(...args),
    updateOne: (...args: any[]) => mockUpdateOne(...args),
  },
}));

// Mock sendWithRetry
const mockSendWithRetry = jest.fn();
jest.mock('@/lib/solana/retryTransaction', () => ({
  sendWithRetry: (...args: any[]) => mockSendWithRetry(...args),
}));

// Mock getConnection
jest.mock('@/lib/solana/clusterConfig', () => ({
  getConnection: jest.fn(() => ({})),
}));

// Mock errorMonitor
const mockCaptureException = jest.fn();
jest.mock('@/lib/monitoring/errorHandler', () => ({
  errorMonitor: {
    captureException: (...args: any[]) => mockCaptureException(...args),
  },
}));

import {
  transitionPoolState,
  VALID_TRANSITIONS,
  type TokenStatus,
  type TransitionParams,
} from './poolStateTransition';

// Mock loadMemoSigner (via env var)
process.env.SQUADS_MEMBER_KEYPAIR_JSON = JSON.stringify(
  Array.from({ length: 64 }, (_, i) => i)
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePool(tokenStatus: TokenStatus) {
  return { _id: 'pool-123', tokenStatus };
}

function baseParams(overrides?: Partial<TransitionParams>): TransitionParams {
  return {
    poolId: 'pool-123',
    fromState: 'funding',
    toState: 'graduated',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('VALID_TRANSITIONS table', () => {
  it('has 11 states', () => {
    expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(11);
  });

  it('distributed is terminal (no outgoing transitions)', () => {
    expect(VALID_TRANSITIONS.distributed).toEqual([]);
  });

  it('aborted is terminal (no outgoing transitions)', () => {
    expect(VALID_TRANSITIONS.aborted).toEqual([]);
  });

  it('every state except terminals can reach aborted', () => {
    const nonTerminal: TokenStatus[] = [
      'pending', 'minted', 'funding', 'graduated',
      'custody', 'resale_listed', 'resale_unlisted',
    ];
    for (const state of nonTerminal) {
      expect(VALID_TRANSITIONS[state]).toContain('aborted');
    }
  });
});

describe('transitionPoolState', () => {
  it('valid transition (funding -> graduated) succeeds with memo', async () => {
    mockFindById.mockResolvedValue(makePool('funding'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('graduated'));
    mockSendWithRetry.mockResolvedValue('memo-sig-abc');
    mockUpdateOne.mockResolvedValue({});

    const result = await transitionPoolState(baseParams());

    expect(result.success).toBe(true);
    expect(result.newState).toBe('graduated');
    expect(result.memoTxSignature).toBe('memo-sig-abc');

    // Verify memo was pushed to lifecycleMemos
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'pool-123' },
      expect.objectContaining({
        $push: {
          lifecycleMemos: expect.objectContaining({
            fromState: 'funding',
            toState: 'graduated',
            txSignature: 'memo-sig-abc',
          }),
        },
      })
    );
  });

  it('invalid transition (funding -> resale_listed) returns error', async () => {
    mockFindById.mockResolvedValue(makePool('funding'));

    const result = await transitionPoolState(
      baseParams({ toState: 'resale_listed' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_transition');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('stale fromState returns invalid_from_state', async () => {
    // Pool is actually in 'graduated' but caller expects 'funding'
    mockFindById.mockResolvedValue(makePool('graduated'));

    const result = await transitionPoolState(baseParams());

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_from_state');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('race condition (findOneAndUpdate returns null) returns error', async () => {
    mockFindById.mockResolvedValue(makePool('funding'));
    mockFindOneAndUpdate.mockResolvedValue(null);

    const result = await transitionPoolState(baseParams());

    expect(result.success).toBe(false);
    expect(result.error).toBe('race_condition');
  });

  it('memo tx failure still returns success (transition committed)', async () => {
    mockFindById.mockResolvedValue(makePool('funding'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('graduated'));
    mockSendWithRetry.mockRejectedValue(new Error('Solana tx failed'));

    const result = await transitionPoolState(baseParams());

    expect(result.success).toBe(true);
    expect(result.newState).toBe('graduated');
    expect(result.memoTxSignature).toBeUndefined();

    // Sentry was called
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          poolId: 'pool-123',
          context: 'poolStateTransition_memo_failed',
        }),
      })
    );
  });

  it('skipMemo: true skips memo and does not push signature', async () => {
    mockFindById.mockResolvedValue(makePool('funding'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('graduated'));

    const result = await transitionPoolState(
      baseParams({ skipMemo: true })
    );

    expect(result.success).toBe(true);
    expect(result.newState).toBe('graduated');
    expect(result.memoTxSignature).toBeUndefined();

    // No memo sent, no lifecycleMemos update
    expect(mockSendWithRetry).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('terminal state (distributed) rejects any outgoing transition', async () => {
    const result = await transitionPoolState(
      baseParams({ fromState: 'distributed', toState: 'aborted' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_transition');
  });

  it('terminal state (aborted) rejects any outgoing transition', async () => {
    const result = await transitionPoolState(
      baseParams({ fromState: 'aborted', toState: 'pending' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_transition');
  });

  it('pool not found returns error', async () => {
    mockFindById.mockResolvedValue(null);

    const result = await transitionPoolState(baseParams());

    expect(result.success).toBe(false);
    expect(result.error).toBe('pool_not_found');
  });

  it('resold -> distributed is valid', async () => {
    mockFindById.mockResolvedValue(makePool('resold'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('distributed'));
    mockSendWithRetry.mockResolvedValue('memo-dist');
    mockUpdateOne.mockResolvedValue({});

    const result = await transitionPoolState(
      baseParams({ fromState: 'resold', toState: 'distributed' })
    );

    expect(result.success).toBe(true);
    expect(result.newState).toBe('distributed');
  });

  it('resold -> partial_distributed is valid', async () => {
    mockFindById.mockResolvedValue(makePool('resold'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('partial_distributed'));
    mockSendWithRetry.mockResolvedValue('memo-partial');
    mockUpdateOne.mockResolvedValue({});

    const result = await transitionPoolState(
      baseParams({ fromState: 'resold', toState: 'partial_distributed' })
    );

    expect(result.success).toBe(true);
    expect(result.newState).toBe('partial_distributed');
  });

  it('partial_distributed -> distributed is valid', async () => {
    mockFindById.mockResolvedValue(makePool('partial_distributed'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('distributed'));
    mockSendWithRetry.mockResolvedValue('memo-final');
    mockUpdateOne.mockResolvedValue({});

    const result = await transitionPoolState(
      baseParams({ fromState: 'partial_distributed', toState: 'distributed' })
    );

    expect(result.success).toBe(true);
    expect(result.newState).toBe('distributed');
  });

  it('includes reason and txContext in memo when provided', async () => {
    mockFindById.mockResolvedValue(makePool('funding'));
    mockFindOneAndUpdate.mockResolvedValue(makePool('graduated'));
    mockSendWithRetry.mockResolvedValue('memo-with-reason');
    mockUpdateOne.mockResolvedValue({});

    await transitionPoolState(
      baseParams({
        reason: 'Fee target reached',
        txContext: 'tx-sig-123',
      })
    );

    // Verify the memo instruction data contains reason and txContext
    expect(mockSendWithRetry).toHaveBeenCalledTimes(1);
    const ixArgs = mockSendWithRetry.mock.calls[0][1]; // instructions array
    const memoIx = ixArgs[0];
    const memoData = JSON.parse(memoIx.data.toString('utf-8'));
    expect(memoData.reason).toBe('Fee target reached');
    expect(memoData.txContext).toBe('tx-sig-123');
  });
});
