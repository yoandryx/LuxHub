// src/pages/api/pool/list-resale.ts
// Phase 11-10: List resale endpoint.
//
// Admin-gated endpoint that creates a new marketplace escrow listing for the
// pool-backed NFT held in the Squads vault NFT ATA. Reuses the existing
// marketplace escrow `initialize` flow via a Squads vault proposal.
// Advances pool state `custody -> resale_listed` via poolStateTransition.
//
// Route: POST /api/pool/list-resale?poolId=xxx
// Body: { resalePriceUsdc: number, resaleDescription?: string }
// Auth: Admin wallet via x-wallet-address header

import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import { getAdminConfig } from '@/lib/config/adminConfig';
import { getTreasury } from '@/lib/config/treasuryConfig';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { Escrow } from '@/lib/models/Escrow';
import { transitionPoolState } from '@/lib/services/poolStateTransition';
import { getConnection, getClusterConfig } from '@/lib/solana/clusterConfig';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a deterministic u64 seed from a pool's MongoDB _id.
 * Uses first 8 bytes of SHA-256 hash, read as little-endian u64.
 */
export function deriveSeedFromPoolId(poolId: string): bigint {
  const hash = createHash('sha256').update(`pool-resale:${poolId}`).digest();
  // Read first 8 bytes as little-endian u64
  let seed = BigInt(0);
  for (let i = 0; i < 8; i++) {
    seed |= BigInt(hash[i]) << BigInt(i * 8);
  }
  return seed;
}

/**
 * Derive the escrow PDA from a seed, matching the Anchor program's
 * seeds = [ESCROW_SEED, &seed.to_le_bytes()[..]]
 */
export function deriveEscrowPda(seed: bigint): PublicKey {
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  // Write seed as little-endian u64 without depending on BN
  const seedBuf = Buffer.alloc(8);
  let n = seed;
  for (let i = 0; i < 8; i++) {
    seedBuf[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('state'), seedBuf],
    programId
  );
  return pda;
}

/**
 * Build the Anchor `initialize` instruction data buffer.
 * Matches the instruction: initialize(seed, initializer_amount, taker_amount, file_cid, sale_price)
 */
function buildInitializeData(params: {
  seed: bigint;
  initializerAmount: bigint;
  takerAmount: bigint;
  fileCid: string;
  salePrice: bigint;
}): Buffer {
  const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
  const seedBn = new BN(params.seed.toString());
  const seedBuffer = seedBn.toArrayLike(Buffer, 'le', 8);
  const initializerAmountBuf = new BN(params.initializerAmount.toString()).toArrayLike(Buffer, 'le', 8);
  const takerAmountBuf = new BN(params.takerAmount.toString()).toArrayLike(Buffer, 'le', 8);

  const cidBytes = Buffer.from(params.fileCid, 'utf8');
  const cidLenBuf = Buffer.alloc(4);
  cidLenBuf.writeUInt32LE(cidBytes.length, 0);

  const salePriceBuf = new BN(params.salePrice.toString()).toArrayLike(Buffer, 'le', 8);

  return Buffer.concat([
    discriminator,
    seedBuffer,
    initializerAmountBuf,
    takerAmountBuf,
    cidLenBuf,
    cidBytes,
    salePriceBuf,
  ]);
}

/**
 * Resolve NFT mint for a pool (same pattern as confirm-custody).
 */
