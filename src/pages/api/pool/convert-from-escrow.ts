// src/pages/api/pool/convert-from-escrow.ts
// Convert an escrow listing to a crowdfunded pool
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Pool } from '../../../lib/models/Pool';
import { Offer } from '../../../lib/models/Offer';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

interface ConvertToPoolRequest {
  escrowPda: string;
  vendorWallet: string;

  // Pool configuration
  totalShares: number;
  minBuyInUSD: number;
  maxInvestors?: number;
  projectedROI?: number; // e.g., 1.15 for 15% expected return
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      vendorWallet,
      totalShares,
      minBuyInUSD,
      maxInvestors = 100,
      projectedROI = 1.2,
    } = req.body as ConvertToPoolRequest;

    // Validation
    if (!escrowPda || !vendorWallet || !totalShares || !minBuyInUSD) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda, vendorWallet, totalShares, minBuyInUSD',
      });
    }

    if (totalShares <= 0 || minBuyInUSD <= 0) {
      return res.status(400).json({
        error: 'totalShares and minBuyInUSD must be positive',
      });
    }

    await dbConnect();

    // Find the escrow
    const escrow = await Escrow.findOne({ escrowPda, deleted: false });
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify vendor ownership
    const user = await User.findOne({ wallet: vendorWallet });
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    const vendor = await Vendor.findOne({ user: user._id });
    if (!vendor) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    if (
      escrow.sellerWallet !== vendorWallet &&
      escrow.seller?.toString() !== vendor._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to convert this escrow' });
    }

    // Check if escrow is in a state that allows conversion
    const allowedStatuses = ['initiated', 'listed'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot convert escrow with status '${escrow.status}'. Allowed: ${allowedStatuses.join(', ')}`,
      });
    }

    // Check if already converted
    if (escrow.convertedToPool) {
      return res.status(400).json({
        error: 'Escrow has already been converted to a pool',
        poolId: escrow.poolId,
      });
    }

    // Check if escrow has a buyer
    if (escrow.buyer) {
      return res.status(400).json({
        error: 'Cannot convert escrow that already has a buyer',
      });
    }

    // Auto-reject all pending offers
    const pendingOffersResult = await Offer.updateMany(
      {
        escrowPda,
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      },
      {
        $set: {
          status: 'auto_rejected',
          autoRejectedReason: 'Listing converted to crowdfunded pool',
          respondedAt: new Date(),
        },
      }
    );

    // Calculate pool values
    const targetAmountUSD = escrow.listingPriceUSD || escrow.amountUSD || 0;
    const sharePriceUSD = targetAmountUSD / totalShares;

    // Create the pool
    const pool = new Pool({
      selectedAssetId: escrow.asset,
      escrowId: escrow._id,
      escrowPda,
      sourceType: 'escrow_conversion',
      vendorId: vendor._id,
      vendorWallet,
      totalShares,
      sharesSold: 0,
      sharePriceUSD,
      targetAmountUSD,
      minBuyInUSD,
      maxInvestors,
      projectedROI,
      participants: [],
      status: 'open',
      custodyStatus: 'pending',
      distributionStatus: 'pending',
    });

    await pool.save();

    // Update escrow
    await Escrow.findByIdAndUpdate(escrow._id, {
      $set: {
        convertedToPool: true,
        poolId: pool._id,
        poolConvertedAt: new Date(),
        saleMode: 'crowdfunded',
        status: 'converted',
        acceptingOffers: false,
        activeOfferCount: 0,
        highestOffer: null,
      },
    });

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        escrowPda,
        totalShares,
        sharesSold: 0,
        sharePriceUSD,
        targetAmountUSD,
        minBuyInUSD,
        maxInvestors,
        projectedROI,
        status: 'open',
      },
      escrow: {
        _id: escrow._id,
        escrowPda,
        status: 'converted',
        convertedToPool: true,
      },
      offersRejected: pendingOffersResult.modifiedCount,
      message: `Escrow converted to pool. ${pendingOffersResult.modifiedCount} pending offers auto-rejected.`,
      nextSteps: [
        'Pool is now open for investments',
        'Investors can buy shares via /api/pool/invest',
        'When pool fills, vendor will be paid and must ship to LuxHub custody',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/convert-from-escrow] Error:', error);
    return res.status(500).json({
      error: 'Failed to convert escrow to pool',
      details: error?.message || 'Unknown error',
    });
  }
}
