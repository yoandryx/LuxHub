// src/pages/api/pool/list-for-resale.ts
// LuxHub lists pool asset for resale after taking custody
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';

interface ListForResaleRequest {
  poolId: string;
  adminWallet: string;
  resaleListingPrice: number; // In lamports
  resaleListingPriceUSD: number;
}

// Admin wallets
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminWallet, resaleListingPrice, resaleListingPriceUSD } =
      req.body as ListForResaleRequest;

    // Validation
    if (!poolId || !adminWallet || !resaleListingPrice || !resaleListingPriceUSD) {
      return res.status(400).json({
        error:
          'Missing required fields: poolId, adminWallet, resaleListingPrice, resaleListingPriceUSD',
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

    // Check pool status - must be in active custody
    if (pool.status !== 'active') {
      return res.status(400).json({
        error: `Pool must be in 'active' status (LuxHub custody) to list for resale. Current status: ${pool.status}`,
      });
    }

    // Check custody status
    if (pool.custodyStatus !== 'stored') {
      return res.status(400).json({
        error: `Asset must be verified and stored before listing. Current custody status: ${pool.custodyStatus}`,
      });
    }

    // Calculate potential investor returns
    const totalInvested = pool.targetAmountUSD;
    const royaltyAmount = resaleListingPriceUSD * 0.03;
    const distributionPool = resaleListingPriceUSD * 0.97;
    const potentialProfit = distributionPool - totalInvested;
    const potentialROI = totalInvested > 0 ? (distributionPool / totalInvested - 1) * 100 : 0;

    // Update pool
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        status: 'listed',
        resaleListingPrice,
        resaleListingPriceUSD,
        resaleListedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      listing: {
        resaleListingPrice,
        resaleListingPriceUSD,
        resaleListedAt: new Date(),
      },
      projectedReturns: {
        listingPrice: resaleListingPriceUSD,
        royaltyAmount,
        distributionPool,
        totalInvested,
        potentialProfit,
        potentialROI: `${potentialROI.toFixed(2)}%`,
      },
      pool: {
        _id: pool._id,
        status: 'listed',
        previousStatus: 'active',
      },
      message: 'Pool asset listed for resale. Awaiting buyer.',
      nextSteps: [
        'Asset is now visible on marketplace',
        'Buyers can purchase at listed price',
        'When sold, distribution will be calculated and proposed via Squads',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/list-for-resale] Error:', error);
    return res.status(500).json({
      error: 'Failed to list for resale',
      details: error?.message || 'Unknown error',
    });
  }
}
