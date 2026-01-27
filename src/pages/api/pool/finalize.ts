// src/pages/api/pool/finalize.ts
// Finalize a graduated pool: create Squad DAO from top token holders
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';
import { getTopTokenHolders } from '../../../lib/services/heliusService';
import { createPoolSquad, transferNftToSquadVault } from '../../../lib/services/squadService';

interface FinalizeRequest {
  poolId: string;
  adminWallet: string;
  thresholdPercent?: number; // Override default 60%
  skipNftTransfer?: boolean; // Skip NFT transfer if not ready
}

// Admin wallets
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      adminWallet,
      thresholdPercent = 60,
      skipNftTransfer = false,
    } = req.body as FinalizeRequest;

    // Validation
    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    await dbConnect();

    // Verify admin privileges
    const adminUser = await User.findOne({ wallet: adminWallet });
    const isAdmin = adminUser?.role === 'admin' || ADMIN_WALLETS.includes(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find the pool
    const pool = await Pool.findById(poolId).populate('selectedAssetId');
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check if pool has graduated
    if (!pool.graduated) {
      return res.status(400).json({
        error: 'Pool has not graduated yet. Wait for TOKEN_GRADUATED webhook.',
        status: pool.status,
        graduated: pool.graduated,
      });
    }

    // Check if Squad already created
    if (pool.squadMultisigPda) {
      return res.status(400).json({
        error: 'Squad already created for this pool',
        squadMultisigPda: pool.squadMultisigPda,
        squadVaultPda: pool.squadVaultPda,
      });
    }

    // Check if pool has a token
    if (!pool.bagsTokenMint) {
      return res.status(400).json({
        error: 'Pool does not have a token mint',
      });
    }

    // Step 1: Fetch top token holders from Helius
    console.log(`[finalize] Fetching top holders for ${pool.bagsTokenMint}...`);
    const holders = await getTopTokenHolders(pool.bagsTokenMint, 100);

    if (holders.length < 2) {
      return res.status(400).json({
        error: 'Not enough token holders to create a Squad (minimum 2)',
        holdersFound: holders.length,
      });
    }

    // Step 2: Create Squad DAO from top holders
    console.log(`[finalize] Creating Squad with ${holders.length} members...`);
    const squadMembers = holders.map((h) => ({
      wallet: h.wallet,
      tokenBalance: h.balance,
      ownershipPercent: h.ownershipPercent,
      permissions: 1,
    }));

    const squadResult = await createPoolSquad(poolId, squadMembers, thresholdPercent);

    // Step 3: Optionally transfer NFT to Squad vault
    let nftTransferResult = null;
    if (!skipNftTransfer && pool.fractionalMint) {
      console.log(`[finalize] Initiating NFT transfer to Squad vault...`);
      // Note: This requires LuxHub custody wallet to sign
      // For now, we prepare the transfer data
      nftTransferResult = await transferNftToSquadVault(
        pool.fractionalMint,
        process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
        squadResult.vaultPda
      );
    }

    // Step 4: Update pool with Squad info
    const updateData: Record<string, unknown> = {
      squadMultisigPda: squadResult.multisigPda,
      squadVaultPda: squadResult.vaultPda,
      squadThreshold: squadResult.threshold,
      squadMembers: squadResult.members.map((m) => ({
        wallet: m.wallet,
        tokenBalance: m.tokenBalance,
        ownershipPercent: m.ownershipPercent,
        joinedAt: new Date(),
        permissions: m.permissions,
      })),
      squadCreatedAt: new Date(),
      status: 'graduated',
    };

    if (nftTransferResult && nftTransferResult.signature !== 'pending') {
      updateData.nftTransferredToSquad = true;
      updateData.nftTransferTx = nftTransferResult.signature;
    }

    await Pool.findByIdAndUpdate(poolId, { $set: updateData });

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        status: 'graduated',
      },
      squad: {
        multisigPda: squadResult.multisigPda,
        vaultPda: squadResult.vaultPda,
        threshold: squadResult.threshold,
        memberCount: squadResult.members.length,
        createSignature: squadResult.signature,
        squadsLink: `https://v4.squads.so/squads/${squadResult.multisigPda}`,
      },
      nftTransfer: nftTransferResult
        ? {
            status: nftTransferResult.signature === 'pending' ? 'pending' : 'completed',
            signature: nftTransferResult.signature,
            vault: nftTransferResult.toVault,
          }
        : { status: 'skipped' },
      topHolders: holders.slice(0, 10).map((h) => ({
        wallet: h.wallet.slice(0, 8) + '...',
        ownershipPercent: h.ownershipPercent.toFixed(2) + '%',
      })),
      message: 'Pool finalized! Squad DAO created with top token holders.',
      nextSteps: [
        'Token holders can now vote on governance proposals',
        'Squad manages the physical asset custody',
        'Members can propose to relist for sale or accept offers',
        `View Squad at: https://v4.squads.so/squads/${squadResult.multisigPda}`,
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/finalize] Error:', error);
    return res.status(500).json({
      error: 'Failed to finalize pool',
      details: error?.message || 'Unknown error',
    });
  }
}
