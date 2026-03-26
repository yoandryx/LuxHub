// src/lib/services/squadsTransferService.ts
// Builds Squads vault transaction proposals for SOL and SPL token transfers
// Also provides helpers for confirm_delivery and refund_buyer inner instruction keys
// Used by pay-vendor.ts, distribute.ts, and confirm-delivery.ts
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
import {
  getClusterConfig,
  getConnection as getCentralConnection,
} from '@/lib/solana/clusterConfig';

const USDC_DECIMALS = 6;

function getUsdcMint(): PublicKey {
  return new PublicKey(getClusterConfig().usdcMint);
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
  return getCentralConnection();
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
 * Build the account keys for the confirm_delivery inner instruction.
 * Matches the new on-chain account layout (with seller, associatedTokenProgram, systemProgram).
 *
 * Mint ordering: mint_a = funds (USDC), mint_b = NFT
 * Vault derivation: PDA-derived ATAs of escrow PDA (allowOwnerOffCurve = true)
 *
 * @param escrowPda - The escrow PDA public key
 * @param fundsMint - The funds/USDC mint (mint_a)
 * @param nftMint - The NFT mint (mint_b)
 * @param buyerWallet - The buyer's wallet public key
 * @param sellerWallet - The seller's wallet public key (escrow.initializer)
 * @param treasuryWallet - The treasury wallet for fee collection
 * @param authorityPubkey - The authority (Squads vault PDA) that signs via CPI
 */
export function buildConfirmDeliveryKeys(
  escrowPda: PublicKey,
  fundsMint: PublicKey,
  nftMint: PublicKey,
  buyerWallet: PublicKey,
  sellerWallet: PublicKey,
  treasuryWallet: PublicKey,
  authorityPubkey: PublicKey
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');
  const programId = new PublicKey(process.env.PROGRAM_ID!);

  // Derive PDAs
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('luxhub-config')], programId);
  const nftVault = getAssociatedTokenAddressSync(nftMint, escrowPda, true);
  const wsolVault = getAssociatedTokenAddressSync(fundsMint, escrowPda, true);
  const buyerNftAta = getAssociatedTokenAddressSync(nftMint, buyerWallet, false);
  const sellerFundsAta = getAssociatedTokenAddressSync(fundsMint, sellerWallet, false);
  const luxhubFeeAta = getAssociatedTokenAddressSync(fundsMint, treasuryWallet, false);

  // Account order matches IDL: escrow, config, buyer_nft_ata, nft_vault, wsol_vault,
  // mint_a (funds), mint_b (NFT), seller_funds_ata, luxhub_fee_ata,
  // seller (receives rent), authority, instructions_sysvar,
  // token_program, associated_token_program, system_program
  return [
    { pubkey: escrowPda, isSigner: false, isWritable: true },
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: buyerNftAta, isSigner: false, isWritable: true },
    { pubkey: nftVault, isSigner: false, isWritable: true },
    { pubkey: wsolVault, isSigner: false, isWritable: true },
    { pubkey: fundsMint, isSigner: false, isWritable: false },
    { pubkey: nftMint, isSigner: false, isWritable: false },
    { pubkey: sellerFundsAta, isSigner: false, isWritable: true },
    { pubkey: luxhubFeeAta, isSigner: false, isWritable: true },
    { pubkey: sellerWallet, isSigner: false, isWritable: true },
    { pubkey: authorityPubkey, isSigner: true, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

/**
 * Build the account keys for the refund_buyer inner instruction.
 * Matches the new on-chain account layout (with buyer_account, associatedTokenProgram, systemProgram).
 *
 * @param escrowPda - The escrow PDA public key
 * @param fundsMint - The funds/USDC mint (escrow.mint_a)
 * @param nftMint - The NFT mint (escrow.mint_b)
 * @param buyerWallet - The buyer's wallet public key (receives refund + rent)
 * @param sellerWallet - The seller's wallet public key (gets NFT back)
 * @param authorityPubkey - The authority (Squads vault PDA) that signs via CPI
 */
export function buildRefundBuyerKeys(
  escrowPda: PublicKey,
  fundsMint: PublicKey,
  nftMint: PublicKey,
  buyerWallet: PublicKey,
  sellerWallet: PublicKey,
  authorityPubkey: PublicKey
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');
  const programId = new PublicKey(process.env.PROGRAM_ID!);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('luxhub-config')], programId);
  const buyerFundsAta = getAssociatedTokenAddressSync(fundsMint, buyerWallet, false);
  const fundsVault = getAssociatedTokenAddressSync(fundsMint, escrowPda, true);
  const nftVault = getAssociatedTokenAddressSync(nftMint, escrowPda, true);
  const sellerNftAta = getAssociatedTokenAddressSync(nftMint, sellerWallet, false);

  // Account order matches IDL: escrow, config, buyer_funds_ata, funds_vault, nft_vault,
  // seller_nft_ata, buyer_account (receives rent), authority, instructions_sysvar,
  // token_program, associated_token_program, system_program
  return [
    { pubkey: escrowPda, isSigner: false, isWritable: true },
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: buyerFundsAta, isSigner: false, isWritable: true },
    { pubkey: fundsVault, isSigner: false, isWritable: true },
    { pubkey: nftVault, isSigner: false, isWritable: true },
    { pubkey: sellerNftAta, isSigner: false, isWritable: true },
    { pubkey: buyerWallet, isSigner: false, isWritable: true },
    { pubkey: authorityPubkey, isSigner: true, isWritable: true },
    { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
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
  const connection = getCentralConnection();
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
