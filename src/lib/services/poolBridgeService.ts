// src/lib/services/poolBridgeService.ts
// Architectural keystone of Phase 11: SOL->USDC swap + exchange bridge.
//
// Constructs Squads vault transaction(s) that:
//   1. Swap accumulated SOL from TREASURY_POOLS into USDC via Jupiter v6
//   2. Call `exchange` on the pool's backing marketplace escrow with the vault PDA as taker
//
// Bridge is vault-to-vault within the same Squads multisig (index 1 = pools vault).
// USDC denomination is NON-NEGOTIABLE — vendor receives exact listed USD amount.
//
// Recovery path (if bridge fails partway — swap succeeds, exchange fails):
//   USDC sits in vault ATA. Abort flow (plan 11-14) swaps USDC back to SOL.
//   Do NOT attempt recovery in this service — let the abort handler deal with it.
//
// This service does NOT advance pool.tokenStatus. State transitions happen in
// the graduation endpoint (11-08) or confirm-custody endpoint (11-09).

import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  Connection,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import { getClusterConfig, getConnection } from '@/lib/solana/clusterConfig';
import { getTreasury } from '@/lib/config/treasuryConfig';
import { getSquadsAutoApprove } from '@/lib/config/squadsConfig';
import { getSolUsdRate } from '@/lib/services/solPriceService';
import { sendWithRetry } from '@/lib/solana/retryTransaction';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeParams {
  poolId: string;
  adminWallet: string; // for audit trail, not auth
  options?: {
    autoApprove?: boolean;
    slippageBps?: number; // default 200 (2%)
    onlyDirectRoutes?: boolean; // default true (smaller tx)
  };
}

export interface ProposalInfo {
  index: number;
  txSignature?: string;
  kind: 'swap' | 'exchange' | 'swap_and_exchange';
  deepLink?: string;
}

