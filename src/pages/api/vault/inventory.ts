// pages/api/vault/inventory.ts
// Get LuxHub vault inventory with filtering and pagination

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultInventory, VaultConfig } from '@/lib/models/LuxHubVault';
import authMiddleware from '@/lib/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const {
    status,
    tags,
    page = '1',
    limit = '20',
    sortBy = 'mintedAt',
    sortOrder = 'desc',
  } = req.query;

  try {
    // Build query
    const query: Record<string, unknown> = {};

    if (status && typeof status === 'string') {
      query.status = status;
    }

    if (tags && typeof tags === 'string') {
      query.tags = { $in: tags.split(',') };
    }

    // Pagination
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortField = typeof sortBy === 'string' ? sortBy : 'mintedAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [items, total, vaultConfigRaw] = await Promise.all([
      VaultInventory.find(query)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      VaultInventory.countDocuments(query),
      VaultConfig.findOne({ isActive: true }).lean(),
    ]);

    const vaultConfig = vaultConfigRaw as {
      vaultPda?: string;
      multisigAddress?: string;
    } | null;

    // Calculate stats
    const stats = await VaultInventory.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = stats.reduce(
      (acc, s) => {
        acc[s._id] = s.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        stats: {
          total,
          byStatus: statusCounts,
          vaultAddress: vaultConfig?.vaultPda,
          multisigAddress: vaultConfig?.multisigAddress,
        },
      },
    });
  } catch (error) {
    console.error('[VAULT-INVENTORY] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch vault inventory' });
  }
}

// Require admin authentication
export default authMiddleware(handler);
