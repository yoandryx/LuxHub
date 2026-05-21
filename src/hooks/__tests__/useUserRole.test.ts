// src/hooks/__tests__/useUserRole.test.ts
// Phase 12 Wave 0 — RED tests. These FAIL until Plan 12-02 refactors useUserRole
// to drop the Privy authentication branch.
import { renderHook } from '@testing-library/react';
import { PublicKey } from '@solana/web3.js';
import { useUserRole } from '../useUserRole';

const mockUseWallet = jest.fn();

jest.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => mockUseWallet(),
}));

// Mock SWR — return undefined while loading, then null to indicate no data
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    data: null,
    error: undefined,
    mutate: jest.fn(),
  })),
}));

// DO NOT mock @privy-io/react-auth — after Plan 12-02 the hook does not import it.

describe('useUserRole (post-Phase-12)', () => {
  beforeEach(() => {
    mockUseWallet.mockReset();
  });

  it('returns browser role when wallet-adapter is disconnected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
    });

    const { result } = renderHook(() => useUserRole());

    expect(result.current.role).toBe('browser');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.walletAddress).toBeNull();
    expect(result.current.displayAddress).toBeNull();
  });

  it('returns user role and base58 walletAddress when wallet is connected', () => {
    const pk = new PublicKey('11111111111111111111111111111111');
    mockUseWallet.mockReturnValue({
      publicKey: pk,
      connected: true,
    });

    const { result } = renderHook(() => useUserRole());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.walletAddress).toBe(pk.toBase58());
  });

  it('displayAddress is truncated XXXX...XXXX form when connected', () => {
    const pk = new PublicKey('11111111111111111111111111111111');
    mockUseWallet.mockReturnValue({
      publicKey: pk,
      connected: true,
    });

    const { result } = renderHook(() => useUserRole());

    const addr = pk.toBase58();
    expect(result.current.displayAddress).toBe(`${addr.slice(0, 4)}...${addr.slice(-4)}`);
  });

  it('isConnected is FALSE when wallet-adapter is disconnected (no Privy fallback)', () => {
    // Regression: pre-Phase-12, isConnected was `wallet.connected || (authenticated && !!privyWalletAddress)`.
    // Post-Phase-12, the OR clause is gone — disconnected wallet = disconnected user.
    mockUseWallet.mockReturnValue({ publicKey: null, connected: false });
    const { result } = renderHook(() => useUserRole());
    expect(result.current.isConnected).toBe(false);
  });
});
