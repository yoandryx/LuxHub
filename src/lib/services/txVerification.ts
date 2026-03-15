// src/lib/services/txVerification.ts
// On-chain transaction verification — ensures payments actually happened before updating MongoDB
import { Connection, PublicKey } from '@solana/web3.js';

const getRpc = () => process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com';

export interface TxVerificationResult {
  verified: boolean;
  error?: string;
  slot?: number;
  blockTime?: number;
  fee?: number;
}

/**
 * Verify that a transaction signature exists on-chain and is confirmed.
 * Call this BEFORE updating MongoDB state for any fund-moving operation.
 */
export async function verifyTransaction(txSignature: string): Promise<TxVerificationResult> {
  if (!txSignature || txSignature.length < 32) {
    return { verified: false, error: 'Invalid transaction signature' };
  }

  try {
    const connection = new Connection(getRpc(), 'confirmed');

    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found on-chain' };
    }

    if (tx.meta?.err) {
      return {
        verified: false,
        error: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
      };
    }

    return {
      verified: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
      fee: tx.meta?.fee,
    };
  } catch (error: any) {
    return { verified: false, error: error?.message || 'Verification failed' };
  }
}

/**
 * Verify a transaction AND check that a specific wallet was involved (as signer or account).
 */
export async function verifyTransactionForWallet(
  txSignature: string,
  expectedWallet: string
): Promise<TxVerificationResult> {
  if (!txSignature || txSignature.length < 32) {
    return { verified: false, error: 'Invalid transaction signature' };
  }

  try {
    const connection = new Connection(getRpc(), 'confirmed');

    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found on-chain' };
    }

    if (tx.meta?.err) {
      return { verified: false, error: `Transaction failed on-chain` };
    }

    // Check that the expected wallet is in the transaction's account keys
    const accountKeys = tx.transaction.message.getAccountKeys();
    const walletPk = new PublicKey(expectedWallet);
    let walletFound = false;

    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys.get(i)?.equals(walletPk)) {
        walletFound = true;
        break;
      }
    }

    if (!walletFound) {
      return { verified: false, error: 'Wallet not found in transaction accounts' };
    }

    return {
      verified: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
      fee: tx.meta?.fee,
    };
  } catch (error: any) {
    return { verified: false, error: error?.message || 'Verification failed' };
  }
}
