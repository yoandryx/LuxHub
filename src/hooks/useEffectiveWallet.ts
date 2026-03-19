// src/hooks/useEffectiveWallet.ts
// Unified wallet hook — returns publicKey from whichever source is active:
// Solana wallet adapter (Phantom, Solflare) OR Privy (embedded/linked wallets).
// Use this instead of useWallet() when you need publicKey on any page.
import { useMemo, useCallback } from 'react';
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
    signTransaction: walletAdapterSignTransaction,
    signMessage: walletAdapterSignMessage,
  } = useWallet();
  const { authenticated } = usePrivy();
  const { wallets: privySolanaWallets, ready: walletsReady } = useWallets();

  const privyWallet = privySolanaWallets?.[0] ?? null;
  const usingPrivy = !walletAdapterPublicKey && authenticated && !!privyWallet;

  const effectivePublicKey = useMemo(() => {
    if (walletAdapterPublicKey) return walletAdapterPublicKey;

    if (authenticated && walletsReady && privyWallet) {
      const addr = privyWallet.address;
      if (isValidSolanaAddress(addr)) {
        return new PublicKey(addr);
      }
    }

    return null;
  }, [walletAdapterPublicKey, authenticated, walletsReady, privyWallet]);

  // Bridge Privy signMessage to match wallet adapter signature: (message: Uint8Array) => Promise<Uint8Array>
  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (walletAdapterSignMessage) {
        return walletAdapterSignMessage(message);
      }
      if (usingPrivy && privyWallet) {
        const result = await privyWallet.signMessage({
          message,
          address: privyWallet.address,
        });
        return result.signature;
      }
      throw new Error('No wallet available for message signing');
    },
    [walletAdapterSignMessage, usingPrivy, privyWallet]
  );

  return {
    publicKey: effectivePublicKey,
    connected: connected || (authenticated && !!effectivePublicKey),
    signTransaction: walletAdapterSignTransaction,
    signMessage: effectivePublicKey ? signMessage : undefined,
    source: walletAdapterPublicKey ? ('wallet-adapter' as const) : ('privy' as const),
  };
}
