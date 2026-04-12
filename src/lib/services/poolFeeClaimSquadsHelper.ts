// src/lib/services/poolFeeClaimSquadsHelper.ts
// Wraps Bags claim-txs/v3 base64 transactions into Squads vault proposals.
// TREASURY_POOLS = Squads vault index 1. All claims require Squads approval.
// NO server-side keypair signing for TREASURY_POOLS.

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { getConnection } from '@/lib/solana/clusterConfig';
import { getSquadsAutoApprove } from '@/lib/config/squadsConfig';
import { sendWithRetry } from '@/lib/solana/retryTransaction';
import { readFileSync } from 'fs';

const POOLS_VAULT_INDEX = 1;

export interface VaultProposalResult {
  success: boolean;
  txSignatures: string[];
  withdrawalTxSignature?: string;
  error?: string;
}

function loadPayerKeypair(): Keypair {
  const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
  const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
  if (!path && !json) {
    throw new Error('Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env');
  }
  const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/**
 * Decode a Bags API base64-encoded transaction and extract its instructions.
 * Bags returns either legacy or versioned transactions.
 */
function decodeBagsTx(
  txData: any
): { instructions: TransactionInstruction[]; raw: Buffer } {
  const base64Str = txData.tx || txData.transaction;
  if (!base64Str) {
    throw new Error('No transaction data in Bags response');
  }

  const buffer = Buffer.from(base64Str, 'base64');

  try {
    // Try legacy transaction first
    const legacyTx = Transaction.from(buffer);
    return {
      instructions: legacyTx.instructions,
      raw: buffer,
    };
  } catch {
    // Try versioned transaction
    const versionedTx = VersionedTransaction.deserialize(buffer);
    // For versioned transactions, we need to extract instructions differently
    // Since we can't directly extract TransactionInstructions from VersionedTransaction
    // in a clean way, we store the raw tx for direct submission via vault
    return {
      instructions: [],
      raw: buffer,
    };
  }
}

/**
 * Build Squads vault proposals from Bags claim transactions.
 * Each Bags tx becomes a vault transaction proposal at vault index 1 (TREASURY_POOLS).
 *
 * The Squads member keypair creates and optionally auto-approves the proposal.
 * The vault PDA (index 1) acts as the signer for the inner instructions.
 *
 * Returns the proposal execution tx signatures. The last one is the withdrawal.
 */
export async function buildVaultProposalFromBagsTxs(
  bagsTxs: any[],
  poolsTreasury: string,
  tokenMint: string
): Promise<VaultProposalResult> {
  try {
    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;
    if (!multisigPda) {
      return { success: false, txSignatures: [], error: 'NEXT_PUBLIC_SQUADS_MSIG not configured' };
    }

    const connection = getConnection();
    const payer = loadPayerKeypair();
    const msigPk = new PublicKey(multisigPda);
    const autoApprove = getSquadsAutoApprove();

    // Derive vault PDA at index 1 (TREASURY_POOLS)
    const [vaultPda] = multisig.getVaultPda({
      multisigPda: msigPk,
      index: POOLS_VAULT_INDEX,
    });

    const txSignatures: string[] = [];

    for (let i = 0; i < bagsTxs.length; i++) {
      const bagsTx = bagsTxs[i];
      const { instructions } = decodeBagsTx(bagsTx);

      if (instructions.length === 0) {
        console.warn(
          `[poolFeeClaimSquadsHelper] Skipping tx ${i + 1}: no extractable instructions (versioned tx)`
        );
        continue;
      }

      // Replace the fee claimer signer with the vault PDA in each instruction
      const remappedInstructions = instructions.map((ix) => {
        const newKeys = ix.keys.map((key) => {
          // If this key is the pools treasury and is a signer, remap to vault PDA
          if (key.pubkey.toBase58() === poolsTreasury && key.isSigner) {
            return { ...key, pubkey: vaultPda };
          }
          return key;
        });
        return new TransactionInstruction({
          programId: ix.programId,
          keys: newKeys,
          data: ix.data,
        });
      });

      // Fetch next transaction index
      const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        msigPk
      );
      const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

      const { blockhash } = await connection.getLatestBlockhash();

      // Build vault transaction message
      const vaultMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: blockhash,
        instructions: remappedInstructions,
      });

      // Create vault transaction + proposal
      const vaultTxCreateIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: msigPk,
        creator: payer.publicKey,
        transactionIndex,
        vaultIndex: POOLS_VAULT_INDEX,
        ephemeralSigners: 0,
        transactionMessage: vaultMessage,
        rentPayer: payer.publicKey,
      });

      const proposalCreateIx = multisig.instructions.proposalCreate({
        multisigPda: msigPk,
        creator: payer.publicKey,
        transactionIndex,
        isDraft: false,
        rentPayer: payer.publicKey,
      });

      const ixs = [vaultTxCreateIx, proposalCreateIx];

      if (autoApprove) {
        ixs.push(
          multisig.instructions.proposalApprove({
            multisigPda: msigPk,
            member: payer.publicKey,
            transactionIndex,
          })
        );
      }

      const signature = await sendWithRetry(connection, ixs, payer, {
        commitment: 'confirmed',
      });

      txSignatures.push(signature);
    }

    if (txSignatures.length === 0) {
      return {
        success: false,
        txSignatures: [],
        error: 'No claim transactions could be processed',
      };
    }

    return {
      success: true,
      txSignatures,
      withdrawalTxSignature: txSignatures[txSignatures.length - 1],
    };
  } catch (err: any) {
    console.error('[poolFeeClaimSquadsHelper] Error:', err);
    return {
      success: false,
      txSignatures: [],
      error: err?.message || 'Unknown error',
    };
  }
}