async function resolveNftMint(pool: any): Promise<string | null> {
  if (pool.nftMint) return pool.nftMint;

  if (pool.selectedAssetId) {
    try {
      const { Asset } = await import('@/lib/models/Assets');
      const asset = await Asset.findById(pool.selectedAssetId).select('nftMint').lean() as any;
      if (asset?.nftMint) return asset.nftMint;
    } catch {
      // fall through
    }
  }

  if (pool.escrowId) {
    try {
      const { Escrow: EscrowModel } = await import('@/lib/models/Escrow');
      const escrow = await EscrowModel.findById(pool.escrowId).select('nftMint').lean() as any;
      if (escrow?.nftMint) return escrow.nftMint;
    } catch {
      // fall through
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin auth -- getAdminConfig().isAdmin() pattern (11-08, 11-09)
  const wallet =
    (req.headers['x-wallet-address'] as string) ||
    req.body?.wallet ||
    (req.query.wallet as string);

  if (!wallet) {
    return res.status(401).json({ error: 'Missing wallet for admin authentication' });
  }

  const adminConfig = getAdminConfig();
  if (!adminConfig.isAdmin(wallet)) {
    return res.status(401).json({ error: 'Unauthorized: admin wallet required' });
  }

  // Pool ID from query or body
  const poolId = (req.query.poolId as string) || req.body?.poolId;
  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'invalid_pool_id' });
  }

  // Validate resale price
  const { resalePriceUsdc, resaleDescription } = req.body || {};
  if (typeof resalePriceUsdc !== 'number' || resalePriceUsdc <= 0) {
    return res.status(400).json({ error: 'invalid_resale_price' });
  }

  await dbConnect();

  const pool = await Pool.findById(poolId);
  if (!pool) {
    return res.status(404).json({ error: 'pool_not_found' });
  }

  if ((pool as any).tokenStatus !== 'custody') {
    return res.status(400).json({
      error: 'wrong_state',
      current: (pool as any).tokenStatus,
      expected: 'custody',
    });
  }

  // Resolve NFT mint
  const nftMint = await resolveNftMint(pool);
  if (!nftMint) {
    return res.status(400).json({ error: 'no_nft_mint_resolvable' });
  }

  // Squads vault PDA (marketplace vault, index 0) -- the seller of the resale
  const msigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;
  if (!msigPda) {
    return res.status(500).json({ error: 'Missing NEXT_PUBLIC_SQUADS_MSIG configuration' });
  }
  const msigPk = new PublicKey(msigPda);
  const vaultIndex = 0;
  const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: vaultIndex });

  // Derive deterministic seed and escrow PDA
  const seed = deriveSeedFromPoolId(poolId);
  const escrowPda = deriveEscrowPda(seed);

  // Convert USDC dollars to atomic units (6 decimals)
  const salePriceUsdcUnits = BigInt(Math.round(resalePriceUsdc * 1_000_000));

  // Build initialize instruction data
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  const nftMintPk = new PublicKey(nftMint);
  const usdcMint = new PublicKey(getClusterConfig().usdcMint);

  // The vault PDA holds the NFT (confirmed by 11-09 confirm-custody).
  // seller = vaultPda, seller_ata_b = vault's NFT ATA
  const sellerAtaB = getAssociatedTokenAddressSync(nftMintPk, vaultPda, true);
  const nftVault = getAssociatedTokenAddressSync(nftMintPk, escrowPda, true);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('luxhub-config')], programId);

  const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');

  // Use a placeholder CID for pool-backed resale listings
  const fileCid = `pool-resale:${poolId}`;

  const instructionData = buildInitializeData({
    seed,
    initializerAmount: BigInt(1), // NFT = 1
    takerAmount: salePriceUsdcUnits,
    fileCid,
    salePrice: salePriceUsdcUnits,
  });

  // Build account keys matching Initialize context:
  // admin, seller, config, mint_a, mint_b, seller_ata_b, escrow, nft_vault, wsol_vault,
  // token_program, associated_token_program, system_program
  //
  // For pool resale: admin = vaultPda (payer via Squads CPI), seller = vaultPda (owns NFT)
  const keys = [
    { pubkey: vaultPda.toBase58(), isSigner: true, isWritable: true },    // admin (Squads vault)
    { pubkey: vaultPda.toBase58(), isSigner: true, isWritable: true },    // seller (vault owns NFT)
    { pubkey: configPda.toBase58(), isSigner: false, isWritable: false }, // config
    { pubkey: usdcMint.toBase58(), isSigner: false, isWritable: false },  // mint_a (funds)
    { pubkey: nftMintPk.toBase58(), isSigner: false, isWritable: false }, // mint_b (NFT)
    { pubkey: sellerAtaB.toBase58(), isSigner: false, isWritable: true }, // seller_ata_b
    { pubkey: escrowPda.toBase58(), isSigner: false, isWritable: true },  // escrow
    { pubkey: nftVault.toBase58(), isSigner: false, isWritable: true },   // nft_vault
    { pubkey: usdcVault.toBase58(), isSigner: false, isWritable: true },  // wsol_vault (USDC)
    { pubkey: TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM.toBase58(), isSigner: false, isWritable: false },
  ];

  // Create Squads proposal via internal API
  const proposeResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/squads/propose`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': wallet, // Forward admin wallet for auth
      },
      body: JSON.stringify({
        programId: programId.toBase58(),
        keys,
        dataBase64: instructionData.toString('base64'),
        vaultIndex,
        autoApprove: true,
        rpc: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
        multisigPda: msigPda,
      }),
    }
  );

  const proposeResult = await proposeResponse.json();

  if (!proposeResponse.ok) {
    return res.status(500).json({
      error: 'proposal_failed',
      detail: proposeResult,
    });
  }

  // Create the Escrow DB record (matching existing marketplace escrow pattern)
  const escrowRecord = new Escrow({
    asset: (pool as any).selectedAssetId,
    sellerWallet: vaultPda.toBase58(),
    escrowPda: escrowPda.toBase58(),
    escrowSeed: Number(seed & BigInt(0x7FFFFFFF)), // Store truncated seed for reference
    nftMint,
    saleMode: 'fixed_price',
    listingPrice: Number(salePriceUsdcUnits),
    listingPriceUSD: resalePriceUsdc,
    paymentMint: 'USDC',
    acceptingOffers: false,
    status: 'initiated',
    convertedToPool: true, // Flag for pool-backed escrow
    poolId: (pool as any)._id,
    squadsTransactionIndex: proposeResult.transactionIndex,
    squadsProposedAt: new Date(),
  });

  await escrowRecord.save();

  // Transition state: custody -> resale_listed
  const transition = await transitionPoolState({
    poolId,
    fromState: 'custody',
    toState: 'resale_listed',
    reason: `listed for resale at ${resalePriceUsdc} USDC via escrow ${escrowPda.toBase58()}`,
    txContext: proposeResult.signature || proposeResult.transactionIndex,
  });

  if (!transition.success) {
    return res.status(409).json({ error: 'transition_failed', detail: transition.error });
  }

  // Save resale metadata on the pool
  await Pool.updateOne(
    { _id: poolId },
    {
      $set: {
        resaleEscrowId: escrowRecord._id,
        resaleListingPrice: Number(salePriceUsdcUnits),
        resaleListingPriceUSD: resalePriceUsdc,
        resaleListedAt: new Date(),
      },
    }
  );

  return res.status(200).json({
    success: true,
    resaleEscrowPda: escrowPda.toBase58(),
    resaleEscrowId: escrowRecord._id,
    salePriceUsdc: resalePriceUsdc,
    proposalTxSignature: proposeResult.signature,
    squadsDeepLink: proposeResult.squadsDeepLink,
    newState: 'resale_listed',
    memoTxSignature: transition.memoTxSignature,
  });
}

export default withErrorMonitoring(handler);
