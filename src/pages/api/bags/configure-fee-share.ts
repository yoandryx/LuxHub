// src/pages/api/bags/configure-fee-share.ts
// Configure fee share for automatic royalty routing via Bags API
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';

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
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
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
        basisPoints: 300, // 3% total (split: 1% platform, 1% holders, 0.5% vendor, 0.5% trade rewards)
        label: 'LuxHub Treasury (split internally)',
      },
    ];

    const finalFeeClaimers = feeClaimers || defaultFeeClaimers;

    // Validate basis points
    const totalBasisPoints = finalFeeClaimers.reduce((sum, f) => sum + f.basisPoints, 0);
    if (totalBasisPoints === 0) {
      return res.status(400).json({
        error: 'Total fee basis points must be greater than 0',
        totalBasisPoints,
      });
    }
    if (totalBasisPoints > 10000) {
      return res.status(400).json({
        error: 'Total fee basis points cannot exceed 10000 (100%)',
        totalBasisPoints,
      });
    }
    // Validate individual claimers have positive values
    const invalidClaimer = finalFeeClaimers.find((f) => f.basisPoints <= 0);
    if (invalidClaimer) {
      return res.status(400).json({
        error: 'Each fee claimer must have basisPoints > 0',
        invalidWallet: invalidClaimer.wallet,
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

/**
 * Internal helper — configure fee share for a pool without going through HTTP.
 * Called by create-pool-token after token creation.
 */
export async function configureFeeShareInternal(
  poolId: string,
  tokenMint: string,
  adminWallet: string
): Promise<{ success: boolean; configId?: string; transaction?: any; error?: string }> {
  const bagsApiKey = process.env.BAGS_API_KEY;
  const treasury = LUXHUB_TREASURY;
  if (!bagsApiKey || !treasury) {
    return { success: false, error: 'Missing BAGS_API_KEY or LUXHUB_WALLET' };
  }

  const feeClaimers = [{ wallet: treasury, basisPoints: 300 }]; // 3% to LuxHub (split internally: 1% ops, 1% holders, 0.5% vendor, 0.5% trade rewards)

  try {
    const feeShareResponse = await fetch(
      `${BAGS_API_BASE}/fee-share/create-fee-share-config-v2-transaction`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagsApiKey,
        },
        body: JSON.stringify({
          mint: tokenMint,
          payer: adminWallet,
          feeClaimers,
        }),
      }
    );

    if (!feeShareResponse.ok) {
      const errorData = await feeShareResponse.json().catch(() => ({}));
      return { success: false, error: JSON.stringify(errorData) };
    }

    const result = await feeShareResponse.json();
    const configId = result.configId || result.id;

    // Update pool
    await Pool.findByIdAndUpdate(poolId, {
      $set: { bagsFeeShareConfigId: configId },
    });

    return { success: true, configId, transaction: result.transaction };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
