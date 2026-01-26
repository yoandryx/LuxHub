// src/pages/api/stats/platform.ts
// Platform-wide statistics API - Real TVL, volume, pool counts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

interface PlatformStats {
  tvl: number;
  tvlFormatted: string;
  totalPools: number;
  activePools: number;
  openPools: number;
  filledPools: number;
  totalVolume: number;
  totalVolumeFormatted: string;
  totalTrades: number;
  avgROI: number;
  avgROIFormatted: string;
  totalInvestors: number;
  totalDistributed: number;
  totalDistributedFormatted: string;
  tokenizedPools: number;
  graduatedPools: number;
  lastUpdated: string;
}

// Format large numbers
function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(0)}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlatformStats | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    // Aggregate all pool statistics
    const [statsResult] = await Pool.aggregate([
      { $match: { deleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          // TVL = sum of all invested amounts in active pools
          tvl: {
            $sum: {
              $cond: [
                { $in: ['$status', ['open', 'filled', 'funded', 'custody', 'active', 'listed']] },
                { $multiply: ['$sharesSold', '$sharePriceUSD'] },
                0,
              ],
            },
          },
          // Total pools
          totalPools: { $sum: 1 },
          // Active pools (not closed/burned)
          activePools: {
            $sum: {
              $cond: [
                { $in: ['$status', ['open', 'filled', 'funded', 'custody', 'active', 'listed']] },
                1,
                0,
              ],
            },
          },
          // Open for investment
          openPools: {
            $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] },
          },
          // Filled pools
          filledPools: {
            $sum: {
              $cond: [
                { $in: ['$status', ['filled', 'funded', 'custody', 'active', 'listed']] },
                1,
                0,
              ],
            },
          },
          // Trading volume from Bags
          totalVolume: { $sum: { $ifNull: ['$totalVolumeUSD', 0] } },
          // Total trades
          totalTrades: { $sum: { $ifNull: ['$totalTrades', 0] } },
          // Average projected ROI
          avgROI: { $avg: '$projectedROI' },
          // Tokenized pools (have Bags token)
          tokenizedPools: {
            $sum: { $cond: [{ $ne: ['$bagsTokenMint', null] }, 1, 0] },
          },
          // Graduated pools (bonding curve complete)
          graduatedPools: {
            $sum: { $cond: [{ $eq: ['$graduated', true] }, 1, 0] },
          },
          // Total distributed to investors
          totalDistributed: {
            $sum: { $ifNull: ['$distributionAmount', 0] },
          },
        },
      },
    ]);

    // Count unique investors
    const investorResult = await Pool.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $unwind: '$participants' },
      { $group: { _id: '$participants.wallet' } },
      { $count: 'total' },
    ]);

    const stats = statsResult || {
      tvl: 0,
      totalPools: 0,
      activePools: 0,
      openPools: 0,
      filledPools: 0,
      totalVolume: 0,
      totalTrades: 0,
      avgROI: 1.15,
      tokenizedPools: 0,
      graduatedPools: 0,
      totalDistributed: 0,
    };

    const totalInvestors = investorResult[0]?.total || 0;
    const avgROI = stats.avgROI || 1.15;

    const response: PlatformStats = {
      tvl: stats.tvl,
      tvlFormatted: formatCurrency(stats.tvl),
      totalPools: stats.totalPools,
      activePools: stats.activePools,
      openPools: stats.openPools,
      filledPools: stats.filledPools,
      totalVolume: stats.totalVolume,
      totalVolumeFormatted: formatCurrency(stats.totalVolume),
      totalTrades: stats.totalTrades,
      avgROI: avgROI,
      avgROIFormatted: `+${((avgROI - 1) * 100).toFixed(1)}%`,
      totalInvestors,
      totalDistributed: stats.totalDistributed,
      totalDistributedFormatted: formatCurrency(stats.totalDistributed),
      tokenizedPools: stats.tokenizedPools,
      graduatedPools: stats.graduatedPools,
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 30 seconds
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('[/api/stats/platform] Error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to fetch platform stats',
    });
  }
}
