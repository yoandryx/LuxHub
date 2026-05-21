// src/hooks/__tests__/useEffectiveWallet.test.ts
// Phase 12 Wave 0 — RED tests. These FAIL until Plan 12-02 refactors useEffectiveWallet
// to remove Privy imports.
import { renderHook } from '@testing-library/react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { useEffectiveWallet } from '../useEffectiveWallet';

// Mock wallet-adapter — controlled by each test
const mockUseWallet = jest.fn();
const mockUseConnection = jest.fn(() => ({ connection: { confirmTransaction: jest.fn() } }));

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => mockUseWallet(),
  useConnection: () => mockUseConnection(),
}));

// DO NOT mock @privy-io/react-auth. After Plan 12-02 the hook must not import it.
// If the hook still imports Privy, the import resolution will fail and these tests
// surface that failure clearly.

describe('useEffectiveWallet (post-Phase-12)', () => {
  beforeEach(() => {
    mockUseWallet.mockReset();
  });

  it('returns null publicKey and connected=false when wallet-adapter is disconnected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
      signTransaction: undefined,
      signAllTransactions: undefined,
      signMessage: undefined,
      sendTransaction: undefined,
    });

    const { result } = renderHook(() => useEffectiveWallet());

    expect(result.current.publicKey).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.source).toBe('wallet-adapter');
  });

  it('returns wallet-adapter publicKey when connected', () => {
    const pk = new PublicKey('11111111111111111111111111111111');
    mockUseWallet.mockReturnValue({
      publicKey: pk,
      connected: true,
      signTransaction: jest.fn(async (tx) => tx),
      signAllTransactions: jest.fn(async (txs) => txs),
      signMessage: jest.fn(async (msg) => msg),
      sendTransaction: jest.fn(async () => 'sig'),
    });

    const { result } = renderHook(() => useEffectiveWallet());

    expect(result.current.publicKey).toBe(pk);
    expect(result.current.connected).toBe(true);
    expect(result.current.source).toBe('wallet-adapter');
  });

  it('returns undefined sign functions when not connected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
      signTransaction: undefined,
      signAllTransactions: undefined,
      signMessage: undefined,
      sendTransaction: undefined,
    });

    const { result } = renderHook(() => useEffectiveWallet());

    expect(result.current.signTransaction).toBeUndefined();
    expect(result.current.signAllTransactions).toBeUndefined();
    expect(result.current.signMessage).toBeUndefined();
    expect(result.current.sendVersionedTransaction).toBeUndefined();
  });

  it('delegates signTransaction to wallet-adapter when publicKey present', async () => {
    const pk = new PublicKey('11111111111111111111111111111111');
    const adapterSign = jest.fn(async (tx) => tx);
    mockUseWallet.mockReturnValue({
      publicKey: pk,
      connected: true,
      signTransaction: adapterSign,
      signAllTransactions: jest.fn(),
      signMessage: jest.fn(),
      sendTransaction: jest.fn(),
    });

    const { result } = renderHook(() => useEffectiveWallet());
    const fakeTx = {} as VersionedTransaction;
    await result.current.signTransaction!(fakeTx);

    expect(adapterSign).toHaveBeenCalledTimes(1);
    expect(adapterSign).toHaveBeenCalledWith(fakeTx);
  });

  it('source is the literal "wallet-adapter" (never "privy")', () => {
    const pk = new PublicKey('11111111111111111111111111111111');
    mockUseWallet.mockReturnValue({
      publicKey: pk,
      connected: true,
      signTransaction: jest.fn(),
      signAllTransactions: jest.fn(),
      signMessage: jest.fn(),
      sendTransaction: jest.fn(),
    });

    const { result } = renderHook(() => useEffectiveWallet());

    // Negative assertion: source can NEVER be 'privy' after Phase 12
    expect(result.current.source).not.toBe('privy');
    expect(result.current.source).toBe('wallet-adapter');
  });
});
