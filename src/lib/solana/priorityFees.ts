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
