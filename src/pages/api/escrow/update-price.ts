// src/pages/api/escrow/update-price.ts
// Vendor-controlled price update for escrow listings
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

interface UpdatePriceRequest {
  escrowPda: string;
  vendorWallet: string;
  listingPrice?: number; // In lamports
  listingPriceUSD?: number;
  minimumOffer?: number; // For accepting_offers mode
  minimumOfferUSD?: number;
  acceptingOffers?: boolean;
  saleMode?: 'fixed_price' | 'accepting_offers';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      vendorWallet,
      listingPrice,
      listingPriceUSD,
      minimumOffer,
      minimumOfferUSD,
      acceptingOffers,
      saleMode,
    } = req.body as UpdatePriceRequest;

    // Validation
    if (!escrowPda || !vendorWallet) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda, vendorWallet',
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

    // Check if this vendor owns the escrow
    if (
      escrow.sellerWallet !== vendorWallet &&
      escrow.seller?.toString() !== vendor._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to update this escrow' });
    }

    // Check if escrow is in a state that allows price updates
    const allowedStatuses = ['initiated', 'listed'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot update price when escrow status is '${escrow.status}'. Allowed statuses: ${allowedStatuses.join(', ')}`,
      });
    }

    // Check if escrow already has a buyer
    if (escrow.buyer) {
      return res.status(400).json({
        error: 'Cannot update price after a buyer has been assigned',
      });
    }

    // Build update object with only provided fields
    const updateFields: Record<string, any> = {};

    if (listingPrice !== undefined) {
      updateFields.listingPrice = listingPrice;
    }

    if (listingPriceUSD !== undefined) {
      updateFields.listingPriceUSD = listingPriceUSD;
      // Auto-calculate royalty (3%)
      updateFields.royaltyAmount = listingPriceUSD * 0.03;
    }

    if (minimumOffer !== undefined) {
      updateFields.minimumOffer = minimumOffer;
    }

    if (minimumOfferUSD !== undefined) {
      updateFields.minimumOfferUSD = minimumOfferUSD;
    }

    if (acceptingOffers !== undefined) {
      updateFields.acceptingOffers = acceptingOffers;
    }

    if (saleMode !== undefined) {
      // Cannot change to crowdfunded via this endpoint
      if ((saleMode as string) === 'crowdfunded') {
        return res.status(400).json({
          error: 'Use /api/pool/convert-from-escrow to convert to crowdfunded mode',
        });
      }
      updateFields.saleMode = saleMode;
      updateFields.acceptingOffers = saleMode === 'accepting_offers';
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        error: 'No fields to update provided',
      });
    }

    // Perform update
    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      { $set: updateFields },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      escrow: {
        _id: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        status: updatedEscrow.status,
        saleMode: updatedEscrow.saleMode,
        listingPrice: updatedEscrow.listingPrice,
        listingPriceUSD: updatedEscrow.listingPriceUSD,
        minimumOffer: updatedEscrow.minimumOffer,
        minimumOfferUSD: updatedEscrow.minimumOfferUSD,
        acceptingOffers: updatedEscrow.acceptingOffers,
        royaltyAmount: updatedEscrow.royaltyAmount,
        updatedAt: updatedEscrow.updatedAt,
      },
      message: 'Price updated successfully',
    });
  } catch (error: any) {
    console.error('[/api/escrow/update-price] Error:', error);
    return res.status(500).json({
      error: 'Failed to update price',
      details: error?.message || 'Unknown error',
    });
  }
}
