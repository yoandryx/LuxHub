// src/pages/api/pool/graduate.ts
// Manually graduate a pool (for testing or admin override)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

import { getAdminConfig } from '../../../lib/config/adminConfig';
import AdminRole from '../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { poolId, wallet, adminSecret } = req.body;

    if (!poolId) {
      return res.status(400).json({ error: 'Missing poolId' });
    }

    // Verify admin access via wallet or admin secret
    const adminConfig = getAdminConfig();
    const isWalletAdmin = wallet ? adminConfig.isAdmin(wallet) : false;
    const isSecretValid = process.env.ADMIN_SECRET && adminSecret === process.env.ADMIN_SECRET;

    if (!isWalletAdmin && !isSecretValid) {
      // Also check database admin role
      let isDbAdmin = false;
      if (wallet) {
        const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });
        isDbAdmin = !!(dbAdmin?.permissions?.canManagePools || dbAdmin?.role === 'super_admin');
      }
      if (!isDbAdmin) {
        return res.status(403).json({ error: 'Unauthorized: admin access required' });
      }
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check if already graduated
    if (pool.graduated) {
      return res.status(400).json({ error: 'Pool already graduated' });
    }

    // Graduate the pool
    pool.graduated = true;
    pool.status = 'graduated';
    pool.graduatedAt = new Date();
    pool.graduationMarketCap = pool.sharesSold * pool.sharePriceUSD;
    await pool.save();

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        graduated: pool.graduated,
        status: pool.status,
        graduatedAt: pool.graduatedAt,
        graduationMarketCap: pool.graduationMarketCap,
      },
    });
  } catch (error: any) {
    console.error('Graduate pool error:', error);
    return res.status(500).json({ error: error.message || 'Failed to graduate pool' });
  }
}
