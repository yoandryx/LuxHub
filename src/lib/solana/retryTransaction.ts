import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { getPriorityFeeWithEscalation, RETRY_MULTIPLIERS } from './priorityFees';

/**
 * Errors that indicate a dropped/expired transaction worth retrying.
 * All other errors are thrown immediately.
 */
const RETRYABLE_PATTERNS = ['BlockhashNotFound', 'block height exceeded', 'timeout'];

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Send a transaction with retry logic and escalating priority fees.
 * Retries up to 4 attempts (matching RETRY_MULTIPLIERS length) with fresh
 * blockhash and increasing priority fees on each retry.
 *
 * Only retries on network/congestion errors (BlockhashNotFound, block height
 * exceeded, timeout). All other errors throw immediately.
 */
export async function sendWithRetry(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: Keypair,
  options?: { commitment?: 'confirmed' | 'finalized' }
): Promise<string> {
  const maxAttempts = RETRY_MULTIPLIERS.length;
  const commitment = options?.commitment ?? 'confirmed';
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash(commitment);

      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = payer.publicKey;

      // Add escalating priority fee
      const priorityFee = getPriorityFeeWithEscalation(attempt);
      if (priorityFee > 0) {
        tx.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
        );
      }

      // Add user instructions
      for (const ix of instructions) {
        tx.add(ix);
      }

      const signature = await connection.sendTransaction(tx, [payer]);

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        commitment
      );

      return signature;
    } catch (error) {
      lastError = error;

      if (!isRetryable(error)) {
        throw error;
      }

      const nextFee = getPriorityFeeWithEscalation(
        Math.min(attempt + 1, maxAttempts - 1)
      );
      console.warn(
        `[sendWithRetry] Attempt ${attempt + 1} failed, retrying with ${nextFee} micro-lamports...`
      );
    }
  }

  throw lastError;
}
