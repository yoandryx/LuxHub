// src/pages/api/bags/configure-fee-share.ts
// Configure fee share for automatic royalty routing via Bags API
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';

interface ConfigureFeeShareRequest {
  poolId: string;
  adminWallet: string;
  feeClaimers?: Array<{
    wallet: string;
    basisPoints: number; // 100 = 1%, 300 = 3%
    label?: string;
  }>;
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

// Admin wallets
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

// Default LuxHub treasury wallet
const LUXHUB_TREASURY = process.env.NEXT_PUBLIC_LUXHUB_WALLET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminWallet, feeClaimers } = req.body as ConfigureFeeShareRequest;

    // Validation
    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({
        error: 'BAGS_API_KEY not configured',
      });
    }

    if (!LUXHUB_TREASURY) {
      return res.status(500).json({
        error: 'LUXHUB_WALLET not configured',
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
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check if pool has a token
    if (!pool.bagsTokenMint) {
      return res.status(400).json({
        error:
          'Pool does not have a Bags token. Create token first via /api/bags/create-pool-token',
      });
    }

    // Check if fee share already configured
    if (pool.bagsFeeShareConfigId) {
      return res.status(400).json({
        error: 'Fee share config already exists for this pool',
        bagsFeeShareConfigId: pool.bagsFeeShareConfigId,
      });
    }

    // Default fee configuration: 3% royalty to LuxHub treasury
    const defaultFeeClaimers = [
      {
        wallet: LUXHUB_TREASURY,
        basisPoints: 300, // 3%
        label: 'LuxHub Treasury',
      },
    ];

    const finalFeeClaimers = feeClaimers || defaultFeeClaimers;

    // Validate total basis points doesn't exceed 100%
    const totalBasisPoints = finalFeeClaimers.reduce((sum, f) => sum + f.basisPoints, 0);
    if (totalBasisPoints > 10000) {
      return res.status(400).json({
        error: 'Total fee basis points cannot exceed 10000 (100%)',
        totalBasisPoints,
      });
    }

    // Create fee share config via Bags API
    const feeShareResponse = await fetch(
      `${BAGS_API_BASE}/fee-share/create-fee-share-config-v2-transaction`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagsApiKey,
        },
        body: JSON.stringify({
          mint: pool.bagsTokenMint,
          payer: adminWallet,
          feeClaimers: finalFeeClaimers.map((f) => ({
            wallet: f.wallet,
            basisPoints: f.basisPoints,
          })),
        }),
      }
    );

    if (!feeShareResponse.ok) {
      const errorData = await feeShareResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to create fee share config via Bags API',
        details: errorData,
      });
    }

    const feeShareResult = await feeShareResponse.json();

    // Update pool with fee share config
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        bagsFeeShareConfigId: feeShareResult.configId || feeShareResult.id,
      },
    });

    return res.status(200).json({
      success: true,
      feeShareConfig: {
        configId: feeShareResult.configId || feeShareResult.id,
        mint: pool.bagsTokenMint,
        feeClaimers: finalFeeClaimers,
        totalBasisPoints,
        totalPercent: `${(totalBasisPoints / 100).toFixed(2)}%`,
      },
      pool: {
        _id: pool._id,
        bagsFeeShareConfigId: feeShareResult.configId || feeShareResult.id,
      },
      transaction: feeShareResult.transaction,
      message: 'Fee share configuration created. Transaction ready for signing.',
      note: 'Fees will be automatically routed to claimers on each trade.',
    });
  } catch (error: any) {
    console.error('[/api/bags/configure-fee-share] Error:', error);
    return res.status(500).json({
      error: 'Failed to configure fee share',
      details: error?.message || 'Unknown error',
    });
  }
}
