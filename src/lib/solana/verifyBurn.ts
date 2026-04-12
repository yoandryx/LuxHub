// src/lib/solana/verifyBurn.ts
// Verifies an on-chain SPL token burn transaction.
// Used by the holder claim endpoint to confirm that the holder actually burned their tokens
// before issuing the USDC payout.

import { getConnection } from '@/lib/solana/clusterConfig';

export interface VerifyBurnParams {
  txSignature: string;
  expectedMint: string;
  expectedOwner: string;
  expectedMinAmount: number; // raw token amount (not UI amount)
}

export interface VerifyBurnResult {
  valid: boolean;
  reason?: string;
  burnedAmount?: number;
}

/**
 * Verify that a transaction contains a valid SPL token burn instruction
 * matching the expected mint, owner/authority, and minimum amount.
 *
 * Checks both `burn` and `burnChecked` instruction variants.
 */
export async function verifyBurnTx(params: VerifyBurnParams): Promise<VerifyBurnResult> {
  const { txSignature, expectedMint, expectedOwner, expectedMinAmount } = params;

  if (!txSignature || txSignature.length < 32) {
    return { valid: false, reason: 'invalid_tx_signature' };
  }

  const connection = getConnection();

  let tx;
  try {
    tx = await connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (err: any) {
    return { valid: false, reason: `rpc_error: ${err?.message || 'unknown'}` };
  }

  if (!tx) {
    return { valid: false, reason: 'tx_not_found' };
  }

  if (tx.meta?.err) {
    return { valid: false, reason: 'tx_failed_on_chain' };
  }

  // Search all instructions (top-level + inner) for a matching burn
  const allInstructions = [
    ...(tx.transaction.message.instructions || []),
    ...(tx.meta?.innerInstructions?.flatMap((inner) => inner.instructions) || []),
  ];

  for (const ix of allInstructions) {
    if (!('parsed' in ix)) continue;
    const parsed = (ix as any).parsed;
    if (!parsed) continue;

    if (parsed.type === 'burn') {
      const info = parsed.info;
      if (
        info.mint === expectedMint &&
        info.authority === expectedOwner &&
        Number(info.amount) >= expectedMinAmount
      ) {
        return { valid: true, burnedAmount: Number(info.amount) };
      }
    }

    if (parsed.type === 'burnChecked') {
      const info = parsed.info;
      const amount = Number(info.tokenAmount?.amount || info.amount || 0);
      if (
        info.mint === expectedMint &&
        info.authority === expectedOwner &&
        amount >= expectedMinAmount
      ) {
        return { valid: true, burnedAmount: amount };
      }
    }
  }

  return { valid: false, reason: 'no_matching_burn_ix' };
}