export interface BridgeResult {
  success: boolean;
  pattern: 'single_proposal' | 'two_proposal';
  proposals: ProposalInfo[];
  expectedUsdcOut?: string;
  solAmountUsed?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JUPITER_API = 'https://public.jupiterapi.com';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

// Exchange instruction discriminator from IDL (sha256("global:exchange")[0..8])
const EXCHANGE_DISCRIMINATOR = Buffer.from([47, 3, 27, 97, 215, 236, 219, 144]);

function getUsdcMint(): PublicKey {
  return new PublicKey(getClusterConfig().usdcMint);
}

function getProgramId(): PublicKey {
  const pid = process.env.PROGRAM_ID;
  if (!pid) throw new Error('[poolBridge] PROGRAM_ID env var not set');
  return new PublicKey(pid);
}

// ---------------------------------------------------------------------------
// Jupiter helpers
// ---------------------------------------------------------------------------

interface JupiterSwapResult {
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction?: TransactionInstruction;
  addressLookupTableAddresses: string[];
  expectedOutUsdc: bigint;
}

function toTransactionInstruction(ix: {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

async function fetchJupiterSwapIxs(args: {
  vaultPda: PublicKey;
  solAmountLamports: bigint;
  slippageBps: number;
  onlyDirectRoutes: boolean;
}): Promise<JupiterSwapResult> {
  const USDC = getUsdcMint().toBase58();

  // Step 1: Get quote
  const quoteUrl = new URL(`${JUPITER_API}/quote`);
  quoteUrl.searchParams.set('inputMint', SOL_MINT);
  quoteUrl.searchParams.set('outputMint', USDC);
  quoteUrl.searchParams.set('amount', args.solAmountLamports.toString());
  quoteUrl.searchParams.set('slippageBps', args.slippageBps.toString());
  if (args.onlyDirectRoutes) quoteUrl.searchParams.set('onlyDirectRoutes', 'true');

  const quoteRes = await fetch(quoteUrl.toString());
  if (!quoteRes.ok) {
    const text = await quoteRes.text();
    throw new Error(`jupiter_quote_failed: ${quoteRes.status} ${text}`);
  }
  const quote = await quoteRes.json();

  // Step 2: Get swap instructions (not a full transaction — we embed in Squads proposal)
  const swapRes = await fetch(`${JUPITER_API}/swap-instructions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: args.vaultPda.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });
  if (!swapRes.ok) {
    const text = await swapRes.text();
    throw new Error(`jupiter_swap_instructions_failed: ${swapRes.status} ${text}`);
  }
  const swapData = await swapRes.json();

  if (swapData.error) {
    throw new Error(`jupiter_swap_error: ${swapData.error}`);
  }

  return {
    setupInstructions: (swapData.setupInstructions || []).map(toTransactionInstruction),
    swapInstruction: toTransactionInstruction(swapData.swapInstruction),
    cleanupInstruction: swapData.cleanupInstruction
      ? toTransactionInstruction(swapData.cleanupInstruction)
      : undefined,
    addressLookupTableAddresses: swapData.addressLookupTableAddresses || [],
    expectedOutUsdc: BigInt(quote.outAmount),
  };
}

// ---------------------------------------------------------------------------
// Exchange instruction builder
// ---------------------------------------------------------------------------

/**
 * Build the Anchor `exchange` instruction for the marketplace escrow program.
 * Account order matches the IDL: taker, escrow, mint_a, mint_b, taker_funds_ata,
 * wsol_vault, token_program, associated_token_program, system_program.
 */
function buildExchangeIx(args: {
  vaultPda: PublicKey;
  escrowPda: PublicKey;
  mintA: PublicKey; // funds mint (USDC)
  mintB: PublicKey; // NFT mint
}): TransactionInstruction {
  const programId = getProgramId();

  // taker_funds_ata: vault's ATA for USDC (the funds token)
  const takerFundsAta = getAssociatedTokenAddressSync(args.mintA, args.vaultPda, true);

  // wsol_vault: escrow PDA's ATA for USDC (where funds go when exchange happens)
  const wsolVault = getAssociatedTokenAddressSync(args.mintA, args.escrowPda, true);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.vaultPda, isSigner: true, isWritable: true }, // taker
      { pubkey: args.escrowPda, isSigner: false, isWritable: true }, // escrow
      { pubkey: args.mintA, isSigner: false, isWritable: false }, // mint_a (USDC)
      { pubkey: args.mintB, isSigner: false, isWritable: false }, // mint_b (NFT)
      { pubkey: takerFundsAta, isSigner: false, isWritable: true }, // taker_funds_ata
      { pubkey: wsolVault, isSigner: false, isWritable: true }, // wsol_vault
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false }, // system_program
    ],
    data: EXCHANGE_DISCRIMINATOR,
  });
}

// ---------------------------------------------------------------------------
// Squads proposal helpers
// ---------------------------------------------------------------------------

interface VaultProposalResult {
  success: boolean;
  transactionIndex: number;
  txSignature?: string;
  deepLink?: string;
  error?: string;
}

/**
 * Create a Squads vault transaction proposal wrapping arbitrary inner instructions.
 * Reuses the pattern from squadsTransferService.buildMultiTransferProposal.
 */
async function createVaultProposal(
  connection: Connection,
  innerInstructions: TransactionInstruction[],
  opts: {
    multisigPda: PublicKey;
    vaultIndex: number;
    vaultPda: PublicKey;
    autoApprove: boolean;
  }
): Promise<VaultProposalResult> {
  const { readFileSync } = await import('fs');

  // Load payer keypair (same as squadsTransferService)
  const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
  const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
  if (!path && !json) {
    throw new Error('Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env');
  }
  const { Keypair } = await import('@solana/web3.js');
  const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));

  // Get next transaction index
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    opts.multisigPda
  );
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

  const { blockhash } = await connection.getLatestBlockhash();

  // Build inner vault message
  const vaultMessage = new TransactionMessage({
    payerKey: opts.vaultPda,
    recentBlockhash: blockhash,
    instructions: innerInstructions,
  });

  // Step 1: Create vault transaction
  const vaultTxCreateIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: opts.multisigPda,
    creator: payer.publicKey,
    transactionIndex,
    vaultIndex: opts.vaultIndex,
    ephemeralSigners: 0,
    transactionMessage: vaultMessage,
    rentPayer: payer.publicKey,
  });

  // Step 2: Create proposal
  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda: opts.multisigPda,
    creator: payer.publicKey,
    transactionIndex,
    isDraft: false,
    rentPayer: payer.publicKey,
  });

  const instructions = [vaultTxCreateIx, proposalCreateIx];

  // Step 3: Auto-approve if enabled
  if (opts.autoApprove) {
    instructions.push(
      multisig.instructions.proposalApprove({
        multisigPda: opts.multisigPda,
        member: payer.publicKey,
        transactionIndex,
      })
    );
  }

  // Build, sign, and send with retry logic
  const signature = await sendWithRetry(connection, instructions, payer, {
    commitment: 'confirmed',
  });

  const deepLink = `https://v4.squads.so/squads/${opts.multisigPda.toBase58()}/tx/${transactionIndex.toString()}`;

  return {
    success: true,
    transactionIndex: Number(transactionIndex),
    txSignature: signature,
    deepLink,
  };
}

// ---------------------------------------------------------------------------
// Escrow on-chain account reader
// ---------------------------------------------------------------------------

interface EscrowAccountData {
  salePrice: bigint;
  mintA: PublicKey;
  mintB: PublicKey;
  buyer: PublicKey;
  isCompleted: boolean;
  initializer: PublicKey;
}

/**
 * Deserialize an on-chain Escrow account.
 * Layout: 8 (discriminator) + 8 (seed) + 1 (bump) + 32 (initializer)
 *   + 32 (luxhub_wallet) + 32 (mint_a) + 32 (mint_b) + 8 (initializer_amount)
 *   + 8 (taker_amount) + 4+N (file_cid string) + 8 (sale_price) + 1 (is_completed) + 32 (buyer)
 */
async function fetchEscrowAccount(
  connection: Connection,
  escrowPda: PublicKey
): Promise<EscrowAccountData> {
  const info = await connection.getAccountInfo(escrowPda);
  if (!info) throw new Error(`escrow_account_not_found: ${escrowPda.toBase58()}`);

  const data = info.data;
  let offset = 8; // skip Anchor discriminator

  // seed: u64 (8 bytes)
  offset += 8;
  // bump: u8 (1 byte)
  offset += 1;
  // initializer: Pubkey (32 bytes)
  const initializer = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  // luxhub_wallet: Pubkey (32 bytes)
  offset += 32;
  // mint_a: Pubkey (32 bytes)
  const mintA = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  // mint_b: Pubkey (32 bytes)
  const mintB = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  // initializer_amount: u64 (8 bytes)
  offset += 8;
  // taker_amount: u64 (8 bytes)
  offset += 8;
  // file_cid: String (4 bytes length prefix + N bytes)
  const cidLen = data.readUInt32LE(offset);
  offset += 4 + cidLen;
  // sale_price: u64 (8 bytes)
  const salePrice = data.readBigUInt64LE(offset);
  offset += 8;
  // is_completed: bool (1 byte)
  const isCompleted = data[offset] !== 0;
  offset += 1;
  // buyer: Pubkey (32 bytes)
  const buyer = new PublicKey(data.subarray(offset, offset + 32));

  return { salePrice, mintA, mintB, buyer, isCompleted, initializer };
}

// ---------------------------------------------------------------------------
// Bridge pattern builders
// ---------------------------------------------------------------------------

async function buildSingleProposal(
  connection: Connection,
  vaultPda: PublicKey,
  jupiterIxs: JupiterSwapResult,
  exchangeIx: TransactionInstruction,
  msigPk: PublicKey,
  vaultIndex: number,
  autoApprove: boolean
): Promise<BridgeResult> {
  const USDC_MINT = getUsdcMint();
  const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

  const inner: TransactionInstruction[] = [];

  // 1. Idempotent create vault USDC ATA
  inner.push(
    createAssociatedTokenAccountIdempotentInstruction(
      vaultPda, // payer
      vaultUsdcAta,
      vaultPda, // owner
      USDC_MINT
    )
  );

  // 2. Jupiter setup + swap + cleanup
  inner.push(...jupiterIxs.setupInstructions);
  inner.push(jupiterIxs.swapInstruction);
  if (jupiterIxs.cleanupInstruction) inner.push(jupiterIxs.cleanupInstruction);

  // 3. Exchange ix
  inner.push(exchangeIx);

  const result = await createVaultProposal(connection, inner, {
    multisigPda: msigPk,
    vaultIndex,
    vaultPda,
    autoApprove,
  });

  return {
    success: result.success,
    pattern: 'single_proposal',
    proposals: [
      {
        index: result.transactionIndex,
        txSignature: result.txSignature,
        kind: 'swap_and_exchange',
        deepLink: result.deepLink,
      },
    ],
  };
}

async function buildTwoProposals(
  connection: Connection,
  vaultPda: PublicKey,
  jupiterIxs: JupiterSwapResult,
  exchangeIx: TransactionInstruction,
  msigPk: PublicKey,
  vaultIndex: number,
  autoApprove: boolean
): Promise<BridgeResult> {
  const USDC_MINT = getUsdcMint();
  const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

  // Proposal A: swap only
  const swapInner: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      vaultPda,
      vaultUsdcAta,
      vaultPda,
      USDC_MINT
    ),
    ...jupiterIxs.setupInstructions,
    jupiterIxs.swapInstruction,
  ];
  if (jupiterIxs.cleanupInstruction) swapInner.push(jupiterIxs.cleanupInstruction);

  const swapResult = await createVaultProposal(connection, swapInner, {
    multisigPda: msigPk,
    vaultIndex,
    vaultPda,
    autoApprove,
  });

  if (!swapResult.success) {
    return {
      success: false,
      pattern: 'two_proposal',
      proposals: [
        {
          index: swapResult.transactionIndex,
          txSignature: swapResult.txSignature,
          kind: 'swap',
          deepLink: swapResult.deepLink,
        },
      ],
      error: `swap_proposal_failed: ${swapResult.error}`,
    };
  }

  // Proposal B: exchange only
  const exchangeResult = await createVaultProposal(connection, [exchangeIx], {
    multisigPda: msigPk,
    vaultIndex,
    vaultPda,
    autoApprove,
  });

  return {
    success: exchangeResult.success,
    pattern: 'two_proposal',
    proposals: [
      {
        index: swapResult.transactionIndex,
        txSignature: swapResult.txSignature,
        kind: 'swap',
        deepLink: swapResult.deepLink,
      },
      {
        index: exchangeResult.transactionIndex,
        txSignature: exchangeResult.txSignature,
        kind: 'exchange',
        deepLink: exchangeResult.deepLink,
      },
    ],
    error: exchangeResult.success ? undefined : `exchange_proposal_failed: ${exchangeResult.error}`,
  };
}

// ---------------------------------------------------------------------------
// Tx size measurement (for auto pattern selection)
// ---------------------------------------------------------------------------

function estimateOuterTxSize(innerIxCount: number, totalAccountKeys: number): number {
  // Rough estimate: each account key = 32 bytes, each ix = ~10 bytes overhead + data
  // Squads wrapper adds ~200 bytes (vault tx create + proposal create + approve)
  // v0 transaction header = ~100 bytes
  // This is a conservative estimate; actual measurement would require serialization
  const BASE_SIZE = 300; // Squads wrapper + tx header
  const PER_ACCOUNT = 32;
  const PER_IX_OVERHEAD = 12;
  return BASE_SIZE + totalAccountKeys * PER_ACCOUNT + innerIxCount * PER_IX_OVERHEAD;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function bridgeToEscrow(params: BridgeParams): Promise<BridgeResult> {
  // Dynamic import to avoid pulling Mongoose into client bundles
  const { Pool } = await import('@/lib/models/Pool');
  const dbConnect = (await import('@/lib/database/mongodb')).default;
  await dbConnect();

  const pool = await Pool.findById(params.poolId);
  if (!pool) throw new Error('pool_not_found');

  // Gate: pool must be in graduated state
  if (pool.tokenStatus !== 'graduated') {
    throw new Error(`bridge_requires_graduated_state (current: ${pool.tokenStatus})`);
  }

  // Gate: must have a backing escrow
  if (!pool.backingEscrowPda) {
    throw new Error('no_backing_escrow');
  }

  // Gate: must have accumulated fees
  if (!pool.accumulatedFeesLamports || pool.accumulatedFeesLamports <= 0) {
    throw new Error('nothing_to_bridge');
  }

  const connection = getConnection();
  const escrowPda = new PublicKey(pool.backingEscrowPda);

  // Read on-chain escrow to get sale_price, mint_a, mint_b
  const escrowAcct = await fetchEscrowAccount(connection, escrowPda);

  if (escrowAcct.isCompleted) {
    throw new Error('escrow_already_completed');
  }

  // Verify buyer is default (unoccupied) — exchange requires this
  const DEFAULT_PUBKEY = new PublicKey('11111111111111111111111111111111');
  if (!escrowAcct.buyer.equals(DEFAULT_PUBKEY)) {
    throw new Error('escrow_already_has_buyer');
  }

  const salePriceUsdcUnits = escrowAcct.salePrice; // USDC 6-decimal base units

  // Compute how much SOL we need to swap for the sale price
  const solUsdRate = await getSolUsdRate();
  if (solUsdRate <= 0) throw new Error('sol_price_unavailable');

  const salePriceUsd = Number(salePriceUsdcUnits) / 1_000_000;
  const solAmountNeeded = BigInt(
    Math.ceil((salePriceUsd / solUsdRate) * 1_000_000_000)
  );

  // Add slippage buffer
  const bufferBps = pool.slippageBufferBps || 200;
  const solAmountWithBuffer = (solAmountNeeded * BigInt(10000 + bufferBps)) / 10000n;

  // Validate sufficient accumulated fees
  if (BigInt(pool.accumulatedFeesLamports) < solAmountWithBuffer) {
    throw new Error(
      `insufficient_fees_for_bridge (have: ${pool.accumulatedFeesLamports} lamports, need: ${solAmountWithBuffer.toString()} lamports)`
    );
  }

  // Get Squads vault PDA (TREASURY_POOLS = vault index 1)
  const msigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;
  if (!msigPda) throw new Error('Missing NEXT_PUBLIC_SQUADS_MSIG configuration');
  const msigPk = new PublicKey(msigPda);
  const VAULT_INDEX = 1; // Pools treasury vault
  const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: VAULT_INDEX });

  // Fetch Jupiter swap instructions
  const slippageBps = params.options?.slippageBps ?? 200;
  const onlyDirectRoutes = params.options?.onlyDirectRoutes ?? true;

  const jupiterIxs = await fetchJupiterSwapIxs({
    vaultPda,
    solAmountLamports: solAmountWithBuffer,
    slippageBps,
    onlyDirectRoutes,
  });

  // Assert expected USDC output covers the sale price
  if (jupiterIxs.expectedOutUsdc < salePriceUsdcUnits) {
    throw new Error(
      `jupiter_quote_insufficient (got ${jupiterIxs.expectedOutUsdc.toString()} USDC units, need ${salePriceUsdcUnits.toString()})`
    );
  }

  // Build the exchange instruction
  const exchangeIx = buildExchangeIx({
    vaultPda,
    escrowPda,
    mintA: escrowAcct.mintA,
    mintB: escrowAcct.mintB,
  });

  // Choose bridge pattern
  const BRIDGE_PATTERN = process.env.BRIDGE_PATTERN || 'auto';
  const autoApprove = params.options?.autoApprove ?? getSquadsAutoApprove();

  let result: BridgeResult;

  if (BRIDGE_PATTERN === 'two_proposal') {
    result = await buildTwoProposals(
      connection,
      vaultPda,
      jupiterIxs,
      exchangeIx,
      msigPk,
      VAULT_INDEX,
      autoApprove
    );
  } else {
    // 'auto' or 'single_v0': attempt single-proposal, fall back if too large
    // Wave 0.4 finding: v0+ALT = 798 bytes inner, ~950-1050 with wrapper — fits
    const totalIxCount =
      1 + // ATA create
      jupiterIxs.setupInstructions.length +
      1 + // swap
      (jupiterIxs.cleanupInstruction ? 1 : 0) +
      1; // exchange

    // Count unique account keys across all instructions (rough estimate)
    const allKeys = new Set<string>();
    const allIxs = [
      exchangeIx,
      jupiterIxs.swapInstruction,
      ...jupiterIxs.setupInstructions,
    ];
    if (jupiterIxs.cleanupInstruction) allIxs.push(jupiterIxs.cleanupInstruction);
    for (const ix of allIxs) {
      ix.keys.forEach((k) => allKeys.add(k.pubkey.toBase58()));
      allKeys.add(ix.programId.toBase58());
    }

    const estimatedSize = estimateOuterTxSize(totalIxCount, allKeys.size);

    if (BRIDGE_PATTERN === 'single_v0' || estimatedSize <= 1100) {
      result = await buildSingleProposal(
        connection,
        vaultPda,
        jupiterIxs,
        exchangeIx,
        msigPk,
        VAULT_INDEX,
        autoApprove
      );
    } else {
      console.warn(
        `[poolBridge] Estimated outer tx size ${estimatedSize} > 1100 bytes, falling back to two-proposal`
      );
      result = await buildTwoProposals(
        connection,
        vaultPda,
        jupiterIxs,
        exchangeIx,
        msigPk,
        VAULT_INDEX,
        autoApprove
      );
    }
  }

  // Attach metadata for audit
  result.expectedUsdcOut = jupiterIxs.expectedOutUsdc.toString();
  result.solAmountUsed = solAmountWithBuffer.toString();

  return result;
}

// Re-export for testing
export {
  fetchJupiterSwapIxs as _fetchJupiterSwapIxs,
  buildExchangeIx as _buildExchangeIx,
  fetchEscrowAccount as _fetchEscrowAccount,
  createVaultProposal as _createVaultProposal,
};
