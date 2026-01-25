// src/pages/api/treasury/stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { TreasuryDeposit } from '@/lib/models/TreasuryDeposit';
import { apiLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { period = '30d' } = req.query;

    // Calculate date range
    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case '24h':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get all-time totals
    const allTimeTotals = await TreasuryDeposit.aggregate([
      {
        $group: {
          _id: null,
          totalLamports: { $sum: '$amountLamports' },
          totalSOL: { $sum: '$amountSOL' },
          totalUSD: { $sum: { $ifNull: ['$amountUSD', 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get period totals
    const periodTotals = await TreasuryDeposit.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: null,
          totalLamports: { $sum: '$amountLamports' },
          totalSOL: { $sum: '$amountSOL' },
          totalUSD: { $sum: { $ifNull: ['$amountUSD', 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get breakdown by deposit type
    const byType = await TreasuryDeposit.aggregate([
      {
        $group: {
          _id: '$depositType',
          totalSOL: { $sum: '$amountSOL' },
          totalUSD: { $sum: { $ifNull: ['$amountUSD', 0] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalSOL: -1 } },
    ]);

    // Get daily aggregates for chart
    const dailyDeposits = await TreasuryDeposit.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          totalSOL: { $sum: '$amountSOL' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get top depositors
    const topDepositors = await TreasuryDeposit.aggregate([
      {
        $group: {
          _id: '$fromWallet',
          totalSOL: { $sum: '$amountSOL' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalSOL: -1 } },
      { $limit: 10 },
    ]);

    // Get recent deposits
    const recentDeposits = await TreasuryDeposit.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('txSignature amountSOL depositType fromWallet createdAt')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        allTime: allTimeTotals[0] || { totalLamports: 0, totalSOL: 0, totalUSD: 0, count: 0 },
        period: {
          range: period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totals: periodTotals[0] || { totalLamports: 0, totalSOL: 0, totalUSD: 0, count: 0 },
        },
        byType,
        dailyDeposits,
        topDepositors,
        recentDeposits,
      },
    });
  } catch (error: unknown) {
    console.error('[treasury/stats] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch treasury stats',
    });
  }
}

export default apiLimiter(withErrorMonitoring(handler));
