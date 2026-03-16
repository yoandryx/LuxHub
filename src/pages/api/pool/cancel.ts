// src/pages/api/pool/cancel.ts
// Cancel a pool that hasn't graduated yet (vendor backs out or pool stalls)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { Vendor } from '../../../lib/models/Vendor';
import { withWalletValidation, AuthenticatedRequest } from '@/lib/middleware/walletAuth';
import { getAdminConfig } from '@/lib/config/adminConfig';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = (req as AuthenticatedRequest).wallet;

  try {
    await dbConnect();

    const { poolId, reason } = req.body;

    if (!poolId) {
      return res.status(400).json({ error: 'Missing required field: poolId' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Authorization: only the vendor who created the pool or an admin can cancel
    const adminConfig = getAdminConfig();
    const isAdmin =
      adminConfig.adminWallets.includes(wallet) || adminConfig.superAdminWallets.includes(wallet);

    if (!isAdmin) {
      const vendor = await Vendor.findOne({ wallet });
      if (!vendor || String(pool.vendorId) !== String(vendor._id)) {
        return res
          .status(403)
          .json({ error: 'Only the pool vendor or an admin can cancel this pool' });
      }
    }

    // Only allow cancellation for pools that haven't been funded yet
    const cancelableStatuses = ['open', 'filled'];
    if (!cancelableStatuses.includes(pool.status)) {
      return res.status(400).json({
        error: `Cannot cancel pool in '${pool.status}' status. Only pools in 'open' or 'filled' status can be canceled.`,
      });
    }

    // Update pool status
    pool.status = 'canceled';
    pool.bondingCurveActive = false;
    pool.burnReason = reason || 'Pool canceled by vendor';
    pool.watchVerificationStatus = 'burned';

    // If tokens exist (via Bags bonding curve), mark as redeemable so holders can sell back
    if (pool.bagsTokenMint) {
      pool.tokenStatus = 'redeemable';
    }

    await pool.save();

    console.log(
      '[POOL-CANCEL] Pool canceled:',
      pool.poolNumber,
      'by:',
      wallet,
      'reason:',
      pool.burnReason
    );

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        poolNumber: pool.poolNumber,
        status: pool.status,
        bondingCurveActive: pool.bondingCurveActive,
        tokenStatus: pool.tokenStatus,
        burnReason: pool.burnReason,
        watchVerificationStatus: pool.watchVerificationStatus,
      },
    });
  } catch (error: any) {
    console.error('[POOL-CANCEL] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to cancel pool' });
  }
}

export default withWalletValidation(handler);
