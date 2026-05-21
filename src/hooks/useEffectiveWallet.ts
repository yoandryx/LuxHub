// src/hooks/useEffectiveWallet.ts
// Unified wallet hook — thin pass-through over @solana/wallet-adapter-react.
// Preserves the public API surface that 34 consumer files depend on
// (publicKey, connected, signTransaction, signAllTransactions, signMessage,
//  sendVersionedTransaction, source) so no consumer-side changes are needed.
//
// Phase 12 (2026-05-21): Privy removed. `source` is permanently 'wallet-adapter'.
import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Transaction, VersionedTransaction, Connection } from '@solana/web3.js';

export function useEffectiveWallet() {
  const {
    publicKey,
    connected,
    signTransaction: walletAdapterSignTransaction,
    signAllTransactions: walletAdapterSignAllTransactions,
    signMessage: walletAdapterSignMessage,
    sendTransaction,
  } = useWallet();

  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (!walletAdapterSignTransaction) {
        throw new Error('No wallet available for transaction signing');
      }
      return walletAdapterSignTransaction(tx);
    },
    [walletAdapterSignTransaction]
  );

  const signAllTransactions = useCallback(
    async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      if (!walletAdapterSignAllTransactions) {
        throw new Error('No wallet available for batch signing');
      }
      return walletAdapterSignAllTransactions(txs);
    },
    [walletAdapterSignAllTransactions]
  );

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (!walletAdapterSignMessage) {
        throw new Error('No wallet available for message signing');
      }
      return walletAdapterSignMessage(message);
    },
    [walletAdapterSignMessage]
  );

  // Sign + send + confirm a VersionedTransaction in one call.
  // Uses wallet-adapter's native sendTransaction (handles extension bridge serialization).
  const sendVersionedTransaction = useCallback(
    async (tx: VersionedTransaction, connection: Connection): Promise<string> => {
      if (!sendTransaction) {
        throw new Error('No wallet available for transaction sending');
      }
      const sig = await sendTransaction(tx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    },
    [sendTransaction]
  );

  return {
    publicKey,
    connected,
    signTransaction: publicKey ? signTransaction : undefined,
    signAllTransactions: publicKey ? signAllTransactions : undefined,
    signMessage: publicKey ? signMessage : undefined,
    sendVersionedTransaction: publicKey ? sendVersionedTransaction : undefined,
    source: 'wallet-adapter' as const,
  };
}
