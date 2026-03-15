// src/lib/services/squadsTransferService.ts
// Builds Squads vault transaction proposals for SOL and SPL token transfers
// Used by pay-vendor.ts and distribute.ts for real on-chain fund movements
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import { readFileSync } from 'fs';

// USDC mint on devnet (use mainnet mint for production)
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

function getUsdcMint(): PublicKey {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
  return cluster === 'mainnet-beta' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
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

function getConnection(): Connection {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (!rpc) throw new Error('NEXT_PUBLIC_SOLANA_ENDPOINT not configured');
  return new Connection(rpc, 'confirmed');
}

export interface TransferRecipient {
  wallet: string;
  amountUSD: number; // USD amount (converted to USDC lamports internally)
  label?: string;
}

export interface TransferProposalResult {
  success: boolean;
  transactionIndex?: string;
  proposalPda?: string;
  vaultTransactionPda?: string;
  signature?: string;
  squadsDeepLink?: string;
  error?: string;
}

/**
 * Build and submit a Squads vault transaction proposal that transfers
 * USDC from the vault to one or more recipients.
 *
 * The vault must hold enough USDC to cover all transfers.
 * Each recipient gets an ATA-creation instruction (idempotent) + transfer.
 */
export async function buildMultiTransferProposal(
  recipients: TransferRecipient[],
  options?: {
    multisigPda?: string;
    vaultIndex?: number;
    autoApprove?: boolean;
    memo?: string;
  }
): Promise<TransferProposalResult> {
  try {
    const multisigPda = options?.multisigPda || process.env.NEXT_PUBLIC_SQUADS_MSIG;
    const vaultIndex = options?.vaultIndex ?? 0;
    const autoApprove = options?.autoApprove ?? true;

    if (!multisigPda) {
      return { success: false, error: 'Missing NEXT_PUBLIC_SQUADS_MSIG configuration' };
    }

    const connection = getConnection();
    const payer = loadPayerKeypair();
    const msigPk = new PublicKey(multisigPda);
    const usdcMint = getUsdcMint();

    // Get vault PDA
    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: vaultIndex });

    // Get vault's USDC ATA (source of funds)
    const vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);

    // Build transfer instructions for each recipient
    const innerInstructions: TransactionInstruction[] = [];

    for (const recipient of recipients) {
      const recipientPk = new PublicKey(recipient.wallet);
      const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipientPk, false);
      const amountLamports = BigInt(Math.round(recipient.amountUSD * 10 ** USDC_DECIMALS));

      if (amountLamports <= 0n) continue;

      // Create ATA if it doesn't exist (idempotent — no-op if already exists)
      innerInstructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          vaultPda, // payer (vault pays for ATA rent)
          recipientAta,
          recipientPk,
          usdcMint
        )
      );

      // Transfer USDC from vault ATA → recipient ATA
      innerInstructions.push(
        createTransferInstruction(
          vaultUsdcAta, // source
          recipientAta, // destination
          vaultPda, // authority (vault is the signer via Squads CPI)
          amountLamports
        )
      );
    }

    if (innerInstructions.length === 0) {
      return { success: false, error: 'No valid transfer recipients (all amounts zero)' };
    }

    // Fetch next transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

    const { blockhash } = await connection.getLatestBlockhash();

    // Build the vault transaction message (instructions executed by the vault)
    const vaultMessage = new TransactionMessage({
      payerKey: vaultPda,
      recentBlockhash: blockhash,
      instructions: innerInstructions,
    });

    // Step 1: Create vault transaction
    const vaultTxCreateIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: msigPk,
      creator: payer.publicKey,
      transactionIndex,
      vaultIndex,
      ephemeralSigners: 0,
      transactionMessage: vaultMessage,
      rentPayer: payer.publicKey,
    });

    // Step 2: Create proposal
    const proposalCreateIx = multisig.instructions.proposalCreate({
      multisigPda: msigPk,
      creator: payer.publicKey,
      transactionIndex,
      isDraft: false,
      rentPayer: payer.publicKey,
    });

    const instructions = [vaultTxCreateIx, proposalCreateIx];

    // Step 3: Auto-approve if enabled
    if (autoApprove) {
      instructions.push(
        multisig.instructions.proposalApprove({
          multisigPda: msigPk,
          member: payer.publicKey,
          transactionIndex,
        })
      );
    }

    // Build, sign, and send
    const txMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(txMessage);
    transaction.sign([payer]);

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
    });
    await connection.confirmTransaction(signature, 'confirmed');

    // Compute PDAs for response
    const [proposalPda] = multisig.getProposalPda({ multisigPda: msigPk, transactionIndex });
    const [vaultTxPda] = multisig.getTransactionPda({
      multisigPda: msigPk,
      index: transactionIndex,
    });
    const squadsDeepLink = `https://v4.squads.so/squads/${msigPk.toBase58()}/tx/${transactionIndex.toString()}`;

    return {
      success: true,
      transactionIndex: transactionIndex.toString(),
      proposalPda: proposalPda.toBase58(),
      vaultTransactionPda: vaultTxPda.toBase58(),
      signature,
      squadsDeepLink,
    };
  } catch (error: any) {
    console.error('[buildMultiTransferProposal] Error:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Fetch top token holders for a given SPL mint.
 * Uses Helius DAS getTokenAccounts (1 call) with fallback to standard RPC (N+1 calls).
 * Returns wallets sorted by balance descending.
 */
export async function getTopTokenHolders(
  tokenMint: string,
  limit: number = 100
): Promise<{ wallet: string; balance: number; ownershipPercent: number }[]> {
  // Try DAS API first (single call, much faster)
  try {
    const { getTokenHolders } = await import('./dasApi');
    return await getTokenHolders(tokenMint, limit);
  } catch (dasError) {
    console.warn('[getTopTokenHolders] DAS API failed, falling back to standard RPC:', dasError);
  }

  // Fallback: standard Solana RPC (N+1 calls)
  const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (!rpc) throw new Error('NEXT_PUBLIC_SOLANA_ENDPOINT not configured');

  const connection = new Connection(rpc, 'confirmed');
  const mintPk = new PublicKey(tokenMint);
  const largestAccounts = await connection.getTokenLargestAccounts(mintPk);

  const holders: { wallet: string; balance: number }[] = [];
  const accountInfos = await connection.getMultipleAccountsInfo(
    largestAccounts.value.map((a) => a.address)
  );

  for (let i = 0; i < largestAccounts.value.length && holders.length < limit; i++) {
    const accountInfo = accountInfos[i];
    const uiAmount = largestAccounts.value[i].uiAmount ?? 0;

    if (!accountInfo || uiAmount === 0) continue;
    if (accountInfo.data.length !== 165 || !accountInfo.owner.equals(TOKEN_PROGRAM_ID)) continue;

    const owner = new PublicKey(accountInfo.data.slice(32, 64));
    holders.push({ wallet: owner.toBase58(), balance: uiAmount });
  }

  const totalBalance = holders.reduce((sum, h) => sum + h.balance, 0);

  return holders.map((h) => ({
    wallet: h.wallet,
    balance: h.balance,
    ownershipPercent: totalBalance > 0 ? (h.balance / totalBalance) * 100 : 0,
  }));
}
