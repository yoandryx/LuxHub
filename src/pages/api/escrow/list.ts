// src/pages/api/escrow/list.ts
// Returns listed escrows for marketplace display

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
// Import models needed for populate (must be registered before .populate() calls)
import '../../../lib/models/Assets';
import '../../../lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { status, saleMode, vendorWallet, limit = '50', offset = '0' } = req.query;

    // Build query filter
    const filter: Record<string, any> = {
      deleted: { $ne: true },
    };

    // Filter by status (default: show listed/initiated escrows)
    // Supports comma-separated values for multiple statuses
    if (status) {
      const statusArray = (status as string).split(',').map((s) => s.trim());
      filter.status = statusArray.length > 1 ? { $in: statusArray } : statusArray[0];
    } else {
      // Default: show escrows available for purchase
      filter.status = { $in: ['initiated', 'listed'] };
    }

    // Filter by sale mode
    if (saleMode) {
      filter.saleMode = saleMode;
    }

    // Filter by vendor
    if (vendorWallet) {
      filter.sellerWallet = vendorWallet;
    }

    const escrows = await Escrow.find(filter)
      .populate('asset', 'model serial priceUSD description imageUrl imageIpfsUrls images')
      .populate('seller', 'businessName username verified')
      .sort({ createdAt: -1 })
      .skip(parseInt(offset as string))
      .limit(parseInt(limit as string))
      .lean();

    const total = await Escrow.countDocuments(filter);

    // Transform for frontend
    const listings = escrows.map((escrow: any) => ({
      _id: escrow._id,
      escrowPda: escrow.escrowPda,
      nftMint: escrow.nftMint,
      status: escrow.status,
      saleMode: escrow.saleMode,
      acceptingOffers: escrow.acceptingOffers,
      // Pricing
      listingPrice: escrow.listingPrice,
      listingPriceUSD: escrow.listingPriceUSD,
      minimumOffer: escrow.minimumOffer,
      minimumOfferUSD: escrow.minimumOfferUSD,
      amountUSD: escrow.amountUSD,
      // Asset details
      asset: escrow.asset
        ? {
            model: escrow.asset.model,
            serial: escrow.asset.serial,
            priceUSD: escrow.asset.priceUSD,
            description: escrow.asset.description,
            imageUrl: escrow.asset.imageUrl,
            imageIpfsUrls: escrow.asset.imageIpfsUrls,
            images: escrow.asset.images,
          }
        : null,
      // Vendor details
      vendor: escrow.seller
        ? {
            businessName: escrow.seller.businessName,
            username: escrow.seller.username,
            verified: escrow.seller.verified,
          }
        : null,
      sellerWallet: escrow.sellerWallet,
      // Shipment tracking
      shipmentStatus: escrow.shipmentStatus,
      trackingCarrier: escrow.trackingCarrier,
      trackingNumber: escrow.trackingNumber,
      shipmentProofUrls: escrow.shipmentProofUrls,
      shipmentSubmittedAt: escrow.shipmentSubmittedAt,
      // Metadata
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      listings,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + listings.length < total,
      },
    });
  } catch (error: any) {
    console.error('[/api/escrow/list] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch escrow listings',
      details: error?.message || 'Unknown error',
    });
  }
}
