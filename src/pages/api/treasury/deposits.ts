// src/pages/api/treasury/deposits.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { TreasuryDeposit } from '@/lib/models/TreasuryDeposit';
import { apiLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';

interface DepositsQuery {
  page?: string;
  limit?: string;
  depositType?: string;
  fromWallet?: string;
  startDate?: string;
  endDate?: string;
  verified?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const {
      page = '1',
      limit = '20',
      depositType,
      fromWallet,
      startDate,
      endDate,
      verified,
    } = req.query as DepositsQuery;

    // Build query filter
    const filter: Record<string, unknown> = {};

    if (depositType) {
      filter.depositType = depositType;
    }

    if (fromWallet) {
      filter.fromWallet = fromWallet;
    }

    if (verified !== undefined) {
      filter.verified = verified === 'true';
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
      }
      if (endDate) {
        (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
      }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Fetch deposits with pagination
    const [deposits, total] = await Promise.all([
      TreasuryDeposit.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('escrow', 'nftMint status')
        .populate('asset', 'model serial')
        .lean(),
      TreasuryDeposit.countDocuments(filter),
    ]);

    // Calculate totals for the filtered results
    const totals = await TreasuryDeposit.aggregate([
      { $match: filter },
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
      { $match: filter },
      {
        $group: {
          _id: '$depositType',
          totalSOL: { $sum: '$amountSOL' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalSOL: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        deposits,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        summary: {
          totals: totals[0] || { totalLamports: 0, totalSOL: 0, totalUSD: 0, count: 0 },
          byType,
        },
      },
    });
  } catch (error: unknown) {
    console.error('[treasury/deposits] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch deposits',
    });
  }
}

export default apiLimiter(withErrorMonitoring(handler));
