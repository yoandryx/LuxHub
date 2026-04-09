// src/hooks/useEffectiveWallet.ts
// Unified wallet hook — returns publicKey from whichever source is active:
// Solana wallet adapter (Phantom, Solflare) OR Privy (embedded/linked wallets).
// Use this instead of useWallet() when you need publicKey on any page.
import { useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';

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
    signAllTransactions: walletAdapterSignAllTransactions,
    signMessage: walletAdapterSignMessage,
    sendTransaction,
  } = useWallet();
  const { authenticated } = usePrivy();
  const { wallets: privySolanaWallets, ready: walletsReady } = useWallets();

  const privyWallet = privySolanaWallets?.[0] ?? null;
  const usingPrivy = !walletAdapterPublicKey && authenticated && !!privyWallet;

  const effectivePublicKey = useMemo(() => {
    // When Privy is authenticated with a wallet, prefer it — Privy is the primary
    // connection method. Wallet adapter may have a stale auto-connected wallet from
    // a previous session, causing the top navbar and bottom navbar to show different wallets.
    if (authenticated && walletsReady && privyWallet) {
      const addr = privyWallet.address;
      if (isValidSolanaAddress(addr)) {
        return new PublicKey(addr);
      }
    }

    if (walletAdapterPublicKey) return walletAdapterPublicKey;

    return null;
  }, [walletAdapterPublicKey, authenticated, walletsReady, privyWallet]);

  // Bridge Privy signTransaction to match wallet adapter signature
  // Accepts both Transaction and VersionedTransaction (same as wallet adapter)
  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (walletAdapterSignTransaction) {
        return walletAdapterSignTransaction(tx);
      }
      if (usingPrivy && privyWallet) {
        return (privyWallet as any).signTransaction(tx);
      }
      throw new Error('No wallet available for transaction signing');
    },
    [walletAdapterSignTransaction, usingPrivy, privyWallet]
  );

  // Bridge signAllTransactions (single wallet prompt for multiple txs)
  const signAllTransactions = useCallback(
    async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      if (walletAdapterSignAllTransactions) {
        return walletAdapterSignAllTransactions(txs);
      }
      if (usingPrivy && privyWallet) {
        // Privy doesn't have signAllTransactions — sign sequentially
        const signed: T[] = [];
        for (const tx of txs) {
          signed.push(await (privyWallet as any).signTransaction(tx));
        }
        return signed;
      }
      throw new Error('No wallet available for batch signing');
    },
    [walletAdapterSignAllTransactions, usingPrivy, privyWallet]
  );

  // Bridge Privy signMessage to match wallet adapter signature: (message: Uint8Array) => Promise<Uint8Array>
  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (walletAdapterSignMessage) {
        return walletAdapterSignMessage(message);
      }
      if (usingPrivy && privyWallet) {
        const result = await (privyWallet.signMessage as any)({ message });
        return result.signature;
      }
      throw new Error('No wallet available for message signing');
    },
    [walletAdapterSignMessage, usingPrivy, privyWallet]
  );

  // Send a VersionedTransaction: sign + send + confirm in one call.
  // Uses wallet adapter's native sendTransaction when available (avoids Privy/Phantom
  // extension bridge serialization bugs like "e is not iterable").
  // Falls back to signTransaction + sendRawTransaction for legacy paths.
  const sendVersionedTransaction = useCallback(
    async (tx: VersionedTransaction, connection: Connection): Promise<string> => {
      // Wallet adapter path — sendTransaction handles extension bridge correctly
      if (walletAdapterPublicKey && sendTransaction) {
        const sig = await sendTransaction(tx, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });
        await connection.confirmTransaction(sig, 'confirmed');
        return sig;
      }
      // Privy path — use signAndSendTransaction with serialized bytes.
      // Passing a VersionedTransaction JS object through the Wallet Standard bridge
      // causes "e is not iterable" because Phantom receives spread object properties
      // instead of { transaction: Uint8Array }. Serializing to bytes fixes this.
      if (usingPrivy && privyWallet) {
        const serializedTx = tx.serialize();
        const result = await (privyWallet as any).signAndSendTransaction({
          transaction: serializedTx,
          chain: 'solana:mainnet',
        });
        // Wallet Standard returns { signature: Uint8Array } — encode to base58
        const bs58Module = await import('bs58');
        const bs58 = (bs58Module as any).default || bs58Module;
        let sig: string;
        if (typeof result === 'string') {
          sig = result;
        } else if (result?.signature instanceof Uint8Array) {
          sig = bs58.encode(result.signature);
        } else if (result?.signature) {
          sig = String(result.signature);
        } else {
          throw new Error('No signature returned from wallet');
        }
        await connection.confirmTransaction(sig, 'confirmed');
        return sig;
      }
      throw new Error('No wallet available for transaction sending');
    },
    [walletAdapterPublicKey, sendTransaction, usingPrivy, privyWallet]
  );

  return {
    publicKey: effectivePublicKey,
    connected: connected || (authenticated && !!effectivePublicKey),
    signTransaction: effectivePublicKey ? signTransaction : undefined,
    signAllTransactions: effectivePublicKey ? signAllTransactions : undefined,
    signMessage: effectivePublicKey ? signMessage : undefined,
    sendVersionedTransaction: effectivePublicKey ? sendVersionedTransaction : undefined,
    source: walletAdapterPublicKey ? ('wallet-adapter' as const) : ('privy' as const),
  };
}
