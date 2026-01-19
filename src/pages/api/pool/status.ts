// src/pages/api/pool/status.ts
// Get pool status and details
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { Asset } from '../../../lib/models/Assets';

interface StatusQuery {
  poolId?: string;
  escrowPda?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, escrowPda } = req.query as StatusQuery;

    if (!poolId && !escrowPda) {
      return res.status(400).json({
        error: 'Either poolId or escrowPda is required',
      });
    }

    await dbConnect();

    // Find the pool
    const query: Record<string, any> = { deleted: { $ne: true } };
    if (poolId) {
      query._id = poolId;
    }
    if (escrowPda) {
      query.escrowPda = escrowPda;
    }

    const poolDoc = await Pool.findOne(query)
      .populate({
        path: 'selectedAssetId',
        select: 'model priceUSD imageIpfsUrls images description serial',
      })
      .populate({
        path: 'vendorId',
        select: 'businessName',
      })
      .lean();

    if (!poolDoc) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Type assertion for pool document
    const pool = poolDoc as any;

    // Calculate stats
    const totalInvested =
      pool.participants?.reduce((sum: number, p: any) => sum + (p.investedUSD || 0), 0) || 0;
    const uniqueInvestors = new Set(pool.participants?.map((p: any) => p.wallet) || []).size;
    const percentFilled =
      pool.totalShares > 0 ? ((pool.sharesSold / pool.totalShares) * 100).toFixed(2) : '0';

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        escrowPda: pool.escrowPda,

        // Asset info
        asset: pool.selectedAssetId
          ? {
              _id: (pool.selectedAssetId as any)._id,
              model: (pool.selectedAssetId as any).model,
              description: (pool.selectedAssetId as any).description,
              serial: (pool.selectedAssetId as any).serial,
              priceUSD: (pool.selectedAssetId as any).priceUSD,
              image:
                (pool.selectedAssetId as any).imageIpfsUrls?.[0] ||
                (pool.selectedAssetId as any).images?.[0],
            }
          : null,

        // Vendor info
        vendor: pool.vendorId
          ? {
              _id: (pool.vendorId as any)._id,
              businessName: (pool.vendorId as any).businessName,
            }
          : null,
        vendorWallet: pool.vendorWallet,

        // Pool configuration
        totalShares: pool.totalShares,
        sharesSold: pool.sharesSold,
        sharesRemaining: pool.totalShares - pool.sharesSold,
        sharePriceUSD: pool.sharePriceUSD,
        targetAmountUSD: pool.targetAmountUSD,
        minBuyInUSD: pool.minBuyInUSD,
        maxInvestors: pool.maxInvestors,
        projectedROI: pool.projectedROI,

        // Progress
        percentFilled,
        totalInvested,
        uniqueInvestors,

        // Status
        status: pool.status,
        custodyStatus: pool.custodyStatus,
        distributionStatus: pool.distributionStatus,

        // Vendor payment
        vendorPaidAmount: pool.vendorPaidAmount,
        vendorPaidAt: pool.vendorPaidAt,

        // Custody
        custodyTrackingCarrier: pool.custodyTrackingCarrier,
        custodyTrackingNumber: pool.custodyTrackingNumber,
        custodyReceivedAt: pool.custodyReceivedAt,

        // Resale
        resaleListingPriceUSD: pool.resaleListingPriceUSD,
        resaleListedAt: pool.resaleListedAt,
        resaleSoldPriceUSD: pool.resaleSoldPriceUSD,
        resaleSoldAt: pool.resaleSoldAt,

        // Distribution
        distributionAmount: pool.distributionAmount,
        distributionRoyalty: pool.distributionRoyalty,
        distributionExecutedAt: pool.distributionExecutedAt,

        // Bags integration
        bagsTokenMint: pool.bagsTokenMint,

        // Timestamps
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
      },

      // Participant summary (without sensitive details)
      participants: {
        count: uniqueInvestors,
        totalShares: pool.sharesSold,
        topHolders:
          pool.participants
            ?.sort((a: any, b: any) => b.shares - a.shares)
            .slice(0, 5)
            .map((p: any) => ({
              wallet: `${p.wallet.slice(0, 4)}...${p.wallet.slice(-4)}`,
              shares: p.shares,
              ownershipPercent: `${p.ownershipPercent?.toFixed(2)}%`,
            })) || [],
      },

      // Lifecycle info
      lifecycle: getLifecycleInfo(pool),
    });
  } catch (error: any) {
    console.error('[/api/pool/status] Error:', error);
    return res.status(500).json({
      error: 'Failed to get pool status',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to get lifecycle info
function getLifecycleInfo(pool: any) {
  const stages = [
    { key: 'open', label: 'Accepting Investments', completed: true },
    {
      key: 'filled',
      label: 'Fully Funded',
      completed: [
        'filled',
        'funded',
        'custody',
        'active',
        'listed',
        'sold',
        'distributing',
        'distributed',
        'closed',
      ].includes(pool.status),
    },
    {
      key: 'funded',
      label: 'Vendor Paid',
      completed: [
        'funded',
        'custody',
        'active',
        'listed',
        'sold',
        'distributing',
        'distributed',
        'closed',
      ].includes(pool.status),
    },
    {
      key: 'custody',
      label: 'In LuxHub Custody',
      completed: ['active', 'listed', 'sold', 'distributing', 'distributed', 'closed'].includes(
        pool.status
      ),
    },
    {
      key: 'listed',
      label: 'Listed for Resale',
      completed: ['listed', 'sold', 'distributing', 'distributed', 'closed'].includes(pool.status),
    },
    {
      key: 'sold',
      label: 'Sold',
      completed: ['sold', 'distributing', 'distributed', 'closed'].includes(pool.status),
    },
    {
      key: 'distributed',
      label: 'Proceeds Distributed',
      completed: ['distributed', 'closed'].includes(pool.status),
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.key === pool.status);

  return {
    stages,
    currentStage: pool.status,
    currentStageIndex,
    nextStage: stages[currentStageIndex + 1]?.key || null,
    nextAction: getNextAction(pool.status),
  };
}

function getNextAction(status: string): string {
  const actions: Record<string, string> = {
    open: 'Waiting for investors to fill remaining shares',
    filled: 'Admin initiates vendor payment via Squads',
    funded: 'Vendor ships asset to LuxHub custody',
    custody: 'LuxHub verifies and stores the asset',
    active: 'LuxHub lists asset for resale',
    listed: 'Waiting for buyer to purchase',
    sold: 'Admin initiates investor distribution via Squads',
    distributing: 'Distribution in progress',
    distributed: 'Pool lifecycle complete',
    closed: 'Pool finalized',
  };
  return actions[status] || 'Unknown';
}
