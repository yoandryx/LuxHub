// src/pages/api/pool/confirm-custody.ts
// Phase 11-09: Confirm custody endpoint.
//
// Admin-gated endpoint that verifies on-chain that the NFT has landed in the
// Squads vault's NFT ATA (as a consequence of confirm_delivery on the backing
// pool escrow) and transitions the pool state from graduated -> custody.
//
// This endpoint does NOT execute confirm_delivery itself -- it observes that
// confirm_delivery already ran and updates the pool's view accordingly.
//
// Route: POST /api/pool/confirm-custody?poolId=xxx
// Auth: Admin wallet via x-wallet-address header

import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import { getAdminConfig } from '@/lib/config/adminConfig';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { transitionPoolState } from '@/lib/services/poolStateTransition';
import { getConnection } from '@/lib/solana/clusterConfig';
import { getTreasury } from '@/lib/config/treasuryConfig';

// ---------------------------------------------------------------------------
// NFT mint resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the NFT mint address for a pool.
 * Checks pool fields, then falls back to the linked Asset or Escrow.
 */
async function resolveNftMint(pool: any): Promise<string | null> {
  // 1. Direct field on pool (future-proofing if nftMint gets added)
  if (pool.nftMint) return pool.nftMint;

  // 2. Look up via the linked Asset
  if (pool.selectedAssetId) {
    try {
      const { Asset } = await import('@/lib/models/Assets');
      const asset = await Asset.findById(pool.selectedAssetId).select('nftMint').lean() as any;
      if (asset?.nftMint) return asset.nftMint;
    } catch {
      // Model not available -- fall through
    }
  }

  // 3. Look up via the linked Escrow
  if (pool.escrowId) {
    try {
      const { Escrow } = await import('@/lib/models/Escrow');
      const escrow = await Escrow.findById(pool.escrowId).select('nftMint').lean() as any;
      if (escrow?.nftMint) return escrow.nftMint;
    } catch {
      // Model not available -- fall through
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

  // Admin auth -- follows graduate.ts pattern (getAdminConfig().isAdmin())
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
  const poolId =
    (req.query.poolId as string) || req.body?.poolId;

  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'invalid_pool_id' });
  }

  await dbConnect();

  const pool = await Pool.findById(poolId);
  if (!pool) {
    return res.status(404).json({ error: 'pool_not_found' });
  }

  if ((pool as any).tokenStatus !== 'graduated') {
    return res.status(400).json({
      error: 'wrong_state',
      current: (pool as any).tokenStatus,
      expected: 'graduated',
    });
  }

  // Resolve NFT mint
  const nftMint = await resolveNftMint(pool);
  if (!nftMint) {
    return res.status(400).json({ error: 'no_nft_mint_resolvable' });
  }

  // Squads vault PDA (pools treasury) per Revision 4
  const vaultPda = new PublicKey(getTreasury('pools'));
  const nftMintPk = new PublicKey(nftMint);
  const vaultNftAta = getAssociatedTokenAddressSync(nftMintPk, vaultPda, true);

  // Verify NFT is in the vault ATA on-chain
  const connection = getConnection();
  let holdsNft = false;
  try {
    const acct = await getAccount(connection, vaultNftAta);
    holdsNft = acct.amount > 0n && acct.mint.toBase58() === nftMint;
  } catch {
    // Account doesn't exist -- NFT not yet in custody
    holdsNft = false;
  }

  if (!holdsNft) {
    return res.status(400).json({
      error: 'nft_not_in_custody',
      vaultNftAta: vaultNftAta.toBase58(),
      message: 'confirm_delivery has not yet completed; NFT is not in the Squads vault NFT ATA',
    });
  }

  // Transition graduated -> custody
  const transition = await transitionPoolState({
    poolId,
    fromState: 'graduated',
    toState: 'custody',
    reason: `NFT verified in vault ATA ${vaultNftAta.toBase58()}`,
  });

  if (!transition.success) {
    return res.status(409).json({ error: 'transition_failed', detail: transition.error });
  }

  // Record the custody ATA and confirmation timestamp on the pool
  await Pool.updateOne(
    { _id: poolId },
    {
      $set: {
        custodyVaultPda: vaultPda.toBase58(),
        custodyConfirmedAt: new Date(),
      },
    }
  );

  return res.status(200).json({
    success: true,
    newState: 'custody',
    custodyVaultPda: vaultPda.toBase58(),
    memoTxSignature: transition.memoTxSignature,
  });
}

export default withErrorMonitoring(handler);
