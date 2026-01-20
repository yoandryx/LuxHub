// src/pages/api/pool/[id].ts
// Fetch a single pool by ID
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid pool ID' });
    }

    await dbConnect();

    const pool = await Pool.findOne({ _id: id, deleted: { $ne: true } })
      .populate({
        path: 'selectedAssetId',
        select: 'model serial brand priceUSD description imageUrl imageIpfsUrls images category',
      })
      .populate({
        path: 'vendorId',
        select: 'businessName username verified wallet',
      })
      .populate({
        path: 'escrowId',
        select: 'escrowPda status',
      })
      .populate({
        path: 'participants.user',
        select: 'wallet username',
      })
      .lean();

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Calculate funding progress
    const fundingProgress = pool.totalShares > 0 ? (pool.sharesSold / pool.totalShares) * 100 : 0;

    // Calculate time remaining (if pool has expiration)
    const daysRemaining = pool.expiresAt
      ? Math.max(
          0,
          Math.ceil((new Date(pool.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        )
      : null;

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        // Asset
        asset: pool.selectedAssetId,
        // Pool configuration
        status: pool.status,
        sourceType: pool.sourceType,
        totalShares: pool.totalShares,
        sharesSold: pool.sharesSold,
        sharePriceUSD: pool.sharePriceUSD,
        targetAmountUSD: pool.targetAmountUSD,
        minBuyInUSD: pool.minBuyInUSD,
        maxInvestors: pool.maxInvestors,
        projectedROI: pool.projectedROI,
        fundingProgress,
        daysRemaining,
        // Escrow link
        escrow: pool.escrowId,
        escrowPda: pool.escrowPda,
        // Vendor
        vendor: pool.vendorId,
        vendorWallet: pool.vendorWallet,
        vendorPaidAmount: pool.vendorPaidAmount,
        vendorPaidAt: pool.vendorPaidAt,
        // Participants
        participants: pool.participants?.map((p: any) => ({
          wallet: p.wallet,
          username: p.user?.username,
          shares: p.shares,
          ownershipPercent: p.ownershipPercent,
          investedUSD: p.investedUSD,
          projectedReturnUSD: p.projectedReturnUSD,
          investedAt: p.investedAt,
        })),
        investorCount: pool.participants?.length || 0,
        // Custody
        custodyStatus: pool.custodyStatus,
        custodyTrackingCarrier: pool.custodyTrackingCarrier,
        custodyTrackingNumber: pool.custodyTrackingNumber,
        custodyProofUrls: pool.custodyProofUrls,
        custodyReceivedAt: pool.custodyReceivedAt,
        // Resale
        resaleListingPriceUSD: pool.resaleListingPriceUSD,
        resaleListedAt: pool.resaleListedAt,
        resaleSoldPriceUSD: pool.resaleSoldPriceUSD,
        resaleSoldAt: pool.resaleSoldAt,
        // Distribution
        distributionStatus: pool.distributionStatus,
        distributionAmount: pool.distributionAmount,
        distributionRoyalty: pool.distributionRoyalty,
        distributions: pool.distributions,
        // Bags API
        bagsTokenMint: pool.bagsTokenMint,
        // Timestamps
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[/api/pool/[id]] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch pool',
      details: error?.message || 'Unknown error',
    });
  }
}
