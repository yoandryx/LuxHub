// src/hooks/useEffectiveWallet.ts
// Unified wallet hook — returns publicKey from whichever source is active:
// Solana wallet adapter (Phantom, Solflare) OR Privy (embedded/linked wallets).
// Use this instead of useWallet() when you need publicKey on any page.
import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';

function isValidSolanaAddress(address: string | undefined): boolean {
  if (!address) return false;
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

export function useEffectiveWallet() {
  const {
    publicKey: walletAdapterPublicKey,
    connected,
    signTransaction,
    signMessage,
  } = useWallet();
  const { authenticated } = usePrivy();
  const { wallets: privySolanaWallets, ready: walletsReady } = useWallets();

  const effectivePublicKey = useMemo(() => {
    // Prefer wallet adapter if connected
    if (walletAdapterPublicKey) return walletAdapterPublicKey;

    // Fall back to Privy wallet
    if (authenticated && walletsReady && privySolanaWallets?.length) {
      const addr = privySolanaWallets[0].address;
      if (isValidSolanaAddress(addr)) {
        return new PublicKey(addr);
      }
    }

    return null;
  }, [walletAdapterPublicKey, authenticated, walletsReady, privySolanaWallets]);

  return {
    publicKey: effectivePublicKey,
    connected: connected || (authenticated && !!effectivePublicKey),
    signTransaction,
    signMessage,
    source: walletAdapterPublicKey ? ('wallet-adapter' as const) : ('privy' as const),
  };
}
