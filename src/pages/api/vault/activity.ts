// pages/api/vault/activity.ts
// Get vault activity log with filtering

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultActivity } from '@/lib/models/LuxHubVault';
import authMiddleware from '@/lib/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const {
    activityType,
    performedBy,
    nftMint,
    page = '1',
    limit = '50',
    startDate,
    endDate,
  } = req.query;

  try {
    // Build query
    const query: Record<string, unknown> = {};

    if (activityType && typeof activityType === 'string') {
      query.activityType = activityType;
    }

    if (performedBy && typeof performedBy === 'string') {
      query.performedBy = performedBy;
    }

    if (nftMint && typeof nftMint === 'string') {
      query.nftMint = nftMint;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate && typeof startDate === 'string') {
        (query.createdAt as Record<string, unknown>).$gte = new Date(startDate);
      }
      if (endDate && typeof endDate === 'string') {
        (query.createdAt as Record<string, unknown>).$lte = new Date(endDate);
      }
    }

    // Pagination
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [activities, total] = await Promise.all([
      VaultActivity.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      VaultActivity.countDocuments(query),
    ]);

    // Get activity type counts
    const typeCounts = await VaultActivity.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
        },
      },
    ]);

    const activityStats = typeCounts.reduce(
      (acc, t) => {
        acc[t._id] = t.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        stats: {
          total,
          byType: activityStats,
        },
      },
    });
  } catch (error) {
    console.error('[VAULT-ACTIVITY] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch vault activity' });
  }
}

// Require admin authentication
export default authMiddleware(handler);
