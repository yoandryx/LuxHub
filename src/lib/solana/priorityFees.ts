import { ComputeBudgetProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

/**
 * Get the priority fee in micro-lamports based on network configuration.
 * Returns 0 for devnet (no priority fees needed), configurable for mainnet.
 */
export function getPriorityFeeMicroLamports(): number {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  if (network !== 'mainnet-beta') return 0;
  return parseInt(process.env.NEXT_PUBLIC_PRIORITY_FEE_MICRO_LAMPORTS || '50000', 10);
}

/**
 * Add a priority fee instruction to an existing transaction.
 * Only adds if fee > 0 (skips on devnet).
 */
export function addPriorityFee(tx: Transaction, microLamports?: number): Transaction {
  const fee = microLamports ?? getPriorityFeeMicroLamports();
  if (fee > 0) {
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: fee }));
  }
  return tx;
}

/**
 * Get priority fee instructions to prepend to a transaction.
 * Returns empty array if fee is 0 (devnet).
 */
export function getPriorityFeeInstructions(microLamports?: number): TransactionInstruction[] {
  const fee = microLamports ?? getPriorityFeeMicroLamports();
  if (fee <= 0) return [];
  return [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: fee })];
}

/**
 * Priority fee multipliers for retry attempts.
 * Attempt 0: 1x, Attempt 1: 1.5x, Attempt 2: 2x, Attempt 3: 3x
 */
export const RETRY_MULTIPLIERS = [1, 1.5, 2, 3] as const;

/**
 * Get priority fee for a specific retry attempt.
 * Returns baseFee * multiplier for the given attempt index.
 */
export function getPriorityFeeWithEscalation(attempt: number): number {
  const baseFee = getPriorityFeeMicroLamports();
  const multiplier = RETRY_MULTIPLIERS[Math.min(attempt, RETRY_MULTIPLIERS.length - 1)];
  return Math.round(baseFee * multiplier);
}
