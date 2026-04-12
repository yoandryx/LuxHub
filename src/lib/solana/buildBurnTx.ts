// src/lib/solana/buildBurnTx.ts
// Client-side helper: builds an unsigned SPL token burn transaction for the claim UI.
// The holder's wallet adapter signs this, sends it on-chain, then submits the signature
// to /api/pools/distribution/[poolId]/claim for verification + USDC payout.

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  createBurnCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

/**
 * Build an unsigned burn transaction for the claim UI.
 *
 * Flow:
 *   1. Client calls buildBurnTx() to get the unsigned transaction
 *   2. Wallet adapter signs and sends it
 *   3. Client submits the burn tx signature to the claim endpoint
 *   4. Server verifies the burn on-chain and creates Squads USDC payout
 *
 * @param connection - Solana RPC connection
 * @param holderWallet - The token holder's wallet public key
 * @param mint - The pool token mint (bagsTokenMint)
 * @param amount - Raw token amount to burn (bigint, NOT UI amount)
 * @param decimals - Token decimals (Bags tokens use 9 decimals)
 */
export async function buildBurnTx(args: {
  connection: Connection;
  holderWallet: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
}): Promise<Transaction> {
  const { connection, holderWallet, mint, amount, decimals } = args;

  const ata = getAssociatedTokenAddressSync(mint, holderWallet);

  const burnIx = createBurnCheckedInstruction(
    ata,        // token account to burn from
    mint,       // token mint
    holderWallet, // authority (owner of the token account)
    amount,     // raw amount to burn
    decimals,   // decimals for burnChecked
  );

  const tx = new Transaction().add(burnIx);
  tx.feePayer = holderWallet;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  return tx;
}
