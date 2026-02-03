// src/pages/api/escrow/confirm-delivery.ts
// Buyer confirms delivery of the item, triggering fund release
// Can also be triggered by admin for dispute resolution
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import AdminRole from '../../../lib/models/AdminRole';

interface ConfirmDeliveryRequest {
  escrowId?: string;
  escrowPda?: string;
  wallet: string; // Buyer wallet or admin wallet
  confirmationType: 'buyer' | 'admin'; // Who is confirming
  deliveryNotes?: string; // Optional notes
  rating?: number; // Optional 1-5 rating for vendor
  reviewText?: string; // Optional review
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowId,
      escrowPda,
      wallet,
      confirmationType = 'buyer',
      deliveryNotes,
      rating,
      reviewText,
    } = req.body as ConfirmDeliveryRequest;

    // Validation
    if ((!escrowId && !escrowPda) || !wallet) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowId or escrowPda) and wallet',
      });
    }

    await dbConnect();

    // Find the escrow
    let escrow;
    if (escrowId) {
      escrow = await Escrow.findById(escrowId).populate('asset');
    } else if (escrowPda) {
      escrow = await Escrow.findOne({ escrowPda, deleted: false }).populate('asset');
    }

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify authorization
    let isAuthorized = false;
    let confirmedBy = 'buyer';

    if (confirmationType === 'buyer') {
      // Buyer must match
      isAuthorized = escrow.buyerWallet === wallet;
      confirmedBy = 'buyer';
    } else if (confirmationType === 'admin') {
      // Check admin permissions
      const adminConfig = getAdminConfig();
      const isEnvAdmin = adminConfig.isAdmin(wallet);
      const isEnvSuperAdmin = adminConfig.isSuperAdmin(wallet);
      const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });

      isAuthorized =
        isEnvSuperAdmin ||
        isEnvAdmin ||
        dbAdmin?.permissions?.canManageEscrows ||
        dbAdmin?.role === 'super_admin';

      confirmedBy = 'admin';
    }

    if (!isAuthorized) {
      return res.status(403).json({
        error:
          confirmationType === 'buyer'
            ? 'Only the buyer can confirm delivery'
            : 'Admin access required',
      });
    }

    // Check escrow status - must be shipped
    const validStatuses = ['shipped', 'in_transit', 'delivered'];
    if (!validStatuses.includes(escrow.status) && !validStatuses.includes(escrow.shipmentStatus)) {
      return res.status(400).json({
        error: `Cannot confirm delivery. Item must be shipped first. Current status: ${escrow.status}`,
      });
    }

    // Update escrow to delivered/released
    const updateData: any = {
      status: 'delivered',
      shipmentStatus: 'verified',
      shipmentVerifiedAt: new Date(),
      shipmentVerifiedBy: wallet,
      actualDeliveryDate: new Date(),
    };

    // Store delivery notes if provided
    if (deliveryNotes) {
      updateData.deliveryNotes = deliveryNotes;
    }

    // Store confirmation metadata
    updateData.deliveryConfirmation = {
      confirmedBy: wallet,
      confirmationType: confirmedBy,
      confirmedAt: new Date(),
      rating: rating || null,
      reviewText: reviewText || null,
    };

    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      { $set: updateData },
      { new: true }
    );

    // Get asset info for response
    const asset = escrow.asset || (await Asset.findById(escrow.asset));

    return res.status(200).json({
      success: true,
      message: 'Delivery confirmed successfully. Funds release process initiated.',
      delivery: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        nftMint: updatedEscrow.nftMint,
        status: updatedEscrow.status,
        shipmentStatus: updatedEscrow.shipmentStatus,
        confirmedBy: wallet,
        confirmationType: confirmedBy,
        confirmedAt: new Date(),
      },
      transaction: {
        buyerWallet: updatedEscrow.buyerWallet,
        sellerWallet: updatedEscrow.sellerWallet,
        amount: updatedEscrow.fundedAmount || updatedEscrow.listingPrice,
        amountUSD: updatedEscrow.listingPriceUSD,
        royaltyAmount: updatedEscrow.royaltyAmount,
      },
      asset: asset
        ? {
            title: asset.title || asset.model,
            brand: asset.brand,
          }
        : null,
      nextSteps: [
        'Funds will be released to the vendor',
        '3% platform fee deducted automatically',
        'Vendor receives 97% of sale price',
        'Transaction complete!',
      ],
      // Note: Actual on-chain fund release would be triggered separately
      // via Squads multisig or admin execution
      onChainAction: {
        required: true,
        action: 'release_funds',
        description: 'Admin or Squads multisig must execute on-chain fund release',
        endpoint: '/api/squads/execute or /api/escrow/release',
      },
    });
  } catch (error: any) {
    console.error('[/api/escrow/confirm-delivery] Error:', error);
    return res.status(500).json({
      error: 'Failed to confirm delivery',
      details: error?.message || 'Unknown error',
    });
  }
}
